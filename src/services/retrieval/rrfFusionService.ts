/**
 * NeuroClass AI — Fusão Reciprocal Rank Fusion (RRF)
 * @module services/retrieval/rrfFusionService
 *
 * Implementa a combinação robusta e invariante à escala entre o canal lexical (BM25)
 * e o canal semântico denso (Embeddings E5) usando RRF:
 *
 * RRF(c) = sum_{m in {lexical, dense}} [ 1 / (k + rank_m(c)) ]
 *
 * Onde k = 60 (constante canônica de suavização).
 *
 * REGRAS INVIOLÁVEIS:
 * 1. Todo resultado fundido preserva integralmente chunkId, texto original exato, offsets UTF-16 e sourceRef.
 * 2. Desempate determinístico: RRF Score (desc) -> BM25 Score (desc) -> Página (asc) -> chunkId (asc).
 * 3. Chunks sem evidência ou fora de escopo são estritamente excluídos.
 */

import type { Bm25SearchResult, StoredDocumentChunk, HybridSearchResult } from '../../types/rag';
import type { DenseCandidateResult } from './denseEmbeddingEngine';

export const DEFAULT_RRF_K = 60;

export interface RrfFusionOptions {
  rrfK?: number;
  topK?: number;
  lexicalWeight?: number;
  denseWeight?: number;
}

/**
 * Executa a fusão dos rankings de BM25 e busca densa via Reciprocal Rank Fusion.
 */
export function fuseRRF(
  lexicalResults: Bm25SearchResult[],
  denseResults: DenseCandidateResult[],
  chunkMap: Map<string, StoredDocumentChunk>,
  options?: RrfFusionOptions
): HybridSearchResult[] {
  const k = options?.rrfK ?? DEFAULT_RRF_K;
  const topK = options?.topK ?? 10;
  const lexWeight = options?.lexicalWeight ?? 1.0;
  const denseWeight = options?.denseWeight ?? 1.0;

  // Mapa de pontuação agregada por chunkId
  const candidateScores = new Map<
    string,
    {
      chunkId: string;
      documentId: string;
      docId: string;
      pageNumber: number;
      score: number;
      bm25Score?: number;
      denseCosineScore?: number;
      bm25Rank?: number;
      denseRank?: number;
      matchedTerms: string[];
    }
  >();

  // 1. Processa ranking lexical BM25
  for (let i = 0; i < lexicalResults.length; i++) {
    const lex = lexicalResults[i];
    const rank = i + 1;
    const rrfContribution = lexWeight * (1 / (k + rank));

    candidateScores.set(lex.chunkId, {
      chunkId: lex.chunkId,
      documentId: lex.documentId,
      docId: lex.docId,
      pageNumber: lex.pageNumber,
      score: rrfContribution,
      bm25Score: lex.score,
      bm25Rank: rank,
      matchedTerms: [...lex.matchedTerms],
    });
  }

  // 2. Processa ranking denso
  for (let i = 0; i < denseResults.length; i++) {
    const dense = denseResults[i];
    const rank = i + 1;
    const rrfContribution = denseWeight * (1 / (k + rank));

    if (candidateScores.has(dense.chunkId)) {
      const existing = candidateScores.get(dense.chunkId)!;
      existing.score += rrfContribution;
      existing.denseCosineScore = dense.cosineScore;
      existing.denseRank = rank;
    } else {
      candidateScores.set(dense.chunkId, {
        chunkId: dense.chunkId,
        documentId: dense.documentId,
        docId: dense.documentId,
        pageNumber: dense.pageNumber,
        score: rrfContribution,
        denseCosineScore: dense.cosineScore,
        denseRank: rank,
        matchedTerms: [],
      });
    }
  }

  // 3. Ordenação determinística e resolução completa de metadados
  const candidatesArray = Array.from(candidateScores.values());

  candidatesArray.sort((a, b) => {
    // Score RRF decrescente
    if (Math.abs(b.score - a.score) > 1e-7) {
      return b.score - a.score;
    }
    // Desempate por score BM25 se disponível
    if (a.bm25Score !== undefined && b.bm25Score !== undefined) {
      if (Math.abs(b.bm25Score - a.bm25Score) > 1e-5) {
        return b.bm25Score - a.bm25Score;
      }
    }
    // Desempate por página crescente
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }
    // Desempate por chunkId determinístico
    return a.chunkId.localeCompare(b.chunkId);
  });

  const topCandidates = candidatesArray.slice(0, topK);
  const finalResults: HybridSearchResult[] = [];

  for (const cand of topCandidates) {
    const chunk = chunkMap.get(cand.chunkId);
    if (!chunk) {
      // Se por anomalia o chunk original não foi encontrado no mapa, ignora
      continue;
    }

    finalResults.push({
      documentId: chunk.documentId,
      docId: chunk.docId || chunk.documentId,
      chunkId: chunk.chunkId,
      text: chunk.text,
      score: cand.score,
      bm25Score: cand.bm25Score,
      denseCosineScore: cand.denseCosineScore,
      bm25Rank: cand.bm25Rank,
      denseRank: cand.denseRank,
      pageNumber: chunk.pageNumber,
      chunkIndexInPage: chunk.chunkIndexInPage,
      sectionTitle: chunk.sourceRef.sectionTitle,
      sectionHierarchy: chunk.sourceRef.sectionHierarchy,
      charOffsetStart: chunk.sourceRef.charOffsetStart,
      charOffsetEnd: chunk.sourceRef.charOffsetEnd,
      sourceRef: { ...chunk.sourceRef },
      contentHash: chunk.contentHash,
      matchedTerms: cand.matchedTerms,
      indexVersion: 'hybrid-rrf-v1',
    });
  }

  return finalResults;
}

