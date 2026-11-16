/**
 * NeuroClass AI — Serviço de Indexação Semântica Densa (Pipeline Híbrido)
 * @module services/retrieval/semanticIndexingService
 *
 * Coordena a geração e persistência de embeddings densos:
 * 1. Executa a inferência delegada ao Web Worker dedicado;
 * 2. Verifica estritamente o consentimento do estudante antes de qualquer operação;
 * 3. Persiste vetores 384-d e metadados de forma transacional no IndexedDB;
 * 4. Garante idempotência: se o documento já possui vetores compatíveis, evita recomputação desnecessária.
 */

import { hasConsent } from './semanticConsentService';
import { getDenseWorkerClient } from './workers/denseWorkerClient';
import {
  saveDenseEmbeddings,
  saveDenseIndexMetadata,
  getDenseEmbeddings,
  CURRENT_DENSE_MODEL_VERSION,
  DENSE_VECTOR_DIMENSION,
} from '../documents/ragDensePersistenceService';
import { getDocumentChunks } from '../documents/ragPersistenceService';
import { getAllUserDocuments } from '../persistence/indexedDb';
import type { StoredDocumentChunk } from '../../types/rag';

export interface DenseIndexingResult {
  status: 'indexed' | 'skipped_no_consent' | 'failed' | 'already_indexed';
  chunksCount: number;
  error?: string;
}

/**
 * Vetoriza e persiste os embeddings densos de um documento se o consentimento estiver ativo.
 */
export async function indexDocumentDense(
  documentId: string,
  chunks?: StoredDocumentChunk[],
  options?: {
    force?: boolean;
    onBatchProgress?: (completed: number, total: number) => void;
  }
): Promise<DenseIndexingResult> {
  if (!hasConsent()) {
    return { status: 'skipped_no_consent', chunksCount: 0 };
  }

  if (!documentId) {
    return { status: 'failed', chunksCount: 0, error: 'documentId é obrigatório' };
  }

  const chunksToProcess = chunks || (await getDocumentChunks(documentId));
  if (!chunksToProcess || chunksToProcess.length === 0) {
    return { status: 'indexed', chunksCount: 0 };
  }

  // Verifica se já existem embeddings completos para este documento
  if (!options?.force) {
    const existing = await getDenseEmbeddings(documentId);
    if (existing.length > 0 && existing.length >= chunksToProcess.length) {
      return { status: 'already_indexed', chunksCount: existing.length };
    }
  }

  try {
    const workerClient = getDenseWorkerClient();
    await workerClient.initialize();

    const embeddings = await workerClient.embedChunks(chunksToProcess, {
      batchSize: 4,
      onBatchProgress: options?.onBatchProgress,
    });

    await saveDenseEmbeddings(documentId, embeddings);

    const isFullyIndexed = embeddings.length === chunksToProcess.length;
    await saveDenseIndexMetadata({
      documentId,
      status: isFullyIndexed ? 'completed' : 'partial',
      totalChunks: chunksToProcess.length,
      indexedChunks: embeddings.length,
      modelVersion: CURRENT_DENSE_MODEL_VERSION,
      dimension: DENSE_VECTOR_DIMENSION,
      updatedAt: Date.now(),
    });

    if (!isFullyIndexed) {
      return {
        status: 'failed',
        chunksCount: embeddings.length,
        error: `Indexação parcial: apenas ${embeddings.length} de ${chunksToProcess.length} chunks foram vetorizados.`,
      };
    }

    return { status: 'indexed', chunksCount: embeddings.length };
  } catch (err: any) {
    console.error(`[Dense Indexing] Falha ao indexar documento ${documentId}:`, err);
    return { status: 'failed', chunksCount: 0, error: err?.message || String(err) };
  }
}

/**
 * Vetoriza todos os documentos existentes no repositório que ainda não possuem embeddings.
 */
export async function indexAllUnindexedDocumentsDense(
  onProgress?: (docTitle: string, currentDoc: number, totalDocs: number, chunkCompleted: number, chunkTotal: number) => void
): Promise<{ totalIndexed: number; totalChunks: number }> {
  if (!hasConsent()) {
    return { totalIndexed: 0, totalChunks: 0 };
  }

  const docs = await getAllUserDocuments();
  let totalIndexed = 0;
  let totalChunks = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const existing = await getDenseEmbeddings(doc.id);
    if (existing.length === 0) {
      const res = await indexDocumentDense(doc.id, undefined, {
        onBatchProgress: (c, t) => {
          if (onProgress) onProgress(doc.title, i + 1, docs.length, c, t);
        },
      });
      if (res.status === 'indexed') {
        totalIndexed++;
        totalChunks += res.chunksCount;
      }
    }
  }

  return { totalIndexed, totalChunks };
}
