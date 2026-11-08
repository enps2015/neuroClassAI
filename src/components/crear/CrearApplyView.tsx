import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Award,
  Loader2,
  Lightbulb,
  FileQuestion,
  Stethoscope,
} from 'lucide-react';
import type {
  Concept,
  DocumentSource,
  ExplanationFeedback,
  LearningAttempt,
  ConceptMastery,
} from '../../types';
import { requestConceptQuestion, requestExplanationEvaluation } from '../../services/ai/aiClient';
import {
  saveLearningAttempt,
  saveConceptMastery,
  getAttemptsByConcept,
} from '../../services/persistence/indexedDb';
import { buildConsolidatedMasteryRecord } from '../../services/learning/masteryEngine';
import { getMasteryLevelMeta, getDiagnosticStateMeta } from '../../utils/pedagogicalLabels';

interface CrearApplyViewProps {
  concept: Concept;
  document: DocumentSource | null;
  documentExcerpts?: string[];
  sessionId: string;
  isCompleted: boolean;
  onCompleteAndAdvance: () => void;
  onAttemptCompleted: (attempt: LearningAttempt, mastery: ConceptMastery) => void;
}

export const CrearApplyView: React.FC<CrearApplyViewProps> = ({
  concept,
  document,
  documentExcerpts = [],
  sessionId,
  isCompleted,
  onCompleteAndAdvance,
  onAttemptCompleted,
}) => {
  const [scenarioPrompt, setScenarioPrompt] = useState<string>('');
  const [contextTip, setContextTip] = useState<string>('');
  const [studentResponse, setStudentResponse] = useState<string>('');
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<ExplanationFeedback | null>(null);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [hasViewedHint, setHasViewedHint] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNewAttemptForm, setShowNewAttemptForm] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadApplyContext() {
      if (!document) return;
      try {
        const pastAttempts = await getAttemptsByConcept(document.id, concept.id);
        if (isMounted) {
          setAttempts(pastAttempts);
          const applyAttempts = pastAttempts.filter(a => a.activityType === 'apply');
          if (applyAttempts.length > 0) {
            const last = applyAttempts[applyAttempts.length - 1];
            setCurrentFeedback(last.feedback);
            setScenarioPrompt(last.promptQuestion);
            setShowNewAttemptForm(false);
          } else {
            setShowNewAttemptForm(true);
            await fetchScenario();
          }
        }
      } catch (err) {
        console.error('Erro ao carregar contexto de aplicação:', err);
      }
    }

    loadApplyContext();

    return () => {
      isMounted = false;
    };
  }, [concept.id, document?.id]);

  const fetchScenario = async () => {
    setIsGeneratingScenario(true);
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
        activityType: 'apply',
      });
      setScenarioPrompt(response.question);
      setContextTip(response.contextTip || 'Aplique os mecanismos do conceito para explicar ou solucionar a situação.');
    } catch {
      setScenarioPrompt(
        `Considere um cenário prático na área de ${document?.subject || 'estudo'} em que o mecanismo de "${concept.name}" sofre uma perturbação crítica. Como você aplicaria os princípios operacionais deste conceito para diagnosticar o problema e prever o desfecho?`
      );
      setContextTip('Conecte os dados concretos do caso aos mecanismos causais, evitando apenas repetir definições.');
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  const handleEvaluateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentResponse.trim() || !document) return;

    setIsEvaluating(true);
    setErrorMsg(null);

    const attemptNumber = attempts.length + 1;
    const effectivePrompt = scenarioPrompt || `Aplicação prática do conceito de ${concept.name}.`;

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
        promptQuestion: effectivePrompt,
        studentExplanation: studentResponse,
        attemptNumber,
        activityType: 'apply',
        scenarioContext: scenarioPrompt,
        documentExcerpts,
        usedPedagogicalHint: hasViewedHint,
      });

      const feedback = result.feedback;

      const newAttempt: LearningAttempt = {
        id: `attempt_${document.id}_${concept.id}_apply_${Date.now()}`,
        sessionId,
        documentId: document.id,
        conceptId: concept.id,
        attemptNumber,
        promptQuestion: effectivePrompt,
        studentExplanation: studentResponse,
        feedback,
        createdAt: Date.now(),
        usedPedagogicalHint: hasViewedHint,
        activityType: 'apply',
        scenarioContext: scenarioPrompt,
      };

      const updatedAttempts = [...attempts, newAttempt];
      const updatedMastery = buildConsolidatedMasteryRecord(
        document.id,
        concept.id,
        updatedAttempts
      );

      await Promise.all([
        saveLearningAttempt(newAttempt),
        saveConceptMastery(updatedMastery),
      ]);

      setAttempts(updatedAttempts);
      setCurrentFeedback(feedback);
      setShowNewAttemptForm(false);
      onAttemptCompleted(newAttempt, updatedMastery);
    } catch (err: any) {
      console.error('Falha na avaliação da aplicação:', err);
      setErrorMsg(err.message || 'Falha ao processar avaliação da aplicação prática.');
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
            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/40">
              A
            </span>
            <h3 className="text-sm font-bold text-white">Estágio 4 — Aplicar</h3>
            {(isCompleted || currentFeedback) && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Aplicação Avaliada
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Aplique o mecanismo de <strong>"{concept.name}"</strong> para solucionar um caso prático ou cenário experimental.
            A avaliação distingue aplicação concreta e resolutiva de mera repetição da definição teórica.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {showNewAttemptForm ? (
        <form onSubmit={handleEvaluateApplication} className="space-y-4">
          {/* Card do Cenário Prático */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4" />
                Cenário Prático / Problema Concreto
              </span>
              <button
                type="button"
                onClick={fetchScenario}
                disabled={isGeneratingScenario}
                className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${isGeneratingScenario ? 'animate-spin' : ''}`} />
                Gerar outro cenário
              </button>
            </div>

            {isGeneratingScenario ? (
              <div className="flex items-center gap-2 py-3 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Formulando cenário de aplicação prática em Português do Brasil...</span>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-900/80 rounded-lg border border-slate-800 leading-relaxed text-slate-200 text-sm">
                {scenarioPrompt || 'Carregando cenário...'}
              </div>
            )}

            {contextTip && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Orientação de Aplicação
                  </span>
                  {!hasViewedHint ? (
                    <button
                      type="button"
                      onClick={() => setHasViewedHint(true)}
                      className="text-[11px] text-emerald-300 hover:text-emerald-200 underline font-medium cursor-pointer"
                    >
                      Visualizar Dica de Apoio
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-400/80 italic">Apoio visualizado</span>
                  )}
                </div>
                {hasViewedHint && (
                  <p className="text-xs text-emerald-200/90 pl-5 leading-relaxed">{contextTip}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Sua Resolução Aplicada ({studentResponse.split(/\s+/).filter(Boolean).length} palavras):
            </label>
            <textarea
              value={studentResponse}
              onChange={e => setStudentResponse(e.target.value)}
              placeholder="Descreva sua análise prática: como os mecanismos do conceito se comportam neste caso específico, quais causas geram os efeitos observados e qual a solução/prognóstico fundamentado..."
              rows={6}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans leading-relaxed transition-all"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Critério: A resposta deve solucionar o caso integrando os mecanismos de causa-efeito.
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
                disabled={isEvaluating || !studentResponse.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Avaliando Aplicação...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Avaliar Aplicação Prática</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Feedback da Aplicação Prática */
        currentFeedback && (
          <div className="space-y-4">
            <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[10.5px] uppercase font-mono text-emerald-400">Resultado da Aplicação Prática</span>
                  <p className="text-sm font-semibold text-slate-200 leading-relaxed">{currentFeedback.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      currentFeedback.rubric.knowledgeApplication.qualitativeStatus === 'applied'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                        : 'bg-amber-950/80 text-amber-300 border-amber-700'
                    }`}
                  >
                    Aplicação:{' '}
                    {currentFeedback.rubric.knowledgeApplication.qualitativeStatus === 'applied'
                      ? 'Efetiva e Prática'
                      : 'Apenas Teórica'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-900 text-slate-300 border-slate-800">
                    Nível: {getMasteryLevelMeta(currentFeedback.evaluatedMasteryLevel).label}
                  </span>
                </div>
              </div>

              {/* Avaliação Específica de Aplicação */}
              <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-lg space-y-1">
                <span className="font-semibold text-xs text-slate-300">Análise da Aplicação do Conhecimento:</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {currentFeedback.rubric.knowledgeApplication.comment}
                </p>
              </div>

              {/* Sugestões de Aprimoramento */}
              {currentFeedback.improvementSuggestions.length > 0 && (
                <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-lg space-y-1">
                  <span className="font-semibold text-xs text-cyan-300">Sugestões de Aprofundamento Prático:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-xs">
                    {currentFeedback.improvementSuggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStudentResponse('');
                  setShowNewAttemptForm(true);
                }}
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Resolver Outro Cenário Prático</span>
              </button>

              <button
                type="button"
                onClick={onCompleteAndAdvance}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <span>Avançar para Recuperar (Evocação Ativa)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

