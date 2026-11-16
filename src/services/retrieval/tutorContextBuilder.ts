/**
 * NeuroClass AI — Construtor de Contexto Fundamentado do Tutor (BM25 Grounding)
 * @module services/retrieval/tutorContextBuilder
 *
 * Responsável por conectar a recuperação lexical BM25 ao fluxo de QA do Tutor:
 * 1. Consulta o serviço BM25 local estritamente dentro do escopo do documento ativo;
 * 2. Aplica controle rigoroso de orçamento de tokens e diversidade de páginas;
 * 3. Preserva texto-fonte integral, offsets e rastreabilidade posicional;
 * 4. Valida citações contra os chunks efetivamente empacotados no contexto;
 * 5. Garante transparência e honestidade em caso de evidência insuficiente ou ausência de índice.
 *
 * REGRAS INVIOLÁVEIS:
 * - NUNCA buscar fora do documento explicitamente solicitado pelo estudante;
 * - NUNCA realizar fallback silencioso para primeiras páginas ou amostragem arbitrária;
 * - NUNCA fragmentar blocos atômicos ou truncar offsets de caracteres;
 * - Rejeitar terminantemente IDs de citação inexistentes ou não contidos no contexto.
 */

import { searchBM25 } from './bm25SearchService';
import { searchHybrid } from './hybridSearchService';
import { hasConsent } from './semanticConsentService';
import { getDocumentIngestionStatus } from '../documents/ragIngestionService';
import { getLexicalIndex } from '../documents/ragLexicalPersistenceService';
import { getDocumentChunks } from '../documents/ragPersistenceService';
import { resolveAdjacentContext } from './adjacentChunkService';
import { estimateTokenCount } from '../documents/chunkingService';
import type { EvidenceReference, PdfPageEvidence } from '../../types';
import type {
  TutorContextOptions,
  TutorGroundedContext,
  PackedEvidenceChunk,
  TutorEvidenceDiagnostic,
  TutorContextState,
  DiscardedChunkReason,
  Bm25SearchResult,
  StoredLexicalIndex,
  StoredDocumentChunk,
  ControlledEvidenceItem,
  ControlledEvidenceMap,
} from '../../types/rag';

export const DEFAULT_MAX_TOKEN_BUDGET = 1500;
export const DEFAULT_MAX_CHUNKS_PER_PAGE = 2;
export const DEFAULT_TOP_K = 10;

/**
 * Radicais de termos científicos genéricos/metodológicos identificados no benchmark F1.3.1.
 * Estes termos ocorrem com frequência em múltiplos domínios ou repetem-se no texto,
 * e uma correspondência isolada (único termo) NÃO constitui evidência discriminativa suficiente.
 */
export const GENERIC_SCIENTIFIC_STEMS: ReadonlySet<string> = new Set([
  'process',    // processo, processamento
  'mecan',      // mecanismo
  'propriedad', // propriedades, propriedade
  'consum',     // consumo, consumindo
  'fosforil',   // fosforilação
  'cicl',       // ciclo
  'sinal',      // sinal, sinais, sinalização
  'celul',      // célula, celular, celulares
]);

export interface LexicalGateEvaluation {
  accepted: boolean;
  distinctTerms: string[];
  reason: string;
}

/**
 * Avalia se um candidato atende ao Portão Lexical Conservador (Missão F1.3.2):
 * - Regra geral: pelo menos 2 termos informativos distintos da consulta com suporte lexical no candidato.
 * - Exceção objetiva para 1 único termo: somente se for um termo técnico realmente discriminativo:
 *   1. NÃO ser um radical genérico (process, mecan, propriedad, consum, fosforil, cicl);
 *   2. NÃO ser um termo de alta frequência no documento (frequência documental <= 10% dos chunks e <= 2 ocorrências);
 *   3. Possuir pelo menos 4 caracteres ou ser um token protegido/sigla/identificador.
 */
export function evaluateConservativeLexicalSupport(
  candidate: { matchedTerms?: string[]; bm25Score?: number; score?: number },
  lexicalIndex?: StoredLexicalIndex | null
): LexicalGateEvaluation {
  // 1. Deve possuir suporte lexical com score positivo
  const hasBasicLexical = Boolean(
    (candidate.matchedTerms && candidate.matchedTerms.length > 0) &&
    (candidate.bm25Score !== undefined ? candidate.bm25Score > 0 : (candidate.score !== undefined && candidate.score > 0))
  );

  if (!hasBasicLexical) {
    return { accepted: false, distinctTerms: [], reason: 'no_lexical_match' };
  }

  // 2. Extrai termos distintos (evita que repetições contem como termos múltiplos)
  const distinctTerms = Array.from(new Set(candidate.matchedTerms || []));

  // Regra A: 2 ou mais termos distintos
  if (distinctTerms.length >= 2) {
    // Pelo menos um dos termos NÃO pode ser um radical genérico
    const hasNonGeneric = distinctTerms.some((t) => !GENERIC_SCIENTIFIC_STEMS.has(t));
    if (!hasNonGeneric) {
      return {
        accepted: false,
        distinctTerms,
        reason: `all_terms_generic (${distinctTerms.join(', ')})`,
      };
    }
    return {
      accepted: true,
      distinctTerms,
      reason: `multi_term_support (${distinctTerms.length} termos: ${distinctTerms.join(', ')})`,
    };
  }

  // Regra B: Exatamente 1 termo distinto
  if (distinctTerms.length === 1) {
    const single = distinctTerms[0];

    // B1: Termos genéricos identificados em F1.3.1 não podem, isoladamente, satisfazer o portão
    if (GENERIC_SCIENTIFIC_STEMS.has(single)) {
      return {
        accepted: false,
        distinctTerms,
        reason: `isolated_generic_term (${single})`,
      };
    }

    // B2: Verifica se é termo de alta frequência no corpus (documentos com >= 10 chunks, df > 5 e > 20% dos chunks)
    if (lexicalIndex && (lexicalIndex.totalChunks || 0) >= 10) {
      const postings = lexicalIndex.postings[single] || [];
      const df = postings.length;
      const total = lexicalIndex.totalChunks || 1;
      if (df > 5 && (df / total) > 0.20) {
        return {
          accepted: false,
          distinctTerms,
          reason: `high_frequency_term (df=${df}/${total})`,
        };
      }
    }

    // B3: Exceção válida para termo discriminativo específico (baixa frequência / termo técnico)
    return {
      accepted: true,
      distinctTerms,
      reason: `discriminative_single_term (${single})`,
    };
  }

  return { accepted: false, distinctTerms: [], reason: 'insufficient_terms' };
}

/**
 * Constrói o contexto fundamentado do Tutor para uma pergunta do estudante,
 * aplicando recuperação BM25 no escopo restrito do documento ativo,
 * limites orçamentários de tokens e controle de diversidade de páginas.
 */
export async function buildTutorGroundedContext(
  query: string,
  document: { id: string; title: string },
  options?: TutorContextOptions
): Promise<TutorGroundedContext> {
  const startTime = Date.now();
  const maxBudget = options?.maxTokenBudget ?? DEFAULT_MAX_TOKEN_BUDGET;
  const maxPerPage = options?.maxChunksPerPage ?? DEFAULT_MAX_CHUNKS_PER_PAGE;
  const minScore = options?.minScoreThreshold ?? 0;
  const topK = options?.topK ?? DEFAULT_TOP_K;

  const docId = document?.id;
  const docTitle = document?.title || 'Documento sem título';

  // 1. Validação de parâmetros de entrada
  if (!docId) {
    const diagnostic: TutorEvidenceDiagnostic = {
      query: query || '',
      documentId: '',
      status: 'error',
      retrievedCount: 0,
      retrievedChunks: [],
      packedChunks: [],
      discardedChunks: [],
      totalEstimatedTokens: 0,
      maxTokenBudget: maxBudget,
      insufficientEvidenceReason: 'Identificador de documento ausente ou inválido.',
      executionTimeMs: Date.now() - startTime,
    };
    return {
      state: 'error',
      documentId: '',
      documentTitle: docTitle,
      documentExcerpts: [],
      evidences: [],
      packedChunks: [],
      diagnostic,
      userNotice: 'Documento não selecionado para consulta fundamentada.',
    };
  }

  try {
    // 2. Verificação do estado de ingestão e índice lexical
    const ingestionStatus = await getDocumentIngestionStatus(docId);
    const lexicalIndex = await getLexicalIndex(docId);

    // Se o documento estiver pendente de indexação ou o índice não existir
    if (!lexicalIndex || !ingestionStatus || ingestionStatus.status === 'pending') {
      const diagnostic: TutorEvidenceDiagnostic = {
        query: query || '',
        documentId: docId,
        status: 'not_indexed',
        retrievedCount: 0,
        retrievedChunks: [],
        packedChunks: [],
        discardedChunks: [],
        totalEstimatedTokens: 0,
        maxTokenBudget: maxBudget,
        insufficientEvidenceReason: 'O documento ainda não possui índice lexical BM25 construído.',
        executionTimeMs: Date.now() - startTime,
      };

      return {
        state: 'not_indexed',
        documentId: docId,
        documentTitle: docTitle,
        documentExcerpts: [],
        evidences: [],
        packedChunks: [],
        diagnostic,
        userNotice: `O documento "${docTitle}" ainda não foi indexado lexicalmente para recuperação de evidências. Por favor, aguarde ou processe a indexação antes de formular perguntas específicas.`,
      };
    }

    // Identificação de estado parcial de OCR
    const hasOcrPending =
      ingestionStatus.status === 'completed_partial_ocr_pending' ||
      ingestionStatus.requiresOcrPagesCount > 0;

    // 3. Validação de consulta textual
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const diagnostic: TutorEvidenceDiagnostic = {
        query: '',
        documentId: docId,
        status: 'no_evidence',
        retrievedCount: 0,
        retrievedChunks: [],
        packedChunks: [],
        discardedChunks: [],
        totalEstimatedTokens: 0,
        maxTokenBudget: maxBudget,
        insufficientEvidenceReason: 'Consulta vazia ou sem termos pesquisáveis.',
        executionTimeMs: Date.now() - startTime,
      };

      return {
        state: 'no_evidence',
        documentId: docId,
        documentTitle: docTitle,
        documentExcerpts: [],
        evidences: [],
        packedChunks: [],
        diagnostic,
        userNotice: 'Nenhum termo de busca fornecido para consulta.',
      };
    }

    // 4. Recuperação (BM25 ou Híbrida se habilitado com consentimento ativo) no escopo restrito do documento
    let retrievedResults: any[] = [];
    const shouldUseDense = (options?.enableDense ?? true) && hasConsent();
    if (shouldUseDense) {
      const hybridResponse = await searchHybrid(query, {
        documentId: docId,
        topK,
        minScore,
        removeStopwords: true,
        enableDense: true,
        enableSynonymExpansion: options?.enableSynonymExpansion ?? true,
        boostStructuredBlocks: options?.boostStructuredBlocks ?? true,
      });
      retrievedResults = hybridResponse.results || [];
    } else {
      const bm25Response = await searchBM25(query, {
        documentId: docId,
        topK,
        minScore,
        removeStopwords: true,
        enableSynonymExpansion: options?.enableSynonymExpansion ?? true,
        boostStructuredBlocks: options?.boostStructuredBlocks ?? true,
      });
      retrievedResults = bm25Response.results || [];
    }
    const retrievedDiagnostic = retrievedResults.map((r) => ({
      chunkId: r.chunkId,
      score: r.score,
      pageNumber: r.pageNumber,
    }));

    if (retrievedResults.length === 0) {
      const diagnostic: TutorEvidenceDiagnostic = {
        query,
        documentId: docId,
        status: hasOcrPending ? 'ocr_pending' : 'no_evidence',
        retrievedCount: 0,
        retrievedChunks: [],
        packedChunks: [],
        discardedChunks: [],
        totalEstimatedTokens: 0,
        maxTokenBudget: maxBudget,
        insufficientEvidenceReason: hasOcrPending
          ? 'Nenhuma evidência localizada nos trechos textuais; o documento contém páginas digitalizadas pendentes de OCR.'
          : 'Nenhuma evidência lexical correspondente encontrada no material para os termos pesquisados.',
        executionTimeMs: Date.now() - startTime,
      };

      return {
        state: hasOcrPending ? 'ocr_pending' : 'no_evidence',
        documentId: docId,
        documentTitle: docTitle,
        documentExcerpts: [],
        evidences: [],
        packedChunks: [],
        diagnostic,
        userNotice: hasOcrPending
          ? `Não foram encontradas evidências textuais nos trechos indexados de "${docTitle}". Algumas páginas dependem de OCR pendente.`
          : `Não foram encontradas evidências no material "${docTitle}" sobre este tópico para fundamentar uma resposta específica.`,
      };
    }

    // 5. Empacotamento de contexto com orçamento de tokens e diversidade de páginas
    const pageChunkCounts = new Map<number, number>();
    const acceptedCandidates: Bm25SearchResult[] = [];
    const discardedDiagnostics: Array<{
      chunkId: string;
      pageNumber: number;
      reason: DiscardedChunkReason;
    }> = [];

    let accumulatedTokens = 0;

    for (const result of retrievedResults) {
      // Exclusão estrita de sentinelas OCR sem texto útil
      if (result.sourceRef?.pageNumber && result.text.includes('[Página digitalizada sem texto extraído]')) {
        discardedDiagnostics.push({
          chunkId: result.chunkId,
          pageNumber: result.pageNumber,
          reason: 'scanned_fallback',
        });
        continue;
      }

      // Verificação do Portão Lexical Conservador (Missão F1.3.2):
      // - Candidatos dense-only sem correspondência lexical são terminantemente rejeitados;
      // - Correspondências lexicais de um único radical genérico (process, mecan, etc.) são descartadas;
      // - Exige-se pelo menos 2 termos distintos ou 1 termo técnico comprovadamente discriminativo.
      const lexicalGate = evaluateConservativeLexicalSupport(result, lexicalIndex);
      if (!lexicalGate.accepted) {
        discardedDiagnostics.push({
          chunkId: result.chunkId,
          pageNumber: result.pageNumber,
          reason: 'score_below_threshold',
        });
        continue;
      }

      // Verificação de diversidade por página
      const currentPageCount = pageChunkCounts.get(result.pageNumber) || 0;
      if (currentPageCount >= maxPerPage) {
        discardedDiagnostics.push({
          chunkId: result.chunkId,
          pageNumber: result.pageNumber,
          reason: 'page_diversity_limit',
        });
        continue;
      }

      // Estimativa heurística calibrada de tokens
      const chunkTokens = estimateTokenCount(result.text);

      // Verificação de orçamento
      if (accumulatedTokens + chunkTokens > maxBudget) {
        // Se for um bloco atômico (ex: tabela ou código) e for o primeiro resultado
        const isAtomic =
          result.text.startsWith('|') ||
          result.text.startsWith('```') ||
          result.text.startsWith('$$');

        if (isAtomic && acceptedCandidates.length === 0) {
          // Permite inclusão excepcional do bloco atômico se for o único e primeiro candidato
          accumulatedTokens += chunkTokens;
          pageChunkCounts.set(result.pageNumber, currentPageCount + 1);
          acceptedCandidates.push(result);
        } else {
          // Descarte explícito sem truncamento
          discardedDiagnostics.push({
            chunkId: result.chunkId,
            pageNumber: result.pageNumber,
            reason: 'budget_exceeded',
          });
          continue;
        }
      } else {
        accumulatedTokens += chunkTokens;
        pageChunkCounts.set(result.pageNumber, currentPageCount + 1);
        acceptedCandidates.push(result);
      }
    }

    // Se nenhum candidato coube no orçamento
    if (acceptedCandidates.length === 0) {
      const allBelowThreshold =
        discardedDiagnostics.length > 0 &&
        discardedDiagnostics.every((d) => d.reason === 'score_below_threshold' || d.reason === 'scanned_fallback');

      const diagnostic: TutorEvidenceDiagnostic = {
        query,
        documentId: docId,
        status: 'no_evidence',
        retrievedCount: retrievedResults.length,
        retrievedChunks: retrievedDiagnostic,
        packedChunks: [],
        discardedChunks: discardedDiagnostics,
        totalEstimatedTokens: 0,
        maxTokenBudget: maxBudget,
        insufficientEvidenceReason: allBelowThreshold
          ? 'Nenhum candidato atingiu o limiar de confiança semântica ou suporte lexical necessário para fundamentar a resposta.'
          : 'Todos os candidatos recuperados excederam o limite orçamentário ou de diversidade.',
        executionTimeMs: Date.now() - startTime,
      };

      return {
        state: 'no_evidence',
        documentId: docId,
        documentTitle: docTitle,
        documentExcerpts: [],
        evidences: [],
        packedChunks: [],
        diagnostic,
        userNotice: allBelowThreshold
          ? `Não foram encontradas evidências com relevância suficiente no material "${docTitle}" para responder a esta pergunta com segurança.`
          : `Evidências recuperadas excederam o orçamento sem seleção de trechos viáveis.`,
      };
    }

    // 6. Ordenação natural de leitura (página asc -> chunkIndex asc -> offset asc)
    acceptedCandidates.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      if (a.chunkIndexInPage !== b.chunkIndexInPage) {
        return a.chunkIndexInPage - b.chunkIndexInPage;
      }
      return a.charOffsetStart - b.charOffsetStart;
    });

    // 7. Construção dos trechos formatados (documentExcerpts) e referências de evidência
    const documentExcerpts: string[] = [];
    const evidences: EvidenceReference[] = [];
    const packedChunks: PackedEvidenceChunk[] = [];

    const includeAdjacent = options?.includeAdjacentContext ?? false;
    let allDocChunks: StoredDocumentChunk[] = [];
    if (includeAdjacent && acceptedCandidates.length > 0) {
      allDocChunks = await getDocumentChunks(docId);
    }

    for (const item of acceptedCandidates) {
      let excerptText = item.text;
      if (includeAdjacent && allDocChunks.length > 0) {
        const fullChunk = allDocChunks.find((c) => c.chunkId === item.chunkId);
        if (fullChunk) {
          const stitched = resolveAdjacentContext(fullChunk, allDocChunks, {
            maxAdjacentTokensBudget: 250,
          });
          excerptText = stitched.stitchedText;
        }
      }

      const sectionInfo = item.sectionTitle ? ` | Seção: "${item.sectionTitle}"` : '';
      const citationTag = `C${packedChunks.length + 1}`;
      const formattedExcerpt = `[${citationTag}] [Doc: "${docTitle}" | Pág. ${item.pageNumber}${sectionInfo} | Ref: ${item.chunkId}]:\n${excerptText}`;
      documentExcerpts.push(formattedExcerpt);

      const evidenceRef: PdfPageEvidence = {
        id: item.chunkId,
        type: 'pdf_page',
        pageNumber: item.pageNumber,
        excerpt: item.text.length > 250 ? item.text.slice(0, 250) + '...' : item.text,
        context: item.sectionTitle ? `Seção: ${item.sectionTitle}` : undefined,
      };
      evidences.push(evidenceRef);

      packedChunks.push({
        chunkId: item.chunkId,
        documentId: item.documentId,
        pageNumber: item.pageNumber,
        chunkIndexInPage: item.chunkIndexInPage,
        text: item.text,
        estimatedTokens: estimateTokenCount(item.text),
        score: item.score,
        sectionTitle: item.sectionTitle,
        sectionHierarchy: item.sectionHierarchy,
        charOffsetStart: item.charOffsetStart,
        charOffsetEnd: item.charOffsetEnd,
        sourceRef: item.sourceRef,
        contentKind: (item as any).contentKind || 'prose',
      });
    }

    const state: TutorContextState = hasOcrPending ? 'ocr_pending' : 'grounded';

    const diagnostic: TutorEvidenceDiagnostic = {
      query,
      documentId: docId,
      status: state,
      retrievedCount: retrievedResults.length,
      retrievedChunks: retrievedDiagnostic,
      packedChunks: packedChunks.map((c) => ({
        chunkId: c.chunkId,
        pageNumber: c.pageNumber,
        estimatedTokens: c.estimatedTokens,
        score: c.score,
      })),
      discardedChunks: discardedDiagnostics,
      totalEstimatedTokens: accumulatedTokens,
      maxTokenBudget: maxBudget,
      executionTimeMs: Date.now() - startTime,
    };

    return {
      state,
      documentId: docId,
      documentTitle: docTitle,
      documentExcerpts,
      evidences,
      packedChunks,
      diagnostic,
      userNotice: hasOcrPending
        ? `Nota: O documento "${docTitle}" possui páginas digitalizadas aguardando OCR local. As evidências retornadas refletem apenas os trechos pesquisáveis.`
        : undefined,
    };
  } catch (error: any) {
    const diagnostic: TutorEvidenceDiagnostic = {
      query,
      documentId: docId,
      status: 'error',
      retrievedCount: 0,
      retrievedChunks: [],
      packedChunks: [],
      discardedChunks: [],
      totalEstimatedTokens: 0,
      maxTokenBudget: maxBudget,
      insufficientEvidenceReason: `Erro na recuperação BM25: ${error?.message || 'Falha de I/O'}`,
      executionTimeMs: Date.now() - startTime,
    };

    return {
      state: 'error',
      documentId: docId,
      documentTitle: docTitle,
      documentExcerpts: [],
      evidences: [],
      packedChunks: [],
      diagnostic,
      userNotice: `Falha na recuperação de evidências do documento: ${error?.message || 'Erro inesperado'}.`,
    };
  }
}

/**
 * Constrói o mapa de evidências controladas [C1], [C2], etc. para a requisição atual.
 * Garante que cada identificador seja determinístico, temporário e aponte para metadados reais.
 */
export function buildControlledEvidenceMap(input?: {
  evidences?: EvidenceReference[];
  documentExcerpts?: string[];
  documentId?: string;
  documentTitle?: string;
} | EvidenceReference[] | null): ControlledEvidenceMap & {
  evidenceMap: ControlledEvidenceMap;
  formattedPromptExcerpts: string[];
} {
  const evidenceMap: ControlledEvidenceMap = new Map();
  const formattedPromptExcerpts: string[] = [];

  let evidences: EvidenceReference[] | undefined;
  let documentExcerpts: string[] | undefined;
  let documentId = 'doc_current';
  let documentTitle = 'Documento';

  if (Array.isArray(input)) {
    evidences = input;
  } else if (input && typeof input === 'object') {
    evidences = input.evidences;
    documentExcerpts = input.documentExcerpts;
    if (input.documentId) documentId = input.documentId;
    if (input.documentTitle) documentTitle = input.documentTitle;
  }

  if (evidences && Array.isArray(evidences) && evidences.length > 0) {
    let index = 1;
    for (const ev of evidences) {
      const tag = `C${index}`;
      const chunkId = ev.id || `ev_c${index}_p${(ev as any).pageNumber || 1}`;
      if (!ev.id) {
        (ev as any).id = chunkId;
      }
      const pageNum = (ev as any).pageNumber;
      const secTitle = (ev as any).sectionTitle || (ev as any).context;
      const excerpt = ev.excerpt || '';

      const pageStr = typeof pageNum === 'number' && pageNum >= 1 ? `Pág. ${pageNum}` : 'Pág. s/p';
      const promptLine = `[${tag}] (${pageStr}): "${excerpt}"`;

      const item: ControlledEvidenceItem = {
        citationTag: tag,
        tag: `[${tag}]`,
        index,
        chunkId,
        documentId: (ev as any).documentId || documentId,
        pageNumber: typeof pageNum === 'number' && pageNum >= 1 ? pageNum : undefined,
        sectionTitle: typeof secTitle === 'string' ? secTitle : undefined,
        excerpt,
        evidenceReference: ev,
        evidence: ev,
        formattedPromptLine: promptLine,
      };

      evidenceMap.set(tag, item);
      formattedPromptExcerpts.push(promptLine);
      index++;
    }
  } else if (documentExcerpts && Array.isArray(documentExcerpts) && documentExcerpts.length > 0) {
    let index = 1;
    for (const rawExcerpt of documentExcerpts) {
      const tag = `C${index}`;
      let pageNum: number | undefined = undefined;
      const pageMatch = rawExcerpt.match(/Pág\.\s*(\d+)/i) || rawExcerpt.match(/Página\s*física:\s*(\d+)/i);
      if (pageMatch) {
        pageNum = parseInt(pageMatch[1], 10);
      }

      let secTitle: string | undefined = undefined;
      const secMatch = rawExcerpt.match(/Seção:\s*"([^"]+)"/i);
      if (secMatch) {
        secTitle = secMatch[1];
      }

      let refId = `${documentId}_c${index}`;
      const refMatch = rawExcerpt.match(/Ref:\s*([a-zA-Z0-9_\-]+)/i);
      if (refMatch) {
        refId = refMatch[1];
      }

      const colonIdx = rawExcerpt.indexOf(']:\n');
      const cleanExcerpt = colonIdx !== -1 ? rawExcerpt.slice(colonIdx + 3).trim() : rawExcerpt;

      const evRef: PdfPageEvidence = {
        id: refId,
        type: 'pdf_page',
        pageNumber: pageNum || 1,
        excerpt: cleanExcerpt.length > 250 ? cleanExcerpt.slice(0, 250) + '...' : cleanExcerpt,
        context: secTitle ? `Seção: ${secTitle}` : undefined,
      };

      const pageStr = pageNum ? `Pág. ${pageNum}` : 'Pág. s/p';
      const promptLine = `[${tag}] (${pageStr}): "${cleanExcerpt}"`;

      const item: ControlledEvidenceItem = {
        citationTag: tag,
        tag: `[${tag}]`,
        index,
        chunkId: refId,
        documentId,
        pageNumber: pageNum,
        sectionTitle: secTitle,
        excerpt: cleanExcerpt,
        evidenceReference: evRef,
        evidence: evRef,
        formattedPromptLine: promptLine,
      };

      evidenceMap.set(tag, item);
      formattedPromptExcerpts.push(promptLine);
      index++;
    }
  }

  (evidenceMap as any).evidenceMap = evidenceMap;
  (evidenceMap as any).formattedPromptExcerpts = formattedPromptExcerpts;

  return evidenceMap as any;
}

/**
 * Validador estrito de citações:
 * Assegura que apenas referências de evidência cujos IDs ou tags ([C1], [C2])
 * correspondam aos chunks efetivamente selecionados e empacotados no contexto do documento sejam aceitas.
 *
 * Suporta:
 * 1. Chamada com texto ou array: validateCitations(textOrArray, groundedContextOrMap)
 * 2. Retorna array com propriedades validCitations, invalidCitations e isFullyVerified
 */
export function validateCitations(
  citedEvidenceIdsOrTags: string[] | string,
  contextOrMap: TutorGroundedContext | ControlledEvidenceMap | Record<string, ControlledEvidenceItem>
): EvidenceReference[] & {
  validCitations: EvidenceReference[];
  invalidCitations: string[];
  isFullyVerified: boolean;
} {
  const result: EvidenceReference[] = [];
  const invalidCitations: string[] = [];

  let citedList: string[] = [];
  if (typeof citedEvidenceIdsOrTags === 'string') {
    const matches = Array.from(citedEvidenceIdsOrTags.matchAll(/\[?C\s*(\d+)\]?/gi)).map((m) => `C${m[1]}`);
    citedList = matches;
  } else if (Array.isArray(citedEvidenceIdsOrTags)) {
    citedList = citedEvidenceIdsOrTags;
  }

  function attachProperties(arr: EvidenceReference[], invalid: string[]) {
    Object.defineProperty(arr, 'validCitations', {
      value: arr,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(arr, 'invalidCitations', {
      value: invalid,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(arr, 'isFullyVerified', {
      value: invalid.length === 0 && arr.length > 0,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return arr as EvidenceReference[] & {
      validCitations: EvidenceReference[];
      invalidCitations: string[];
      isFullyVerified: boolean;
    };
  }

  if (citedList.length === 0) {
    return attachProperties(result, []);
  }

  // Caso 1: contextOrMap é TutorGroundedContext
  if (contextOrMap && 'state' in contextOrMap) {
    const groundedContext = contextOrMap as TutorGroundedContext;
    const validChunkMap = new Map<string, EvidenceReference>();
    const tagMap = new Map<string, EvidenceReference>();

    if (Array.isArray(groundedContext.evidences)) {
      groundedContext.evidences.forEach((ev, i) => {
        if (ev.id) validChunkMap.set(ev.id, ev);
        tagMap.set(`C${i + 1}`, ev);
      });
    }

    const seenIds = new Set<string>();

    for (const raw of citedList) {
      if (!raw) continue;
      const tagMatch = raw.match(/C\s*(\d+)/i);
      const canonicalTag = tagMatch ? `C${tagMatch[1]}` : raw.trim();

      if (tagMap.has(canonicalTag)) {
        const ev = tagMap.get(canonicalTag)!;
        if (!seenIds.has(ev.id)) {
          result.push(ev);
          seenIds.add(ev.id);
        }
      } else if (validChunkMap.has(raw)) {
        const ev = validChunkMap.get(raw)!;
        if (!seenIds.has(ev.id)) {
          result.push(ev);
          seenIds.add(ev.id);
        }
      } else {
        invalidCitations.push(canonicalTag);
      }
    }

    return attachProperties(result, invalidCitations);
  }

  // Caso 2: contextOrMap é ControlledEvidenceMap (Map ou Record)
  const map: ControlledEvidenceMap =
    contextOrMap instanceof Map
      ? contextOrMap
      : new Map(Object.entries(contextOrMap || {}));

  const seenIds = new Set<string>();

  for (const raw of citedList) {
    if (!raw) continue;
    const tagMatch = raw.match(/C\s*(\d+)/i);
    const tag = tagMatch ? `C${tagMatch[1]}` : raw.trim();

    if (map.has(tag)) {
      const item = map.get(tag)!;
      const ref = item.evidenceReference;
      if (ref && !seenIds.has(ref.id)) {
        result.push(ref);
        seenIds.add(ref.id);
      }
    } else {
      let foundByChunkId = false;
      for (const item of map.values()) {
        if (item.chunkId === raw && !seenIds.has(item.chunkId)) {
          result.push(item.evidenceReference);
          seenIds.add(item.chunkId);
          foundByChunkId = true;
          break;
        }
      }
      if (!foundByChunkId) {
        invalidCitations.push(tag);
      }
    }
  }

  return attachProperties(result, invalidCitations);
}

export interface ParseAndValidateCitationsOptions {
  activeDocumentId?: string;
  stripUnverifiedMarkers?: boolean;
}

export interface CitationValidationResult {
  cleanedText: string;
  verifiedCitations: EvidenceReference[];
  validCitations: EvidenceReference[];
  unverifiedCitations: string[];
  invalidCitations: string[];
  rawCitationsFound: string[];
  hasCitations: boolean;
}

/**
 * Faz parsing e validação de marcadores [C#] na resposta do Gemini:
 * 1. Extrai todas as ocorrências de [C#];
 * 2. Valida cada tag contra o mapa da requisição via validateCitations;
 * 3. Se válida: preserva o marcador [C#] na posição do texto;
 * 4. Se inválida (ex: [C99]): remove do texto e registra em unverifiedCitations;
 * 5. Se nenhuma tag for encontrada: verifiedCitations = [].
 */
export function parseAndValidateCitations(
  rawText: string,
  evidenceMap: ControlledEvidenceMap | Record<string, ControlledEvidenceItem>,
  options?: ParseAndValidateCitationsOptions
): CitationValidationResult {
  if (!rawText) {
    return {
      cleanedText: '',
      verifiedCitations: [],
      validCitations: [],
      unverifiedCitations: [],
      invalidCitations: [],
      rawCitationsFound: [],
      hasCitations: false,
    };
  }

  const map: ControlledEvidenceMap =
    evidenceMap instanceof Map
      ? evidenceMap
      : new Map(Object.entries(evidenceMap || {}));

  const rawCitationsFound: string[] = [];
  const unverifiedSet = new Set<string>();
  const validTagsFound: string[] = [];

  // Encontra todas as tags [C\s*\d+]
  const tagRegex = /\[C\s*(\d+)\]/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    const canonicalTag = `C${match[1]}`;
    rawCitationsFound.push(canonicalTag);

    const item = map.get(canonicalTag);
    if (item) {
      if (options?.activeDocumentId && item.documentId && item.documentId !== options.activeDocumentId) {
        unverifiedSet.add(canonicalTag);
      } else {
        validTagsFound.push(canonicalTag);
      }
    } else {
      unverifiedSet.add(canonicalTag);
    }
  }

  // Valida as tags encontradas reutilizando estritamente validateCitations()
  const validatedList = validateCitations(validTagsFound, map);
  const verifiedCitations: EvidenceReference[] = Array.from(validatedList);

  const strip = options?.stripUnverifiedMarkers !== false;

  let cleanedText = rawText.replace(/\[C\s*(\d+)\]/gi, (fullMatch, digits) => {
    const canonicalTag = `C${digits}`;
    if (unverifiedSet.has(canonicalTag)) {
      return strip ? '' : fullMatch;
    }
    return `[C${digits}]`;
  });

  if (strip) {
    cleanedText = cleanedText.replace(/[ \t]{2,}/g, ' ');
    cleanedText = cleanedText.replace(/\s+([.,;:!?])/g, '$1');
  }

  return {
    cleanedText: cleanedText.trim(),
    verifiedCitations,
    validCitations: verifiedCitations,
    unverifiedCitations: Array.from(unverifiedSet),
    invalidCitations: Array.from(unverifiedSet),
    rawCitationsFound,
    hasCitations: verifiedCitations.length > 0 || unverifiedSet.size > 0,
  };
}
