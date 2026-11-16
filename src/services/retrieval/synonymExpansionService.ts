/**
 * NeuroClass AI — Serviço de Expansão Lexical Controlada de Consultas
 * @module services/retrieval/synonymExpansionService
 *
 * Provê expansão determinística e auditável de termos técnicos em Português do Brasil (pt-BR)
 * para consultas no RAG, sem inflar termos genéricos ou quebrar a barreira fail-closed.
 *
 * REGRAS INVIOLÁVEIS:
 * 1. Dicionário pequeno, explícito, versionado e focado em domínios específicos (neurociências, biofísica, cognição);
 * 2. NUNCA expandir palavras genéricas (ex.: processo, mecanismo, estudo, sistema, propriedades, consumo);
 * 3. NUNCA expandir stopwords;
 * 4. Preservar identificadores técnicos protegidos, fórmulas e siglas;
 * 5. Cada expansão registra proveniência, versão do dicionário e termo de origem para rastreabilidade estrita.
 */

import { GENERIC_SCIENTIFIC_STEMS } from './tutorContextBuilder';
import { isProtectedToken, normalizeMorphologyPtBr } from '../documents/morphologyNormalizer';

export const SYNONYM_DICTIONARY_VERSION = '1.0.0';

export interface TechnicalSynonymEntry {
  /** Termo canônico ou conceito de referência */
  canonical: string;
  /** Lista de sinônimos/equivalentes conceituais discriminativos */
  equivalents: string[];
  /** Domínio científico específico */
  domain: 'neurofisiologia' | 'plasticidade' | 'biofisica' | 'farmacologia' | 'cognicao';
  /** Descrição sucinta da equivalência para auditoria */
  rationale: string;
}

/**
 * Catálogo controlado, estrito e versionado de equivalências técnicas em pt-BR.
 * Apenas conceitos altamente discriminativos são incluídos.
 */
export const TECHNICAL_SYNONYM_CATALOG: readonly TechnicalSynonymEntry[] = [
  {
    canonical: 'sinapse',
    equivalents: ['fenda sináptica', 'junção sináptica'],
    domain: 'neurofisiologia',
    rationale: 'Equivalência fisiológica da estrutura anatômica de conexão neuronal',
  },
  {
    canonical: 'potencial de ação',
    equivalents: ['impulso nervoso', 'espícula'],
    domain: 'neurofisiologia',
    rationale: 'Denominação eletrofisiológica clássica da propagação de voltagem',
  },
  {
    canonical: 'potencial de repouso',
    equivalents: ['voltagem basal', 'potencial de membrana em repouso'],
    domain: 'biofisica',
    rationale: 'Equivalência da medida eletrofisiológica em repouso basal (-70mV)',
  },
  {
    canonical: 'potenciação de longa duração',
    equivalents: ['ltp', 'potenciação a longo prazo'],
    domain: 'plasticidade',
    rationale: 'Sigla canônica internacional e paráfrases diretas de LTP',
  },
  {
    canonical: 'depressão de longa duração',
    equivalents: ['ltd', 'depressão a longo prazo'],
    domain: 'plasticidade',
    rationale: 'Sigla e contrapartida de LTP na plasticidade homossináptica',
  },
  {
    canonical: 'canais iônicos',
    equivalents: ['poros iônicos', 'condutâncias iônicas'],
    domain: 'biofisica',
    rationale: 'Estruturas proteicas transmembrana condutoras de corrente',
  },
  {
    canonical: 'bloqueador farmacológico',
    equivalents: ['antagonista farmacológico', 'inibidor seletivo'],
    domain: 'farmacologia',
    rationale: 'Ação farmacológica de substâncias como TTX, TEA e APV',
  },
  {
    canonical: 'vesícula sináptica',
    equivalents: ['vesícula pré-sináptica', 'vesícula de secreção'],
    domain: 'neurofisiologia',
    rationale: 'Organelas que armazenam neurotransmissores na zona ativa',
  },
  {
    canonical: 'exocitose',
    equivalents: ['fusão vesicular', 'liberação vesicular'],
    domain: 'neurofisiologia',
    rationale: 'Mecanismo molecular efetor mediado pelo complexo SNARE e cálcio',
  },
  {
    canonical: 'transporte ativo primário',
    equivalents: ['bomba atpase', 'bomba de sódio e potássio', 'na+/k+-atpase'],
    domain: 'biofisica',
    rationale: 'Mecanismo molecular com consumo direto de ATP para gradiente iônico',
  },
  {
    canonical: 'neurotransmissor',
    equivalents: ['mensageiro sináptico', 'mensageiro químico'],
    domain: 'neurofisiologia',
    rationale: 'Substâncias endógenas liberadas na fenda sináptica',
  },
  {
    canonical: 'satisficing',
    equivalents: ['racionalidade limitada', 'decisão satisfatória'],
    domain: 'cognicao',
    rationale: 'Conceito formulado por Herbert Simon em tomada de decisão',
  },
  {
    canonical: 'heurística',
    equivalents: ['regra prática', 'atalho decisório'],
    domain: 'cognicao',
    rationale: 'Estratégia aproximada de decisão sob escassez de recursos cognitivos',
  },
  {
    canonical: 'excitotoxicidade',
    equivalents: ['toxicidade glutamatérgica', 'dano por excesso de glutamato'],
    domain: 'neurofisiologia',
    rationale: 'Mecanismo patológico de morte celular neuronal por cálcio excessivo',
  },
];

export interface ExpandedTermProvenance {
  originalQueryPhrase: string;
  matchedCanonical: string;
  addedTerms: string[];
  domain: string;
  dictionaryVersion: string;
}

export interface ControlledExpansionResult {
  /** Texto da consulta original */
  originalQuery: string;
  /** Termos originais identificados */
  originalTerms: string[];
  /** Novos termos derivados exclusivamente de equivalências controladas */
  expandedTerms: string[];
  /** Todos os termos combinados para o motor lexical (originais + expandidos) */
  allQueryTerms: string[];
  /** Rastreabilidade estrita de cada expansão realizada */
  provenance: ExpandedTermProvenance[];
  /** Versão do dicionário utilizado */
  dictionaryVersion: string;
}

/**
 * Normaliza uma frase para correspondência insensível a acentos e maiúsculas.
 */
function cleanPhrase(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s\+\-\/\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Executa a expansão lexical controlada sobre uma consulta.
 * Identifica se frases ou termos técnicos da consulta constam no catálogo estrito.
 */
export function expandQueryLexical(
  query: string,
  options?: { maxExpansionsPerQuery?: number }
): ControlledExpansionResult {
  const maxExpansions = options?.maxExpansionsPerQuery ?? 3;
  const provenance: ExpandedTermProvenance[] = [];
  const expandedTermsSet = new Set<string>();

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      originalQuery: query || '',
      originalTerms: [],
      expandedTerms: [],
      allQueryTerms: [],
      provenance: [],
      dictionaryVersion: SYNONYM_DICTIONARY_VERSION,
    };
  }

  const cleanedQuery = ` ${cleanPhrase(query)} `;

  for (const entry of TECHNICAL_SYNONYM_CATALOG) {
    if (provenance.length >= maxExpansions) break;

    // Constrói lista de todas as variantes da entrada (canônico + equivalentes)
    const allVariants = [entry.canonical, ...entry.equivalents];
    let matchedVariant: string | null = null;

    for (const variant of allVariants) {
      const cleanedVariant = cleanPhrase(variant);
      // Verifica correspondência de limite de palavras completas
      const regex = new RegExp(`\\b${cleanedVariant.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(cleanedQuery)) {
        matchedVariant = variant;
        break;
      }
    }

    if (matchedVariant) {
      // Coleta os equivalentes correspondentes para expandir
      const termsToAdd: string[] = [];

      for (const variant of allVariants) {
        if (variant.toLowerCase() === matchedVariant.toLowerCase()) continue;

        // Extrai tokens significativos do termo equivalente
        const tokens = variant
          .toLowerCase()
          .replace(/[^\w\sáéíóúâêîôûãõç\+\-\/\.]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 2);

        for (const tok of tokens) {
          // Filtros de segurança: nunca expandir genéricos nem tokens vazios
          const stem = normalizeMorphologyPtBr(tok);
          if (GENERIC_SCIENTIFIC_STEMS.has(stem) || GENERIC_SCIENTIFIC_STEMS.has(tok)) {
            continue;
          }
          if (!termsToAdd.includes(tok)) {
            termsToAdd.push(tok);
            expandedTermsSet.add(tok);
          }
        }
      }

      if (termsToAdd.length > 0) {
        provenance.push({
          originalQueryPhrase: matchedVariant,
          matchedCanonical: entry.canonical,
          addedTerms: termsToAdd,
          domain: entry.domain,
          dictionaryVersion: SYNONYM_DICTIONARY_VERSION,
        });
      }
    }
  }

  // Tokenização limpa dos termos originais da consulta
  const originalTerms = query
    .toLowerCase()
    .replace(/[^\w\sáéíóúâêîôûãõç\+\-\/\.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  const allQueryTerms = Array.from(new Set([...originalTerms, ...Array.from(expandedTermsSet)]));

  return {
    originalQuery: query,
    originalTerms,
    expandedTerms: Array.from(expandedTermsSet),
    allQueryTerms,
    provenance,
    dictionaryVersion: SYNONYM_DICTIONARY_VERSION,
  };
}
