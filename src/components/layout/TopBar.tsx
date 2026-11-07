import React from 'react';
import { Sparkles, Database, BookOpen, AlertCircle, HardDrive, FileText } from 'lucide-react';
import type { DocumentSource, ServiceHealthStatus } from '../../types';

interface TopBarProps {
  documents: DocumentSource[];
  activeDocument: DocumentSource | null;
  onSelectDocument: (doc: DocumentSource) => void;
  onOpenUpload: () => void;
  onOpenDemos: () => void;
  onOpenReport?: () => void;
  onOpenExplain?: () => void;
  healthStatus: Record<string, ServiceHealthStatus>;
  storageUsage: { usagePercent: number; isCritical: boolean };
}

export const TopBar: React.FC<TopBarProps> = ({
  documents,
  activeDocument,
  onSelectDocument,
  onOpenUpload,
  onOpenDemos,
  onOpenReport,
  onOpenExplain,
  healthStatus,
  storageUsage,
}) => {
  const isHealthy = Object.values(healthStatus).every(s => s.state === 'healthy');

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30">
      {/* Zona 1: Brand e Nome do Aplicativo */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            NeuroClass AI
          </span>
          <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
            Núcleo Educacional Multimodal
          </span>
        </div>
      </div>

      {/* Zona 2: Seletor de Documentos e Navegação Rápida */}
      <div className="hidden md:flex items-center gap-4 flex-1 max-w-xl mx-auto">
        <div className="relative flex-1">
          <select
            value={activeDocument?.id || ''}
            onChange={(e) => {
              const selected = documents.find(d => d.id === e.target.value);
              if (selected) onSelectDocument(selected);
            }}
            className="w-full bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-medium"
          >
            {documents.length === 0 ? (
              <option value="">Nenhum material carregado</option>
            ) : (
              documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.isDemoMaterial ? '🧪 [Demo] ' : '📄 '}
                  {doc.title} ({doc.subject})
                </option>
              ))
            )}
          </select>
        </div>

        <button
          onClick={onOpenDemos}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          title="Explorar materiais de demonstração científica"
        >
          <BookOpen className="w-3.5 h-3.5 text-violet-400" />
          <span>Exemplos Científicos</span>
        </button>

        {onOpenExplain && (
          <button
            onClick={onOpenExplain}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/30 rounded-lg transition-colors whitespace-nowrap shadow-sm shadow-indigo-500/10"
            title="Explicar conceitos com próprias palavras (Método Feynman / C.R.E.A.R.)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Agora Eu Explico</span>
          </button>
        )}
      </div>

      {/* Zona 3: Ações Primárias e Estado de Resiliência */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Indicador de Espaço Local */}
        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-slate-400 font-mono rounded bg-slate-900/60 border border-slate-800"
          title={`Armazenamento IndexedDB: ${Math.round(storageUsage.usagePercent)}% utilizado`}
        >
          <HardDrive className={`w-3 h-3 ${storageUsage.isCritical ? 'text-coral-400' : 'text-slate-400'}`} />
          <span>{Math.round(storageUsage.usagePercent)}%</span>
        </div>

        {/* Indicador de Saúde do Serviço */}
        {!isHealthy && (
          <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Serviço Limitado</span>
          </div>
        )}

        {onOpenReport && (
          <button
            onClick={onOpenReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap shadow-sm"
            title="Visualizar e baixar relatório técnico completo da Fase 1"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Relatório Fase 1</span>
          </button>
        )}

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm shadow-cyan-600/30 transition-all whitespace-nowrap"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Importar Material</span>
        </button>
      </div>
    </header>
  );
};
