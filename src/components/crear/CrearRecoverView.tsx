import React, { useState, useEffect } from 'react';
import {
  Brain,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Award,
  Loader2,
  Lightbulb,
  Sparkles,
  PartyPopper,
  ShieldAlert,
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

interface CrearRecoverViewProps {
  concept: Concept;
  document: DocumentSource | null;
  documentExcerpts?: string[];
  sessionId: string;
  isCompleted: boolean;
  onCycleCompleted: () => void;
  onAttemptCompleted: (attempt: LearningAttempt, mastery: ConceptMastery) => void;
}

export const CrearRecoverView: React.FC<CrearRecoverViewProps> = ({
  concept,
  document,
  documentExcerpts = [],
  sessionId,
  isCompleted,
  onCycleCompleted,
  onAttemptCompleted,
}) => {
  const [retrievalQuestion, setRetrievalQuestion] = useState<string>('');
  const [contextTip, setContextTip] = useState<string>('');
  const [studentResponse, setStudentResponse] = useState<string>('');
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<ExplanationFeedback | null>(null);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNewAttemptForm, setShowNewAttemptForm] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRecoverContext() {
      if (!document) return;
      try {
        const pastAttempts = await getAttemptsByConcept(document.id, concept.id);
        if (isMounted) {
          setAttempts(pastAttempts);
          const recoverAttempts = pastAttempts.filter(a => a.activityType === 'recover');
          if (recoverAttempts.length > 0) {
            const last = recoverAttempts[recoverAttempts.length - 1];
            setCurrentFeedback(last.feedback);
            setRetrievalQuestion(last.promptQuestion);
            setShowNewAttemptForm(false);
          } else {
            setShowNewAttemptForm(true);
            await fetchRetrievalQuestion();
          }
        }
      } catch (err) {
        console.error('Erro ao carregar contexto de recuperação:', err);
      }
    }

    loadRecoverContext();

    return () => {
      isMounted = false;
    };
  }, [concept.id, document?.id]);

  const fetchRetrievalQuestion = async () => {
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
        activityType: 'recover',
      });
      setRetrievalQuestion(response.question);
      setContextTip(response.contextTip || 'Evite consultar o material neste momento. Foque em evocar os passos causais da memória.');
    } catch {
      setRetrievalQuestion(
        `Sem consultar o material ou anotações prévias, reconstrua de memória os passos fundamentais do mecanismo de "${concept.name}". Quais são as causas iniciais, a sequência de eventos e as consequências indispensáveis para sua ocorrência?`
      );
      setContextTip('A evocação ativa esforçada fortalece a consolidação neural das vias de recuperação.');
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleEvaluateRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentResponse.trim() || !document) return;

    setIsEvaluating(true);
    setErrorMsg(null);

    const attemptNumber = attempts.length + 1;
    const effectivePrompt = retrievalQuestion || `Recuperação ativa do conceito de ${concept.name}.`;

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
        activityType: 'recover',
        documentExcerpts,
        usedPedagogicalHint: false, // Recuperação ativa é por definição autônoma e sem consulta
      });

      const feedback = result.feedback;

      const newAttempt: LearningAttempt = {
        id: `attempt_${document.id}_${concept.id}_recover_${Date.now()}`,
        sessionId,
        documentId: document.id,
        conceptId: concept.id,
        attemptNumber,
        promptQuestion: effectivePrompt,
        studentExplanation: studentResponse,
        feedback,
        createdAt: Date.now(),
        usedPedagogicalHint: false,
        activityType: 'recover',
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
      console.error('Falha na avaliação da recuperação:', err);
      setErrorMsg(err.message || 'Falha ao processar avaliação da recuperação ativa.');
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
            <span className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 font-bold text-xs flex items-center justify-center border border-rose-500/40">
              R
            </span>
            <h3 className="text-sm font-bold text-white">Estágio 5 — Recuperar (Evocação Ativa)</h3>
            {(isCompleted || currentFeedback) && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Evocação Registrada
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Exercite o efeito da testagem (<em>testing effect</em>) evocando da memória a dinâmica funcional de{' '}
            <strong>"{concept.name}"</strong> sem consultar anotações ou páginas do material.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {showNewAttemptForm ? (
        <form onSubmit={handleEvaluateRetrieval} className="space-y-4">
          {/* Card do Desafio de Evocação */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                <Brain className="w-4 h-4" />
                Desafio de Evocação Ativa da Memória
              </span>
              <button
                type="button"
                onClick={fetchRetrievalQuestion}
                disabled={isGeneratingQuestion}
                className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${isGeneratingQuestion ? 'animate-spin' : ''}`} />
                Nova formulação
              </button>
            </div>

            {isGeneratingQuestion ? (
              <div className="flex items-center gap-2 py-3 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                <span>Formulando desafio de evocação em Português do Brasil...</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-200 bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 leading-relaxed">
                {retrievalQuestion || 'Carregando desafio...'}
              </p>
            )}

            <div className="p-3 bg-rose-950/20 border border-rose-800/30 rounded-lg flex items-start gap-2 text-xs text-rose-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <p className="text-[11.5px] text-rose-300/90 leading-relaxed">
                <strong>Regra de Ouro da Evocação:</strong> Não consulte o texto agora. O esforço cognitivo de
                reconstrução da memória é o gatilho biológico para a plasticidade sináptica e retenção duradoura.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Sua Reconstrução da Memória ({studentResponse.split(/\s+/).filter(Boolean).length} palavras):
            </label>
            <textarea
              value={studentResponse}
              onChange={e => setStudentResponse(e.target.value)}
              placeholder="Reconstrua a sequência dos eventos como estão gravados em sua memória: etapas iniciais, mediadores, conexões e resultado final..."
              rows={6}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-sans leading-relaxed transition-all"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              A resposta será comparada às definições originais para diagnosticar lacunas de retenção.
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
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Avaliando Evocação...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Concluir Evocação Ativa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Feedback da Evocação Ativa e Conclusão */
        currentFeedback && (
          <div className="space-y-4">
            <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[10.5px] uppercase font-mono text-rose-400">Diagnóstico de Evocação da Memória</span>
                  <p className="text-sm font-semibold text-slate-200 leading-relaxed">{currentFeedback.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-900 text-slate-300 border-slate-800">
                    Nível: {getMasteryLevelMeta(currentFeedback.evaluatedMasteryLevel).label}
                  </span>
                </div>
              </div>

              {/* Análise de Fidelidade da Memória */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg space-y-1">
                  <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Elos Causalmente Recuperados ({currentFeedback.understoodElements.length})
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11.5px]">
                    {currentFeedback.understoodElements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg space-y-1">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Lacunas de Retenção Diagnosticadas ({currentFeedback.incompleteElements.length})
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11.5px]">
                    {currentFeedback.incompleteElements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Notificação de Conclusão do Ciclo C.R.E.A.R. */}
              <div className="p-4 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 border border-cyan-500/30 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/40">
                  <PartyPopper className="w-5 h-5 text-cyan-300" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">Ciclo C.R.E.A.R. Completo para "{concept.name}"!</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Você percorreu todos os 5 estágios: Contextualizar, Relacionar, Explicar, Aplicar e Recuperar.
                    Suas evidências foram consolidadas no histórico cognitivo.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStudentResponse('');
                  setShowNewAttemptForm(true);
                }}
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Nova Prática de Evocação</span>
              </button>

              <button
                type="button"
                onClick={onCycleCompleted}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Finalizar Ciclo C.R.E.A.R.</span>
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

