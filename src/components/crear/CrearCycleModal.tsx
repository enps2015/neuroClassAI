import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  BookOpen,
  Share2,
  FileText,
  Briefcase,
  Brain,
  CheckCircle2,
  Lock,
  ChevronRight,
  TrendingUp,
  Award,
  Layers,
  RotateCcw,
  Palette,
} from 'lucide-react';
import type {
  Concept,
  ConceptMastery,
  CrearCycleProgress,
  CrearStage,
  DiagnosticState,
  DocumentSource,
  LearningAnalysis,
  LearningAttempt,
  LearningSession,
  MasteryLevel,
  VisualResource,
} from '../../types';
import {
  CREAR_STAGES,
  CREAR_STAGE_META,
  initOrResumeCrearCycle,
  markStageCompleted,
  advanceToNextStage,
  navigateToStage,
  isStageAccessible,
} from '../../services/learning/crearCycleService';
import {
  getConceptMastery,
  saveLearningSession,
} from '../../services/persistence/indexedDb';
import { workspaceStorage } from '../../services/storage/workspaceStorage';
import { visualLearningService } from '../../services/visual/visualLearningService';
import { getDiagnosticStateMeta, getMasteryLevelMeta } from '../../utils/pedagogicalLabels';
import { CrearContextualizeView } from './CrearContextualizeView';
import { CrearRelateView } from './CrearRelateView';
import { CrearExplainView } from './CrearExplainView';
import { CrearApplyView } from './CrearApplyView';
import { CrearRecoverView } from './CrearRecoverView';
import { VisualSupportViewerModal } from '../visual/VisualSupportViewerModal';
import { FeatureHelp } from '../onboarding/FeatureHelp';

interface CrearCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentSource | null;
  concept: Concept | null;
  allConcepts: Concept[];
  analysis: LearningAnalysis | null;
  documentExcerpts?: string[];
  onConceptMasteryChanged?: (conceptId: string, updatedMastery: ConceptMastery) => void;
  onOpenGuide?: () => void;
}

export const CrearCycleModal: React.FC<CrearCycleModalProps> = ({
  isOpen,
  onClose,
  document,
  concept,
  allConcepts,
  analysis,
  documentExcerpts = [],
  onConceptMasteryChanged,
  onOpenGuide,
}) => {
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(concept);
  const [session, setSession] = useState<LearningSession | null>(null);
  const [progress, setProgress] = useState<CrearCycleProgress | null>(null);
  const [mastery, setMastery] = useState<ConceptMastery | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [visualResources, setVisualResources] = useState<VisualResource[]>([]);
  const [isVisualViewerOpen, setIsVisualViewerOpen] = useState(false);
  const [visualViewerMeta, setVisualViewerMeta] = useState<{ stageName: string; stageNote: string }>({
    stageName: '',
    stageNote: '',
  });

  // Carregar recursos visuais de apoio para o conceito selecionado
  useEffect(() => {
    let isMounted = true;
    if (selectedConcept) {
      visualLearningService
        .getVisualSupportForConcept(
          selectedConcept.id,
          selectedConcept.name,
          document?.id,
          document?.title,
          false
        )
        .then(res => {
          if (isMounted) setVisualResources(res);
        })
        .catch(() => {
          if (isMounted) setVisualResources([]);
        });
    } else {
      setVisualResources([]);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedConcept?.id, document?.id]);

  const handleOpenVisualSupport = (stageName: string, stageNote: string) => {
    setVisualViewerMeta({ stageName, stageNote });
    setIsVisualViewerOpen(true);
  };

  // Sincronizar conceito externo quando modal abrir
  useEffect(() => {
    if (concept) {
      setSelectedConcept(concept);
    } else if (allConcepts.length > 0 && !selectedConcept) {
      setSelectedConcept(allConcepts[0]);
    }
  }, [concept, allConcepts]);

  // Carregar ou inicializar sessão C.R.E.A.R. ao abrir ou alternar conceito
  useEffect(() => {
    if (!isOpen || !selectedConcept || !document) return;

    let isMounted = true;

    async function loadCycle() {
      setIsLoading(true);
      try {
        const [cycleData, masteryData] = await Promise.all([
          initOrResumeCrearCycle(document!.id, selectedConcept!.id),
          getConceptMastery(document!.id, selectedConcept!.id),
        ]);

        if (isMounted) {
          setSession(cycleData.session);
          setProgress(cycleData.progress);
          setMastery(masteryData || null);
        }
      } catch (err) {
        console.error('Falha ao inicializar Ciclo C.R.E.A.R.:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadCycle();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedConcept?.id, document?.id]);

  // Ação: Avançar para o próximo estágio
  const handleStageCompleteAndAdvance = useCallback(
    async (stage: CrearStage, stageData?: any) => {
      if (!session) return;

      const updatedSession = markStageCompleted(session, stage, stageData);
      const advancedSession = advanceToNextStage(updatedSession);

      setSession(advancedSession);
      if (advancedSession.crearCycle) {
        setProgress(advancedSession.crearCycle);
      }

      await workspaceStorage.saveLearningSession(advancedSession, document?.subject || 'Geral');
    },
    [session]
  );

  // Ação: Navegação direta entre estágios permitidos
  const handleNavigateStage = useCallback(
    async (targetStage: CrearStage) => {
      if (!session || !progress) return;
      if (!isStageAccessible(progress, targetStage)) return;

      const updatedSession = navigateToStage(session, targetStage);
      setSession(updatedSession);
      if (updatedSession.crearCycle) {
        setProgress(updatedSession.crearCycle);
      }

      await workspaceStorage.saveLearningSession(updatedSession, document?.subject || 'Geral');
    },
    [session, progress]
  );

  // Callback de tentativa concluída (atualiza maestria local e global)
  const handleAttemptCompleted = useCallback(
    (attempt: LearningAttempt, updatedMastery: ConceptMastery) => {
      setMastery(updatedMastery);
      if (selectedConcept && onConceptMasteryChanged) {
        onConceptMasteryChanged(selectedConcept.id, updatedMastery);
      }
    },
    [selectedConcept, onConceptMasteryChanged]
  );

  // Conclusão do ciclo
  const handleFinalizeCycle = useCallback(async () => {
    if (!session) return;
    const completedSession = markStageCompleted(session, 'recover');
    setSession(completedSession);
    if (completedSession.crearCycle) {
      setProgress(completedSession.crearCycle);
    }
    await workspaceStorage.saveLearningSession(completedSession, document?.subject || 'Geral');
    onClose();
  }, [session, onClose]);

  if (!isOpen || !selectedConcept) return null;

  const currentStage: CrearStage = progress?.currentStage || 'contextualize';
  const completedStages = progress?.completedStages || [];
  const percentCompleted = Math.round((completedStages.length / CREAR_STAGES.length) * 100);

  const selState: DiagnosticState = mastery?.diagnosticState || selectedConcept.diagnosticState || 'unassessed';
  const selLevel: MasteryLevel = mastery?.masteryLevel || 'recognize';
  const stateMeta = getDiagnosticStateMeta(selState);
  const levelMeta = getMasteryLevelMeta(selLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header do Ciclo C.R.E.A.R. */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-600/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-tight">Ciclo Pedagógico C.R.E.A.R.</h2>
                  <span className="text-[10px] font-mono uppercase bg-cyan-950/80 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                    Neurociência da Aprendizagem
                  </span>
                  <FeatureHelp featureKey="crear_cycle" onOpenFullGuide={onOpenGuide} buttonSize="xs" />
                </div>
                <p className="text-xs text-slate-400">
                  Percurso cognitivo: Contextualizar · Relacionar · Explicar · Aplicar · Recuperar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Seletor de Conceito em foco */}
              <div className="relative">
                <select
                  value={selectedConcept.id}
                  onChange={e => {
                    const found = allConcepts.find(c => c.id === e.target.value);
                    if (found) setSelectedConcept(found);
                  }}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-medium"
                >
                  {allConcepts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.importance === 'fundamental' ? 'Fundamental' : 'Complementar'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Botão de Apoio Visual Didático (disponível quando houver recursos e fora do teste cego de recuperação) */}
              {visualResources.length > 0 && currentStage !== 'recover' && (
                <button
                  type="button"
                  onClick={() =>
                    handleOpenVisualSupport(
                      `C.R.E.A.R. — ${CREAR_STAGE_META[currentStage].title}`,
                      'Consulte a ilustração iconográfica como modelo mental de apoio sem substituir seu raciocínio autônomo.'
                    )
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white rounded-lg border border-amber-800/40 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  title="Consultar recursos visuais de apoio para este estágio"
                >
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Apoio Visual</span>
                  <span>({visualResources.length})</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Fechar Ciclo C.R.E.A.R."
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barra de Progresso no Percurso e Estado de Domínio Cognitivo */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Progresso no Percurso:</span>
              <span className="font-mono text-cyan-400 font-bold">
                {completedStages.length}/{CREAR_STAGES.length} ({percentCompleted}%)
              </span>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${percentCompleted}%` }}
                />
              </div>
            </div>

            {/* Domínio Cognitivo (Distinto do Percurso) */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-400 font-medium">Domínio Cognitivo Acumulado:</span>
              <span className={`px-2 py-0.5 rounded font-semibold border ${stateMeta.badgeClass}`}>
                {stateMeta.label}
              </span>
              {selState !== 'unassessed' && (
                <span className={`px-2 py-0.5 rounded font-semibold border ${levelMeta.badgeClass}`}>
                  Nível: {levelMeta.label}
                </span>
              )}
            </div>
          </div>

          {/* Stepper Visual Interativo dos 5 Estágios */}
          <div className="grid grid-cols-5 gap-2 pt-2">
            {CREAR_STAGES.map(stage => {
              const meta = CREAR_STAGE_META[stage];
              const isCurrent = currentStage === stage;
              const isDone = completedStages.includes(stage);
              const accessible = progress ? isStageAccessible(progress, stage) : false;

              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => accessible && handleNavigateStage(stage)}
                  disabled={!accessible}
                  className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all ${
                    isCurrent
                      ? 'bg-slate-800/90 border-cyan-500 text-white shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                      : isDone
                      ? 'bg-slate-950/80 border-emerald-800/60 text-slate-200 hover:border-emerald-600'
                      : accessible
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      : 'bg-slate-950/30 border-slate-900 text-slate-600 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : isCurrent
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : meta.letter}
                    </span>
                    <span className="text-[11px] font-bold tracking-tight">{meta.title}</span>
                  </div>
                  <span className="text-[9.5px] text-slate-400 mt-1 line-clamp-1">{meta.actionLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo Dinâmico do Estágio Atual */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Sparkles className="w-6 h-6 animate-pulse text-cyan-400" />
              <span className="text-xs">Carregando percurso C.R.E.A.R. para {selectedConcept.name}...</span>
            </div>
          ) : (
            <>
              {currentStage === 'contextualize' && (
                <CrearContextualizeView
                  concept={selectedConcept}
                  document={document}
                  documentExcerpts={documentExcerpts}
                  isCompleted={completedStages.includes('contextualize')}
                  visualResources={visualResources}
                  onOpenVisualSupport={() =>
                    handleOpenVisualSupport(
                      'C.R.E.A.R. — Contextualizar',
                      'Consulte a ilustração didática para contextualizar espacialmente e estruturalmente o conceito estudado.'
                    )
                  }
                  onCompleteAndAdvance={() =>
                    handleStageCompleteAndAdvance('contextualize', {
                      viewedAt: Date.now(),
                    })
                  }
                />
              )}

              {currentStage === 'relate' && (
                <CrearRelateView
                  concept={selectedConcept}
                  analysis={analysis}
                  isCompleted={completedStages.includes('relate')}
                  visualResources={visualResources}
                  onOpenVisualSupport={() =>
                    handleOpenVisualSupport(
                      'C.R.E.A.R. — Relacionar',
                      'Utilize a representação visual dos componentes e setas direcionais para identificar conexões causais e regulatórias com outros conceitos.'
                    )
                  }
                  onCompleteAndAdvance={() =>
                    handleStageCompleteAndAdvance('relate', {
                      completedAt: Date.now(),
                    })
                  }
                />
              )}

              {currentStage === 'explain' && session && (
                <CrearExplainView
                  concept={selectedConcept}
                  document={document}
                  documentExcerpts={documentExcerpts}
                  sessionId={session.id}
                  isCompleted={completedStages.includes('explain')}
                  visualResources={visualResources}
                  onOpenVisualSupport={() =>
                    handleOpenVisualSupport(
                      'C.R.E.A.R. — Explicar',
                      'Recurso de apoio iconográfico: utilize para recordar a estrutura do conceito, mas redija a explicação com suas próprias palavras para consolidação autônoma.'
                    )
                  }
                  onCompleteAndAdvance={() =>
                    handleStageCompleteAndAdvance('explain', {
                      completedAt: Date.now(),
                    })
                  }
                  onAttemptCompleted={handleAttemptCompleted}
                />
              )}

              {currentStage === 'apply' && session && (
                <CrearApplyView
                  concept={selectedConcept}
                  document={document}
                  documentExcerpts={documentExcerpts}
                  sessionId={session.id}
                  isCompleted={completedStages.includes('apply')}
                  visualResources={visualResources}
                  onOpenVisualSupport={() =>
                    handleOpenVisualSupport(
                      'C.R.E.A.R. — Aplicar',
                      'Utilize o diagrama do mecanismo como referência para interpretar como o conceito atua nesta situação concreta.'
                    )
                  }
                  onCompleteAndAdvance={() =>
                    handleStageCompleteAndAdvance('apply', {
                      completedAt: Date.now(),
                    })
                  }
                  onAttemptCompleted={handleAttemptCompleted}
                />
              )}

              {currentStage === 'recover' && session && (
                <CrearRecoverView
                  concept={selectedConcept}
                  document={document}
                  documentExcerpts={documentExcerpts}
                  sessionId={session.id}
                  isCompleted={completedStages.includes('recover')}
                  visualResources={visualResources}
                  onOpenVisualSupport={() =>
                    handleOpenVisualSupport(
                      'C.R.E.A.R. — Recuperar',
                      'Pista visual pós-recuperação: compare a estrutura iconográfica com o que você acabou de evocar da memória para consolidar as vias neurais de recuperação.'
                    )
                  }
                  onCycleCompleted={handleFinalizeCycle}
                  onAttemptCompleted={(attempt, updatedMastery) => {
                    handleAttemptCompleted(attempt, updatedMastery);
                    handleStageCompleteAndAdvance('recover', {
                      completedAt: Date.now(),
                    });
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Visualizador de Apoio Didático (sem consumo de cota ou geração adicional) */}
      <VisualSupportViewerModal
        isOpen={isVisualViewerOpen}
        onClose={() => setIsVisualViewerOpen(false)}
        conceptName={selectedConcept.name}
        resources={visualResources}
        stageName={visualViewerMeta.stageName}
        stageNote={visualViewerMeta.stageNote}
        documentTitle={document?.title}
      />
    </div>
  );
};

