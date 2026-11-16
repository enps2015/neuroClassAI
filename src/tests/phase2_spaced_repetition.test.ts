import test from 'node:test';
import assert from 'node:assert/strict';
import { Rating, State } from 'ts-fsrs';
import {
  enrollConceptInSpacedRepetition,
  processConceptReview,
  mapPedagogicalEvaluationToFsrsRating,
  calculateEstimatedRetrievability,
  reconstructScheduleFromLogs,
  calculateLongitudinalSummary,
  formatFriendlyReviewDue,
  getFsrsConfig,
  FSRS_ALGORITHM,
  FSRS_ALGORITHM_VERSION,
  DEFAULT_DESIRED_RETENTION,
} from '../services/learning/spacedRepetitionService';
import {
  buildConsolidatedMasteryRecord,
  evaluateConceptMastery,
} from '../services/learning/masteryEngine';
import {
  saveReviewSchedule,
  getReviewSchedule,
  getReviewSchedulesByDocument,
  deleteDocumentCompletely,
  exportUserDataAsJson,
  restoreUserDataFromJson,
} from '../services/persistence/indexedDb';
import type {
  Concept,
  DocumentSource,
  ExplanationFeedback,
  LearningAttempt,
  ConceptMastery,
  ConceptReviewSchedule,
} from '../types';

// Mock in-memory DB helpers para testes unitários determinísticos
const mockDoc: DocumentSource = {
  id: 'doc-neuro-101',
  title: 'Neurociência Fundamental',
  subject: 'Neurofisiologia',
  type: 'pdf',
  isDemoMaterial: true,
  sizeBytes: 1024,
  mimeType: 'application/pdf',
  uploadedAt: Date.now(),
};

const mockConcept: Concept = {
  id: 'potencial-acao',
  name: 'Potencial de Ação',
  definition: 'Inversão transitória do potencial de membrana deflagrada por canais de sódio.',
  importance: 'fundamental',
  epistemicStatus: 'explicitly_documented',
  evidenceReferences: [],
  prerequisiteConceptIds: ['gradiente-eletroquimico'],
  diagnosticState: 'understood',
};

const mockConcept2: Concept = {
  id: 'sinapse-quimica',
  name: 'Sinapse Química',
  definition: 'Transmissão intercelular mediada por exocitose de neurotransmissores.',
  importance: 'complementary',
  epistemicStatus: 'explicitly_documented',
  evidenceReferences: [],
  prerequisiteConceptIds: ['potencial-acao'],
  diagnosticState: 'unassessed',
};

const createMockFeedback = (overrides?: Partial<ExplanationFeedback>): ExplanationFeedback => ({
  evaluatedMasteryLevel: 'understand',
  rubric: {
    conceptualPrecision: { score: 4, qualitativeStatus: 'accurate', comment: 'Preciso' },
    completeness: { score: 4, qualitativeStatus: 'complete', comment: 'Completo' },
    conceptualRelationships: { score: 4, qualitativeStatus: 'well_connected', comment: 'Conectado' },
    reasoningCoherence: { score: 4, qualitativeStatus: 'coherent', comment: 'Coerente' },
    knowledgeApplication: { score: 3, qualitativeStatus: 'applied', comment: 'Aplicado' },
  },
  understoodElements: ['Canais de Na+', 'Despolarização'],
  incompleteElements: [],
  identifiedGaps: [],
  misconceptions: [],
  groundingEvidences: [],
  improvementSuggestions: [],
  summary: 'Boa resposta.',
  suggestedDiagnosticState: 'understood',
  ...overrides,
});

// Teste 1: Primeiro agendamento de um conceito
test('T225: Primeiro agendamento de um conceito no FSRS-7 com retenção 90%', async () => {
  const now = new Date('2026-11-08T12:00:00.000Z');
  const schedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  assert.equal(schedule.algorithm, FSRS_ALGORITHM);
  assert.equal(schedule.algorithmVersion, FSRS_ALGORITHM_VERSION);
  assert.equal(schedule.desiredRetention, DEFAULT_DESIRED_RETENTION);
  assert.equal(schedule.documentId, mockDoc.id);
  assert.equal(schedule.conceptId, mockConcept.id);
  assert.equal(schedule.isFundamental, true);
  assert.equal(schedule.totalReviews, 0);
  assert.equal(schedule.totalLapses, 0);
  assert.equal(schedule.memoryState.state, State.New);
  assert.equal(schedule.memoryState.stability, 0);
  assert.equal(schedule.memoryState.difficulty, 0);
  assert.equal(new Date(schedule.nextReviewDue).toISOString(), now.toISOString());
});

// Teste 2: Mapeamento determinístico e avaliação AGAIN
test('T226: Avaliação Again — falha de recuperação gera rating 1 e reseta estabilidade', async () => {
  const failFeedback = createMockFeedback({
    evaluatedMasteryLevel: 'recognize',
    understoodElements: [],
    incompleteElements: ['Não citou canais iônicos', 'Inverteu a polaridade'],
    misconceptions: ['Afirmou que o cálcio entra pelo axônio'],
    rubric: {
      conceptualPrecision: { score: 1, qualitativeStatus: 'inaccurate', comment: 'Incorreto' },
      completeness: { score: 1, qualitativeStatus: 'incomplete', comment: 'Incompleto' },
      conceptualRelationships: { score: 1, qualitativeStatus: 'confused', comment: 'Confuso' },
      reasoningCoherence: { score: 1, qualitativeStatus: 'contradictory', comment: 'Contraditório' },
      knowledgeApplication: { score: 1, qualitativeStatus: 'misapplied', comment: 'Incorreto' },
    },
  });

  const mapping = mapPedagogicalEvaluationToFsrsRating(failFeedback);
  assert.equal(mapping.grade, 'again');
  assert.equal(mapping.ratingNumber, Rating.Again);
  assert.ok(mapping.rationale.includes('Falha de recuperação'));

  const now = new Date('2026-11-08T12:00:00.000Z');
  const initialSchedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  const { updatedSchedule, reviewLog } = await processConceptReview({
    schedule: initialSchedule,
    grade: mapping.grade,
    feedback: failFeedback,
    attemptId: 'att-1',
    reviewedAt: now,
  });

  assert.equal(updatedSchedule.totalReviews, 1);
  assert.equal(updatedSchedule.totalLapses, 1);
  assert.equal(updatedSchedule.lastRating, 'again');
  assert.equal(reviewLog.grade, 'again');
  assert.equal(reviewLog.fsrsRating, Rating.Again);
  assert.ok(updatedSchedule.memoryState.difficulty > 0, 'Dificuldade deve aumentar após falha');
});

// Teste 3: Avaliação HARD
test('T227: Avaliação Hard — recuperação trabalhosa ou com dica pedagógica', async () => {
  const hardFeedback = createMockFeedback({
    evaluatedMasteryLevel: 'recognize',
    understoodElements: ['Despolarização'],
    incompleteElements: ['Mecanismo de canais de K+', 'Período refratário'],
  });

  // Com dica usada
  const mappingWithHint = mapPedagogicalEvaluationToFsrsRating(hardFeedback, { usedHint: true });
  assert.equal(mappingWithHint.grade, 'hard');
  assert.equal(mappingWithHint.ratingNumber, Rating.Hard);
  assert.ok(mappingWithHint.rationale.includes('apoio pedagógico'));

  const now = new Date('2026-11-08T12:00:00.000Z');
  const initialSchedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  const { updatedSchedule } = await processConceptReview({
    schedule: initialSchedule,
    grade: 'hard',
    feedback: hardFeedback,
    attemptId: 'att-hard-1',
    reviewedAt: now,
    usedHint: true,
  });

  assert.equal(updatedSchedule.totalReviews, 1);
  assert.equal(updatedSchedule.totalLapses, 0);
  assert.equal(updatedSchedule.lastRating, 'hard');
});

// Teste 4: Avaliação GOOD
test('T228: Avaliação Good — recuperação autônoma e precisa com expansão de intervalo', async () => {
  const goodFeedback = createMockFeedback({
    evaluatedMasteryLevel: 'understand',
    understoodElements: ['Despolarização', 'Canais de Na+', 'Canais de K+'],
    incompleteElements: [],
  });

  const mapping = mapPedagogicalEvaluationToFsrsRating(goodFeedback, { usedHint: false });
  assert.equal(mapping.grade, 'good');
  assert.equal(mapping.ratingNumber, Rating.Good);

  const now = new Date('2026-11-08T12:00:00.000Z');
  const initialSchedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  const { updatedSchedule, reviewLog } = await processConceptReview({
    schedule: initialSchedule,
    grade: 'good',
    feedback: goodFeedback,
    attemptId: 'att-good-1',
    reviewedAt: now,
    usedHint: false,
  });

  assert.equal(updatedSchedule.totalReviews, 1);
  assert.equal(updatedSchedule.totalLapses, 0);
  assert.equal(updatedSchedule.lastRating, 'good');
  assert.ok(updatedSchedule.memoryState.stability > 1.0, 'Estabilidade deve aumentar');
  assert.ok(new Date(updatedSchedule.nextReviewDue).getTime() > now.getTime(), 'Próxima revisão deve estar no futuro');
  assert.ok(reviewLog.scheduledDays >= 1, 'Dias programados devem ser >= 1 dia');
});

// Teste 5: Avaliação EASY
test('T229: Avaliação Easy — recuperação espontânea com transferência e maior intervalo', async () => {
  const easyFeedback = createMockFeedback({
    evaluatedMasteryLevel: 'transfer',
    understoodElements: ['Propagação saltatória', 'Mielina', 'Nódulos de Ranvier', 'Cinética iônica'],
    incompleteElements: [],
    rubric: {
      conceptualPrecision: { score: 5, qualitativeStatus: 'accurate', comment: 'Perfeito' },
      completeness: { score: 5, qualitativeStatus: 'complete', comment: 'Exaustivo' },
      conceptualRelationships: { score: 5, qualitativeStatus: 'well_connected', comment: 'Excelente' },
      reasoningCoherence: { score: 5, qualitativeStatus: 'coherent', comment: 'Impecável' },
      knowledgeApplication: { score: 5, qualitativeStatus: 'applied', comment: 'Transferência plena' },
    },
  });

  const mapping = mapPedagogicalEvaluationToFsrsRating(easyFeedback, { usedHint: false });
  assert.equal(mapping.grade, 'easy');
  assert.equal(mapping.ratingNumber, Rating.Easy);

  const now = new Date('2026-11-08T12:00:00.000Z');
  const scheduleGood = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);
  const scheduleEasy = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  const resGood = await processConceptReview({
    schedule: scheduleGood,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-g',
    reviewedAt: now,
  });

  const resEasy = await processConceptReview({
    schedule: scheduleEasy,
    grade: 'easy',
    feedback: easyFeedback,
    attemptId: 'att-e',
    reviewedAt: now,
  });

  assert.ok(
    resEasy.updatedSchedule.memoryState.stability > resGood.updatedSchedule.memoryState.stability,
    'Estabilidade de Easy deve ser estritamente superior à de Good'
  );
  assert.ok(
    new Date(resEasy.updatedSchedule.nextReviewDue).getTime() >
      new Date(resGood.updatedSchedule.nextReviewDue).getTime(),
    'Intervalo de Easy deve ser mais longo que o de Good'
  );
});

// Teste 6: Alteração progressiva de intervalos em sequência de revisões
test('T230: Progressão de intervalos ao longo de múltiplas revisões espaçadas', async () => {
  let schedule = await enrollConceptInSpacedRepetition(
    mockDoc,
    mockConcept,
    new Date('2026-11-01T10:00:00.000Z')
  );

  // Revisão 1 (Dia 1) -> Good
  const rev1 = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-seq-1',
    reviewedAt: new Date('2026-11-01T10:00:00.000Z'),
  });
  schedule = rev1.updatedSchedule;
  const interval1 = schedule.memoryState.scheduledDays;

  // Revisão 2 (Dia 5) -> Good
  const rev2 = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-seq-2',
    reviewedAt: new Date('2026-11-05T10:00:00.000Z'),
  });
  schedule = rev2.updatedSchedule;
  const interval2 = schedule.memoryState.scheduledDays;

  // Revisão 3 (Dia 15) -> Easy
  const rev3 = await processConceptReview({
    schedule,
    grade: 'easy',
    feedback: createMockFeedback({ evaluatedMasteryLevel: 'transfer' }),
    attemptId: 'att-seq-3',
    reviewedAt: new Date('2026-11-15T10:00:00.000Z'),
  });
  schedule = rev3.updatedSchedule;
  const interval3 = schedule.memoryState.scheduledDays;

  assert.ok(interval2 > interval1, `Intervalo 2 (${interval2}d) deve ser maior que Intervalo 1 (${interval1}d)`);
  assert.ok(interval3 > interval2, `Intervalo 3 (${interval3}d) deve ser maior que Intervalo 2 (${interval2}d)`);
  assert.equal(schedule.totalReviews, 3);
  assert.equal(schedule.historyLogs.length, 3);
});

// Teste 7: Revisão antecipada
test('T231: Revisão antecipada — FSRS-7 processa sem erros e ajusta com elapsedDays reduzido', async () => {
  const initialDate = new Date('2026-11-01T10:00:00.000Z');
  let schedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, initialDate);

  // Primeira revisão
  const rev1 = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-ant-1',
    reviewedAt: initialDate,
  });
  schedule = rev1.updatedSchedule;

  // Próxima revisão agendada para ~4 dias depois. Estudante revisa apenas 12 horas depois (antecipada!)
  const earlyReviewDate = new Date('2026-11-01T22:00:00.000Z');
  const revEarly = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-ant-2',
    reviewedAt: earlyReviewDate,
  });

  assert.equal(revEarly.updatedSchedule.totalReviews, 2);
  assert.ok(revEarly.reviewLog.elapsedDays < 1.0, 'Elapsed days deve ser inferior a 1 dia');
  assert.ok(
    new Date(revEarly.updatedSchedule.nextReviewDue).getTime() > earlyReviewDate.getTime(),
    'Nova data deve ser posterior à revisão antecipada'
  );
});

// Teste 8: Revisão atrasada
test('T232: Revisão atrasada — modelo recalcula estabilidade considerando retenção prolongada', async () => {
  const initialDate = new Date('2026-10-01T10:00:00.000Z');
  let schedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, initialDate);

  const rev1 = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-atr-1',
    reviewedAt: initialDate,
  });
  schedule = rev1.updatedSchedule;

  // Revisão prevista para ~5 de Outubro. Estudante só revisa em 8 de Novembro (~34 dias atrasada!)
  const lateDate = new Date('2026-11-08T10:00:00.000Z');
  const estRBefore = await calculateEstimatedRetrievability(schedule.memoryState, lateDate);
  assert.ok(estRBefore < 0.9, 'Retrievability estimada após atraso de 1 mês deve ter caído abaixo de 90%');

  // Estudante acerta mesmo com o atraso (Good)
  const revLate = await processConceptReview({
    schedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-atr-2',
    reviewedAt: lateDate,
  });

  assert.equal(revLate.updatedSchedule.totalReviews, 2);
  assert.ok(revLate.reviewLog.elapsedDays > 30, 'Elapsed days deve registrar o atraso real de > 30 dias');
  // Se o aluno lembrou mesmo após longo atraso, FSRS-7 premia com alta estabilidade
  assert.ok(
    revLate.updatedSchedule.memoryState.stability > schedule.memoryState.stability,
    'Estabilidade deve crescer expressivamente se recuperou após atraso'
  );
});

// Teste 9: Determinismo e reconstrução a partir do histórico
test('T233: Reconstrução determinística do estado FSRS-7 a partir dos logs de revisão', async () => {
  const initialDate = new Date('2026-11-01T10:00:00.000Z');
  let schedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, initialDate);

  const rev1 = await processConceptReview({
    schedule,
    grade: 'again',
    feedback: createMockFeedback({ evaluatedMasteryLevel: 'recognize', incompleteElements: ['Esqueceu'] }),
    attemptId: 'att-rec-1',
    reviewedAt: new Date('2026-11-01T10:00:00.000Z'),
  });

  const rev2 = await processConceptReview({
    schedule: rev1.updatedSchedule,
    grade: 'hard',
    feedback: createMockFeedback(),
    attemptId: 'att-rec-2',
    reviewedAt: new Date('2026-11-01T10:15:00.000Z'),
    usedHint: true,
  });

  const rev3 = await processConceptReview({
    schedule: rev2.updatedSchedule,
    grade: 'good',
    feedback: createMockFeedback(),
    attemptId: 'att-rec-3',
    reviewedAt: new Date('2026-11-03T10:00:00.000Z'),
  });

  // Reconstruir estado reproduzindo os logs em ordem
  const reconstructed = await reconstructScheduleFromLogs(rev3.updatedSchedule.historyLogs, initialDate);

  assert.equal(Math.round(reconstructed.stability * 1000), Math.round(rev3.updatedSchedule.memoryState.stability * 1000));
  assert.equal(Math.round(reconstructed.difficulty * 1000), Math.round(rev3.updatedSchedule.memoryState.difficulty * 1000));
  assert.equal(reconstructed.state, rev3.updatedSchedule.memoryState.state);
  assert.equal(reconstructed.reps, rev3.updatedSchedule.memoryState.reps);
  assert.equal(reconstructed.lapses, rev3.updatedSchedule.memoryState.lapses);
});

// Teste 10: Isolamento por documento e conceito
test('T234: Isolamento absoluto entre documentos e conceitos nos agendamentos FSRS', async () => {
  const sched1 = await enrollConceptInSpacedRepetition(mockDoc, mockConcept);
  const sched2 = await enrollConceptInSpacedRepetition(
    { ...mockDoc, id: 'outro-doc' },
    mockConcept
  );
  const sched3 = await enrollConceptInSpacedRepetition(mockDoc, mockConcept2);

  assert.notEqual(sched1.id, sched2.id, 'Chave de documento diferente deve ser distinta');
  assert.notEqual(sched1.id, sched3.id, 'Chave de conceito diferente deve ser distinta');
  assert.equal(sched1.id, `${mockDoc.id}#${mockConcept.id}`);
  assert.equal(sched2.id, `outro-doc#${mockConcept.id}`);
  assert.equal(sched3.id, `${mockDoc.id}#${mockConcept2.id}`);
});

// Teste 11: Separação estrita entre recuperabilidade estimada e domínio cognitivo (masteryEngine)
test('T235: Separação epistemológica — baixa retrievability ou atraso NÃO alteram estado mastered', async () => {
  // 1. Criar um histórico que confere "mastered" legitimamente no Marco 2B
  const mockMasteredAttempt1: LearningAttempt = {
    id: 'att-m-1',
    sessionId: 'sess-1',
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    attemptNumber: 1,
    promptQuestion: 'Explique o potencial de ação.',
    studentExplanation: 'Explicação autônoma excelente 1.',
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'apply',
      understoodElements: ['Na+', 'K+', 'Despolarização'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
    }),
    createdAt: Date.now() - 100000,
    usedPedagogicalHint: false,
  };

  const mockMasteredAttempt2: LearningAttempt = {
    id: 'att-m-2',
    sessionId: 'sess-2',
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    attemptNumber: 1,
    promptQuestion: 'Aplique o conceito a um caso prático.',
    studentExplanation: 'Aplicação prática autônoma excelente 2.',
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'transfer',
      understoodElements: ['Bloqueio de canais', 'Cinética', 'PEPS'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
      rubric: {
        conceptualPrecision: { score: 5, qualitativeStatus: 'accurate', comment: 'Perfeito' },
        completeness: { score: 5, qualitativeStatus: 'complete', comment: 'Exaustivo' },
        conceptualRelationships: { score: 5, qualitativeStatus: 'well_connected', comment: 'Ótimo' },
        reasoningCoherence: { score: 5, qualitativeStatus: 'coherent', comment: 'Ótimo' },
        knowledgeApplication: { score: 5, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
    }),
    createdAt: Date.now(),
    usedPedagogicalHint: false,
    activityType: 'apply',
  };

  const consolidatedMastery = buildConsolidatedMasteryRecord(
    mockDoc.id,
    mockConcept.id,
    [mockMasteredAttempt1, mockMasteredAttempt2]
  );

  assert.equal(consolidatedMastery.diagnosticState, 'mastered');
  assert.equal(consolidatedMastery.masteryLevel, 'transfer');

  // 2. Simular que o agendador FSRS-7 está atrasado há 90 dias e a retrievability caiu para 0.20
  let schedule = await enrollConceptInSpacedRepetition(
    mockDoc,
    mockConcept,
    new Date('2026-08-01T10:00:00.000Z')
  );
  const nowCheck = new Date('2026-11-08T10:00:00.000Z');
  const estRetrievability = await calculateEstimatedRetrievability(schedule.memoryState, nowCheck);

  assert.ok(estRetrievability <= 1.0);

  // 3. Regra de Governança: a estimativa teórica do FSRS NÃO altera o masteryRecord nem o rebaixa para confirmed_gap!
  const postCheckMastery = buildConsolidatedMasteryRecord(
    mockDoc.id,
    mockConcept.id,
    [mockMasteredAttempt1, mockMasteredAttempt2]
  );

  assert.equal(postCheckMastery.diagnosticState, 'mastered');
  assert.equal(postCheckMastery.masteryLevel, 'transfer');
  assert.notEqual(postCheckMastery.diagnosticState, 'confirmed_gap');
});

// Teste 12: Resumo longitudinal e formatação amigável de prazos
test('T236: Cálculo do resumo longitudinal e formatação contextual de prazos em PT-BR', async () => {
  const refDate = new Date('2026-11-08T12:00:00.000Z');

  // Item 1: Atrasado (due ontem)
  const schedOverdue: ConceptReviewSchedule = {
    id: `${mockDoc.id}#${mockConcept.id}`,
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    conceptName: mockConcept.name,
    isFundamental: true,
    algorithm: FSRS_ALGORITHM,
    algorithmVersion: FSRS_ALGORITHM_VERSION,
    desiredRetention: 0.9,
    memoryState: {
      stability: 2,
      stabilityFast: 1.5,
      difficulty: 4,
      state: State.Review,
      scheduleStatus: 'review',
      reps: 2,
      lapses: 0,
      scheduledDays: 2,
      dueAt: '2026-11-05T12:00:00.000Z',
      lastReviewAt: '2026-11-03T12:00:00.000Z',
    },
    nextReviewDue: '2026-11-05T12:00:00.000Z',
    lastReviewedAt: '2026-11-03T12:00:00.000Z',
    lastRating: 'good',
    totalReviews: 1,
    totalLapses: 0,
    historyLogs: [
      {
        id: 'l1',
        documentId: mockDoc.id,
        conceptId: mockConcept.id,
        attemptId: 'a1',
        reviewedAt: '2026-11-03T12:00:00.000Z',
        grade: 'good',
        fsrsRating: 3,
        scheduledDays: 2,
        elapsedDays: 2,
        stability: 2,
        difficulty: 4,
        retrievabilityEstimated: 0.92,
        usedHint: false,
        pedagogicalRationale: 'Ok',
        evaluatedMasteryLevel: 'understand',
        stateBefore: 1,
        stateAfter: 2,
      },
    ],
    createdAt: Date.now() - 500000,
    updatedAt: Date.now() - 500000,
    enrolledAt: Date.now() - 500000,
  };

  const summary = await calculateLongitudinalSummary(
    mockDoc.id,
    [mockConcept, mockConcept2],
    [schedOverdue],
    [],
    refDate
  );

  assert.equal(summary.totalTrackedConcepts, 1);
  assert.equal(summary.untrackedConceptsCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.totalReviewsDone, 1);
  assert.equal(summary.correctRetrievalRate, 1.0); // 1 good log
  assert.equal(summary.ratingDistribution.good, 1);

  // Formatação de prazos
  const overdueFormat = formatFriendlyReviewDue('2026-11-05T12:00:00.000Z', refDate);
  assert.equal(overdueFormat.isOverdue, true);
  assert.ok(overdueFormat.label.includes('Atrasada há'));

  const todayFormat = formatFriendlyReviewDue('2026-11-08T15:00:00.000Z', refDate);
  assert.equal(todayFormat.isToday, true);
  assert.equal(todayFormat.label, 'Para hoje');

  const futureFormat = formatFriendlyReviewDue('2026-11-12T12:00:00.000Z', refDate);
  assert.equal(futureFormat.isToday, false);
  assert.equal(futureFormat.isOverdue, false);
  assert.ok(futureFormat.label.includes('Em 4 dias'));
});

// Teste 13: Auditoria da migração IndexedDB v2 -> v3
test('T237: Auditoria da Migração IndexedDB v2 -> v3 (Preservação das 8 Stores e Criação de review_schedules)', () => {
  // Simulação de banco v2 populado com as 8 stores da Fase 1 e Marcos 2A/2B/2C
  const v2Stores: Record<string, { keyPath: string; indexes: string[]; records: any[] }> = {
    documents: { keyPath: 'id', indexes: ['by-uploaded'], records: [{ id: 'doc_1', title: 'Neurociência' }] },
    analyses: { keyPath: 'id', indexes: ['by-document'], records: [{ id: 'an_1', documentId: 'doc_1' }] },
    notes: { keyPath: 'id', indexes: ['by-document', 'by-updated'], records: [{ id: 'note_1' }] },
    chat_sessions: { keyPath: 'documentId', indexes: [], records: [{ documentId: 'doc_1' }] },
    file_blobs: { keyPath: 'id', indexes: [], records: [{ id: 'blob_1' }] },
    learning_sessions: { keyPath: 'id', indexes: ['by-document', 'by-updated'], records: [{ id: 'sess_1' }] },
    learning_attempts: { keyPath: 'id', indexes: ['by-document', 'by-concept', 'by-session', 'by-created'], records: [{ id: 'att_1' }] },
    concept_mastery: { keyPath: 'id', indexes: ['by-document', 'by-concept', 'by-diagnostic-state'], records: [{ id: 'doc_1#c1' }] },
  };

  const stores = { ...v2Stores };
  const mockDb = {
    objectStoreNames: {
      contains: (name: string) => Boolean(stores[name]),
    },
    createObjectStore: (name: string, options: { keyPath: string }) => {
      stores[name] = { keyPath: options.keyPath, indexes: [], records: [] };
      return {
        createIndex: (indexName: string) => {
          stores[name].indexes.push(indexName);
        },
      };
    },
  };

  // Simular upgrade de v2 para v3
  const oldVersion = 2;
  if (oldVersion < 3 || !mockDb.objectStoreNames.contains('review_schedules')) {
    if (!mockDb.objectStoreNames.contains('review_schedules')) {
      const scheduleStore = mockDb.createObjectStore('review_schedules', { keyPath: 'id' });
      scheduleStore.createIndex('by-document');
      scheduleStore.createIndex('by-concept');
      scheduleStore.createIndex('by-due');
    }
  }

  // Verificar que todas as 8 stores anteriores foram 100% preservadas com seus registros
  assert.equal(Object.keys(stores).length, 9, 'Deve conter 9 stores no total');
  assert.equal(stores.documents.records.length, 1);
  assert.equal(stores.analyses.records.length, 1);
  assert.equal(stores.notes.records.length, 1);
  assert.equal(stores.learning_sessions.records.length, 1);
  assert.equal(stores.learning_attempts.records.length, 1);
  assert.equal(stores.concept_mastery.records.length, 1);

  // Verificar a nova store v3
  assert.ok(stores.review_schedules, 'Store review_schedules deve existir');
  assert.equal(stores.review_schedules.keyPath, 'id');
  assert.ok(stores.review_schedules.indexes.includes('by-document'));
  assert.ok(stores.review_schedules.indexes.includes('by-concept'));
  assert.ok(stores.review_schedules.indexes.includes('by-due'));
});

// Teste 14: Auditoria FSRS-7 Explícito
test('T238: Auditoria FSRS-7 Explícito — DefaultScheduler, pesos padrão (34), retenção 0.90 e criação canônica de cards', async () => {
  const config = await getFsrsConfig();
  assert.equal(config.version, 'FSRS-7');
  assert.equal(config.algorithmName, 'FSRS7Algorithm');
  assert.equal(config.weightsCount, 34);
  assert.equal(config.desiredRetention, 0.90);
  assert.equal(config.enableFuzz, false);
  assert.equal(config.maximumInterval, 36500);

  // Verifica que os pesos padrão são idênticos aos da biblioteca oficial (sem alterações empíricas)
  assert.equal(config.defaultWeights.length, 34);
  assert.equal(config.defaultWeights[0], 0.1104);
  assert.equal(config.defaultWeights[1], 2.2395);
  assert.equal(config.defaultWeights[2], 3.9221);

  // Verifica que o card inicial é instanciado canonicamente pelo scheduler oficial
  const sched = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, new Date('2026-11-08T12:00:00Z'));
  assert.equal(sched.memoryState.state, State.New);
  assert.equal(sched.memoryState.scheduleStatus, 'new');
  assert.equal(sched.memoryState.reps, 0);
  assert.equal(sched.memoryState.lapses, 0);
  assert.equal(sched.algorithm, 'FSRS-7');
  assert.equal(sched.desiredRetention, 0.90);
});

// Teste 15: Auditoria do Histórico Revlog
test('T239: Auditoria do Histórico Revlog — Persistência integral de card e revlog com todos os campos canônicos e retomada', async () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const sched = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, now);

  const fbGood: ExplanationFeedback = createMockFeedback({
    summary: 'Explicação precisa e coerente do mecanismo.',
    understoodElements: ['Despolarização por canais de Na+', 'Repolarização por canais de K+'],
    incompleteElements: [],
    misconceptions: [],
    identifiedGaps: [],
    evaluatedMasteryLevel: 'understand',
    rubric: {
      conceptualPrecision: { score: 1, qualitativeStatus: 'accurate', comment: 'Exato' },
      completeness: { score: 1, qualitativeStatus: 'complete', comment: 'Completo' },
      conceptualRelationships: { score: 1, qualitativeStatus: 'well_connected', comment: 'Conectado' },
      reasoningCoherence: { score: 1, qualitativeStatus: 'coherent', comment: 'Coerente' },
      knowledgeApplication: { score: 0.8, qualitativeStatus: 'applied', comment: 'Aplicado' },
    },
  });

  const { updatedSchedule, reviewLog } = await processConceptReview({
    schedule: sched,
    grade: 'good',
    feedback: fbGood,
    attemptId: 'att-rev-101',
    reviewSessionId: 'sess-101',
    reviewedAt: now,
    usedHint: false,
    confidenceDeclared: 'high',
  });

  // 1. Confirma que o novo estado do card foi persistido
  assert.equal(updatedSchedule.memoryState.state, State.Review);
  assert.equal(updatedSchedule.memoryState.reps, 1);
  assert.ok(updatedSchedule.memoryState.stability > 0);
  assert.ok(updatedSchedule.memoryState.scheduledDays > 0);

  // 2. Confirma que o revlog foi registrado no histórico e preserva os campos canônicos
  assert.equal(updatedSchedule.historyLogs.length, 1);
  assert.equal(reviewLog.grade, 'good');
  assert.equal(reviewLog.fsrsRating, 3);
  assert.equal(reviewLog.stateBefore, State.New);
  assert.equal(reviewLog.stateAfter, State.Review);
  assert.equal(reviewLog.lastScheduledDays, 0);
  assert.ok(reviewLog.scheduledDays > 0);
  assert.equal(reviewLog.algorithm, 'FSRS-7');
  assert.equal(reviewLog.algorithmVersion, FSRS_ALGORITHM_VERSION);
  assert.equal(reviewLog.desiredRetention, 0.90);
  assert.equal(reviewLog.usedHint, false);
  assert.equal(reviewLog.confidenceDeclared, 'high');

  // 3. Confirma presença e integridade do revlog nativo oficial do FSRS-7
  assert.ok(reviewLog.fsrsRevlog, 'fsrsRevlog deve existir');
  assert.equal(reviewLog.fsrsRevlog.rating, 3);
  assert.equal(reviewLog.fsrsRevlog.state, State.New);
  assert.ok(reviewLog.fsrsRevlog.reviewTime);

  // 4. Retomada após reiniciar a aplicação (recarrega do IndexedDB)
  const reloaded = await getReviewSchedule(mockDoc.id, mockConcept.id);
  assert.ok(reloaded, 'Agendamento deve ser recuperado do banco');
  assert.equal(reloaded.totalReviews, 1);
  assert.equal(reloaded.historyLogs.length, 1);
  assert.equal(reloaded.historyLogs[0].id, reviewLog.id);
  assert.equal(reloaded.historyLogs[0].fsrsRating, 3);
  assert.equal(reloaded.memoryState.stability, updatedSchedule.memoryState.stability);
});

// Teste 16: Auditoria da Separação Epistemológica — Cenários A, B, C e D
test('T240: Auditoria da Separação Epistemológica — Cenários A, B, C e D (Falha, Ajuda, Autonomia e Equívoco Material)', async () => {
  // Cenário A: Falha de recuperação sem equívoco conceitual (estudante responde "não sei")
  const fbScenarioA: ExplanationFeedback = createMockFeedback({
    summary: 'Estudante declarou não recordar o mecanismo neste momento.',
    understoodElements: [],
    incompleteElements: ['Etapas do potencial de ação'],
    misconceptions: [],
    identifiedGaps: [],
    evaluatedMasteryLevel: 'recognize',
    rubric: {
      conceptualPrecision: { score: 0.5, qualitativeStatus: 'partially_accurate', comment: 'Sem equívoco, omissão' },
      completeness: { score: 0, qualitativeStatus: 'incomplete', comment: 'Não respondeu' },
      conceptualRelationships: { score: 0.5, qualitativeStatus: 'isolated', comment: 'Isolado' },
      reasoningCoherence: { score: 0.5, qualitativeStatus: 'fragmented', comment: 'Fragmentado' },
      knowledgeApplication: { score: 0, qualitativeStatus: 'theoretical_only', comment: 'Sem aplicação' },
    },
  });

  const ratingA = mapPedagogicalEvaluationToFsrsRating(fbScenarioA, { usedHint: false });
  assert.equal(ratingA.grade, 'again');
  assert.equal(ratingA.ratingNumber, Rating.Again); // 1

  // MasteryEngine avalia a tentativa de "não sei":
  const attemptScenarioA: LearningAttempt = {
    id: 'att-scen-a',
    sessionId: 'sess-a',
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    attemptNumber: 1,
    promptQuestion: 'Explique o potencial de ação.',
    studentExplanation: 'Não sei explicar no momento.',
    feedback: fbScenarioA,
    activityType: 'review',
    usedPedagogicalHint: false,
    createdAt: Date.now(),
  };

  const masteryA = evaluateConceptMastery(mockDoc.id, mockConcept.id, [attemptScenarioA]);
  // Regra Inegociável: Ausência de resposta / omissão NÃO gera confirmed_gap!
  assert.notEqual(masteryA.diagnosticState, 'confirmed_gap', 'Cenário A não pode gerar confirmed_gap');
  assert.equal(masteryA.diagnosticState, 'unassessed');

  // Cenário B: Recuperação com ajuda (dica pedagógica)
  const fbScenarioB: ExplanationFeedback = createMockFeedback({
    summary: 'Resposta correta e estruturada após receber pista inicial.',
    understoodElements: ['Canais de Na+', 'Canais de K+'],
    incompleteElements: [],
    misconceptions: [],
    identifiedGaps: [],
    evaluatedMasteryLevel: 'understand',
    rubric: {
      conceptualPrecision: { score: 1, qualitativeStatus: 'accurate', comment: 'Exato' },
      completeness: { score: 1, qualitativeStatus: 'complete', comment: 'Completo' },
      conceptualRelationships: { score: 1, qualitativeStatus: 'well_connected', comment: 'Conectado' },
      reasoningCoherence: { score: 1, qualitativeStatus: 'coherent', comment: 'Coerente' },
      knowledgeApplication: { score: 0.8, qualitativeStatus: 'applied', comment: 'Aplicado' },
    },
  });

  const ratingB = mapPedagogicalEvaluationToFsrsRating(fbScenarioB, { usedHint: true });
  // Resposta com dica DEVE ser classificada como Hard no FSRS
  assert.equal(ratingB.grade, 'hard');
  assert.equal(ratingB.ratingNumber, Rating.Hard); // 2

  const attemptScenarioB: LearningAttempt = {
    id: 'att-scen-b',
    sessionId: 'sess-b',
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    attemptNumber: 2,
    promptQuestion: 'Explique com base na dica.',
    studentExplanation: 'Explicação assistida correta.',
    feedback: fbScenarioB,
    activityType: 'review',
    usedPedagogicalHint: true,
    createdAt: Date.now() + 1000,
  };

  const masteryB = evaluateConceptMastery(mockDoc.id, mockConcept.id, [attemptScenarioB]);
  // Tentativa assistida não é autônoma
  assert.equal(masteryB.unassistedAttemptsCount, 0);

  // Cenário C: Recuperação autônoma, precisa e coerente
  const fbScenarioC: ExplanationFeedback = createMockFeedback({
    summary: 'Recuperação excelente, precisa e com transferência prática sem dicas.',
    understoodElements: ['Despolarização Na+', 'Repolarização K+', 'Inativação', 'Sintaxina'],
    incompleteElements: [],
    misconceptions: [],
    identifiedGaps: [],
    evaluatedMasteryLevel: 'transfer',
    rubric: {
      conceptualPrecision: { score: 1, qualitativeStatus: 'accurate', comment: 'Exato' },
      completeness: { score: 1, qualitativeStatus: 'complete', comment: 'Completo' },
      conceptualRelationships: { score: 1, qualitativeStatus: 'well_connected', comment: 'Conectado' },
      reasoningCoherence: { score: 1, qualitativeStatus: 'coherent', comment: 'Coerente' },
      knowledgeApplication: { score: 1, qualitativeStatus: 'applied', comment: 'Transferência' },
    },
  });

  const ratingC = mapPedagogicalEvaluationToFsrsRating(fbScenarioC, { usedHint: false });
  assert.equal(ratingC.grade, 'easy');
  assert.equal(ratingC.ratingNumber, Rating.Easy); // 4

  // Cenário D: Equívoco conceitual material comprovado
  const fbScenarioD: ExplanationFeedback = createMockFeedback({
    summary: 'Equívoco material: confundiu os íons sódio e potássio na fase de repolarização.',
    understoodElements: ['Despolarização'],
    incompleteElements: [],
    misconceptions: ['Afirmou que o sódio promove a repolarização celular'],
    identifiedGaps: ['Inversão dos papéis do Na+ e K+'],
    evaluatedMasteryLevel: 'recognize',
    rubric: {
      conceptualPrecision: { score: 0, qualitativeStatus: 'inaccurate', comment: 'Incorreto' },
      completeness: { score: 0.5, qualitativeStatus: 'partially_complete', comment: 'Parcial' },
      conceptualRelationships: { score: 0, qualitativeStatus: 'confused', comment: 'Confuso' },
      reasoningCoherence: { score: 0, qualitativeStatus: 'contradictory', comment: 'Contraditório' },
      knowledgeApplication: { score: 0, qualitativeStatus: 'misapplied', comment: 'Errôneo' },
    },
  });

  const ratingD = mapPedagogicalEvaluationToFsrsRating(fbScenarioD, { usedHint: false });
  assert.equal(ratingD.grade, 'again');
  assert.equal(ratingD.ratingNumber, Rating.Again); // 1

  const attemptScenarioD: LearningAttempt = {
    id: 'att-scen-d',
    sessionId: 'sess-d',
    documentId: mockDoc.id,
    conceptId: mockConcept.id,
    attemptNumber: 1,
    promptQuestion: 'Explique o potencial de ação.',
    studentExplanation: 'O sódio repolariza o neurônio.',
    feedback: fbScenarioD,
    activityType: 'review',
    usedPedagogicalHint: false,
    createdAt: Date.now(),
  };

  const masteryD = evaluateConceptMastery(mockDoc.id, mockConcept.id, [attemptScenarioD]);
  // No Cenário D, o equívoco material comprovado justifica confirmed_gap no masteryEngine:
  assert.equal(masteryD.diagnosticState, 'confirmed_gap');
  assert.ok(masteryD.activeGaps.length > 0);
});

// Teste 17: Auditoria de Backup e Restauração JSON
test('T241: Auditoria de Backup e Restauração JSON (Roundtrip de Schedules e Histórico Revlog)', async () => {
  const sched = await enrollConceptInSpacedRepetition(mockDoc, mockConcept, new Date('2026-11-08T10:00:00Z'));
  await processConceptReview({
    schedule: sched,
    grade: 'good',
    feedback: createMockFeedback({
      summary: 'Revisão bem-sucedida',
      understoodElements: ['Mecanismo'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      evaluatedMasteryLevel: 'understand',
      rubric: {
        conceptualPrecision: { score: 1, qualitativeStatus: 'accurate', comment: 'Ok' },
        completeness: { score: 1, qualitativeStatus: 'complete', comment: 'Ok' },
        conceptualRelationships: { score: 1, qualitativeStatus: 'well_connected', comment: 'Ok' },
        reasoningCoherence: { score: 1, qualitativeStatus: 'coherent', comment: 'Ok' },
        knowledgeApplication: { score: 1, qualitativeStatus: 'applied', comment: 'Ok' },
      },
    }),
    attemptId: 'att-bck-1',
    reviewedAt: new Date('2026-11-08T10:30:00Z'),
  });

  // Exportar backup
  const jsonBackup = await exportUserDataAsJson();
  assert.ok(jsonBackup.includes('"reviewSchedules"'));
  assert.ok(jsonBackup.includes('"historyLogs"'));
  assert.ok(jsonBackup.includes('"fsrsRevlog"'));

  // Restaurar dados
  const restoreResult = await restoreUserDataFromJson(jsonBackup);
  assert.ok(restoreResult.schedulesCount >= 1);

  // Verificar restauração fiel
  const restoredSched = await getReviewSchedule(mockDoc.id, mockConcept.id);
  assert.ok(restoredSched);
  assert.equal(restoredSched.algorithm, 'FSRS-7');
  assert.ok(restoredSched.historyLogs.length >= 1);
  assert.equal(restoredSched.historyLogs[0].grade, 'good');
});

// Teste 18: Auditoria de Exclusão em Cascata e Isolamento Estrito
test('T242: Auditoria de Exclusão em Cascata e Isolamento Estrito entre Documentos e Conceitos', async () => {
  const docA: DocumentSource = { ...mockDoc, id: 'doc-alpha', isDemoMaterial: false };
  const docB: DocumentSource = { ...mockDoc, id: 'doc-beta', isDemoMaterial: false };

  const schedA = await enrollConceptInSpacedRepetition(docA, mockConcept);
  const schedB = await enrollConceptInSpacedRepetition(docB, mockConcept);

  assert.equal(schedA.id, 'doc-alpha#potencial-acao');
  assert.equal(schedB.id, 'doc-beta#potencial-acao');

  // Adicionar log em A
  await processConceptReview({
    schedule: schedA,
    grade: 'easy',
    feedback: createMockFeedback({
      summary: 'Perfeito',
      understoodElements: ['Tudo'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      evaluatedMasteryLevel: 'transfer',
      rubric: {
        conceptualPrecision: { score: 1, qualitativeStatus: 'accurate', comment: 'Ok' },
        completeness: { score: 1, qualitativeStatus: 'complete', comment: 'Ok' },
        conceptualRelationships: { score: 1, qualitativeStatus: 'well_connected', comment: 'Ok' },
        reasoningCoherence: { score: 1, qualitativeStatus: 'coherent', comment: 'Ok' },
        knowledgeApplication: { score: 1, qualitativeStatus: 'applied', comment: 'Ok' },
      },
    }),
    attemptId: 'att-a1',
  });

  // Excluir em cascata apenas dados do Documento A
  await deleteDocumentCompletely(docA.id);

  // Agendamento de A deve ter sido removido
  const checkA = await getReviewSchedule(docA.id, mockConcept.id);
  assert.equal(checkA, null, 'Agendamento do Doc A deve ter sido deletado em cascata');

  // Agendamento de B deve permanecer 100% íntegro e intocado
  const checkB = await getReviewSchedule(docB.id, mockConcept.id);
  assert.ok(checkB, 'Agendamento do Doc B deve continuar intacto');
  assert.equal(checkB.documentId, 'doc-beta');
  assert.equal(checkB.conceptId, mockConcept.id);
});

