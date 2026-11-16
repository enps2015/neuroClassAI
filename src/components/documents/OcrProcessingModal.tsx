import React, { useState, useEffect, useRef } from 'react';
import {
  ScanText,
  ShieldCheck,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  StopCircle,
  RefreshCw,
  X,
  FileText,
  Layers,
} from 'lucide-react';
import type { DocumentSource } from '../../types';
import {
  OcrConsentManager,
  OCR_MODEL_DISPLAY_SIZE,
  OCR_DEFAULT_LANGUAGE,
} from '../../services/documents/ocrEngine';
import {
  processDocumentOcr,
  detectOcrRequirements,
  calculateOcrCoverageMetrics,
} from '../../services/documents/ocrCoordinatorService';
import type { OcrProgressReport, OcrBatchResult, OcrCoverageMetrics } from '../../types/rag';

interface OcrProcessingModalProps {
  isOpen: boolean;
  document: DocumentSource | null;
  onClose: () => void;
  onOcrCompleted?: (result: OcrBatchResult) => void;
}

export const OcrProcessingModal: React.FC<OcrProcessingModalProps> = ({
  isOpen,
  document,
  onClose,
  onOcrCompleted,
}) => {
  const [coverageMetrics, setCoverageMetrics] = useState<OcrCoverageMetrics | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressReport, setProgressReport] = useState<OcrProgressReport | null>(null);
  const [batchResult, setBatchResult] = useState<OcrBatchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancellationTokenRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });

  useEffect(() => {
    if (isOpen && document) {
      cancellationTokenRef.current = { isCancelled: false };
      setHasConsent(OcrConsentManager.hasConsent(document.id));
      setIsProcessing(false);
      setBatchResult(null);
      setErrorMessage(null);

      calculateOcrCoverageMetrics(document).then((metrics) => {
        setCoverageMetrics(metrics);
        setProgressReport({
          documentId: document.id,
          totalPages: metrics.totalPages,
          requiresOcrCount: metrics.requiresOcrCount,
          completedPagesCount: metrics.completedOcrCount,
          failedPagesCount: metrics.failedOcrCount,
          pendingPagesCount: metrics.pendingOcrCount,
          status: 'idle',
          percent: metrics.coveragePercent,
        });
      });
    }
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const handleGrantConsentAndStart = async () => {
    OcrConsentManager.grantConsent(document.id);
    setHasConsent(true);
    setIsProcessing(true);
    setErrorMessage(null);
    setBatchResult(null);
    cancellationTokenRef.current = { isCancelled: false };

    try {
      const result = await processDocumentOcr(document.id, {
        language: OCR_DEFAULT_LANGUAGE,
        documentPages: document.pages,
        cancellationToken: cancellationTokenRef.current,
        onProgress: (report) => {
          setProgressReport(report);
        },
      });

      setBatchResult(result);
      if (onOcrCompleted) {
        onOcrCompleted(result);
      }

      // Recalcula métricas de cobertura atualizadas
      const updatedMetrics = await calculateOcrCoverageMetrics(document);
      setCoverageMetrics(updatedMetrics);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha inesperada durante a execução do OCR local.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelOcr = () => {
    cancellationTokenRef.current.isCancelled = true;
    if (progressReport) {
      setProgressReport({
        ...progressReport,
        status: 'cancelled',
        currentOperation: 'Cancelamento solicitado. Interrompendo após checkpoint...',
      });
    }
  };

  const handleDeclineConsent = () => {
    OcrConsentManager.revokeConsent(document.id);
    setHasConsent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <ScanText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">OCR Local — Páginas Digitalizadas</h3>
              <p className="text-xs text-slate-400 truncate max-w-[340px]">{document.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Card de Métricas de Cobertura */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="block text-lg font-bold font-mono text-white">{coverageMetrics?.totalPages ?? 0}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Páginas</span>
            </div>
            <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/40">
              <span className="block text-lg font-bold font-mono text-emerald-400">
                {coverageMetrics?.nativeTextPagesCount ?? 0}
              </span>
              <span className="text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">Texto Nativo</span>
            </div>
            <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
              <span className="block text-lg font-bold font-mono text-amber-400">
                {coverageMetrics?.requiresOcrCount ?? 0}
              </span>
              <span className="text-[10px] text-amber-300 uppercase tracking-wider font-semibold">Exigem OCR</span>
            </div>
            <div className="bg-cyan-950/30 p-2.5 rounded-xl border border-cyan-900/40">
              <span className="block text-lg font-bold font-mono text-cyan-400">
                {coverageMetrics?.completedOcrCount ?? 0}
              </span>
              <span className="text-[10px] text-cyan-300 uppercase tracking-wider font-semibold">OCR Concluído</span>
            </div>
          </div>

          {/* Informações de Privacidade e Consentimento Explícito */}
          {!hasConsent && !isProcessing && (
            <div className="bg-slate-950/90 border border-cyan-800/40 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-cyan-200">Reconhecimento 100% On-Device e Privado</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O OCR é processado localmente no seu navegador através de WebAssembly (WASM).
                    Nenhuma página, imagem ou texto extraído é enviado para a nuvem ou servidores externos.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center gap-2 text-cyan-300 font-medium">
                  <Download className="w-4 h-4" />
                  <span>Modelo de Idioma: Português (pt-BR)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Para processar as páginas digitalizadas, o navegador fará o download local do modelo de Português
                  (tamanho verificado: <strong>{OCR_MODEL_DISPLAY_SIZE}</strong>). O arquivo é armazenado no cache local
                  para execuções offline subsequentes.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDeclineConsent}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
                >
                  Manter Apenas Texto Nativo
                </button>
                <button
                  type="button"
                  onClick={handleGrantConsentAndStart}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-semibold text-xs text-white shadow-md shadow-cyan-900/30 transition-all flex items-center gap-1.5"
                >
                  <ScanText className="w-4 h-4" />
                  <span>Concordar e Iniciar OCR</span>
                </button>
              </div>
            </div>
          )}

          {/* Barra de Progresso durante processamento ativo */}
          {isProcessing && progressReport && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="font-semibold">{progressReport.currentOperation || 'Processando OCR local...'}</span>
                </div>
                <span className="font-mono text-slate-400">{progressReport.percent}%</span>
              </div>

              {/* Trilho de Progresso */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, progressReport.percent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>
                  Concluídas: {progressReport.completedPagesCount} / {coverageMetrics?.scannedPagesCount ?? progressReport.requiresOcrCount}
                </span>
                {progressReport.failedPagesCount > 0 && (
                  <span className="text-rose-400">Falhas: {progressReport.failedPagesCount}</span>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancelOcr}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Cancelar OCR</span>
                </button>
              </div>
            </div>
          )}

          {/* Resultado Consolidado */}
          {batchResult && !isProcessing && (
            <div
              className={`rounded-xl p-4 border space-y-2 text-xs ${
                batchResult.status === 'completed'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                  : batchResult.status === 'cancelled'
                  ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                  : 'bg-slate-950/80 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {batchResult.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {batchResult.status === 'cancelled' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                {batchResult.status === 'partial' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                <span>
                  {batchResult.status === 'completed' && 'OCR Local Concluído com Sucesso!'}
                  {batchResult.status === 'cancelled' && 'OCR Interrompido pelo Usuário.'}
                  {batchResult.status === 'partial' && 'Processamento Parcial Concluído.'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Páginas reconhecidas: {batchResult.completedPages.length}. Os novos trechos foram fatiados em{' '}
                <strong>{batchResult.totalChunksAfterReingestion} chunks</strong> e o índice BM25 foi reconstruído.
              </p>
              {batchResult.failedPages.length > 0 && (
                <div className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded border border-rose-900/50">
                  Páginas que falharam: {batchResult.failedPages.map((f) => `Pág. ${f.pageNumber}`).join(', ')}.
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            {coverageMetrics?.coveragePercent ?? 0}% do documento pesquisável
          </span>
          <div className="flex items-center gap-2">
            {batchResult && (batchResult.status === 'partial' || batchResult.failedPages.length > 0) && (
              <button
                type="button"
                onClick={handleGrantConsentAndStart}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 border border-amber-800/60 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors disabled:opacity-50"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

