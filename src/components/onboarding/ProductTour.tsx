import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, CheckCircle2, Compass, Sparkles } from 'lucide-react';
import { TOUR_STEPS, type TourStep } from './onboardingData';

interface ProductTourProps {
  isOpen: boolean;
  onClose: () => void;
  onFinishTour: () => void;
  onOpenGuide?: () => void;
  onReturnToWelcome?: () => void;
}

export const ProductTour: React.FC<ProductTourProps> = ({
  isOpen,
  onClose,
  onFinishTour,
  onOpenGuide,
  onReturnToWelcome,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && currentStepIndex < TOUR_STEPS.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
        setCurrentStepIndex(prev => prev - 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex, onClose]);

  if (!isOpen) return null;

  const currentStep: TourStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onFinishTour();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl p-6 text-slate-100 overflow-hidden">
        {/* Cabeçalho do Tour com Progresso */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider block">
                Tour Guiado · Passo {currentStep.step} de {TOUR_STEPS.length}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Conheça a plataforma NeuroClass AI
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Pular tour"
            title="Pular tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Indicador Visual de Passos (Bolinhas) */}
        <div className="flex items-center gap-1.5 mb-5">
          {TOUR_STEPS.map((step, idx) => (
            <div
              key={step.step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? 'w-8 bg-cyan-400'
                  : idx < currentStepIndex
                  ? 'w-3 bg-cyan-700'
                  : 'w-3 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Conteúdo do Passo Atual */}
        <div className="space-y-3 mb-6 min-h-[140px]">
          <div>
            <span className="text-[11px] text-violet-400 font-semibold uppercase tracking-wider">
              {currentStep.subtitle}
            </span>
            <h3 id="tour-step-title" className="text-lg font-bold text-white mt-0.5">
              {currentStep.title}
            </h3>
          </div>

          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
            {currentStep.description}
          </p>

          <div className="bg-slate-950/70 border border-cyan-500/20 rounded-xl p-3 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-cyan-200/90 leading-tight">
              {currentStep.highlightText}
            </span>
          </div>
        </div>

        {/* Controles de Navegação */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Pular Tour
            </button>
            {onReturnToWelcome && (
              <button
                type="button"
                onClick={onReturnToWelcome}
                className="text-xs text-violet-400 hover:text-violet-300 font-medium cursor-pointer"
              >
                Voltar à Tela Inicial
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm shadow-cyan-600/30 transition-all cursor-pointer"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Concluir Tour</span>
                </>
              ) : (
                <>
                  <span>Próximo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
