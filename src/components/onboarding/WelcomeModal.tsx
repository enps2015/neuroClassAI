import React from 'react';
import { Sparkles, Compass, BookOpen, Upload, X, ArrowRight } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onStartWithDemo: () => void;
  onStartWithImport: () => void;
  onFactoryReset?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onStartTour,
  onStartWithDemo,
  onStartWithImport,
  onFactoryReset,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden text-slate-100 p-6 md:p-8">
        {/* Botão de Fechar / Pular */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Pular apresentação"
          title="Pular apresentação"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 id="welcome-title" className="text-xl md:text-2xl font-bold tracking-tight text-white">
              NeuroClass AI
            </h2>
            <span className="text-xs text-cyan-400 font-mono tracking-wider uppercase">
              Plataforma de Aprendizagem Ativa e Memória Longitudinal
            </span>
          </div>
        </div>

        {/* Mensagem Principal Canônica */}
        <div className="space-y-3 mb-6">
          <p className="text-sm md:text-base font-semibold text-slate-200 leading-snug">
            Transforme seus materiais de estudo em conhecimento que você consegue compreender, explicar, aplicar e lembrar.
          </p>
          <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
            O NeuroClass AI utiliza inteligência artificial para ajudar você a estudar documentos, compreender conceitos, construir relações entre conhecimentos, testar sua compreensão e acompanhar sua evolução.
          </p>
        </div>

        {/* As Três Ações Principais */}
        <div className="grid grid-cols-1 gap-2.5 mb-6">
          {/* Ação 1: Conhecer a plataforma */}
          <button
            onClick={onStartTour}
            className="flex items-center justify-between p-3.5 bg-gradient-to-r from-cyan-950/60 to-slate-900 hover:from-cyan-900/70 hover:to-slate-850 border border-cyan-500/40 rounded-xl transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs md:text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                  Conhecer a plataforma
                </div>
                <div className="text-[11px] text-slate-400">
                  Faça um tour rápido de 6 passos para entender como tudo funciona.
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>

          {/* Ação 2: Começar com material de demonstração */}
          <button
            onClick={onStartWithDemo}
            className="flex items-center justify-between p-3.5 bg-slate-850/80 hover:bg-slate-800 border border-slate-700/80 hover:border-violet-500/40 rounded-xl transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs md:text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">
                  Começar com um material de demonstração
                </div>
                <div className="text-[11px] text-slate-400">
                  Explore imediatamente um artigo científico completo pré-carregado.
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-violet-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>

          {/* Ação 3: Importar meu próprio material */}
          <button
            onClick={onStartWithImport}
            className="flex items-center justify-between p-3.5 bg-slate-850/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/40 rounded-xl transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs md:text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  Importar meu próprio material
                </div>
                <div className="text-[11px] text-slate-400">
                  Envie um arquivo PDF ou adicione suas notas de estudo.
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>
        </div>

        {/* Rodapé: Dispensar / Acesso Permanente / Reset */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-500 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span>Acesse este guia a qualquer momento pelo menu superior.</span>
            {onFactoryReset && (
              <button
                type="button"
                onClick={() => {
                  const confirmed = window.confirm(
                    'Deseja apagar todos os documentos locais (incluindo arquivos importados, anotações e sessões) e restaurar o aplicativo ao estado limpo inicial?'
                  );
                  if (confirmed) {
                    onFactoryReset();
                  }
                }}
                className="text-[11px] text-rose-400/90 hover:text-rose-300 underline cursor-pointer"
                title="Limpar todos os documentos locais e começar do zero"
              >
                Resetar todos os dados locais
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 underline hover:no-underline font-medium cursor-pointer"
          >
            Pular introdução
          </button>
        </div>
      </div>
    </div>
  );
};
