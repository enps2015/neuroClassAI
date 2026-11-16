import { DefaultScheduler, Rating, State } from 'ts-fsrs';
import type {
  Concept,
  DocumentSource,
  ConceptMastery,
  ExplanationFeedback,
  ConceptReviewSchedule,
  FsrsMemoryState,
  ReviewLogEntry,
  FsrsRatingGrade,
  LongitudinalReviewSummary,
} from '../../types';
import {
  saveReviewSchedule,
  getReviewSchedule,
  getReviewSchedulesByDocument,
  buildMasteryKey,
  saveConceptMastery,
  getConceptMastery,
} from '../persistence/indexedDb';

export const FSRS_ALGORITHM = 'FSRS-7' as const;
export const FSRS_ALGORITHM_VERSION = 'ts-fsrs@6.0.0 / FSRS-7';
export const DEFAULT_DESIRED_RETENTION = 0.9; // 90% de retenção almejada

/**
 * Instância singleton assíncrona do agendador FSRS-7 da ts-fsrs.
 */
let schedulerPromise: ReturnType<typeof DefaultScheduler> | null = null;

export async function getFsrsScheduler() {
  if (!schedulerPromise) {
    schedulerPromise = DefaultScheduler({
      version: 'FSRS-7',
      desiredRetention: DEFAULT_DESIRED_RETENTION,
      enableFuzz: false,
      maximumInterval: 36500,
    });
  }
  return schedulerPromise;
}

/**
 * Retorna as configurações ativas e imutáveis do algoritmo FSRS-7 para auditoria.
 */
export async function getFsrsConfig() {
  const scheduler = await getFsrsScheduler();
  return {
    version: 'FSRS-7' as const,
    algorithmName: (scheduler.model as any)?.algorithm?.constructor?.name || 'FSRS7Algorithm',
    weightsCount: (scheduler.model as any)?.algorithm?.weights?.length || 34,
    defaultWeights: (scheduler.model as any)?.algorithm?.weights || [],
    desiredRetention: DEFAULT_DESIRED_RETENTION,
    maximumInterval: 36500,
    enableFuzz: false,
  };
}

/**
 * Converte um FsrsMemoryState serializado para o formato de Card da biblioteca ts-fsrs.
 */
export function memoryStateToCard(state: FsrsMemoryState): any {
  return {
    stability: state.stability,
    stabilityFast: state.stabilityFast,
    difficulty: state.difficulty,
    state: state.state,
    scheduleStatus: state.scheduleStatus,
    dueAt: new Date(state.dueAt),
    lastReviewAt: state.lastReviewAt ? new Date(state.lastReviewAt) : null,
    cardId: 'c-' + Math.random().toString(36).substring(2, 9),
    reps: state.reps,
    lapses: state.lapses,
    scheduledDays: state.scheduledDays,
    learningStep: state.learningStep || 0,
  };
}

/**
 * Converte um Card da biblioteca ts-fsrs de volta para o FsrsMemoryState serializável.
 */
export function cardToMemoryState(card: any): FsrsMemoryState {
  const dueIso = card.dueAt instanceof Date ? card.dueAt.toISOString() : new Date(card.dueAt).toISOString();
  const lastReviewIso = card.lastReviewAt
    ? card.lastReviewAt instanceof Date
      ? card.lastReviewAt.toISOString()
      : new Date(card.lastReviewAt).toISOString()
    : null;

  return {
    stability: Number(card.stability) || 0,
    stabilityFast: Number(card.stabilityFast) || 0,
    difficulty: Number(card.difficulty) || 0,
    state: Number(card.state) || 0,
    scheduleStatus: card.scheduleStatus || 'new',
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    scheduledDays: Number(card.scheduledDays) || 0,
    dueAt: dueIso,
    lastReviewAt: lastReviewIso,
    learningStep: Number(card.learningStep) || 0,
  };
}

/**
 * Mapeamento determinístico da avaliação pedagógica em 5 dimensões para as classificações FSRS.
 *
 * Regras:
 * - Again (1): Falha evidente de recuperação (lacunas críticas, contradição material, ausência de elos causais).
 * - Hard (2): Recuperação trabalhosa, incompleta ou com uso de dica/apoio.
 * - Good (3): Recuperação correta e autônoma dos mecanismos sem apoio.
 * - Easy (4): Recuperação excelente, fluida e com capacidade de transferência ou aplicação sem lacunas.
 */
export function mapPedagogicalEvaluationToFsrsRating(
  feedback: ExplanationFeedback,
  options?: {
    usedHint?: boolean;
    confidenceDeclared?: 'low' | 'medium' | 'high';
  }
): {
  grade: FsrsRatingGrade;
  ratingNumber: number;
  rationale: string;
} {
  const usedHint = Boolean(options?.usedHint);
  const understoodCount = feedback.understoodElements?.length || 0;
  const incompleteCount = feedback.incompleteElements?.length || 0;
  const gapsCount = feedback.identifiedGaps?.length || 0;
  const misconceptionsCount = feedback.misconceptions?.length || 0;
  const level = feedback.evaluatedMasteryLevel;

  // 1. AGAIN — Falha de recuperação
  if (
    misconceptionsCount > 0 ||
    gapsCount > 0 ||
    (understoodCount === 0 && incompleteCount > 0) ||
    feedback.rubric.conceptualPrecision.qualitativeStatus === 'inaccurate' ||
    feedback.rubric.reasoningCoherence.qualitativeStatus === 'contradictory'
  ) {
    return {
      grade: 'again',
      ratingNumber: Rating.Again, // 1
      rationale:
        'Falha de recuperação: conceitos ou elos causais fundamentais não foram recuperados ou apresentaram contradições teóricas.',
    };
  }

  // 2. HARD — Recuperação com esforço, lacuna relevante ou uso de dica
  if (
    usedHint ||
    level === 'recognize' ||
    incompleteCount > understoodCount ||
    feedback.rubric.conceptualPrecision.qualitativeStatus === 'partially_accurate' ||
    feedback.rubric.completeness.qualitativeStatus === 'incomplete' ||
    feedback.rubric.reasoningCoherence.qualitativeStatus === 'fragmented' ||
    feedback.rubric.conceptualRelationships.qualitativeStatus === 'confused'
  ) {
    return {
      grade: 'hard',
      ratingNumber: Rating.Hard, // 2
      rationale: usedHint
        ? 'Recuperação com apoio pedagógico: a assistência de dica guiou a resposta, indicando que a autonomia de evocação ainda requer consolidação.'
        : 'Recuperação parcial com esforço elevado: houve lembrança de termos, mas com lacunas relevantes na cadeia causal do mecanismo.',
    };
  }

  // 3. EASY — Recuperação fluida, integrada e com transferência sem lacunas
  const allRubricsSatisfactory =
    feedback.rubric.conceptualPrecision.qualitativeStatus === 'accurate' &&
    feedback.rubric.completeness.qualitativeStatus === 'complete' &&
    feedback.rubric.reasoningCoherence.qualitativeStatus === 'coherent' &&
    feedback.rubric.conceptualRelationships.qualitativeStatus === 'well_connected';

  if (
    !usedHint &&
    incompleteCount === 0 &&
    allRubricsSatisfactory &&
    (level === 'transfer' || (level === 'apply' && understoodCount >= 3))
  ) {
    return {
      grade: 'easy',
      ratingNumber: Rating.Easy, // 4
      rationale:
        'Recuperação fluida e consolidada: resposta precisa, integrada e com capacidade demonstrada de transferência ou aplicação prática.',
    };
  }

  // 4. GOOD — Recuperação correta e autônoma padrão
  return {
    grade: 'good',
    ratingNumber: Rating.Good, // 3
    rationale:
      'Recuperação adequada: os mecanismos causais foram satisfatoriamente explicados de forma autônoma e coerente.',
  };
}

/**
 * Calcula a probabilidade teórica estimada de recuperação (Retrievability) segundo o modelo FSRS-7.
 * Esta é uma estimativa do algoritmo, NÃO uma medida neurobiológica real.
 */
export async function calculateEstimatedRetrievability(
  memoryState: FsrsMemoryState,
  checkedAt: Date = new Date()
): Promise<number> {
  const scheduler = await getFsrsScheduler();
  const lastReview = memoryState.lastReviewAt ? new Date(memoryState.lastReviewAt) : new Date(memoryState.dueAt);
  const elapsedDays = scheduler.chrono.difference(lastReview, checkedAt);

  // Se o item é novo e nunca foi revisado
  if (memoryState.state === State.New || !memoryState.lastReviewAt) {
    return 1.0;
  }

  const card = memoryStateToCard(memoryState);
  const retrievability = scheduler.model.forgettingCurve(card as any, elapsedDays);
  return Math.max(0, Math.min(1, Number(retrievability) || 0));
}

/**
 * Registra e agenda um novo conceito no sistema de repetição espaçada FSRS-7.
 */
export async function enrollConceptInSpacedRepetition(
  document: DocumentSource,
  concept: Concept,
  now: Date = new Date()
): Promise<ConceptReviewSchedule> {
  const scheduler = await getFsrsScheduler();
  const initialCard = scheduler.newCard({ now });
  const memoryState = cardToMemoryState(initialCard);

  const schedule: ConceptReviewSchedule = {
    id: buildMasteryKey(document.id, concept.id),
    documentId: document.id,
    conceptId: concept.id,
    conceptName: concept.name,
    isFundamental: concept.importance === 'fundamental',
    algorithm: FSRS_ALGORITHM,
    algorithmVersion: FSRS_ALGORITHM_VERSION,
    desiredRetention: DEFAULT_DESIRED_RETENTION,
    memoryState,
    nextReviewDue: memoryState.dueAt,
    lastReviewedAt: null,
    lastRating: null,
    totalReviews: 0,
    totalLapses: 0,
    historyLogs: [],
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    enrolledAt: now.getTime(),
  };

  await saveReviewSchedule(schedule);

  // Sincroniza nextReviewDue no ConceptMastery se existir
  try {
    const mastery = await getConceptMastery(document.id, concept.id);
    if (mastery) {
      mastery.nextReviewDue = new Date(schedule.nextReviewDue).getTime();
      await saveConceptMastery(mastery);
    }
  } catch (err) {
    console.warn('[FSRS] Não foi possível sincronizar ConceptMastery:', err);
  }

  return schedule;
}

/**
 * Processa o resultado de uma sessão de revisão, executando o FSRS-7 e recalculando o agendamento.
 */
export async function processConceptReview(params: {
  schedule: ConceptReviewSchedule;
  grade: FsrsRatingGrade;
  feedback: ExplanationFeedback;
  attemptId: string;
  reviewSessionId?: string;
  reviewedAt?: Date;
  usedHint?: boolean;
  confidenceDeclared?: 'low' | 'medium' | 'high';
  pedagogicalRationale?: string;
}): Promise<{
  updatedSchedule: ConceptReviewSchedule;
  reviewLog: ReviewLogEntry;
}> {
  const scheduler = await getFsrsScheduler();
  const now = params.reviewedAt || new Date();
  const currentCard = memoryStateToCard(params.schedule.memoryState);

  // Obter rating numérico
  const ratingNumber =
    params.grade === 'again'
      ? Rating.Again
      : params.grade === 'hard'
      ? Rating.Hard
      : params.grade === 'good'
      ? Rating.Good
      : Rating.Easy;

  // Calcular retrievability teórica estimada no momento exato ANTES da revisão
  const lastRev = params.schedule.memoryState.lastReviewAt
    ? new Date(params.schedule.memoryState.lastReviewAt)
    : new Date(params.schedule.memoryState.dueAt);
  const elapsedDays = scheduler.chrono.difference(lastRev, now);
  const retrievabilityEstimated =
    params.schedule.memoryState.state === State.New
      ? 1.0
      : scheduler.model.forgettingCurve(currentCard as any, elapsedDays);

  // Executar revisão determinística no FSRS-7
  const result = scheduler.review({
    card: currentCard as any,
    grade: ratingNumber,
    now,
  });

  const stateBefore = params.schedule.memoryState.state;
  const newMemoryState = cardToMemoryState(result.card);
  const stateAfter = newMemoryState.state;

  // Extrair e serializar o revlog oficial retornado pelo FSRS-7
  const rawRevlog = (result as any).revlog;
  const fsrsRevlogSerialized = rawRevlog
    ? {
        cardId: rawRevlog.cardId,
        rating: Number(rawRevlog.rating) || ratingNumber,
        state: Number(rawRevlog.state) || stateBefore,
        dueAt: rawRevlog.dueAt instanceof Date ? rawRevlog.dueAt.toISOString() : new Date(rawRevlog.dueAt).toISOString(),
        lastReviewAt: rawRevlog.lastReviewAt
          ? rawRevlog.lastReviewAt instanceof Date
            ? rawRevlog.lastReviewAt.toISOString()
            : new Date(rawRevlog.lastReviewAt).toISOString()
          : null,
        reviewTime: rawRevlog.reviewTime instanceof Date ? rawRevlog.reviewTime.toISOString() : new Date(rawRevlog.reviewTime || now).toISOString(),
        scheduledDays: Number(rawRevlog.scheduledDays) || 0,
        learningStep: Number(rawRevlog.learningStep) || 0,
        stability: Number(rawRevlog.stability) || 0,
        stabilityFast: Number(rawRevlog.stabilityFast) || 0,
        difficulty: Number(rawRevlog.difficulty) || 0,
        scheduleStatus: String(rawRevlog.scheduleStatus || 'review'),
      }
    : undefined;

  const logEntry: ReviewLogEntry = {
    id: 'revlog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    documentId: params.schedule.documentId,
    conceptId: params.schedule.conceptId,
    attemptId: params.attemptId,
    reviewSessionId: params.reviewSessionId,
    reviewedAt: now.toISOString(),
    grade: params.grade,
    fsrsRating: ratingNumber,
    scheduledDays: newMemoryState.scheduledDays,
    lastScheduledDays: params.schedule.memoryState.scheduledDays,
    elapsedDays: Math.max(0, elapsedDays),
    stability: newMemoryState.stability,
    difficulty: newMemoryState.difficulty,
    retrievabilityEstimated: Math.max(0, Math.min(1, retrievabilityEstimated)),
    usedHint: Boolean(params.usedHint),
    confidenceDeclared: params.confidenceDeclared,
    pedagogicalRationale:
      params.pedagogicalRationale ||
      mapPedagogicalEvaluationToFsrsRating(params.feedback, {
        usedHint: params.usedHint,
        confidenceDeclared: params.confidenceDeclared,
      }).rationale,
    evaluatedMasteryLevel: params.feedback.evaluatedMasteryLevel,
    stateBefore,
    stateAfter,
    algorithm: FSRS_ALGORITHM,
    algorithmVersion: FSRS_ALGORITHM_VERSION,
    desiredRetention: DEFAULT_DESIRED_RETENTION,
    fsrsRevlog: fsrsRevlogSerialized,
  };

  const updatedSchedule: ConceptReviewSchedule = {
    ...params.schedule,
    memoryState: newMemoryState,
    nextReviewDue: newMemoryState.dueAt,
    lastReviewedAt: now.toISOString(),
    lastRating: params.grade,
    totalReviews: params.schedule.totalReviews + 1,
    totalLapses: params.schedule.totalLapses + (params.grade === 'again' ? 1 : 0),
    historyLogs: [...params.schedule.historyLogs, logEntry],
    updatedAt: now.getTime(),
  };

  await saveReviewSchedule(updatedSchedule);

  // Atualizar nextReviewDue no ConceptMastery
  try {
    const mastery = await getConceptMastery(params.schedule.documentId, params.schedule.conceptId);
    if (mastery) {
      mastery.nextReviewDue = new Date(updatedSchedule.nextReviewDue).getTime();
      await saveConceptMastery(mastery);
    }
  } catch (err) {
    console.warn('[FSRS] Erro ao sincronizar com ConceptMastery:', err);
  }

  return {
    updatedSchedule,
    reviewLog: logEntry,
  };
}

/**
 * Reconstrói o estado FSRS a partir do histórico de logs para garantir determinismo e auditabilidade.
 */
export async function reconstructScheduleFromLogs(
  historyLogs: ReviewLogEntry[],
  initialNow?: Date
): Promise<FsrsMemoryState> {
  const scheduler = await getFsrsScheduler();
  const sortedLogs = [...historyLogs].sort(
    (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
  );

  let currentCard = scheduler.newCard({ now: initialNow || (sortedLogs[0] ? new Date(sortedLogs[0].reviewedAt) : new Date()) });

  for (const log of sortedLogs) {
    const reviewDate = new Date(log.reviewedAt);
    const result = scheduler.review({
      card: currentCard as any,
      grade: log.fsrsRating as any,
      now: reviewDate,
    });
    currentCard = result.card;
  }

  return cardToMemoryState(currentCard);
}

/**
 * Calcula o resumo consolidado de repetição longitudinal para determinado documento.
 */
export async function calculateLongitudinalSummary(
  documentId: string,
  concepts: Concept[],
  schedules: ConceptReviewSchedule[],
  masteries: ConceptMastery[] = [],
  referenceDate: Date = new Date()
): Promise<LongitudinalReviewSummary> {
  const scheduleMap = new Map<string, ConceptReviewSchedule>();
  schedules.forEach(s => scheduleMap.set(s.conceptId, s));

  const masteryMap = new Map<string, ConceptMastery>();
  masteries.forEach(m => masteryMap.set(m.conceptId, m));

  const nowMs = referenceDate.getTime();
  const todayStart = new Date(referenceDate);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(referenceDate);
  todayEnd.setHours(23, 59, 59, 999);

  let totalReviewsDone = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let upcomingCount = 0;
  let correctReviews = 0;
  let retrievabilitySum = 0;
  let retrievabilityCount = 0;

  const ratingDistribution = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };

  const conceptsBreakdown: LongitudinalReviewSummary['conceptsBreakdown'] = [];

  for (const concept of concepts) {
    const schedule = scheduleMap.get(concept.id);
    const mastery = masteryMap.get(concept.id);

    const diagnosticState = mastery?.diagnosticState || concept.diagnosticState || 'unassessed';
    const masteryLevel = mastery?.masteryLevel || 'recognize';

    if (!schedule) {
      conceptsBreakdown.push({
        conceptId: concept.id,
        conceptName: concept.name,
        isFundamental: concept.importance === 'fundamental',
        status: 'untracked',
        nextReviewDue: null,
        daysOverdueOrRemaining: 0,
        estimatedRetrievability: null,
        stabilityDays: null,
        difficulty: null,
        lastRating: null,
        totalReviews: 0,
        diagnosticState,
        masteryLevel,
      });
      continue;
    }

    totalReviewsDone += schedule.totalReviews;

    // Distribuição de classificações a partir dos logs
    for (const log of schedule.historyLogs) {
      if (log.grade in ratingDistribution) {
        ratingDistribution[log.grade]++;
      }
      if (log.grade === 'good' || log.grade === 'easy') {
        correctReviews++;
      }
    }

    const dueMs = new Date(schedule.nextReviewDue).getTime();
    let status: 'overdue' | 'due_today' | 'upcoming';
    let daysDiff = Math.round((dueMs - nowMs) / (1000 * 60 * 60 * 24));

    if (dueMs < todayStart.getTime()) {
      status = 'overdue';
      overdueCount++;
    } else if (dueMs <= todayEnd.getTime()) {
      status = 'due_today';
      dueTodayCount++;
    } else {
      status = 'upcoming';
      upcomingCount++;
    }

    const estR = await calculateEstimatedRetrievability(schedule.memoryState, referenceDate);
    retrievabilitySum += estR;
    retrievabilityCount++;

    conceptsBreakdown.push({
      conceptId: concept.id,
      conceptName: concept.name,
      isFundamental: concept.importance === 'fundamental',
      status,
      nextReviewDue: schedule.nextReviewDue,
      daysOverdueOrRemaining: daysDiff,
      estimatedRetrievability: Math.round(estR * 100) / 100,
      stabilityDays: Math.round(schedule.memoryState.stability * 10) / 10,
      difficulty: Math.round(schedule.memoryState.difficulty * 10) / 10,
      lastRating: schedule.lastRating,
      totalReviews: schedule.totalReviews,
      diagnosticState,
      masteryLevel,
    });
  }

  const trackedCount = schedules.length;
  const untrackedCount = Math.max(0, concepts.length - trackedCount);
  const correctRetrievalRate =
    totalReviewsDone > 0 ? Math.round((correctReviews / totalReviewsDone) * 100) / 100 : 0;
  const averageEstimatedRetrievability =
    retrievabilityCount > 0 ? Math.round((retrievabilitySum / retrievabilityCount) * 100) / 100 : 0;

  return {
    documentId,
    totalTrackedConcepts: trackedCount,
    totalReviewsDone,
    dueTodayCount,
    overdueCount,
    upcomingCount,
    untrackedConceptsCount: untrackedCount,
    correctRetrievalRate,
    averageEstimatedRetrievability,
    ratingDistribution,
    conceptsBreakdown,
  };
}

/**
 * Formata um carimbo ISO UTC de data de revisão para exibição amigável em PT-BR.
 */
export function formatFriendlyReviewDue(dueIso: string, referenceDate: Date = new Date()): {
  label: string;
  isOverdue: boolean;
  isToday: boolean;
  colorClass: string;
} {
  const due = new Date(dueIso);
  const ref = new Date(referenceDate);

  const startToday = new Date(ref);
  startToday.setHours(0, 0, 0, 0);

  const endToday = new Date(ref);
  endToday.setHours(23, 59, 59, 999);

  if (due.getTime() < startToday.getTime()) {
    const diffDays = Math.max(1, Math.floor((startToday.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      label: `Atrasada há ${diffDays} dia${diffDays > 1 ? 's' : ''}`,
      isOverdue: true,
      isToday: false,
      colorClass: 'text-rose-400 bg-rose-950/50 border-rose-800/60',
    };
  }

  if (due.getTime() <= endToday.getTime()) {
    return {
      label: 'Para hoje',
      isOverdue: false,
      isToday: true,
      colorClass: 'text-amber-400 bg-amber-950/50 border-amber-800/60',
    };
  }

  const diffDays = Math.ceil((due.getTime() - endToday.getTime()) / (1000 * 60 * 60 * 24));
  return {
    label: `Em ${diffDays} dia${diffDays > 1 ? 's' : ''}`,
    isOverdue: false,
    isToday: false,
    colorClass: 'text-cyan-400 bg-cyan-950/50 border-cyan-800/60',
  };
}
