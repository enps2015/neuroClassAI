import React, { useState, useEffect } from 'react';
import {
  Brain,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  X,
  Layers,
  Cpu,
  Info,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  getConsentStatus,
  hasConsent,
  grantConsent,
  revokeConsent,
  E5_MODEL_ID,
  E5_ESTIMATED_SIZE_BYTES,
} from '../../services/retrieval/semanticConsentService';
import { getDenseWorkerClient } from '../../services/retrieval/workers/denseWorkerClient';
import { indexAllUnindexedDocumentsDense } from '../../services/retrieval/semanticIndexingService';
import type { SemanticConsentStatus } from '../../types/rag';

export interface SemanticRetrievalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (isActive: boolean) => void;
}

export const SemanticRetrievalModal: React.FC<SemanticRetrievalModalProps> = ({
  isOpen,
  onClose,
  onStatusChange,
}) => {
  const [consent, setConsent] = useState<SemanticConsentStatus>(getConsentStatus());
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    file: string;
    progress: number;
    loaded: number;
    total: number;
    status: string;
  } | null>(null);
  const [indexingMsg, setIndexingMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConsent(getConsentStatus());
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleActivate = async () => {
    setIsActivating(true);
    setErrorMsg(null);
    setDownloadProgress(null);
    setIndexingMsg('Iniciando Web Worker e download dos artefatos neurais...');

    try {
      // 1. Registra formalmente o consentimento prévio
      grantConsent();
      setConsent(getConsentStatus());

      // 2. Inicializa o Web Worker e reporta progresso de download
      const client = getDenseWorkerClient();
      await client.initialize((p) => {
        setDownloadProgress({
          file: p.file || 'pesos do modelo',
          progress: Math.round((p.progress || 0) * 100),
          loaded: p.loaded || 0,
          total: p.total || E5_ESTIMATED_SIZE_BYTES,
          status: p.status || 'baixando',
        });
      });

      setDownloadProgress(null);
      setIndexingMsg('Vetorizando documentos já existentes no repositório...');

      // 3. Vetoriza os documentos existentes que ainda não possuem embeddings
      await indexAllUnindexedDocumentsDense((title, cur, tot, chunkCur, chunkTot) => {
        setIndexingMsg(`Vetorizando "${title}" (doc ${cur}/${tot}): chunk ${chunkCur}/${chunkTot}...`);
      });

      setIndexingMsg('');
      setIsActivating(false);
      setConsent(getConsentStatus());
      if (onStatusChange) onStatusChange(true);
    } catch (err: any) {
      console.error('[Semantic Modal] Erro ao ativar busca híbrida:', err);
      setErrorMsg(err?.message || 'Falha ao inicializar o motor semântico no navegador.');
      setIsActivating(false);
      setDownloadProgress(null);
      setIndexingMsg('');
    }
  };

  const handleRevoke = async () => {
    const confirmRevoke = window.confirm(
      'Deseja desativar a busca híbrida?\n\n• Os vetores densos salvos no IndexedDB serão apagados imediatamente;\n• Seus documentos originais e índice BM25 permanecerão 100% intactos;\n• Os arquivos do modelo são mantidos no cache do navegador (Cache API) para permitir reativação instantânea sem consumir dados móveis, mas nenhuma inferência ocorrerá sem novo consentimento.'
    );
    if (!confirmRevoke) return;

    setIsRevoking(true);
    setErrorMsg(null);

    try {
      await revokeConsent();
      setConsent(getConsentStatus());
      setIsRevoking(false);
      if (onStatusChange) onStatusChange(false);
    } catch (err: any) {
      console.error('[Semantic Modal] Erro ao revogar consentimento:', err);
      setErrorMsg('Falha ao limpar dados de embeddings locais.');
      setIsRevoking(false);
    }
  };

  const isGranted = consent.granted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Recuperação Híbrida & IA Semântica Local</h2>
              <p className="text-[11px] text-slate-400">BM25 Morfológico + multilingual-e5-small + RRF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Atual */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3.5 ${
              isGranted
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-300'
            }`}
          >
            {isGranted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Layers className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">
                  {isGranted ? 'Busca Híbrida Ativa' : 'Busca Híbrida Desativada'}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                    isGranted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
                  }`}
                >
                  {isGranted ? 'RRF + E5 + BM25' : 'BM25 Puro'}
                </span>
              </div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                {isGranted
                  ? 'A camada semântica neural está operando em conjunto com o BM25 morfológico via Reciprocal Rank Fusion (RRF), aprimorando consultas conceituais e paráfrases.'
                  : 'O sistema está operando exclusivamente pelo motor lexical BM25 com normalização morfológica pt-BR (RSLP). Rápido, leve e com 0 MB de download.'}
              </p>
            </div>
          </div>

          {/* Seção Informativa de Privacidade e Local-First */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Garantia de Privacidade e Execução 100% Local</span>
            </div>
            <ul className="text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed text-[11px]">
              <li>
                <strong className="text-slate-300">Zero Envio de Dados:</strong> Seus documentos, trechos e perguntas nunca saem do seu navegador.
              </li>
              <li>
                <strong className="text-slate-300">Isolamento em Web Worker:</strong> A inferência dos tensores roda fora da interface (sem travamento de tela).
              </li>
              <li>
                <strong className="text-slate-300">Modelo Otimizado:</strong> <span className="font-mono text-slate-300">{E5_MODEL_ID}</span> (INT8 q8, ~135 MB baixados uma única vez e mantidos em cache local).
              </li>
              <li>
                <strong className="text-slate-300">Custo Zero:</strong> R$ 0,00 de consumo de API; funciona totalmente offline após o download inicial.
              </li>
            </ul>
          </div>

          {/* Transparência de Ciclo de Vida e Distinção de Camadas */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Ciclo de Vida e Distinção das Quatro Camadas:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-semibold text-slate-200 block mb-0.5">Vetores no IndexedDB</span>
                <span className="text-slate-400">Derivados dos seus textos; eliminados imediatamente ao desativar.</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-semibold text-slate-200 block mb-0.5">Pesos do Modelo</span>
                <span className="text-slate-400">Mantidos no Cache API do navegador (evita re-download); inativos sem consentimento.</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-semibold text-slate-200 block mb-0.5">Documentos Originais</span>
                <span className="text-slate-400">PDFs, chunks e índice lexical BM25 permanecem 100% preservados.</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="font-semibold text-slate-200 block mb-0.5">Inferência Segura</span>
                <span className="text-slate-400">Executada exclusivamente em Web Worker; recai em BM25 puro em caso de falha.</span>
              </div>
            </div>
          </div>

          {/* Feedback de Progresso / Erro */}
          {downloadProgress && (
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Download className="w-4 h-4 animate-bounce" />
                  Baixando {downloadProgress.file}...
                </span>
                <span className="font-mono font-bold">{downloadProgress.progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-cyan-500 h-2 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(downloadProgress.progress, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-cyan-400/80 font-mono">
                {(downloadProgress.loaded / (1024 * 1024)).toFixed(1)} MB / {(downloadProgress.total / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          )}

          {indexingMsg && (
            <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-500/30 flex items-center gap-2.5 text-xs text-violet-300">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
              <span>{indexingMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Erro ao processar ativação:</p>
                <p className="text-[11px] text-rose-400/90 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Ações */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5" />
            WASM SIMD Single-Thread
          </span>

          <div className="flex items-center gap-2.5">
            {isGranted ? (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isRevoking ? 'Revogando...' : 'Desativar e apagar vetores'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleActivate}
                disabled={isActivating}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-md shadow-violet-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isActivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Inicializando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Ativar Busca Híbrida (~135 MB)</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isActivating || isRevoking}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

