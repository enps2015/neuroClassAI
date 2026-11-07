import React, { useState, useEffect } from 'react';
import {
  X,
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
} from 'lucide-react';
import type {
  Concept,
  DocumentSource,
  LearningAttempt,
  ConceptMastery,
  DiagnosticState,
  MasteryLevel,
  ExplanationFeedback,
  EvidenceReference,
} from '../../types';
import { requestConceptQuestion, requestExplanationEvaluation } from '../../services/ai/aiClient';
import {
  saveLearningAttempt,
  getAttemptsByConcept,
  getConceptMastery,
  saveConceptMastery,
  buildMasteryKey,
} from '../../services/persistence/indexedDb';
import {
  getMasteryLevelMeta,
  getDiagnosticStateMeta,
  getRubricStatusMeta,
  formatAttemptsCount,
  verifyEvidenceCorrespondence,
} from '../../utils/pedagogicalLabels';

interface AgoraEuExplicoModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentSource | null;
  activeConcept: Concept | null;
  allConcepts: Concept[];
  documentExcerpts?: string[];
  onConceptStateChanged?: (conceptId: string, newState: DiagnosticState) => void;
}

export const AgoraEuExplicoModal: React.FC<AgoraEuExplicoModalProps> = ({
  isOpen,
  onClose,
  document,
  activeConcept,
  allConcepts,
  documentExcerpts = [],
  onConceptStateChanged,
}) => {
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(activeConcept);
  const [question, setQuestion] = useState<string>('');
  const [contextTip, setContextTip] = useState<string>('');
  const [studentExplanation, setStudentExplanation] = useState<string>('');
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<ExplanationFeedback | null>(null);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [activeAttemptIndex, setActiveAttemptIndex] = useState<number | null>(null);
  const [mastery, setMastery] = useState<ConceptMastery | null>(null);
  const [activeTab, setActiveTab] = useState<'explain' | 'feedback' | 'history'>('explain');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasViewedHint, setHasViewedHint] = useState<boolean>(false);

  // Sincronizar com conceito externo quando o modal abrir
  useEffect(() => {
    if (activeConcept) {
      setSelectedConcept(activeConcept);
    } else if (allConcepts.length > 0 && !selectedConcept) {
      setSelectedConcept(allConcepts[0]);
    }
  }, [activeConcept, allConcepts]);

  // Carregar histórico de tentativas e gerar/carregar pergunta ao trocar conceito
  useEffect(() => {
    if (!isOpen || !selectedConcept || !document) return;

    let isMounted = true;

    async function loadConceptContext() {
      setErrorMsg(null);
      setCurrentFeedback(null);
      setStudentExplanation('');
      setHasViewedHint(false);

      // 1. Carregar maestria e tentativas persistidas no IndexedDB
      try {
        const [existingMastery, previousAttempts] = await Promise.all([
          getConceptMastery(document!.id, selectedConcept!.id),
          getAttemptsByConcept(document!.id, selectedConcept!.id),
        ]);

        if (isMounted) {
          setMastery(existingMastery || null);
          setAttempts(previousAttempts);

          if (previousAttempts.length > 0) {
            const last = previousAttempts[previousAttempts.length - 1];
            setCurrentFeedback(last.feedback);
            setQuestion(last.promptQuestion);
            setActiveAttemptIndex(previousAttempts.length - 1);
            setActiveTab('feedback');
          } else {
            setActiveTab('explain');
            // Formular pergunta inicial baseada no conceito
            await fetchOrFormulateQuestion(selectedConcept!);
          }
        }
      } catch (err) {
        console.error('Falha ao carregar tentativas anteriores:', err);
      }
    }

    loadConceptContext();

    return () => {
      isMounted = false;
    };
  }, [selectedConcept?.id, document?.id, isOpen]);

  const fetchOrFormulateQuestion = async (concept: Concept) => {
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
      });

      setQuestion(response.question);
      setContextTip(response.contextTip || 'Lembre-se de descrever o mecanismo e relações de causa-efeito.');
    } catch {
      // Fallback gracioso local estritamente em Português do Brasil (PT-BR)
      setQuestion(
        `Como você explicaria o conceito de "${concept.name}" para um colega, detalhando como ele funciona, seus mecanismos e por que é fundamental na área?`
      );
      setContextTip('Concentre-se em explicar o mecanismo de causa-efeito e cite exemplos concretos.');
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleEvaluate = async () => {
    if (!studentExplanation.trim() || !selectedConcept || !document) return;
    if (studentExplanation.trim().length < 20) {
      setErrorMsg('Sua explicação está muito curta. Tente elaborar com mais detalhes o mecanismo.');
      return;
    }

    setIsEvaluating(true);
    setErrorMsg(null);

    const attemptNumber = attempts.length + 1;
    const sessionId = `session_${document.id}_${Date.now()}`;
    const effectiveQuestion =
      question.trim() ||
      `Explique detalhadamente o conceito de "${selectedConcept.name}", descrevendo seus mecanismos, etapas e implicações.`;

    if (!question.trim()) {
      setQuestion(effectiveQuestion);
    }

    try {
      const result = await requestExplanationEvaluation({
        documentId: document.id,
        documentTitle: document.title,
        subject: document.subject,
        concept: {
          id: selectedConcept.id,
          name: selectedConcept.name,
          definition: selectedConcept.definition,
          prerequisiteConceptIds: selectedConcept.prerequisiteConceptIds,
        },
        promptQuestion: effectiveQuestion,
        studentExplanation,
        attemptNumber,
        previousAttempts: attempts.map(a => ({
          attemptNumber: a.attemptNumber,
          studentExplanation: a.studentExplanation,
          feedbackSummary: a.feedback.summary,
        })),
        documentExcerpts,
        usedPedagogicalHint: hasViewedHint,
      });

      const feedback = result.feedback;

      // Criar registro da tentativa
      const newAttempt: LearningAttempt = {
        id: `attempt_${document.id}_${selectedConcept.id}_${Date.now()}`,
        sessionId,
        documentId: document.id,
        conceptId: selectedConcept.id,
        attemptNumber,
        promptQuestion: effectiveQuestion,
        studentExplanation,
        feedback,
        createdAt: Date.now(),
        usedPedagogicalHint: hasViewedHint,
      };

      // Atualizar / Consolidar Maestria do Conceito
      const updatedMastery: ConceptMastery = {
        id: buildMasteryKey(document.id, selectedConcept.id),
        documentId: document.id,
        conceptId: selectedConcept.id,
        masteryLevel: feedback.evaluatedMasteryLevel,
        diagnosticState: feedback.suggestedDiagnosticState,
        totalAttempts: attemptNumber,
        lastAttemptAt: Date.now(),
        historyAttemptIds: [...(mastery?.historyAttemptIds || []), newAttempt.id],
        activeGaps: feedback.identifiedGaps || [],
        consolidatedEvidenceIds: [
          ...(mastery?.consolidatedEvidenceIds || []),
          ...feedback.groundingEvidences.map(e => e.id),
        ],
      };

      // Persistir no IndexedDB
      await Promise.all([
        saveLearningAttempt(newAttempt),
        saveConceptMastery(updatedMastery),
      ]);

      setAttempts(prev => [...prev, newAttempt]);
      setCurrentFeedback(feedback);
      setMastery(updatedMastery);
      setActiveAttemptIndex(attempts.length);
      setActiveTab('feedback');

      if (onConceptStateChanged) {
        onConceptStateChanged(selectedConcept.id, feedback.suggestedDiagnosticState);
      }
    } catch (err: any) {
      console.error('Falha na avaliação da explicação:', err);
      setErrorMsg(
        err.message ||
          'Não foi possível conectar ao motor avaliador. Verifique a configuração da chave da API ou tente novamente.'
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleStartRefinement = () => {
    setActiveTab('explain');
    setHasViewedHint(false); // Reinicia o apoio pedagógico para permitir demonstração autônoma na nova tentativa
    // Preenche com a explicação anterior para permitir aperfeiçoamento iterativo
    if (activeAttemptIndex !== null && attempts[activeAttemptIndex]) {
      setStudentExplanation(attempts[activeAttemptIndex].studentExplanation);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">Agora Eu Explico</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Técnica de Feynman / C.R.E.A.R.
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Explique o conceito com suas próprias palavras para avaliar sua precisão, coerência e profundidade.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Navegação de Abas e Seletor de Conceito */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Seletor de Conceito Ativo */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Conceito em Foco:</span>
            <select
              value={selectedConcept?.id || ''}
              onChange={e => {
                const found = allConcepts.find(c => c.id === e.target.value);
                if (found) setSelectedConcept(found);
              }}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {allConcepts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.importance === 'fundamental' ? 'Pilar Fundamental' : 'Complementar'})
                </option>
              ))}
            </select>

            {mastery && (
              <div className="ml-2 flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium text-[11px] flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  Domínio Acumulado: {getMasteryLevelMeta(mastery.masteryLevel).label} ({formatAttemptsCount(mastery.totalAttempts)})
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium text-[11px]">
                  Diagnóstico: {getDiagnosticStateMeta(mastery.diagnosticState).label}
                </span>
              </div>
            )}
          </div>

          {/* Abas */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('explain')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'explain'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Explicar
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              disabled={!currentFeedback}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'feedback'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : currentFeedback
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
            >
              Feedback Avaliativo
              {attempts.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center">
                  {attempts.length}
                </span>
              )}
            </button>
            {attempts.length > 1 && (
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                  activeTab === 'history'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3 h-3" />
                Histórico
              </button>
            )}
          </div>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ABA 1: FORMULAÇÃO E EXPLICAÇÃO */}
          {activeTab === 'explain' && (
            <div className="space-y-5">
              {/* Card da Pergunta Aberta Contextualizada */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" />
                    Pergunta Desafiadora do Conceito
                  </span>
                  <button
                    onClick={() => selectedConcept && fetchOrFormulateQuestion(selectedConcept)}
                    disabled={isGeneratingQuestion}
                    className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <RotateCcw className={`w-3 h-3 ${isGeneratingQuestion ? 'animate-spin' : ''}`} />
                    Gerar outra pergunta
                  </button>
                </div>

                {isGeneratingQuestion ? (
                  <div className="flex items-center gap-2 py-4 text-slate-500 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Formulando pergunta reflexiva contextualizada para {selectedConcept?.name}...</span>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-slate-200 leading-relaxed bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/80">
                    {question || 'Carregando pergunta...'}
                  </p>
                )}

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
                        <span className="text-[10px] text-amber-400/80 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Apoio Pedagógico Consultado
                        </span>
                      )}
                    </div>
                    {hasViewedHint ? (
                      <p className="text-xs text-amber-300/90 leading-relaxed pt-1">
                        {contextTip}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        A dica pedagógica orienta sobre aspectos essenciais sem revelar a resposta.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Área de Digitação da Explicação */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <label htmlFor="student-explanation" className="font-medium text-slate-300">
                    Sua Explicação Científica:
                  </label>
                  <span>{studentExplanation.trim().split(/\s+/).filter(Boolean).length} palavras</span>
                </div>

                <textarea
                  id="student-explanation"
                  rows={8}
                  value={studentExplanation}
                  onChange={e => setStudentExplanation(e.target.value)}
                  placeholder="Explique o fenômeno passo a passo, como se estivesse ensinando alguém. Descreva o mecanismo de causa-efeito, termos essenciais e conexões com conceitos prévios..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                />
              </div>

              {/* Botão de Envio para Avaliação */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-slate-500">
                  💡 A avaliação analisará precisão conceitual, completude, coerência e aplicação prática.
                </p>
                <button
                  onClick={handleEvaluate}
                  disabled={isEvaluating || studentExplanation.trim().length < 15}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analisando Explicação...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Avaliar Minha Explicação (Tentativa #{attempts.length + 1})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ABA 2: FEEDBACK FORMATIVO DETALHADO */}
          {activeTab === 'feedback' && currentFeedback && (
            <div className="space-y-6">
              {/* Banner de Resumo da Avaliação */}
              <div className="p-4 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                    Diagnóstico da Tentativa
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Desempenho nesta Tentativa: {getMasteryLevelMeta(currentFeedback.evaluatedMasteryLevel).label}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold border ${
                        currentFeedback.suggestedDiagnosticState === 'mastered'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : currentFeedback.suggestedDiagnosticState === 'understood'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      Diagnóstico: {getDiagnosticStateMeta(currentFeedback.suggestedDiagnosticState).label}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                  {currentFeedback.summary}
                </p>
                <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Nota Pedagógica: Uma resposta isolada demonstra desempenho pontual e não constitui domínio consolidado permanente.
                  </span>
                  {attempts.length > 0 && (
                    <span className="text-indigo-400 font-medium">
                      Histórico acumulado: {formatAttemptsCount(attempts.length)}
                    </span>
                  )}
                </div>
              </div>

              {/* Rubrica Multidimensional em 5 Eixos */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Avaliação por Dimensão Cognitiva
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* 1. Precisão Conceitual */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-300">1. Precisão Conceitual</span>
                      {(() => {
                        const meta = getRubricStatusMeta(currentFeedback.rubric.conceptualPrecision.qualitativeStatus);
                        return <span className={`text-[11px] font-bold ${meta.colorClass}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      {currentFeedback.rubric.conceptualPrecision.comment}
                    </p>
                  </div>

                  {/* 2. Completude */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-300">2. Completude do Fenômeno</span>
                      {(() => {
                        const meta = getRubricStatusMeta(currentFeedback.rubric.completeness.qualitativeStatus);
                        return <span className={`text-[11px] font-bold ${meta.colorClass}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      {currentFeedback.rubric.completeness.comment}
                    </p>
                  </div>

                  {/* 3. Relações Conceituais */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-300">3. Relações com Pré-requisitos</span>
                      {(() => {
                        const meta = getRubricStatusMeta(currentFeedback.rubric.conceptualRelationships.qualitativeStatus);
                        return <span className={`text-[11px] font-bold ${meta.colorClass}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      {currentFeedback.rubric.conceptualRelationships.comment}
                    </p>
                  </div>

                  {/* 4. Coerência do Raciocínio */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-300">4. Coerência e Encadeamento Lógico</span>
                      {(() => {
                        const meta = getRubricStatusMeta(currentFeedback.rubric.reasoningCoherence.qualitativeStatus);
                        return <span className={`text-[11px] font-bold ${meta.colorClass}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      {currentFeedback.rubric.reasoningCoherence.comment}
                    </p>
                  </div>

                  {/* 5. Aplicação do Conhecimento */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1 md:col-span-2">
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-slate-300">5. Aplicação Prática / Exemplificação</span>
                      {(() => {
                        const meta = getRubricStatusMeta(currentFeedback.rubric.knowledgeApplication.qualitativeStatus);
                        return <span className={`text-[11px] font-bold ${meta.colorClass}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      {currentFeedback.rubric.knowledgeApplication.comment}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cards de Decomposição Analítica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Elementos Compreendidos */}
                {currentFeedback.understoodElements.length > 0 && (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2">
                    <h5 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Compreendido com Clareza
                    </h5>
                    <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                      {currentFeedback.understoodElements.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Aspectos Incompletos */}
                {currentFeedback.incompleteElements.length > 0 && (
                  <div className="p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl space-y-2">
                    <h5 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Aspectos para Aprofundar
                    </h5>
                    <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                      {currentFeedback.incompleteElements.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Equívocos Conceituais */}
                {currentFeedback.misconceptions.length > 0 && (
                  <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-2 md:col-span-2">
                    <h5 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Ajustes Conceituais Necessários
                    </h5>
                    <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                      {currentFeedback.misconceptions.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Fundamentação em Evidências do Documento */}
              {currentFeedback.groundingEvidences.length > 0 && (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    Fundamentação Documental de Referência
                  </h5>
                  <div className="space-y-2">
                    {currentFeedback.groundingEvidences.map((ev, idx) => {
                      const pageNum = 'pageNumber' in ev ? (ev as any).pageNumber : undefined;
                      const figLabel = 'figureLabel' in ev ? (ev as any).figureLabel : undefined;
                      const label = ev.type === 'pdf_page' || pageNum
                        ? `Página ${pageNum || 'Referenciada'}`
                        : ev.type === 'note_section'
                        ? `Seção "${(ev as any).sectionTitle}"`
                        : 'Trecho Textual';

                      const verification = verifyEvidenceCorrespondence(ev.excerpt, documentExcerpts);

                      return (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[11px] text-indigo-400 font-medium">
                            <span>
                              {label}
                              {figLabel ? ` (${figLabel})` : ''}
                            </span>
                            {verification.isLiteralQuote ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                                Citação Literal Verificada
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
                                Síntese Temática da Fonte
                              </span>
                            )}
                          </div>
                          {verification.isLiteralQuote ? (
                            <p className="text-slate-300 italic">"{ev.excerpt}"</p>
                          ) : (
                            <p className="text-slate-300">{ev.excerpt}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sugestões de Melhoria e Botão de Refinamento */}
              {currentFeedback.improvementSuggestions.length > 0 && (
                <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-3">
                  <h5 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Próximos Passos Recomendados
                  </h5>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {currentFeedback.improvementSuggestions.map((sug, idx) => (
                      <li key={idx}>{sug}</li>
                    ))}
                  </ul>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleStartRefinement}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all"
                    >
                      <span>Refinar Explicação (Nova Tentativa)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 3: HISTÓRICO DE TENTATIVAS */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Evolução das Explicações ({attempts.length} tentativas registradas)
              </h4>

              <div className="space-y-3">
                {attempts.map((att, idx) => (
                  <div
                    key={att.id}
                    onClick={() => {
                      setCurrentFeedback(att.feedback);
                      setQuestion(att.promptQuestion);
                      setActiveAttemptIndex(idx);
                      setActiveTab('feedback');
                    }}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
                      activeAttemptIndex === idx
                        ? 'bg-slate-900 border-indigo-500'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-200">
                        Tentativa #{att.attemptNumber} — {new Date(att.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold text-[11px]">
                        Desempenho: {getMasteryLevelMeta(att.feedback.evaluatedMasteryLevel).label}
                      </span>
                    </div>

                    <p className="text-slate-400 line-clamp-2 italic mb-2">
                      "{att.studentExplanation}"
                    </p>

                    <p className="text-[11px] text-slate-500">
                      Feedback: {att.feedback.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
