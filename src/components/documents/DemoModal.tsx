import React from 'react';
import { BookOpen, Sparkles, Check, ArrowRight } from 'lucide-react';
import { DEMO_MATERIALS } from '../../services/documents/demoMaterials';
import type { DocumentSource } from '../../types';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDocumentId: string | null;
  onLoadDemoMaterial: (demoDoc: DocumentSource) => void;
}

export const DemoModal: React.FC<DemoModalProps> = ({
  isOpen,
  onClose,
  activeDocumentId,
  onLoadDemoMaterial,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Catálogo de Demonstração Científica</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Explore materiais científicos prontos com análises rigorosas sem gravar automaticamente no seu banco pessoal.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm p-1 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Lista de Materiais de Exemplo */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {DEMO_MATERIALS.map(({ document, analysis }) => {
            const isActive = activeDocumentId === document.id;

            return (
              <div
                key={document.id}
                className={`p-5 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-slate-800/80 border-cyan-500/80 shadow-md shadow-cyan-950/40'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 bg-violet-950/80 text-violet-300 border border-violet-800/60 rounded">
                        {document.subject}
                      </span>
                      <span className="text-slate-500 font-mono text-xs">·</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {document.pageCount} páginas documentadas
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white tracking-tight">{document.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{analysis.centralTheme}</p>

                    <div className="pt-2 flex flex-wrap gap-1.5">
                      {analysis.fundamentalConcepts.slice(0, 4).map((c: any) => (
                        <span
                          key={c.id}
                          className="text-[10px] font-mono bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                        >
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onLoadDemoMaterial(document);
                      onClose();
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all shrink-0 ${
                      isActive
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-600/30'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Carregado</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Estudar Exemplo</span>
                        <ArrowRight className="w-3 h-3 ml-0.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer com Aviso de Isolamento */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Garantia de isolamento: amostras não poluem seus documentos pessoais.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors font-medium text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
