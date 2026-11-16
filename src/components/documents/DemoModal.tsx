import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Check,
  ArrowRight,
  Activity,
  Cpu,
  Compass,
  Users,
  TrendingUp,
  GraduationCap,
  FileText,
  BookmarkCheck,
} from 'lucide-react';
import { DEMO_MATERIALS } from '../../services/documents/demoMaterials';
import type { DocumentSource } from '../../types';

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDocumentId: string | null;
  onLoadDemoMaterial: (demoDoc: DocumentSource) => void;
}

const AREA_ICONS: Record<string, React.ReactNode> = {
  'Ciências Biológicas e Saúde': <Activity className="w-4 h-4 text-emerald-400" />,
  'Ciências Exatas e da Terra': <Sparkles className="w-4 h-4 text-sky-400" />,
  'Engenharias e Tecnologia': <Cpu className="w-4 h-4 text-cyan-400" />,
  'Ciências Humanas e Filosofia': <Compass className="w-4 h-4 text-amber-400" />,
  'Ciências Sociais': <Users className="w-4 h-4 text-violet-400" />,
  'Educação e Psicologia': <GraduationCap className="w-4 h-4 text-rose-400" />,
  'Administração e Economia': <TrendingUp className="w-4 h-4 text-indigo-400" />,
};

const CATEGORIES = [
  'Todas as 7 Áreas',
  'Ciências Biológicas e Saúde',
  'Ciências Exatas e da Terra',
  'Engenharias e Tecnologia',
  'Ciências Humanas e Filosofia',
  'Ciências Sociais',
  'Educação e Psicologia',
  'Administração e Economia',
] as const;

export const DemoModal: React.FC<DemoModalProps> = ({
  isOpen,
  onClose,
  activeDocumentId,
  onLoadDemoMaterial,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas as 7 Áreas');
  const [expandedReferencesId, setExpandedReferencesId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredMaterials = DEMO_MATERIALS.filter(({ document }) => {
    if (selectedCategory === 'Todas as 7 Áreas') return true;
    return document.academicArea === selectedCategory;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-catalog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-950/60 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 id="demo-catalog-title" className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Biblioteca Multidisciplinar de Demonstração</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
                  7 Áreas Acadêmicas
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Obras canônicas abertas e rigorosas para graduação e pós-graduação, prontas para experimentação do ciclo C.R.E.A.R. e FSRS-7.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-base p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fechar catálogo"
          >
            ✕
          </button>
        </div>

        {/* Barra de Filtros por Área Acadêmica */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-950/50 border-b border-slate-800 overflow-x-auto shrink-0 scrollbar-thin text-xs">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {cat !== 'Todas as 7 Áreas' && AREA_ICONS[cat]}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        {/* Lista de Materiais Multidisciplinares */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {filteredMaterials.map(({ document, analysis }) => {
            const isActive = activeDocumentId === document.id;
            const isRefExpanded = expandedReferencesId === document.id;
            const areaIcon = document.academicArea ? AREA_ICONS[document.academicArea] : <FileText className="w-4 h-4 text-violet-400" />;

            return (
              <div
                key={document.id}
                className={`p-5 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-slate-850 border-cyan-500/80 shadow-lg shadow-cyan-950/30'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Metadados e Área */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-900 text-slate-200 border border-slate-700/80 rounded-md flex items-center gap-1.5">
                        {areaIcon}
                        <span>{document.academicArea || 'Acadêmico'}</span>
                      </span>
                      <span className="text-slate-600 font-mono text-xs">·</span>
                      <span className="text-xs text-violet-300/90 font-medium">
                        {document.subject}
                      </span>
                      <span className="text-slate-600 font-mono text-xs">·</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {document.pageCount} páginas documentadas
                      </span>
                    </div>

                    {/* Título e Tema Central */}
                    <h4 className="text-base font-bold text-white tracking-tight leading-snug">
                      {document.title}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {analysis.centralTheme}
                    </p>

                    {/* Objetivos de Aprendizagem (Amostra) */}
                    <div className="pt-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Objetivos Didáticos Principais:</span>
                      </div>
                      <ul className="text-xs text-slate-300 list-disc list-inside space-y-0.5">
                        {analysis.learningObjectives.slice(0, 2).map((obj: string, idx: number) => (
                          <li key={idx} className="line-clamp-1">{obj}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Conceitos Fundamentais */}
                    <div className="pt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-mono text-slate-500 uppercase mr-1">Conceitos:</span>
                      {analysis.fundamentalConcepts.slice(0, 5).map((c: any) => (
                        <span
                          key={c.id}
                          className="text-[10px] font-mono bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                        >
                          {c.name}
                        </span>
                      ))}
                      {analysis.fundamentalConcepts.length > 5 && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          +{analysis.fundamentalConcepts.length - 5} mais
                        </span>
                      )}
                    </div>

                    {/* Seção de Referências Bibliográficas Reais */}
                    {document.bibliographicReferences && document.bibliographicReferences.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setExpandedReferencesId(isRefExpanded ? null : document.id)}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                        >
                          {isRefExpanded ? 'Ocultar referências bibliográficas' : `Ver referências bibliográficas reais (${document.bibliographicReferences.length})`}
                        </button>
                        {isRefExpanded && (
                          <div className="mt-2 p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1 text-xs text-slate-400 font-mono">
                            {document.bibliographicReferences.map((ref, idx) => (
                              <div key={idx} className="leading-relaxed">
                                • {ref}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Ação de Carregar Demonstração */}
                  <div className="flex md:flex-col items-center justify-end gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onLoadDemoMaterial(document);
                        onClose();
                      }}
                      className={`w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm ${
                        isActive
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/30'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>Em Estudo</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Estudar Material</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer com Aviso de Isolamento Rigoroso */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/90 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Garantia de Isolamento: Os materiais demonstrativos são imutáveis e não alteram seus documentos pessoais no IndexedDB.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium text-xs cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
