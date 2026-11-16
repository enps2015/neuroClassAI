import type {
  Concept,
  ConceptMastery,
  DiagnosticState,
  ExplanationFeedback,
  LearningAttempt,
  MasteryLevel,
} from '../../types';
import { buildMasteryKey } from '../persistence/indexedDb';

/**
 * Resumo estatístico e analítico do domínio cognitivo de um documento.
 * Apresenta denominadores explícitos e diferencia cobertura de avaliação de consolidação de domínio.
 */
export interface DocumentMasterySummary {
  documentId: string;
  totalConcepts: number;
  masteredCount: number;
  understoodCount: number;
  confirmedGapCount: number;
  unassessedCount: number;
  evaluatedCount: number;
  coveragePercent: number; // Percentual de conceitos já avaliados: (evaluatedCount / totalConcepts) * 100
  masteryPercent: number;  // Percentual de conceitos efetivamente dominados: (masteredCount / totalConcepts) * 100
  understoodPercent: number;
  gapPercent: number;
  coverageRatio: string;   // Ex: "3/5"
  masteryRatio: string;    // Ex: "1/5"
  understoodRatio: string; // Ex: "2/5"
  gapRatio: string;        // Ex: "0/5"
}

/**
 * Decisão determinística de progressão cognitiva calculada a partir do histórico de tentativas.
 */
export interface MasteryProgressionDecision {
  diagnosticState: DiagnosticState;
  masteryLevel: MasteryLevel;
  activeGaps: string[];
  consolidatedEvidenceIds: string[];
  totalAttempts: number;
  unassistedAttemptsCount: number;
  hasDistinctSessions: boolean;
  qualifyingReason: string;
}

/**
 * Ordem hierárquica dos níveis cognitivos de aprendizagem.
 */
const MASTERY_LEVEL_ORDER: Record<MasteryLevel, number> = {
  recognize: 1,
  understand: 2,
  apply: 3,
  transfer: 4,
};

/**
 * Avalia se o nível A é maior ou igual ao nível B.
 */
export function isLevelGreaterOrEqual(levelA: MasteryLevel, levelB: MasteryLevel): boolean {
  return MASTERY_LEVEL_ORDER[levelA] >= MASTERY_LEVEL_ORDER[levelB];
}

/**
 * MOTOR DETERMINÍSTICO DE CONSOLIDAÇÃO DE DOMÍNIO (MARCO 2B)
 *
 * Avalia o histórico longitudinal completo de tentativas de um conceito
 * e consolida seu estado diagnóstico e nível cognitivo acumulado, sem depender
 * de decisões arbitrárias da IA para a classificação final.
 *
 * Regras Estritas:
 * 1. UNASSESSED: Ausência de tentativas. Ausência de evidência != Desconhecimento.
 * 2. CONFIRMED_GAP: Apenas com erro conceitual explícito (misconceptions) ou quebra crítica de pré-requisito.
 *    Omissões (incompleteElements) NÃO são classificadas como lacuna por si sós.
 * 3. UNDERSTOOD: Pelo menos uma tentativa com precisão e causalidade sólida, sem equívocos ativos.
 * 4. MASTERED: Mínimo de 2 tentativas consistentes, sem dica pedagógica, em sessões distintas, com aplicação/transferência.
 */
export function evaluateConceptMastery(
  documentId: string,
  conceptId: string,
  attempts: LearningAttempt[]
): MasteryProgressionDecision {
  // 1. REGRA UNASSESSED: Se não houver tentativas válidas
  if (!attempts || attempts.length === 0) {
    return {
      diagnosticState: 'unassessed',
      masteryLevel: 'recognize',
      activeGaps: [],
      consolidatedEvidenceIds: [],
      totalAttempts: 0,
      unassistedAttemptsCount: 0,
      hasDistinctSessions: false,
      qualifyingReason: 'Conceito ainda não avaliado. Nenhuma tentativa registrada para este conceito.',
    };
  }

  // Ordenar cronologicamente as tentativas (da mais antiga para a mais recente)
  const sortedAttempts = [...attempts].sort((a, b) => a.createdAt - b.createdAt);
  const totalAttempts = sortedAttempts.length;
  const latestAttempt = sortedAttempts[sortedAttempts.length - 1];
  const latestFeedback = latestAttempt.feedback;

  // Coletar evidências consolidadas acumuladas em todas as tentativas
  const allEvidenceIds = new Set<string>();
  sortedAttempts.forEach(att => {
    if (att.feedback?.groundingEvidences) {
      att.feedback.groundingEvidences.forEach(ev => allEvidenceIds.add(ev.id));
    }
  });

  // Identificar sessões distintas
  const sessionIds = new Set<string>(sortedAttempts.map(a => a.sessionId).filter(Boolean));
  // Considera sessões distintas se houver mais de um sessionId OU se houver intervalo de tempo relevante (> 60s)
  const hasDistinctSessions =
    sessionIds.size > 1 ||
    (sortedAttempts.length > 1 &&
      sortedAttempts[sortedAttempts.length - 1].createdAt - sortedAttempts[0].createdAt > 60000);

  // Contagem de tentativas autônomas (realizadas sem apoio pedagógico de dica)
  const unassistedAttempts = sortedAttempts.filter(a => a.usedPedagogicalHint === false);
  const unassistedAttemptsCount = unassistedAttempts.length;

  // Analisar presença de equívocos conceituais concretos na tentativa mais recente
  const hasActiveMisconceptions = Boolean(
    latestFeedback.misconceptions && latestFeedback.misconceptions.length > 0
  );

  const isContradictory =
    latestFeedback.rubric?.reasoningCoherence?.qualitativeStatus === 'contradictory';

  const isAccurateInprecision =
    latestFeedback.rubric?.conceptualPrecision?.qualitativeStatus === 'inaccurate';

  const isRelationshipsConfused =
    latestFeedback.rubric?.conceptualRelationships?.qualitativeStatus === 'confused';

  // REGRA DE GOVERNANÇA PEDAGÓGICA (MISSÃO 2B.2 — FECHAMENTO DO MARCO 2B):
  // 1. Equívocos conceituais materiais comprovados (misconceptions) continuam justificando confirmed_gap.
  // 2. Contradições lógicas comprovadas no raciocínio causal continuam justificando confirmed_gap.
  // 3. Imprecisão conceitual severa (inaccurate) continua justificando confirmed_gap.
  // 4. Para pré-requisitos: NÃO permitir que identifiedGaps combinado com qualquer sinal genérico
  //    de dificuldade (como 'partially_accurate' ou 'fragmented') produza automaticamente confirmed_gap.
  //    Exige-se evidência específica e rastreável de que o pré-requisito foi efetivamente avaliado
  //    e não compreendido, demonstrada por relações conceituais confusas ('confused') na rubrica.
  // 5. Omissões (incompleteElements) e pré-requisitos não avaliados NUNCA são classificados como desconhecimento.
  //    Quando não houver evidência suficiente, a lacuna NÃO é confirmada.
  const hasEvaluatedAndBrokenPrerequisite = Boolean(
    latestFeedback.identifiedGaps &&
    latestFeedback.identifiedGaps.length > 0 &&
    isRelationshipsConfused
  );

  const isConfirmedGap =
    hasActiveMisconceptions ||
    isContradictory ||
    isAccurateInprecision ||
    hasEvaluatedAndBrokenPrerequisite;

  // Determinar o nível mais alto demonstrado com solidez em tentativas sem equívocos
  let highestDemonstratedLevel: MasteryLevel = 'recognize';
  sortedAttempts.forEach(att => {
    const fb = att.feedback;
    const hadNoMisconceptions = !fb.misconceptions || fb.misconceptions.length === 0;
    const isPrecise = fb.rubric?.conceptualPrecision?.qualitativeStatus !== 'inaccurate';

    if (hadNoMisconceptions && isPrecise && fb.evaluatedMasteryLevel) {
      if (isLevelGreaterOrEqual(fb.evaluatedMasteryLevel, highestDemonstratedLevel)) {
        highestDemonstratedLevel = fb.evaluatedMasteryLevel;
      }
    }
  });

  // 2. REGRA CONFIRMED_GAP:
  // Somente se houver erro conceitual material, contradição grave ou falha confirmada em pré-requisito
  if (isConfirmedGap) {
    const activeGaps = [
      ...(latestFeedback.identifiedGaps || []),
      ...(latestFeedback.misconceptions || []),
    ];

    return {
      diagnosticState: 'confirmed_gap',
      masteryLevel: highestDemonstratedLevel,
      activeGaps: activeGaps.length > 0 ? Array.from(new Set(activeGaps)) : ['Inconsistência conceitual observada na última explicação'],
      consolidatedEvidenceIds: Array.from(allEvidenceIds),
      totalAttempts,
      unassistedAttemptsCount,
      hasDistinctSessions,
      qualifyingReason: 'Lacuna formativa confirmada por equívoco material ou contradição na explicação mais recente.',
    };
  }

  // 3. REGRA MASTERED (DOMINADO):
  // Exige rigor cumulativo em critérios simultâneos:
  const isLatestUnassisted = latestAttempt.usedPedagogicalHint === false;

  // Tentativas autônomas qualificadas:
  // 1. Realizadas sem dica (autonomia);
  // 2. Sem equívocos materiais ativos;
  // 3. Precisão não-inprecisa e raciocínio não-contraditório;
  // 4. Atingem individualmente pelo menos o nível mínimo 'understand' (compreensão causal demonstrada).
  const qualifyingUnassisted = unassistedAttempts.filter(a => {
    const fb = a.feedback;
    const noMisconceptions = !fb.misconceptions || fb.misconceptions.length === 0;
    const isPrecise = fb.rubric?.conceptualPrecision?.qualitativeStatus !== 'inaccurate';
    const isCoherent = fb.rubric?.reasoningCoherence?.qualitativeStatus !== 'contradictory';
    const level = fb.evaluatedMasteryLevel || 'recognize';
    const reachesMinLevel = isLevelGreaterOrEqual(level, 'understand');

    return noMisconceptions && isPrecise && isCoherent && reachesMinLevel;
  });

  // Pelo menos uma tentativa qualificada deve demonstrar aplicação prática ou transferência contextualizada
  const hasQualifyingApplicationOrTransfer = qualifyingUnassisted.some(a => {
    const fb = a.feedback;
    const level = fb.evaluatedMasteryLevel || 'recognize';
    const hasHighLevel = isLevelGreaterOrEqual(level, 'apply');
    const isAppliedInRubric = fb.rubric?.knowledgeApplication?.qualitativeStatus === 'applied';
    return hasHighLevel || isAppliedInRubric;
  });

  // Espaçamento temporal mínimo operacional ou sessões distintas entre tentativas qualificadas.
  // NOTA METODOLÓGICA (MISSÃO 2B.2): Este intervalo evita repetição mecânica em eco imediato,
  // mas NÃO é apresentado como evidência científica de consolidação de memória de longo prazo.
  const qualifyingSessionIds = new Set(qualifyingUnassisted.map(a => a.sessionId).filter(Boolean));
  const hasValidSpacingOrSessions =
    qualifyingSessionIds.size > 1 ||
    (qualifyingUnassisted.length >= 2 &&
      qualifyingUnassisted[qualifyingUnassisted.length - 1].createdAt - qualifyingUnassisted[0].createdAt >= 60000);

  const canBeMastered =
    totalAttempts >= 2 &&
    isLatestUnassisted &&
    qualifyingUnassisted.length >= 2 &&
    hasValidSpacingOrSessions &&
    hasQualifyingApplicationOrTransfer &&
    !isConfirmedGap;

  if (canBeMastered) {
    return {
      diagnosticState: 'mastered',
      masteryLevel: isLevelGreaterOrEqual(highestDemonstratedLevel, 'apply') ? highestDemonstratedLevel : 'apply',
      activeGaps: [],
      consolidatedEvidenceIds: Array.from(allEvidenceIds),
      totalAttempts,
      unassistedAttemptsCount,
      hasDistinctSessions: true,
      qualifyingReason: 'Domínio demonstrado em desempenho independente consistente com aplicação prática. Não comprova retenção de longo prazo.',
    };
  }

  // 4. REGRA UNDERSTOOD (COMPREENDIDO):
  // Demonstrou compreensão causal sólida em pelo menos uma tentativa sem equívocos
  // Verifica se a resposta não foi puramente superficial (omissão quase total)
  const isPurelyRecognizeOnly =
    latestFeedback.evaluatedMasteryLevel === 'recognize' &&
    latestFeedback.rubric?.completeness?.qualitativeStatus === 'incomplete' &&
    (!latestFeedback.understoodElements || latestFeedback.understoodElements.length === 0);

  if (isPurelyRecognizeOnly) {
    return {
      diagnosticState: 'unassessed', // Incompleto demais para compreensão, mas sem equívoco conceitual
      masteryLevel: 'recognize',
      activeGaps: [],
      consolidatedEvidenceIds: Array.from(allEvidenceIds),
      totalAttempts,
      unassistedAttemptsCount,
      hasDistinctSessions,
      qualifyingReason: 'Explicação muito sucinta com omissão dos mecanismos fundamentais. Não constitui erro conceitual nem compreensão suficiente.',
    };
  }

  // Compreensão satisfatória do mecanismo
  return {
    diagnosticState: 'understood',
    masteryLevel: isLevelGreaterOrEqual(highestDemonstratedLevel, 'understand') ? highestDemonstratedLevel : 'understand',
    activeGaps: [],
    consolidatedEvidenceIds: Array.from(allEvidenceIds),
    totalAttempts,
    unassistedAttemptsCount,
    hasDistinctSessions,
    qualifyingReason: totalAttempts === 1
      ? 'Compreensão do mecanismo demonstrada com precisão em tentativa isolada. Requer nova tentativa autônoma com aplicação para consolidação de domínio.'
      : 'Compreensão consistente demonstrada, em processo de consolidação de evidências autônomas.',
  };
}

/**
 * Cria ou atualiza a entidade de persistência `ConceptMastery` a partir do histórico de tentativas.
 */
export function buildConsolidatedMasteryRecord(
  documentId: string,
  conceptId: string,
  attempts: LearningAttempt[],
  existingMastery?: ConceptMastery
): ConceptMastery {
  const decision = evaluateConceptMastery(documentId, conceptId, attempts);
  const now = Date.now();

  return {
    id: buildMasteryKey(documentId, conceptId),
    documentId,
    conceptId,
    masteryLevel: decision.masteryLevel,
    diagnosticState: decision.diagnosticState,
    totalAttempts: decision.totalAttempts,
    lastAttemptAt: attempts.length > 0 ? attempts[attempts.length - 1].createdAt : now,
    historyAttemptIds: attempts.map(a => a.id),
    activeGaps: decision.activeGaps,
    consolidatedEvidenceIds: decision.consolidatedEvidenceIds,
    nextReviewDue: existingMastery?.nextReviewDue,
  };
}

/**
 * CALCULA RESUMO E MÉTRICAS DE DOMÍNIO DE UM DOCUMENTO (MARCO 2B)
 *
 * Agrega todos os conceitos de um documento e calcula indicadores transparentes,
 * com denominadores explícitos e separação rigorosa entre cobertura e domínio.
 */
export function calculateDocumentMasterySummary(
  documentId: string,
  concepts: Concept[],
  masteryMap: Map<string, ConceptMastery> | Record<string, ConceptMastery>
): DocumentMasterySummary {
  const totalConcepts = concepts.length;

  if (totalConcepts === 0) {
    return {
      documentId,
      totalConcepts: 0,
      masteredCount: 0,
      understoodCount: 0,
      confirmedGapCount: 0,
      unassessedCount: 0,
      evaluatedCount: 0,
      coveragePercent: 0,
      masteryPercent: 0,
      understoodPercent: 0,
      gapPercent: 0,
      coverageRatio: '0/0',
      masteryRatio: '0/0',
      understoodRatio: '0/0',
      gapRatio: '0/0',
    };
  }

  let masteredCount = 0;
  let understoodCount = 0;
  let confirmedGapCount = 0;
  let unassessedCount = 0;

  concepts.forEach(concept => {
    let state: DiagnosticState = concept.diagnosticState || 'unassessed';

    // Se houver registro de maestria persistido no mapa, prevalece a classificação do motor
    const mastery = masteryMap instanceof Map
      ? masteryMap.get(concept.id)
      : masteryMap[concept.id];

    if (mastery?.diagnosticState) {
      state = mastery.diagnosticState;
    }

    switch (state) {
      case 'mastered':
        masteredCount++;
        break;
      case 'understood':
        understoodCount++;
        break;
      case 'confirmed_gap':
        confirmedGapCount++;
        break;
      case 'unassessed':
      default:
        unassessedCount++;
        break;
    }
  });

  const evaluatedCount = masteredCount + understoodCount + confirmedGapCount;

  // Percentuais com precisão de 1 casa decimal e denominadores explícitos
  const coveragePercent = Math.round((evaluatedCount / totalConcepts) * 1000) / 10;
  const masteryPercent = Math.round((masteredCount / totalConcepts) * 1000) / 10;
  const understoodPercent = Math.round((understoodCount / totalConcepts) * 1000) / 10;
  const gapPercent = Math.round((confirmedGapCount / totalConcepts) * 1000) / 10;

  return {
    documentId,
    totalConcepts,
    masteredCount,
    understoodCount,
    confirmedGapCount,
    unassessedCount,
    evaluatedCount,
    coveragePercent,
    masteryPercent,
    understoodPercent,
    gapPercent,
    coverageRatio: `${evaluatedCount}/${totalConcepts}`,
    masteryRatio: `${masteredCount}/${totalConcepts}`,
    understoodRatio: `${understoodCount}/${totalConcepts}`,
    gapRatio: `${confirmedGapCount}/${totalConcepts}`,
  };
}

