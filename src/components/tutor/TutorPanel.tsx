import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Send,
  Sparkles,
  Lightbulb,
  HelpCircle,
  Compass,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square,
  RotateCcw,
  AlertCircle,
  Info,
  X,
  Headphones,
  Check,
  Gauge,
  Palette,
  Eye,
  BookmarkPlus,
  BookmarkCheck,
} from 'lucide-react';
import type { Concept, DocumentSource, TutorChatMessage, VisualResource, StudyNote, SemanticEvaluationResponse } from '../../types';
import { requestTutorResponse, requestAudioTranscription, requestSemanticGroundingEvaluation } from '../../services/ai/aiClient';
import {
  speechRecognitionService,
  speechSynthesisService,
  audioDeviceService,
  VoiceSynthesisState,
  VOICE_PRIVACY_DISCLOSURE,
} from '../../services/voice';
import { AudioDeviceModal } from '../voice/AudioDeviceModal';
import { visualLearningService } from '../../services/visual/visualLearningService';
import { VisualSupportViewerModal } from '../visual/VisualSupportViewerModal';
import { buildTutorGroundedContext, validateCitations } from '../../services/retrieval/tutorContextBuilder';
import { processResponseGroundingSegments } from '../../services/retrieval/claimSegmenter';
import {
  resolveTutorVisualAssets,
  isVisualIntentQuery,
} from '../../services/retrieval/tutorVisualResolverService';
import { workspaceStorage } from '../../services/storage/workspaceStorage';
import type { TutorVisualAsset } from '../../types/rag';

export interface TutorPanelRef {
  askAboutConcept: (concept: Concept) => void;
}

interface TutorPanelProps {
  activeDocument: DocumentSource | null;
  activeConcept: Concept | null;
  chatHistory: TutorChatMessage[];
  onAddMessage: (msg: TutorChatMessage) => void;
  onRequestSelectConcept?: (conceptId: string) => void;
  onOpenVisualGenerator?: (concept: Concept) => void;
  onSaveNote?: (note: StudyNote) => Promise<void>;
}

/**
 * Renderizador de Markdown sutil e robusto para o chat, sem depender de bibliotecas externas pesadas.
 * Processa negrito (**texto**), itálico (*texto*), cabeçalhos (### Título) e listas (* item).
 */
const FormattedTutorText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-xs">
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();

        // Linha vazia
        if (!trimmed) {
          return <div key={lineIndex} className="h-1.5" />;
        }

        // Divisor horizontal
        if (trimmed === '---' || trimmed === '***') {
          return <hr key={lineIndex} className="border-slate-700/60 my-2" />;
        }

        // Cabeçalhos Markdown (### ou ## ou #)
        if (trimmed.startsWith('#')) {
          const level = (trimmed.match(/^#+/) || ['#'])[0].length;
          const headerText = trimmed.replace(/^#+\s*/, '');
          return (
            <div
              key={lineIndex}
              className={`font-bold tracking-tight text-cyan-300 mt-2 mb-1 ${
                level === 1 ? 'text-sm text-white' : level === 2 ? 'text-xs text-cyan-200' : 'text-xs text-cyan-300'
              }`}
            >
              {parseInlineMarkdown(headerText)}
            </div>
          );
        }

        // Listas com marcadores (* ou -)
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const itemText = trimmed.slice(2);
          return (
            <div key={lineIndex} className="flex items-start gap-2 pl-2">
              <span className="text-cyan-400 font-bold shrink-0 leading-tight">•</span>
              <span className="flex-1">{parseInlineMarkdown(itemText)}</span>
            </div>
          );
        }

        // Lista numerada (1. ou 2.)
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
          return (
            <div key={lineIndex} className="flex items-start gap-1.5 pl-2">
              <span className="text-violet-400 font-mono text-[11px] font-semibold shrink-0">
                {numberedMatch[1]}.
              </span>
              <span className="flex-1">{parseInlineMarkdown(numberedMatch[2])}</span>
            </div>
          );
        }

        // Parágrafo regular
        return <p key={lineIndex}>{parseInlineMarkdown(line)}</p>;
      })}
    </div>
  );
};

/**
 * Converte **negrito**, *itálico*, `código inline` e citações simples.
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[C\d+\])/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="bg-slate-900 px-1 py-0.5 rounded text-[11px] font-mono text-cyan-300 border border-slate-700/60">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\[C\d+\]$/.test(part)) {
      return (
        <span
          key={index}
          className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 mx-0.5 align-baseline select-none"
          title={`Citação documental verificada: ${part}`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

export const TutorPanel = forwardRef<TutorPanelRef, TutorPanelProps>(({
  activeDocument,
  activeConcept,
  chatHistory,
  onAddMessage,
  onOpenVisualGenerator,
  onSaveNote,
}, ref) => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Estados de Salvamento Rápido no Caderno de Estudos
  const [savedNoteMessageIds, setSavedNoteMessageIds] = useState<Set<string>>(new Set());
  const [savingNoteMessageId, setSavingNoteMessageId] = useState<string | null>(null);

  // Estados de Interação por Voz (Voice v1)
  const [isListening, setIsListening] = useState(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [autoPlayVoice, setAutoPlayVoice] = useState(false);
  const [synthesisState, setSynthesisState] = useState<VoiceSynthesisState>('idle');
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);
  const [currentlyPlayingMessageId, setCurrentlyPlayingMessageId] = useState<string | null>(null);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(() => speechSynthesisService.getPlaybackRate());
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const audioMonitorCleanupRef = useRef<(() => void) | null>(null);
  const audioRecordingRef = useRef<{
    stop: () => Promise<{ blob: Blob; mimeType: string }>;
    cancel: () => void;
  } | null>(null);

  // Estados de Apoio Visual Didático (Visual Learning v1.1)
  const [conceptVisuals, setConceptVisuals] = useState<VisualResource[]>([]);
  const [isVisualViewerOpen, setIsVisualViewerOpen] = useState(false);

  // Estados de Avaliação Semântica Sob Demanda (Tier 2 - Missão P3.2.2.1 / P3.2.2.1.2)
  const [semanticEvals, setSemanticEvals] = useState<
    Record<
      string,
      {
        status: 'idle' | 'evaluating' | 'completed' | 'partially_evaluated' | 'unavailable' | 'inconclusive';
        data?: SemanticEvaluationResponse;
        error?: string;
      }
    >
  >({});

  const handleRequestSemanticEvaluation = async (msgId: string, handle?: string) => {
    if (!handle) return;
    if (semanticEvals[msgId]?.status === 'evaluating') return;

    setSemanticEvals((prev) => ({
      ...prev,
      [msgId]: { status: 'evaluating' },
    }));

    try {
      const res = await requestSemanticGroundingEvaluation({ evaluationHandle: handle });
      if (res.overallStatus === 'COMPLETED' || res.overallStatus === 'PARTIALLY_EVALUATED') {
        setSemanticEvals((prev) => ({
          ...prev,
          [msgId]: {
            status: res.overallStatus === 'PARTIALLY_EVALUATED' ? 'partially_evaluated' : 'completed',
            data: res,
          },
        }));
      } else {
        setSemanticEvals((prev) => ({
          ...prev,
          [msgId]: {
            status: 'inconclusive',
            data: res,
            error: 'Avaliação inconclusiva: os dados retornados não puderam ser verificados conclusivamente contra o documento.',
          },
        }));
      }
    } catch {
      setSemanticEvals((prev) => ({
        ...prev,
        [msgId]: {
          status: 'unavailable',
          error: 'Não foi possível concluir a avaliação semântica. A resposta original e suas citações permanecem disponíveis.',
        },
      }));
    }
  };

  // Carrega recursos visuais didáticos associados ao conceito ativo sem gerar chamadas de IA
  useEffect(() => {
    let isMounted = true;
    if (activeConcept) {
      visualLearningService
        .getVisualSupportForConcept(
          activeConcept.id,
          activeConcept.name,
          activeDocument?.id,
          activeDocument?.title,
          false
        )
        .then((items) => {
          if (isMounted) setConceptVisuals(items);
        })
        .catch(() => {
          if (isMounted) setConceptVisuals([]);
        });
    } else {
      setConceptVisuals([]);
    }
    return () => {
      isMounted = false;
    };
  }, [activeConcept, activeDocument]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isLoading]);

  // Limpeza de recursos de voz ao desmontar ou trocar de documento
  useEffect(() => {
    return () => {
      speechRecognitionService.abort();
      speechSynthesisService.stop();
      if (audioMonitorCleanupRef.current) {
        audioMonitorCleanupRef.current();
        audioMonitorCleanupRef.current = null;
      }
      if (audioRecordingRef.current) {
        audioRecordingRef.current.cancel();
        audioRecordingRef.current = null;
      }
      setIsListening(false);
      setIsTranscribingAudio(false);
      setMicAudioLevel(0);
      setSynthesisState('idle');
      setCurrentlyPlayingMessageId(null);
    };
  }, [activeDocument?.id]);

  // Mensagem inicial de acolhimento pedagógico se o chat estiver vazio
  useEffect(() => {
    if (activeDocument && chatHistory.length === 0) {
      const welcomeMsg: TutorChatMessage = {
        id: `welcome_${activeDocument.id}`,
        sender: 'tutor',
        text: `Olá! Sou seu Tutor NeuroClass AI para o estudo de **"${activeDocument.title}"** (${activeDocument.subject}).\n\nEstou pronto para analisar com você qualquer conceito, desvendar diagramas e testar sua compreensão ativa no ciclo **C.R.E.A.R.**. Você pode me fazer perguntas por texto ou por voz clicando no microfone abaixo!`,
        timestamp: Date.now(),
        pedagogicalRole: 'explanation',
      };
      onAddMessage(welcomeMsg);
    }
  }, [activeDocument?.id]);

  // Handlers de Síntese de Voz (TTS)
  const handleToggleRate = () => {
    const rates = [1.0, 1.15, 1.25, 1.5];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length] || 1.15;
    setPlaybackRate(nextRate);
    speechSynthesisService.setPlaybackRate(nextRate);
  };

  const handleSpeakMessage = (text: string, messageId?: string) => {
    if (!speechSynthesisService.isSupported()) {
      setVoiceError('Seu navegador não possui suporte a síntese de voz ou áudio.');
      return;
    }

    setVoiceError(null);
    setCurrentlyPlayingMessageId(messageId || null);

    speechSynthesisService.speak(text, {
      rate: playbackRate,
      onStart: () => setSynthesisState('speaking'),
      onEnd: () => {
        setSynthesisState('idle');
        setCurrentlyPlayingMessageId(null);
      },
      onError: (err: any) => {
        setSynthesisState('idle');
        setCurrentlyPlayingMessageId(null);
        if (err?.error && err.error !== 'canceled' && err.error !== 'interrupted') {
          console.warn('[TutorPanel] Erro na reprodução de voz:', err);
          setVoiceError(`Aviso de áudio: Não foi possível iniciar a reprodução (${err.error || 'falha'}). Clique em "Ouvir Resposta" para autorizar.`);
        }
      },
      onPause: () => setSynthesisState('paused'),
      onResume: () => setSynthesisState('speaking'),
    });
  };

  const handlePauseVoice = () => {
    speechSynthesisService.pause();
    setSynthesisState('paused');
  };

  const handleResumeVoice = () => {
    speechSynthesisService.resume();
    setSynthesisState('speaking');
  };

  const handleStopVoice = () => {
    speechSynthesisService.stop();
    setSynthesisState('idle');
    setCurrentlyPlayingMessageId(null);
  };

  const handleRepeatVoice = () => {
    speechSynthesisService.repeat();
    setSynthesisState('speaking');
  };

  // Handlers de Reconhecimento de Fala (STT) e Controle de Microfone
  const stopAudioMonitor = () => {
    if (audioMonitorCleanupRef.current) {
      audioMonitorCleanupRef.current();
      audioMonitorCleanupRef.current = null;
    }
    setMicAudioLevel(0);
  };

  const handleFinishAndSendVoice = async () => {
    speechRecognitionService.stop();
    stopAudioMonitor();
    setIsListening(false);

    const recording = audioRecordingRef.current;
    audioRecordingRef.current = null;

    let message = inputText.trim();

    // Se o reconhecimento nativo do navegador não capturou texto (comum no Chrome no Linux com headset),
    // utiliza a gravação direta de áudio do headset e transcreve com Gemini multimodal
    if (!message && recording) {
      try {
        setIsTranscribingAudio(true);
        const { blob, mimeType } = await recording.stop();
        if (blob && blob.size > 1200) {
          const base64 = await audioDeviceService.blobToBase64(blob);
          if (base64) {
            const transcript = await requestAudioTranscription(base64, mimeType);
            if (transcript && transcript.trim()) {
              message = transcript.trim();
              setInputText(message);
            }
          }
        }
      } catch (err: any) {
        console.warn('[TutorPanel] Falha na transcrição multimodal com Gemini:', err);
      } finally {
        setIsTranscribingAudio(false);
      }
    } else if (recording) {
      recording.cancel();
    }

    if (message) {
      handleSendMessage(message);
    } else {
      setVoiceError(
        'Nenhuma fala foi capturada pelo microfone. Verifique se o headset não está mutado ou digite sua pergunta.'
      );
    }
  };

  const handleCancelListening = () => {
    speechRecognitionService.abort();
    stopAudioMonitor();
    if (audioRecordingRef.current) {
      audioRecordingRef.current.cancel();
      audioRecordingRef.current = null;
    }
    setIsListening(false);
    setIsTranscribingAudio(false);
    setVoiceError(null);
  };

  const handleToggleListening = () => {
    setVoiceError(null);

    // Se o estudante clicar no ícone de microfone enquanto estiver gravando, conclui e envia a pergunta!
    if (isListening) {
      handleFinishAndSendVoice();
      return;
    }

    if (!speechRecognitionService.isSupported()) {
      setVoiceError(
        'Seu navegador não suporta reconhecimento de voz nativo (Web Speech API). Você pode continuar digitando normalmente.'
      );
      return;
    }

    // Interrompe qualquer áudio em reprodução para não capturar a voz do tutor
    handleStopVoice();

    // Inicia o monitor de nível de áudio em tempo real (VU meter) com o dispositivo preferido
    stopAudioMonitor();
    const preferredId = audioDeviceService.getPreferredAudioDeviceId();
    audioMonitorCleanupRef.current = audioDeviceService.startAudioLevelMonitor(
      preferredId,
      (level) => setMicAudioLevel(level),
      (err) => console.warn('[TutorPanel] Monitor de áudio:', err)
    );

    // Inicia a gravação direta de áudio do dispositivo (headset) via MediaRecorder para garantir 100% de captura
    if (audioRecordingRef.current) {
      audioRecordingRef.current.cancel();
      audioRecordingRef.current = null;
    }
    audioDeviceService.startAudioRecording(preferredId).then((recording) => {
      audioRecordingRef.current = recording;
    }).catch((err) => {
      console.warn('[TutorPanel] MediaRecorder init:', err);
    });

    speechRecognitionService.start({
      onStart: () => {
        setIsListening(true);
        setVoiceError(null);
      },
      onTranscript: (transcript: string) => {
        // Exibe a transcrição em tempo real no campo de entrada para revisão antes do envio
        setInputText(transcript);
      },
      onError: (error) => {
        if (error.code !== 'aborted') {
          setVoiceError(error.message);
        }
        if (error.code === 'not-allowed' || error.code === 'audio-capture' || error.code === 'not-supported') {
          stopAudioMonitor();
          if (audioRecordingRef.current) {
            audioRecordingRef.current.cancel();
            audioRecordingRef.current = null;
          }
          setIsListening(false);
        }
      },
      onEnd: () => {
        if (speechRecognitionService.getState() !== 'listening') {
          stopAudioMonitor();
          setIsListening(false);
        }
      },
    });
  };

  const handleSendMessage = async (
    textToSend?: string,
    intent?: 'explanation' | 'analogy' | 'practical_example' | 'diagnostic_question'
  ) => {
    // Interrompe a escuta caso ainda esteja ativa
    if (isListening) {
      speechRecognitionService.stop();
      setIsListening(false);
    }

    const message = textToSend || inputText.trim();
    if (!message || !activeDocument || isLoading) return;

    // Desbloqueia previamente o motor de áudio no contexto do clique do usuário se a voz estiver ativa
    if (autoPlayVoice) {
      speechSynthesisService.unlockAudioGesture();
    }

    // Registra a mensagem explícita do usuário no chat
    const userMsg: TutorChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: message,
      timestamp: Date.now(),
      contextConceptId: activeConcept?.id,
      pedagogicalRole: intent || 'explanation',
    };

    onAddMessage(userMsg);
    if (!textToSend) setInputText('');
    setIsLoading(true);

    try {
      // 1. Recuperação fundamentada via BM25 no escopo restrito do documento ativo
      const groundedContext = await buildTutorGroundedContext(message, {
        id: activeDocument.id,
        title: activeDocument.title,
      });

      // 2. Tratamento determinístico de documento sem índice lexical persistido
      if (groundedContext.state === 'not_indexed') {
        const notIndexedMsg: TutorChatMessage = {
          id: `msg_t_${Date.now()}`,
          sender: 'tutor',
          text: groundedContext.userNotice || `O documento "${activeDocument.title}" ainda não foi indexado lexicalmente para recuperação de evidências. Por favor, processe a indexação antes de formular perguntas específicas.`,
          timestamp: Date.now(),
          contextConceptId: activeConcept?.id,
          pedagogicalRole: 'clarification',
          evidencesCited: [],
        };
        onAddMessage(notIndexedMsg);
        setIsLoading(false);
        return;
      }

      // 3. Montagem do contexto fundamentado sem amostragem arbitrária
      const documentExcerpts: string[] = [];

      // Coleta trechos multimodais do documento associados ao conceito ativo (se houver)
      if (activeConcept?.evidenceReferences) {
        activeConcept.evidenceReferences.forEach((ev) => {
          if (ev.type === 'formula') {
            const f = ev as any;
            documentExcerpts.push(
              `[Fórmula ${f.formulaLabel || ''} Pág. ${f.pageNumber || 's/p'}]: Expressão: "${f.formulaExpression}" | ${f.excerpt}${f.isAmbiguous ? ' (Aviso: leitura ambígua no documento)' : ''}`
            );
          } else if (ev.type === 'chart') {
            const ch = ev as any;
            documentExcerpts.push(
              `[Gráfico ${ch.chartLabel || ''} Pág. ${ch.pageNumber || 's/p'}]: Eixos: ${ch.xAxisLabel || 'X'} x ${ch.yAxisLabel || 'Y'} | Tendência: ${ch.observedTrend || ''} | ${ch.excerpt}`
            );
          } else if (ev.type === 'table') {
            const tb = ev as any;
            documentExcerpts.push(`[Tabela ${tb.tableLabel || ''} Pág. ${tb.pageNumber || 's/p'}]: ${tb.excerpt}`);
          } else if (ev.type === 'figure') {
            const fg = ev as any;
            documentExcerpts.push(`[Figura ${fg.figureLabel || ''} Pág. ${fg.pageNumber || 's/p'}]: ${fg.excerpt}`);
          }
        });
      }

      // Adiciona exclusivamente os trechos de evidência recuperados pelo BM25
      if (groundedContext.documentExcerpts.length > 0) {
        documentExcerpts.push(...groundedContext.documentExcerpts);
      } else if (groundedContext.state === 'ocr_pending') {
        documentExcerpts.push(
          `[Aviso de OCR Pendente]: O documento "${activeDocument.title}" possui páginas digitalizadas aguardando OCR local. Não foram localizadas evidências nas páginas já pesquisáveis. Não declare categoricamente que o material não aborda o tema; ressalve que há páginas digitalizadas pendentes de OCR local.`
        );
      } else if (groundedContext.state === 'no_evidence') {
        documentExcerpts.push(
          `[Aviso de Evidência]: Não foram encontradas evidências lexicais diretas no texto do documento "${activeDocument.title}" para a pergunta realizada. Se responder, declare expressamente que o material não aborda este tópico diretamente.`
        );
      }

      // 3.1 Resolução de ativos visuais multimodais do documento (Missão R2)
      let visualAssets: TutorVisualAsset[] | undefined = undefined;
      if (isVisualIntentQuery(message, activeConcept)) {
        const visualResult = resolveTutorVisualAssets({
          document: activeDocument,
          query: message,
          activeConcept,
        });
        if (visualResult.hasVisualContent && visualResult.visualAssets.length > 0) {
          visualAssets = visualResult.visualAssets;
          if (visualResult.visualEvidenceDescriptions.length > 0) {
            documentExcerpts.push(...visualResult.visualEvidenceDescriptions);
          }
        }
      }

      const response = await requestTutorResponse({
        userMessage: message,
        documentTitle: activeDocument.title,
        documentId: activeDocument.id,
        subject: activeDocument.subject,
        activeConcept: activeConcept ? {
          id: activeConcept.id,
          name: activeConcept.name,
          definition: activeConcept.definition,
        } : undefined,
        documentExcerpts,
        retrievedEvidences: groundedContext.evidences,
        conversationHistory: chatHistory.map(m => ({ sender: m.sender, text: m.text })),
        pedagogicalIntent: intent,
        visualAssets,
        tableOfContents: activeDocument.tableOfContents,
      });

      // Validação estrita de citações (ACH-P3-01 & ACH-P3-02):
      // Usa verifiedCitations retornado pelo servidor ou valida localmente com validateCitations
      const validationResult = response.verifiedCitations
        ? {
            validCitations: response.verifiedCitations,
            invalidCitations: response.unverifiedCitations || [],
          }
        : validateCitations(response.text, groundedContext);

      const tutorMsgId = `msg_t_${Date.now()}`;
      const groundingSegments = response.groundingSegments
        ? response.groundingSegments
        : processResponseGroundingSegments(response.text, groundedContext.evidences).segments;

      // Citações vinculadas são estritamente as evidências verificadas no contexto recuperado
      const tutorMsg: TutorChatMessage = {
        id: tutorMsgId,
        sender: 'tutor',
        text: response.text,
        timestamp: response.timestamp,
        contextConceptId: activeConcept?.id,
        pedagogicalRole: (response.pedagogicalRole as any) || 'explanation',
        evidencesCited: validationResult.validCitations,
        verifiedCitations: validationResult.validCitations,
        unverifiedCitations: validationResult.invalidCitations,
        retrievedEvidenceCount: groundedContext.evidences.length,
        groundingSegments,
        evaluationHandle: response.evaluationHandle,
      };

      onAddMessage(tutorMsg);

      // Se o estudante habilitou resposta falada automática, inicia o TTS
      if (autoPlayVoice) {
        handleSpeakMessage(response.text, tutorMsgId);
      }
    } catch (err: any) {
      const errorMsg: TutorChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'tutor',
        text: `Não foi possível consultar o tutor no momento: ${err.message || 'Falha de comunicação'}. Tente novamente.`,
        timestamp: Date.now(),
        pedagogicalRole: 'clarification',
      };
      onAddMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Salva a explicação do Tutor diretamente como Nota no Caderno de Estudos (1 clique).
   */
  const handleSaveMessageAsNote = async (msg: TutorChatMessage) => {
    if (!activeDocument) return;
    setSavingNoteMessageId(msg.id);
    try {
      const conceptName = (activeConcept && activeConcept.id === msg.contextConceptId) ? activeConcept.name : undefined;
      const cleanSnippet = msg.text.slice(0, 50).replace(/[\r\n#*`]/g, ' ').trim();
      const title = conceptName
        ? `Tutor: ${conceptName}`
        : `Tutor: ${cleanSnippet || 'Explicação'}`;

      // ACH-P3-04: Proveniência estrita: utiliza exclusivamente citações verificadas
      const validCitations = (msg.verifiedCitations && msg.verifiedCitations.length > 0)
        ? msg.verifiedCitations
        : (msg.evidencesCited || []);

      const citedText = validCitations.length > 0
        ? validCitations.map((e) => `[Pág. ${(e as any).pageNumber || 's/p'}]: ${e.excerpt}`).join('\n\n')
        : undefined;

      const rawPages = validCitations
        .map((e) => (e as any).pageNumber)
        .filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
      const distinctPages = Array.from(new Set(rawPages)).sort((a, b) => a - b);

      // Se houver exatamente 1 página física distinta nas citações verificadas, pageSource é atribuído.
      // Se houver múltiplas páginas ou nenhuma, pageSource é undefined para não atribuir arbitrariamente a primeira página.
      const pageSource = distinctPages.length === 1 ? distinctPages[0] : undefined;
      const pageSources = distinctPages.length > 0 ? distinctPages : undefined;

      const newNote: StudyNote = {
        id: `note_${Date.now()}`,
        documentId: activeDocument.id,
        title,
        content: msg.text,
        associatedConceptId: msg.contextConceptId,
        citedExcerpt: citedText,
        pageSource,
        pageSources,
        verifiedCitations: validCitations.length > 0 ? validCitations : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (onSaveNote) {
        await onSaveNote(newNote);
      } else {
        await workspaceStorage.saveStudyNote(newNote, activeDocument.subject || 'Geral');
      }

      setSavedNoteMessageIds((prev) => new Set(prev).add(msg.id));
    } catch (err) {
      console.error('[TutorPanel] Falha ao salvar nota do tutor:', err);
    } finally {
      setSavingNoteMessageId(null);
    }
  };

  // Expor método imperativo para ser chamado externamente (ex.: botão do Blackboard)
  useImperativeHandle(ref, () => ({
    askAboutConcept: (concept: Concept) => {
      handleSendMessage(
        `Gostaria de aprofundar minha compreensão sobre o conceito "${concept.name}". Como o documento explica seu mecanismo e sua importância?`,
        'explanation'
      );
    },
  }));

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header do Tutor — Identidade e Controles */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-violet-600/20 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-white tracking-tight">Tutor NeuroClass AI</h4>
              <span className="text-[9px] font-mono font-semibold text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/50">
                C.R.E.A.R.
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {activeDocument ? activeDocument.title : 'Diálogo acadêmico'}
            </p>
          </div>
        </div>

        {/* Controles de Voz do Header (Design Compacto e Balanceado) */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => {
              const next = !autoPlayVoice;
              setAutoPlayVoice(next);
              if (next) {
                speechSynthesisService.unlockAudioGesture();
              } else {
                handleStopVoice();
              }
            }}
            title={
              autoPlayVoice
                ? 'Voz Automática do Tutor: ATIVA. Clique para silenciar.'
                : 'Voz Automática do Tutor: SILENCIADA. Clique para ativar fala automática.'
            }
            className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              autoPlayVoice
                ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 hover:bg-cyan-900/60 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-slate-200 hover:bg-slate-750'
            }`}
          >
            {autoPlayVoice ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{autoPlayVoice ? 'Voz' : 'Mudo'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleRate}
            title={`Velocidade de reprodução: ${playbackRate}x. Clique para alternar (1.0x, 1.15x, 1.25x, 1.5x)`}
            className="px-2 py-1 rounded-lg text-[11px] font-mono font-bold bg-slate-800/80 text-cyan-400 border border-slate-700/60 hover:text-cyan-300 hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <Gauge className="w-3.5 h-3.5 inline mr-1 opacity-70" />
            <span>{playbackRate}x</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrivacyInfo(!showPrivacyInfo)}
            title="Informações de privacidade da voz"
            className="p-1.5 rounded-lg text-slate-400 bg-slate-800/80 border border-slate-700/60 hover:text-slate-200 hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Faixa de Contexto do Conceito Ativo + Acesso ao Apoio Visual */}
      {activeConcept && (
        <div className="px-3.5 py-1.5 bg-slate-950/60 border-b border-slate-800/70 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium shrink-0">Conceito em foco:</span>
            <span className="text-[11px] font-semibold text-slate-200 truncate" title={activeConcept.name}>
              {activeConcept.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {conceptVisuals.length > 0 && (
              <button
                type="button"
                onClick={() => setIsVisualViewerOpen(true)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 cursor-pointer shadow-sm shadow-amber-500/5"
                title="Abrir recursos visuais didáticos associados a este conceito"
              >
                <Palette className="w-3 h-3 text-amber-400" />
                <span>Ver Ilustração ({conceptVisuals.length})</span>
              </button>
            )}

            {onOpenVisualGenerator && (
              <button
                type="button"
                onClick={() => onOpenVisualGenerator(activeConcept)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/40 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 cursor-pointer shadow-sm"
                title="Gerar recurso visual via Gemini API (BYOK)"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Gerar Visual</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Popover / Alerta de Privacidade de Voz */}
      {showPrivacyInfo && (
        <div className="p-3 bg-slate-950 border-b border-cyan-800/40 text-[11px] text-slate-300 flex items-start justify-between gap-2 shadow-inner">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-white">Privacidade e Voz:</strong> {VOICE_PRIVACY_DISCLOSURE}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPrivacyInfo(false)}
            className="text-slate-400 hover:text-white shrink-0 p-0.5"
            title="Fechar aviso de privacidade"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Atalhos Pedagógicos Rápidos (Sem Barra de Rolagem Horizontal / no-scrollbar) */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/40 border-b border-slate-800/70 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
        <button
          onClick={() =>
            handleSendMessage(
              `Explique "${activeConcept?.name || activeDocument?.title || 'o tema'}" utilizando uma analogia clara e visual do cotidiano.`,
              'analogy'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 hover:border-slate-600 transition-all font-medium whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer shadow-sm active:scale-95"
          title="Explicar o conceito com uma analogia intuitiva do cotidiano"
        >
          <Lightbulb className="w-3 h-3 text-amber-400" />
          <span>Analogia</span>
        </button>
        <button
          onClick={() =>
            handleSendMessage(
              `Apresente uma aplicação real ou exemplo prático demonstrado de "${activeConcept?.name || activeDocument?.title || 'o tema'}".`,
              'practical_example'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 hover:border-slate-600 transition-all font-medium whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer shadow-sm active:scale-95"
          title="Apresentar uma aplicação real ou caso prático demonstrado"
        >
          <Compass className="w-3 h-3 text-cyan-400" />
          <span>Aplicação</span>
        </button>
        <button
          onClick={() =>
            handleSendMessage(
              `Faça uma pergunta formativa desafiadora para testar se eu realmente compreendi "${activeConcept?.name || activeDocument?.title || 'o tema'}".`,
              'diagnostic_question'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 hover:border-slate-600 transition-all font-medium whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer shadow-sm active:scale-95"
          title="Receber uma pergunta formativa para testar compreensão ativa"
        >
          <HelpCircle className="w-3 h-3 text-violet-400" />
          <span>Desafio</span>
        </button>

        {conceptVisuals.length > 0 && (
          <button
            onClick={() =>
              handleSendMessage(
                `A partir do contexto textual de "${activeConcept?.name || activeDocument?.title || 'o tema'}", descreva textualmente sua organização visual, componentes e os princípios dinâmicos representados nesta ilustração didática.`,
                'analogy'
              )
            }
            disabled={isLoading || !activeDocument}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-100 rounded-lg border border-amber-500/30 hover:border-amber-500/50 transition-all font-medium whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer shadow-sm active:scale-95"
            title="O Tutor descreve textualmente a estrutura e dinâmicas da ilustração didática a partir do contexto do material"
          >
            <Palette className="w-3 h-3 text-amber-400" />
            <span>Estrutura Visual</span>
          </button>
        )}
      </div>

      {/* Barra de Controle de Voz Ativa (quando o Tutor está falando ou pausado) */}
      {synthesisState !== 'idle' && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-cyan-950/40 border-b border-cyan-800/50 text-[11px] text-cyan-200">
          <div className="flex items-center gap-2">
            <Volume2 className={`w-3.5 h-3.5 ${synthesisState === 'speaking' ? 'animate-pulse text-cyan-400' : 'text-slate-400'}`} />
            <span className="font-medium">
              {synthesisState === 'speaking' ? 'Tutor falando...' : 'Voz pausada'}
            </span>
            <button
              type="button"
              onClick={handleToggleRate}
              title={`Velocidade atual: ${playbackRate}x. Clique para alternar.`}
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300 transition-colors"
            >
              {playbackRate}x
            </button>
          </div>
          <div className="flex items-center gap-1">
            {synthesisState === 'speaking' ? (
              <button
                type="button"
                onClick={handlePauseVoice}
                title="Pausar voz"
                className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResumeVoice}
                title="Continuar voz"
                className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleRepeatVoice}
              title="Repetir resposta"
              className="p-1 hover:bg-cyan-900/60 rounded text-cyan-300 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleStopVoice}
              title="Interromper fala"
              className="p-1 hover:bg-rose-900/60 rounded text-rose-300 hover:text-rose-100 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Área de Mensagens */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-none shadow-sm'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none shadow-sm'
              }`}
            >
              {msg.sender === 'user' ? (
                <div className="whitespace-pre-wrap font-medium">{msg.text}</div>
              ) : (
                <div>
                  <FormattedTutorText text={msg.text} />
                  {/* Ações da Resposta do Tutor (Design Discreto e Moderno) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-700/30 flex items-center justify-between text-[11px] gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (currentlyPlayingMessageId === msg.id && synthesisState === 'speaking') {
                            handlePauseVoice();
                          } else if (currentlyPlayingMessageId === msg.id && synthesisState === 'paused') {
                            handleResumeVoice();
                          } else {
                            speechSynthesisService.unlockAudioGesture();
                            handleSpeakMessage(msg.text, msg.id);
                          }
                        }}
                        title="Ouvir esta explicação em voz sintetizada (pt-BR)"
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                          currentlyPlayingMessageId === msg.id && synthesisState === 'speaking'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-sm animate-pulse'
                            : currentlyPlayingMessageId === msg.id && synthesisState === 'paused'
                            ? 'bg-amber-950 text-amber-300 border border-amber-600/60'
                            : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-700/40'
                        }`}
                      >
                        {currentlyPlayingMessageId === msg.id && synthesisState === 'speaking' ? (
                          <>
                            <Pause className="w-3 h-3 text-cyan-400" />
                            <span>Pausar</span>
                          </>
                        ) : currentlyPlayingMessageId === msg.id && synthesisState === 'paused' ? (
                          <>
                            <Play className="w-3 h-3 text-amber-400" />
                            <span>Continuar</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Ouvir</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveMessageAsNote(msg)}
                        disabled={savingNoteMessageId === msg.id || savedNoteMessageIds.has(msg.id)}
                        title={
                          savedNoteMessageIds.has(msg.id)
                            ? 'Esta explicação já foi salva no seu Caderno de Estudos'
                            : 'Salvar esta explicação como Nota no Caderno de Estudos'
                        }
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                          savedNoteMessageIds.has(msg.id)
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 shadow-sm'
                            : savingNoteMessageId === msg.id
                            ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-700/50'
                            : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-700/40'
                        }`}
                      >
                        {savedNoteMessageIds.has(msg.id) ? (
                          <>
                            <BookmarkCheck className="w-3 h-3 text-emerald-400" />
                            <span>Salvo no Caderno</span>
                          </>
                        ) : savingNoteMessageId === msg.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3 h-3" />
                            <span>Salvar no Caderno</span>
                          </>
                        )}
                      </button>
                    </div>

                    {conceptVisuals.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsVisualViewerOpen(true)}
                        title="Abrir ilustração didática do conceito em tela cheia"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-amber-300/90 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 transition-all cursor-pointer shadow-sm shadow-amber-500/5 shrink-0"
                      >
                        <Eye className="w-3 h-3 text-amber-400" />
                        <span>Ilustração</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Evidências citadas se presentes */}
              {msg.sender === 'tutor' && msg.evidencesCited && msg.evidencesCited.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex flex-wrap gap-1 text-[10px] text-cyan-300 font-mono">
                  <span className="text-slate-400">Origem no Documento:</span>
                  {msg.evidencesCited.map((ev, i) => (
                    <span
                      key={i}
                      title={ev.excerpt ? `Evidência: "${ev.excerpt}"` : undefined}
                      className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/80 hover:border-cyan-500/50 hover:bg-slate-800/90 transition-colors"
                    >
                      {ev.type === 'pdf_page' && `Pág. ${(ev as any).pageNumber}${(ev as any).context ? ` (${(ev as any).context})` : ''}`}
                      {ev.type === 'note_section' && `Seção "${(ev as any).sectionTitle}"`}
                      {ev.type === 'figure' && `${(ev as any).figureLabel}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Indicadores determinísticos locais de fundamentação (Tier 1 - Missão P3.2.1.2) */}
              {msg.sender === 'tutor' && msg.groundingSegments && msg.groundingSegments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 text-[9px] font-mono">
                  {msg.groundingSegments.some(s => s.assessment === 'NUMERIC_REVIEW_REQUIRED') && (
                    <span
                      title="Valores numéricos presentes na resposta não foram localizados literalmente nos trechos citados. Recomendada conferência no documento original."
                      className="inline-flex items-center gap-1 bg-amber-950/40 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60"
                    >
                      <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
                      Necessidade de conferência: valores numéricos a revisar
                    </span>
                  )}
                  {msg.groundingSegments.some(s => s.assessment === 'UNCITED_SEGMENT') && (
                    <span
                      title="A resposta contém uma ou mais sentenças sem citação direta de evidência documental [C#]."
                      className="inline-flex items-center gap-1 bg-slate-900/50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800/80"
                    >
                      Trecho(s) sem citação direta
                    </span>
                  )}
                  {msg.groundingSegments.some(s => s.assessment === 'UNASSESSED') && (
                    <span
                      title="Trechos com múltiplas fontes citadas ou formulações ilustrativas. A correspondência factual detalhada não foi avaliada deterministamente."
                      className="inline-flex items-center gap-1 bg-slate-900/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/60"
                    >
                      <Info className="w-2.5 h-2.5 text-slate-400" />
                      Atribuição detalhada não avaliada localmente
                    </span>
                  )}
                  {msg.groundingSegments.every(s => s.assessment === 'NO_DETERMINISTIC_ALERT') && msg.evidencesCited && msg.evidencesCited.length > 0 && (
                    <span
                      title="Essas verificações identificam algumas inconsistências explícitas, mas não comprovam que a resposta esteja semanticamente correta."
                      className="inline-flex items-center gap-1 bg-slate-900/60 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/60"
                    >
                      Nenhum alerta detectado nas checagens locais
                    </span>
                  )}
                </div>
              )}

              {/* Avaliação Semântica Sob Demanda — Tier 2 (Missão P3.2.2.1) */}
              {msg.sender === 'tutor' && (
                <div className="mt-2 pt-2 border-t border-slate-800/80">
                  {(!msg.verifiedCitations || msg.verifiedCitations.length === 0) ? (
                    <div className="text-[10px] text-slate-500 font-mono italic">
                      Não há evidências documentais citadas para avaliação semântica.
                    </div>
                  ) : (
                    <div>
                      {/* Estado 1: Não avaliado (idle) */}
                      {(!semanticEvals[msg.id] || semanticEvals[msg.id].status === 'idle') && (
                        <div className="space-y-1">
                          <button
                            type="button"
                            disabled={!msg.evaluationHandle}
                            onClick={() => handleRequestSemanticEvaluation(msg.id, msg.evaluationHandle)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 hover:bg-cyan-950/80 text-cyan-300 hover:text-cyan-200 border border-cyan-800/60 hover:border-cyan-500 text-[10px] font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 text-cyan-400" />
                            Avaliar fundamentação
                          </button>
                          <p className="text-[9px] text-slate-400 leading-tight">
                            Uma avaliação automatizada enviará as afirmações e os respectivos trechos citados ao modelo Gemini configurado. O processamento poderá consumir sua cota de API. O resultado é uma análise auxiliar e não uma comprovação científica.
                          </p>
                        </div>
                      )}

                      {/* Estado 2: Avaliando (loading) */}
                      {semanticEvals[msg.id]?.status === 'evaluating' && (
                        <div className="flex items-center gap-2 p-2 bg-slate-900/80 rounded border border-cyan-800/40 text-[10px] text-cyan-300 font-mono">
                          <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
                          <span>Avaliando sustentação semântica frente às evidências originais...</span>
                        </div>
                      )}

                      {/* Estado 3: Avaliação concluída ou parcialmente avaliada */}
                      {(semanticEvals[msg.id]?.status === 'completed' || semanticEvals[msg.id]?.status === 'partially_evaluated') && semanticEvals[msg.id].data && (
                        <div className="p-2.5 bg-slate-950/90 rounded-lg border border-slate-700/80 text-[10px] space-y-2 mt-1">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-cyan-400" />
                              {semanticEvals[msg.id].data?.overallStatus === 'PARTIALLY_EVALUATED'
                                ? 'Avaliação semântica parcial (Tier 2)'
                                : 'Avaliação semântica automatizada (Tier 2)'}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {semanticEvals[msg.id].data?.modelId}
                            </span>
                          </div>

                          {semanticEvals[msg.id].data?.overallStatus === 'PARTIALLY_EVALUATED' && (
                            <div className="p-1.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 text-[9px] flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>
                                Avaliação parcial: os resultados abrangem apenas os segmentos efetivamente avaliados pelo modelo. Afirmações ausentes permanecem explicitamente não avaliadas.
                              </span>
                            </div>
                          )}

                          <div className="space-y-2">
                            {semanticEvals[msg.id].data?.results.map((res, rIdx) => {
                              const statusConfig = {
                                SUPPORTED: {
                                  label: 'Sustentada pelas evidências',
                                  style: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80',
                                },
                                PARTIALLY_SUPPORTED: {
                                  label: 'Parcialmente sustentada',
                                  style: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/80',
                                },
                                NOT_SUPPORTED: {
                                  label: 'Não sustentada',
                                  style: 'bg-amber-950/60 text-amber-300 border-amber-800/80',
                                },
                                CONTRADICTED: {
                                  label: 'Contradita pelas evidências',
                                  style: 'bg-rose-950/60 text-rose-300 border-rose-800/80',
                                },
                                INSUFFICIENT_EVIDENCE: {
                                  label: 'Evidências insuficientes',
                                  style: 'bg-slate-900/60 text-slate-400 border-slate-700/80',
                                },
                              }[res.status] || {
                                label: res.status,
                                style: 'bg-slate-900 text-slate-400 border-slate-700',
                              };

                              return (
                                <div key={rIdx} className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] border font-medium ${statusConfig.style}`}>
                                      {statusConfig.label}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-400">
                                      Fontes: {res.citedEvidenceIds.map(t => `[${t}]`).join(' ')}
                                    </span>
                                  </div>
                                  <p className="text-slate-300 leading-relaxed text-[10px]">
                                    {res.explanation}
                                  </p>
                                  {res.limitations && res.limitations.length > 0 && (
                                    <div className="text-[9px] text-amber-400/90 font-mono">
                                      Limitação: {res.limitations.join('; ')}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="pt-1.5 border-t border-slate-800/80 text-[9px] text-slate-400 italic leading-tight">
                            Esta é uma avaliação automatizada do modelo e pode conter erros. Não substitui a leitura das fontes nem uma revisão especializada.
                          </div>
                        </div>
                      )}

                      {/* Estado 4: Indisponível / Erro */}
                      {semanticEvals[msg.id]?.status === 'unavailable' && (
                        <div className="p-2 bg-rose-950/30 rounded border border-rose-800/60 text-[10px] space-y-1.5">
                          <p className="text-rose-300">
                            Não foi possível concluir a avaliação semântica. A resposta original e suas citações permanecem disponíveis.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRequestSemanticEvaluation(msg.id, msg.evaluationHandle)}
                            className="px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-700 text-[9px] font-mono cursor-pointer"
                          >
                            Tentar novamente
                          </button>
                        </div>
                      )}

                      {/* Estado 5: Inconclusivo */}
                      {semanticEvals[msg.id]?.status === 'inconclusive' && (
                        <div className="p-2 bg-slate-900/60 rounded border border-slate-700 text-[10px] space-y-1.5">
                          <p className="text-slate-400">
                            Avaliação inconclusiva: os dados retornados não puderam ser verificados conclusivamente contra o documento.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRequestSemanticEvaluation(msg.id, msg.evaluationHandle)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 text-[9px] font-mono cursor-pointer"
                          >
                            Tentar novamente
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-800/50 border border-slate-700/40 rounded-xl text-xs text-slate-300 w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Tutor formulando resposta pedagógica fundamentada...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de Envio de Mensagem e Controles de Entrada por Voz */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800">
        {/* Banner de escuta ativa com indicador em tempo real, medidor VU e botões explícitos de ação */}
        {isListening && (
          <div className="mb-2.5 p-3 bg-gradient-to-r from-slate-950 via-cyan-950/60 to-slate-950 border border-cyan-700/60 rounded-xl shadow-lg shadow-cyan-950/40 text-xs text-cyan-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 shadow-sm shadow-red-500/50" />
                </span>
                <span className="font-semibold text-white">
                  Ouvindo em português (pt-BR)... Fale sua dúvida.
                </span>
              </div>

              {/* Botões de Ação Explícitos da Interação por Voz */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleFinishAndSendVoice}
                  className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm shadow-emerald-900/40 transition-colors text-xs"
                  title="Concluir fala e enviar pergunta ao Tutor"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Concluir & Enviar</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelListening}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors text-xs"
                  title="Cancelar captura de voz"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Medidor de Nível de Áudio em Tempo Real (VU Meter) integrado */}
            <div className="flex items-center gap-2 pt-1 border-t border-cyan-800/40 text-[11px]">
              <Volume2 className={`w-3.5 h-3.5 shrink-0 ${micAudioLevel > 10 ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <div className="flex-1 bg-slate-900/90 rounded-full h-2 overflow-hidden border border-slate-700/50">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micAudioLevel > 15
                      ? 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500'
                      : 'bg-emerald-500/60'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(micAudioLevel, 3))}%` }}
                />
              </div>
              <span className="font-mono text-[10px] w-12 text-right">
                {micAudioLevel > 10 ? (
                  <span className="text-emerald-400 font-semibold">{micAudioLevel}%</span>
                ) : (
                  <span className="text-slate-400">0%</span>
                )}
              </span>
            </div>

            {/* Dica / Alerta Dinâmico de Detecção */}
            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              {micAudioLevel > 10 ? (
                <span className="text-emerald-300 font-medium flex items-center gap-1">
                  ● Voz detectada no microfone! Ao terminar, clique em Concluir ou aperte Enter.
                </span>
              ) : (
                <span className="text-amber-300/90 flex items-center gap-1">
                  ⚪ Nenhum som captado. Verifique se o headset não está mutado ou ajuste nas configurações.
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsAudioModalOpen(true)}
                className="text-cyan-400 hover:text-cyan-300 underline shrink-0 ml-2"
              >
                Ajustar Headset
              </button>
            </div>
          </div>
        )}

        {/* Indicador de Transcrição Multimodal com Gemini em Andamento */}
        {isTranscribingAudio && (
          <div className="flex items-center gap-2 mb-2.5 px-3 py-2 bg-gradient-to-r from-violet-950/80 to-slate-900 border border-violet-700/60 rounded-xl text-xs text-violet-200 shadow-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
            <span>Processando e transcrevendo a fala do seu headset com IA...</span>
          </div>
        )}

        {/* Notificação de erro de voz amigável */}
        {voiceError && (
          <div className="flex items-center justify-between mb-2.5 px-3 py-2 bg-rose-950/70 border border-rose-800/70 rounded-lg text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>{voiceError}</span>
            </div>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="text-[10px] text-rose-300 hover:text-white ml-2 p-0.5"
              title="Fechar aviso de erro"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Botão de Ativação do Microfone */}
          <button
            type="button"
            onClick={handleToggleListening}
            disabled={isLoading || !activeDocument}
            title={
              isListening
                ? 'Concluir fala e enviar pergunta'
                : 'Falar com o Tutor por voz (Microfone pt-BR)'
            }
            className={`p-2 rounded-lg transition-all shrink-0 ${
              isListening
                ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-md shadow-red-600/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            } disabled:opacity-40`}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {/* Botão de Ajustes de Entrada de Áudio / Headset */}
          <button
            type="button"
            onClick={() => setIsAudioModalOpen(true)}
            title="Configurar dispositivo de áudio (Headset / Microfone)"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          {/* Campo de Entrada de Texto (onde a fala é transcrita e pode ser revisada/editada) */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading || !activeDocument}
            placeholder={
              isListening
                ? 'Transcrevendo sua fala... Você poderá revisar antes de enviar.'
                : activeDocument
                ? `Pergunte ou fale sobre ${activeConcept?.name ? `"${activeConcept.name}"` : 'o material'}...`
                : 'Selecione um documento primeiro'
            }
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
          />

          {/* Botão de Envio */}
          <button
            type="submit"
            disabled={isLoading || !inputText.trim() || !activeDocument}
            className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
            title="Enviar mensagem ao Tutor"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Modal de Configuração de Microfone & Headset */}
      <AudioDeviceModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
      />

      {/* Modal de Apoio Visual Didático (Visual Learning v1.1) */}
      {isVisualViewerOpen && conceptVisuals.length > 0 && (
        <VisualSupportViewerModal
          isOpen={isVisualViewerOpen}
          onClose={() => setIsVisualViewerOpen(false)}
          resources={conceptVisuals}
          conceptName={activeConcept?.name || 'Conceito em Foco'}
          stageName="Tutor NeuroClass AI"
          stageNote="Apoio visual didático integrado ao diálogo formativo. O Tutor dialoga a partir da fundamentação textual e conceitual deste recurso (sem percepção direta do arquivo de imagem)."
          documentTitle={activeDocument?.title}
          onOpenGenerator={
            onOpenVisualGenerator && activeConcept
              ? () => {
                  setIsVisualViewerOpen(false);
                  onOpenVisualGenerator(activeConcept);
                }
              : undefined
          }
        />
      )}
    </div>
  );
});
