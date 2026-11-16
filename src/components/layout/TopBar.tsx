import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Database,
  BookOpen,
  AlertCircle,
  HardDrive,
  Clock,
  HelpCircle,
  Trash2,
  Key,
  MoreVertical,
  Compass,
  Download,
  RotateCcw,
  ChevronDown,
  Check,
  Brain,
  FlaskConical,
} from 'lucide-react';
import type { DocumentSource, ServiceHealthStatus } from '../../types';
import { SaveStatusIndicator } from '../storage/SaveStatusIndicator';

export interface TopBarProps {
  documents: DocumentSource[];
  activeDocument: DocumentSource | null;
  onSelectDocument: (doc: DocumentSource) => void;
  onOpenUpload: () => void;
  onOpenDemos: () => void;
  onOpenExplain?: () => void;
  onOpenCrearCycle?: () => void;
  onOpenSpacedReview?: () => void;
  onOpenGuide?: () => void;
  onOpenWelcome?: () => void;
  onOpenApiKeyConfig?: () => void;
  hasApiKey?: boolean;
  onDeleteDocument?: (docId: string) => void;
  onFactoryReset?: () => void;
  reviewDueCount?: number;
  healthStatus: Record<string, ServiceHealthStatus>;
  storageUsage: { usagePercent: number; isCritical: boolean };
  onOpenStorageModal?: () => void;
  onOpenSemanticModal?: () => void;
  hasSemanticConsent?: boolean;
  onOpenGoldenDataset?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  documents,
  activeDocument,
  onSelectDocument,
  onOpenUpload,
  onOpenDemos,
  onOpenSpacedReview,
  onOpenGuide,
  onOpenWelcome,
  onOpenApiKeyConfig,
  hasApiKey,
  onDeleteDocument,
  onFactoryReset,
  reviewDueCount = 0,
  healthStatus,
  storageUsage,
  onOpenStorageModal,
  onOpenSemanticModal,
  hasSemanticConsent,
  onOpenGoldenDataset,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isHealthy = Object.values(healthStatus).every((s) => s.state === 'healthy');

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-2.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 select-none">
      {/* Zona 1: Logo & Identidade do Produto */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenWelcome}
          className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity cursor-pointer group"
          title="Abrir tela de apresentação e tour"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                NeuroClass AI
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/40 font-semibold uppercase">
                v2.0 Studio
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-normal">
              Aprendizagem Cognitiva & Memória
            </span>
          </div>
        </button>
      </div>

      {/* Zona 2: Seletor de Documento & Ações Rápidas de Material */}
      <div className="flex items-center gap-2 flex-1 max-w-2xl mx-auto justify-center">
        {/* Hub do Documento Ativo */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 max-w-md w-full shadow-inner">
          <span className="text-xs shrink-0">
            {activeDocument?.isDemoMaterial ? '🧪' : '📄'}
          </span>

          <select
            value={activeDocument?.id || ''}
            onChange={(e) => {
              const selected = documents.find((d) => d.id === e.target.value);
              if (selected) onSelectDocument(selected);
            }}
            className="w-full bg-transparent border-0 text-slate-200 text-xs focus:outline-none focus:ring-0 font-medium truncate cursor-pointer"
            title="Alternar material em estudo"
          >
            {documents.length === 0 ? (
              <option value="">Nenhum material carregado</option>
            ) : (
              documents.map((doc) => (
                <option key={doc.id} value={doc.id} className="bg-slate-900 text-slate-200">
                  {doc.isDemoMaterial ? '[Demo] ' : ''}
                  {doc.title} — {doc.subject}
                </option>
              ))
            )}
          </select>

          {activeDocument && !activeDocument.isDemoMaterial && onDeleteDocument && (
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  `Deseja realmente excluir "${activeDocument.title}" e todos os dados associados (anotações, histórico e revisões)?`
                );
                if (confirmed) onDeleteDocument(activeDocument.id);
              }}
              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer shrink-0"
              title="Excluir este material"
              aria-label={`Excluir ${activeDocument.title}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Botão de Biblioteca Demonstrativa */}
        <button
          onClick={onOpenDemos}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-sm"
          title="Explorar as 7 obras canônicas da Biblioteca Multidisciplinar de Demonstração"
        >
          <BookOpen className="w-3.5 h-3.5 text-violet-400" />
          <span className="hidden sm:inline">Exemplos</span>
        </button>

        {/* Botão de Importar Novo Material */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm shadow-cyan-600/20 transition-all whitespace-nowrap cursor-pointer"
          title="Importar material em PDF ou anotações próprias"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Importar</span>
        </button>
      </div>

      {/* Zona 3: Status do Sistema, Revisões e Menu de Opções */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Indicador de Salvamento Local-First (Autosave & Pasta) */}
        {onOpenStorageModal && (
          <SaveStatusIndicator onOpenStorageModal={onOpenStorageModal} />
        )}

        {/* Fila de Recuperação Espaçada FSRS-7 */}
        {onOpenSpacedReview && (
          <button
            onClick={onOpenSpacedReview}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              reviewDueCount > 0
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/20 animate-pulse'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
            }`}
            title="Acessar fila de recuperação e acompanhamento longitudinal FSRS-7"
          >
            <Clock className={`w-3.5 h-3.5 ${reviewDueCount > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="hidden md:inline">Revisão FSRS</span>
            {reviewDueCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500 text-slate-950">
                {reviewDueCount}
              </span>
            )}
          </button>
        )}

        {/* Status RAG Semântico / Híbrido Local */}
        {onOpenSemanticModal && (
          <button
            onClick={onOpenSemanticModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              hasSemanticConsent
                ? 'bg-violet-950/40 text-violet-300 border-violet-500/40 hover:bg-violet-900/40 shadow-sm shadow-violet-500/20'
                : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
            }`}
            title="Configurar motor de busca semântica local (multilingual-e5-small + RRF)"
          >
            <Brain className={`w-3.5 h-3.5 ${hasSemanticConsent ? 'text-violet-400' : 'text-slate-400'}`} />
            <span className="hidden lg:inline">{hasSemanticConsent ? 'RAG Híbrido' : 'BM25 Puro'}</span>
          </button>
        )}

        {/* Status Gemini BYOK */}
        {onOpenApiKeyConfig && (
          <button
            onClick={onOpenApiKeyConfig}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
              hasApiKey
                ? 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-emerald-500/40'
                : 'bg-amber-950/30 text-amber-300 border-amber-500/40 hover:bg-amber-950/60'
            }`}
            title="Configurar ou verificar chave BYOK da Google Gemini API"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasApiKey ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span className="hidden lg:inline">{hasApiKey ? 'Gemini Conectado' : 'Conectar Gemini'}</span>
          </button>
        )}

        {/* Alerta de Serviço Limitado */}
        {!isHealthy && (
          <div
            className="flex items-center gap-1 text-[11px] text-amber-400 font-medium px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded"
            title="Serviço de IA operando em modo de resiliência"
          >
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Menu de Utilidades (•••) */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-850 rounded-lg border border-slate-800 transition-colors cursor-pointer"
            title="Mais opções e ajuda"
            aria-label="Mais opções"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
              {onOpenSemanticModal && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenSemanticModal();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                >
                  <Brain className="w-4 h-4 text-violet-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Busca Híbrida & IA Semântica</span>
                    <span className="text-[10px] text-slate-500">
                      {hasSemanticConsent ? 'Ativa (E5 + BM25)' : 'Desativada (BM25 puro)'}
                    </span>
                  </div>
                </button>
              )}

              {onOpenGoldenDataset && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenGoldenDataset();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                >
                  <FlaskConical className="w-4 h-4 text-amber-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Experimento Golden Dataset</span>
                    <span className="text-[10px] text-slate-500">Benchmark Tier 2 (BYOK local)</span>
                  </div>
                </button>
              )}

              {onOpenGuide && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenGuide();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-cyan-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Guia & Ajuda</span>
                    <span className="text-[10px] text-slate-500">Como funciona, glossário e FAQ</span>
                  </div>
                </button>
              )}

              {onOpenWelcome && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenWelcome();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
                >
                  <Compass className="w-4 h-4 text-violet-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Tela Inicial & Tour</span>
                    <span className="text-[10px] text-slate-500">Reiniciar introdução da plataforma</span>
                  </div>
                </button>
              )}

              <div className="my-1 border-t border-slate-800/80" />

              {/* Status do Armazenamento & Gestão de Pasta */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenStorageModal) onOpenStorageModal();
                }}
                className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <HardDrive className={`w-3.5 h-3.5 ${storageUsage.isCritical ? 'text-coral-400' : 'text-slate-400'}`} />
                  Armazenamento Local:
                </span>
                <span className="font-mono text-cyan-400 font-semibold">
                  {Math.round(storageUsage.usagePercent)}%
                </span>
              </button>

              {onFactoryReset && (
                <>
                  <div className="my-1 border-t border-slate-800/80" />
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      const confirmed = window.confirm(
                        'ATENÇÃO: Deseja restaurar a plataforma ao estado de fábrica? Todos os seus documentos pessoais, notas e históricos serão apagados.'
                      );
                      if (confirmed) onFactoryReset();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-rose-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">Resetar Dados Locais</span>
                      <span className="text-[10px] text-rose-500/80">Restaurar estado de fábrica</span>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
