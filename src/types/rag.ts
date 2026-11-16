/**
 * NeuroClass AI — Contratos de Dados do Domínio RAG (Retrieval-Augmented Generation)
 * @module types/rag
 *
 * Especificação formal de tipos para segmentação estruturada (chunking),
 * rastreabilidade de evidências, fidelidade texto/offset, persistência local
 * de chunks e observabilidade documental.
 *
 * UNIDADE FORMAL DE INDEXAÇÃO DE OFFSETS:
 * Todos os offsets (charOffsetStart, charOffsetEnd, startOffset, endOffset) são
 * expressos estritamente em unidades de código UTF-16 (JavaScript UTF-16 code units),
 * correspondendo de maneira 1:1 a string.length e string.slice(start, end).
 * Isso garante compatibilidade perfeita e sem overhead com PDF.js, DOM, Canvas e V8.
 */

import type { DocumentSource, DocumentPage, TableOfContentsItem, EvidenceReference } from './index';

/**
 * Classificação estrutural e semântica do conteúdo contido no chunk.
 */
export type ChunkContentKind =
  | 'prose'               // Parágrafo contínuo de texto acadêmico/científico
  | 'heading'             // Título ou subtítulo de seção com nível hierárquico
  | 'list'                // Lista ordenada ou com marcadores
  | 'table_markdown'      // Bloco de tabela estruturada em Markdown ou formato tabular
  | 'formula_latex'       // Equação ou expressão matemática em formato LaTeX (inline ou display)
  | 'figure_caption'      // Legenda descritiva de figura, esquema ou imagem
  | 'chart_description'   // Análise ou descrição estruturada de gráfico/eixos
  | 'code_block'          // Bloco de código-fonte ou pseudocódigo
  | 'footnote'            // Nota de rodapé ou referência bibliográfica
  | 'scanned_fallback';   // Registro de página digitalizada sem camada OCR

/**
 * Rastreabilidade estrita da origem física e posicional do chunk dentro do documento.
 */
export interface ChunkSourceReference {
  /** Identificador do documento de origem */
  documentId: string;
  /** Número da página física original (base 1) */
  pageNumber: number;
  /**
   * Offset de caractere de início na página física original (base 0, inclusivo, em unidades UTF-16).
   * Semântica obrigatória: page.textContent.slice(charOffsetStart, charOffsetEnd) === chunk.text
   */
  charOffsetStart: number;
  /**
   * Offset de caractere final na página física original (exclusivo, em unidades UTF-16).
   */
  charOffsetEnd: number;
  /** Título do capítulo ou seção onde o chunk está inserido (se disponível via TOC ou heading) */
  sectionTitle?: string;
  /** Hierarquia completa de seções (ex: ["Parte I", "Capítulo 2", "Seção 2.1"]) */
  sectionHierarchy?: string[];
}

/**
 * Unidade atômica e determinística de conteúdo indexável para recuperação.
 */
export interface DocumentChunk {
  /**
   * Identificador único, determinístico e estável.
   * Formato: `${documentId}_p${pageNumber}_c${chunkIndexInPage}`
   * ATENÇÃO: Nunca usa hash(texto) como identidade; textos idênticos em páginas
   * diferentes possuem identidades distintas e não colidem logicamente.
   */
  chunkId: string;
  /** Identificador do documento-pai */
  documentId: string;
  /** Número da página física (base 1) */
  pageNumber: number;
  /** Ordem sequencial do chunk dentro da página física (0..M) */
  chunkIndexInPage: number;
  /** Ordem sequencial global do chunk no documento inteiro (0..T-1) */
  globalChunkIndex: number;
  /**
   * Texto-fonte original exato do chunk, sem truncamento silencioso e sem trim().
   * Preserva exatamente espaços, tabs, quebras de linha CRLF/LF, acentos e Unicode.
   * Contrato inviolável: chunk.text === page.textContent.slice(charOffsetStart, charOffsetEnd)
   */
  text: string;
  /**
   * Texto normalizado para indexação lexical e busca (BM25), com espaços colapsados e trim().
   * Campo isolado para não poluir nem modificar o texto-fonte exato.
   */
  normalizedSearchText?: string;
  /** Rastreabilidade de origem e limites de caracteres na fonte */
  sourceRef: ChunkSourceReference;
  /** Classificação do conteúdo */
  contentKind: ChunkContentKind;
  /**
   * Estimativa de tokens do chunk para planejamento de contexto.
   * DECLARAÇÃO FORMAL: Trata-se de estimativa calibrada heurística (não tokenização BPE exata).
   */
  estimatedTokens: number;
  /** Identificação explícita de que a contagem de tokens é uma estimativa heurística */
  isTokenEstimateHeuristic: true;
  /**
   * Sinalização de bloco atômico (tabela, código, display math) que excede maxTokens.
   * O bloco é mantido integral e sem corte; o consumidor de LLM deve consultar esta flag.
   */
  oversizeAtomicBlock?: boolean;
  /** Hash criptográfico SHA-256 (64 hex) do texto-fonte exato do chunk para integridade */
  contentHash: string;
  /** Versão do algoritmo fatiador responsável pela geração (ex: '1.0.0') */
  pipelineVersion: string;
  /** Indica se o texto deste chunk foi derivado de processamento OCR */
  isOcrDerived?: boolean;
  /** Estado de OCR associado a este chunk */
  ocrStatus?: 'not_required' | 'requires_ocr' | 'pending' | 'completed' | 'failed';
  /** Referências a elementos multimodais vizinhos ou contidos neste trecho */
  multimodalReferences?: {
    figureLabels?: string[];
    tableLabels?: string[];
    formulaExpressions?: string[];
    chartLabels?: string[];
  };
  /**
   * Metadado operacional opcional. Não interfere na igualdade matemática
   * do resultado determinístico do chunking.
   */
  createdAt?: number;
}

/**
 * Registro de chunk estruturado persistido no armazenamento local (IndexedDB).
 * Inclui campos de desnormalização convenientes para consultas rápidas.
 */
export interface StoredDocumentChunk extends DocumentChunk {
  /** Identificador canônico do documento (garante chave docId além de documentId) */
  docId: string;
  /** Caminho hierárquico textual da seção (ex: "Parte I > Capítulo 2 > Seção 2.1") */
  sectionPath?: string;
  /** Offset inicial direto na página física (unidades UTF-16 JS) */
  startOffset: number;
  /** Offset final direto na página física (unidades UTF-16 JS) */
  endOffset: number;
  /** Versão das opções de chunking / pipeline utilizadas */
  indexingOptionsVersion: string;
  /** Timestamp de gravação no armazenamento local */
  storedAt: number;
}

/**
 * Opções configuráveis para o fatiador estruturado determinístico.
 */
export interface ChunkingOptions {
  /** Número alvo ideal de tokens por chunk (padrão: 400) */
  targetTokens?: number;
  /** Limite inferior mínimo de tokens para fusão de blocos curtos (padrão: 120) */
  minTokens?: number;
  /** Limite superior máximo de tokens por chunk (padrão: 650) */
  maxTokens?: number;
  /** Overlap de contexto em tokens nominais entre chunks adjacentes (padrão: 60) */
  overlapTokens?: number;
  /** Se verdadeiro, preserva blocos de tabela, LaTeX e código como unidades atômicas (padrão: true) */
  preserveAtomicBlocks?: boolean;
  /** Versão do pipeline para rastreabilidade (padrão: '1.0.0') */
  pipelineVersion?: string;
  /** Timestamp determinístico fixo opcional (para testes de determinismo estrito) */
  deterministicTimestamp?: number;
}

/* ==========================================================================
   TIPOS DE VALIDAÇÃO DE COBERTURA, OFFSETS E SOBREPOSIÇÃO
   ========================================================================== */

export interface OffsetIntegrityViolation {
  chunkId: string;
  pageNumber: number;
  charOffsetStart: number;
  charOffsetEnd: number;
  expectedTextSlice: string;
  actualChunkText: string;
  differenceReason: string;
}

export interface OffsetIntegrityResult {
  isValid: boolean;
  checkedChunksCount: number;
  violations: OffsetIntegrityViolation[];
}

export interface OverlapRange {
  pageNumber: number;
  prevChunkId: string;
  nextChunkId: string;
  overlapStart: number;
  overlapEnd: number;
  overlapChars: number;
  matchedText: boolean;
}

export interface RangeGap {
  pageNumber: number;
  prevChunkId: string;
  nextChunkId: string;
  gapStart: number;
  gapEnd: number;
  gapChars: number;
  gapText: string;
  isWhitespaceOnly: boolean;
}

export interface OverlapIntegrityResult {
  hasOverlap: boolean;
  totalOverlapChars: number;
  maxOverlapChars: number;
  overlaps: OverlapRange[];
  gaps: RangeGap[];
  violations: string[];
}

export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export interface ExactReconstructionResult {
  isExactMatch: boolean;
  coveredCharsCount: number;
  totalPageChars: number;
  coverageRatio: number;
  missingRanges: TextRange[];
  duplicateRangesOutsideOverlap: TextRange[];
}

/**
 * Estado detalhado de cobertura por etapa do processamento documental.
 * Permite auditar separadamente extração, OCR, fatiamento, indexação e multimodalidade.
 */
export interface DetailedProcessingCoverage {
  documentId: string;
  totalPages: number;
  /** Cobertura da extração primária de texto */
  extraction: {
    extractedPagesCount: number;
    extractedPageNumbers: number[];
    emptyPageNumbers: number[];
  };
  /** Estado de processamento de páginas digitalizadas (OCR) */
  ocr: {
    scannedPagesCount: number;
    notRequiredCount: number;
    requiresOcrCount: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
  };
  /** Cobertura do fatiamento (chunking) */
  chunking: {
    totalChunksGenerated: number;
    coveredPagesCount: number;
    coveredPageNumbers: number[];
    averageChunksPerPage: number;
    oversizeChunksCount: number;
  };
  /** Estado da indexação lexical (Missão C) */
  indexing: {
    indexedChunksCount: number;
    isFullyIndexed: boolean;
  };
  /** Elementos multimodais catalogados */
  multimodal: {
    tablesDetected: number;
    formulasDetected: number;
    figuresDetected: number;
    chartsDetected: number;
  };
}

/**
 * Resultado completo da operação de fatiamento determinístico de um documento.
 */
export interface ChunkingResult {
  documentId: string;
  chunks: DocumentChunk[];
  totalChunks: number;
  totalPagesProcessed: number;
  emptyPages: number[];
  coverage: DetailedProcessingCoverage;
  warnings: string[];
  executionMetadata?: {
    executionTimeMs: number;
    processedAt?: string;
  };
  /** Retrocompatibilidade */
  executionTimeMs: number;
}

/**
 * Contrato de metadados do índice documental (especificação de contrato para Missão C).
 */
export interface DocumentIndexMetadata {
  documentId: string;
  pipelineVersion: string;
  indexedAt: number;
  totalChunks: number;
  totalPages: number;
  indexedPages: number[];
  unindexedPages: number[];
  averageChunkTokens: number;
  vocabularySize: number;
  documentFrequencySummary: Record<string, number>;
}

/**
 * Estado de um item na fila de processamento OCR de documentos digitalizados.
 */
export type OcrQueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface OcrQueueItem {
  id: string; // `${documentId}_p${pageNumber}`
  documentId: string;
  pageNumber: number;
  status: OcrQueueStatus;
  retryCount: number;
  maxRetries: number;
  confidenceScore?: number;
  errorMessage?: string;
  enqueuedAt: number;
  processedAt?: number;
}

/* ==========================================================================
   FASE C1: CONTRATOS FORMAIS DE OCR LOCAL E PERSISTÊNCIA
   ========================================================================== */

/**
 * Estado operacional de processamento de OCR por página física.
 */
export type OcrPageProcessingStatus =
  | 'not_required'  // Página já possui texto nativo limpo suficiente
  | 'pending'       // Página digitalizada aguardando processamento
  | 'processing'    // Em reconhecimento local ativo
  | 'completed'     // OCR concluído com texto extraído e persistido
  | 'failed'        // Falha no reconhecimento após exaustão de retries
  | 'cancelled';    // Cancelado pelo usuário durante o processamento

/**
 * Registro de página processada por OCR armazenada no IndexedDB (store: document_ocr_pages).
 */
export interface StoredOcrPage {
  /** Identificador único: `${documentId}_p${pageNumber}` */
  id: string;
  documentId: string;
  pageNumber: number;
  status: OcrPageProcessingStatus;
  /** Texto bruto reconhecido pelo motor OCR local */
  text: string;
  /** Idioma utilizado (padrão 'por' para Português do Brasil) */
  language: string;
  /** Versão e identificador do motor OCR utilizado */
  engineVersion: string;
  /** Score de confiança heurístico calibrado (0 a 100) */
  confidenceScore?: number;
  /** Timestamp de processamento e gravação */
  processedAt: number;
  /** Duração em milissegundos do reconhecimento */
  durationMs?: number;
  /** Detalhamento de erro tipado em caso de falha */
  errorMessage?: string;
  /** Quantidade de retries executados para esta página */
  retryCount: number;
  /** Hash criptográfico SHA-256 do texto extraído para idempotência */
  contentHash: string;
  /** Sinalização de proveniência */
  textSource: 'ocr';
}

/**
 * Estado de consentimento explícito do usuário para download e uso do modelo local.
 */
export interface OcrConsentStatus {
  documentId?: string;
  granted: boolean;
  grantedAt?: number;
  modelLanguage: string; // 'por'
  modelEstimatedSizeBytes: number; // 6_755_162 (~6.8 MB para modelo de idioma Português; ~11 MB total com runtime WASM)
}

/**
 * Relatório granular de progresso do processamento em lotes para a interface.
 */
export interface OcrProgressReport {
  documentId: string;
  totalPages: number;
  requiresOcrCount: number;
  currentPageNumber?: number;
  completedPagesCount: number;
  failedPagesCount: number;
  pendingPagesCount: number;
  status: 'idle' | 'awaiting_consent' | 'downloading_model' | 'processing' | 'completed' | 'partial' | 'cancelled' | 'failed';
  currentOperation?: string;
  percent: number;
}

/**
 * Resultado consolidado da execução de processamento OCR em um documento.
 */
export interface OcrBatchResult {
  documentId: string;
  success: boolean;
  status: 'completed' | 'partial' | 'cancelled' | 'failed';
  totalPages: number;
  scannedPagesCount: number;
  completedPages: number[];
  failedPages: Array<{ pageNumber: number; error: string; retries: number }>;
  pendingPages: number[];
  totalChunksAfterReingestion: number;
  ragStatus: DocumentIngestionStatus;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Métricas detalhadas de cobertura documental distinguindo claramente o estado de cada página.
 */
export interface OcrCoverageMetrics {
  documentId: string;
  totalPages: number;
  nativeTextPagesCount: number;
  scannedPagesCount: number;
  requiresOcrCount: number;
  completedOcrCount: number;
  failedOcrCount: number;
  pendingOcrCount: number;
  totalIndexedChunks: number;
  unsearchablePagesCount: number;
  coveragePercent: number;
}

/* ==========================================================================
   ESTADOS DE INGESTÃO E OBSERVABILIDADE RAG (MISSÃO A3)
   ========================================================================== */

/**
 * Estados do ciclo de vida da ingestão documental para o RAG.
 */
export type DocumentIngestionStatus =
  | 'pending'
  | 'extracting'
  | 'processing'
  | 'indexed'
  | 'completed_partial_ocr_pending'
  | 'failed';

/**
 * Registro de estado consolidado de ingestão de um documento.
 */
export interface DocumentIngestionState {
  documentId: string;
  status: DocumentIngestionStatus;
  indexedChunksCount: number;
  totalPages: number;
  extractedPagesCount: number;
  emptyPagesCount: number;
  requiresOcrPagesCount: number;
  updatedAt: number;
  errorMessage?: string;
  coverage?: DetailedProcessingCoverage;
}

/**
 * Opções de configuração para o serviço de ingestão RAG.
 */
export interface RagIngestionOptions {
  chunkingOptions?: ChunkingOptions;
  skipOffsetVerification?: boolean;
}

/**
 * Resultado da execução da ingestão documental RAG.
 */
export interface RagIngestionResult {
  success: boolean;
  documentId: string;
  status: DocumentIngestionStatus;
  chunksCount: number;
  coverage?: DetailedProcessingCoverage;
  state: DocumentIngestionState;
  error?: string;
}

/* ==========================================================================
   CONTRATOS BM25 E RECUPERAÇÃO LEXICAL (MISSÃO B1)
   ========================================================================== */

/**
 * Entrada de posting invertido para um termo no corpus.
 */
export interface LexicalPosting {
  chunkId: string;
  termFrequency: number; // tf: frequência do termo no chunk
}

/**
 * Metadados e estatísticas de um chunk indexado no BM25.
 */
export interface ChunkLexicalSummary {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  tokenCount: number; // |D| comprimento do chunk em tokens
  contentHash: string;
  contentKind?: ChunkContentKind;
}

/**
 * Estrutura persistida do índice lexical invertido por documento.
 * Permite atomicidade, reindexação sem resíduos e agregação transparente por corpus.
 */
export interface StoredLexicalIndex {
  documentId: string;
  docId: string;
  pipelineVersion: string;
  tokenizerVersion: string;
  /** Versão do normalizador morfológico utilizado (ex: 'rslp-pt-1.0.0' na Missão E1) */
  normalizerVersion?: string;
  totalChunks: number;
  totalTokens: number;
  averageChunkLength: number; // avgdl local do documento
  indexedAt: number;
  chunkSummaries: Record<string, ChunkLexicalSummary>; // chunkId -> summary
  postings: Record<string, LexicalPosting[]>; // termo normalizado -> lista de postings
  vocabularySize: number;
}

/**
 * Configuração e parâmetros para cálculo do BM25.
 */
export interface Bm25Parameters {
  /** Parâmetro de saturação de frequência de termos (default: 1.2) */
  k1?: number;
  /** Parâmetro de penalização por comprimento do documento (default: 0.75) */
  b?: number;
  /** Parâmetro opcional de saturação de frequência da query */
  k3?: number;
}

/**
 * Opções para execução de consulta lexical BM25.
 */
export interface Bm25SearchOptions extends Bm25Parameters {
  /** Escopo restrito a um documento específico */
  documentId?: string;
  /** Escopo restrito a uma lista de documentos permitidos */
  documentIds?: string[];
  /** Número máximo de resultados a retornar (default: 5) */
  topK?: number;
  /** Limite inferior mínimo de score (default: 0, desativado por padrão) */
  minScore?: number;
  /** Filtro opcional por página física */
  filterPage?: number;
  /** Filtro opcional por seção */
  filterSection?: string;
  /** Se verdadeiro, filtra stopwords canônicas pt-BR na consulta (default: false) */
  removeStopwords?: boolean;
  /** Se verdadeiro, aplica normalização morfológica RSLP pt-BR (default: true em v1.1.0) */
  normalizeMorphology?: boolean;
  /** Se verdadeiro, reconstrói automaticamente índices com normalizerVersion desatualizada */
  autoRebuildIncompatible?: boolean;
  /** Se verdadeiro, ativa expansão lexical controlada por sinônimos técnicos (default: true em Missão R1) */
  enableSynonymExpansion?: boolean;
  /** Se verdadeiro, calibra pesos para blocos estruturados (tabelas e fórmulas) (default: true em Missão R1) */
  boostStructuredBlocks?: boolean;
}

/**
 * Item de evidência documental retornado pela busca BM25.
 */
export interface Bm25SearchResult {
  documentId: string;
  docId: string;
  chunkId: string;
  /** Texto-fonte original exato e sem truncamento */
  text: string;
  /** Texto normalizado para busca (diagnóstico) */
  normalizedSearchText?: string;
  /** Score lexical BM25 calculado */
  score: number;
  /** Termos da consulta que contribuíram para o score */
  matchedTerms: string[];
  /** Detalhes de pontuação por termo para transparência */
  termScores?: Record<string, number>;
  /** Página física original (base 1) */
  pageNumber: number;
  /** Ordem sequencial do chunk na página */
  chunkIndexInPage: number;
  /** Título da seção (se disponível) */
  sectionTitle?: string;
  /** Hierarquia da seção */
  sectionHierarchy?: string[];
  /** Offsets originais na página */
  charOffsetStart: number;
  charOffsetEnd: number;
  /** Rastreabilidade posicional completa */
  sourceRef: ChunkSourceReference;
  /** Hash criptográfico SHA-256 do conteúdo */
  contentHash: string;
  /** Versão do pipeline e índice */
  indexVersion: string;
}

/**
 * Resposta completa do serviço de consulta BM25.
 */
export interface Bm25QueryResponse {
  query: string;
  queryTokens: string[];
  results: Bm25SearchResult[];
  totalMatches: number;
  corpusStats: {
    totalChunks: number;
    avgChunkLength: number;
    scopedDocuments: string[];
  };
  executionTimeMs: number;
}

/* ==========================================================================
   FASE B2: CONTRATOS DO TUTOR FUNDAMENTADO EM EVIDÊNCIAS BM25
   ========================================================================== */

/**
 * Estado semântico e operacional da recuperação de contexto do Tutor.
 */
export type TutorContextState =
  | 'grounded'     // Evidências encontradas e empacotadas dentro do orçamento
  | 'no_evidence'  // Busca BM25 não retornou correspondências no material
  | 'not_indexed'  // Documento ainda não possui índice lexical persistido
  | 'ocr_pending'  // Documento possui páginas que dependem de OCR pendente
  | 'error';       // Erro de I/O ou falha na recuperação

/**
 * Motivo explícito de descarte de um chunk candidato durante o empacotamento com orçamento.
 */
export type DiscardedChunkReason =
  | 'budget_exceeded'        // Inclusão ultrapassaria o orçamento máximo de tokens
  | 'page_diversity_limit'   // Página já atingiu a cota máxima de chunks para garantir diversidade
  | 'score_below_threshold'  // Score inferior ao limite mínimo configurado
  | 'scanned_fallback'       // Chunk sentinela de página digitalizada sem texto pesquisável
  | 'duplicate';             // Chunk já selecionado previamente

/**
 * Chunk de evidência empacotado para o contexto de fundamentação do Tutor.
 */
export interface PackedEvidenceChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  chunkIndexInPage: number;
  text: string;
  estimatedTokens: number;
  score: number;
  sectionTitle?: string;
  sectionHierarchy?: string[];
  charOffsetStart: number;
  charOffsetEnd: number;
  sourceRef: ChunkSourceReference;
  contentKind: ChunkContentKind;
  oversizeAtomicBlock?: boolean;
}

/**
 * Opções de configuração para o construtor de contexto do Tutor.
 */
export interface TutorContextOptions {
  /** Orçamento máximo aproximado de tokens para os trechos de evidência (default: 1500) */
  maxTokenBudget?: number;
  /** Limite máximo de chunks por página para assegurar diversidade (default: 2) */
  maxChunksPerPage?: number;
  /** Limite de score mínimo BM25 (default: 0, não filtrado por score arbitrário) */
  minScoreThreshold?: number;
  /** Quantidade máxima de chunks a recuperar via BM25 antes do empacotamento (default: 10) */
  topK?: number;
  /** Se verdadeiro e consentimento concedido, utiliza busca híbrida BM25 + Densa via RRF */
  enableDense?: boolean;
  /** Limiar mínimo de similaridade de cosseno para candidatos densos puros sem suporte lexical (default: 0.84) */
  minDenseCosineConfidence?: number;
  /** Se verdadeiro, expande trechos fragmentados com contexto de chunks adjacentes (default: true em Missão R1) */
  includeAdjacentContext?: boolean;
  /** Se verdadeiro, ativa expansão lexical controlada por sinônimos técnicos (default: true em Missão R1) */
  enableSynonymExpansion?: boolean;
  /** Se verdadeiro, calibra pesos para blocos estruturados (default: true em Missão R1) */
  boostStructuredBlocks?: boolean;
}

/**
 * Diagnóstico local detalhado para observabilidade e testes do fluxo de evidências.
 */
export interface TutorEvidenceDiagnostic {
  query: string;
  documentId: string;
  status: TutorContextState;
  retrievedCount: number;
  retrievedChunks: Array<{
    chunkId: string;
    score: number;
    pageNumber: number;
  }>;
  packedChunks: Array<{
    chunkId: string;
    pageNumber: number;
    estimatedTokens: number;
    score: number;
  }>;
  discardedChunks: Array<{
    chunkId: string;
    pageNumber: number;
    reason: DiscardedChunkReason;
  }>;
  totalEstimatedTokens: number;
  maxTokenBudget: number;
  insufficientEvidenceReason?: string;
  executionTimeMs: number;
}

/**
 * Contexto estruturado e fundamentado retornado para o Tutor.
 */
export interface TutorGroundedContext {
  state: TutorContextState;
  documentId: string;
  documentTitle: string;
  documentExcerpts: string[];
  evidences: EvidenceReference[];
  packedChunks: PackedEvidenceChunk[];
  diagnostic: TutorEvidenceDiagnostic;
  userNotice?: string;
}

/**
 * Item de evidência controlada com identificador determinístico temporário por requisição (ex: C1, C2).
 * Vincula o identificador compacto aos metadados fáticos e estruturais do chunk (Missão P3.1).
 */
export interface ControlledEvidenceItem {
  citationTag: string; // Ex: "C1", "C2"
  tag?: string; // Ex: "[C1]"
  index?: number;
  chunkId: string;
  documentId: string;
  pageNumber?: number;
  sectionTitle?: string;
  excerpt: string;
  evidenceReference: EvidenceReference;
  evidence?: EvidenceReference;
  formattedPromptLine?: string;
}

export type ControlledEvidenceMap = Map<string, ControlledEvidenceItem>;

/* ==========================================================================
   FASE F1: CONTRATOS DE RECUPERAÇÃO HÍBRIDA (BM25 + DENSE EMBEDDINGS + RRF)
   ========================================================================== */

/**
 * Configuração imutável do modelo de embedding local.
 */
export interface DenseEmbeddingModelConfig {
  modelId: string; // 'Xenova/multilingual-e5-small'
  modelRevision: string; // '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
  dimension: number; // 384
  maxSequenceLength: number; // 512
  pooling: 'mean';
  normalize: boolean; // true (L2 norm)
  queryPrefix: string; // 'query: '
  passagePrefix: string; // 'passage: '
  quantized: boolean; // true (INT8 q8)
}

/**
 * Registro de embedding denso persistido no IndexedDB (store: document_dense_embeddings).
 */
export interface StoredDenseEmbedding {
  chunkId: string;
  documentId: string;
  docId: string;
  pageNumber: number;
  embedding: number[]; // 384 dimensões em ponto flutuante normalizado L2
  modelVersion: string;
  dimension: number;
  tokenizerVersion: string;
  pooling: string;
  contentHash: string;
  isSegmented?: boolean;
  segmentsCount?: number;
  storedAt: number;
}

/**
 * Metadados de estado do índice denso de um documento.
 */
export interface DenseIndexMetadata {
  documentId: string;
  docId: string;
  modelVersion: string;
  dimension: number;
  totalChunks: number;
  embeddedChunksCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
  lastIndexedAt: number;
  checkpointChunkId?: string;
  failedChunkIds?: string[];
  executionTimeMs?: number;
}

/**
 * Estado de consentimento do usuário para busca semântica local e download de pesos.
 */
export interface SemanticConsentStatus {
  granted: boolean;
  grantedAt?: number;
  modelId: string;
  modelRevision: string;
  modelEstimatedSizeBytes: number; // ~135 MB total (pesos INT8 + tokenizer)
  termsAccepted: boolean;
}

/**
 * Opções de busca híbrida combinando BM25 e embeddings densos via RRF.
 */
export interface HybridSearchOptions extends Bm25SearchOptions {
  enableDense?: boolean; // Se false, executa BM25 puro (fallback)
  rrfK?: number; // Constante de suavização RRF (default: 60)
  minCosineScore?: number; // Limiar de similaridade de cossenos para candidatos densos
  denseTopK?: number; // Top-K de candidatos densos antes da fusão (default: 20)
  lexicalTopK?: number; // Top-K de candidatos BM25 antes da fusão (default: 20)
  lexicalWeight?: number; // Peso opcional para análise experimental
  denseWeight?: number;
}

/**
 * Item de resultado recuperado pela busca híbrida (BM25 + Densa + RRF).
 */
export interface HybridSearchResult {
  documentId: string;
  docId: string;
  chunkId: string;
  text: string;
  score: number; // Score RRF combinado
  bm25Score?: number;
  denseCosineScore?: number;
  bm25Rank?: number;
  denseRank?: number;
  pageNumber: number;
  chunkIndexInPage: number;
  sectionTitle?: string;
  sectionHierarchy?: string[];
  charOffsetStart: number;
  charOffsetEnd: number;
  sourceRef: ChunkSourceReference;
  contentHash: string;
  matchedTerms: string[];
  indexVersion: string;
}

/**
 * Resposta completa do serviço de consulta híbrida.
 */
export interface HybridQueryResponse {
  query: string;
  results: HybridSearchResult[];
  totalMatches: number;
  lexicalMatchesCount: number;
  denseMatchesCount: number;
  hybridMode: 'hybrid_rrf' | 'lexical_fallback' | 'dense_only';
  executionTimeMs: {
    total: number;
    lexicalMs: number;
    denseMs: number;
    fusionMs: number;
  };
}

/**
 * Protocolo de mensagens com o Web Worker de inferência de embeddings.
 */
export type DenseWorkerMessageType =
  | 'INITIALIZE'
  | 'MODEL_DOWNLOAD_PROGRESS'
  | 'MODEL_READY'
  | 'EMBED_BATCH'
  | 'BATCH_PROGRESS'
  | 'SEARCH'
  | 'SEARCH_RESULT'
  | 'CANCEL'
  | 'CANCELLED'
  | 'ERROR'
  | 'DISPOSE';

export interface DenseWorkerRequest {
  id: string;
  type: DenseWorkerMessageType;
  payload?: any;
}

export interface DenseWorkerResponse {
  id: string;
  type: DenseWorkerMessageType;
  payload?: any;
  error?: string;
}

/* ==========================================================================
   MISSÃO R2: CONSOLIDAÇÃO MULTIMODAL DO TUTOR (ENTRADA VISUAL DIRETA)
   ========================================================================== */

export type TutorVisualAssetType = 'figure' | 'chart' | 'table' | 'formula' | 'diagram' | 'page_crop';

export interface TutorVisualAsset {
  /** Identificador estável do ativo (ex: "fig_p2_1" ou "page_crop_p4") */
  id: string;
  /** Documento de origem para isolamento estrito */
  documentId: string;
  /** Página física original do documento (base 1) */
  pageNumber: number;
  /** Rótulo documental ou identificador (ex: "Figura 1.2", "Gráfico 1", "Tabela 2") */
  label?: string;
  /** Tipo de elemento visual */
  type: TutorVisualAssetType;
  /** Dados da imagem em base64 (data URL ou raw base64) */
  imageBase64: string;
  /** MIME type permitido ('image/png' | 'image/jpeg' | 'image/webp') */
  mimeType: string;
  /** Legenda ou título documental se disponível */
  caption?: string;
  /** Trecho textual circundante ou contexto */
  contextExcerpt?: string;
  /** Sinalização de incerteza em leitura de baixa resolução ou corte */
  uncertaintyNotice?: string;
}

export interface TutorVisualContextResult {
  visualAssets: TutorVisualAsset[];
  hasVisualContent: boolean;
  visualEvidenceDescriptions: string[];
  rejectionReason?: string;
  warningNotice?: string;
}

/* ==========================================================================
   MISSÃO P3.2.1: SEGMENTAÇÃO DE AFIRMAÇÕES E VERIFICAÇÕES DETERMINÍSTICAS LOCAIS
   ========================================================================== */

/**
 * Classificação operacional do segmento segundo verificações determinísticas locais (Tier 1).
 *
 * RESTRIÇÃO EPISTÊMICA RIGOROSA:
 * É terminantemente proibido utilizar rótulos afirmativos de verdade semântica
 * como 'SUPPORTED', 'PROVEN', 'VERIFIED' ou 'SEMANTICALLY_VERIFIED'.
 * A ausência de anomalia determinística não garante sustentação factual ou semântica.
 */
export type GroundingAssessment =
  | 'UNCITED_SEGMENT'          // Segmento afirmativo sem marcador de citação [C#]
  | 'NUMERIC_REVIEW_REQUIRED'   // Número/dado quantitativo presente no texto mas ausente na evidência citada
  | 'NO_DETERMINISTIC_ALERT'    // Citação válida e nenhuma anomalia numérica/estrutural determinística detectada
  | 'UNASSESSED';               // Fundamentação semântica não avaliada (avaliação semântica profunda requer Tier 2)

/**
 * Detalhes das verificações determinísticas executadas sobre o segmento.
 */
export interface GroundingSegmentCheckDetails {
  /** Todos os números/quantidades extraídos do segmento do tutor (excluindo tags [C#]) */
  extractedNumbers: string[];
  /** Números presentes no segmento que não foram encontrados literalmente na evidência citada */
  unmatchedNumbers: string[];
  /** Razão de sobreposição lexical informativa (opcional, heurística) */
  lexicalOverlapRatio?: number;
  /** Indicador de disparidade de polaridade negativa detectada (opcional, heurística) */
  hasNegativePolarityDifference?: boolean;
}

/**
 * Segmento atômico de resposta do tutor com metadados de fundamentação determinística.
 */
export interface GroundingSegment {
  /** Identificador único do segmento (ex: "seg_1") */
  id: string;
  /** Índice sequencial na resposta (base 0) */
  index: number;
  /** Texto integral do segmento */
  text: string;
  /** Tags canônicas de citação associadas ao segmento (ex: ['C1', 'C2']) */
  citationTags: string[];
  /** Identificadores de chunks de evidência correspondentes */
  evidenceChunkIds: string[];
  /** Classificação operacional determinística */
  assessment: GroundingAssessment;
  /** Granularidade estrutural da extração */
  granularity: 'sentence' | 'text_segment';
  /** Detalhes objetivos das verificações realizadas */
  checks: GroundingSegmentCheckDetails;
  /** Notas operacionais explicativas para inspeção técnica */
  notes?: string;
}

/**
 * Resultado completo do processamento de fundamentação determinística da resposta.
 */
export interface TutorResponseGroundingResult {
  segments: GroundingSegment[];
  executionTimeMs: number;
  summary: {
    totalSegments: number;
    uncitedCount: number;
    numericReviewCount: number;
    noAlertCount: number;
    unassessedCount: number;
  };
}

/* ==========================================================================
   MISSÃO P3.2.2.1: AVALIAÇÃO SEMÂNTICA SELETIVA SOB DEMANDA (TIER 2)
   ========================================================================== */

/**
 * Classificação formal do grau de sustentação semântica de uma afirmação frente às evidências citadas.
 */
export type SemanticSupportLevel =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE';

/**
 * Tipologia da relação lógica entre a afirmação e a evidência documental citada.
 */
export type SemanticRelationType =
  | 'direct_paraphrase'
  | 'reasonable_inference'
  | 'unwarranted_extrapolation'
  | 'causal_leap'
  | 'species_generalization'
  | 'modality_shift'
  | 'direct_contradiction'
  | 'irrelevant_evidence'
  | 'unclear_relationship';

/**
 * Resultado estruturado da avaliação semântica de uma afirmação individual.
 */
export interface SemanticClaimAssessment {
  segmentId: string;
  status: SemanticSupportLevel;
  relationship: SemanticRelationType;
  citedEvidenceIds: string[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  explanation: string;
  limitations: string[];
}

/**
 * Status operacional consolidado da avaliação do lote de afirmações.
 * - COMPLETED: Todos os segmentos elegíveis possuem resultado válido e único.
 * - PARTIALLY_EVALUATED: Ao menos um resultado válido, mas faltam avaliações de segmentos elegíveis.
 * - INCONCLUSIVE: Nenhum resultado utilizável foi validado.
 * - UNAVAILABLE: Erro de execução, chave inválida, cota esgotada ou indisponibilidade do modelo.
 */
export type SemanticOverallStatus =
  | 'COMPLETED'
  | 'PARTIALLY_EVALUATED'
  | 'INCONCLUSIVE'
  | 'UNAVAILABLE';

/**
 * Resposta completa do endpoint de avaliação semântica sob demanda.
 */
export interface SemanticEvaluationResponse {
  evaluationId: string;
  modelId: string;
  evaluatedAt: number;
  results: SemanticClaimAssessment[];
  overallStatus: SemanticOverallStatus;
  disclaimer: string;
}

/**
 * Requisição enviada pelo frontend contendo o identificador opaco temporário (ticket).
 */
export interface SemanticEvaluationRequest {
  evaluationHandle: string;
  messageId?: string;
}







