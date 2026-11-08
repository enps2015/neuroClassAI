import React from 'react';
import {
  BookOpen,
  ShieldCheck,
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { Concept, DocumentSource } from '../../types';

interface CrearContextualizeViewProps {
  concept: Concept;
  document: DocumentSource | null;
  documentExcerpts?: string[];
  isCompleted: boolean;
  onCompleteAndAdvance: () => void;
}

export const CrearContextualizeView: React.FC<CrearContextualizeViewProps> = ({
  concept,
  document,
  documentExcerpts = [],
  isCompleted,
  onCompleteAndAdvance,
}) => {
  return (
    <div className="space-y-6">
      {/* Cabeçalho do Estágio */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/40">
              C
            </span>
            <h3 className="text-sm font-bold text-white">Estágio 1 — Contextualizar</h3>
            {isCompleted && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Concluído
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Compreenda o conceito de <strong>"{concept.name}"</strong> dentro do material científico{' '}
            <em>"{document?.title || 'Material Acadêmico'}"</em> e ancore seu significado nas evidências originais.
          </p>
        </div>
      </div>

      {/* Cartão Conceitual Principal */}
      <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-mono text-cyan-400">Conceito em Estudo</span>
            <h2 className="text-base font-bold text-white">{concept.name}</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded text-[11px] font-medium border ${
                concept.importance === 'fundamental'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {concept.importance === 'fundamental' ? 'Pilar Fundamental' : 'Conceito Complementar'}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {concept.epistemicStatus === 'explicitly_documented'
                  ? 'Fato Textual Documentado'
                  : concept.epistemicStatus === 'synthesized'
                  ? 'Síntese de Trechos'
                  : 'Inferência Didática'}
              </span>
            </div>
          </div>
        </div>

        {/* Definição Científica */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            Definição e Mecanismo Central
          </span>
          <p className="text-sm text-slate-200 bg-slate-900/70 p-4 rounded-lg border border-slate-800 leading-relaxed font-sans">
            {concept.definition}
          </p>
        </div>

        {/* Rigor Epistemológico: Diferenciação entre Fato e Inferência */}
        <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-lg flex items-start gap-2.5 text-xs text-cyan-300">
          <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-cyan-200">Garantia Epistemológica C.R.E.A.R.:</span>
            <p className="text-[11.5px] text-cyan-400/90 leading-relaxed">
              {concept.epistemicStatus === 'explicitly_documented'
                ? 'Este conceito possui respaldo literal direto nas páginas do documento original, verificado sem extrapolações algorítmicas.'
                : concept.epistemicStatus === 'synthesized'
                ? 'Conceito estruturado a partir da síntese integradora de múltiplos trechos do documento de referência.'
                : 'Formulação inferencial gerada para fins didáticos. Verifique a coerência lógica com as definições fundamentais.'}
            </p>
          </div>
        </div>
      </div>

      {/* Evidências Documentais Rastreáveis */}
      <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            Evidências e Citações no Documento Fonte ({concept.evidenceReferences.length})
          </span>
          <span className="text-[11px] font-mono text-slate-500">Rastreabilidade Estrita</span>
        </div>

        {concept.evidenceReferences.length > 0 ? (
          <div className="space-y-2.5">
            {concept.evidenceReferences.map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg space-y-1.5 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-cyan-400 font-semibold bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/40">
                    {ev.type === 'pdf_page' && `Página ${(ev as any).pageNumber}`}
                    {ev.type === 'figure' && `${(ev as any).figureLabel} (Pág. ${(ev as any).pageNumber})`}
                    {ev.type === 'table' && `${(ev as any).tableLabel} (Pág. ${(ev as any).pageNumber})`}
                    {ev.type === 'note_section' && `Seção "${(ev as any).sectionTitle}"`}
                  </span>
                  <span className="text-slate-500 text-[10px]">Citação Literal</span>
                </div>
                <blockquote className="text-xs italic text-slate-300 border-l-2 border-cyan-500/60 pl-3 py-0.5">
                  "{ev.excerpt}"
                </blockquote>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic p-3 bg-slate-900/40 rounded-lg border border-slate-800/60">
            Nenhuma citação isolada identificada para este conceito. Consulte os trechos gerais do documento abaixo.
          </p>
        )}

        {/* Trechos complementares do documento se disponíveis */}
        {documentExcerpts.length > 0 && concept.evidenceReferences.length === 0 && (
          <div className="pt-2 space-y-2">
            <span className="text-[11px] font-semibold text-slate-400">Trechos Contextuais Gerais:</span>
            {documentExcerpts.slice(0, 2).map((excerpt, i) => (
              <p key={i} className="text-xs text-slate-400 bg-slate-900/50 p-2.5 rounded border border-slate-800/60 italic">
                "{excerpt}"
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Ação de Conclusão da Contextualização */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-slate-500">
          Etapa 1 de 5 · Compreensão inicial e ancoragem documental
        </span>
        <button
          onClick={onCompleteAndAdvance}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
        >
          <span>Concluir Contextualização e Avançar para Relacionar</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

