import React, { useState, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, HelpCircle, Layers, ShieldCheck, RefreshCw, Loader2, Sparkles, CheckCircle2, AlertTriangle, CircleDashed, Award, Clock, Image as ImageIcon, Palette, Eye, X } from 'lucide-react';
import type { Concept, ConceptRelationship, LearningAnalysis, RelationshipType, ConceptMastery, DiagnosticState, MasteryLevel, VisualResource } from '../../types';
import { calculateDocumentMasterySummary } from '../../services/learning/masteryEngine';
import { getDiagnosticStateMeta, getMasteryLevelMeta } from '../../utils/pedagogicalLabels';
import { visualLearningService } from '../../services/visual/visualLearningService';
import { VisualSupportViewerModal } from '../visual/VisualSupportViewerModal';
import { FeatureHelp } from '../onboarding/FeatureHelp';

interface BlackboardProps {
  analysis: LearningAnalysis | null;
  selectedConcept: Concept | null;
  onSelectConcept: (concept: Concept | null) => void;
  onAskTutorAboutConcept: (concept: Concept) => void;
  onExplainConcept?: (concept: Concept) => void;
  onStartCrearCycle?: (concept: Concept) => void;
  onOpenSpacedReview?: (conceptId?: string) => void;
  onGenerateVisualResource?: (concept: Concept) => void;
  onRegenerateGraph?: () => void;
  isRegenerating?: boolean;
  masteryMap?: Record<string, ConceptMastery>;
  onOpenGuide?: () => void;
}

export const Blackboard: React.FC<BlackboardProps> = ({
  analysis,
  selectedConcept,
  onSelectConcept,
  onAskTutorAboutConcept,
  onExplainConcept,
  onStartCrearCycle,
  onOpenSpacedReview,
  onGenerateVisualResource,
  onRegenerateGraph,
  isRegenerating = false,
  masteryMap,
  onOpenGuide,
}) => {
  const [zoom, setZoom] = useState(1);
  const [activeViewMode, setActiveViewMode] = useState<'concepts' | 'prerequisites' | 'processes'>('concepts');
  const [conceptVisualResources, setConceptVisualResources] = useState<VisualResource[]>([]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Carregar recursos visuais associados ao conceito selecionado
  useEffect(() => {
    let isMounted = true;
    if (selectedConcept) {
      visualLearningService
        .getVisualSupportForConcept(
          selectedConcept.id,
          selectedConcept.name,
          analysis?.documentId,
          analysis?.centralTheme
        )
        .then((res) => {
          if (isMounted) setConceptVisualResources(res);
        })
        .catch(() => {
          if (isMounted) setConceptVisualResources([]);
        });
    } else {
      setConceptVisualResources([]);
    }
    return () => {
      isMounted = false;
    };
  }, [selectedConcept?.id, analysis?.documentId, analysis?.centralTheme]);

  const allConcepts = useMemo(() => {
    if (!analysis) return [];
    return [
      ...analysis.fundamentalConcepts,
      ...analysis.complementaryConcepts,
    ];
  }, [analysis]);

  const masterySummary = useMemo(() => {
    if (!analysis) return null;
    return calculateDocumentMasterySummary(
      analysis.documentId,
      allConcepts,
      masteryMap || {}
    );
  }, [analysis, allConcepts, masteryMap]);

  if (!analysis) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
        <Layers className="w-10 h-10 text-slate-600 mb-3" />
        <h4 className="text-sm font-semibold text-slate-300">Quadro Didático Aguardando Material</h4>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Importe um documento ou selecione um exemplo científico para renderizar o grafo de conceitos, mecanismos causais e pré-requisitos.
        </p>
      </div>
    );
  }

  // Cálculo de posições visuais para o Grafo SVG (Layout Concéntrico em Camadas Hierárquicas)
  const nodePositions = new Map<string, { x: number; y: number }>();
  const centerX = 380;
  const centerY = 280;

  const fundamentals = analysis.fundamentalConcepts;
  const complementaries = analysis.complementaryConcepts;

  // 1. Conceitos Fundamentais distribuídos no anel nuclear/central
  const innerRadius = Math.min(180, Math.max(100, fundamentals.length * 16));
  fundamentals.forEach((c, index) => {
    const angle = (index / Math.max(1, fundamentals.length)) * 2 * Math.PI - Math.PI / 2;
    nodePositions.set(c.id, {
      x: centerX + innerRadius * Math.cos(angle),
      y: centerY + innerRadius * Math.sin(angle),
    });
  });

  // 2. Conceitos Complementares distribuídos no anel orbital externo
  const outerRadius = innerRadius + Math.min(130, Math.max(80, complementaries.length * 12));
  complementaries.forEach((c, index) => {
    const angle = (index / Math.max(1, complementaries.length)) * 2 * Math.PI - Math.PI / 4;
    nodePositions.set(c.id, {
      x: centerX + outerRadius * Math.cos(angle),
      y: centerY + outerRadius * Math.sin(angle),
    });
  });

  const getStrokeForRelation = (type: RelationshipType) => {
    switch (type) {
      case 'causes':
        return '#06b6d4'; // Ciano para Causa/Efeito
      case 'regulates':
        return '#8b5cf6'; // Violeta para Regulação
      case 'precedes':
        return '#f59e0b'; // Âmbar para Pré-requisito
      case 'contrasts':
        return '#f43f5e'; // Coral para Contraste
      default:
        return '#64748b'; // Ardósia
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Barra Única e Integrada do Blackboard */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs gap-3 select-none">
        {/* Esquerda: Identificação do Quadro e Tema */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-200 shrink-0">Quadro de Conceitos</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(Blackboard)</span>
          <FeatureHelp featureKey="blackboard" onOpenFullGuide={onOpenGuide} buttonSize="xs" />
          <span className="text-slate-600 font-mono">·</span>
          <span className="text-slate-400 font-medium truncate max-w-[200px]" title={analysis.centralTheme}>
            {analysis.centralTheme}
          </span>
        </div>

        {/* Centro: Modos de Visualização & Pílula de Domínio C.R.E.A.R. */}
        <div className="flex items-center gap-2">
          {/* Alternância de Modo (Rede / DAG) */}
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveViewMode('concepts')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                activeViewMode === 'concepts' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Rede Conceitual
            </button>
            <button
              onClick={() => setActiveViewMode('prerequisites')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                activeViewMode === 'prerequisites' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pré-Requisitos (DAG)
            </button>
          </div>

          {/* Chip Consolidado de Domínio Cognitivo C.R.E.A.R. */}
          {masterySummary && (
            <div
              className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono cursor-help"
              title={`Domínio C.R.E.A.R.: ${masterySummary.masteredCount} Dominados, ${masterySummary.understoodCount} Compreendidos, ${masterySummary.confirmedGapCount} Lacunas, ${masterySummary.unassessedCount} Não Avaliados. Cobertura: ${masterySummary.coveragePercent}%.`}
            >
              <Award className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-300">
                Domínio: <strong className="text-emerald-400">{masterySummary.masteryRatio}</strong>
              </span>
              <span className="text-slate-600">·</span>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-emerald-400 font-semibold">{masterySummary.masteredCount} Dom</span>
                <span className="text-slate-600">/</span>
                <span className="text-blue-400 font-semibold">{masterySummary.understoodCount} Comp</span>
                <span className="text-slate-600">/</span>
                <span className="text-amber-400 font-semibold">{masterySummary.confirmedGapCount} Lac</span>
              </div>
              <FeatureHelp featureKey="cognitive_mastery" onOpenFullGuide={onOpenGuide} buttonSize="xs" />
            </div>
          )}

          {/* Badge Multimodal Core v1: Cobertura Documental & Ativos Multimodais */}
          {analysis && (analysis.coverage || analysis.multimodalAssets) && (
            <div
              className="hidden lg:flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[10.5px] font-mono cursor-help text-slate-300"
              title={`Cobertura Documental: ${analysis.coverage ? `${analysis.coverage.coveragePercentage}% (${analysis.coverage.mode}) - ${analysis.coverage.processedPages.length}/${analysis.coverage.totalPages} págs.` : '100%'} | Ativos: ${analysis.multimodalAssets?.figures.length || 0} Fig, ${analysis.multimodalAssets?.tables.length || 0} Tab, ${analysis.multimodalAssets?.formulas.length || 0} Fórm, ${analysis.multimodalAssets?.charts.length || 0} Gráf.`}
            >
              <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                <span>📄</span>
                <span>{analysis.coverage ? `${analysis.coverage.coveragePercentage}%` : '100%'}</span>
                {analysis.coverage?.mode === 'sampled' && <span className="text-[9px] text-amber-400">(Amostra)</span>}
                {analysis.coverage?.mode === 'scanned_multimodal' && <span className="text-[9px] text-purple-400">(Scan)</span>}
              </span>
              {analysis.multimodalAssets && (
                <>
                  <span className="text-slate-600">·</span>
                  <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400">
                    {analysis.multimodalAssets.figures.length > 0 && <span>🧪 {analysis.multimodalAssets.figures.length} Fig</span>}
                    {analysis.multimodalAssets.tables.length > 0 && <span>📊 {analysis.multimodalAssets.tables.length} Tab</span>}
                    {analysis.multimodalAssets.formulas.length > 0 && <span>∑ {analysis.multimodalAssets.formulas.length} Fórm</span>}
                    {analysis.multimodalAssets.charts.length > 0 && <span>📈 {analysis.multimodalAssets.charts.length} Gráf</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Direita: Regeneração e Zoom */}
        <div className="flex items-center gap-2 shrink-0">
          {onRegenerateGraph && (
            <button
              onClick={onRegenerateGraph}
              disabled={isRegenerating}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:text-white bg-slate-850 hover:bg-slate-800 border border-slate-700/70 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              title="Reanalisar o documento completo e reconstruir o grafo com máxima densidade de relações"
            >
              {isRegenerating ? (
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
              ) : (
                <RefreshCw className="w-3 h-3 text-cyan-400" />
              )}
              <span className="hidden sm:inline">{isRegenerating ? 'Gerando...' : 'Regenerar'}</span>
            </button>
          )}

          {/* Controles de Zoom */}
          <div className="flex items-center gap-0.5 text-slate-400 pl-1 border-l border-slate-800">
            <button
              onClick={() => setZoom(z => Math.max(0.6, z - 0.15))}
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono tabular-nums px-1 text-slate-300">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(1.8, z + 0.15))}
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors ml-0.5 cursor-pointer"
              title="Redefinir visualização"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Área do SVG Interativo */}
      <div className="flex-1 relative overflow-hidden bg-radial from-slate-900/60 to-slate-950 flex items-center justify-center">
        <svg
          viewBox="0 0 760 560"
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
        >
          <defs>
            {/* Marcadores de setas direcionais */}
            <marker id="arrow-causes" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
            </marker>
            <marker id="arrow-regulates" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
            </marker>
            <marker id="arrow-precedes" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
            <marker id="arrow-default" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>

          {/* Renderização de Relações e Arestas */}
          {activeViewMode === 'concepts' &&
            analysis.relationships.map((rel: ConceptRelationship) => {
              const src = nodePositions.get(rel.sourceConceptId);
              const tgt = nodePositions.get(rel.targetConceptId);
              if (!src || !tgt) return null;

              const isConnectedToSelected =
                selectedConcept &&
                (selectedConcept.id === rel.sourceConceptId || selectedConcept.id === rel.targetConceptId);

              const strokeColor = getStrokeForRelation(rel.relationType);

              return (
                <g key={rel.id} className="transition-opacity duration-200">
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={strokeColor}
                    strokeWidth={isConnectedToSelected ? 2.5 : 1.2}
                    strokeDasharray={rel.isModelInference ? '4 3' : undefined}
                    opacity={isConnectedToSelected ? 0.95 : 0.35}
                    markerEnd={`url(#arrow-${rel.relationType === 'causes' ? 'causes' : rel.relationType === 'regulates' ? 'regulates' : rel.relationType === 'precedes' ? 'precedes' : 'default'})`}
                  />
                  {/* Rótulo da Relação */}
                  {isConnectedToSelected && (
                    <text
                      x={(src.x + tgt.x) / 2}
                      y={(src.y + tgt.y) / 2 - 6}
                      fill="#94a3b8"
                      fontSize="9"
                      textAnchor="middle"
                      className="font-mono bg-slate-900"
                    >
                      {rel.relationType} {rel.isModelInference ? '(inferido)' : ''}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Renderização do Modo Grafo de Pré-Requisitos */}
          {activeViewMode === 'prerequisites' &&
            analysis.prerequisiteGraph.edges.map((edge, idx) => {
              const src = nodePositions.get(edge.from);
              const tgt = nodePositions.get(edge.to);
              if (!src || !tgt) return null;

              return (
                <g key={`pre_${idx}`}>
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    opacity={0.8}
                    markerEnd="url(#arrow-precedes)"
                  />
                  <text
                    x={(src.x + tgt.x) / 2}
                    y={(src.y + tgt.y) / 2 - 6}
                    fill="#fbbf24"
                    fontSize="9"
                    textAnchor="middle"
                    className="font-mono"
                  >
                    exige base
                  </text>
                </g>
              );
            })}

          {/* Renderização dos Nós dos Conceitos */}
          {allConcepts.map((concept) => {
            const pos = nodePositions.get(concept.id);
            if (!pos) return null;

            const isSelected = selectedConcept?.id === concept.id;
            const isFundamental = concept.importance === 'fundamental';
            const mastery = masteryMap?.[concept.id];
            const diagnosticState: DiagnosticState = mastery?.diagnosticState || concept.diagnosticState || 'unassessed';
            const masteryLevel: MasteryLevel = mastery?.masteryLevel || 'recognize';

            // Abreviação pedagógica do nível cognitivo C.R.E.A.R.
            const levelLetter =
              masteryLevel === 'transfer' ? 'T' :
              masteryLevel === 'apply' ? 'A' :
              masteryLevel === 'understand' ? 'C' : 'R';

            return (
              <g
                key={concept.id}
                onClick={() => onSelectConcept(concept)}
                className="cursor-pointer group"
                transform={`translate(${pos.x}, ${pos.y})`}
              >
                {/* Halo de Seleção */}
                {isSelected && (
                  <circle
                    r={isFundamental ? 29 : 24}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                    opacity={0.9}
                  />
                )}

                {/* Anéis Externos Diagnósticos C.R.E.A.R. (Preservando a paleta base dos nós) */}
                {diagnosticState === 'unassessed' && (
                  <circle
                    r={isFundamental ? 24 : 19}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity={0.6}
                  />
                )}
                {diagnosticState === 'confirmed_gap' && (
                  <circle
                    r={isFundamental ? 24 : 19}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    opacity={0.95}
                  />
                )}
                {diagnosticState === 'understood' && (
                  <circle
                    r={isFundamental ? 24 : 19}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    opacity={0.9}
                  />
                )}
                {diagnosticState === 'mastered' && (
                  <>
                    <circle
                      r={isFundamental ? 25 : 20}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      opacity={0.95}
                    />
                    <circle
                      r={isFundamental ? 22.5 : 17.5}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="1.2"
                      opacity={0.8}
                    />
                  </>
                )}

                {/* Círculo Base do Nó (Fundamental vs Complementar) */}
                <circle
                  r={isFundamental ? 20 : 16}
                  fill={isSelected ? '#0891b2' : isFundamental ? '#1e293b' : '#0f172a'}
                  stroke={isSelected ? '#22d3ee' : isFundamental ? '#38bdf8' : '#64748b'}
                  strokeWidth={isFundamental ? 2 : 1.2}
                  className="transition-all duration-150 group-hover:stroke-cyan-300"
                />

                {/* Símbolo do Nó */}
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#ffffff"
                  fontSize={isFundamental ? '11' : '10'}
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  {isFundamental ? '★' : '•'}
                </text>

                {/* Badge Compacto de Nível Cognitivo C.R.E.A.R. */}
                {diagnosticState !== 'unassessed' && (
                  <g transform={`translate(${isFundamental ? 13 : 10}, -${isFundamental ? 13 : 10})`}>
                    <circle
                      r={6}
                      fill={
                        masteryLevel === 'transfer' ? '#047857' :
                        masteryLevel === 'apply' ? '#4338ca' :
                        masteryLevel === 'understand' ? '#1d4ed8' : '#334155'
                      }
                      stroke="#0f172a"
                      strokeWidth="1"
                    />
                    <text
                      textAnchor="middle"
                      dy="2.2"
                      fill="#ffffff"
                      fontSize="7.5"
                      fontWeight="bold"
                      className="pointer-events-none font-mono"
                    >
                      {levelLetter}
                    </text>
                  </g>
                )}

                {/* Nome do Conceito */}
                <text
                  textAnchor="middle"
                  dy={isFundamental ? 35 : 29}
                  fill={isSelected ? '#38bdf8' : '#e2e8f0'}
                  fontSize="11"
                  fontWeight={isSelected ? 'bold' : '500'}
                  className="pointer-events-none filter drop-shadow-md"
                >
                  {concept.name.length > 24 ? `${concept.name.slice(0, 22)}...` : concept.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legenda Acessível do Quadro com os 4 Estados e Níveis */}
        <div className="absolute bottom-3 left-3 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg p-3 text-[11px] space-y-2 text-slate-300 pointer-events-none max-w-xs shadow-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>Legenda C.R.E.A.R.</span>
            <span className="text-[9px] font-mono text-cyan-400">Feynman</span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
              <span>★ Fundamental</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
              <span>• Complementar</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-400 bg-emerald-500/20"></span>
              <span className="text-emerald-300">Dominado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 bg-blue-500/20"></span>
              <span className="text-blue-300">Compreendido</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-amber-400 border-dashed bg-amber-500/20"></span>
              <span className="text-amber-300">Lacuna</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-slate-500 border-dashed bg-transparent"></span>
              <span className="text-slate-400">Não Avaliado</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-800 text-[9px] text-slate-400 flex items-center justify-between">
            <span className="font-semibold text-slate-400">Níveis Cognitivos:</span>
            <span className="font-mono text-slate-300">R: Rec · C: Comp · A: Apl · T: Trans</span>
          </div>
        </div>
      </div>

      {/* Painel Inferior de Detalhes do Conceito Selecionado com Diagnóstico e Critérios */}
      {selectedConcept && (() => {
        const selMastery = masteryMap?.[selectedConcept.id];
        const selState: DiagnosticState = selMastery?.diagnosticState || selectedConcept.diagnosticState || 'unassessed';
        const selLevel: MasteryLevel = selMastery?.masteryLevel || 'recognize';
        const stateMeta = getDiagnosticStateMeta(selState);
        const levelMeta = getMasteryLevelMeta(selLevel);

        const diagnosticTooltip =
          selState === 'unassessed'
            ? 'Ainda não avaliado. Realize uma tentativa no Agora Eu Explico para iniciar a consolidação.'
            : selState === 'confirmed_gap'
            ? 'Lacuna identificada. Requer nova explicação dos mecanismos causais para validar compreensão.'
            : selState === 'understood'
            ? 'Compreensão validada. Para atingir Dominado: realize mais 1 tentativa consistente sem dica demonstrando aplicação.'
            : 'Domínio demonstrado em desempenho independente com aplicação prática (não comprova retenção de longo prazo).';

        return (
          <div className="border-t border-slate-800 bg-slate-950/95 backdrop-blur-md px-4 py-2.5 shadow-2xl relative transition-all">
            {/* Linha 1: Identidade, Diagnóstico e Ação de Fechar */}
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800/60">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                <h4 className="text-xs font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md">
                  {selectedConcept.name}
                </h4>
                <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded text-slate-400 bg-slate-850 border border-slate-700/60">
                  {selectedConcept.importance === 'fundamental' ? 'Fundamental' : 'Complementar'}
                </span>
                <span className="flex items-center gap-1 text-[9.5px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>
                    {selectedConcept.epistemicStatus === 'explicitly_documented'
                      ? 'Documentado'
                      : selectedConcept.epistemicStatus === 'synthesized'
                      ? 'Síntese'
                      : 'Inferência'}
                  </span>
                </span>
                {selectedConcept.evidenceReferences.length > 0 && (
                  <span className="text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded text-[9.5px] border border-cyan-800/40 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {selectedConcept.evidenceReferences.map((ev) => {
                        if (ev.type === 'pdf_page') return `Pág. ${(ev as any).pageNumber}`;
                        if (ev.type === 'formula') return `∑ ${(ev as any).formulaLabel || (ev as any).formulaExpression || 'Fórm.'}`;
                        if (ev.type === 'chart') return `📈 ${(ev as any).chartLabel || 'Gráf.'}`;
                        if (ev.type === 'table') return `📊 ${(ev as any).tableLabel || 'Tab.'}`;
                        if (ev.type === 'figure') return `🧪 ${(ev as any).figureLabel || 'Fig.'}`;
                        return '';
                      }).filter(Boolean).join(' · ') || 'Evidência citada'}
                    </span>
                    {selectedConcept.evidenceReferences.some((ev: any) => ev.isAmbiguous) && (
                      <span className="text-amber-400 font-sans text-[9px] bg-amber-950/60 px-1 rounded border border-amber-800/40" title="Preservação de incerteza: leitura ambígua no documento original">
                        ⚠️ Ambíguo
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Status Cognitivo + Botão Fechar */}
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="flex items-center gap-1.5 text-[10px] cursor-help"
                  title={diagnosticTooltip}
                >
                  <span className="text-slate-400 font-medium hidden sm:inline">Diagnóstico:</span>
                  <span className={`px-2 py-0.5 rounded font-semibold border ${stateMeta.badgeClass}`}>
                    {stateMeta.label}
                  </span>
                  {selState !== 'unassessed' && (
                    <span className={`px-1.5 py-0.5 rounded font-semibold border ${levelMeta.badgeClass}`}>
                      {levelMeta.label}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSelectConcept(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
                  title="Fechar painel do conceito"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Linha 2: Definição (Esquerda) e Cluster de Ações (Direita) */}
            <div className="pt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Esquerda: Definição concisa e apoio visual */}
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-2" title={selectedConcept.definition}>
                  {selectedConcept.definition}
                </p>
                {conceptVisualResources.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setIsViewerOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
                    >
                      <Palette className="w-3 h-3 text-amber-400" />
                      <span className="underline underline-offset-2">
                        {conceptVisualResources.length} apoio(s) visual(is) associado(s) — Ver ilustração
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Direita: Cluster de Ações Harmonioso e Priorizado */}
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {/* Ação Primária: Ciclo C.R.E.A.R. */}
                {onStartCrearCycle && (
                  <button
                    onClick={() => onStartCrearCycle(selectedConcept)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm shadow-cyan-600/30 transition-all cursor-pointer active:scale-95"
                    title="Iniciar o percurso cognitivo completo C.R.E.A.R. (Contextualizar, Relacionar, Explicar, Aplicar, Recuperar)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                    <span>Ciclo C.R.E.A.R.</span>
                  </button>
                )}

                {/* Ação 2: Agora Eu Explico */}
                {onExplainConcept && (
                  <button
                    onClick={() => onExplainConcept(selectedConcept)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700/70 hover:border-indigo-500/50 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Explicar com suas próprias palavras para avaliação formativa (Feynman / C.R.E.A.R.)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Explicar</span>
                  </button>
                )}

                {/* Ação 3: Revisar FSRS */}
                {onOpenSpacedReview && (
                  <button
                    onClick={() => onOpenSpacedReview(selectedConcept.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700/70 hover:border-emerald-500/50 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Abrir sessão de recuperação espaçada (FSRS-7) para este conceito"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Revisar</span>
                  </button>
                )}

                {/* Ação 4: Consultar no Tutor */}
                <button
                  onClick={() => onAskTutorAboutConcept(selectedConcept)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700/70 hover:border-violet-500/50 shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Tirar dúvidas e aprofundar este conceito no Tutor NeuroClass AI"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
                  <span>Tutor</span>
                </button>

                {/* Ação 5: Ver Ilustrações Existentes */}
                {conceptVisualResources.length > 0 && (
                  <button
                    onClick={() => setIsViewerOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-100 text-xs font-medium rounded-lg border border-amber-500/30 hover:border-amber-500/50 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Visualizar e ampliar ilustrações didáticas associadas a este conceito"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ilustração ({conceptVisualResources.length})</span>
                  </button>
                )}

                {/* Ação 6: Gerar Novo Recurso Visual com Gemini (BYOK) */}
                {onGenerateVisualResource && (
                  <button
                    onClick={() => onGenerateVisualResource(selectedConcept)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700/70 hover:border-amber-500/50 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="Gerar recurso visual didático contextualizado via Gemini API (BYOK)"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gerar Visual</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Apoio Visual do Conceito Selecionado */}
      {selectedConcept && (
        <VisualSupportViewerModal
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          conceptName={selectedConcept.name}
          resources={conceptVisualResources}
          stageName="Blackboard"
          stageNote="Recurso didático iconográfico para visualização de estruturas e dinâmicas causais deste conceito."
          documentTitle={analysis?.centralTheme}
          onOpenGenerator={() => onGenerateVisualResource?.(selectedConcept)}
        />
      )}
    </div>
  );
};
