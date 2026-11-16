/**
 * NeuroClass AI — Coordenador de Pipeline OCR Local em Lotes
 * @module services/documents/ocrCoordinatorService
 *
 * Responsável por orquestrar o ciclo completo de OCR local com:
 * 1. Detecção precisa de páginas que necessitam de OCR vs páginas com texto nativo;
 * 2. Verificação estrita de consentimento explícito prévio do usuário;
 * 3. Carregamento do modelo sob demanda com progresso informado;
 * 4. Processamento em lotes pequenos com checkpoint por página no IndexedDB;
 * 5. Retry controlado com tratamento de falhas sem abortar o documento;
 * 6. Cancelamento seguro com preservação integral das páginas já concluídas;
 * 7. Reingestão automática e idempotente no chunker e reconstrução do índice BM25;
 * 8. Atualização transparente dos estados de cobertura e observabilidade RAG.
 *
 * REGRAS DE SEGURANÇA E PRIVACIDADE:
 * - 100% executado localmente; zero envio de páginas/imagens para servidores remotos;
 * - NUNCA sobrescrever texto nativo válido com OCR;
 * - Não chamar Gemini ou provedores de IA durante OCR ou indexação.
 */

import { getDocumentById, saveDocument } from '../persistence/indexedDb';
import {
  saveOcrPage,
  getOcrPage,
  getDocumentOcrPages,
} from './ragOcrPersistenceService';
import {
  getOcrEngine,
  OcrConsentManager,
  OCR_DEFAULT_LANGUAGE,
  OCR_ENGINE_VERSION,
  type OcrEngineAdapter,
} from './ocrEngine';
import { ingestDocumentRAG } from './ragIngestionService';
import { rebuildLexicalIndex } from './ragIngestionService';
import type { DocumentSource, DocumentPage } from '../../types';
import type {
  StoredOcrPage,
  OcrProgressReport,
  OcrBatchResult,
  OcrCoverageMetrics,
  DocumentIngestionStatus,
} from '../../types/rag';

export interface OcrProcessOptions {
  language?: string;
  maxRetriesPerPage?: number;
  batchSize?: number;
  onProgress?: (report: OcrProgressReport) => void;
  cancellationToken?: { isCancelled: boolean };
  engine?: OcrEngineAdapter;
  forceReprocessAll?: boolean;
  /** Páginas com buffers de imagem em memória volátil (evita re-renderizar do PDF) */
  documentPages?: DocumentPage[];
}

/**
 * Inspeciona o documento e detecta quais páginas necessitam de OCR,
 * quais possuem texto nativo e quais já foram processadas anteriormente.
 */
export async function detectOcrRequirements(document: DocumentSource): Promise<{
  totalPages: number;
  nativePages: number[];
  scannedPages: number[];
  requiresOcrPages: number[];
  completedOcrPages: number[];
  failedOcrPages: number[];
  isFullySearchable: boolean;
}> {
  if (!document || !document.pages) {
    return {
      totalPages: 0,
      nativePages: [],
      scannedPages: [],
      requiresOcrPages: [],
      completedOcrPages: [],
      failedOcrPages: [],
      isFullySearchable: false,
    };
  }

  const nativePages: number[] = [];
  const scannedPages: number[] = [];
  const requiresOcrPages: number[] = [];
  const completedOcrPages: number[] = [];
  const failedOcrPages: number[] = [];

  const existingOcrPages = await getDocumentOcrPages(document.id);
  const ocrMap = new Map<number, StoredOcrPage>();
  for (const ocr of existingOcrPages) {
    ocrMap.set(ocr.pageNumber, ocr);
  }

  for (const page of document.pages) {
    const pageNum = page.pageNumber;
    const pageText = page.textContent || '';
    const hasExistingOcr = ocrMap.has(pageNum);
    const existingOcr = ocrMap.get(pageNum);

    const isExplicitlyScanned =
      page.isScanned === true ||
      page.legibility === 'scanned_image' ||
      pageText.trim().length === 0;

    if (!isExplicitlyScanned && pageText.trim().length >= 50) {
      // Página com texto nativo suficiente
      nativePages.push(pageNum);
    } else {
      // Página digitalizada ou sem texto
      scannedPages.push(pageNum);

      if (hasExistingOcr && existingOcr?.status === 'completed' && existingOcr.text.trim().length > 0) {
        completedOcrPages.push(pageNum);
      } else if (hasExistingOcr && existingOcr?.status === 'failed') {
        failedOcrPages.push(pageNum);
        requiresOcrPages.push(pageNum);
      } else {
        requiresOcrPages.push(pageNum);
      }
    }
  }

  const isFullySearchable = requiresOcrPages.length === 0 && failedOcrPages.length === 0;

  return {
    totalPages: document.pages.length,
    nativePages,
    scannedPages,
    requiresOcrPages,
    completedOcrPages,
    failedOcrPages,
    isFullySearchable,
  };
}

/**
 * Processa o OCR localmente para as páginas digitalizadas de um documento em lotes controlados.
 */
export async function processDocumentOcr(
  documentId: string,
  options?: OcrProcessOptions
): Promise<OcrBatchResult> {
  const startTime = Date.now();
  const lang = options?.language || OCR_DEFAULT_LANGUAGE;
  const maxRetries = options?.maxRetriesPerPage ?? 2;
  const engine = options?.engine || getOcrEngine();

  // 1. Verificação obrigatória de Consentimento Explícito
  if (!OcrConsentManager.hasConsent(documentId)) {
    throw new Error(
      `[OCR Coordinator] Consentimento explícito do usuário é obrigatório antes de iniciar o OCR no documento ${documentId}. O download ou execução de modelos sem autorização prévia é terminantemente proibido.`
    );
  }

  // 2. Recuperação do Documento no IndexedDB
  const document = await getDocumentById(documentId);
  if (!document || !document.pages || document.pages.length === 0) {
    return {
      documentId,
      success: false,
      status: 'failed',
      totalPages: 0,
      scannedPagesCount: 0,
      completedPages: [],
      failedPages: [],
      pendingPages: [],
      totalChunksAfterReingestion: 0,
      ragStatus: 'failed',
      durationMs: Date.now() - startTime,
      errorMessage: `Documento ${documentId} não localizado ou não contém páginas físicas extraídas.`,
    };
  }

  // Mescla buffers de imagem voláteis fornecidos via options.documentPages
  if (options?.documentPages && options.documentPages.length > 0) {
    const memMap = new Map<number, DocumentPage>();
    for (const mp of options.documentPages) {
      memMap.set(mp.pageNumber, mp);
    }
    for (const p of document.pages) {
      const mem = memMap.get(p.pageNumber);
      if (mem && mem.pageImageBase64 && !p.pageImageBase64) {
        p.pageImageBase64 = mem.pageImageBase64;
      }
    }
  }

  // 3. Detecção e mapeamento das páginas a processar
  const requirements = await detectOcrRequirements(document);
  let pagesToProcess: DocumentPage[] = [];

  if (options?.forceReprocessAll) {
    pagesToProcess = document.pages.filter((p) => requirements.scannedPages.includes(p.pageNumber));
  } else {
    pagesToProcess = document.pages.filter((p) => requirements.requiresOcrPages.includes(p.pageNumber));
  }

  const totalScanned = requirements.scannedPages.length;
  const completedList: number[] = [...requirements.completedOcrPages];
  const failedList: Array<{ pageNumber: number; error: string; retries: number }> = [];
  const pendingList: number[] = pagesToProcess.map((p) => p.pageNumber);

  const reportProgress = (
    status: OcrProgressReport['status'],
    currentOp?: string,
    currentPg?: number
  ) => {
    if (options?.onProgress) {
      const doneCount = completedList.length;
      const pct = totalScanned > 0 ? Math.round((doneCount / totalScanned) * 100) : 100;
      options.onProgress({
        documentId,
        totalPages: document.pages!.length,
        requiresOcrCount: totalScanned,
        currentPageNumber: currentPg,
        completedPagesCount: completedList.length,
        failedPagesCount: failedList.length,
        pendingPagesCount: pendingList.length,
        status,
        currentOperation: currentOp,
        percent: pct,
      });
    }
  };

  // Se não houver páginas para processar
  if (pagesToProcess.length === 0) {
    reportProgress('completed', 'Todas as páginas digitalizadas já possuem OCR concluído.');
    return {
      documentId,
      success: true,
      status: 'completed',
      totalPages: document.pages.length,
      scannedPagesCount: totalScanned,
      completedPages: completedList,
      failedPages: [],
      pendingPages: [],
      totalChunksAfterReingestion: document.ragIndexedChunksCount || 0,
      ragStatus: (document.ragStatus as DocumentIngestionStatus) || 'indexed',
      durationMs: Date.now() - startTime,
    };
  }

  // 4. Carregamento do modelo sob demanda se ainda não estiver carregado
  reportProgress('downloading_model', 'Carregando binários do modelo OCR em Português local...');
  try {
    const isLoaded = await engine.isModelLoaded(lang);
    if (!isLoaded) {
      await engine.loadModel(lang, (downloadPct) => {
        reportProgress('downloading_model', `Baixando modelo OCR pt-BR (${downloadPct}%)...`);
      });
    }
  } catch (err: any) {
    const errorMsg = `Falha ao carregar modelo de OCR local: ${err?.message || 'Erro de rede ou inicialização'}.`;
    reportProgress('failed', errorMsg);
    return {
      documentId,
      success: false,
      status: 'failed',
      totalPages: document.pages.length,
      scannedPagesCount: totalScanned,
      completedPages: completedList,
      failedPages: [{ pageNumber: pagesToProcess[0]?.pageNumber || 1, error: errorMsg, retries: 0 }],
      pendingPages: pendingList,
      totalChunksAfterReingestion: 0,
      ragStatus: 'completed_partial_ocr_pending',
      durationMs: Date.now() - startTime,
      errorMessage: errorMsg,
    };
  }

  // 5. Execução em lotes com checkpoint por página e tratamento de cancelamento
  let wasCancelled = false;

  for (const page of pagesToProcess) {
    // Verificação de cancelamento pelo usuário
    if (options?.cancellationToken?.isCancelled) {
      wasCancelled = true;
      reportProgress('cancelled', 'Processamento de OCR cancelado pelo usuário. Páginas concluídas foram salvas.');
      break;
    }

    const pageNum = page.pageNumber;
    reportProgress('processing', `Reconhecendo página ${pageNum} de ${document.pages.length}...`, pageNum);

    let attempts = 0;
    let pageSuccess = false;
    let lastError: Error | null = null;
    let ocrResult: { text: string; confidence: number; durationMs: number; contentHash: string } | null = null;

    // Loop de retry com limite
    while (attempts <= maxRetries && !pageSuccess) {
      try {
        attempts++;
        const pageSource = page.pageImageBase64 || page.textContent || `[Page ${pageNum}]`;
        ocrResult = await engine.recognizePage(pageSource, { pageNumber: pageNum, language: lang });

        if (ocrResult && ocrResult.text && ocrResult.text.trim().length > 0) {
          pageSuccess = true;
        } else {
          throw new Error('Texto extraído pelo OCR resultou vazio ou ilegível.');
        }
      } catch (err: any) {
        lastError = err;
        console.error(`[OCR Coordinator] Erro na tentativa ${attempts} para pág ${pageNum}:`, err);
        if (attempts <= maxRetries) {
          // Espera breve antes do retry
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }

    if (pageSuccess && ocrResult) {
      // Salva checkpoint da página concluída no IndexedDB
      const storedPage: StoredOcrPage = {
        id: `${documentId}_p${pageNum}`,
        documentId,
        pageNumber: pageNum,
        status: 'completed',
        text: ocrResult.text,
        language: lang,
        engineVersion: engine.version || OCR_ENGINE_VERSION,
        confidenceScore: ocrResult.confidence,
        processedAt: Date.now(),
        durationMs: ocrResult.durationMs,
        retryCount: attempts - 1,
        contentHash: ocrResult.contentHash,
        textSource: 'ocr',
      };

      await saveOcrPage(storedPage);

      // Atualiza o objeto da página em memória
      page.textContent = ocrResult.text;
      page.isScanned = true;
      (page as any).textSource = 'ocr';
      page.legibility = 'hybrid';
      page.hasVisualElements = true;

      completedList.push(pageNum);
      const pendingIdx = pendingList.indexOf(pageNum);
      if (pendingIdx >= 0) pendingList.splice(pendingIdx, 1);
    } else {
      // Página falhou após retries: salva checkpoint de falha para rastreabilidade
      const failureReason = lastError?.message || 'Falha de reconhecimento após tentativas esgotadas.';
      const storedPage: StoredOcrPage = {
        id: `${documentId}_p${pageNum}`,
        documentId,
        pageNumber: pageNum,
        status: 'failed',
        text: '',
        language: lang,
        engineVersion: engine.version || OCR_ENGINE_VERSION,
        processedAt: Date.now(),
        errorMessage: failureReason,
        retryCount: attempts,
        contentHash: '',
        textSource: 'ocr',
      };

      await saveOcrPage(storedPage);

      failedList.push({
        pageNumber: pageNum,
        error: failureReason,
        retries: attempts,
      });

      const pendingIdx = pendingList.indexOf(pageNum);
      if (pendingIdx >= 0) pendingList.splice(pendingIdx, 1);
    }

    reportProgress('processing', `Página ${pageNum} finalizada.`, pageNum);

    // Checagem imediata de cancelamento pós-checkpoint
    if (options?.cancellationToken?.isCancelled) {
      wasCancelled = true;
      reportProgress('cancelled', 'Processamento de OCR cancelado pelo usuário. Páginas concluídas foram salvas.', pageNum);
      break;
    }
  }

  // 6. Atualização do documento no armazenamento
  await saveDocument(document);

  // 7. Reingestão idempotente no chunker determinístico
  reportProgress('processing', 'Reingestão estruturada dos novos trechos no RAG...');
  const ingestionResult = await ingestDocumentRAG(document);

  // 8. Reconstrução do índice lexical invertido BM25
  reportProgress('processing', 'Atualizando índice BM25 para as páginas reconhecidas...');
  await rebuildLexicalIndex(documentId);

  // 9. Cálculo do estado RAG final
  const allCompleted = failedList.length === 0 && pendingList.length === 0 && !wasCancelled;
  const finalRagStatus: DocumentIngestionStatus = allCompleted
    ? 'indexed'
    : 'completed_partial_ocr_pending';

  document.ragStatus = finalRagStatus;
  await saveDocument(document);

  const finalStatus = wasCancelled ? 'cancelled' : allCompleted ? 'completed' : 'partial';

  reportProgress(
    finalStatus,
    allCompleted
      ? `OCR concluído com sucesso em todas as ${completedList.length} páginas digitalizadas.`
      : `OCR parcial: ${completedList.length} páginas concluídas, ${failedList.length} com falha, ${pendingList.length} pendentes.`
  );

  return {
    documentId,
    success: completedList.length > 0,
    status: finalStatus,
    totalPages: document.pages.length,
    scannedPagesCount: totalScanned,
    completedPages: completedList,
    failedPages: failedList,
    pendingPages: pendingList,
    totalChunksAfterReingestion: ingestionResult.chunksCount,
    ragStatus: finalRagStatus,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Calcula as métricas consolidadas de cobertura de OCR e busca de um documento.
 */
export async function calculateOcrCoverageMetrics(
  document: DocumentSource
): Promise<OcrCoverageMetrics> {
  if (!document || !document.pages) {
    return {
      documentId: document?.id || '',
      totalPages: 0,
      nativeTextPagesCount: 0,
      scannedPagesCount: 0,
      requiresOcrCount: 0,
      completedOcrCount: 0,
      failedOcrCount: 0,
      pendingOcrCount: 0,
      totalIndexedChunks: 0,
      unsearchablePagesCount: 0,
      coveragePercent: 0,
    };
  }

  const req = await detectOcrRequirements(document);
  const total = document.pages.length;
  const native = req.nativePages.length;
  const completed = req.completedOcrPages.length;
  const requires = req.requiresOcrPages.length;
  const failed = req.failedOcrPages.length;

  const searchablePagesCount = native + completed;
  const unsearchablePagesCount = Math.max(0, total - searchablePagesCount);
  const coveragePercent = total > 0 ? Math.round((searchablePagesCount / total) * 100) : 0;

  return {
    documentId: document.id,
    totalPages: total,
    nativeTextPagesCount: native,
    scannedPagesCount: req.scannedPages.length,
    requiresOcrCount: requires,
    completedOcrCount: completed,
    failedOcrCount: failed,
    pendingOcrCount: requires,
    totalIndexedChunks: document.ragIndexedChunksCount || 0,
    unsearchablePagesCount,
    coveragePercent,
  };
}
