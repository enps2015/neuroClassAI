/**
 * NeuroClass AI — Cliente Tipado para Comunicação com o Dense Web Worker
 * @module services/retrieval/workers/denseWorkerClient
 *
 * Encapsula o ciclo de vida do Web Worker:
 * - Em ambiente navegador: instancia Worker dedicado type: 'module';
 * - Em ambiente Node.js / testes: utiliza chamada direta assíncrona ao denseEmbeddingEngine.
 */

import type {
  DenseWorkerRequest,
  DenseWorkerResponse,
  StoredDenseEmbedding,
  StoredDocumentChunk,
} from '../../../types/rag';
import {
  getEmbeddingPipeline,
  embedQuery,
  embedPassage,
  embedChunksBatch,
  searchDenseCandidates,
  DenseCandidateResult,
} from '../denseEmbeddingEngine';

export class DenseEmbeddingWorkerClient {
  private worker: Worker | null = null;
  private isNodeEnv: boolean;

  constructor() {
    this.isNodeEnv = typeof window === 'undefined' || typeof Worker === 'undefined';
  }

  /**
   * Inicializa o motor semântico e reporta progresso de download dos pesos.
   */
  async initialize(
    onProgress?: (progressInfo: { status: string; file: string; progress?: number; loaded?: number; total?: number }) => void
  ): Promise<void> {
    if (this.isNodeEnv) {
      await getEmbeddingPipeline(onProgress);
      return;
    }

    if (!this.worker) {
      this.worker = new Worker(new URL('./denseEmbeddingWorker.ts', import.meta.url), {
        type: 'module',
      });
    }

    return new Promise((resolve, reject) => {
      const reqId = `init_${Date.now()}`;
      const handler = (event: MessageEvent<DenseWorkerResponse>) => {
        const { id, type, payload, error } = event.data;
        if (id !== reqId) return;

        if (type === 'MODEL_DOWNLOAD_PROGRESS' && onProgress) {
          onProgress(payload);
        } else if (type === 'MODEL_READY') {
          this.worker?.removeEventListener('message', handler);
          resolve();
        } else if (type === 'ERROR') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(error || 'Falha ao inicializar modelo no Worker.'));
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({ id: reqId, type: 'INITIALIZE' } as DenseWorkerRequest);
    });
  }

  /**
   * Vetoriza uma lista de chunks em lotes com checkpoint.
   */
  async embedChunks(
    chunks: StoredDocumentChunk[],
    options?: {
      batchSize?: number;
      signal?: AbortSignal;
      onBatchProgress?: (completed: number, total: number) => void;
    }
  ): Promise<StoredDenseEmbedding[]> {
    if (this.isNodeEnv) {
      return embedChunksBatch(chunks, {
        batchSize: options?.batchSize,
        signal: options?.signal,
        onProgress: options?.onBatchProgress,
      });
    }

    // No browser, envia chunks ao worker
    return new Promise((resolve, reject) => {
      const reqId = `batch_${Date.now()}`;
      const handler = (event: MessageEvent<DenseWorkerResponse>) => {
        const { id, type, payload, error } = event.data;
        if (id !== reqId) return;

        if (type === 'BATCH_PROGRESS') {
          if (options?.onBatchProgress) {
            options.onBatchProgress(payload.completed, payload.total);
          }
        } else if (type === 'SEARCH_RESULT') {
          this.worker?.removeEventListener('message', handler);
          resolve(payload.embeddings);
        } else if (type === 'CANCELLED') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error('Vetorização cancelada.'));
        } else if (type === 'ERROR') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(error || 'Erro na vetorização de chunks.'));
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({
        id: reqId,
        type: 'EMBED_BATCH',
        payload: { chunks, batchSize: options?.batchSize || 4 },
      } as DenseWorkerRequest);
    });
  }

  /**
   * Executa busca semântica calculando similaridade de cossenos.
   */
  async search(
    query: string,
    embeddings: StoredDenseEmbedding[],
    topK: number = 20,
    minScore: number = -1.0
  ): Promise<DenseCandidateResult[]> {
    if (this.isNodeEnv) {
      const queryVector = await embedQuery(query);
      return searchDenseCandidates(queryVector, embeddings, topK, minScore);
    }

    return new Promise((resolve, reject) => {
      const reqId = `search_${Date.now()}`;
      const handler = (event: MessageEvent<DenseWorkerResponse>) => {
        const { id, type, payload, error } = event.data;
        if (id !== reqId) return;

        if (type === 'SEARCH_RESULT') {
          this.worker?.removeEventListener('message', handler);
          resolve(payload.candidates);
        } else if (type === 'ERROR') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(error || 'Erro na busca densa.'));
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({
        id: reqId,
        type: 'SEARCH',
        payload: { query, embeddings, topK, minScore },
      } as DenseWorkerRequest);
    });
  }

  dispose() {
    if (this.worker) {
      this.worker.postMessage({ id: 'dispose', type: 'DISPOSE' } as DenseWorkerRequest);
      this.worker.terminate();
      this.worker = null;
    }
  }
}

let defaultDenseWorkerClient: DenseEmbeddingWorkerClient | null = null;

export function getDenseWorkerClient(): DenseEmbeddingWorkerClient {
  if (!defaultDenseWorkerClient) {
    defaultDenseWorkerClient = new DenseEmbeddingWorkerClient();
  }
  return defaultDenseWorkerClient;
}

export function disposeDenseWorkerClient(): void {
  if (defaultDenseWorkerClient) {
    defaultDenseWorkerClient.dispose();
    defaultDenseWorkerClient = null;
  }
}


