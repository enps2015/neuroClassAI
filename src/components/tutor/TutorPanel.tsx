import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Sparkles, Lightbulb, HelpCircle, Compass, Loader2 } from 'lucide-react';
import type { Concept, DocumentSource, TutorChatMessage } from '../../types';
import { requestTutorResponse } from '../../services/ai/aiClient';

export interface TutorPanelRef {
  askAboutConcept: (concept: Concept) => void;
}

interface TutorPanelProps {
  activeDocument: DocumentSource | null;
  activeConcept: Concept | null;
  chatHistory: TutorChatMessage[];
  onAddMessage: (msg: TutorChatMessage) => void;
  onRequestSelectConcept?: (conceptId: string) => void;
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
  // Regex para segmentar **negrito**, *itálico* e `code`
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

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
    return part;
  });
}

export const TutorPanel = forwardRef<TutorPanelRef, TutorPanelProps>(({
  activeDocument,
  activeConcept,
  chatHistory,
  onAddMessage,
}, ref) => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isLoading]);

  // Mensagem inicial de acolhimento pedagógico se o chat estiver vazio
  useEffect(() => {
    if (activeDocument && chatHistory.length === 0) {
      const welcomeMsg: TutorChatMessage = {
        id: `welcome_${activeDocument.id}`,
        sender: 'tutor',
        text: `Olá! Sou seu Tutor NeuroClass AI para o estudo de **"${activeDocument.title}"** (${activeDocument.subject}).\n\nEstou pronto para analisar com você qualquer conceito, desvendar diagramas e testar sua compreensão ativa no ciclo **C.R.E.A.R.**. Você pode me fazer perguntas diretas ou clicar nos botões pedagógicos acima para ver analogias, exemplos práticos e desafios formativos!`,
        timestamp: Date.now(),
        pedagogicalRole: 'explanation',
      };
      onAddMessage(welcomeMsg);
    }
  }, [activeDocument?.id]);

  const handleSendMessage = async (
    textToSend?: string,
    intent?: 'explanation' | 'analogy' | 'practical_example' | 'diagnostic_question'
  ) => {
    const message = textToSend || inputText.trim();
    if (!message || !activeDocument || isLoading) return;

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
      // Coleta trechos do documento associados ao conceito ativo
      const documentExcerpts: string[] = [];
      if (activeConcept?.evidenceReferences) {
        activeConcept.evidenceReferences.forEach((ev) => {
          if (ev.excerpt) documentExcerpts.push(`[${ev.type}]: ${ev.excerpt}`);
        });
      }

      // Adiciona trechos das páginas se disponíveis
      if (activeDocument.pages) {
        activeDocument.pages.slice(0, 4).forEach((p) => {
          documentExcerpts.push(`[Página ${p.pageNumber}]: ${p.textContent.slice(0, 350)}`);
        });
      }

      const response = await requestTutorResponse({
        userMessage: message,
        documentTitle: activeDocument.title,
        subject: activeDocument.subject,
        activeConcept: activeConcept ? {
          id: activeConcept.id,
          name: activeConcept.name,
          definition: activeConcept.definition,
        } : undefined,
        documentExcerpts,
        conversationHistory: chatHistory.map(m => ({ sender: m.sender, text: m.text })),
        pedagogicalIntent: intent,
      });

      const tutorMsg: TutorChatMessage = {
        id: `msg_t_${Date.now()}`,
        sender: 'tutor',
        text: response.text,
        timestamp: response.timestamp,
        contextConceptId: activeConcept?.id,
        pedagogicalRole: (response.pedagogicalRole as any) || 'explanation',
        evidencesCited: activeConcept?.evidenceReferences,
      };

      onAddMessage(tutorMsg);
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
      {/* Header do Tutor */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-violet-600/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white tracking-tight">Tutor NeuroClass AI</h4>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                C.R.E.A.R.
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {activeConcept ? `Conceito em Foco: ${activeConcept.name}` : 'Diálogo livre sobre o material'}
            </span>
          </div>
        </div>
      </div>

      {/* Atalhos Pedagógicos Rápidos */}
      <div className="flex items-center gap-1.5 p-2 bg-slate-950/40 border-b border-slate-800/80 overflow-x-auto text-[11px]">
        <button
          onClick={() =>
            handleSendMessage(
              `Explique "${activeConcept?.name || activeDocument?.title || 'o tema'}" utilizando uma analogia clara e visual do cotidiano.`,
              'analogy'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md whitespace-nowrap transition-colors disabled:opacity-50"
        >
          <Lightbulb className="w-3 h-3 text-amber-400" />
          <span>Analogia Prática</span>
        </button>
        <button
          onClick={() =>
            handleSendMessage(
              `Apresente uma aplicação real ou exemplo prático demonstrado de "${activeConcept?.name || activeDocument?.title || 'o tema'}".`,
              'practical_example'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md whitespace-nowrap transition-colors disabled:opacity-50"
        >
          <Compass className="w-3 h-3 text-cyan-400" />
          <span>Exemplo Aplicado</span>
        </button>
        <button
          onClick={() =>
            handleSendMessage(
              `Faça uma pergunta formativa desafiadora para testar se eu realmente compreendi "${activeConcept?.name || activeDocument?.title || 'o tema'}".`,
              'diagnostic_question'
            )
          }
          disabled={isLoading || !activeDocument}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md whitespace-nowrap transition-colors disabled:opacity-50"
        >
          <HelpCircle className="w-3 h-3 text-violet-400" />
          <span>Testar Compreensão</span>
        </button>
      </div>

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
                <FormattedTutorText text={msg.text} />
              )}

              {/* Evidências citadas se presentes */}
              {msg.sender === 'tutor' && msg.evidencesCited && msg.evidencesCited.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex flex-wrap gap-1 text-[10px] text-cyan-300 font-mono">
                  <span className="text-slate-400">Origem no Documento:</span>
                  {msg.evidencesCited.map((ev, i) => (
                    <span key={i} className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700">
                      {ev.type === 'pdf_page' && `Pág. ${(ev as any).pageNumber}`}
                      {ev.type === 'note_section' && `Seção "${(ev as any).sectionTitle}"`}
                      {ev.type === 'figure' && `${(ev as any).figureLabel}`}
                    </span>
                  ))}
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

      {/* Input de Envio de Mensagem */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading || !activeDocument}
            placeholder={
              activeDocument
                ? `Pergunte sobre ${activeConcept?.name ? `"${activeConcept.name}"` : 'o material'}...`
                : 'Selecione um documento primeiro'
            }
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim() || !activeDocument}
            className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
});
