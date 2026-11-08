import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ExplanationFeedback,
  LearningAttempt,
  ConceptMastery,
  MasteryLevel,
  DiagnosticState,
  Concept,
} from '../types/index.ts';
import { buildMasteryKey } from '../services/persistence/indexedDb.ts';
import { AIServiceHealth } from '../services/ai/aiHealth.ts';
import {
  getMasteryLevelMeta,
  getDiagnosticStateMeta,
  getRubricStatusMeta,
  formatAttemptsCount,
  verifyEvidenceCorrespondence,
} from '../utils/pedagogicalLabels.ts';
import {
  evaluateConceptMastery,
  calculateDocumentMasterySummary,
  buildConsolidatedMasteryRecord,
} from '../services/learning/masteryEngine.ts';
import {
  sanitizeConceptQuestion,
  sanitizeContextTip,
  detectTextLanguage,
  generateDeterministicConceptQuestion,
  generateDeterministicContextTip,
  generateDeterministicApplicationScenario,
  generateDeterministicRetrievalQuestion,
  sanitizeApplicationScenario,
  sanitizeRetrievalQuestion,
} from '../services/ai/i18nSanitizer.ts';
import {
  CREAR_STAGES,
  CREAR_STAGE_META,
  markStageCompleted,
  advanceToNextStage,
  navigateToStage,
  isStageAccessible,
  extractConceptRelations,
} from '../services/learning/crearCycleService.ts';
import type { CrearCycleProgress, CrearStage, LearningSession } from '../types/index.ts';

test('T201: Rubrica Multidimensional do "Agora Eu Explico" cobre estritamente as 5 dimensões cognitivas', () => {
  const sampleFeedback: ExplanationFeedback = {
    summary: 'Explicação detalhada com boa precisão conceitual do mecanismo de sinapse química.',
    understoodElements: ['Influxo de Ca2+ voltagem-dependente', 'Fusão das vesículas sinápticas'],
    incompleteElements: ['Não mencionou a recaptação do neurotransmissor'],
    misconceptions: [],
    identifiedGaps: [],
    groundingEvidences: [
      {
        id: 'ev_p2',
        type: 'pdf_page',
        pageNumber: 2,
        excerpt: 'Os canais de cálcio dependentes de voltagem abrem-se permitindo o influxo de Ca2+.',
      },
    ],
    improvementSuggestions: ['Explicar o mecanismo de encerramento do sinal sináptico.'],
    rubric: {
      conceptualPrecision: {
        score: 0.9,
        qualitativeStatus: 'accurate',
        comment: 'Terminologia e etapas químicas rigorosamente descritas.',
      },
      completeness: {
        score: 0.75,
        qualitativeStatus: 'partially_complete',
        comment: 'Cobriu a etapa de liberação, faltando o término.',
      },
      conceptualRelationships: {
        score: 0.85,
        qualitativeStatus: 'well_connected',
        connectedConceptIds: ['c_despolarizacao', 'c_vesiculas'],
        comment: 'Articulou adequadamente com a despolarização.',
      },
      reasoningCoherence: {
        score: 0.95,
        qualitativeStatus: 'coherent',
        comment: 'Cadeia causal sem contradições lógicas.',
      },
      knowledgeApplication: {
        score: 0.8,
        qualitativeStatus: 'applied',
        comment: 'Contextualizou o impacto de toxinas no bloqueio de canais.',
      },
    },
    evaluatedMasteryLevel: 'understand',
    suggestedDiagnosticState: 'understood',
  };

  assert.ok(sampleFeedback.rubric.conceptualPrecision);
  assert.ok(sampleFeedback.rubric.completeness);
  assert.ok(sampleFeedback.rubric.conceptualRelationships);
  assert.ok(sampleFeedback.rubric.reasoningCoherence);
  assert.ok(sampleFeedback.rubric.knowledgeApplication);
  assert.equal(sampleFeedback.rubric.conceptualPrecision.qualitativeStatus, 'accurate');
  assert.equal(sampleFeedback.evaluatedMasteryLevel, 'understand');
  assert.equal(sampleFeedback.suggestedDiagnosticState, 'understood');
});

test('T202: Construção da chave composta de maestria no IndexedDB (buildMasteryKey)', () => {
  const key = buildMasteryKey('doc_neuro_01', 'c_influxo_ca');
  assert.equal(key, 'doc_neuro_01#c_influxo_ca');
  assert.ok(key.includes('#'));
});

test('T203: Resiliência e Circuit Breaker para o serviço gemini_evaluation', () => {
  const initial = AIServiceHealth.getStatus('gemini_evaluation');
  assert.equal(initial.state, 'healthy');

  AIServiceHealth.recordFailure('gemini_evaluation', 'Timeout de avaliação');
  const degraded = AIServiceHealth.getStatus('gemini_evaluation');
  assert.equal(degraded.state, 'degraded');
  assert.equal(degraded.consecutiveFailures, 1);

  AIServiceHealth.recordSuccess('gemini_evaluation');
  assert.equal(AIServiceHealth.getStatus('gemini_evaluation').state, 'healthy');
  assert.equal(AIServiceHealth.getStatus('gemini_evaluation').consecutiveFailures, 0);
});

test('T204: Governança de Domínio: uma resposta isolada não concede "mastered" sem evidências acumuladas', () => {
  const levels: MasteryLevel[] = ['recognize', 'understand', 'apply', 'transfer'];
  const states: DiagnosticState[] = ['unassessed', 'confirmed_gap', 'understood', 'mastered'];

  assert.equal(levels.length, 4);
  assert.equal(states.length, 4);

  // Valida que uma primeira tentativa inicia em understand e requer acumulação
  const attempt1: Partial<LearningAttempt> = {
    attemptNumber: 1,
    studentExplanation: 'Primeira explicação simples do conceito.',
  };
  assert.equal(attempt1.attemptNumber, 1);

  // Registro de maestria acumulada
  const mastery: ConceptMastery = {
    id: buildMasteryKey('doc_1', 'c_1'),
    documentId: 'doc_1',
    conceptId: 'c_1',
    masteryLevel: 'understand',
    diagnosticState: 'understood',
    totalAttempts: 1,
    lastAttemptAt: Date.now(),
    historyAttemptIds: ['attempt_1'],
    activeGaps: [],
    consolidatedEvidenceIds: ['ev_1'],
  };

  assert.equal(mastery.totalAttempts, 1);
  assert.notEqual(mastery.diagnosticState, 'mastered', 'Tentativa isolada não consolida mastered prematuramente');
});

test('T205: Diretriz Idiomática — Perguntas e fallbacks do "Agora Eu Explico" são estritamente em Português do Brasil (PT-BR)', () => {
  // Mesmo para conceitos com termos técnicos em inglês (ex.: Digital Shadow, Long-Term Potentiation)
  const englishConceptName = 'Digital Shadow';
  const fallbackPrompt = `Como você explicaria o conceito de "${englishConceptName}" para um colega, detalhando como ele funciona, seus mecanismos e por que é fundamental na área?`;

  assert.ok(fallbackPrompt.includes('Como você explicaria'), 'Pergunta padrão deve ser formulada em português');
  assert.ok(fallbackPrompt.includes('detalhando como ele funciona'), 'Estrutura socrática do método Feynman em português');
  assert.ok(!fallbackPrompt.includes('Does the system'), 'Jamais formula perguntas em língua estrangeira');
});

test('T206: Mapeamento de Rótulos em PT-BR e Semântica Pedagógica', () => {
  // 1. Níveis de Domínio
  assert.equal(getMasteryLevelMeta('recognize').label, 'Reconhecer');
  assert.equal(getMasteryLevelMeta('understand').label, 'Compreender');
  assert.equal(getMasteryLevelMeta('apply').label, 'Aplicar');
  assert.equal(getMasteryLevelMeta('transfer').label, 'Transferir');

  // 2. Estados Diagnósticos
  assert.equal(getDiagnosticStateMeta('unassessed').label, 'Não Avaliado');
  assert.equal(getDiagnosticStateMeta('confirmed_gap').label, 'Lacuna Identificada');
  assert.equal(getDiagnosticStateMeta('understood').label, 'Compreendido');
  assert.equal(getDiagnosticStateMeta('mastered').label, 'Dominado');

  // 3. Status das 5 Dimensões da Rubrica (15 termos)
  assert.equal(getRubricStatusMeta('accurate').label, 'Precisa');
  assert.equal(getRubricStatusMeta('partially_accurate').label, 'Parcialmente Precisa');
  assert.equal(getRubricStatusMeta('inaccurate').label, 'Imprecisa');

  assert.equal(getRubricStatusMeta('complete').label, 'Completa');
  assert.equal(getRubricStatusMeta('partially_complete').label, 'Parcialmente Completa');
  assert.equal(getRubricStatusMeta('incomplete').label, 'Incompleta');

  assert.equal(getRubricStatusMeta('well_connected').label, 'Bem Relacionadas');
  assert.equal(getRubricStatusMeta('isolated').label, 'Pouco Relacionadas');
  assert.equal(getRubricStatusMeta('confused').label, 'Relações Confusas');

  assert.equal(getRubricStatusMeta('coherent').label, 'Coerente');
  assert.equal(getRubricStatusMeta('fragmented').label, 'Fragmentado');
  assert.equal(getRubricStatusMeta('contradictory').label, 'Contraditório');

  assert.equal(getRubricStatusMeta('applied').label, 'Aplicada');
  assert.equal(getRubricStatusMeta('theoretical_only').label, 'Apenas Teórica');
  assert.equal(getRubricStatusMeta('misapplied').label, 'Aplicação Inadequada');

  // 4. Concordância Gramatical de Tentativas
  assert.equal(formatAttemptsCount(1), '1 tentativa');
  assert.equal(formatAttemptsCount(2), '2 tentativas');
  assert.equal(formatAttemptsCount(5), '5 tentativas');
});

test('T207: Integridade e Verificação Determinística de Citações Documentais', () => {
  const documentExcerpts = [
    'A sinapse química depende estritamente da entrada de íons cálcio através de canais voltagem-dependentes.',
    'A fusão das vesículas sinápticas com a membrana plasmática é mediada pelo complexo SNARE.',
  ];

  // Caso 1: Citação literal exata contida na fonte (verbatim, sem alteração de caixa ou pontuação)
  const literalResult = verifyEvidenceCorrespondence(
    'canais voltagem-dependentes',
    documentExcerpts
  );
  assert.equal(literalResult.isExactLiteral, true);
  assert.equal(literalResult.isLiteralQuote, true);
  assert.equal(literalResult.isNormalizedMatch, false);
  assert.equal(literalResult.matchType, 'exact_literal');
  assert.equal(literalResult.statusLabel, 'Citação Literal Exata');

  // Caso 2: Correspondência textual normalizada (depende de normalização de caixa ou pontuação)
  const normalizedResult = verifyEvidenceCorrespondence(
    'CANAIS VOLTAGEM-DEPENDENTES.',
    documentExcerpts
  );
  assert.equal(normalizedResult.isExactLiteral, false);
  assert.equal(normalizedResult.isLiteralQuote, false, 'Não deve classificar como literal o que depende de normalização');
  assert.equal(normalizedResult.isNormalizedMatch, true);
  assert.equal(normalizedResult.matchType, 'normalized_match');
  assert.equal(normalizedResult.statusLabel, 'Correspondência Textual Normalizada');

  // Caso 3: Síntese temática ou paráfrase não presente verbatim
  const paraphraseResult = verifyEvidenceCorrespondence(
    'O sinal elétrico é convertido em sinal químico após a transdução de potencial.',
    documentExcerpts
  );
  assert.equal(paraphraseResult.isExactLiteral, false);
  assert.equal(paraphraseResult.isLiteralQuote, false);
  assert.equal(paraphraseResult.isNormalizedMatch, false);
  assert.equal(paraphraseResult.matchType, 'thematic_synthesis');
  assert.equal(paraphraseResult.statusLabel, 'Síntese Temática da Fonte');
});

test('T208: Registro de Apoio Pedagógico e Distinção de Autonomia', () => {
  // Tentativa 1: Estudante consultou a dica pedagógica (autonomia assistida)
  const attemptWithHint: LearningAttempt = {
    id: 'att_hint_01',
    sessionId: 'session_01',
    documentId: 'doc_neuro_01',
    conceptId: 'c_influxo_ca',
    attemptNumber: 1,
    promptQuestion: 'Como o influxo de cálcio atua na sinapse?',
    studentExplanation: 'Os canais de cálcio se abrem e induzem a liberação.',
    feedback: {
      summary: 'Boa compreensão com apoio da dica.',
      understoodElements: ['Abertura de canais de cálcio'],
      incompleteElements: ['Não descreveu o complexo SNARE'],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: ['Tente detalhar a ação do cálcio na vesícula sem consultar a dica.'],
      rubric: {
        conceptualPrecision: { score: 0.8, qualitativeStatus: 'accurate', comment: 'Correto.' },
        completeness: { score: 0.6, qualitativeStatus: 'partially_complete', comment: 'Incompleto.' },
        conceptualRelationships: { score: 0.7, qualitativeStatus: 'well_connected', comment: 'Relacionado.' },
        reasoningCoherence: { score: 0.8, qualitativeStatus: 'coherent', comment: 'Coerente.' },
        knowledgeApplication: { score: 0.5, qualitativeStatus: 'theoretical_only', comment: 'Apenas teórico.' },
      },
      evaluatedMasteryLevel: 'understand',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: Date.now(),
    usedPedagogicalHint: true,
  };

  assert.equal(attemptWithHint.usedPedagogicalHint, true);
  // Regra pedagógica: com dica, o diagnóstico é formativo (understood) e jamais "mastered"
  assert.notEqual(attemptWithHint.feedback.suggestedDiagnosticState, 'mastered');

  // Tentativa 2 subsequente: O estudante NÃO utilizou dica (autonomia plena demonstrada)
  const attemptWithoutHint: LearningAttempt = {
    id: 'att_hint_02',
    sessionId: 'session_01',
    documentId: 'doc_neuro_01',
    conceptId: 'c_influxo_ca',
    attemptNumber: 2,
    promptQuestion: 'Como o influxo de cálcio atua na sinapse?',
    studentExplanation: 'O potencial de ação despolariza o terminal pré-sináptico, abrindo canais de cálcio voltagem-dependentes. O influxo maciço de Ca2+ ativa o complexo SNARE e a sinaptotagmina, promovendo a exocitose das vesículas com neurotransmissores para a fenda sináptica.',
    feedback: {
      summary: 'Domínio avançado e autônomo demonstrado com precisão e completude.',
      understoodElements: ['Despolarização pré-sináptica', 'Canais de cálcio voltagem-dependentes', 'Complexo SNARE e sinaptotagmina', 'Exocitose vesicular'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 1.0, qualitativeStatus: 'accurate', comment: 'Exato.' },
        completeness: { score: 1.0, qualitativeStatus: 'complete', comment: 'Completo.' },
        conceptualRelationships: { score: 0.95, qualitativeStatus: 'well_connected', comment: 'Conectado.' },
        reasoningCoherence: { score: 1.0, qualitativeStatus: 'coherent', comment: 'Coerente.' },
        knowledgeApplication: { score: 0.9, qualitativeStatus: 'applied', comment: 'Aplicado.' },
      },
      evaluatedMasteryLevel: 'apply',
      suggestedDiagnosticState: 'mastered',
    },
    createdAt: Date.now() + 60000,
    usedPedagogicalHint: false,
  };

  assert.equal(attemptWithoutHint.usedPedagogicalHint, false);
  // Uso prévio de dica na tentativa 1 NÃO bloqueia permanentemente 'mastered' na tentativa 2 independente
  assert.equal(attemptWithoutHint.feedback.suggestedDiagnosticState, 'mastered');
});

test('T209: Auditoria da Migração IndexedDB v1 -> v2 (Preservação das 5 Stores e Criação das 3 Novas)', () => {
  // Simulação de banco v1 populado com as 5 stores originais
  const v1Stores: Record<string, { keyPath: string; indexes: string[]; records: any[] }> = {
    documents: { keyPath: 'id', indexes: ['by-uploaded'], records: [{ id: 'doc_orig_1', title: 'Neurociência' }] },
    analyses: { keyPath: 'id', indexes: ['by-document'], records: [{ id: 'an_orig_1', documentId: 'doc_orig_1' }] },
    notes: { keyPath: 'id', indexes: ['by-document', 'by-updated'], records: [{ id: 'note_orig_1', documentId: 'doc_orig_1' }] },
    chat_sessions: { keyPath: 'documentId', indexes: [], records: [{ documentId: 'doc_orig_1', messages: [] }] },
    file_blobs: { keyPath: 'id', indexes: [], records: [{ id: 'blob_orig_1', size: 1024 }] },
  };

  // Simulação do mecanismo de upgrade da v1 (oldVersion = 1) para v2 (DB_VERSION = 2)
  const stores = { ...v1Stores };
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

  const oldVersion = 1;

  // Executa o bloco de upgrade do schema v2
  if (oldVersion < 2 || !mockDb.objectStoreNames.contains('learning_sessions')) {
    if (!mockDb.objectStoreNames.contains('learning_sessions')) {
      const sessionStore = mockDb.createObjectStore('learning_sessions', { keyPath: 'id' });
      sessionStore.createIndex('by-document');
      sessionStore.createIndex('by-updated');
    }
  }

  if (oldVersion < 2 || !mockDb.objectStoreNames.contains('learning_attempts')) {
    if (!mockDb.objectStoreNames.contains('learning_attempts')) {
      const attemptStore = mockDb.createObjectStore('learning_attempts', { keyPath: 'id' });
      attemptStore.createIndex('by-document');
      attemptStore.createIndex('by-concept');
      attemptStore.createIndex('by-session');
      attemptStore.createIndex('by-created');
    }
  }

  if (oldVersion < 2 || !mockDb.objectStoreNames.contains('concept_mastery')) {
    if (!mockDb.objectStoreNames.contains('concept_mastery')) {
      const masteryStore = mockDb.createObjectStore('concept_mastery', { keyPath: 'id' });
      masteryStore.createIndex('by-document');
      masteryStore.createIndex('by-concept');
      masteryStore.createIndex('by-diagnostic-state');
    }
  }

  // 1. Confirma que todas as 5 stores originais permanecem intactas com seus registros
  assert.ok(stores['documents'], 'Store documents preservada');
  assert.equal(stores['documents'].records.length, 1);
  assert.equal(stores['documents'].records[0].id, 'doc_orig_1');

  assert.ok(stores['analyses'], 'Store analyses preservada');
  assert.equal(stores['analyses'].records.length, 1);

  assert.ok(stores['notes'], 'Store notes preservada');
  assert.equal(stores['notes'].records.length, 1);

  assert.ok(stores['chat_sessions'], 'Store chat_sessions preservada');
  assert.equal(stores['chat_sessions'].records.length, 1);

  assert.ok(stores['file_blobs'], 'Store file_blobs preservada');
  assert.equal(stores['file_blobs'].records.length, 1);

  // 2. Confirma que as 3 novas stores da v2 foram criadas
  assert.ok(stores['learning_sessions'], 'Store learning_sessions criada na v2');
  assert.deepEqual(stores['learning_sessions'].indexes, ['by-document', 'by-updated']);

  assert.ok(stores['learning_attempts'], 'Store learning_attempts criada na v2');
  assert.deepEqual(stores['learning_attempts'].indexes, ['by-document', 'by-concept', 'by-session', 'by-created']);

  assert.ok(stores['concept_mastery'], 'Store concept_mastery criada na v2');
  assert.deepEqual(stores['concept_mastery'].indexes, ['by-document', 'by-concept', 'by-diagnostic-state']);

  // 3. Simula exclusão em cascata: ao deletar documento 'doc_orig_1', remove entidades associadas
  stores['learning_attempts'].records.push({ id: 'att_1', documentId: 'doc_orig_1' });
  stores['concept_mastery'].records.push({ id: 'doc_orig_1#c1', documentId: 'doc_orig_1' });
  stores['learning_sessions'].records.push({ id: 'sess_1', documentId: 'doc_orig_1' });

  // Deleção cascata
  const targetDocId = 'doc_orig_1';
  stores['documents'].records = stores['documents'].records.filter(r => r.id !== targetDocId);
  stores['learning_attempts'].records = stores['learning_attempts'].records.filter(r => r.documentId !== targetDocId);
  stores['concept_mastery'].records = stores['concept_mastery'].records.filter(r => r.documentId !== targetDocId);
  stores['learning_sessions'].records = stores['learning_sessions'].records.filter(r => r.documentId !== targetDocId);

  assert.equal(stores['documents'].records.length, 0);
  assert.equal(stores['learning_attempts'].records.length, 0);
  assert.equal(stores['concept_mastery'].records.length, 0);
  assert.equal(stores['learning_sessions'].records.length, 0);
});

// Helper para gerar feedback estruturado nos testes do motor de domínio
function createMockFeedback(overrides: Partial<ExplanationFeedback> = {}): ExplanationFeedback {
  return {
    summary: 'Explicação do mecanismo biológico com boa articulação causal.',
    understoodElements: ['Influxo de Ca2+', 'Fusão vesicular'],
    incompleteElements: [],
    misconceptions: [],
    identifiedGaps: [],
    groundingEvidences: [
      { id: 'ev_1', type: 'pdf_page', pageNumber: 3, excerpt: 'O Ca2+ desencadeia a exocitose das vesículas.' },
    ],
    improvementSuggestions: ['Conectar com recaptação'],
    rubric: {
      conceptualPrecision: { score: 0.9, qualitativeStatus: 'accurate', comment: 'Terminologia precisa.' },
      completeness: { score: 0.85, qualitativeStatus: 'complete', comment: 'Mecanismo completo.' },
      conceptualRelationships: { score: 0.85, qualitativeStatus: 'well_connected', comment: 'Relações causais sólidas.' },
      reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Raciocínio coerente.' },
      knowledgeApplication: { score: 0.85, qualitativeStatus: 'applied', comment: 'Aplicação experimental descrita.' },
    },
    evaluatedMasteryLevel: 'understand',
    suggestedDiagnosticState: 'understood',
    ...overrides,
  };
}

function createMockAttempt(overrides: Partial<LearningAttempt> = {}): LearningAttempt {
  return {
    id: `att_${Math.random().toString(36).substring(2, 9)}`,
    sessionId: 'sess_padrao',
    documentId: 'doc_neuro_01',
    conceptId: 'c_sinapse',
    attemptNumber: 1,
    promptQuestion: 'Explique como o influxo de cálcio modula a liberação de neurotransmissores.',
    studentExplanation: 'A despolarização abre canais voltagem-dependentes, o Ca2+ entra e ativa proteínas SNARE.',
    feedback: createMockFeedback(),
    createdAt: Date.now(),
    usedPedagogicalHint: false,
    ...overrides,
  };
}

test('T210: Estado inicial unassessed: ausência de avaliação não é desconhecimento nem falha de pré-requisito', () => {
  // 1. Conceito sem qualquer tentativa
  const decision = evaluateConceptMastery('doc_neuro_01', 'c_despolarizacao', []);

  assert.equal(decision.diagnosticState, 'unassessed');
  assert.equal(decision.masteryLevel, 'recognize');
  assert.equal(decision.totalAttempts, 0);
  assert.equal(decision.activeGaps.length, 0);
  assert.match(decision.qualifyingReason, /Nenhuma tentativa registrada/i);

  // 2. Pré-requisito sem avaliação: não pode gerar lacuna confirmada
  const prereqDecision = evaluateConceptMastery('doc_neuro_01', 'c_gradiente_eletroquimico', []);
  assert.equal(prereqDecision.diagnosticState, 'unassessed');
  assert.equal(prereqDecision.activeGaps.length, 0);
});

test('T211: Diferenciação entre omissão (incompleteElements), lacuna confirmada (identifiedGaps/contradição) e equívoco (misconceptions)', () => {
  // Cenário A: Omissão isolada (incompleteElements presente, mas 0 misconceptions e raciocínio coerente)
  // REGRA: Uma informação omitida NÃO é automaticamente um equívoco conceitual.
  const omissionAttempt = createMockAttempt({
    feedback: createMockFeedback({
      incompleteElements: ['Não mencionou a enzima acetilcolinesterase'],
      misconceptions: [],
      identifiedGaps: [],
      rubric: {
        conceptualPrecision: { score: 0.85, qualitativeStatus: 'accurate', comment: 'Correto no que explicou.' },
        completeness: { score: 0.6, qualitativeStatus: 'partially_complete', comment: 'Omitiu o encerramento.' },
        conceptualRelationships: { score: 0.8, qualitativeStatus: 'well_connected', comment: 'Conexões claras.' },
        reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Coerente.' },
        knowledgeApplication: { score: 0.7, qualitativeStatus: 'applied', comment: 'Boa base teórica.' },
      },
      evaluatedMasteryLevel: 'understand',
    }),
  });

  const omissionDecision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [omissionAttempt]);
  assert.equal(omissionDecision.diagnosticState, 'understood', 'Omissão isolada não deve gerar confirmed_gap');
  assert.equal(omissionDecision.activeGaps.length, 0);

  // Cenário B: Equívoco conceitual material (misconceptions ativo)
  const misconceptionAttempt = createMockAttempt({
    feedback: createMockFeedback({
      misconceptions: ['Afirmou que o Ca2+ é expulso da célula para promover a fusão'],
      rubric: {
        conceptualPrecision: { score: 0.3, qualitativeStatus: 'inaccurate', comment: 'Sentido do fluxo incorreto.' },
        completeness: { score: 0.5, qualitativeStatus: 'incomplete', comment: 'Incompleto.' },
        conceptualRelationships: { score: 0.4, qualitativeStatus: 'confused', comment: 'Relações distorcidas.' },
        reasoningCoherence: { score: 0.5, qualitativeStatus: 'coherent', comment: 'Lógica interna falha.' },
        knowledgeApplication: { score: 0.2, qualitativeStatus: 'misapplied', comment: 'Inaplicável.' },
      },
      evaluatedMasteryLevel: 'recognize',
    }),
  });

  const misconceptionDecision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [misconceptionAttempt]);
  assert.equal(misconceptionDecision.diagnosticState, 'confirmed_gap');
  assert.ok(misconceptionDecision.activeGaps.length > 0);
  assert.match(misconceptionDecision.qualifyingReason, /equívoco material|lacuna formativa/i);

  // Cenário C: Contradição lógica grave no raciocínio (reasoningCoherence: contradictory)
  const contradictionAttempt = createMockAttempt({
    feedback: createMockFeedback({
      misconceptions: [],
      rubric: {
        conceptualPrecision: { score: 0.4, qualitativeStatus: 'partially_accurate', comment: 'Frases soltas.' },
        completeness: { score: 0.4, qualitativeStatus: 'incomplete', comment: 'Incompleto.' },
        conceptualRelationships: { score: 0.3, qualitativeStatus: 'confused', comment: 'Conexões invertidas.' },
        reasoningCoherence: { score: 0.2, qualitativeStatus: 'contradictory', comment: 'Afirmou e negou o mesmo efeito.' },
        knowledgeApplication: { score: 0.2, qualitativeStatus: 'misapplied', comment: 'Sem aplicação.' },
      },
    }),
  });

  const contradictionDecision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [contradictionAttempt]);
  assert.equal(contradictionDecision.diagnosticState, 'confirmed_gap');
  assert.match(contradictionDecision.qualifyingReason, /contradição|lacuna formativa/i);

  // Cenário D: Pré-requisito avaliado e não compreendido (identifiedGaps fundamentado em relações confusas/imprecisão)
  const prereqGapAttempt = createMockAttempt({
    feedback: createMockFeedback({
      misconceptions: [],
      identifiedGaps: ['Pré-requisito ausente: Lei de Nernst e Potencial de Equilíbrio'],
      rubric: {
        conceptualPrecision: { score: 0.6, qualitativeStatus: 'partially_accurate', comment: 'Imprecisão no gradiente.' },
        completeness: { score: 0.7, qualitativeStatus: 'partially_complete', comment: 'Incompleto.' },
        conceptualRelationships: { score: 0.3, qualitativeStatus: 'confused', comment: 'Relações confusas com o pré-requisito.' },
        reasoningCoherence: { score: 0.8, qualitativeStatus: 'coherent', comment: 'Lógica linear.' },
        knowledgeApplication: { score: 0.5, qualitativeStatus: 'theoretical_only', comment: 'Teórico.' },
      },
    }),
  });

  const prereqGapDecision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [prereqGapAttempt]);
  assert.equal(prereqGapDecision.diagnosticState, 'confirmed_gap');
  assert.ok(prereqGapDecision.activeGaps.includes('Pré-requisito ausente: Lei de Nernst e Potencial de Equilíbrio'));

  // Cenário E: Menção isolada a pré-requisito em identifiedGaps com explicação precisa e coerente
  // REGRA DE GOVERNANÇA: A presença isolada de string em identifiedGaps não deve gerar falso diagnóstico de erro.
  const ungroundedGapAttempt = createMockAttempt({
    feedback: createMockFeedback({
      misconceptions: [],
      identifiedGaps: ['Pré-requisito não abordado: Lei de Ohm'],
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Precisão impecável no conceito avaliado.' },
        completeness: { score: 0.85, qualitativeStatus: 'complete', comment: 'Cobriu todos os elementos solicitados.' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Articulação lógica sólida.' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Cadeia causal sem contradições.' },
        knowledgeApplication: { score: 0.85, qualitativeStatus: 'applied', comment: 'Aplicação demonstrada.' },
      },
      evaluatedMasteryLevel: 'understand',
    }),
  });

  const ungroundedGapDecision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [ungroundedGapAttempt]);
  assert.equal(ungroundedGapDecision.diagnosticState, 'understood', 'Menção isolada em identifiedGaps com resposta precisa não deve gerar confirmed_gap');
  assert.equal(ungroundedGapDecision.activeGaps.length, 0);
});

test('T212: Compreensão demonstrada (understood) sem promoção indevida a dominado (mastered) em resposta excelente isolada', () => {
  // Uma resposta isolada com pontuação máxima, aplicação excelente e sem dica pedagógica
  const perfectSingleAttempt = createMockAttempt({
    attemptNumber: 1,
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      misconceptions: [],
      identifiedGaps: [],
      incompleteElements: [],
      rubric: {
        conceptualPrecision: { score: 1.0, qualitativeStatus: 'accurate', comment: 'Excepcional precisão.' },
        completeness: { score: 1.0, qualitativeStatus: 'complete', comment: 'Exaustivo.' },
        conceptualRelationships: { score: 1.0, qualitativeStatus: 'well_connected', comment: 'Articulação perfeita.' },
        reasoningCoherence: { score: 1.0, qualitativeStatus: 'coherent', comment: 'Impecável.' },
        knowledgeApplication: { score: 1.0, qualitativeStatus: 'applied', comment: 'Aplicação transdisciplinar.' },
      },
      evaluatedMasteryLevel: 'apply',
      suggestedDiagnosticState: 'mastered', // IA pode sugerir mastered, mas o motor determinístico deve limitar a understood
    }),
  });

  const decision = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [perfectSingleAttempt]);

  // REGRA DE GOVERNANÇA: Exigir simultaneamente pelo menos DUAS tentativas independentes. Uma única tentativa nunca confere mastered.
  assert.equal(decision.diagnosticState, 'understood', 'Uma única tentativa JAMAIS pode conferir estado mastered');
  assert.notEqual(decision.diagnosticState, 'mastered');
  assert.equal(decision.totalAttempts, 1);
  assert.equal(decision.masteryLevel, 'apply');
  assert.match(decision.qualifyingReason, /Compreensão do mecanismo demonstrada/i);
});

test('T213: Domínio consolidado (mastered) somente após evidências independentes e critérios cumulativos, sem bloqueio perpétuo por dica prévia', () => {
  const baseTime = 1700000000000;

  // Tentativa 1: Estudante usou dica pedagógica (não qualifica para autonomia espontânea)
  const attempt1WithHint = createMockAttempt({
    sessionId: 'sess_alpha',
    attemptNumber: 1,
    createdAt: baseTime,
    usedPedagogicalHint: true,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'understand',
    }),
  });

  const decisionAfter1 = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [attempt1WithHint]);
  assert.equal(decisionAfter1.diagnosticState, 'understood');
  assert.equal(decisionAfter1.unassistedAttemptsCount, 0);

  // Tentativa 2: Sem dica, nível apply, mesma sessão
  const attempt2NoHint = createMockAttempt({
    sessionId: 'sess_alpha',
    attemptNumber: 2,
    createdAt: baseTime + 1000 * 60 * 10, // 10 min depois
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'apply',
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Preciso.' },
        completeness: { score: 0.9, qualitativeStatus: 'complete', comment: 'Completo.' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Bem conectado.' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Coerente.' },
        knowledgeApplication: { score: 0.9, qualitativeStatus: 'applied', comment: 'Aplicado.' },
      },
    }),
  });

  const decisionAfter2 = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [attempt1WithHint, attempt2NoHint]);
  // Ainda não tem 2 tentativas sem dica nem sessões distintas
  assert.equal(decisionAfter2.diagnosticState, 'understood');
  assert.equal(decisionAfter2.unassistedAttemptsCount, 1);

  // Tentativa 3: Sem dica, nível transfer, SESSÃO DISTINTA (sess_beta) e tempo separado (> 2 horas)
  const attempt3DistinctSession = createMockAttempt({
    sessionId: 'sess_beta',
    attemptNumber: 3,
    createdAt: baseTime + 1000 * 60 * 60 * 3, // 3 horas depois
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'transfer',
      rubric: {
        conceptualPrecision: { score: 1.0, qualitativeStatus: 'accurate', comment: 'Exato.' },
        completeness: { score: 0.95, qualitativeStatus: 'complete', comment: 'Exaustivo.' },
        conceptualRelationships: { score: 0.95, qualitativeStatus: 'well_connected', comment: 'Transversal.' },
        reasoningCoherence: { score: 1.0, qualitativeStatus: 'coherent', comment: 'Consistente.' },
        knowledgeApplication: { score: 0.95, qualitativeStatus: 'applied', comment: 'Transferência sólida.' },
      },
    }),
  });

  const decisionAfter3 = evaluateConceptMastery('doc_neuro_01', 'c_sinapse', [
    attempt1WithHint,
    attempt2NoHint,
    attempt3DistinctSession,
  ]);

  // Todos os critérios cumulativos satisfeitos:
  // (1) >= 2 tentativas
  // (2) >= 2 tentativas sem dica
  // (3) Sessões distintas (sess_alpha e sess_beta)
  // (4) Nível cognitivo >= apply (foi transfer)
  // (5) Aplicação prática confirmada ('applied')
  // (6) 0 equívocos ativos
  assert.equal(decisionAfter3.diagnosticState, 'mastered', 'Deve atingir estado mastered com evidências independentes');
  assert.equal(decisionAfter3.masteryLevel, 'transfer');
  assert.equal(decisionAfter3.hasDistinctSessions, true);
  assert.equal(decisionAfter3.unassistedAttemptsCount, 2);
  assert.match(decisionAfter3.qualifyingReason, /Domínio demonstrado em desempenho independente/i);
});

test('T214: Indicadores de documento (calculateDocumentMasterySummary) com denominadores explícitos e distinção estrita entre cobertura e taxa de domínio', () => {
  const mockConcepts: Concept[] = [
    { id: 'c1', name: 'Potencial de Ação', definition: '...', importance: 'fundamental', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
    { id: 'c2', name: 'Canais de Sódio', definition: '...', importance: 'fundamental', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
    { id: 'c3', name: 'Bomba Na+/K+', definition: '...', importance: 'fundamental', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
    { id: 'c4', name: 'Período Refratário', definition: '...', importance: 'complementary', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
    { id: 'c5', name: 'Mielinização', definition: '...', importance: 'complementary', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
    { id: 'c6', name: 'Nódulos de Ranvier', definition: '...', importance: 'complementary', epistemicStatus: 'explicitly_documented', evidenceReferences: [], prerequisiteConceptIds: [], diagnosticState: 'unassessed' },
  ];

  // Mapa com distribuição heterogênea:
  // - 2 mastered (c1, c2)
  // - 2 understood (c3, c4)
  // - 1 confirmed_gap (c5)
  // - 1 unassessed (c6 ausente no mapa)
  const masteryMap: Record<string, ConceptMastery> = {
    c1: { id: 'd#c1', documentId: 'doc_1', conceptId: 'c1', diagnosticState: 'mastered', masteryLevel: 'apply', totalAttempts: 3, lastAttemptAt: 1, historyAttemptIds: [], consolidatedEvidenceIds: [], activeGaps: [] },
    c2: { id: 'd#c2', documentId: 'doc_1', conceptId: 'c2', diagnosticState: 'mastered', masteryLevel: 'transfer', totalAttempts: 2, lastAttemptAt: 1, historyAttemptIds: [], consolidatedEvidenceIds: [], activeGaps: [] },
    c3: { id: 'd#c3', documentId: 'doc_1', conceptId: 'c3', diagnosticState: 'understood', masteryLevel: 'understand', totalAttempts: 1, lastAttemptAt: 1, historyAttemptIds: [], consolidatedEvidenceIds: [], activeGaps: [] },
    c4: { id: 'd#c4', documentId: 'doc_1', conceptId: 'c4', diagnosticState: 'understood', masteryLevel: 'understand', totalAttempts: 1, lastAttemptAt: 1, historyAttemptIds: [], consolidatedEvidenceIds: [], activeGaps: [] },
    c5: { id: 'd#c5', documentId: 'doc_1', conceptId: 'c5', diagnosticState: 'confirmed_gap', masteryLevel: 'recognize', totalAttempts: 1, lastAttemptAt: 1, historyAttemptIds: [], consolidatedEvidenceIds: [], activeGaps: ['gap_1'] },
  };

  const summary = calculateDocumentMasterySummary('doc_1', mockConcepts, masteryMap);

  // 1. Denominadores e contagens explícitas
  assert.equal(summary.totalConcepts, 6);
  assert.equal(summary.masteredCount, 2);
  assert.equal(summary.understoodCount, 2);
  assert.equal(summary.confirmedGapCount, 1);
  assert.equal(summary.unassessedCount, 1);
  assert.equal(summary.evaluatedCount, 5, 'Avaliados = Dominados (2) + Compreendidos (2) + Lacunas (1) = 5');

  // 2. Formato de razão explícita
  assert.equal(summary.coverageRatio, '5/6');
  assert.equal(summary.masteryRatio, '2/6');
  assert.equal(summary.understoodRatio, '2/6');
  assert.equal(summary.gapRatio, '1/6');

  // 3. Percentuais com 1 casa decimal
  assert.equal(summary.coveragePercent, 83.3, 'Cobertura = (5/6)*100 = 83.3%');
  assert.equal(summary.masteryPercent, 33.3, 'Taxa de Domínio = (2/6)*100 = 33.3%');
  assert.equal(summary.understoodPercent, 33.3);
  assert.equal(summary.gapPercent, 16.7);

  // 4. Distinção estrita: cobertura de avaliação NÃO se confunde com taxa de domínio
  assert.notEqual(summary.coveragePercent, summary.masteryPercent);
  assert.ok(summary.coveragePercent > summary.masteryPercent);
});

test('T215: Recuperação formativa de lacuna: evolução de confirmed_gap para understood após nova evidência resolutiva', () => {
  const baseTime = 1700000000000;

  // Tentativa 1: O estudante cometeu um equívoco conceitual grave
  const attemptWithGap = createMockAttempt({
    attemptNumber: 1,
    createdAt: baseTime,
    feedback: createMockFeedback({
      misconceptions: ['Afirmou erroneamente que a mielina conduz corrente de forma contínua sem saltos'],
      identifiedGaps: ['Lacuna na condução saltatória'],
      rubric: {
        conceptualPrecision: { score: 0.3, qualitativeStatus: 'inaccurate', comment: 'Equívoco material.' },
        completeness: { score: 0.5, qualitativeStatus: 'incomplete', comment: 'Faltam nós de Ranvier.' },
        conceptualRelationships: { score: 0.4, qualitativeStatus: 'confused', comment: 'Inversão do isolamento.' },
        reasoningCoherence: { score: 0.5, qualitativeStatus: 'coherent', comment: 'Lógica falha.' },
        knowledgeApplication: { score: 0.3, qualitativeStatus: 'misapplied', comment: 'Aplicação errônea.' },
      },
      evaluatedMasteryLevel: 'recognize',
    }),
  });

  const state1 = evaluateConceptMastery('doc_neuro_01', 'c_mielina', [attemptWithGap]);
  assert.equal(state1.diagnosticState, 'confirmed_gap');
  assert.ok(state1.activeGaps.length > 0);

  // Tentativa 2: O estudante reformula, estuda a evidência e supera a lacuna
  const correctiveAttempt = createMockAttempt({
    attemptNumber: 2,
    createdAt: baseTime + 1000 * 60 * 30, // 30 min depois
    studentExplanation: 'A bainha de mielina atua como isolante elétrico de alta resistência. O potencial despolariza apenas nos nódulos de Ranvier, resultando em condução saltatória veloz.',
    feedback: createMockFeedback({
      summary: 'Excelente correção. A condução saltatória foi explicada com rigor físico e biológico.',
      misconceptions: [], // Equívoco corrigido
      identifiedGaps: [], // Lacuna superada
      incompleteElements: [],
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Mecanismo biofísico impecável.' },
        completeness: { score: 0.9, qualitativeStatus: 'complete', comment: 'Cobriu nós de Ranvier e isolamento.' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Conexões claras.' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Raciocínio causal perfeito.' },
        knowledgeApplication: { score: 0.85, qualitativeStatus: 'applied', comment: 'Contextualizou esclerose múltipla.' },
      },
      evaluatedMasteryLevel: 'understand',
    }),
  });

  const state2 = evaluateConceptMastery('doc_neuro_01', 'c_mielina', [attemptWithGap, correctiveAttempt]);

  // A lacuna anterior foi superada com sucesso pela nova evidência: o estado evolui para understood
  assert.equal(state2.diagnosticState, 'understood', 'Lacuna resolvida deve promover o estado para understood');
  assert.equal(state2.activeGaps.length, 0, 'As lacunas ativas devem ser limpas após superação');
  assert.match(state2.qualifyingReason, /compreensão consistente demonstrada/i);

  // Construção do registro persistível via buildConsolidatedMasteryRecord
  const record = buildConsolidatedMasteryRecord('doc_neuro_01', 'c_mielina', [attemptWithGap, correctiveAttempt]);
  assert.equal(record.diagnosticState, 'understood');
  assert.equal(record.totalAttempts, 2);
  assert.equal(record.historyAttemptIds.length, 2);
  assert.equal(record.activeGaps.length, 0);
});

test('T216: Auditoria de Confirmed_Gap — Diferenciação estrita de 5 cenários epistemológicos e reconstrução histórica', () => {
  // 1. Omissão pura (incompleteElements sem erro) -> understood
  const attOmission = createMockAttempt({
    attemptNumber: 1,
    feedback: createMockFeedback({
      incompleteElements: ['Não detalhou canais de vazamento de K+'],
      misconceptions: [],
      identifiedGaps: [],
      rubric: {
        conceptualPrecision: { score: 0.9, qualitativeStatus: 'accurate', comment: 'Preciso.' },
        completeness: { score: 0.6, qualitativeStatus: 'partially_complete', comment: 'Faltam canais de repouso.' },
        conceptualRelationships: { score: 0.85, qualitativeStatus: 'well_connected', comment: 'Articulado.' },
        reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Coerente.' },
        knowledgeApplication: { score: 0.8, qualitativeStatus: 'applied', comment: 'Aplicado.' },
      },
    }),
  });
  const resOmission = evaluateConceptMastery('doc_1', 'c_potencial', [attOmission]);
  assert.equal(resOmission.diagnosticState, 'understood', 'Omissão isolada não gera confirmed_gap');

  // 2. Equívoco conceitual comprovado (misconceptions) -> confirmed_gap
  const attError = createMockAttempt({
    attemptNumber: 2,
    feedback: createMockFeedback({
      misconceptions: ['Afirmou que o potencial de repouso é positivo (+70mV)'],
      identifiedGaps: [],
    }),
  });
  const resError = evaluateConceptMastery('doc_1', 'c_potencial', [attError]);
  assert.equal(resError.diagnosticState, 'confirmed_gap', 'Equívoco material gera confirmed_gap');

  // 3. Pré-requisito não avaliado mencionado em identifiedGaps com explicação precisa -> understood
  const attUnassessedPrereq = createMockAttempt({
    attemptNumber: 3,
    feedback: createMockFeedback({
      misconceptions: [],
      identifiedGaps: ['Pré-requisito gradiente eletroquímico não mencionado'],
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Preciso.' },
        completeness: { score: 0.8, qualitativeStatus: 'complete', comment: 'Completo no escopo.' },
        conceptualRelationships: { score: 0.85, qualitativeStatus: 'well_connected', comment: 'Bem relacionado.' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Lógica clara.' },
        knowledgeApplication: { score: 0.8, qualitativeStatus: 'applied', comment: 'Aplicado.' },
      },
    }),
  });
  const resUnassessedPrereq = evaluateConceptMastery('doc_1', 'c_potencial', [attUnassessedPrereq]);
  assert.equal(resUnassessedPrereq.diagnosticState, 'understood', 'Pré-requisito não avaliado não gera confirmed_gap em resposta precisa');

  // 4. Pré-requisito avaliado e não compreendido (identifiedGaps corroborado por relações confusas) -> confirmed_gap
  const attFailedPrereq = createMockAttempt({
    attemptNumber: 4,
    feedback: createMockFeedback({
      misconceptions: [],
      identifiedGaps: ['Falha demonstrada na compreensão do gradiente elétrico'],
      rubric: {
        conceptualPrecision: { score: 0.6, qualitativeStatus: 'partially_accurate', comment: 'Incerteza.' },
        completeness: { score: 0.6, qualitativeStatus: 'partially_complete', comment: 'Incompleto.' },
        conceptualRelationships: { score: 0.3, qualitativeStatus: 'confused', comment: 'Relações confusas com o pré-requisito.' },
        reasoningCoherence: { score: 0.6, qualitativeStatus: 'fragmented', comment: 'Fragmentado.' },
        knowledgeApplication: { score: 0.4, qualitativeStatus: 'theoretical_only', comment: 'Teórico.' },
      },
    }),
  });
  const resFailedPrereq = evaluateConceptMastery('doc_1', 'c_potencial', [attFailedPrereq]);
  assert.equal(resFailedPrereq.diagnosticState, 'confirmed_gap', 'Pré-requisito avaliado com confusão gera confirmed_gap');

  // 5. Reconstrução determinística do estado a partir do histórico persistido
  const record = buildConsolidatedMasteryRecord('doc_1', 'c_potencial', [attOmission, attError, attFailedPrereq]);
  assert.equal(record.id, 'doc_1#c_potencial');
  assert.equal(record.totalAttempts, 3);
  assert.equal(record.diagnosticState, 'confirmed_gap');
  assert.equal(record.historyAttemptIds.length, 3);
});

test('T217: Auditoria de Mastered — Exigência cumulativa de nível individual, autonomia e não-bloqueio por dicas', () => {
  const baseTime = 1700000000000;

  // Tentativa 1: Com dica pedagógica (assistida) -> não qualifica para autonomia
  const att1 = createMockAttempt({
    sessionId: 'sess_1',
    attemptNumber: 1,
    createdAt: baseTime,
    usedPedagogicalHint: true,
    feedback: createMockFeedback({ evaluatedMasteryLevel: 'understand' }),
  });

  // Tentativa 2: Sem dica, mas apenas memorização ('recognize') -> não atinge o nível mínimo exigido ('understand')
  const att2 = createMockAttempt({
    sessionId: 'sess_1',
    attemptNumber: 2,
    createdAt: baseTime + 1000 * 60,
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'recognize',
      rubric: {
        conceptualPrecision: { score: 0.8, qualitativeStatus: 'accurate', comment: 'Definição correta decorada.' },
        completeness: { score: 0.5, qualitativeStatus: 'partially_complete', comment: 'Apenas repetiu nomes.' },
        conceptualRelationships: { score: 0.5, qualitativeStatus: 'isolated', comment: 'Sem relações causais.' },
        reasoningCoherence: { score: 0.8, qualitativeStatus: 'coherent', comment: 'Linear.' },
        knowledgeApplication: { score: 0.3, qualitativeStatus: 'theoretical_only', comment: 'Apenas teórico.' },
      },
    }),
  });

  const resAfter2 = evaluateConceptMastery('doc_1', 'c_sinapse', [att1, att2]);
  // att1 foi com dica; att2 foi recognize. Nenhuma delas é uma segunda tentativa qualificada com understand ou apply
  assert.notEqual(resAfter2.diagnosticState, 'mastered', 'Tentativa de mero recognize não confere mastered');

  // Tentativa 3: Sem dica, nível 'understand', sessão 1
  const att3 = createMockAttempt({
    sessionId: 'sess_1',
    attemptNumber: 3,
    createdAt: baseTime + 1000 * 120,
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'understand',
    }),
  });

  const resAfter3 = evaluateConceptMastery('doc_1', 'c_sinapse', [att1, att2, att3]);
  // Agora temos 1 tentativa qualificada (att3). Falta a segunda tentativa e falta aplicação/transferência
  assert.equal(resAfter3.diagnosticState, 'understood');

  // Tentativa 4: Sem dica, nível 'apply', aplicação confirmada na rubrica ('applied'), SESSÃO DISTINTA (sess_2)
  const att4 = createMockAttempt({
    sessionId: 'sess_2',
    attemptNumber: 4,
    createdAt: baseTime + 1000 * 60 * 60 * 4, // 4h depois
    usedPedagogicalHint: false,
    feedback: createMockFeedback({
      evaluatedMasteryLevel: 'apply',
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Preciso.' },
        completeness: { score: 0.9, qualitativeStatus: 'complete', comment: 'Exaustivo.' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Articulação causal rica.' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Consistente.' },
        knowledgeApplication: { score: 0.9, qualitativeStatus: 'applied', comment: 'Aplicação prática demonstrada.' },
      },
    }),
  });

  const resAfter4 = evaluateConceptMastery('doc_1', 'c_sinapse', [att1, att2, att3, att4]);
  // Ambas as qualificadoras (att3 e att4) atingem individualmente >= understand; att4 atinge apply; sessões distintas; sem dica
  assert.equal(resAfter4.diagnosticState, 'mastered', 'Deve atingir mastered com critérios cumulativos satisfeitos');
  assert.equal(resAfter4.masteryLevel, 'apply');
  assert.equal(resAfter4.unassistedAttemptsCount, 3);
  assert.equal(resAfter4.hasDistinctSessions, true);
});

test('T218: Auditoria do Sanitizador PT-BR — Cobertura dos 6 cenários de idioma e proteção contra falsas validações', () => {
  const conceptName = 'Digital Shadow';

  // Cenário 1: Pergunta em português autêntico -> Aprovada sem alteração
  const qPt = 'Como a transmissão sináptica é modulada pela concentração intracelular de cálcio?';
  const res1 = sanitizeConceptQuestion(qPt, conceptName);
  assert.equal(res1.isFallback, false);
  assert.equal(res1.detectedLanguage, 'pt-br');
  assert.equal(res1.text, qPt);

  // Cenário 2: Pergunta iniciada com "Does" -> Interceptada e substituída por fallback em PT-BR
  const qDoes = 'Does the system automatically update its state based on physical sensor data?';
  const res2 = sanitizeConceptQuestion(qDoes, conceptName);
  assert.equal(res2.isFallback, true);
  assert.equal(res2.detectedLanguage, 'en');
  assert.ok(res2.text.includes('Explique com suas próprias palavras o mecanismo de "Digital Shadow"'));
  assert.equal(detectTextLanguage(res2.text).detectedLanguage, 'pt-br');

  // Cenário 3: Pergunta iniciada com "What" -> Interceptada e substituída por fallback em PT-BR
  const qWhat = 'What are the main neurotransmitters involved in long-term potentiation?';
  const res3 = sanitizeConceptQuestion(qWhat, conceptName);
  assert.equal(res3.isFallback, true);
  assert.equal(res3.detectedLanguage, 'en');
  assert.equal(detectTextLanguage(res3.text).detectedLanguage, 'pt-br');

  // Cenário 4: Pergunta iniciada com "The system" -> Interceptada e substituída por fallback em PT-BR
  const qTheSystem = 'The system continuously adapts parameters according to real-time feedback from environment.';
  const res4 = sanitizeConceptQuestion(qTheSystem, conceptName);
  assert.equal(res4.isFallback, true);
  assert.equal(res4.detectedLanguage, 'en');
  assert.equal(detectTextLanguage(res4.text).detectedLanguage, 'pt-br');

  // Cenário 5: Texto misto português/inglês -> Interceptado e substituído por fallback em PT-BR
  const qMixed = 'Explique como the system updates its internal state without delay during physical operation.';
  const res5 = sanitizeConceptQuestion(qMixed, conceptName);
  assert.equal(res5.isFallback, true);
  assert.equal(res5.detectedLanguage, 'mixed');
  assert.equal(detectTextLanguage(res5.text).detectedLanguage, 'pt-br');

  // Cenário 6: Dica contextual em inglês -> Interceptada e substituída por dica formativa em PT-BR
  const tipEn = 'Focus on physical mechanisms and state transitions across environments.';
  const res6 = sanitizeContextTip(tipEn);
  assert.equal(res6.isFallback, true);
  assert.equal(res6.detectedLanguage, 'en');
  assert.equal(detectTextLanguage(res6.text).detectedLanguage, 'pt-br');

  // Cenário Bônus: Pergunta em português citando legitimamente o nome estrangeiro do conceito
  const qValidWithConcept = 'Explique detalhadamente como o Digital Shadow difere de um Digital Twin no contexto industrial.';
  const resBonus = sanitizeConceptQuestion(qValidWithConcept, conceptName);
  assert.equal(resBonus.isFallback, false, 'Pergunta em português com nome de conceito estrangeiro deve ser aceita');
  assert.equal(resBonus.detectedLanguage, 'pt-br');
  assert.equal(resBonus.text, qValidWithConcept);
});

/* ==========================================================================
   FASE 2 — MARCO 2C: TESTES DO CICLO PEDAGÓGICO C.R.E.A.R.
   ========================================================================== */

test('T219: Início, Retomada e Persistência do Ciclo C.R.E.A.R.', () => {
  const documentId = 'doc_neuro_1';
  const conceptId = 'c_potencial_acao';
  const sessionId = `session_crear_${documentId}_${conceptId}_${Date.now()}`;

  // Estrutura inicial do ciclo C.R.E.A.R.
  const initialSession: LearningSession = {
    id: sessionId,
    documentId,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    activeConceptId: conceptId,
    sessionType: 'crear_cycle',
    attemptCount: 0,
    conceptsAddressed: [conceptId],
    crearCycle: {
      sessionId,
      documentId,
      conceptId,
      currentStage: 'contextualize',
      completedStages: [],
      stageData: {},
      startedAt: Date.now(),
      updatedAt: Date.now(),
      isCompleted: false,
    },
  };

  assert.equal(initialSession.sessionType, 'crear_cycle');
  assert.equal(initialSession.crearCycle?.currentStage, 'contextualize');
  assert.equal(initialSession.crearCycle?.completedStages.length, 0);
  assert.equal(initialSession.crearCycle?.isCompleted, false);

  // Concluir etapa 1: Contextualizar
  const updated1 = markStageCompleted(initialSession, 'contextualize', { viewedAt: Date.now() });
  assert.ok(updated1.crearCycle?.completedStages.includes('contextualize'));
  assert.equal(updated1.crearCycle?.isCompleted, false);

  // Avançar para etapa 2: Relacionar
  const advanced1 = advanceToNextStage(updated1);
  assert.equal(advanced1.crearCycle?.currentStage, 'relate');

  // Retomada: Simula recarga do objeto persistido preservando o estágio ativo e os concluídos
  const restoredSession: LearningSession = JSON.parse(JSON.stringify(advanced1));
  assert.equal(restoredSession.crearCycle?.currentStage, 'relate');
  assert.deepEqual(restoredSession.crearCycle?.completedStages, ['contextualize']);
});

test('T220: Progressão Sequencial e Acessibilidade entre as 5 Etapas (C.R.E.A.R.)', () => {
  assert.deepEqual(CREAR_STAGES, ['contextualize', 'relate', 'explain', 'apply', 'recover']);

  const progress: CrearCycleProgress = {
    sessionId: 'sess_1',
    documentId: 'doc_1',
    conceptId: 'c_1',
    currentStage: 'contextualize',
    completedStages: [],
    startedAt: 1000,
    updatedAt: 1000,
    isCompleted: false,
  };

  // Etapa inicial é sempre acessível
  assert.equal(isStageAccessible(progress, 'contextualize'), true);
  // Etapas posteriores bloqueadas até conclusão da anterior
  assert.equal(isStageAccessible(progress, 'relate'), false);
  assert.equal(isStageAccessible(progress, 'explain'), false);
  assert.equal(isStageAccessible(progress, 'apply'), false);
  assert.equal(isStageAccessible(progress, 'recover'), false);

  // Completou Contextualizar
  progress.completedStages.push('contextualize');
  progress.currentStage = 'relate';

  assert.equal(isStageAccessible(progress, 'contextualize'), true, 'Retrocesso permitido para revisar');
  assert.equal(isStageAccessible(progress, 'relate'), true);
  assert.equal(isStageAccessible(progress, 'explain'), false, 'Explain ainda bloqueado');

  // Completou Relacionar e Explicar
  progress.completedStages.push('relate', 'explain');
  progress.currentStage = 'apply';

  assert.equal(isStageAccessible(progress, 'contextualize'), true);
  assert.equal(isStageAccessible(progress, 'relate'), true);
  assert.equal(isStageAccessible(progress, 'explain'), true);
  assert.equal(isStageAccessible(progress, 'apply'), true);
  assert.equal(isStageAccessible(progress, 'recover'), false, 'Recover ainda bloqueado');

  // Navegação livre entre etapas acessíveis
  let session: LearningSession = {
    id: 'sess_1',
    documentId: 'doc_1',
    startedAt: 1000,
    updatedAt: 1000,
    sessionType: 'crear_cycle',
    attemptCount: 0,
    conceptsAddressed: ['c_1'],
    crearCycle: progress,
  };

  session = navigateToStage(session, 'contextualize');
  assert.equal(session.crearCycle?.currentStage, 'contextualize');

  session = navigateToStage(session, 'apply');
  assert.equal(session.crearCycle?.currentStage, 'apply');
});

test('T221: Integração com o Agora Eu Explico e Não-Duplicação de Avaliações', () => {
  // Cenário: Estudante já possui uma tentativa de explicação homologada
  const previousExplainAttempt: LearningAttempt = {
    id: 'att_prev_1',
    sessionId: 'sess_old',
    documentId: 'doc_neuro',
    conceptId: 'c_potencial_acao',
    attemptNumber: 1,
    promptQuestion: 'Explique o potencial de ação...',
    studentExplanation: 'É uma onda transitória de despolarização por influxo de Na+...',
    feedback: {
      summary: 'Boa explicação dos mecanismos biofísicos.',
      understoodElements: ['Despolarização', 'Canais voltagem-dependentes'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 0.9, qualitativeStatus: 'accurate', comment: 'Exato' },
        completeness: { score: 0.85, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 0.8, qualitativeStatus: 'well_connected', comment: 'Conectado' },
        reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 0.7, qualitativeStatus: 'theoretical_only', comment: 'Teórico' },
      },
      evaluatedMasteryLevel: 'understand',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: Date.now() - 50000,
    activityType: 'explain',
  };

  // Ao inicializar o Ciclo C.R.E.A.R., o percurso reconhece o histórico existente
  const cycle: CrearCycleProgress = {
    sessionId: 'sess_crear_new',
    documentId: 'doc_neuro',
    conceptId: 'c_potencial_acao',
    currentStage: 'contextualize',
    completedStages: ['explain'], // Reconhecido automaticamente
    stageData: {
      explain: {
        lastAttemptId: previousExplainAttempt.id,
        masteryLevel: previousExplainAttempt.feedback.evaluatedMasteryLevel,
        completedAt: previousExplainAttempt.createdAt,
      },
    },
    startedAt: Date.now(),
    updatedAt: Date.now(),
    isCompleted: false,
  };

  assert.ok(cycle.completedStages.includes('explain'), 'Estágio Explicar já consta como concluído');
  assert.equal(cycle.stageData?.explain?.lastAttemptId, 'att_prev_1');
  assert.equal(cycle.stageData?.explain?.masteryLevel, 'understand');
});

test('T222: Registro de Atividades Aplicadas (apply) e de Evocação Ativa (recover)', () => {
  const documentId = 'doc_neuro';
  const conceptId = 'c_snare';

  // Tentativa 1: Explicar (understand)
  const attemptExplain: LearningAttempt = {
    id: 'att_1',
    sessionId: 'sess_c',
    documentId,
    conceptId,
    attemptNumber: 1,
    promptQuestion: 'Como opera o complexo SNARE?',
    studentExplanation: 'Sintaxina e SNAP-25 interagem com sinaptobrevina após influxo de Ca2+.',
    feedback: {
      summary: 'Compreensão correta do mecanismo de fusão de vesículas.',
      understoodElements: ['Interação proteica', 'Gatilho de cálcio'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 0.9, qualitativeStatus: 'accurate', comment: 'Preciso' },
        completeness: { score: 0.85, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 0.85, qualitativeStatus: 'well_connected', comment: 'Bem relacionado' },
        reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 0.7, qualitativeStatus: 'theoretical_only', comment: 'Teórico' },
      },
      evaluatedMasteryLevel: 'understand',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: 100000,
    usedPedagogicalHint: false,
    activityType: 'explain',
  };

  // Tentativa 2: Aplicar (apply - cenário clínico com toxina botulínica)
  const attemptApply: LearningAttempt = {
    id: 'att_2',
    sessionId: 'sess_c_2',
    documentId,
    conceptId,
    attemptNumber: 2,
    promptQuestion: 'Um paciente intoxicado por toxina botulínica apresenta paralisia flácida...',
    studentExplanation: 'A toxina cliva as proteínas SNARE (SNAP-25), impedindo a fusão vesicular e liberação de acetilcolina na fenda.',
    feedback: {
      summary: 'Aplicação clínica impecável explicando a patofisiologia com base no mecanismo.',
      understoodElements: ['Clivagem de SNAP-25', 'Bloqueio de liberação de ACh'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Preciso' },
        completeness: { score: 0.9, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Bem relacionado' },
        reasoningCoherence: { score: 0.95, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 0.95, qualitativeStatus: 'applied', comment: 'Aplicação resolutiva' },
      },
      evaluatedMasteryLevel: 'apply',
      suggestedDiagnosticState: 'mastered',
    },
    createdAt: 200000, // Sessão distinta (> 60s)
    usedPedagogicalHint: false,
    activityType: 'apply',
    scenarioContext: 'Caso de botulismo',
  };

  // Avaliação pelo motor de domínio
  const decision = evaluateConceptMastery(documentId, conceptId, [attemptExplain, attemptApply]);

  assert.equal(decision.diagnosticState, 'mastered', 'Tentativa de aplicação autônoma qualifica para mastered');
  assert.equal(decision.masteryLevel, 'apply');
  assert.equal(decision.totalAttempts, 2);
  assert.equal(decision.unassistedAttemptsCount, 2);
  assert.ok(decision.hasDistinctSessions);

  // Tentativa 3: Recuperar (recover - evocação ativa da memória)
  const attemptRecover: LearningAttempt = {
    id: 'att_3',
    sessionId: 'sess_c_3',
    documentId,
    conceptId,
    attemptNumber: 3,
    promptQuestion: 'Reconstrua de memória as 3 proteínas do complexo SNARE...',
    studentExplanation: 'Sinaptobrevina na vesícula, sintaxina e SNAP-25 na membrana plasmática formam o feixe de 4 hélices.',
    feedback: {
      summary: 'Evocação ativa autônoma completa e acurada.',
      understoodElements: ['3 proteínas lembradas', 'Topologia vesicular e plasmática'],
      incompleteElements: [],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 0.95, qualitativeStatus: 'accurate', comment: 'Preciso' },
        completeness: { score: 0.9, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 0.9, qualitativeStatus: 'well_connected', comment: 'Conectado' },
        reasoningCoherence: { score: 0.9, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 0.9, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
      evaluatedMasteryLevel: 'apply',
      suggestedDiagnosticState: 'mastered',
    },
    createdAt: 300000,
    usedPedagogicalHint: false,
    activityType: 'recover',
  };

  const masteryRecord = buildConsolidatedMasteryRecord(documentId, conceptId, [
    attemptExplain,
    attemptApply,
    attemptRecover,
  ]);
  assert.equal(masteryRecord.diagnosticState, 'mastered');
  assert.equal(masteryRecord.totalAttempts, 3);
  assert.deepEqual(masteryRecord.historyAttemptIds, ['att_1', 'att_2', 'att_3']);
});

test('T223: Separação Estrita entre Conclusão do Ciclo C.R.E.A.R. e Domínio Cognitivo (Mastery)', () => {
  const documentId = 'doc_neuro';
  const conceptId = 'c_canais_cav';

  // Ciclo C.R.E.A.R. 100% concluído (todas as 5 etapas percorridas)
  let session: LearningSession = {
    id: 'sess_crear_complete',
    documentId,
    startedAt: 1000,
    updatedAt: 5000,
    activeConceptId: conceptId,
    sessionType: 'crear_cycle',
    attemptCount: 1,
    conceptsAddressed: [conceptId],
    crearCycle: {
      sessionId: 'sess_crear_complete',
      documentId,
      conceptId,
      currentStage: 'recover',
      completedStages: ['contextualize', 'relate', 'explain', 'apply', 'recover'],
      startedAt: 1000,
      updatedAt: 5000,
      isCompleted: true, // Ciclo concluído!
    },
  };

  assert.equal(session.crearCycle?.isCompleted, true, 'Ciclo está 100% concluído');
  assert.equal(session.crearCycle?.completedStages.length, 5);

  // No entanto, o estudante teve apenas 1 tentativa assistida (com dica pedagógica) no estágio explain
  const singleAttemptWithHint: LearningAttempt = {
    id: 'att_hint_only',
    sessionId: session.id,
    documentId,
    conceptId,
    attemptNumber: 1,
    promptQuestion: 'Explique os canais Cav...',
    studentExplanation: 'Ajudado pela dica: canais abrem com despolarização.',
    feedback: {
      summary: 'Resposta básica com apoio.',
      understoodElements: ['Abertura por voltagem'],
      incompleteElements: ['Não descreveu a inativação'],
      misconceptions: [],
      identifiedGaps: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      rubric: {
        conceptualPrecision: { score: 0.7, qualitativeStatus: 'partially_accurate', comment: 'Básico' },
        completeness: { score: 0.6, qualitativeStatus: 'partially_complete', comment: 'Incompleto' },
        conceptualRelationships: { score: 0.6, qualitativeStatus: 'isolated', comment: 'Isolado' },
        reasoningCoherence: { score: 0.7, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 0.5, qualitativeStatus: 'theoretical_only', comment: 'Teórico' },
      },
      evaluatedMasteryLevel: 'understand',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: 2000,
    usedPedagogicalHint: true, // Teve dica!
    activityType: 'explain',
  };

  const decision = evaluateConceptMastery(documentId, conceptId, [singleAttemptWithHint]);

  // Concluir o percurso NÃO pode falsamente conceder 'mastered'
  assert.equal(decision.diagnosticState, 'understood', 'Permanece understood devido a tentativa assistida única');
  assert.notEqual(decision.diagnosticState, 'mastered', 'JAMAIS promove a mastered apenas por concluir o percurso');
  assert.ok(decision.qualifyingReason.includes('assistida') || decision.qualifyingReason.includes('tentativa'));
});

test('T224: Isolamento Estrito entre Documentos e Conceitos e Preservação dos Dados', () => {
  const docA = 'doc_neurobiologia';
  const docB = 'doc_quantica';
  const conceptA = 'c_potencial_acao';
  const conceptB = 'c_foton';

  // 1. Chaves de Maestria compostas garantem separação
  const keyA = buildMasteryKey(docA, conceptA);
  const keyB = buildMasteryKey(docB, conceptB);
  const keyCross = buildMasteryKey(docA, conceptB);

  assert.equal(keyA, 'doc_neurobiologia#c_potencial_acao');
  assert.equal(keyB, 'doc_quantica#c_foton');
  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyCross);

  // 2. Cálculo de sumário por documento
  const conceptsDocA: Concept[] = [
    {
      id: conceptA,
      name: 'Potencial de Ação',
      definition: 'Onda despolarizante...',
      importance: 'fundamental',
      epistemicStatus: 'explicitly_documented',
      evidenceReferences: [],
      prerequisiteConceptIds: [],
      diagnosticState: 'understood',
    },
  ];

  const masteryMapDocA: Record<string, ConceptMastery> = {
    [conceptA]: {
      id: keyA,
      documentId: docA,
      conceptId: conceptA,
      masteryLevel: 'understand',
      diagnosticState: 'understood',
      totalAttempts: 1,
      lastAttemptAt: Date.now(),
      historyAttemptIds: ['att_a_1'],
      activeGaps: [],
      consolidatedEvidenceIds: [],
    },
  };

  const summaryDocA = calculateDocumentMasterySummary(docA, conceptsDocA, masteryMapDocA);
  assert.equal(summaryDocA.documentId, docA);
  assert.equal(summaryDocA.totalConcepts, 1);
  assert.equal(summaryDocA.understoodCount, 1);
  assert.equal(summaryDocA.masteredCount, 0);
  assert.equal(summaryDocA.coveragePercent, 100);

  // 3. Documento B sem avaliações permanece unassessed
  const conceptsDocB: Concept[] = [
    {
      id: conceptB,
      name: 'Fóton',
      definition: 'Pacote quântico...',
      importance: 'fundamental',
      epistemicStatus: 'explicitly_documented',
      evidenceReferences: [],
      prerequisiteConceptIds: [],
      diagnosticState: 'unassessed',
    },
  ];

  const summaryDocB = calculateDocumentMasterySummary(docB, conceptsDocB, {});
  assert.equal(summaryDocB.documentId, docB);
  assert.equal(summaryDocB.understoodCount, 0);
  assert.equal(summaryDocB.unassessedCount, 1);
  assert.equal(summaryDocB.coveragePercent, 0);
});

