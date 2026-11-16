import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  ArrowRight,
  TrendingUp,
  History,
  Layers,
  Award,
  Loader2,
  Lightbulb,
  Palette,
  Eye,
} from 'lucide-react';
import type {
  Concept,
  DocumentSource,
  ExplanationFeedback,
  LearningAttempt,
  ConceptMastery,
  DiagnosticState,
  MasteryLevel,
  VisualResource,
} from '../../types';
import { requestConceptQuestion, requestExplanationEvaluation } from '../../services/ai/aiClient';
import { workspaceStorage } from '../../services/storage/workspaceStorage';
import {
  saveLearningAttempt,
  saveConceptMastery,
  getAttemptsByConcept,
} from '../../services/persistence/indexedDb';
import { buildConsolidatedMasteryRecord } from '../../services/learning/masteryEngine';
import {
  getMasteryLevelMeta,
  getDiagnosticStateMeta,
  getRubricStatusMeta,
  verifyEvidenceCorrespondence,
} from '../../utils/pedagogicalLabels';

interface CrearExplainViewProps {
  concept: Concept;
  document: DocumentSource | null;
  documentExcerpts?: string[];
  sessionId: string;
  isCompleted: boolean;
  onCompleteAndAdvance: () => void;
  onAttemptCompleted: (attempt: LearningAttempt, mastery: ConceptMastery) => void;
  visualResources?: VisualResource[];
  onOpenVisualSupport?: () => void;
}

export const CrearExplainView: React.FC<CrearExplainViewProps> = ({
  concept,
  document,
  documentExcerpts = [],
  sessionId,
  isCompleted,
  onCompleteAndAdvance,
  onAttemptCompleted,
  visualResources = [],
  onOpenVisualSupport,
}) => {
  const [question, setQuestion] = useState<string>('');
  const [contextTip, setContextTip] = useState<string>('');
  const [studentExplanation, setStudentExplanation] = useState<string>('');
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<ExplanationFeedback | null>(null);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [hasViewedHint, setHasViewedHint] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNewAttemptForm, setShowNewAttemptForm] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadExistingContext() {
      if (!document) return;
      try {
        const pastAttempts = await getAttemptsByConcept(document.id, concept.id);
        if (isMounted) {
          setAttempts(pastAttempts);
          const explainAttempts = pastAttempts.filter(
            a => !a.activityType || a.activityType === 'explain'
          );
          if (explainAttempts.length > 0) {
            const last = explainAttempts[explainAttempts.length - 1];
            setCurrentFeedback(last.feedback);
            setQuestion(last.promptQuestion);
            setShowNewAttemptForm(false);
          } else {
            setShowNewAttemptForm(true);
            await fetchQuestion();
          }
        }
      } catch (err) {
        console.error('Erro ao carregar contexto de explicação:', err);
      }
    }

    loadExistingContext();

    return () => {
      isMounted = false;
    };
  }, [concept.id, document?.id]);

  const fetchQuestion = async () => {
    setIsGeneratingQuestion(true);
    setErrorMsg(null);
    try {
      const response = await requestConceptQuestion({
        documentTitle: document?.title || 'Material Acadêmico',
        subject: document?.subject,
        concept: {
          id: concept.id,
          name: concept.name,
          definition: concept.definition,
          prerequisiteConceptIds: concept.prerequisiteConceptIds,
        },
        documentExcerpts,
        activityType: 'explain',
      });
      setQuestion(response.question);
      setContextTip(response.contextTip || 'Lembre-se de descrever as causas, mecanismos e implicações fundamentais.');
    } catch {
      setQuestion(
        `Como você explicaria com suas próprias palavras o mecanismo de "${concept.name}", descrevendo suas causas, etapas funcionais e implicações essenciais?`
      );
      setContextTip('Foque nas relações de causa-efeito sem recorrer a memorização de definições prontas.');
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleEvaluateExplanation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentExplanation.trim() || !document) return;

    setIsEvaluating(true);
    setErrorMsg(null);

    const attemptNumber = attempts.length + 1;
    const effectiveQuestion = question || `Explique o mecanismo de "${concept.name}".`;

    try {
      const result = await requestExplanationEvaluation({
        documentId: document.id,
        documentTitle: document.title,
        subject: document.subject,
        concept: {
          id: concept.id,
          name: concept.name,
          definition: concept.definition,
          prerequisiteConceptIds: concept.prerequisiteConceptIds,
        },
        promptQuestion: effectiveQuestion,
        studentExplanation,
        attemptNumber,
        activityType: 'explain',
        previousAttempts: attempts.map(a => ({
          attemptNumber: a.attemptNumber,
          studentExplanation: a.studentExplanation,
          feedbackSummary: a.feedback.summary,
        })),
        documentExcerpts,
        usedPedagogicalHint: hasViewedHint,
      });

      const feedback = result.feedback;

      const newAttempt: LearningAttempt = {
        id: `attempt_${document.id}_${concept.id}_${Date.now()}`,
        sessionId,
        documentId: document.id,
        conceptId: concept.id,
        attemptNumber,
        promptQuestion: effectiveQuestion,
        studentExplanation,
        feedback,
        createdAt: Date.now(),
        usedPedagogicalHint: hasViewedHint,
        activityType: 'explain',
      };

      const updatedAttempts = [...attempts, newAttempt];
      const updatedMastery = buildConsolidatedMasteryRecord(
        document.id,
        concept.id,
        updatedAttempts
      );

      await Promise.all([
        workspaceStorage.saveLearningAttempt(newAttempt, document.subject || 'Geral'),
        workspaceStorage.saveLearningProgress(updatedMastery, undefined, document.subject || 'Geral'),
      ]);

      setAttempts(updatedAttempts);
      setCurrentFeedback(feedback);
      setShowNewAttemptForm(false);
      onAttemptCompleted(newAttempt, updatedMastery);
    } catch (err: any) {
      console.error('Falha na avaliação da explicação:', err);
      setErrorMsg(err.message || 'Falha ao processar avaliação com o modelo de IA.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Estágio */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/40">
              E
            </span>
            <h3 className="text-sm font-bold text-white">Estágio 3 — Explicar (Agora Eu Explico)</h3>
            {(isCompleted || currentFeedback) && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Avaliação Realizada
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Explique o mecanismo de <strong>"{concept.name}"</strong> com suas próprias palavras pela Técnica de Feynman.
            A resposta é avaliada em 5 dimensões cognitivas sem notas artificiais.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Exibição da Pergunta ou Formulário de Nova Tentativa */}
      {showNewAttemptForm ? (
        <form onSubmit={handleEvaluateExplanation} className="space-y-4">
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                Pergunta Desafiadora do Mecanismo
              </span>
              <button
                type="button"
                onClick={fetchQuestion}
                disabled={isGeneratingQuestion}
                className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${isGeneratingQuestion ? 'animate-spin' : ''}`} />
                Gerar outra pergunta
              </button>
            </div>

            {isGeneratingQuestion ? (
              <div className="flex items-center gap-2 py-3 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Formulando pergunta reflexiva em Português do Brasil...</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-200 bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 leading-relaxed">
                {question || 'Carregando pergunta...'}
              </p>
            )}

            {/* Apoio Pedagógico consciente */}
            {contextTip && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Apoio Pedagógico
                  </span>
                  {!hasViewedHint ? (
                    <button
                      type="button"
                      onClick={() => setHasViewedHint(true)}
                      className="text-[11px] text-amber-300 hover:text-amber-200 underline font-medium cursor-pointer"
                    >
                      Visualizar Dica de Apoio
                    </button>
                  ) : (
                    <span className="text-[10px] text-amber-400/80 italic">Apoio visualizado nesta tentativa</span>
                  )}
                </div>
                {hasViewedHint && (
                  <p className="text-xs text-amber-200/90 pl-5 leading-relaxed">{contextTip}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                Sua Explicação Científica ({studentExplanation.split(/\s+/).filter(Boolean).length} palavras):
              </label>
              {visualResources.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenVisualSupport}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white rounded-lg text-[11px] font-medium border border-cyan-800/40 transition-colors cursor-pointer"
                  title="Consultar recurso visual de apoio durante a formulação da explicação"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Consultar Apoio Visual ({visualResources.length})</span>
                </button>
              )}
            </div>
            <textarea
              value={studentExplanation}
              onChange={e => setStudentExplanation(e.target.value)}
              placeholder="Explique o mecanismo passo a passo, como se estivesse ensinando alguém. Descreva causas, etapas e conexões..."
              rows={6}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed transition-all"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              A avaliação analisará precisão, completude, coerência e relações causais.
            </span>
            <div className="flex items-center gap-2">
              {currentFeedback && (
                <button
                  type="button"
                  onClick={() => setShowNewAttemptForm(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={isEvaluating || !studentExplanation.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Avaliando Explicação...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Avaliar Minha Explicação (Tentativa #{attempts.length + 1})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Exibição do Feedback Existente */
        currentFeedback && (
          <div className="space-y-4">
            <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[10.5px] uppercase font-mono text-indigo-400">Diagnóstico da Explicação</span>
                  <p className="text-sm font-semibold text-slate-200 leading-relaxed">{currentFeedback.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-indigo-950/60 text-indigo-300 border-indigo-800/60">
                    Nível: {getMasteryLevelMeta(currentFeedback.evaluatedMasteryLevel).label}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-900 text-slate-300 border-slate-800">
                    Diagnóstico: {getDiagnosticStateMeta(currentFeedback.suggestedDiagnosticState).label}
                  </span>
                </div>
              </div>

              {/* Rubrica das 5 Dimensões Cognitivas */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Rubrica Multidimensional:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="font-semibold text-slate-300">Precisão Conceitual:</span>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {currentFeedback.rubric.conceptualPrecision.comment}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="font-semibold text-slate-300">Completude:</span>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {currentFeedback.rubric.completeness.comment}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="font-semibold text-slate-300">Relações Conceituais:</span>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {currentFeedback.rubric.conceptualRelationships.comment}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="font-semibold text-slate-300">Coerência do Raciocínio:</span>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">
                      {currentFeedback.rubric.reasoningCoherence.comment}
                    </p>
                  </div>
                </div>
              </div>

              {/* Elementos Compreendidos e Lacunas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {currentFeedback.understoodElements.length > 0 && (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg space-y-1">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Acertos Validados ({currentFeedback.understoodElements.length})
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
                    <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      Aspectos Incompletos ({currentFeedback.incompleteElements.length})
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

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStudentExplanation('');
                  setShowNewAttemptForm(true);
                }}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Nova Tentativa de Explicação</span>
              </button>

              <button
                type="button"
                onClick={onCompleteAndAdvance}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <span>Avançar para Aplicar (Cenário Prático)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

