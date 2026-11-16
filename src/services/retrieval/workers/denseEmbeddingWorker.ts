/**
 * NeuroClass AI — Web Worker Dedicado de Inferência e Busca Densa
 * @module services/retrieval/workers/denseEmbeddingWorker
 *
 * Executa a inferência de embeddings fora da thread principal do navegador:
 * 1. Isolamento total da interface gráfica (zero stuttering / 60 FPS);
 * 2. WASM SIMD single-thread (numThreads: 1) como linha de base estável;
 * 3. Protocolo bidirecional tipado com suporte a progresso e cancelamento via AbortController.
 */

import {
  embedQuery,
  embedPassage,
  computeCosineSimilarity,
  searchDenseCandidates,
  getEmbeddingPipeline,
} from '../denseEmbeddingEngine';
import {
  CURRENT_DENSE_MODEL_VERSION,
  DENSE_VECTOR_DIMENSION,
} from '../../documents/ragDensePersistenceService';
import type {
  DenseWorkerRequest,
  DenseWorkerResponse,
  StoredDenseEmbedding,
} from '../../../types/rag';

let currentAbortController: AbortController | null = null;

// Listener de mensagens do Worker
self.onmessage = async (event: MessageEvent<DenseWorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'INITIALIZE': {
        await getEmbeddingPipeline((p) => {
          const progressMsg: DenseWorkerResponse = {
            id,
            type: 'MODEL_DOWNLOAD_PROGRESS',
            payload: {
              file: p.file,
              progress: p.progress,
              loaded: p.loaded,
              total: p.total,
              status: p.status,
            },
          };
          self.postMessage(progressMsg);
        });

        const readyMsg: DenseWorkerResponse = {
          id,
          type: 'MODEL_READY',
          payload: {
            modelVersion: CURRENT_DENSE_MODEL_VERSION,
            dimension: DENSE_VECTOR_DIMENSION,
          },
        };
        self.postMessage(readyMsg);
        break;
      }

      case 'EMBED_BATCH': {
        const { chunks, batchSize = 4 } = payload;
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        const results: StoredDenseEmbedding[] = [];
        const total = chunks.length;

        for (let i = 0; i < total; i += batchSize) {
          if (signal.aborted) {
            self.postMessage({ id, type: 'CANCELLED' } as DenseWorkerResponse);
            return;
          }

          const batch = chunks.slice(i, i + batchSize);
          for (const chunk of batch) {
            if (signal.aborted) {
              self.postMessage({ id, type: 'CANCELLED' } as DenseWorkerResponse);
              return;
            }

            const { embedding, isSegmented, segmentsCount } = await embedPassage(chunk);
            results.push({
              chunkId: chunk.chunkId,
              documentId: chunk.documentId,
              docId: chunk.docId || chunk.documentId,
              pageNumber: chunk.pageNumber,
              embedding,
              modelVersion: CURRENT_DENSE_MODEL_VERSION,
              dimension: DENSE_VECTOR_DIMENSION,
              tokenizerVersion: 'e5-tokenizer-sentencepiece',
              pooling: 'mean+l2',
              contentHash: chunk.contentHash,
              isSegmented,
              segmentsCount,
              storedAt: Date.now(),
            });
          }

          // Notifica progresso do lote
          const progressMsg: DenseWorkerResponse = {
            id,
            type: 'BATCH_PROGRESS',
            payload: {
              completed: Math.min(i + batchSize, total),
              total,
              batchResults: results.slice(i, Math.min(i + batchSize, total)),
            },
          };
          self.postMessage(progressMsg);
        }

        self.postMessage({
          id,
          type: 'SEARCH_RESULT',
          payload: { embeddings: results },
        } as DenseWorkerResponse);
        break;
      }

      case 'SEARCH': {
        const { query, embeddings, topK = 20, minScore = -1.0 } = payload;
        const queryVector = await embedQuery(query);
        const candidates = searchDenseCandidates(queryVector, embeddings, topK, minScore);

        self.postMessage({
          id,
          type: 'SEARCH_RESULT',
          payload: { candidates, queryVector },
        } as DenseWorkerResponse);
        break;
      }

      case 'CANCEL': {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        self.postMessage({ id, type: 'CANCELLED' } as DenseWorkerResponse);
        break;
      }

      case 'DISPOSE': {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        self.postMessage({ id, type: 'CANCELLED', payload: { disposed: true } } as DenseWorkerResponse);
        break;
      }

      default: {
        self.postMessage({
          id,
          type: 'ERROR',
          error: `Tipo de mensagem não reconhecido: ${type}`,
        } as DenseWorkerResponse);
      }
    }
  } catch (err: any) {
    self.postMessage({
      id,
      type: 'ERROR',
      error: err?.message || String(err),
    } as DenseWorkerResponse);
  }
};

