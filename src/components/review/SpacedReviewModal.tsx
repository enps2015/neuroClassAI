import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Brain,
  Clock,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Send,
  X,
  Layers,
  ChevronRight,
  TrendingUp,
  Award,
  ArrowRight,
  FileQuestion,
  HelpCircle,
} from 'lucide-react';
import type {
  Concept,
  DocumentSource,
  ConceptMastery,
  ExplanationFeedback,
  LearningAttempt,
  ConceptReviewSchedule,
  LongitudinalReviewSummary,
  FsrsRatingGrade,
} from '../../types';
import {
  enrollConceptInSpacedRepetition,
  processConceptReview,
  mapPedagogicalEvaluationToFsrsRating,
  calculateEstimatedRetrievability,
  calculateLongitudinalSummary,
  formatFriendlyReviewDue,
  FSRS_ALGORITHM,
  FSRS_ALGORITHM_VERSION,
} from '../../services/learning/spacedRepetitionService';
import {
  getReviewSchedule,
  getReviewSchedulesByDocument,
  getAllMasteryByDocument,
  saveLearningAttempt,
  saveLearningSession,
  getAttemptsByConcept,
} from '../../services/persistence/indexedDb';
import { requestConceptQuestion, requestExplanationEvaluation } from '../../services/ai/aiClient';
import { getMasteryLevelMeta, getDiagnosticStateMeta } from '../../utils/pedagogicalLabels';
import { LongitudinalReviewDashboard } from './LongitudinalReviewDashboard';

interface SpacedReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentSource | null;
  concepts: Concept[];
  initialConceptId?: string | null;
  onConceptMasteryChanged?: (conceptId: string, updatedMastery: ConceptMastery) => void;
}

type FilterTab = 'all' | 'overdue' | 'due_today' | 'upcoming' | 'untracked';

export const SpacedReviewModal: React.FC<SpacedReviewModalProps> = ({
  isOpen,
  onClose,
  document,
  concepts,
  initialConceptId,
  onConceptMasteryChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'analytics'>('queue');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [schedules, setSchedules] = useState<ConceptReviewSchedule[]>([]);
  const [masteries, setMasteries] = useState<ConceptMastery[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estado da sessão de revisão ativa
  const [reviewingConceptId, setReviewingConceptId] = useState<string | null>(initialConceptId || null);
  const [reviewQuestion, setReviewQuestion] = useState<string>('');
  const [contextTip, setContextTip] = useState<string>('');
  const [studentResponse, setStudentResponse] = useState<string>('');
  const [hasViewedHint, setHasViewedHint] = useState<boolean>(false);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<ExplanationFeedback | null>(null);
  const [latestLog, setLatestLog] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carrega agendamentos e maestrias do documento
  const loadData = useCallback(async () => {
    if (!document) return;
    setIsLoading(true);
    try {
      const [loadedSchedules, loadedMasteries] = await Promise.all([
        getReviewSchedulesByDocument(document.id),
        getAllMasteryByDocument(document.id),
      ]);
      setSchedules(loadedSchedules);
      setMasteries(loadedMasteries);
    } catch (err) {
      console.error('Erro ao carregar dados de repetição espaçada:', err);
    } finally {
      setIsLoading(false);
    }
  }, [document]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialConceptId) {
        setReviewingConceptId(initialConceptId);
      }
    } else {
      setReviewingConceptId(null);
      setCurrentFeedback(null);
      setLatestLog(null);
      setStudentResponse('');
    }
  }, [isOpen, initialConceptId, loadData]);

  // Resumo longitudinal
  const [summary, setSummary] = useState<LongitudinalReviewSummary | null>(null);
  useEffect(() => {
    if (!document) return;
    let isMounted = true;
    calculateLongitudinalSummary(document.id, concepts, schedules, masteries).then(res => {
      if (isMounted) setSummary(res);
    });
    return () => {
      isMounted = false;
    };
  }, [document, concepts, schedules, masteries]);

  // Conceito atualmente selecionado para revisão
  const reviewingConcept = useMemo(() => {
    if (!reviewingConceptId) return null;
    return concepts.find(c => c.id === reviewingConceptId) || null;
  }, [reviewingConceptId, concepts]);

  // Agendamento do conceito em revisão
  const reviewingSchedule = useMemo(() => {
    if (!reviewingConceptId) return null;
    return schedules.find(s => s.conceptId === reviewingConceptId) || null;
  }, [reviewingConceptId, schedules]);

  // Iniciar sessão de revisão para um conceito
  const handleStartReview = useCallback(
    async (conceptId: string) => {
      if (!document) return;
      const concept = concepts.find(c => c.id === conceptId);
      if (!concept) return;

      setReviewingConceptId(conceptId);
      setStudentResponse('');
      setCurrentFeedback(null);
      setLatestLog(null);
      setHasViewedHint(false);
      setErrorMsg(null);
      setIsGeneratingQuestion(true);

      // Se o conceito ainda não tiver agendamento FSRS, agenda agora
      let sched = schedules.find(s => s.conceptId === conceptId);
      if (!sched) {
        try {
          sched = await enrollConceptInSpacedRepetition(document, concept);
          setSchedules(prev => [...prev.filter(s => s.conceptId !== conceptId), sched!]);
        } catch (err) {
          console.error('Erro ao agendar conceito:', err);
        }
      }

      // Buscar pergunta aberta de recuperação espaçada
      try {
        const response = await requestConceptQuestion({
          documentTitle: document.title,
          subject: document.subject,
          concept: {
            id: concept.id,
            name: concept.name,
            definition: concept.definition,
            prerequisiteConceptIds: concept.prerequisiteConceptIds,
          },
          activityType: 'review',
        });
        setReviewQuestion(response.question);
        setContextTip(response.contextTip || 'Reconstrua a sequência causal completa com suas próprias palavras.');
      } catch {
        setReviewQuestion(
          `Sem consultar o material ou suas anotações, explique com suas próprias palavras como opera o mecanismo de "${concept.name}". Quais são as causas, mediadores e consequências deste processo?`
        );
        setContextTip('Recupere ativamente da memória os elos de causa e efeito sem consultar o texto.');
      } finally {
        setIsGeneratingQuestion(false);
      }
    },
    [document, concepts, schedules]
  );

  // Submeter resposta da revisão
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document || !reviewingConcept || !studentResponse.trim()) return;

    setIsEvaluating(true);
    setErrorMsg(null);

    try {
      let sched = reviewingSchedule;
      if (!sched) {
        sched = await enrollConceptInSpacedRepetition(document, reviewingConcept);
      }

      const evalResponse = await requestExplanationEvaluation({
        documentId: document.id,
        documentTitle: document.title,
        subject: document.subject,
        concept: {
          id: reviewingConcept.id,
          name: reviewingConcept.name,
          definition: reviewingConcept.definition,
          prerequisiteConceptIds: reviewingConcept.prerequisiteConceptIds,
        },
        promptQuestion: reviewQuestion,
        studentExplanation: studentResponse.trim(),
        attemptNumber: (sched.totalReviews || 0) + 1,
        activityType: 'review',
        usedPedagogicalHint: hasViewedHint,
      });

      const feedback = evalResponse.feedback;
      setCurrentFeedback(feedback);

      // Mapeamento determinístico da classificação FSRS
      const fsrsMapping = mapPedagogicalEvaluationToFsrsRating(feedback, {
        usedHint: hasViewedHint,
        confidenceDeclared: confidence,
      });

      // Salvar tentativa em learning_attempts
      const attemptId = 'att-review-' + Date.now();
      const reviewAttempt: LearningAttempt = {
        id: attemptId,
        sessionId: 'session-review-' + document.id,
        documentId: document.id,
        conceptId: reviewingConcept.id,
        attemptNumber: sched.totalReviews + 1,
        promptQuestion: reviewQuestion,
        studentExplanation: studentResponse.trim(),
        feedback,
        createdAt: Date.now(),
        usedPedagogicalHint: hasViewedHint,
        activityType: 'review',
        reviewRating: fsrsMapping.grade,
        confidenceDeclared: confidence,
      };
      await saveLearningAttempt(reviewAttempt);

      // Processar com FSRS-7
      const { updatedSchedule, reviewLog } = await processConceptReview({
        schedule: sched,
        grade: fsrsMapping.grade,
        feedback,
        attemptId,
        reviewSessionId: 'session-review-' + document.id,
        usedHint: hasViewedHint,
        confidenceDeclared: confidence,
        pedagogicalRationale: fsrsMapping.rationale,
      });

      setLatestLog(reviewLog);

      // Atualizar lista local
      setSchedules(prev => [
        ...prev.filter(s => s.conceptId !== reviewingConcept.id),
        updatedSchedule,
      ]);

      // Atualizar dados de maestria se houver callback
      const allPastAttempts = await getAttemptsByConcept(document.id, reviewingConcept.id);
      if (allPastAttempts.length > 0 && onConceptMasteryChanged) {
        const mastery = masteries.find(m => m.conceptId === reviewingConcept.id);
        if (mastery) onConceptMasteryChanged(reviewingConcept.id, mastery);
      }
    } catch (err: any) {
      console.error('Falha na avaliação da revisão espaçada:', err);
      setErrorMsg(err.message || 'Erro ao processar a avaliação da revisão.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Filtragem dos itens da fila
  const filteredConcepts = useMemo(() => {
    if (!summary) return [];
    return summary.conceptsBreakdown.filter(item => {
      if (filter === 'all') return true;
      if (filter === 'overdue') return item.status === 'overdue';
      if (filter === 'due_today') return item.status === 'due_today';
      if (filter === 'upcoming') return item.status === 'upcoming';
      if (filter === 'untracked') return item.status === 'untracked';
      return true;
    });
  }, [summary, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header do Modal */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-cyan-600 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-cyan-600/20">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Recuperação Espaçada & Memória Longitudinal
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {FSRS_ALGORITHM}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Evocação ativa sem consulta para consolidação duradoura na memória de longo prazo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('queue');
                  setReviewingConceptId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'queue' && !reviewingConceptId
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Fila de Revisão
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('analytics');
                  setReviewingConceptId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Painel Longitudinal
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Sparkles className="w-6 h-6 animate-pulse text-indigo-400" />
              <span className="text-xs">Carregando agendamentos e histórico longitudinal...</span>
            </div>
          ) : activeTab === 'analytics' ? (
            summary && (
              <LongitudinalReviewDashboard
                summary={summary}
                onSelectConceptToReview={handleStartReview}
                onEnrollConcept={handleStartReview}
              />
            )
          ) : reviewingConcept ? (
            /* Sessão Ativa de Revisão de um Conceito */
            <div className="space-y-5">
              {/* Cabeçalho do Conceito em Revisão */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewingConceptId(null);
                        setCurrentFeedback(null);
                        setLatestLog(null);
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer mr-2"
                    >
                      ← Voltar à Fila
                    </button>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {reviewingConcept.importance === 'fundamental' ? 'Fundamental' : 'Complementar'}
                    </span>
                    <h3 className="text-sm font-bold text-white">{reviewingConcept.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-1">{reviewingConcept.definition}</p>
                </div>

                {reviewingSchedule && (
                  <div className="text-right text-[11px] text-slate-400 shrink-0">
                    <div>Revisão #{reviewingSchedule.totalReviews + 1}</div>
                    <div className="text-slate-400 font-mono text-[10px]">
                      S: {reviewingSchedule.memoryState.stability}d • D: {reviewingSchedule.memoryState.difficulty}/10
                    </div>
                  </div>
                )}
              </div>

              {/* Se o feedback já foi retornado */}
              {currentFeedback && latestLog ? (
                <div className="space-y-4">
                  {/* Banner de Classificação FSRS */}
                  <div
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      latestLog.grade === 'again'
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                        : latestLog.grade === 'hard'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                        : latestLog.grade === 'good'
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                        : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-black/40">
                          Classificação FSRS: {latestLog.grade.toUpperCase()}
                        </span>
                        <span className="text-xs font-medium opacity-90">
                          (Nível Cognitivo: {getMasteryLevelMeta(currentFeedback.evaluatedMasteryLevel).label})
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-95">{latestLog.pedagogicalRationale}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] opacity-75">Próximo Intervalo:</div>
                      <div className="text-base font-bold">
                        {Math.round(latestLog.scheduledDays * 10) / 10} dia(s)
                      </div>
                    </div>
                  </div>

                  {/* Rubrica e Diagnóstico de Recuperação */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Diagnóstico de Evocação da Memória
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{currentFeedback.summary}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                      {currentFeedback.understoodElements.length > 0 && (
                        <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg space-y-1">
                          <span className="font-semibold text-emerald-300">
                            Elos Recuperados com Sucesso ({currentFeedback.understoodElements.length}):
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                            {currentFeedback.understoodElements.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {currentFeedback.incompleteElements.length > 0 && (
                        <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg space-y-1">
                          <span className="font-semibold text-amber-300">
                            Lacunas Diagnosticadas ({currentFeedback.incompleteElements.length}):
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                            {currentFeedback.incompleteElements.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botões de Ação Pós-Revisão */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStudentResponse('');
                        setCurrentFeedback(null);
                        setLatestLog(null);
                        handleStartReview(reviewingConcept.id);
                      }}
                      className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revisar Novamente Agora</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReviewingConceptId(null);
                        setCurrentFeedback(null);
                        setLatestLog(null);
                      }}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                    >
                      Concluir e Voltar à Fila
                    </button>
                  </div>
                </div>
              ) : (
                /* Formulário de Resposta da Revisão */
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  {/* Desafio de Recuperação Aberto */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                        <Brain className="w-4 h-4" />
                        Desafio de Recuperação da Memória
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartReview(reviewingConcept.id)}
                        disabled={isGeneratingQuestion}
                        className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Nova Pergunta
                      </button>
                    </div>

                    {isGeneratingQuestion ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
                        <Sparkles className="w-4 h-4 animate-pulse text-indigo-400" />
                        <span>Formulando desafio de recuperação contextualizado...</span>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-slate-900 border border-slate-800/80 rounded-lg">
                        <p className="text-xs font-medium text-slate-200 leading-relaxed">
                          {reviewQuestion}
                        </p>
                      </div>
                    )}

                    {/* Dica Pedagógica Opcional */}
                    <div className="pt-1">
                      {hasViewedHint ? (
                        <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg flex items-start gap-2 text-xs text-amber-200">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="font-semibold text-amber-300">Dica Pedagógica:</span>
                            <p className="text-[11.5px] leading-relaxed text-slate-300">{contextTip}</p>
                            <span className="text-[10px] text-amber-400/80 italic block">
                              * O uso de dica é registrado pelo FSRS-7 para calibrar a dificuldade da recuperação.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setHasViewedHint(true)}
                          className="flex items-center gap-1.5 text-[11px] text-amber-400/80 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>Preciso de uma dica pedagógica</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confiança Declarada */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-indigo-400" />
                      Qual o seu nível de confiança antes de responder?
                    </span>
                    <div className="flex gap-1.5">
                      {(['low', 'medium', 'high'] as const).map(lvl => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setConfidence(lvl)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                            confidence === lvl
                              ? lvl === 'high'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : lvl === 'medium'
                                ? 'bg-amber-950 text-amber-300 border-amber-700'
                                : 'bg-rose-950 text-rose-300 border-rose-700'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {lvl === 'low' ? 'Baixa' : lvl === 'medium' ? 'Média' : 'Alta'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Área de Resposta do Estudante */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Sua Evocação da Memória (Palavras Próprias):</span>
                      <span className="text-[11px] text-slate-400">
                        {studentResponse.trim().split(/\s+/).filter(Boolean).length} palavras
                      </span>
                    </label>
                    <textarea
                      value={studentResponse}
                      onChange={e => setStudentResponse(e.target.value)}
                      placeholder="Explique o mecanismo causal passo a passo, descrevendo o desencadeador, os mediadores e o resultado..."
                      rows={5}
                      className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none leading-relaxed"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400 italic">
                      A avaliação pedagógica calibrará o próximo intervalo no FSRS-7.
                    </span>

                    <button
                      type="submit"
                      disabled={isEvaluating || isGeneratingQuestion || studentResponse.trim().length < 15}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                    >
                      {isEvaluating ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-spin" />
                          <span>Avaliando Recuperação...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Concluir Revisão (FSRS-7)</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Fila de Conceitos para Revisão */
            <div className="space-y-4">
              {/* Filtros da Fila */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filter === 'all'
                      ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  Todas ({concepts.length})
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('overdue')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filter === 'overdue'
                      ? 'bg-rose-950 text-rose-300 border-rose-800 shadow-sm'
                      : 'bg-slate-950/60 text-rose-400/80 border-slate-800/80 hover:border-rose-900'
                  }`}
                >
                  Atrasadas ({summary?.overdueCount || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('due_today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filter === 'due_today'
                      ? 'bg-amber-950 text-amber-300 border-amber-800 shadow-sm'
                      : 'bg-slate-950/60 text-amber-400/80 border-slate-800/80 hover:border-amber-900'
                  }`}
                >
                  Para Hoje ({summary?.dueTodayCount || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('upcoming')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filter === 'upcoming'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-800 shadow-sm'
                      : 'bg-slate-950/60 text-cyan-400/80 border-slate-800/80 hover:border-cyan-900'
                  }`}
                >
                  Próximas ({summary?.upcomingCount || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('untracked')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    filter === 'untracked'
                      ? 'bg-slate-800 text-slate-200 border-slate-700 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  Sem Agendamento ({summary?.untrackedConceptsCount || 0})
                </button>
              </div>

              {/* Lista de Itens da Fila */}
              {filteredConcepts.length === 0 ? (
                <div className="py-14 text-center text-xs text-slate-400 space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-70" />
                  <p className="font-semibold text-slate-300">Nenhuma revisão pendente nesta categoria!</p>
                  <p className="text-[11px] text-slate-400">
                    Seus conhecimentos estão com as revisões em dia ou você pode agendar novos conceitos.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredConcepts.map(item => {
                    const dueInfo = item.nextReviewDue ? formatFriendlyReviewDue(item.nextReviewDue) : null;
                    const diagMeta = getDiagnosticStateMeta(item.diagnosticState);

                    return (
                      <div
                        key={item.conceptId}
                        className={`p-4 rounded-xl border bg-slate-950/70 transition-all flex flex-col justify-between gap-3 ${
                          item.status === 'overdue'
                            ? 'border-rose-900/60 hover:border-rose-800'
                            : item.status === 'due_today'
                            ? 'border-amber-900/60 hover:border-amber-800'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                              {item.isFundamental ? 'Fundamental' : 'Complementar'}
                            </span>

                            {dueInfo ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${dueInfo.colorClass}`}
                              >
                                {dueInfo.label}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 border border-slate-800 italic">
                                Não agendado
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs font-bold text-white line-clamp-1">{item.conceptName}</h4>

                          <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
                            <span
                              className={`px-1.5 py-0.2 rounded font-semibold border ${diagMeta.badgeClass}`}
                            >
                              {diagMeta.label}
                            </span>
                            {item.stabilityDays !== null && (
                              <span>• S: {item.stabilityDays}d</span>
                            )}
                            {item.estimatedRetrievability !== null && (
                              <span>• R: {Math.round(item.estimatedRetrievability * 100)}%</span>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-[10.5px] text-slate-400">
                            {item.totalReviews} revisão(ões)
                          </span>

                          <button
                            type="button"
                            onClick={() => handleStartReview(item.conceptId)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                              item.status === 'untracked'
                                ? 'bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20'
                            }`}
                          >
                            <span>{item.status === 'untracked' ? 'Agendar' : 'Revisar Agora'}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
