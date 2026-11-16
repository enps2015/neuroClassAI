/**
 * NeuroClass AI — Serviço de Ingestão Documental para o Pipeline RAG
 * @module services/documents/ragIngestionService
 *
 * Responsável por conectar o fluxo de importação e processamento de documentos
 * ao pipeline determinístico de chunking e persistência local no IndexedDB:
 * 1. Recebe o DocumentSource com suas páginas integrais extraídas;
 * 2. Executa a segmentação estruturada determinística (chunking);
 * 3. Persiste os chunks de forma atômica e idempotente no IndexedDB;
 * 4. Executa a verificação rigorosa pós-persistência (contagem, isolamento, ordem e offsets);
 * 5. Registra o estado consolidado de ingestão documental no armazenamento local.
 *
 * GOVERNANÇA:
 * - Operação local-first pura, sem chamadas a Gemini, APIs remotas ou telemetria.
 * - Idempotente: reprocessar um documento substitui chunks antigos sem duplicações.
 * - Coordenação de concorrência com fila/lock em memória para evitar race conditions.
 */

import {
  chunkDocument,
  verifyOffsetIntegrity,
} from './chunkingService';
import {
  saveDocumentChunks,
  getDocumentChunks,
  getDocumentChunksStats,
} from './ragPersistenceService';
import { getDocumentById, saveDocument } from '../persistence/indexedDb';
import { indexDocumentLexical } from '../retrieval/bm25SearchService';
import { indexDocumentDense } from '../retrieval/semanticIndexingService';
import { hasConsent } from '../retrieval/semanticConsentService';
import type { DocumentSource } from '../../types';
import type {
  ChunkingResult,
  DocumentIngestionStatus,
  DocumentIngestionState,
  RagIngestionOptions,
  RagIngestionResult,
  StoredLexicalIndex,
} from '../../types/rag';

// Mutex / trava de processamento em memória por documentId para prevenir
// condições de corrida entre importações simultâneas ou reprocessamento concorrente
const activeIngestionLocks = new Map<string, Promise<RagIngestionResult>>();

/**
 * Conecta o documento importado ao pipeline RAG:
 * Extração de todas as páginas -> Chunking -> Persistência -> Validação Pós-Gravação -> Status Coerente.
 */
export async function ingestDocumentRAG(
  document: DocumentSource,
  options?: RagIngestionOptions
): Promise<RagIngestionResult> {
  if (!document || !document.id) {
    return {
      success: false,
      documentId: document?.id || '',
      status: 'failed',
      chunksCount: 0,
      error: '[RAG Ingestion] Documento inválido: objeto e document.id são obrigatórios.',
      state: {
        documentId: document?.id || '',
        status: 'failed',
        indexedChunksCount: 0,
        totalPages: 0,
        extractedPagesCount: 0,
        emptyPagesCount: 0,
        requiresOcrPagesCount: 0,
        updatedAt: Date.now(),
        errorMessage: 'Documento inválido: objeto e document.id são obrigatórios.',
      },
    };
  }

  // Prevenção de concorrência: se já houver ingestão em curso para este documento, aguarda a promessa ativa
  if (activeIngestionLocks.has(document.id)) {
    return await activeIngestionLocks.get(document.id)!;
  }

  const ingestionPromise = (async (): Promise<RagIngestionResult> => {
    try {
      // 1. Verificação defensiva de conteúdo extraído
      const hasPages = Boolean(document.pages && document.pages.length > 0);
      const hasNoteSections = Boolean(document.noteSections && document.noteSections.length > 0);

      if (!hasPages && !hasNoteSections) {
        return await recordFailure(
          document,
          'Extração falhou ou não forneceu páginas/seções para o documento.'
        );
      }

      // Normaliza documento se for de notas manuais sem objeto de páginas
      const docToProcess: DocumentSource = {
        ...document,
        pages: hasPages
          ? document.pages
          : document.noteSections?.map((s, idx) => ({
              pageNumber: idx + 1,
              textContent: `${s.title}\n\n${s.content}`,
              hasVisualElements: false,
              isScanned: false,
              legibility: 'clean' as const,
            })) || [],
      };

      // 2. Fatiamento estruturado determinístico de 100% das páginas
      let chunkResult: ChunkingResult;
      try {
        chunkResult = chunkDocument(docToProcess, options?.chunkingOptions);
      } catch (chunkErr: any) {
        return await recordFailure(
          document,
          `Falha durante a segmentação estruturada (chunking): ${chunkErr?.message || String(chunkErr)}`
        );
      }

      // 3. Persistência atômica no IndexedDB (store document_chunks)
      try {
        await saveDocumentChunks(document.id, chunkResult.chunks, {
          pipelineVersion: options?.chunkingOptions?.pipelineVersion,
        });
      } catch (persistErr: any) {
        return await recordFailure(
          document,
          `Falha durante persistência no IndexedDB: ${persistErr?.message || String(persistErr)}`
        );
      }

      // 4. Verificação rigorosa pós-persistência (Fase 4 da Missão A3)
      const storedChunks = await getDocumentChunks(document.id);

      // 4.1. Quantidade exata: conferir contagem produzida vs contagem gravada
      if (storedChunks.length !== chunkResult.chunks.length) {
        return await recordFailure(
          document,
          `Divergência na contagem de chunks: gerados=${chunkResult.chunks.length}, gravados=${storedChunks.length}`
        );
      }

      // 4.2. Isolamento de identidade: todos os chunks gravados devem pertencer estritamente ao documentId
      const foreignChunk = storedChunks.find(
        (c) => c.documentId !== document.id || c.docId !== document.id
      );
      if (foreignChunk) {
        return await recordFailure(
          document,
          `Inconsistência de isolamento: chunk ${foreignChunk.chunkId} pertence a outro documento.`
        );
      }

      // 4.3. Ordenação física: verificar ordenação estrita por página e índice sequencial
      for (let i = 0; i < storedChunks.length - 1; i++) {
        const cur = storedChunks[i];
        const next = storedChunks[i + 1];
        if (
          cur.pageNumber > next.pageNumber ||
          (cur.pageNumber === next.pageNumber && cur.chunkIndexInPage >= next.chunkIndexInPage)
        ) {
          return await recordFailure(
            document,
            `Violação de ordenação sequencial detectada entre chunks ${cur.chunkId} e ${next.chunkId}.`
          );
        }
      }

      // 4.4. Integridade de offsets: validar fidelidade exata do texto recuperado
      if (!options?.skipOffsetVerification) {
        const offsetCheck = verifyOffsetIntegrity(storedChunks, docToProcess.pages || []);
        if (!offsetCheck.isValid) {
          const firstViolation = offsetCheck.violations[0];
          return await recordFailure(
            document,
            `Falha na validação de offsets pós-gravação: ${firstViolation?.differenceReason || 'Offsets divergentes'}`
          );
        }
      }

      // 4.5. Construção e persistência atômica do índice lexical BM25 (Missão B1)
      try {
        await indexDocumentLexical(document.id, storedChunks, {
          pipelineVersion: options?.chunkingOptions?.pipelineVersion,
        });
      } catch (bm25Err: any) {
        return await recordFailure(
          document,
          `Falha durante indexação lexical BM25: ${bm25Err?.message || String(bm25Err)}`
        );
      }

      // 4.6. Construção e persistência do índice denso se consentimento ativo (Missão F1.2)
      if (hasConsent()) {
        try {
          await indexDocumentDense(document.id, storedChunks);
        } catch (denseErr) {
          console.warn('[RAG Ingestion] Indexação densa falhou; fallback mantido em BM25:', denseErr);
        }
      }

      // 5. Determinação coerente do status final (Fase 3 da Missão A3)
      // Se houver páginas que requerem OCR, o documento não pode ser apresentado como cobertura integral
      const hasPendingOcr =
        chunkResult.coverage.ocr.requiresOcrCount > 0 ||
        chunkResult.chunks.some(
          (c) => c.contentKind === 'scanned_fallback' || c.ocrStatus === 'requires_ocr'
        ) ||
        Boolean(
          docToProcess.pages?.some(
            (p) => p.isScanned && (!p.textContent || p.textContent.trim().length === 0)
          )
        );

      const finalStatus: DocumentIngestionStatus = hasPendingOcr
        ? 'completed_partial_ocr_pending'
        : 'indexed';

      // Atualiza relatório de cobertura com estado de indexação confirmado
      chunkResult.coverage.indexing = {
        indexedChunksCount: storedChunks.length,
        isFullyIndexed: finalStatus === 'indexed',
      };

      const finalState: DocumentIngestionState = {
        documentId: document.id,
        status: finalStatus,
        indexedChunksCount: storedChunks.length,
        totalPages: docToProcess.pages?.length || 0,
        extractedPagesCount: chunkResult.coverage.extraction.extractedPagesCount,
        emptyPagesCount: chunkResult.coverage.extraction.emptyPageNumbers.length,
        requiresOcrPagesCount: chunkResult.coverage.ocr.requiresOcrCount,
        updatedAt: Date.now(),
        coverage: chunkResult.coverage,
      };

      // 6. Atualizar e persistir metadados no DocumentSource
      document.ragStatus = finalStatus;
      document.ragIndexingState = finalState;
      document.ragIndexedChunksCount = storedChunks.length;
      document.ragIndexedAt = Date.now();

      try {
        await saveDocument(document);
      } catch (updateErr) {
        console.warn('[RAG Ingestion] Aviso ao atualizar DocumentSource no IndexedDB:', updateErr);
      }

      return {
        success: true,
        documentId: document.id,
        status: finalStatus,
        chunksCount: storedChunks.length,
        coverage: chunkResult.coverage,
        state: finalState,
      };
    } finally {
      activeIngestionLocks.delete(document.id);
    }
  })();

  activeIngestionLocks.set(document.id, ingestionPromise);
  return await ingestionPromise;
}

/**
 * Registra formalmente falha de ingestão documental, garantindo que o documento
 * NUNCA seja apresentado ou marcado como indexado/completo.
 */
async function recordFailure(
  document: DocumentSource,
  errorMessage: string
): Promise<RagIngestionResult> {
  const failureState: DocumentIngestionState = {
    documentId: document.id,
    status: 'failed',
    indexedChunksCount: 0,
    totalPages: document.pages?.length || 0,
    extractedPagesCount: 0,
    emptyPagesCount: 0,
    requiresOcrPagesCount: 0,
    updatedAt: Date.now(),
    errorMessage,
  };

  document.ragStatus = 'failed';
  document.ragIndexingState = failureState;
  document.ragIndexedChunksCount = 0;

  try {
    await saveDocument(document);
  } catch (err) {
    console.error('[RAG Ingestion] Falha ao registrar estado de erro no IndexedDB:', err);
  }

  return {
    success: false,
    documentId: document.id,
    status: 'failed',
    chunksCount: 0,
    error: errorMessage,
    state: failureState,
  };
}

/**
 * Consulta o status e as métricas de ingestão documental de forma consolidada.
 * Documentos antigos sem chunks registrados retornam status 'pending' e nunca 'indexed'.
 */
export async function getDocumentIngestionStatus(
  documentId: string
): Promise<DocumentIngestionState | null> {
  if (!documentId) return null;

  const doc = await getDocumentById(documentId);
  if (!doc) return null;

  if (doc.ragIndexingState) {
    return doc.ragIndexingState as DocumentIngestionState;
  }

  if (doc.ragStatus) {
    const stats = await getDocumentChunksStats(documentId);
    return {
      documentId,
      status: doc.ragStatus,
      indexedChunksCount: stats.totalChunks,
      totalPages: doc.pages?.length || doc.pageCount || 0,
      extractedPagesCount: doc.pages?.length || 0,
      emptyPagesCount: 0,
      requiresOcrPagesCount: 0,
      updatedAt: doc.ragIndexedAt || doc.uploadedAt || Date.now(),
    };
  }

  // Documento antigo/legado sem processamento RAG
  return {
    documentId,
    status: 'pending',
    indexedChunksCount: 0,
    totalPages: doc.pages?.length || doc.pageCount || 0,
    extractedPagesCount: doc.pages?.length || 0,
    emptyPagesCount: 0,
    requiresOcrPagesCount: 0,
    updatedAt: doc.uploadedAt || Date.now(),
  };
}

/**
 * Reprocessa um documento existente no IndexedDB de forma atômica e idempotente.
 * Substitui os chunks anteriores sem duplicar dados e sem misturar versões.
 */
export async function reprocessDocumentRAG(
  documentId: string,
  options?: RagIngestionOptions
): Promise<RagIngestionResult> {
  if (!documentId) {
    throw new Error('[RAG Ingestion] documentId obrigatório para reprocessamento.');
  }

  const doc = await getDocumentById(documentId);
  if (!doc) {
    throw new Error(`[RAG Ingestion] Documento não encontrado no armazenamento: ${documentId}`);
  }

  return await ingestDocumentRAG(doc, options);
}

/**
 * Reconstrói exclusivamente o índice lexical BM25 para um documento já persistido,
 * permitindo reindexação rápida sem necessidade de reimportar ou reler o PDF original.
 */
export async function rebuildLexicalIndex(documentId: string): Promise<StoredLexicalIndex> {
  if (!documentId) {
    throw new Error('[BM25 Ingestion] documentId obrigatório para reconstrução de índice.');
  }
  const chunks = await getDocumentChunks(documentId);
  if (!chunks || chunks.length === 0) {
    throw new Error(`[BM25 Ingestion] Nenhum chunk persistido encontrado para o documento ${documentId}.`);
  }
  return await indexDocumentLexical(documentId, chunks);
}


