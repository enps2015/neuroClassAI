import React, { useState } from 'react';
import {
  Compass,
  ArrowRight,
  Sparkles,
  BookOpen,
  Brain,
  Clock,
  Award,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
} from 'lucide-react';
import type { Concept, ConceptMastery, DocumentSource, LearningAnalysis } from '../../types';

export interface DynamicGuidancePanelProps {
  activeDocument: DocumentSource | null;
  analysis: LearningAnalysis | null;
  selectedConcept: Concept | null;
  conceptMastery?: ConceptMastery | null;
  reviewDueCount: number;
  isAnalyzing: boolean;
  onOpenDemos: () => void;
  onOpenUpload: () => void;
  onOpenCrearCycle?: () => void;
  onOpenExplain?: () => void;
  onOpenSpacedReview?: () => void;
  onSelectTab?: (tab: 'blackboard' | 'notebook' | 'document_preview') => void;
}

export type JourneyStage = 'document' | 'concepts' | 'crear' | 'review' | 'mastery';

export const DynamicGuidancePanel: React.FC<DynamicGuidancePanelProps> = ({
  activeDocument,
  analysis,
  selectedConcept,
  conceptMastery,
  reviewDueCount,
  isAnalyzing,
  onOpenDemos,
  onOpenUpload,
  onOpenCrearCycle,
  onOpenExplain,
  onOpenSpacedReview,
  onSelectTab,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  if (isDismissed) return null;

  // Determinar a etapa ativa na jornada pedagógica
  let activeStage: JourneyStage = 'document';
  if (reviewDueCount > 0) {
    activeStage = 'review';
  } else if (conceptMastery?.diagnosticState === 'mastered') {
    activeStage = 'mastery';
  } else if (selectedConcept) {
    activeStage = 'crear';
  } else if (analysis && analysis.fundamentalConcepts.length > 0) {
    activeStage = 'concepts';
  } else if (activeDocument) {
    activeStage = 'document';
  }

  interface Recommendation {
    title: string;
    description: string;
    actionLabel: string;
    actionIcon: React.ReactNode;
    action: () => void;
    badge: string;
    badgeColor: string;
  }

  const getRecommendation = (): Recommendation => {
    // 1. Revisões vencidas no FSRS-7 possuem prioridade máxima para retenção
    if (reviewDueCount > 0 && onOpenSpacedReview) {
      return {
        badge: 'Recuperação Ativa',
        badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        title: `${reviewDueCount} ${reviewDueCount === 1 ? 'conceito pronto' : 'conceitos prontos'} para revisão`,
        description: 'Momento ideal segundo o modelo FSRS-7 para evocar o conteúdo antes do declínio de retenção.',
        actionLabel: 'Revisar Agora',
        actionIcon: <Clock className="w-3 h-3 text-emerald-400" />,
        action: onOpenSpacedReview,
      };
    }

    // 2. Sem documento selecionado
    if (!activeDocument) {
      return {
        badge: 'Início',
        badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
        title: 'Escolha uma obra para começar seu estudo ativo',
        description: 'Explore uma das 7 obras canônicas da Biblioteca de Demonstração ou importe seu material em PDF.',
        actionLabel: 'Explorar Biblioteca',
        actionIcon: <BookOpen className="w-3 h-3 text-cyan-400" />,
        action: onOpenDemos,
      };
    }

    // 3. Documento carregado mas análise em andamento
    if (isAnalyzing) {
      return {
        badge: 'Analisando',
        badgeColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
        title: 'Mapeando rede conceitual e evidências...',
        description: 'Extraindo núcleos conceituais fundamentais e relações causais do documento.',
        actionLabel: 'Aguarde...',
        actionIcon: <Sparkles className="w-3 h-3 animate-spin text-indigo-400" />,
        action: () => {},
      };
    }

    // 4. Documento sem análise
    if (!analysis || analysis.fundamentalConcepts.length === 0) {
      return {
        badge: 'Extração Pendente',
        badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        title: 'Gere a rede conceitual do material',
        description: 'Transforme seu material em um grafo cognitivo interativo com apoio de IA multimodal.',
        actionLabel: 'Analisar Documento',
        actionIcon: <Sparkles className="w-3 h-3 text-amber-400" />,
        action: onOpenUpload,
      };
    }

    // 5. Análise concluída mas nenhum conceito selecionado
    if (!selectedConcept) {
      return {
        badge: 'Navegação',
        badgeColor: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
        title: 'Selecione um conceito no Quadro para focar o estudo',
        description: `${analysis.fundamentalConcepts.length} conceitos essenciais mapeados no documento.`,
        actionLabel: 'Ver Quadro',
        actionIcon: <Layers className="w-3 h-3 text-violet-400" />,
        action: () => {
          if (onSelectTab) onSelectTab('blackboard');
        },
      };
    }

    // 6. Conceito selecionado com maestria consolidada (mastered)
    if (conceptMastery?.diagnosticState === 'mastered') {
      return {
        badge: 'Dominado',
        badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        title: `Domínio validado: "${selectedConcept.name}"`,
        description: 'Compreensão autônoma e aplicação prática comprovadas. Mantenha revisões ativas.',
        actionLabel: onOpenSpacedReview ? 'Ver FSRS-7' : 'Próximo Conceito',
        actionIcon: <Award className="w-3 h-3 text-emerald-400" />,
        action: () => {
          if (onOpenSpacedReview) onOpenSpacedReview();
        },
      };
    }

    // 7. Conceito selecionado com lacuna confirmada
    if (conceptMastery?.diagnosticState === 'confirmed_gap') {
      return {
        badge: 'Lacuna Identificada',
        badgeColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        title: `Reforce a compreensão de "${selectedConcept.name}"`,
        description: 'Revisite a explicação dos mecanismos causais com base nas evidências do texto.',
        actionLabel: onOpenExplain ? 'Explicar Novamente' : 'Ciclo C.R.E.A.R.',
        actionIcon: <Brain className="w-3 h-3 text-rose-400" />,
        action: () => {
          if (onOpenExplain) onOpenExplain();
          else if (onOpenCrearCycle) onOpenCrearCycle();
        },
      };
    }

    // 8. Conceito selecionado pronto para o percurso C.R.E.A.R.
    return {
      badge: 'Estudo Ativo',
      badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      title: `Aprofundar "${selectedConcept.name}"`,
      description: 'Percorra os 5 estágios: Contextualizar, Relacionar, Explicar, Aplicar e Recuperar.',
      actionLabel: 'Iniciar C.R.E.A.R.',
      actionIcon: <Sparkles className="w-3 h-3 text-cyan-400" />,
      action: () => {
        if (onOpenCrearCycle) onOpenCrearCycle();
        else if (onOpenExplain) onOpenExplain();
      },
    };
  };

  const rec = getRecommendation();

  return (
    <aside
      aria-label="Painel de Orientação Dinâmica"
      className="bg-slate-950/70 border-b border-slate-850/80 px-4 py-1.5 backdrop-blur-sm transition-all text-xs text-slate-300 select-none"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Trilha de Aprendizagem Compacta */}
        <nav aria-label="Jornada do Estudante" className="hidden lg:flex items-center gap-1 font-medium">
          <span className="text-[10px] font-mono text-slate-500 uppercase mr-1 flex items-center gap-1">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>Trilha:</span>
          </span>

          <span
            className={`px-1.5 py-0.2 rounded text-[10px] transition-colors whitespace-nowrap ${
              activeStage === 'document'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                : 'text-slate-500'
            }`}
          >
            1. Documento
          </span>
          <span className="text-slate-700 font-mono text-[9px]">›</span>

          <span
            className={`px-1.5 py-0.2 rounded text-[10px] transition-colors whitespace-nowrap ${
              activeStage === 'concepts'
                ? 'bg-violet-500/20 text-violet-300 font-bold border border-violet-500/30'
                : 'text-slate-500'
            }`}
          >
            2. Conceitos
          </span>
          <span className="text-slate-700 font-mono text-[9px]">›</span>

          <span
            className={`px-1.5 py-0.2 rounded text-[10px] transition-colors whitespace-nowrap ${
              activeStage === 'crear'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                : 'text-slate-500'
            }`}
          >
            3. C.R.E.A.R.
          </span>
          <span className="text-slate-700 font-mono text-[9px]">›</span>

          <span
            className={`px-1.5 py-0.2 rounded text-[10px] transition-colors whitespace-nowrap ${
              activeStage === 'review'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                : 'text-slate-500'
            }`}
          >
            4. Revisão
          </span>
          <span className="text-slate-700 font-mono text-[9px]">›</span>

          <span
            className={`px-1.5 py-0.2 rounded text-[10px] transition-colors whitespace-nowrap ${
              activeStage === 'mastery'
                ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30'
                : 'text-slate-500'
            }`}
          >
            5. Domínio
          </span>
        </nav>

        {/* Recomendação Inteligente (Subtle Context Prompt) */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 font-medium ${rec.badgeColor}`}>
            {rec.badge}
          </span>

          <span className="text-xs font-medium text-slate-200 truncate">
            {rec.title}
          </span>

          <button
            type="button"
            onClick={rec.action}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-850 text-slate-200 hover:text-white rounded-lg font-medium text-xs border border-slate-750 hover:border-cyan-500/40 transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
          >
            {rec.actionIcon}
            <span>{rec.actionLabel}</span>
            <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors cursor-pointer shrink-0 ml-1"
            title="Ocultar barra de orientação"
            aria-label="Ocultar orientação"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  );
};
