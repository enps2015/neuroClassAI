import type { MasteryLevel, DiagnosticState } from '../types/index.ts';

/**
 * Tradução e Semântica Pedagógica Oficial do NeuroClass AI (Fase 2: Método C.R.E.A.R. / Feynman)
 * Mapeia identificadores técnicos internos para rótulos em Português do Brasil de alto valor pedagógico.
 */

export interface MasteryLevelMeta {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  colorClass: string;
}

export interface DiagnosticStateMeta {
  label: string;
  description: string;
  badgeClass: string;
  colorClass: string;
}

export interface RubricStatusMeta {
  label: string;
  colorClass: string;
  bgClass: string;
  badgeClass: string;
}

/**
 * Níveis de Domínio Cognitivo (Progressão C.R.E.A.R.)
 */
export const MASTERY_LEVEL_MAP: Record<MasteryLevel, MasteryLevelMeta> = {
  recognize: {
    label: 'Reconhecer',
    shortLabel: 'Reconhecimento',
    description: 'Identifica termos, definições e propriedades básicas do conceito sem aprofundar os mecanismos causais.',
    badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    colorClass: 'text-slate-300',
  },
  understand: {
    label: 'Compreender',
    shortLabel: 'Compreensão',
    description: 'Explica com as próprias palavras a dinâmica causal, as etapas do processo e as relações entre as partes.',
    badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    colorClass: 'text-blue-400',
  },
  apply: {
    label: 'Aplicar',
    shortLabel: 'Aplicação',
    description: 'Conecta o conhecimento a experimentos reais, analogias precisas e resolução de problemas práticos.',
    badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    colorClass: 'text-indigo-400',
  },
  transfer: {
    label: 'Transferir',
    shortLabel: 'Transferência',
    description: 'Generaliza os princípios para novos domínios, contrasta teorias e formula hipóteses inovadoras.',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    colorClass: 'text-emerald-400',
  },
};

/**
 * Estados Diagnósticos Formativos do Conceito
 * Regra epistemológica: Ausência de evidência != Desconhecimento.
 */
export const DIAGNOSTIC_STATE_MAP: Record<DiagnosticState, DiagnosticStateMeta> = {
  unassessed: {
    label: 'Não Avaliado',
    description: 'Ainda não foram registradas tentativas ativas de explicação para este conceito.',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    colorClass: 'text-slate-400',
  },
  confirmed_gap: {
    label: 'Lacuna Identificada',
    description: 'Foram detectadas dúvidas ou quebras em pré-requisitos essenciais que necessitam de retomada formativa.',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    colorClass: 'text-amber-400',
  },
  understood: {
    label: 'Compreendido',
    description: 'O estudante demonstrou compreensão consistente do mecanismo causal fundamental.',
    badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    colorClass: 'text-blue-400',
  },
  mastered: {
    label: 'Dominado',
    description: 'Domínio consolidado por evidências acumuladas em múltiplas tentativas e aplicações práticas.',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    colorClass: 'text-emerald-400',
  },
};

/**
 * Rótulos Qualitativos das 5 Dimensões da Rubrica Avaliativa
 */
export const RUBRIC_STATUS_MAP: Record<string, RubricStatusMeta> = {
  // Precisão Conceitual
  accurate: {
    label: 'Precisa',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  partially_accurate: {
    label: 'Parcialmente Precisa',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  inaccurate: {
    label: 'Imprecisa',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },

  // Completude
  complete: {
    label: 'Completa',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  partially_complete: {
    label: 'Parcialmente Completa',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  incomplete: {
    label: 'Incompleta',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },

  // Relações Conceituais
  well_connected: {
    label: 'Bem Relacionadas',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  isolated: {
    label: 'Pouco Relacionadas',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  confused: {
    label: 'Relações Confusas',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },

  // Coerência do Raciocínio
  coherent: {
    label: 'Coerente',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  fragmented: {
    label: 'Fragmentado',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  contradictory: {
    label: 'Contraditório',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },

  // Aplicação do Conhecimento
  applied: {
    label: 'Aplicada',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  theoretical_only: {
    label: 'Apenas Teórica',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  misapplied: {
    label: 'Aplicação Inadequada',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
};

/**
 * Retorna os metadados amigáveis de um nível de domínio.
 */
export function getMasteryLevelMeta(level?: string | null): MasteryLevelMeta {
  if (!level) return MASTERY_LEVEL_MAP.recognize;
  const key = level.toLowerCase() as MasteryLevel;
  return MASTERY_LEVEL_MAP[key] || MASTERY_LEVEL_MAP.recognize;
}

/**
 * Retorna os metadados amigáveis de um estado diagnóstico formativo.
 */
export function getDiagnosticStateMeta(state?: string | null): DiagnosticStateMeta {
  if (!state) return DIAGNOSTIC_STATE_MAP.unassessed;
  const key = state.toLowerCase() as DiagnosticState;
  return DIAGNOSTIC_STATE_MAP[key] || DIAGNOSTIC_STATE_MAP.unassessed;
}

/**
 * Retorna os metadados amigáveis de um status da rubrica.
 */
export function getRubricStatusMeta(status?: string | null): RubricStatusMeta {
  if (!status) {
    return {
      label: 'Não Avaliado',
      colorClass: 'text-slate-400',
      bgClass: 'bg-slate-500/10',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
  }
  const key = status.toLowerCase();
  return (
    RUBRIC_STATUS_MAP[key] || {
      label: status,
      colorClass: 'text-slate-300',
      bgClass: 'bg-slate-800',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    }
  );
}

/**
 * Formata contagem de tentativas com gramática correta em português do Brasil.
 */
export function formatAttemptsCount(count: number, includeVerb = false): string {
  if (!count || count <= 0) return 'Nenhuma tentativa';
  if (count === 1) return includeVerb ? '1 tentativa realizada' : '1 tentativa';
  return includeVerb ? `${count} tentativas realizadas` : `${count} tentativas`;
}

export type EvidenceCorrespondenceType =
  | 'exact_literal'
  | 'normalized_match'
  | 'thematic_synthesis'
  | 'unverified';

export interface EvidenceCorrespondenceResult {
  isLiteralQuote: boolean; // true estritamente para citação literal exata (sem alteração de caixa ou pontuação)
  isExactLiteral: boolean;
  isNormalizedMatch: boolean;
  matchType: EvidenceCorrespondenceType;
  statusLabel: string;
  badgeClass: string;
}

/**
 * Verificação determinística de correspondência de trecho documental citado.
 * Diferencia rigorosamente:
 * 1. Citação literal exata (preserva caracteres, pontuação e caixa exata da fonte).
 * 2. Correspondência textual normalizada (depende de tolerância a caixa, pontuação ou espaçamento).
 * 3. Síntese temática da fonte (paráfrase ou síntese conceitual sem correspondência textual direta).
 */
export function verifyEvidenceCorrespondence(
  excerpt?: string,
  documentExcerpts?: string[]
): EvidenceCorrespondenceResult {
  if (!excerpt || !excerpt.trim()) {
    return {
      isLiteralQuote: false,
      isExactLiteral: false,
      isNormalizedMatch: false,
      matchType: 'unverified',
      statusLabel: 'Referência Documental',
      badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    };
  }

  const rawExcerpt = excerpt.trim();

  if (!documentExcerpts || documentExcerpts.length === 0) {
    return {
      isLiteralQuote: false,
      isExactLiteral: false,
      isNormalizedMatch: false,
      matchType: 'thematic_synthesis',
      statusLabel: 'Síntese Referenciada',
      badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    };
  }

  // 1. Verificação de Citação Literal Exata (case-sensitive e pontuação verbatim)
  const isExact = documentExcerpts.some(docSnippet => docSnippet.includes(rawExcerpt));
  if (isExact) {
    return {
      isLiteralQuote: true,
      isExactLiteral: true,
      isNormalizedMatch: false,
      matchType: 'exact_literal',
      statusLabel: 'Citação Literal Exata',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
  }

  // 2. Verificação de Correspondência Textual Normalizada (tolerância a caixa, acentos, pontuação e espaços)
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const cleanExcerpt = normalize(rawExcerpt);
  const isNormalized = documentExcerpts.some(docSnippet => {
    const cleanDoc = normalize(docSnippet);
    return cleanDoc.includes(cleanExcerpt);
  });

  if (isNormalized) {
    return {
      isLiteralQuote: false, // Não é citação literal pois dependeu de normalização
      isExactLiteral: false,
      isNormalizedMatch: true,
      matchType: 'normalized_match',
      statusLabel: 'Correspondência Textual Normalizada',
      badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    };
  }

  // 3. Síntese Temática da Fonte (paráfrase conceitual sem correspondência verbatim)
  return {
    isLiteralQuote: false,
    isExactLiteral: false,
    isNormalizedMatch: false,
    matchType: 'thematic_synthesis',
    statusLabel: 'Síntese Temática da Fonte',
    badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  };
}
