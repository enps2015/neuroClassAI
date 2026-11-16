/**
 * NeuroClass AI — Coordenador de Busca Híbrida (BM25 + Densa + RRF)
 * @module services/retrieval/hybridSearchService
 *
 * Ponto de entrada unificado para recuperação de evidências documentais:
 * - Se busca densa desativada ou sem consentimento: executa BM25 morfológico puro (fallback);
 * - Se busca densa ativada com consentimento: dispara os canais lexical e denso em paralelo,
 *   fundindo seus resultados via Reciprocal Rank Fusion (RRF);
 * - Se o documento ainda não possuir embeddings densos: executa fallback transparente para BM25;
 * - Preserva integralmente o escopo documental e a fidelidade de offsets e citações.
 */

import { searchBM25 } from './bm25SearchService';
import { embedQuery, searchDenseCandidates } from './denseEmbeddingEngine';
import { getDenseWorkerClient } from './workers/denseWorkerClient';
import { fuseRRF, DEFAULT_RRF_K } from './rrfFusionService';
import {
  getDenseEmbeddings,
  getDenseEmbeddingsForDocuments,
  getAllDenseEmbeddings,
} from '../documents/ragDensePersistenceService';
import { getDocumentChunks } from '../documents/ragPersistenceService';
import { hasConsent } from './semanticConsentService';
import type {
  HybridSearchOptions,
  HybridSearchResult,
  HybridQueryResponse,
  StoredDocumentChunk,
} from '../../types/rag';

export const DEFAULT_TOP_K = 10;
export const DEFAULT_CANDIDATE_TOP_K = 25;

/**
 * Executa a recuperação documental híbrida com fallback garantido para BM25.
 */
export async function searchHybrid(
  query: string,
  options?: HybridSearchOptions
): Promise<HybridQueryResponse> {
  const overallStart = Date.now();
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const candidateK = options?.denseTopK ?? DEFAULT_CANDIDATE_TOP_K;
  const rrfK = options?.rrfK ?? DEFAULT_RRF_K;
  const enableDense = (options?.enableDense ?? true) && hasConsent();

  // 1. Executa o canal lexical primário (BM25 com suporte morfológico)
  const lexStart = Date.now();
  const bm25Response = await searchBM25(query, {
    ...options,
    topK: candidateK,
    normalizeMorphology: options?.normalizeMorphology ?? true,
  });
  const lexicalMs = Date.now() - lexStart;
  const lexicalResults = bm25Response.results || [];

  // Se a camada densa estiver desativada ou sem consentimento do usuário
  if (!enableDense) {
    const fallbackResults: HybridSearchResult[] = lexicalResults.slice(0, topK).map((lex, idx) => ({
      documentId: lex.documentId,
      docId: lex.docId,
      chunkId: lex.chunkId,
      text: lex.text,
      score: lex.score, // Mantém score BM25 no fallback
      bm25Score: lex.score,
      bm25Rank: idx + 1,
      pageNumber: lex.pageNumber,
      chunkIndexInPage: lex.chunkIndexInPage,
      sectionTitle: lex.sectionTitle,
      sectionHierarchy: lex.sectionHierarchy,
      charOffsetStart: lex.charOffsetStart,
      charOffsetEnd: lex.charOffsetEnd,
      sourceRef: { ...lex.sourceRef },
      contentHash: lex.contentHash,
      matchedTerms: lex.matchedTerms,
      indexVersion: lex.indexVersion,
    }));

    return {
      query,
      results: fallbackResults,
      totalMatches: fallbackResults.length,
      lexicalMatchesCount: lexicalResults.length,
      denseMatchesCount: 0,
      hybridMode: 'lexical_fallback',
      executionTimeMs: {
        total: Date.now() - overallStart,
        lexicalMs,
        denseMs: 0,
        fusionMs: 0,
      },
    };
  }

  // 2. Executa o canal denso (Embeddings E5)
  const denseStart = Date.now();
  let denseResults: any[] = [];
  let denseMs = 0;

  try {
    // Determina os documentos no escopo
    let targetDocIds: string[] = [];
    if (options?.documentId) {
      targetDocIds = [options.documentId];
    } else if (options?.documentIds && options.documentIds.length > 0) {
      targetDocIds = options.documentIds;
    }

    // Carrega embeddings persistidos (escopo específico ou global)
    let denseEmbeddings: StoredDenseEmbedding[] = [];
    if (targetDocIds.length === 1) {
      denseEmbeddings = await getDenseEmbeddings(targetDocIds[0]);
    } else if (targetDocIds.length > 1) {
      denseEmbeddings = await getDenseEmbeddingsForDocuments(targetDocIds);
    } else {
      denseEmbeddings = await getAllDenseEmbeddings();
    }

    if (denseEmbeddings && denseEmbeddings.length > 0) {
      // Executa busca vetorial delegada ao Web Worker dedicado (sem travar a UI)
      const workerClient = getDenseWorkerClient();
      denseResults = await workerClient.search(
        query,
        denseEmbeddings,
        candidateK,
        options?.minCosineScore ?? -1.0
      );
    }
  } catch (err) {
    console.warn('[Hybrid Search] Falha na inferência densa; recaindo exclusivamente em BM25:', err);
  }
  denseMs = Date.now() - denseStart;

  // Se nenhum resultado denso foi obtido (ex.: documento sem embeddings persistidos)
  if (denseResults.length === 0) {
    const fallbackResults: HybridSearchResult[] = lexicalResults.slice(0, topK).map((lex, idx) => ({
      documentId: lex.documentId,
      docId: lex.docId,
      chunkId: lex.chunkId,
      text: lex.text,
      score: lex.score,
      bm25Score: lex.score,
      bm25Rank: idx + 1,
      pageNumber: lex.pageNumber,
      chunkIndexInPage: lex.chunkIndexInPage,
      sectionTitle: lex.sectionTitle,
      sectionHierarchy: lex.sectionHierarchy,
      charOffsetStart: lex.charOffsetStart,
      charOffsetEnd: lex.charOffsetEnd,
      sourceRef: { ...lex.sourceRef },
      contentHash: lex.contentHash,
      matchedTerms: lex.matchedTerms,
      indexVersion: lex.indexVersion,
    }));

    return {
      query,
      results: fallbackResults,
      totalMatches: fallbackResults.length,
      lexicalMatchesCount: lexicalResults.length,
      denseMatchesCount: 0,
      hybridMode: 'lexical_fallback',
      executionTimeMs: {
        total: Date.now() - overallStart,
        lexicalMs,
        denseMs,
        fusionMs: 0,
      },
    };
  }

  // 3. Resolução de chunks originais para garantir metadados completos
  const fusionStart = Date.now();
  const chunkMap = new Map<string, StoredDocumentChunk>();

  // Coleta IDs únicos de chunks retornados por ambos os canais
  const allChunkIds = new Set<string>();
  for (const l of lexicalResults) allChunkIds.add(l.chunkId);
  for (const d of denseResults) allChunkIds.add(d.chunkId);

  // Carrega chunks dos documentos envolvidos
  const involvedDocIds = new Set<string>();
  for (const l of lexicalResults) involvedDocIds.add(l.documentId);
  for (const d of denseResults) involvedDocIds.add(d.documentId);

  for (const docId of involvedDocIds) {
    const chunks = await getDocumentChunks(docId);
    for (const c of chunks) {
      if (allChunkIds.has(c.chunkId)) {
        chunkMap.set(c.chunkId, c);
      }
    }
  }

  // 4. Executa Fusão RRF
  const fusedResults = fuseRRF(lexicalResults, denseResults, chunkMap, {
    rrfK,
    topK,
    lexicalWeight: options?.lexicalWeight,
    denseWeight: options?.denseWeight,
  });
  const fusionMs = Date.now() - fusionStart;

  return {
    query,
    results: fusedResults,
    totalMatches: fusedResults.length,
    lexicalMatchesCount: lexicalResults.length,
    denseMatchesCount: denseResults.length,
    hybridMode: 'hybrid_rrf',
    executionTimeMs: {
      total: Date.now() - overallStart,
      lexicalMs,
      denseMs,
      fusionMs,
    },
  };
}

