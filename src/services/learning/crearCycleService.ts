/**
 * FASE 2 — MARCO 2C: SERVIÇO DO CICLO PEDAGÓGICO C.R.E.A.R.
 *
 * Orquestração do percurso cognitivo integrado:
 * 1. Contextualizar -> 2. Relacionar -> 3. Explicar -> 4. Aplicar -> 5. Recuperar
 *
 * Garante unicidade de sessão, retomada contínua, isolamento por documento/conceito
 * e separação estrita entre conclusão do percurso e consolidação de domínio (masteryEngine).
 */

import type {
  Concept,
  ConceptRelationship,
  CrearCycleProgress,
  CrearStage,
  LearningAnalysis,
  LearningAttempt,
  LearningSession,
} from '../../types';
import {
  getAttemptsByConcept,
  getSessionsByDocument,
  saveLearningSession,
} from '../persistence/indexedDb';

export const CREAR_STAGES: readonly CrearStage[] = [
  'contextualize',
  'relate',
  'explain',
  'apply',
  'recover',
] as const;

export const CREAR_STAGE_META: Record<
  CrearStage,
  {
    stepNumber: number;
    letter: string;
    title: string;
    actionLabel: string;
    description: string;
    pedagogicalGoal: string;
  }
> = {
  contextualize: {
    stepNumber: 1,
    letter: 'C',
    title: 'Contextualizar',
    actionLabel: 'Compreender no Material',
    description: 'Análise do conceito no documento fonte, relevância e ancoragem nas evidências.',
    pedagogicalGoal: 'Situar o conceito no corpus acadêmico e distinguir dados empíricos de inferências didáticas.',
  },
  relate: {
    stepNumber: 2,
    letter: 'R',
    title: 'Relacionar',
    actionLabel: 'Conectar no Grafo',
    description: 'Compreensão das interdependências causais, pré-requisitos e ramificações conceituais.',
    pedagogicalGoal: 'Mapear causalidade e conexões com pré-requisitos fundamentais no grafo de conhecimento.',
  },
  explain: {
    stepNumber: 3,
    letter: 'E',
    title: 'Explicar',
    actionLabel: 'Agora Eu Explico',
    description: 'Explicação detalhada com as próprias palavras pela Técnica de Feynman.',
    pedagogicalGoal: 'Verificar precisão, completude e coerência por avaliação multidimensional formativa.',
  },
  apply: {
    stepNumber: 4,
    letter: 'A',
    title: 'Aplicar',
    actionLabel: 'Resolver Caso Prático',
    description: 'Aplicação do mecanismo causal para solucionar um cenário, experimento ou problema real.',
    pedagogicalGoal: 'Diferenciar aplicação prática efetiva da mera repetição abstrata da definição.',
  },
  recover: {
    stepNumber: 5,
    letter: 'R',
    title: 'Recuperar',
    actionLabel: 'Evocação Ativa',
    description: 'Recuperação ativa da memória sem consulta ao material para consolidar a retenção.',
    pedagogicalGoal: 'Exercitar o efeito da testagem (testing effect) identificando lacunas residuais de memória.',
  },
};

/**
 * Inicia ou retoma uma sessão do Ciclo C.R.E.A.R. para determinado documento e conceito.
 * Reutiliza histórico de tentativas prévias para não forçar repetição de avaliações já feitas.
 */
export async function initOrResumeCrearCycle(
  documentId: string,
  conceptId: string
): Promise<{ session: LearningSession; progress: CrearCycleProgress }> {
  // 1. Buscar sessões existentes para este documento
  const existingSessions = await getSessionsByDocument(documentId);
  const existingCycleSession = existingSessions.find(
    s => s.sessionType === 'crear_cycle' && s.activeConceptId === conceptId && s.crearCycle
  );

  // 2. Buscar tentativas prévias deste conceito para aproveitar explicações já avaliadas
  const previousAttempts = await getAttemptsByConcept(documentId, conceptId);
  const lastExplainAttempt = [...previousAttempts]
    .reverse()
    .find(a => !a.activityType || a.activityType === 'explain');

  if (existingCycleSession && existingCycleSession.crearCycle) {
    const cycle = existingCycleSession.crearCycle;

    // Se houve tentativa no "Agora Eu Explico" fora deste ciclo mas posterior, sincroniza
    if (lastExplainAttempt && !cycle.completedStages.includes('explain')) {
      cycle.completedStages.push('explain');
      if (!cycle.stageData) cycle.stageData = {};
      cycle.stageData.explain = {
        lastAttemptId: lastExplainAttempt.id,
        masteryLevel: lastExplainAttempt.feedback.evaluatedMasteryLevel,
        completedAt: lastExplainAttempt.createdAt,
      };
    }

    return { session: existingCycleSession, progress: cycle };
  }

  // 3. Criar nova sessão do Ciclo C.R.E.A.R.
  const sessionId = `session_crear_${documentId}_${conceptId}_${Date.now()}`;
  const completedStages: CrearStage[] = [];
  const stageData: CrearCycleProgress['stageData'] = {};

  // Se o estudante já havia explicado com sucesso no Agora Eu Explico, pré-preenche
  if (lastExplainAttempt) {
    completedStages.push('explain');
    stageData.explain = {
      lastAttemptId: lastExplainAttempt.id,
      masteryLevel: lastExplainAttempt.feedback.evaluatedMasteryLevel,
      completedAt: lastExplainAttempt.createdAt,
    };
  }

  const initialProgress: CrearCycleProgress = {
    sessionId,
    documentId,
    conceptId,
    currentStage: 'contextualize',
    completedStages,
    stageData,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    isCompleted: false,
  };

  const newSession: LearningSession = {
    id: sessionId,
    documentId,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    activeConceptId: conceptId,
    sessionType: 'crear_cycle',
    attemptCount: previousAttempts.length,
    conceptsAddressed: [conceptId],
    crearCycle: initialProgress,
  };

  await saveLearningSession(newSession);

  return { session: newSession, progress: initialProgress };
}

/**
 * Registra a conclusão de uma etapa do ciclo, atualizando o progresso e o estado da sessão.
 */
export function markStageCompleted(
  session: LearningSession,
  stage: CrearStage,
  stagePayload?: any
): LearningSession {
  if (!session.crearCycle) return session;

  const progress = { ...session.crearCycle };
  const completedSet = new Set(progress.completedStages);
  completedSet.add(stage);
  progress.completedStages = Array.from(completedSet);

  if (!progress.stageData) {
    progress.stageData = {};
  }

  if (stagePayload) {
    (progress.stageData as any)[stage] = {
      ...(progress.stageData as any)[stage],
      ...stagePayload,
      completedAt: Date.now(),
    };
  }

  // Se todas as 5 etapas foram concluídas
  const allDone = CREAR_STAGES.every(s => completedSet.has(s));
  progress.isCompleted = allDone;
  progress.updatedAt = Date.now();

  return {
    ...session,
    updatedAt: Date.now(),
    crearCycle: progress,
  };
}

/**
 * Avança para a próxima etapa permitida no ciclo C.R.E.A.R.
 */
export function advanceToNextStage(session: LearningSession): LearningSession {
  if (!session.crearCycle) return session;

  const currentStage = session.crearCycle.currentStage;
  const currentIndex = CREAR_STAGES.indexOf(currentStage);

  if (currentIndex < CREAR_STAGES.length - 1) {
    const nextStage = CREAR_STAGES[currentIndex + 1];
    return {
      ...session,
      updatedAt: Date.now(),
      crearCycle: {
        ...session.crearCycle,
        currentStage: nextStage,
        updatedAt: Date.now(),
      },
    };
  }

  return session;
}

/**
 * Navega para uma etapa específica do ciclo C.R.E.A.R. (retrocesso ou avanço para etapa acessível).
 */
export function navigateToStage(
  session: LearningSession,
  targetStage: CrearStage
): LearningSession {
  if (!session.crearCycle) return session;

  return {
    ...session,
    updatedAt: Date.now(),
    crearCycle: {
      ...session.crearCycle,
      currentStage: targetStage,
      updatedAt: Date.now(),
    },
  };
}

/**
 * Verifica se uma etapa é acessível para visualização ou execução:
 * - A etapa atual é sempre acessível.
 * - Etapas já concluídas são sempre acessíveis para consulta.
 * - A próxima etapa imediata após as concluídas é acessível.
 */
export function isStageAccessible(
  progress: CrearCycleProgress,
  targetStage: CrearStage
): boolean {
  if (progress.currentStage === targetStage) return true;
  if (progress.completedStages.includes(targetStage)) return true;

  const targetIndex = CREAR_STAGES.indexOf(targetStage);
  if (targetIndex === 0) return true;

  // A etapa anterior deve estar concluída
  const previousStage = CREAR_STAGES[targetIndex - 1];
  return progress.completedStages.includes(previousStage);
}

/**
 * Extrai as relações relevantes de um conceito a partir da análise documental.
 */
export function extractConceptRelations(
  conceptId: string,
  analysis: LearningAnalysis | null
): {
  prerequisites: Concept[];
  outgoingRelations: Array<{ relation: ConceptRelationship; targetConcept?: Concept }>;
  incomingRelations: Array<{ relation: ConceptRelationship; sourceConcept?: Concept }>;
} {
  if (!analysis) {
    return { prerequisites: [], outgoingRelations: [], incomingRelations: [] };
  }

  const allConcepts = [
    ...analysis.fundamentalConcepts,
    ...analysis.complementaryConcepts,
  ];
  const conceptMap = new Map(allConcepts.map(c => [c.id, c]));
  const currentConcept = conceptMap.get(conceptId);

  // Pré-requisitos diretos
  const prerequisites = (currentConcept?.prerequisiteConceptIds || [])
    .map(id => conceptMap.get(id))
    .filter((c): c is Concept => Boolean(c));

  // Relações que partem deste conceito
  const outgoingRelations = (analysis.relationships || [])
    .filter(r => r.sourceConceptId === conceptId)
    .map(r => ({
      relation: r,
      targetConcept: conceptMap.get(r.targetConceptId),
    }));

  // Relações que chegam a este conceito
  const incomingRelations = (analysis.relationships || [])
    .filter(r => r.targetConceptId === conceptId)
    .map(r => ({
      relation: r,
      sourceConcept: conceptMap.get(r.sourceConceptId),
    }));

  return { prerequisites, outgoingRelations, incomingRelations };
}

