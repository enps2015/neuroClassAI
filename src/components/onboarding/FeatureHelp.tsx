import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, ArrowRight, BookOpen } from 'lucide-react';
import { FEATURE_HELP_DATA, type FeatureHelpInfo } from './onboardingData';

interface FeatureHelpProps {
  featureKey: string;
  onOpenFullGuide?: () => void;
  className?: string;
  buttonSize?: 'sm' | 'xs';
}

export const FeatureHelp: React.FC<FeatureHelpProps> = ({
  featureKey,
  onOpenFullGuide,
  className = '',
  buttonSize = 'sm',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const helpInfo: FeatureHelpInfo | undefined = FEATURE_HELP_DATA[featureKey];

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!helpInfo) return null;

  const iconSizes = buttonSize === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const paddingSizes = buttonSize === 'xs' ? 'p-1' : 'p-1.5';

  return (
    <div className={`relative inline-block ${className}`} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={`Ajuda sobre ${helpInfo.featureName}`}
        aria-expanded={isOpen}
        title={`O que é ${helpInfo.featureName}?`}
        className={`${paddingSizes} rounded-full text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 cursor-pointer`}
      >
        <HelpCircle className={iconSizes} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-labelledby={`help-title-${featureKey}`}
          className="absolute z-50 mt-2 w-80 sm:w-96 right-0 md:left-0 md:right-auto bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 rounded-xl shadow-2xl p-4 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <h4 id={`help-title-${featureKey}`} className="font-bold text-white text-sm">
                  {helpInfo.featureName}
                </h4>
              </div>
              {helpInfo.technicalName && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {helpInfo.technicalName}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              aria-label="Fechar ajuda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Conteúdo Pedagógico */}
          <div className="space-y-2.5 leading-relaxed">
            <div>
              <span className="font-semibold text-cyan-300 uppercase tracking-wider text-[10px] block">
                O que é
              </span>
              <p className="text-slate-300 mt-0.5">{helpInfo.whatIsIt}</p>
            </div>

            <div>
              <span className="font-semibold text-violet-300 uppercase tracking-wider text-[10px] block">
                Para que serve
              </span>
              <p className="text-slate-300 mt-0.5">{helpInfo.whatIsItFor}</p>
            </div>

            <div>
              <span className="font-semibold text-amber-300 uppercase tracking-wider text-[10px] block">
                Quando utilizar
              </span>
              <p className="text-slate-300 mt-0.5">{helpInfo.whenToUse}</p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 mt-2">
              <span className="font-semibold text-emerald-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                Próximo passo recomendado
              </span>
              <p className="text-slate-300 mt-1">{helpInfo.recommendedNextStep}</p>
            </div>
          </div>

          {/* Rodapé com link para o Guia Completo */}
          {onOpenFullGuide && (
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenFullGuide();
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 hover:underline cursor-pointer"
              >
                <BookOpen className="w-3 h-3" />
                <span>Abrir Guia Completo do NeuroClass</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
