/**
 * NeuroClass AI — Serviço de Resolução de Contexto Adjacente (Chunk Stitching)
 * @module services/retrieval/adjacentChunkService
 *
 * Responsável por expandir controladamente trechos de evidência recuperados que
 * apresentem descontinuidade sintática (frases cortadas no início ou fim de página/bloco),
 * preservando estritamente a identidade, numeração de página e offsets do chunk primário.
 *
 * REGRAS INVIOLÁVEIS:
 * 1. Respeitar estritamente os limites do documento (nunca avançar para outro documento);
 * 2. Manter ordem física natural e unicidade de chunks (zero duplicatas);
 * 3. Preservar a citação principal apontando para o chunk e página que efetivamente contêm a evidência central;
 * 4. Respeitar o orçamento de tokens do contexto do Tutor.
 */

import type { StoredDocumentChunk, PackedEvidenceChunk } from '../../types/rag';
import { estimateTokenCount } from '../documents/chunkingService';

export interface AdjacentContextOptions {
  /** Se deve buscar chunk imediatamente anterior quando houver descontinuidade */
  expandPrevious?: boolean;
  /** Se deve buscar chunk imediatamente posterior quando houver descontinuidade */
  expandNext?: boolean;
  /** Limite de tokens adicionais para blocos adjacentes */
  maxAdjacentTokensBudget?: number;
}

/**
 * Detecta se um chunk apresenta sinais fortes de início ou fim de frase fragmentada.
 */
export function isEvidenceFragmented(text: string): { incompleteStart: boolean; incompleteEnd: boolean } {
  if (!text || text.trim().length === 0) {
    return { incompleteStart: false, incompleteEnd: false };
  }

  const trimmed = text.trim();

  // Início incompleto: começa com letra minúscula ou pontuação de continuidade (exceto números/símbolos)
  const firstChar = trimmed[0];
  const incompleteStart = /^[a-zà-ÿ,;)]/.test(firstChar);

  // Fim incompleto: termina sem pontuação final forte (. ! ? : """)
  const lastChar = trimmed[trimmed.length - 1];
  const incompleteEnd = !/[.!?:"”\n]$/.test(lastChar);

  return { incompleteStart, incompleteEnd };
}

export interface StitchResult {
  stitchedText: string;
  hasPrecedingContext: boolean;
  hasSucceedingContext: boolean;
  precedingChunkId?: string;
  succeedingChunkId?: string;
  totalTokens: number;
}

/**
 * Constrói texto contextualmente expandido conectando chunks adjacentes quando
 * necessário, sem quebrar os metadados do chunk de citação original.
 */
export function resolveAdjacentContext(
  primaryChunk: StoredDocumentChunk,
  allDocChunks: StoredDocumentChunk[],
  options?: AdjacentContextOptions
): StitchResult {
  const expandPrev = options?.expandPrevious ?? true;
  const expandNext = options?.expandNext ?? true;
  const maxBudget = options?.maxAdjacentTokensBudget ?? 250;

  // Ordena chunks por índice global ou página/offset para garantir topologia sequencial
  const sorted = [...allDocChunks].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.chunkIndexInPage - b.chunkIndexInPage;
  });

  const currentIndex = sorted.findIndex((c) => c.chunkId === primaryChunk.chunkId);
  if (currentIndex === -1) {
    return {
      stitchedText: primaryChunk.text,
      hasPrecedingContext: false,
      hasSucceedingContext: false,
      totalTokens: primaryChunk.estimatedTokens || estimateTokenCount(primaryChunk.text),
    };
  }

  const fragmentation = isEvidenceFragmented(primaryChunk.text);
  let stitchedText = primaryChunk.text;
  let hasPreceding = false;
  let hasSucceeding = false;
  let precedingChunkId: string | undefined;
  let succeedingChunkId: string | undefined;
  let addedTokens = 0;

  // 1. Expansão anterior (se houver início incompleto ou continuidade solicitada)
  if (expandPrev && fragmentation.incompleteStart && currentIndex > 0) {
    const prevChunk = sorted[currentIndex - 1];
    // Garante mesmo documento e página contígua (máx 1 página de diferença)
    if (
      prevChunk.documentId === primaryChunk.documentId &&
      Math.abs(primaryChunk.pageNumber - prevChunk.pageNumber) <= 1
    ) {
      const prevTokens = prevChunk.estimatedTokens || estimateTokenCount(prevChunk.text);
      if (addedTokens + prevTokens <= maxBudget) {
        stitchedText = `[... contextual anterior: Pág. ${prevChunk.pageNumber}]\n${prevChunk.text}\n\n[Trecho Principal: Pág. ${primaryChunk.pageNumber}]\n${stitchedText}`;
        hasPreceding = true;
        precedingChunkId = prevChunk.chunkId;
        addedTokens += prevTokens;
      }
    }
  }

  // 2. Expansão posterior (se houver fim incompleto ou continuidade solicitada)
  if (expandNext && fragmentation.incompleteEnd && currentIndex < sorted.length - 1) {
    const nextChunk = sorted[currentIndex + 1];
    // Garante mesmo documento e página contígua
    if (
      nextChunk.documentId === primaryChunk.documentId &&
      Math.abs(nextChunk.pageNumber - primaryChunk.pageNumber) <= 1
    ) {
      const nextTokens = nextChunk.estimatedTokens || estimateTokenCount(nextChunk.text);
      if (addedTokens + nextTokens <= maxBudget) {
        stitchedText = `${stitchedText}\n\n[... continuidade seguinte: Pág. ${nextChunk.pageNumber}]\n${nextChunk.text}`;
        hasSucceeding = true;
        succeedingChunkId = nextChunk.chunkId;
        addedTokens += nextTokens;
      }
    }
  }

  return {
    stitchedText,
    hasPrecedingContext: hasPreceding,
    hasSucceedingContext: hasSucceeding,
    precedingChunkId,
    succeedingChunkId,
    totalTokens: estimateTokenCount(stitchedText),
  };
}

