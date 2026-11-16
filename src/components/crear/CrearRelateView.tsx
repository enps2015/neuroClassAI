import React, { useState } from 'react';
import {
  Share2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  HelpCircle,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Palette,
  Eye,
} from 'lucide-react';
import type { Concept, ConceptRelationship, LearningAnalysis, RelationshipType, VisualResource } from '../../types';
import { extractConceptRelations } from '../../services/learning/crearCycleService';

interface CrearRelateViewProps {
  concept: Concept;
  analysis: LearningAnalysis | null;
  isCompleted: boolean;
  onCompleteAndAdvance: () => void;
  visualResources?: VisualResource[];
  onOpenVisualSupport?: () => void;
}

const RELATION_TYPE_META: Record<RelationshipType, { label: string; color: string; desc: string }> = {
  causes: {
    label: 'Causa e Efeito',
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60',
    desc: 'Atua como causa motriz ou mecanismo necessário para a ocorrência.',
  },
  regulates: {
    label: 'Regulação / Modulação',
    color: 'text-violet-400 bg-violet-950/60 border-violet-800/60',
    desc: 'Modula, amplifica, atenua ou inibe a intensidade do fenômeno.',
  },
  precedes: {
    label: 'Pré-requisito Temporal',
    color: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
    desc: 'Ocorre cronologicamente antes ou é base formativa necessária.',
  },
  composes: {
    label: 'Composição Estrutural',
    color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60',
    desc: 'Constitui parte estrutural ou componente molecular/funcional.',
  },
  contrasts: {
    label: 'Contraste / Oposição',
    color: 'text-rose-400 bg-rose-950/60 border-rose-800/60',
    desc: 'Apresenta distinção crítica, mecanismo oposto ou limite operacional.',
  },
  correlates: {
    label: 'Correlação Empírica',
    color: 'text-blue-400 bg-blue-950/60 border-blue-800/60',
    desc: 'Associação observada sem comprovação de causalidade direta unilateral.',
  },
};

export const CrearRelateView: React.FC<CrearRelateViewProps> = ({
  concept,
  analysis,
  isCompleted,
  onCompleteAndAdvance,
  visualResources = [],
  onOpenVisualSupport,
}) => {
  const { prerequisites, outgoingRelations, incomingRelations } = extractConceptRelations(
    concept.id,
    analysis
  );

  const [inspectedConcept, setInspectedConcept] = useState<Concept | null>(null);

  const totalConnections = prerequisites.length + outgoingRelations.length + incomingRelations.length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Estágio */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-violet-500/20 text-violet-400 font-bold text-xs flex items-center justify-center border border-violet-500/40">
              R
            </span>
            <h3 className="text-sm font-bold text-white">Estágio 2 — Relacionar</h3>
            {isCompleted && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                <CheckCircle2 className="w-3 h-3" />
                Concluído
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Mapeie como <strong>"{concept.name}"</strong> se conecta a outros conceitos no grafo cognitivo.
            Identifique pré-requisitos essenciais e o impacto causal deste mecanismo no sistema.
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[10px] font-mono uppercase text-slate-500">Conexões Mapeadas</span>
          <p className="text-sm font-bold text-violet-400">{totalConnections} Relações</p>
        </div>
      </div>

      {/* Seção 1: Pré-Requisitos Cognitivos (DAG) */}
      <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Pré-Requisitos Fundamentais ({prerequisites.length})
          </span>
          <span className="text-[10.5px] text-slate-500 font-mono">Grafo de Dependências</span>
        </div>

        {prerequisites.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prerequisites.map(prereq => (
              <div
                key={prereq.id}
                onClick={() => setInspectedConcept(prereq)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  inspectedConcept?.id === prereq.id
                    ? 'bg-amber-950/40 border-amber-500/80 shadow-sm shadow-amber-900/30'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">{prereq.name}</span>
                  <span className="text-[10px] font-mono text-amber-400/90 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/40">
                    Pré-requisito
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-400 mt-1 line-clamp-2">{prereq.definition}</p>
                <span className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-2 block font-medium">
                  Clique para inspecionar detalhes →
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic p-3 bg-slate-900/50 rounded-lg border border-slate-800/60">
            Este é um conceito de nível basal no material, sem pré-requisitos textuais intermediários listados no grafo.
          </p>
        )}
      </div>

      {/* Seção 2: Relações Causais e Ramificações */}
      <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          Relações Semânticas Direcionadas
        </span>

        {outgoingRelations.length > 0 || incomingRelations.length > 0 ? (
          <div className="space-y-3">
            {/* Relações que partem deste conceito */}
            {outgoingRelations.map(({ relation, targetConcept }, idx) => {
              const meta = RELATION_TYPE_META[relation.relationType] || {
                label: relation.relationType,
                color: 'text-slate-300 bg-slate-900 border-slate-800',
                desc: 'Relação semântica',
              };

              return (
                <div
                  key={relation.id || idx}
                  className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-semibold text-cyan-300">"{concept.name}"</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="font-semibold text-slate-200">
                        "{targetConcept?.name || relation.targetConceptId}"
                      </span>
                    </div>
                    {targetConcept && (
                      <button
                        onClick={() => setInspectedConcept(targetConcept)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                      >
                        Inspecionar
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 pl-5 leading-relaxed">{relation.description}</p>
                </div>
              );
            })}

            {/* Relações que chegam a este conceito */}
            {incomingRelations.map(({ relation, sourceConcept }, idx) => {
              const meta = RELATION_TYPE_META[relation.relationType] || {
                label: relation.relationType,
                color: 'text-slate-300 bg-slate-900 border-slate-800',
                desc: 'Relação semântica',
              };

              return (
                <div
                  key={relation.id || idx}
                  className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-3.5 h-3.5 text-violet-400" />
                      <span className="font-semibold text-slate-200">
                        "{sourceConcept?.name || relation.sourceConceptId}"
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="font-semibold text-cyan-300">"{concept.name}"</span>
                    </div>
                    {sourceConcept && (
                      <button
                        onClick={() => setInspectedConcept(sourceConcept)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                      >
                        Inspecionar
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 pl-5 leading-relaxed">{relation.description}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic p-3 bg-slate-900/40 rounded-lg border border-slate-800/60">
            Nenhuma relação adicional mapeada explicitamente para este nó no grafo documental.
          </p>
        )}
      </div>

      {/* Painel de Inspeção do Conceito Conectado (se selecionado) */}
      {inspectedConcept && (
        <div className="p-4 bg-indigo-950/30 border border-indigo-800/50 rounded-xl space-y-2">
          <div className="flex items-center justify-between border-b border-indigo-800/40 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-white">Conceito Conexo: {inspectedConcept.name}</span>
            </div>
            <button
              onClick={() => setInspectedConcept(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Fechar
            </button>
          </div>
          <p className="text-xs text-indigo-200 leading-relaxed">{inspectedConcept.definition}</p>
        </div>
      )}

      {/* Apoio Visual das Relações (Opcional) */}
      {visualResources.length > 0 && (
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-violet-400" />
              Apoio Visual das Relações ({visualResources.length})
            </span>
            <button
              type="button"
              onClick={onOpenVisualSupport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-violet-300 hover:text-white text-xs font-semibold rounded-lg border border-violet-800/50 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-violet-400" />
              <span>Consultar Apoio Visual para Relações</span>
            </button>
          </div>
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            Utilize a ilustração iconográfica e suas relações vetoriais para visualizar as interações causais e regulatórias com outros conceitos.
          </p>
        </div>
      )}

      {/* Ação de Conclusão do Mapeamento de Relações */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-slate-500">
          Etapa 2 de 5 · Interconexões e causalidade mapeadas
        </span>
        <button
          onClick={onCompleteAndAdvance}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-violet-600/20 transition-all cursor-pointer"
        >
          <span>Concluir Relações e Avançar para Explicar (Agora Eu Explico)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

