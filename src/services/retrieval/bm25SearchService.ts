/**
 * NeuroClass AI — Motor de Busca Lexical e Ranking BM25 Local-First
 * @module services/retrieval/bm25SearchService
 *
 * Implementação rigorosa do algoritmo BM25 (Robertson-Spärck Jones / Okapi BM25)
 * para recuperação e ranking de chunks documentais sem chamadas externas.
 *
 * REGRAS INVIOLÁVEIS:
 * 1. Respeito absoluto ao escopo documental: busca em documento A NUNCA retorna chunk do documento B.
 * 2. Desempate estável e determinístico: Score (desc) -> Página (asc) -> Ordem do chunk (asc) -> chunkId (asc).
 * 3. Chunks sentinela 'scanned_fallback' ou sem texto pesquisável são terminantemente excluídos do ranking.
 * 4. Estatísticas BM25 calculadas estritamente sobre o corpus elegível dentro do escopo consultado.
 * 5. Cada resultado contém evidências rastreáveis a documento, página, seção e offsets exatos.
 */

import {
  tokenizeText,
  tokenizeQuery,
  tokenizeNormalized,
  countTermFrequencies,
  TOKENIZER_VERSION,
  NORMALIZER_VERSION,
} from '../documents/bm25Tokenizer';
import { isProtectedToken } from '../documents/morphologyNormalizer';
import { expandQueryLexical } from './synonymExpansionService';
import {
  saveLexicalIndex,
  getLexicalIndex,
  getAllLexicalIndexes,
} from '../documents/ragLexicalPersistenceService';
import { getDocumentChunks } from '../documents/ragPersistenceService';
import type {
  StoredDocumentChunk,
  StoredLexicalIndex,
  ChunkLexicalSummary,
  LexicalPosting,
  Bm25SearchOptions,
  Bm25SearchResult,
  Bm25QueryResponse,
} from '../../types/rag';

export const BM25_ENGINE_VERSION = '1.0.0';
export const DEFAULT_K1 = 1.2;
export const DEFAULT_B = 0.75;

/**
 * Constrói o índice lexical invertido e metadados estatísticos para os chunks de um documento.
 */
export function buildDocumentLexicalIndex(
  documentId: string,
  chunks: StoredDocumentChunk[],
  options?: { pipelineVersion?: string; normalizeMorphology?: boolean }
): StoredLexicalIndex {
  if (!documentId) {
    throw new Error('[BM25 Indexer] documentId obrigatório para construir índice.');
  }

  const pipelineVer = options?.pipelineVersion || chunks[0]?.pipelineVersion || '1.0.0';
  const normalizeMorphology = options?.normalizeMorphology ?? true;

  // Chunks sentinela (OCR pendente) ou vazios não entram no índice invertido pesquisável
  const eligibleChunks = chunks.filter(
    (c) => c.contentKind !== 'scanned_fallback' && c.text && c.text.trim().length > 0
  );

  const chunkSummaries: Record<string, ChunkLexicalSummary> = {};
  const postings: Record<string, LexicalPosting[]> = {};
  let totalTokens = 0;

  for (const chunk of eligibleChunks) {
    const rawTokens = tokenizeText(chunk.text);
    const rawTfMap = countTermFrequencies(rawTokens);
    const tokenCount = rawTokens.length;
    totalTokens += tokenCount;

    chunkSummaries[chunk.chunkId] = {
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      pageNumber: chunk.pageNumber,
      tokenCount,
      contentHash: chunk.contentHash,
      contentKind: chunk.contentKind,
    };

    // Indexa tokens literais exatos para compatibilidade plena e consultas exatas
    for (const [term, tf] of rawTfMap.entries()) {
      if (!postings[term]) {
        postings[term] = [];
      }
      postings[term].push({
        chunkId: chunk.chunkId,
        termFrequency: tf,
      });
    }

    // Indexa formas lematizadas/radicalizadas RSLP se normalização morfológica habilitada
    if (normalizeMorphology) {
      const stemTokens = tokenizeNormalized(chunk.text, { normalizeMorphology: true });
      const stemTfMap = countTermFrequencies(stemTokens);

      for (const [stem, tf] of stemTfMap.entries()) {
        if (!postings[stem]) {
          postings[stem] = [{ chunkId: chunk.chunkId, termFrequency: tf }];
        } else {
          const existing = postings[stem].find((p) => p.chunkId === chunk.chunkId);
          if (existing) {
            existing.termFrequency = tf;
          } else {
            postings[stem].push({
              chunkId: chunk.chunkId,
              termFrequency: tf,
            });
          }
        }
      }
    }
  }

  const totalChunks = eligibleChunks.length;
  const averageChunkLength = totalChunks > 0 ? totalTokens / totalChunks : 0;
  const vocabularySize = Object.keys(postings).length;

  return {
    documentId,
    docId: documentId,
    pipelineVersion: pipelineVer,
    tokenizerVersion: TOKENIZER_VERSION,
    normalizerVersion: normalizeMorphology ? NORMALIZER_VERSION : 'none',
    totalChunks,
    totalTokens,
    averageChunkLength,
    indexedAt: Date.now(),
    chunkSummaries,
    postings,
    vocabularySize,
  };
}

/**
 * Constrói e persiste o índice lexical de um documento no IndexedDB de forma idempotente.
 */
export async function indexDocumentLexical(
  documentId: string,
  chunks: StoredDocumentChunk[],
  options?: { pipelineVersion?: string; normalizeMorphology?: boolean }
): Promise<StoredLexicalIndex> {
  const index = buildDocumentLexicalIndex(documentId, chunks, options);
  await saveLexicalIndex(index);
  return index;
}

/**
 * Verifica se um índice lexical possui versão de normalizador compatível com a atual.
 */
export function isIndexMorphologyCompatible(
  index: StoredLexicalIndex,
  expectedNormalizerVersion = NORMALIZER_VERSION
): boolean {
  if (!index) return false;
  return index.normalizerVersion === expectedNormalizerVersion;
}

/**
 * Calcula o Inverse Document Frequency (IDF) Robertson-Spärck Jones não-negativo.
 * Fórmula: ln(1 + (N - n(t) + 0.5) / (n(t) + 0.5))
 * Garante sempre IDF >= 0 para qualquer frequência de documento.
 */
export function calculateRobertsonIdf(totalDocsInCorpus: number, docFrequency: number): number {
  if (totalDocsInCorpus <= 0 || docFrequency <= 0) {
    return 0;
  }
  const numerator = totalDocsInCorpus - docFrequency + 0.5;
  const denominator = docFrequency + 0.5;
  const idf = Math.log(1 + Math.max(0, numerator / denominator));
  return Number.isFinite(idf) ? idf : 0;
}

/**
 * Calcula o peso de frequência do termo com normalização por comprimento do chunk.
 */
export function calculateTfWeight(
  termFreq: number,
  chunkLength: number,
  avgChunkLength: number,
  k1 = DEFAULT_K1,
  b = DEFAULT_B
): number {
  if (termFreq <= 0) return 0;
  const safeAvgdl = avgChunkLength > 0 ? avgChunkLength : 1;
  const lengthNorm = 1 - b + b * (chunkLength / safeAvgdl);
  const tfWeight = (termFreq * (k1 + 1)) / (termFreq + k1 * lengthNorm);
  return Number.isFinite(tfWeight) ? tfWeight : 0;
}

/**
 * Executa uma consulta lexical BM25 contra o índice local persistido no IndexedDB.
 */
export async function searchBM25(
  query: string,
  options?: Bm25SearchOptions
): Promise<Bm25QueryResponse> {
  const startTime = Date.now();
  const k1 = options?.k1 ?? DEFAULT_K1;
  const b = options?.b ?? DEFAULT_B;
  const k3 = options?.k3;
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0;

  // 1. Tratamento de consulta vazia ou nula
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      query: query || '',
      queryTokens: [],
      results: [],
      totalMatches: 0,
      corpusStats: { totalChunks: 0, avgChunkLength: 0, scopedDocuments: [] },
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 2. Tokenização simétrica da consulta
  const normalizeMorphology = options?.normalizeMorphology ?? true;
  const autoRebuild = options?.autoRebuildIncompatible ?? false;

  let queryTokens = tokenizeNormalized(query, {
    removeStopwords: options?.removeStopwords ?? false,
    normalizeMorphology,
  });
  // Fallback para tokenização completa se a remoção de stopwords esvaziar a consulta
  if (queryTokens.length === 0 && options?.removeStopwords) {
    queryTokens = tokenizeNormalized(query, { removeStopwords: false, normalizeMorphology });
  }
  if (queryTokens.length === 0) {
    return {
      query,
      queryTokens: [],
      results: [],
      totalMatches: 0,
      corpusStats: { totalChunks: 0, avgChunkLength: 0, scopedDocuments: [] },
      executionTimeMs: Date.now() - startTime,
    };
  }

  const queryTfMap = countTermFrequencies(queryTokens);
  const uniqueQueryTerms = Array.from(queryTfMap.keys());

  // Expansão lexical controlada por sinônimos técnicos (Missão R1)
  const enableSynonymExpansion = options?.enableSynonymExpansion ?? true;
  const boostStructuredBlocks = options?.boostStructuredBlocks ?? true;
  const synonymTermWeights = new Map<string, number>();

  if (enableSynonymExpansion) {
    const expansion = expandQueryLexical(query);
    for (const expTerm of expansion.expandedTerms) {
      const expTokens = tokenizeNormalized(expTerm, {
        removeStopwords: options?.removeStopwords ?? false,
        normalizeMorphology,
      });
      for (const t of expTokens) {
        if (!uniqueQueryTerms.includes(t)) {
          uniqueQueryTerms.push(t);
          queryTfMap.set(t, 1);
          synonymTermWeights.set(t, 0.85);
        }
      }
    }
  }

  // 3. Resolução do escopo documental
  let scopedIndexes: StoredLexicalIndex[] = [];
  let scopedDocIds: string[] = [];

  if (options?.documentId) {
    scopedDocIds = [options.documentId];
    const idx = await getLexicalIndex(options.documentId);
    if (idx) scopedIndexes.push(idx);
  } else if (options?.documentIds && options.documentIds.length > 0) {
    scopedDocIds = options.documentIds;
    for (const docId of options.documentIds) {
      const idx = await getLexicalIndex(docId);
      if (idx) scopedIndexes.push(idx);
    }
  } else {
    scopedIndexes = await getAllLexicalIndexes();
    scopedDocIds = scopedIndexes.map((i) => i.documentId);
  }

  // 3.1 Verificação controlada de compatibilidade de versão do índice (Missão E1)
  if (normalizeMorphology && scopedIndexes.length > 0) {
    for (let i = 0; i < scopedIndexes.length; i++) {
      const idx = scopedIndexes[i];
      if (!isIndexMorphologyCompatible(idx)) {
        if (autoRebuild) {
          const docChunks = await getDocumentChunks(idx.documentId);
          if (docChunks && docChunks.length > 0) {
            const rebuiltIdx = await indexDocumentLexical(idx.documentId, docChunks, {
              normalizeMorphology: true,
            });
            scopedIndexes[i] = rebuiltIdx;
          }
        }
      }
    }
  }

  if (scopedIndexes.length === 0) {
    return {
      query,
      queryTokens,
      results: [],
      totalMatches: 0,
      corpusStats: { totalChunks: 0, avgChunkLength: 0, scopedDocuments: scopedDocIds },
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 4. Estatísticas consolidadas do corpus filtrado no escopo solicitado
  let totalChunksInCorpus = 0;
  let totalTokensInCorpus = 0;
  for (const idx of scopedIndexes) {
    totalChunksInCorpus += idx.totalChunks;
    totalTokensInCorpus += idx.totalTokens;
  }

  const avgChunkLength =
    totalChunksInCorpus > 0 ? totalTokensInCorpus / totalChunksInCorpus : 1;

  if (totalChunksInCorpus === 0) {
    return {
      query,
      queryTokens,
      results: [],
      totalMatches: 0,
      corpusStats: { totalChunks: 0, avgChunkLength: 0, scopedDocuments: scopedDocIds },
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 5. Cálculo do Document Frequency (n(t)) e IDF por termo no corpus elegível
  const idfMap = new Map<string, number>();
  for (const term of uniqueQueryTerms) {
    let chunksContainingTerm = 0;
    for (const idx of scopedIndexes) {
      const pList = idx.postings[term];
      if (pList) {
        chunksContainingTerm += pList.length;
      }
    }
    const idf = calculateRobertsonIdf(totalChunksInCorpus, chunksContainingTerm);
    idfMap.set(term, idf);
  }

  // 6. Acumulação de scores por chunk elegível
  interface CandidateAccumulator {
    chunkId: string;
    documentId: string;
    pageNumber: number;
    score: number;
    matchedTerms: string[];
    termScores: Record<string, number>;
  }

  const candidateMap = new Map<string, CandidateAccumulator>();

  for (const idx of scopedIndexes) {
    for (const term of uniqueQueryTerms) {
      const pList = idx.postings[term];
      if (!pList || pList.length === 0) continue;

      const idf = idfMap.get(term) || 0;
      if (idf <= 0) continue;

      const qtf = queryTfMap.get(term) || 1;
      const qtfFactor =
        k3 !== undefined && k3 > 0 ? (qtf * (k3 + 1)) / (qtf + k3) : qtf;

      for (const posting of pList) {
        const summary = idx.chunkSummaries[posting.chunkId];
        if (!summary) continue;

        const tfWeight = calculateTfWeight(
          posting.termFrequency,
          summary.tokenCount,
          avgChunkLength,
          k1,
          b
        );

        let structureMultiplier = 1.0;
        if (boostStructuredBlocks) {
          const kind = summary.contentKind;
          if (kind === 'table_markdown') {
            structureMultiplier = 1.15;
          } else if (kind === 'formula_latex') {
            structureMultiplier = 1.20;
          }
          if (isProtectedToken(term)) {
            structureMultiplier *= 1.25;
          }
        }

        const synonymWeight = synonymTermWeights.get(term) ?? 1.0;
        const termScore = idf * tfWeight * qtfFactor * structureMultiplier * synonymWeight;
        if (termScore <= 0 || !Number.isFinite(termScore)) continue;

        let cand = candidateMap.get(posting.chunkId);
        if (!cand) {
          cand = {
            chunkId: posting.chunkId,
            documentId: summary.documentId,
            pageNumber: summary.pageNumber,
            score: 0,
            matchedTerms: [],
            termScores: {},
          };
          candidateMap.set(posting.chunkId, cand);
        }

        cand.score += termScore;
        cand.matchedTerms.push(term);
        cand.termScores[term] = Number(termScore.toFixed(6));
      }
    }
  }

  if (candidateMap.size === 0) {
    return {
      query,
      queryTokens,
      results: [],
      totalMatches: 0,
      corpusStats: { totalChunks: totalChunksInCorpus, avgChunkLength, scopedDocuments: scopedDocIds },
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 7. Hidratação dos chunks reais e aplicação de filtros opcionais
  const candidateList = Array.from(candidateMap.values()).filter((c) => c.score >= minScore);

  // Agrupa chunks por documento para buscar em lote
  const chunksByDoc = new Map<string, StoredDocumentChunk[]>();
  for (const cand of candidateList) {
    if (!chunksByDoc.has(cand.documentId)) {
      const docChunks = await getDocumentChunks(cand.documentId);
      chunksByDoc.set(cand.documentId, docChunks);
    }
  }

  const hydratedResults: Bm25SearchResult[] = [];

  for (const cand of candidateList) {
    const docChunks = chunksByDoc.get(cand.documentId) || [];
    const chunk = docChunks.find((c) => c.chunkId === cand.chunkId);
    if (!chunk) continue;

    // Exclusão estrita de sentinelas OCR ou chunks sem texto
    if (chunk.contentKind === 'scanned_fallback' || !chunk.text || chunk.text.trim().length === 0) {
      continue;
    }

    // Filtros opcionais consistentes
    if (options?.filterPage !== undefined && chunk.pageNumber !== options.filterPage) {
      continue;
    }
    if (
      options?.filterSection !== undefined &&
      chunk.sourceRef.sectionTitle !== options.filterSection
    ) {
      continue;
    }

    hydratedResults.push({
      documentId: chunk.documentId,
      docId: chunk.docId || chunk.documentId,
      chunkId: chunk.chunkId,
      text: chunk.text,
      normalizedSearchText: chunk.normalizedSearchText,
      score: Number(cand.score.toFixed(6)),
      matchedTerms: cand.matchedTerms,
      termScores: cand.termScores,
      pageNumber: chunk.pageNumber,
      chunkIndexInPage: chunk.chunkIndexInPage,
      sectionTitle: chunk.sourceRef.sectionTitle,
      sectionHierarchy: chunk.sourceRef.sectionHierarchy,
      charOffsetStart: chunk.sourceRef.charOffsetStart,
      charOffsetEnd: chunk.sourceRef.charOffsetEnd,
      sourceRef: chunk.sourceRef,
      contentHash: chunk.contentHash,
      contentKind: chunk.contentKind,
      indexVersion: BM25_ENGINE_VERSION,
    });
  }

  // 8. Desempate determinístico rigoroso:
  // Score (desc) -> pageNumber (asc) -> chunkIndexInPage (asc) -> chunkId (asc)
  hydratedResults.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-6) {
      return scoreDiff;
    }
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber;
    }
    if (a.chunkIndexInPage !== b.chunkIndexInPage) {
      return a.chunkIndexInPage - b.chunkIndexInPage;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });

  const slicedResults = hydratedResults.slice(0, topK);

  return {
    query,
    queryTokens,
    results: slicedResults,
    totalMatches: hydratedResults.length,
    corpusStats: {
      totalChunks: totalChunksInCorpus,
      avgChunkLength: Number(avgChunkLength.toFixed(2)),
      scopedDocuments: scopedDocIds,
    },
    executionTimeMs: Date.now() - startTime,
  };
}

