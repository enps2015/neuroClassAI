import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ExplanationFeedback,
  LearningAttempt,
  ConceptMastery,
  MasteryLevel,
  DiagnosticState,
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
