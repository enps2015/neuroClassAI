import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import type { VisualResource } from '../../types';

export interface VisualSupportViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  conceptName: string;
  resources: VisualResource[];
  initialIndex?: number;
  stageName?: string;
  stageNote?: string;
  documentTitle?: string;
  onOpenGenerator?: () => void;
}

export const VisualSupportViewerModal: React.FC<VisualSupportViewerModalProps> = ({
  isOpen,
  onClose,
  conceptName,
  resources = [],
  initialIndex = 0,
  stageName,
  stageNote,
  documentTitle,
  onOpenGenerator,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(initialIndex, 0), Math.max(resources.length - 1, 0)));
      setIsLightboxOpen(false);
    }
  }, [isOpen, initialIndex, resources.length]);

  // Fechar com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLightboxOpen) {
          setIsLightboxOpen(false);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLightboxOpen, onClose]);

  if (!isOpen) return null;

  const currentResource = resources[currentIndex];
  const isDemoStatic = Boolean(
    currentResource &&
      (currentResource.id.startsWith('demo_') ||
        currentResource.modelUsed?.includes('Demonstrativo') ||
        currentResource.modelUsed?.includes('Referência'))
  );

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : resources.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < resources.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visual-support-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="visual-support-title" className="text-sm font-bold text-white">
                  Apoio Visual Didático
                </h3>
                {stageName && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 font-semibold">
                    {stageName}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Conceito: <strong className="text-slate-200">{conceptName}</strong>
                {documentTitle && (
                  <span className="ml-2 text-slate-500 truncate hidden sm:inline">
                    • Doc: {documentTitle}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenGenerator && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGenerator();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-cyan-600/30 transition-all cursor-pointer"
                title="Abrir o gerador para criar nova imagem com IA (Gemini BYOK)"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                <span>Gerar com Gemini</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Fechar apoio visual (ESC)"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notificação de Diretriz Pedagógica */}
        <div className="px-6 pt-3 pb-1 shrink-0">
          <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/50 rounded-xl flex items-start gap-2.5 text-xs text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed text-[11.5px]">
              <span className="font-semibold text-cyan-100 block">
                Diretriz de Aprendizagem Visual:
              </span>
              <p className="text-cyan-300/90">
                {stageNote ||
                  'Esta imagem é um recurso de apoio iconográfico para consolidação conceitual. Ela não substitui sua formulação autônoma nem as evidências textuais do documento original.'}
              </p>
              <span className="text-[10px] text-cyan-400/70 font-mono block pt-0.5">
                Origem: Ilustração didática de apoio (não é figura extraída do material original).
              </span>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!currentResource ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Palette className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
              <p className="text-xs">Nenhum recurso visual disponível para este conceito no momento.</p>
              {onOpenGenerator && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGenerator();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Gerar Ilustração com Gemini</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Aviso se for Exemplo Demonstrativo */}
              {isDemoStatic && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 text-amber-200">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Exemplo Didático de Referência:</strong> Ilustração pré-configurada de demonstração (não consome cota). Crie imagens reais exclusivas com o modelo Gemini.
                    </span>
                  </div>
                  {onOpenGenerator && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenGenerator();
                      }}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shrink-0 cursor-pointer shadow-sm text-center"
                    >
                      Gerar com Gemini Real
                    </button>
                  )}
                </div>
              )}

              {/* Contêiner da Imagem com Lightbox Trigger */}
              <div className="relative group bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center min-h-[260px] max-h-[50vh]">
                <img
                  src={currentResource.imageDataUrl}
                  alt={currentResource.title}
                  className="max-h-[48vh] w-auto max-w-full object-contain transition-transform duration-200"
                />

                {/* Botão Ampliar */}
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-lg border border-slate-700/80 transition-all opacity-90 hover:opacity-100 cursor-pointer"
                  title="Ampliar em tela cheia"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Ampliar</span>
                </button>
              </div>

              {/* Informações Didáticas e Metadados */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                      {currentResource.modality === 'visual_analogy'
                        ? 'Analogia Visual'
                        : currentResource.modality === 'process_mechanism'
                        ? 'Mecanismo & Processo'
                        : 'Ilustração Conceitual'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {currentResource.modelUsed || 'Visual Learning'}
                    </span>
                  </div>
                  {resources.length > 1 && (
                    <span className="text-xs font-mono text-slate-400">
                      Recurso {currentIndex + 1} de {resources.length}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white pt-1">{currentResource.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {currentResource.caption}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navegação entre Múltiplos Recursos do Conceito */}
        {resources.length > 1 && (
          <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <div className="flex items-center gap-1.5">
              {resources.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    currentIndex === i ? 'bg-cyan-400 w-5' : 'bg-slate-700 hover:bg-slate-500'
                  }`}
                  title={`Ver recurso ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Modal Lightbox de Ampliação Completa */}
      {isLightboxOpen && currentResource && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[94vh] flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-800 px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Visualização Ampliada</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                  {currentResource.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Fechar ampliação (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center overflow-hidden max-h-[80vh] min-h-[300px]">
              <img
                src={currentResource.imageDataUrl}
                alt={currentResource.title}
                className="w-full h-auto max-h-[78vh] object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

