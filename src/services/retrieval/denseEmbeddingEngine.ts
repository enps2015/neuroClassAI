/**
 * NeuroClass AI — Motor de Inferência e Busca Densa Local
 * @module services/retrieval/denseEmbeddingEngine
 *
 * Gerencia a execução local do modelo multilingual-e5-small via Transformers.js:
 * 1. Configura estritamente CPU WebAssembly SIMD single-thread (numThreads: 1);
 * 2. Aplica os prefixos obrigatórios E5 ("query: " e "passage: ");
 * 3. Utiliza mean pooling e normalização L2;
 * 4. Suporta divisão e agregação transparente de chunks longos (> 512 tokens);
 * 5. Executa vetorização em lotes com cancelamento cooperativo via AbortSignal;
 * 6. Executa varredura por similaridade de cossenos para recuperação densa.
 */

import {
  CURRENT_DENSE_MODEL_VERSION,
  DENSE_VECTOR_DIMENSION,
} from '../documents/ragDensePersistenceService';
import {
  segmentChunkForEmbedding,
  aggregateSegmentVectors,
  normalizeL2,
} from './chunkEmbeddingSegmenter';
import type { StoredDocumentChunk, StoredDenseEmbedding } from '../../types/rag';

export const E5_MODEL_ID = 'Xenova/multilingual-e5-small';
export const E5_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const DEFAULT_BATCH_SIZE = 4;

let pipelineInstance: any = null;
let isInitializing = false;
let initPromise: Promise<any> | null = null;

/**
 * Inicializa e carrega o pipeline de extração de features do modelo multilingual-e5-small.
 */
export async function getEmbeddingPipeline(
  onProgress?: (progressInfo: { status: string; file: string; progress?: number; loaded?: number; total?: number }) => void
): Promise<any> {
  if (pipelineInstance) {
    return pipelineInstance;
  }
  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    // Importação dinâmica de Transformers.js para evitar bloat no bundle principal
    const { pipeline, env } = await import('@huggingface/transformers');

    // Configuração estrita de runtime: CPU WASM SIMD, single-thread
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }

    // Configuração de cache local seguro se em Node
    if (typeof process !== 'undefined' && process.env) {
      env.cacheDir = process.env.HF_CACHE_DIR || '/tmp/hf-models-cache';
    }

    // Detector de ambiente: em Node.js device deve ser 'cpu'; em navegador 'wasm' ou 'webgpu'
    const isBrowser = typeof window !== 'undefined' || (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function');
    let device: any = isBrowser ? 'wasm' : 'cpu';
    if (isBrowser && typeof navigator !== 'undefined' && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          device = 'webgpu';
        }
      } catch {
        device = 'wasm';
      }
    }

    pipelineInstance = await pipeline('feature-extraction', E5_MODEL_ID, {
      revision: E5_MODEL_REVISION,
      dtype: 'q8', // INT8 quantizado
      device,
      progress_callback: (p: any) => {
        if (onProgress) {
          onProgress(p);
        }
      },
    });

    isInitializing = false;
    return pipelineInstance;
  })();

  return initPromise;
}

/**
 * Gera o embedding de uma consulta prefixada com "query: ".
 * Retorna vetor de 384 dimensões normalizado em L2.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const text = `query: ${query.trim()}`;
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Gera o embedding de uma passagem prefixada com "passage: ".
 * Caso o texto exceda a janela segura, divide em segmentos e agrega por centróide normalizado.
 */
export async function embedPassage(
  chunk: { chunkId: string; text: string; estimatedTokens?: number }
): Promise<{ embedding: number[]; isSegmented: boolean; segmentsCount: number }> {
  const extractor = await getEmbeddingPipeline();
  const segmentation = segmentChunkForEmbedding(chunk);

  if (!segmentation.isSegmented) {
    const text = `passage: ${segmentation.segments[0].trim()}`;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array);
    return {
      embedding: vector,
      isSegmented: false,
      segmentsCount: 1,
    };
  }

  // Chunks longos: vetoriza cada segmento separadamente
  const segmentVectors: number[][] = [];
  for (const seg of segmentation.segments) {
    const text = `passage: ${seg.trim()}`;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    segmentVectors.push(Array.from(output.data as Float32Array));
  }

  const aggregated = aggregateSegmentVectors(segmentVectors);
  return {
    embedding: aggregated,
    isSegmented: true,
    segmentsCount: segmentation.segmentsCount,
  };
}

/**
 * Vetoriza uma coleção de chunks em lotes conservadores com controle de cancelamento e progresso.
 */
export async function embedChunksBatch(
  chunks: StoredDocumentChunk[],
  options?: {
    batchSize?: number;
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<StoredDenseEmbedding[]> {
  const batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
  const signal = options?.signal;
  const total = chunks.length;
  const results: StoredDenseEmbedding[] = [];

  for (let i = 0; i < total; i += batchSize) {
    if (signal?.aborted) {
      throw new Error('[Embedding Engine] Vetorização cancelada pelo usuário.');
    }

    const batch = chunks.slice(i, i + batchSize);
    for (const chunk of batch) {
      if (signal?.aborted) {
        throw new Error('[Embedding Engine] Vetorização cancelada pelo usuário.');
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

    if (options?.onProgress) {
      options.onProgress(Math.min(i + batchSize, total), total);
    }
  }

  return results;
}

/**
 * Calcula a similaridade de cossenos entre dois vetores normalizados em L2.
 * Para vetores normalizados, equivale exatamente ao produto escalar (dot product).
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

export interface DenseCandidateResult {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  cosineScore: number;
  rank: number;
}

/**
 * Executa a busca densa calculando a similaridade de cossenos contra os embeddings dos chunks elegíveis.
 * Ordena decrescente por score de cosseno e aplica desempate estável.
 */
export function searchDenseCandidates(
  queryVector: number[],
  embeddings: StoredDenseEmbedding[],
  topK: number = 20,
  minScoreThreshold: number = -1.0
): DenseCandidateResult[] {
  const scored: Array<{ chunkId: string; documentId: string; pageNumber: number; cosineScore: number }> = [];

  for (const emb of embeddings) {
    const score = computeCosineSimilarity(queryVector, emb.embedding);
    if (score >= minScoreThreshold) {
      scored.push({
        chunkId: emb.chunkId,
        documentId: emb.documentId,
        pageNumber: emb.pageNumber,
        cosineScore: score,
      });
    }
  }

  // Ordenação determinística: score desc -> page asc -> chunkId asc
  scored.sort((a, b) => {
    if (Math.abs(b.cosineScore - a.cosineScore) > 1e-6) {
      return b.cosineScore - a.cosineScore;
    }
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });

  const sliced = scored.slice(0, topK);
  return sliced.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
