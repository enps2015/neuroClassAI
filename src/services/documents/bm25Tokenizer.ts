/**
 * NeuroClass AI — Tokenizador Técnico e Determinístico para BM25 (Português / Científico)
 * @module services/documents/bm25Tokenizer
 *
 * Implementação local, determinística, sem I/O e sem dependências externas.
 *
 * DIRETRIZES FUNDAMENTAIS:
 * 1. Normalização Unicode estrita em formato NFC (Canonical Composition).
 * 2. Case folding para minúsculas sem remoção de acentos diacríticos (preserva semântica pt-BR).
 * 3. Preservação de termos técnicos úteis:
 *    - Siglas e identificadores: NMDA, SNARE, LTP, API, RAG, BM25, IoT, 5G;
 *    - Fórmulas químicas e estados iônicos: pH, NaCl, CO₂, H₂O, Ca²⁺, Mg²⁺, V_0;
 *    - Compostos com hífen: pré-frontal, pós-sináptico, long-term, FSRS-7, ISO-27001;
 *    - Números, medidas, datas e decimais: 1978, 0.05, 350ms, 70mV, 10mg.
 * 4. Pontuação e caracteres especiais tratados como separadores, sem descartar pontuação interna válida.
 * 5. Simetria estrita: consultas e documentos utilizam EXATAMENTE a mesma função de tokenização.
 */

import {
  normalizeMorphologyPtBr,
  isProtectedToken,
  NORMALIZER_VERSION,
} from './morphologyNormalizer';

export const TOKENIZER_VERSION = '1.1.0';
export const NORMALIZATION_FORM = 'NFC' as const;

export { normalizeMorphologyPtBr, isProtectedToken, NORMALIZER_VERSION };

/**
 * Stoplist mínima, versionada e documentada para o Português (partículas gramaticais fechadas).
 * Por padrão, a remoção de stopwords permanece DESATIVADA (removeStopwords: false)
 * para preservar a máxima fidelidade de evidências lexicais.
 */
export const PORTUGUESE_STOPWORDS_V1: ReadonlySet<string> = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para',
  'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais',
  'as', 'dos', 'como', 'mas', 'ao', 'ele', 'das', 'à', 'seu',
  'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'eu', 'também',
  'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois',
]);

export interface TokenizeOptions {
  /** Se verdadeiro, filtra termos da stoplist canônica v1 (default: false) */
  removeStopwords?: boolean;
  /** Stoplist customizada opcional */
  customStopwords?: Set<string>;
  /** Se verdadeiro, aplica normalização morfológica determinística RSLP pt-BR (default: false no tokenizeText bruto, true no tokenizeNormalized) */
  normalizeMorphology?: boolean;
}

/**
 * Expressão regular determinística com suporte Unicode total:
 * - Inicia com letra ou dígito Unicode (\p{L}\p{N});
 * - Permite caracteres químicos e subscritos/sobrescritos acoplados (⁺, ⁻, _);
 * - Permite hífens e pontos internos conectando partes válidas (ex: pré-frontal, FSRS-7, 0.05).
 */
const TOKEN_REGEX = /[\p{L}\p{N}][\p{L}\p{N}⁺⁻_]*(?:[-.][\p{L}\p{N}][\p{L}\p{N}⁺⁻_]*)*/gu;

/**
 * Tokeniza um texto acadêmico/científico segundo as diretrizes determinísticas da Missão B1/E1.
 * Extrai tokens em case-folding NFC e, opcionalmente, aplica normalização morfológica RSLP.
 */
export function tokenizeText(text: string, options?: TokenizeOptions): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 1. Normalização Unicode NFC consistente
  const normalized = text.normalize(NORMALIZATION_FORM);

  // 2. Case folding preservando integralmente os acentos
  const lowered = normalized.toLowerCase();

  // 3. Extração regex determinística
  const rawMatches = lowered.match(TOKEN_REGEX);
  if (!rawMatches || rawMatches.length === 0) {
    return [];
  }

  // 4. Filtragem opcional de stopwords (se explicitamente solicitada)
  let filtered = rawMatches;
  if (options?.removeStopwords) {
    const stoplist = options.customStopwords || PORTUGUESE_STOPWORDS_V1;
    filtered = filtered.filter((t) => !stoplist.has(t));
  }

  // 5. Normalização morfológica RSLP opcional (exclusiva para recuperação)
  if (options?.normalizeMorphology) {
    return filtered
      .map((t) => normalizeMorphologyPtBr(t))
      .filter((t) => t.length > 0);
  }

  return filtered;
}

/**
 * Tokeniza texto aplicando obrigatoriamente a normalização morfológica RSLP pt-BR,
 * garantindo simetria estrita entre indexação e consulta BM25 (Missão E1).
 */
export function tokenizeNormalized(text: string, options?: TokenizeOptions): string[] {
  return tokenizeText(text, {
    ...options,
    normalizeMorphology: options?.normalizeMorphology ?? true,
  });
}

/**
 * Tokeniza a consulta de busca, garantindo estrita simetria de normalização com o corpus indexado.
 */
export function tokenizeQuery(query: string, options?: TokenizeOptions): string[] {
  return tokenizeText(query, options);
}

/**
 * Calcula a tabela de frequências de termos (Term Frequencies) para uma lista de tokens.
 */
export function countTermFrequencies(tokens: string[]): Map<string, number> {
  const tfMap = new Map<string, number>();
  for (const token of tokens) {
    tfMap.set(token, (tfMap.get(token) || 0) + 1);
  }
  return tfMap;
}

