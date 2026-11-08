/**
 * FASE 2 — AUDITORIA PEDAGÓGICA E DE INTERNACIONALIZAÇÃO (MARCO 2B.1)
 *
 * Módulo de Validação e Sanitização Determinística de Idioma (PT-BR).
 * Garante que nenhum conteúdo didático (perguntas reflexivas ou dicas pedagógicas)
 * seja apresentado em inglês ou formato misto ao estudante brasileiro.
 */

export interface SanitizedI18nResult {
  text: string;
  isFallback: boolean;
  detectedLanguage: 'pt-br' | 'en' | 'mixed' | 'unrecognized';
  reason?: string;
}

/**
 * Stopwords estruturais típicas da língua inglesa que não possuem o mesmo uso/grafia em português.
 */
const ENGLISH_STRUCTURAL_MARKERS = new Set([
  'the', 'is', 'are', 'was', 'were', 'with', 'from', 'this', 'that', 'these', 'those',
  'which', 'what', 'where', 'when', 'why', 'how', 'does', 'do', 'did', 'can', 'could',
  'should', 'would', 'will', 'have', 'has', 'had', 'based', 'between', 'through',
  'during', 'without', 'about', 'into', 'its', 'their', 'your', 'our', 'each', 'other',
  'such', 'than', 'then', 'also', 'both', 'system', 'update', 'updates', 'state',
  'sensor', 'physical', 'data', 'focus', 'explain', 'describe'
]);

/**
 * Stopwords e marcadores gramaticais típicos do Português do Brasil.
 */
const PORTUGUESE_STRUCTURAL_MARKERS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para',
  'com', 'como', 'que', 'qual', 'quais', 'quando', 'onde', 'porque', 'por que', 'porquê',
  'se', 'ou', 'e', 'mas', 'ao', 'aos', 'à', 'às', 'este', 'esta', 'esse', 'essa',
  'isso', 'isto', 'aquele', 'aquela', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa',
  'dele', 'dela', 'sobre', 'entre', 'durante', 'sem', 'contra', 'até', 'após', 'desde',
  'está', 'estão', 'é', 'são', 'foi', 'foram', 'era', 'eram', 'ser', 'estar', 'tem',
  'têm', 'tinha', 'havia', 'houve', 'explique', 'descreva', 'relacione', 'analise',
  'mecanismo', 'conceito', 'causas', 'efeito', 'implicações', 'práticas', 'fundamentais',
  'etapas', 'relações', 'processo'
]);

/**
 * Remove citações entre aspas e a ocorrência literal do nome do conceito,
 * permitindo que perguntas legítimas em português sobre conceitos estrangeiros
 * (ex: "Explique como o 'Digital Shadow' opera...") não sejam penalizadas.
 */
function stripQuotedAndConcept(text: string, conceptName?: string): string {
  let cleaned = text.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
  if (conceptName && conceptName.trim().length > 1) {
    const escaped = conceptName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }
  return cleaned;
}

/**
 * Analisa a língua de um texto pedagógico e determina se é Português do Brasil legítimo.
 */
export function detectTextLanguage(
  text: string,
  conceptName?: string
): { detectedLanguage: 'pt-br' | 'en' | 'mixed' | 'unrecognized'; confidenceScore: number; reason: string } {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      detectedLanguage: 'unrecognized',
      confidenceScore: 0,
      reason: 'Texto vazio ou indefinido.',
    };
  }

  const trimmed = text.trim();

  // 1. Verificação de prefixos interrogativos e gramaticais tipicamente ingleses
  const englishStarterRegex = /^(does|do|did|what|how|why|is|are|was|were|can|could|should|would|will|the|in this|according to|focus on)\b/i;
  const startsWithEnglish = englishStarterRegex.test(trimmed);

  // 2. Extração de palavras após remover termos técnicos isolados
  const cleaned = stripQuotedAndConcept(trimmed, conceptName);
  const words = cleaned.toLowerCase().match(/[a-zà-ÿ]+/g) || [];

  if (words.length === 0) {
    // Se só havia o nome do conceito ou caracteres não-alfabéticos
    return {
      detectedLanguage: 'unrecognized',
      confidenceScore: 0,
      reason: 'Sem tokens semânticos suficientes após remoção do conceito.',
    };
  }

  let enCount = 0;
  let ptCount = 0;
  let ptDiacriticsCount = 0;

  for (const word of words) {
    if (ENGLISH_STRUCTURAL_MARKERS.has(word)) {
      enCount++;
    }
    if (PORTUGUESE_STRUCTURAL_MARKERS.has(word)) {
      ptCount++;
    }
    if (/[áàâãéêíóôõúç]/i.test(word)) {
      ptDiacriticsCount++;
    }
  }

  // Pontuação composta em português (stopwords + diacríticos)
  const totalPtScore = ptCount + ptDiacriticsCount;

  // Se inicia com prefixo inglês evidente e não tem forte lastro em português
  if (startsWithEnglish && totalPtScore <= 1) {
    return {
      detectedLanguage: 'en',
      confidenceScore: 0.95,
      reason: `Texto iniciado por padrão estrutural em inglês ('${trimmed.slice(0, 20)}...').`,
    };
  }

  // Se possui marcadores ingleses e nenhum em português
  if (enCount > 0 && totalPtScore === 0) {
    return {
      detectedLanguage: 'en',
      confidenceScore: 0.9,
      reason: `Presença de marcadores da língua inglesa sem conectivos em português.`,
    };
  }

  // Se há marcadores das duas línguas, verifica predominância
  if (enCount > 0 && totalPtScore > 0) {
    if (enCount >= totalPtScore) {
      return {
        detectedLanguage: 'mixed',
        confidenceScore: 0.85,
        reason: `Texto misto com predominância ou inserções substanciais em inglês (${enCount} marcadores EN vs ${totalPtScore} PT).`,
      };
    }
    // Caso contrário, se há muito mais português e apenas 1 termo técnico
    if (totalPtScore >= enCount * 2) {
      return {
        detectedLanguage: 'pt-br',
        confidenceScore: 0.85,
        reason: 'Texto redigido em português do Brasil com termo técnico secundário.',
      };
    }
    return {
      detectedLanguage: 'mixed',
      confidenceScore: 0.75,
      reason: 'Construção mista sem dominância clara de português.',
    };
  }

  // Se não tem marcadores ingleses e tem marcadores em português
  if (enCount === 0 && totalPtScore > 0) {
    return {
      detectedLanguage: 'pt-br',
      confidenceScore: 0.95,
      reason: 'Estrutura gramatical e ortográfica validada em Português do Brasil.',
    };
  }

  // Frases sem stopwords de nenhuma das listas (ex: apenas substantivos raros)
  if (ptDiacriticsCount > 0) {
    return {
      detectedLanguage: 'pt-br',
      confidenceScore: 0.7,
      reason: 'Ortografia com diacríticos característicos da língua portuguesa.',
    };
  }

  return {
    detectedLanguage: 'unrecognized',
    confidenceScore: 0.4,
    reason: 'Não foi possível validar marcadores linguísticos inequívocos de PT-BR.',
  };
}

/**
 * Gera pergunta reflexiva determinística de alta fidelidade em Português do Brasil.
 * NÃO inventa nem finge uma tradução literal do inglês, aplicando formulação socrática robusta.
 */
export function generateDeterministicConceptQuestion(conceptName: string): string {
  const cleanName = conceptName.trim();
  return `Explique com suas próprias palavras o mecanismo de "${cleanName}" e descreva suas causas, etapas e implicações fundamentais.`;
}

/**
 * Gera dica contextual determinística formativa em Português do Brasil.
 */
export function generateDeterministicContextTip(): string {
  return 'Explique as causas, etapas e implicações práticas deste mecanismo, relacionando-o com os princípios fundamentais.';
}

/**
 * Sanitiza perguntas conceituais para garantir fidelidade estrita ao Português do Brasil.
 */
export function sanitizeConceptQuestion(
  rawQuestion: string,
  conceptName: string
): SanitizedI18nResult {
  const detection = detectTextLanguage(rawQuestion, conceptName);

  if (detection.detectedLanguage === 'pt-br') {
    return {
      text: rawQuestion.trim(),
      isFallback: false,
      detectedLanguage: 'pt-br',
      reason: detection.reason,
    };
  }

  return {
    text: generateDeterministicConceptQuestion(conceptName),
    isFallback: true,
    detectedLanguage: detection.detectedLanguage,
    reason: `Substituído por formulação pedagógica determinística em PT-BR: ${detection.reason}`,
  };
}

/**
 * Sanitiza dicas contextuais para garantir fidelidade estrita ao Português do Brasil.
 */
export function sanitizeContextTip(
  rawTip?: string
): SanitizedI18nResult {
  if (!rawTip || rawTip.trim().length === 0) {
    return {
      text: generateDeterministicContextTip(),
      isFallback: true,
      detectedLanguage: 'unrecognized',
      reason: 'Dica não informada ou vazia.',
    };
  }

  const detection = detectTextLanguage(rawTip);

  if (detection.detectedLanguage === 'pt-br') {
    return {
      text: rawTip.trim(),
      isFallback: false,
      detectedLanguage: 'pt-br',
      reason: detection.reason,
    };
  }

  return {
    text: generateDeterministicContextTip(),
    isFallback: true,
    detectedLanguage: detection.detectedLanguage,
    reason: `Substituído por dica pedagógica formativa determinística em PT-BR: ${detection.reason}`,
  };
}

/**
 * FASE 2 — MARCO 2C: CICLO PEDAGÓGICO C.R.E.A.R.
 * Gera cenário de aplicação prática determinístico em Português do Brasil (Estágio APLICAR).
 */
export function generateDeterministicApplicationScenario(conceptName: string, subject?: string): string {
  const cleanName = conceptName.trim();
  const domainArea = subject ? `na área de ${subject.trim()}` : 'no contexto profissional e científico';
  return `Considere um cenário prático ${domainArea} em que o mecanismo de "${cleanName}" é desafiado por uma perturbação crítica. Como você aplicaria os princípios operacionais deste conceito para diagnosticar o problema, prever seu desfecho e propor uma intervenção fundamentada?`;
}

/**
 * Gera pergunta de recuperação ativa determinística em Português do Brasil (Estágio RECUPERAR).
 */
export function generateDeterministicRetrievalQuestion(conceptName: string): string {
  const cleanName = conceptName.trim();
  return `Sem consultar o material ou suas anotações prévias, reconstrua de memória os passos fundamentais do mecanismo de "${cleanName}". Quais são as causas iniciais, a sequência de eventos e as consequências indispensáveis para sua ocorrência?`;
}

/**
 * Sanitiza cenários de aplicação prática garantindo conformidade rigorosa com PT-BR.
 */
export function sanitizeApplicationScenario(
  rawScenario: string,
  conceptName: string,
  subject?: string
): SanitizedI18nResult {
  const detection = detectTextLanguage(rawScenario, conceptName);

  if (detection.detectedLanguage === 'pt-br') {
    return {
      text: rawScenario.trim(),
      isFallback: false,
      detectedLanguage: 'pt-br',
      reason: detection.reason,
    };
  }

  return {
    text: generateDeterministicApplicationScenario(conceptName, subject),
    isFallback: true,
    detectedLanguage: detection.detectedLanguage,
    reason: `Substituído por cenário determinístico de aplicação em PT-BR: ${detection.reason}`,
  };
}

/**
 * Sanitiza desafios de recuperação ativa garantindo conformidade rigorosa com PT-BR.
 */
export function sanitizeRetrievalQuestion(
  rawQuestion: string,
  conceptName: string
): SanitizedI18nResult {
  const detection = detectTextLanguage(rawQuestion, conceptName);

  if (detection.detectedLanguage === 'pt-br') {
    return {
      text: rawQuestion.trim(),
      isFallback: false,
      detectedLanguage: 'pt-br',
      reason: detection.reason,
    };
  }

  return {
    text: generateDeterministicRetrievalQuestion(conceptName),
    isFallback: true,
    detectedLanguage: detection.detectedLanguage,
    reason: `Substituído por formulação determinística de recuperação ativa em PT-BR: ${detection.reason}`,
  };
}


