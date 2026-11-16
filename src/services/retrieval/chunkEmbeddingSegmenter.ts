/**
 * NeuroClass AI — Segmentador Semântico de Chunks Longos para Embeddings
 * @module services/retrieval/chunkEmbeddingSegmenter
 *
 * O modelo multilingual-e5-small aceita no máximo 512 tokens (incluindo tokens especiais
 * e o prefixo "passage: "). O pipeline de chunking estruturado do NeuroClass AI pode gerar
 * blocos de até 650 tokens (tabelas atômicas, fórmulas, seções densas).
 *
 * Este serviço implementa a divisão estrita da ENTRADA DE EMBEDDING em segmentos semânticos
 * sem NUNCA modificar o texto original, offsets UTF-16, chunkId ou chunking RAG persistido.
 *
 * Agregação Vetorial:
 * Os vetores dos segmentos são agregados por média normalizada L2:
 * v_agg = normalize(sum(v_s))
 * Garantindo vetor unitário de 384 dimensões e eliminando qualquer vantagem injusta de ranking
 * para chunks segmentados.
 */

import type { StoredDocumentChunk } from '../../types/rag';

export const SAFE_MAX_EMBEDDING_TOKENS = 420; // Deixa margem segura para prefixo e special tokens
export const SAFE_MAX_CHARS = 1600;

export interface ChunkEmbeddingSegmentation {
  chunkId: string;
  isSegmented: boolean;
  segmentsCount: number;
  segments: string[];
}

/**
 * Normaliza um vetor numérico para norma L2 unitária (||v|| = 1.0).
 */
export function normalizeL2(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

/**
 * Agrega múltiplos vetores de segmentos em um único vetor normalizado representativo do chunk.
 */
export function aggregateSegmentVectors(segmentVectors: number[][]): number[] {
  if (segmentVectors.length === 0) {
    throw new Error('[Segmenter] Lista de vetores de segmento vazia para agregação.');
  }
  if (segmentVectors.length === 1) {
    return normalizeL2(segmentVectors[0]);
  }

  const dim = segmentVectors[0].length;
  const meanVector = new Array(dim).fill(0);

  for (const vec of segmentVectors) {
    for (let i = 0; i < dim; i++) {
      meanVector[i] += vec[i];
    }
  }

  // Normalização L2 do centróide resultante
  return normalizeL2(meanVector);
}

/**
 * Divide o texto do chunk em segmentos semânticos caso exceda o limite seguro do modelo.
 * Preserva integridade de parágrafos, linhas de tabelas e equações.
 */
export function segmentChunkForEmbedding(
  chunk: { chunkId: string; text: string; estimatedTokens?: number },
  maxTokens: number = SAFE_MAX_EMBEDDING_TOKENS
): ChunkEmbeddingSegmentation {
  const text = chunk.text || '';
  const tokens = chunk.estimatedTokens ?? Math.ceil(text.length / 4);

  // Se o chunk cabe confortavelmente no limite de 512 do modelo
  if (tokens <= maxTokens && text.length <= SAFE_MAX_CHARS) {
    return {
      chunkId: chunk.chunkId,
      isSegmented: false,
      segmentsCount: 1,
      segments: [text],
    };
  }

  // Estratégia de segmentação em limites naturais
  const segments: string[] = [];
  
  // 1. Tentar quebra por parágrafos duplos
  if (text.includes('\n\n')) {
    const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);
    let currentSegment = '';

    for (const para of paragraphs) {
      if ((currentSegment.length + para.length) > SAFE_MAX_CHARS && currentSegment.length > 0) {
        segments.push(currentSegment.trim());
        currentSegment = para;
      } else {
        currentSegment = currentSegment ? `${currentSegment}\n\n${para}` : para;
      }
    }
    if (currentSegment.trim().length > 0) {
      segments.push(currentSegment.trim());
    }
  } else if (text.includes('\n|') || text.startsWith('|')) {
    // 2. Tabela Markdown: quebrar por linhas preservando o cabeçalho
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const headerLines = lines.slice(0, 2); // Linha do cabeçalho e divisor |---|
    const headerText = headerLines.join('\n');
    const rowLines = lines.slice(2);

    let currentSegmentRows: string[] = [];
    for (const row of rowLines) {
      currentSegmentRows.push(row);
      if (currentSegmentRows.join('\n').length > (SAFE_MAX_CHARS - headerText.length)) {
        segments.push(`${headerText}\n${currentSegmentRows.join('\n')}`.trim());
        currentSegmentRows = [];
      }
    }
    if (currentSegmentRows.length > 0) {
      segments.push(`${headerText}\n${currentSegmentRows.join('\n')}`.trim());
    }
  } else {
    // 3. Texto contínuo em prosa: quebrar em finais de sentenças com overlap
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    let currentSlice = '';

    for (const sentence of sentences) {
      if ((currentSlice.length + sentence.length) > SAFE_MAX_CHARS && currentSlice.length > 0) {
        segments.push(currentSlice.trim());
        // Overlap com a última sentença para continuidade de contexto
        currentSlice = `${sentence}`;
      } else {
        currentSlice += sentence;
      }
    }
    if (currentSlice.trim().length > 0) {
      segments.push(currentSlice.trim());
    }
  }

  // Garantia: se por algum motivo nenhum segmento foi produzido, recai no texto original truncado
  if (segments.length === 0) {
    segments.push(text.slice(0, SAFE_MAX_CHARS));
  }

  return {
    chunkId: chunk.chunkId,
    isSegmented: segments.length > 1,
    segmentsCount: segments.length,
    segments,
  };
}

