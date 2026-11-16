/**
 * NeuroClass AI — Segmentador Determinístico de Afirmações e Checagens Locais (Tier 1)
 * @module services/retrieval/claimSegmenter
 *
 * Implementa a primeira camada de avaliação de fundamentação das respostas do tutor:
 * 1. Segmentação conservadora de sentenças preservando integridade de citações [C#];
 * 2. Atribuição de citações à sentença precedente correspondente (inclusive trailing);
 * 3. Neutralização de números estruturais (listas, seções, páginas) e detecção de exemplos hipotéticos;
 * 4. Extração contextual de tokens numéricos preservando unidades físicas e substantivos quantitativos;
 * 5. Verificação determinística preliminar de consistência numérica contra evidências citadas;
 * 6. Política conservadora para sentenças com múltiplas evidências (evitando falso pooling);
 * 7. Classificação operacional rigorosamente não-epistêmica.
 *
 * RESTRIÇÃO EPISTÊMICA FORMAL:
 * Segmentação em sentenças NÃO equivale a extração de claims atômicas semânticas.
 * Verificações lexicais e numéricas locais NÃO comprovam nem verificam a verdade
 * semântica ou entailment factual de uma resposta; apenas identificam divergências
 * determinísticas objetivas (ex: afirmações sem citação ou valores numéricos divergentes).
 * Rótulos afirmativos como 'SUPPORTED', 'PROVEN' ou 'SEMANTICALLY_VERIFIED' são
 * terminantemente PROIBIDOS.
 */

import type {
  GroundingAssessment,
  GroundingSegment,
  GroundingSegmentCheckDetails,
  TutorResponseGroundingResult,
  ControlledEvidenceMap,
  ControlledEvidenceItem,
} from '../../types/rag';

/**
 * Abreviações comuns da língua portuguesa e acadêmicas que não encerram sentença.
 */
export const ACADEMIC_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'dr', 'dra', 'prof', 'profa', 'et al', 'i.e', 'e.g', 'pag', 'pág', 'cap',
  'fig', 'tab', 'vol', 'art', 'coord', 'ed', 'obs', 'cf', 'v.g', 'apud', 'ibid',
  'av', 'al', 'sr', 'sra', 'vs', 'univ', 'dept', 'depto', 'sec', 'seç', 'ref',
  'min', 'max', 'aprox', 'ex',
]);

/**
 * Unidades físicas, científicas e financeiras canônicas registradas.
 */
export const REGISTERED_PHYSICAL_UNITS: ReadonlySet<string> = new Set([
  '%', '‰', 'mg', 'g', 'kg', 'ml', 'l', 'µm', 'um', 'mm', 'cm', 'm', 'km',
  'hz', 'khz', 'mhz', 'ghz', 'ms', 's', 'min', 'h', 'anos', 'dias', 'horas',
  'semanas', 'meses', 'mg/ml', 'mg/l', 'g/l', 'µg/ml', 'ug/ml', 'mv', 'v',
  'r$', '$', 'usd', 'eur', '°c', 'k', 'mol', 'mmol', 'µmol', 'umol'
]);

/**
 * Palavras discursivas funcionais em português que não constituem unidades substantivas de contagem.
 */
export const COMMON_DISCURSIVE_STOPWORDS: ReadonlySet<string> = new Set([
  'de', 'e', 'ou', 'em', 'para', 'com', 'por', 'a', 'o', 'os', 'as', 'no', 'na',
  'nos', 'nas', 'do', 'da', 'dos', 'das', 'que', 'foi', 'foram', 'era', 'eram',
  'é', 'são', 'está', 'estavam', 'ao', 'aos', 'à', 'às', 'um', 'uma', 'uns', 'umas',
  'pelo', 'pela', 'pelos', 'pelas', 'sob', 'sobre', 'após', 'durante', 'entre',
  'desta', 'deste', 'nesta', 'neste'
]);

/**
 * Representação bruta de um segmento de texto extraído antes da avaliação contra evidências.
 */
export interface RawSentenceSegment {
  text: string;
  startOffset: number;
  endOffset: number;
  citationTags: string[];
}

/**
 * Token numérico estruturado preservando grandeza base e unidade/substantivo de contagem.
 */
export interface ParsedNumericToken {
  rawToken: string;
  numericValue: string;
  unitOrNoun: string;
  isRegisteredUnit: boolean;
}

/**
 * Remove acentos para consulta normalizada em conjunto de abreviações.
 */
function normalizeWordForAbbr(word: string): string {
  return word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrai marcadores [C#] presentes em um fragmento de texto.
 */
export function extractCitationTagsFromText(text: string): string[] {
  if (!text) return [];
  const matches = Array.from(text.matchAll(/\[C\s*(\d+)\]/gi));
  const uniqueTags = new Set<string>();
  for (const m of matches) {
    uniqueTags.add(`C${m[1]}`);
  }
  return Array.from(uniqueTags);
}

/**
 * Identifica se a formulação textual corresponde a um exemplo didático ou hipotético.
 * (ex: "imagine 5 pacientes", "suponha 10 voluntários", "por exemplo, considere 3 variáveis").
 */
export function isHypotheticalFraming(text: string): boolean {
  if (!text) return false;
  const hypotheticalPattern =
    /\b(?:imagine|imaginemos|suponha|suponhamos|considere|consideremos|tomemos(?:\s+como)?|a\s+título\s+de\s+exemplo|por\s+exemplo[,\s]+(?:considere|imagine|suponha|tome))\b/i;
  return hypotheticalPattern.test(text);
}

/**
 * Identifica se a formulação textual expressa cálculo ou inferência matemática derivada
 * (ex: "a média foi", "o total calculado", "diferença de").
 */
export function isCalculatedOrInferredContext(text: string): boolean {
  if (!text) return false;
  const calcPattern =
    /\b(?:média|médio|total|soma|diferença|variação|aumento|redução|calculad[oa]|estimad[oa]|resultando\s+em|taxa\s+média)\b/i;
  return calcPattern.test(text);
}

/**
 * Neutraliza números de natureza puramente estrutural ou de paginação
 * para que não sejam tratados indevidamente como dados empíricos do documento.
 */
export function sanitizeStructuralNumbers(text: string): string {
  if (!text) return '';

  // 1. Remove terminantemente tags de citação [C#]
  let sanitized = text.replace(/\[C\s*\d+\]/gi, ' ');

  // 2. Marcadores de lista no início de linha/frase (ex: "1. ", "2) ", "3 - ")
  sanitized = sanitized.replace(/(?:^|\n)\s*\d+[\.\)\-]\s+/g, '\n ');
  sanitized = sanitized.replace(/^\s*\d+[\.\)\-]\s+/, ' ');

  // 3. Referências estruturais a seções, capítulos, itens, figuras, tabelas, diagramas
  sanitized = sanitized.replace(
    /\b(?:seção|seções|secao|secoes|capítulo|capítulos|capitulo|capitulos|item|itens|figura|figuras|tabela|tabelas|quadro|quadros|diagrama|diagramas|apêndice|apendice)\s+\d+(?:[.,]\d+)?\b/gi,
    ' '
  );

  // 4. Referências explícitas de paginação (ex: "pág. 15", "página 20", "páginas 12-14", "pp. 30-35")
  sanitized = sanitized.replace(
    /\b(?:pág|págs|pag|pags|página|páginas|pagina|paginas|pp?)\.?\s+\d+(?:\s*(?:-|a|até)\s*\d+)?\b/gi,
    ' '
  );

  // 5. Cabeçalhos numerados (ex: "# 1. Introdução" ou "## 2.3 Métodos")
  sanitized = sanitized.replace(/^#+\s+\d+(?:[.,]\d+)*\s+/gm, ' ');

  return sanitized;
}

/**
 * Segmenta um texto contínuo de resposta do Tutor em sentenças conservadoras,
 * garantindo que marcadores de citação [C#] imediatamente adjacentes (antes ou
 * depois da pontuação final) permaneçam vinculados à sua sentença de origem.
 */
export function segmentResponseText(text: string): RawSentenceSegment[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const segments: RawSentenceSegment[] = [];
  const len = text.length;
  let start = 0;
  let i = 0;

  while (i < len) {
    const ch = text[i];

    // Quebras explícitas de bloco Markdown (listas com marcadores, numeração ou cabeçalhos)
    if (ch === '\n') {
      const restAfterNewline = text.slice(i + 1);
      const isBlockBoundary =
        /^\s*(\r?\n)/.test(restAfterNewline) || // Linha em branco (parágrafo novo)
        /^\s*([*\-#]|\d+\.)\s+/.test(restAfterNewline); // Item de lista ou heading

      if (isBlockBoundary && i > start) {
        const segText = text.slice(start, i).trim();
        if (segText.length > 0) {
          segments.push({
            text: segText,
            startOffset: start,
            endOffset: i,
            citationTags: extractCitationTagsFromText(segText),
          });
        }
        // Avança start além dos espaços em branco
        let nextStart = i + 1;
        while (nextStart < len && /\s/.test(text[nextStart])) {
          nextStart++;
        }
        start = nextStart;
        i = nextStart;
        continue;
      }
    }

    // Pontuações terminais candidatas
    if (ch === '.' || ch === '!' || ch === '?') {
      // 1. Reticências (...)
      if (ch === '.' && ((i + 1 < len && text[i + 1] === '.') || (i > 0 && text[i - 1] === '.'))) {
        i++;
        continue;
      }

      // 2. Números decimais ou científicos com ponto (ex: 3.14, 1.500)
      if (ch === '.' && i > 0 && /\d/.test(text[i - 1]) && i + 1 < len && /\d/.test(text[i + 1])) {
        i++;
        continue;
      }

      // 3. Abreviações acadêmicas e canônicas
      if (ch === '.') {
        const precedingMatch = text.slice(0, i).match(/([a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]+)$/);
        if (precedingMatch) {
          const rawWord = precedingMatch[1].toLowerCase();
          const normalizedWord = normalizeWordForAbbr(rawWord);
          if (ACADEMIC_ABBREVIATIONS.has(rawWord) || ACADEMIC_ABBREVIATIONS.has(normalizedWord)) {
            i++;
            continue;
          }
        }

        // Iniciais de autores seguidas de ano (ex: "Kandel, E. (2000)")
        if (i >= 1 && /[A-Za-z]/.test(text[i - 1]) && (i === 1 || text[i - 2] === ' ')) {
          const after = text.slice(i + 1).trimStart();
          if (after.startsWith('(') && /^\(\d{4}\)/.test(after)) {
            i++;
            continue;
          }
        }

        // Siglas com pontos consecutivos (ex: U.S.A., Ph.D.)
        if (i + 2 < len && text[i + 1] !== ' ' && text[i + 2] === '.') {
          i++;
          continue;
        }

        // Prefixo numérico curtíssimo de lista no início de linha (ex: "1." ou "2.")
        if (i - start <= 3 && /^\d+$/.test(text.slice(start, i).trim())) {
          i++;
          continue;
        }
      }

      // 4. Fechamento de parênteses, aspas ou colchetes após pontuação
      let scanIdx = i + 1;
      while (scanIdx < len && /["')\]”»’]/.test(text[scanIdx])) {
        scanIdx++;
      }

      // 5. ATRIBUIÇÃO DE CITAÇÃO IMEDIATAMENTE TRAILING:
      // Se houver tags [C#] imediatamente após a pontuação (ex: "memória. [C1]" ou "memória. [C1][C2]"),
      // estas tags DEVEM pertencer a esta sentença, e NÃO à próxima!
      while (scanIdx < len) {
        const trailingSlice = text.slice(scanIdx);
        const matchTrailingCitation = trailingSlice.match(/^\s*(\[C\s*\d+\])/i);
        if (matchTrailingCitation) {
          scanIdx += matchTrailingCitation[0].length;
          // Consome pontuação imediatamente posterior à tag (ex: "[C1].")
          while (scanIdx < len && /[.,;!?'")\]”»’]/.test(text[scanIdx])) {
            scanIdx++;
          }
        } else {
          break;
        }
      }

      // 6. Verificar se é término do texto ou se há whitespace seguido de nova sentença
      if (scanIdx >= len) {
        const segText = text.slice(start, len).trim();
        if (segText.length > 0) {
          segments.push({
            text: segText,
            startOffset: start,
            endOffset: len,
            citationTags: extractCitationTagsFromText(segText),
          });
        }
        start = len;
        break;
      }

      if (/\s/.test(text[scanIdx])) {
        let wsEnd = scanIdx;
        while (wsEnd < len && /\s/.test(text[wsEnd])) {
          wsEnd++;
        }

        let isBoundary = false;
        if (wsEnd >= len) {
          isBoundary = true;
        } else {
          const nextChar = text[wsEnd];
          const hasDoubleNewline = /\n\r?\n/.test(text.slice(scanIdx, wsEnd));
          // Validação da próxima sentença: maiúscula, bullet, heading, aspas, dígito ou parágrafo novo
          if (/[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ#\-\*\d"\(«“]/.test(nextChar) || hasDoubleNewline) {
            isBoundary = true;
          }
        }

        if (isBoundary) {
          const segText = text.slice(start, scanIdx).trim();
          if (segText.length > 0) {
            segments.push({
              text: segText,
              startOffset: start,
              endOffset: scanIdx,
              citationTags: extractCitationTagsFromText(segText),
            });
          }
          start = wsEnd;
          i = wsEnd;
          continue;
        }
      }
    }
    i++;
  }

  // Segmento residual final
  if (start < len) {
    const segText = text.slice(start, len).trim();
    if (segText.length > 0) {
      segments.push({
        text: segText,
        startOffset: start,
        endOffset: len,
        citationTags: extractCitationTagsFromText(segText),
      });
    }
  }

  return segments;
}

/**
 * Extrai tokens numéricos estruturados de um texto, preservando grandeza e contexto de unidade.
 */
export function extractParsedNumericTokens(text: string): ParsedNumericToken[] {
  if (!text) return [];

  const sanitized = sanitizeStructuralNumbers(text);
  const tokens: ParsedNumericToken[] = [];
  const seen = new Set<string>();

  // Captura o número e opcionalmente a unidade física ou substantivo subsequente
  const pattern = /(?<![a-zA-Z\d])(\d+(?:[.,]\d+)*)(?:\s*([a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ%\/°$]+))?/gi;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sanitized)) !== null) {
    const numStr = m[1];
    let unitOrNoun = (m[2] || '').trim().toLowerCase();
    // Remove pontuação trailing residual
    unitOrNoun = unitOrNoun.replace(/[.,;:]+$/, '');

    if (unitOrNoun && COMMON_DISCURSIVE_STOPWORDS.has(unitOrNoun)) {
      unitOrNoun = '';
    }

    const isRegistered = Boolean(unitOrNoun && REGISTERED_PHYSICAL_UNITS.has(unitOrNoun));
    const rawToken = unitOrNoun ? `${numStr} ${unitOrNoun}` : numStr;

    if (!seen.has(rawToken)) {
      seen.add(rawToken);
      tokens.push({
        rawToken,
        numericValue: numStr,
        unitOrNoun,
        isRegisteredUnit: isRegistered,
      });
    }
  }

  return tokens;
}

/**
 * Extrai a lista de representações textuais dos números (compatibilidade retroativa).
 */
export function extractNumericTokens(text: string): string[] {
  const parsed = extractParsedNumericTokens(text);
  return parsed.map((p) => p.rawToken);
}

/**
 * Constrói expressão regular determinística para localização estrita de um número
 * na evidência, respeitando equivalência de vírgula/ponto decimal e unidades/substantivos.
 */
export function buildDeterministicNumberRegex(token: string | ParsedNumericToken): RegExp {
  let numPart: string;
  let unitPart = '';

  if (typeof token === 'object' && token !== null) {
    numPart = token.numericValue;
    unitPart = token.unitOrNoun || '';
  } else {
    const match = token.match(/^(\d+(?:[.,]\d+)*)(?:\s*(.*))?$/);
    if (!match) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![a-zA-Z\\d])${escaped}(?![a-zA-Z\\d])`, 'i');
    }
    numPart = match[1];
    unitPart = (match[2] || '').trim();
  }

  const flexibleNumber = numPart.replace(/[.,]/g, '[,.]');

  if (unitPart) {
    const escapedUnit = unitPart.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    return new RegExp(`(?<!\\d)${flexibleNumber}\\s*${escapedUnit}(?![a-zA-Z\\d])`, 'i');
  }

  // Apenas número isolado (não precedido/sucedido por dígito ou decimal subsequente)
  return new RegExp(`(?<!\\d)${flexibleNumber}(?![\\d]|[,.]\\d)`, 'i');
}

/**
 * Verifica se um token numérico estruturado possui correspondência legítima na evidência.
 */
export function isParsedNumberInEvidence(
  token: ParsedNumericToken,
  evidenceTexts: string[]
): boolean {
  if (!evidenceTexts || evidenceTexts.length === 0) return false;

  const flexibleNum = token.numericValue.replace(/[.,]/g, '[,.]');

  if (token.unitOrNoun) {
    const escapedUnit = token.unitOrNoun.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    const withUnitRegex = new RegExp(`(?<!\\d)${flexibleNum}\\s*${escapedUnit}(?![a-zA-Z\\d])`, 'i');

    for (const ev of evidenceTexts) {
      if (!ev) continue;
      if (withUnitRegex.test(ev)) {
        return true;
      }
    }
    return false;
  }

  // Para número isolado sem unidade ou substantivo:
  // Verifica correspondência exata sem unidade conflitante incompatível anexada
  const bareRegex = new RegExp(`(?<!\\d)${flexibleNum}(?![\\d]|[,.]\\d)`, 'i');
  for (const ev of evidenceTexts) {
    if (!ev) continue;
    if (bareRegex.test(ev)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se um token numérico é atestado literalmente em ao menos um dos trechos de evidência.
 * (Mantido com compatibilidade retroativa para strings).
 */
export function isNumberInEvidencePool(numToken: string, evidenceTexts: string[]): boolean {
  if (!evidenceTexts || evidenceTexts.length === 0) {
    return false;
  }

  const match = numToken.match(/^(\d+(?:[.,]\d+)*)(?:\s*(.*))?$/);
  if (match) {
    const numPart = match[1];
    let unitOrNoun = (match[2] || '').trim().toLowerCase();
    unitOrNoun = unitOrNoun.replace(/[.,;:]+$/, '');
    const isRegistered = Boolean(unitOrNoun && REGISTERED_PHYSICAL_UNITS.has(unitOrNoun));
    return isParsedNumberInEvidence(
      {
        rawToken: numToken,
        numericValue: numPart,
        unitOrNoun,
        isRegisteredUnit: isRegistered,
      },
      evidenceTexts
    );
  }

  const regex = buildDeterministicNumberRegex(numToken);
  for (const ev of evidenceTexts) {
    if (!ev) continue;
    if (regex.test(ev)) return true;
  }
  return false;
}

/**
 * Recupera os textos literais de evidência para um conjunto de tags canônicas [C#].
 * Suporta Map, Record ou Array de evidências/referências.
 */
export function getEvidenceTextsForTags(
  tags: string[],
  evidenceMap:
    | ControlledEvidenceMap
    | Map<string, ControlledEvidenceItem>
    | Record<string, ControlledEvidenceItem>
    | Array<{ id?: string; excerpt?: string; text?: string }>
    | any
): { texts: string[]; chunkIds: string[] } {
  const texts: string[] = [];
  const chunkIds: string[] = [];

  if (Array.isArray(evidenceMap)) {
    for (const tag of tags) {
      const numMatch = tag.match(/\d+/);
      if (numMatch) {
        const idx = parseInt(numMatch[0], 10) - 1;
        if (idx >= 0 && idx < evidenceMap.length) {
          const item = evidenceMap[idx];
          if (item) {
            const txt = (item as any).text || (item as any).excerpt || '';
            if (txt) texts.push(txt);
            if (item.id) chunkIds.push(item.id);
          }
        }
      }
    }
    return { texts, chunkIds };
  }

  const map: Map<string, ControlledEvidenceItem> =
    evidenceMap instanceof Map
      ? evidenceMap
      : new Map(Object.entries(evidenceMap || {}));

  for (const tag of tags) {
    const item = map.get(tag);
    if (item) {
      if (item.text) texts.push(item.text);
      if (item.evidenceReference?.excerpt && item.evidenceReference.excerpt !== item.text) {
        texts.push(item.evidenceReference.excerpt);
      }
      if (item.chunkId) chunkIds.push(item.chunkId);
    }
  }

  return { texts, chunkIds };
}

/**
 * Avalia deterministamente um segmento bruto contra as evidências controladas disponíveis.
 */
export function evaluateSegmentGrounding(
  segment: RawSentenceSegment,
  evidenceMap: ControlledEvidenceMap | Map<string, ControlledEvidenceItem> | Record<string, ControlledEvidenceItem>,
  index: number
): GroundingSegment {
  const parsedTokens = extractParsedNumericTokens(segment.text);
  const extractedNumbers = parsedTokens.map((p) => p.rawToken);
  const { texts: evidenceTexts, chunkIds } = getEvidenceTextsForTags(segment.citationTags, evidenceMap);

  let assessment: GroundingAssessment;
  const unmatchedNumbers: string[] = [];
  let notes: string;

  // 1. Caso sem citação
  if (segment.citationTags.length === 0) {
    assessment = 'UNCITED_SEGMENT';
    notes = 'Segmento afirmativo sem marcador de citação direta de evidência documental [C#].';
  } else {
    // 2. Validação dos números presentes contra o pool de evidências
    for (const token of parsedTokens) {
      const isFound = isParsedNumberInEvidence(token, evidenceTexts);
      if (!isFound) {
        unmatchedNumbers.push(token.rawToken);
      }
    }

    if (unmatchedNumbers.length > 0) {
      // ACH-NUM-01: Exemplo didático/hipotético explícito ("imagine / suponha / considere")
      if (isHypotheticalFraming(segment.text)) {
        assessment = 'UNASSESSED';
        notes =
          'Segmento contém formulação didática ou hipotética ("imagine / suponha / considere"). ' +
          'A correspondência empírica documental não foi avaliada deterministamente.';
      } else if (isCalculatedOrInferredContext(segment.text)) {
        // Valores calculados / inferências
        assessment = 'NUMERIC_REVIEW_REQUIRED';
        notes =
          `Valor(es) [${unmatchedNumbers.join(', ')}] não encontrados literalmente nos excertos citados. ` +
          'Contexto de cálculo ou inferência derivável; recomendada conferência manual no documento original.';
      } else {
        assessment = 'NUMERIC_REVIEW_REQUIRED';
        notes = `Valor(es) [${unmatchedNumbers.join(', ')}] presentes no segmento não encontrados literalmente ou com a mesma unidade nas evidências citadas.`;
      }
    } else {
      // ACH-EVD-01: Política conservadora para sentenças com múltiplas evidências citadas
      if (segment.citationTags.length > 1) {
        assessment = 'UNASSESSED';
        notes =
          `Múltiplas fontes citadas (${segment.citationTags.join(', ')}). ` +
          'A segmentação sintática em nível de sentença não permite verificar deterministamente a atribuição individual ' +
          'de cada afirmação à sua fonte específica; avaliação semântica detalhada não realizada localmente.';
      } else {
        // Citação única e sem anomalias
        assessment = 'NO_DETERMINISTIC_ALERT';
        notes =
          'Citação documental válida e nenhuma divergência numérica determinística detectada. ' +
          'DECLARAÇÃO FORMAL: Este status NÃO equivale a comprovação factual ou verificação semântica.';
      }
    }
  }

  const checkDetails: GroundingSegmentCheckDetails = {
    extractedNumbers,
    unmatchedNumbers,
  };

  return {
    id: `seg_${index + 1}`,
    index,
    text: segment.text,
    citationTags: segment.citationTags,
    evidenceChunkIds: chunkIds,
    assessment,
    granularity: 'sentence',
    checks: checkDetails,
    notes,
  };
}

/**
 * Orquestra o processamento determinístico completo de fundamentação da resposta do tutor.
 * Mede latência precisa de execução e retorna os segmentos anotados com contadores consolidados.
 */
export function processResponseGroundingSegments(
  cleanedText: string,
  evidenceMap: ControlledEvidenceMap | Map<string, ControlledEvidenceItem> | Record<string, ControlledEvidenceItem>
): TutorResponseGroundingResult {
  const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  const rawSegments = segmentResponseText(cleanedText);

  let uncitedCount = 0;
  let numericReviewCount = 0;
  let noAlertCount = 0;
  let unassessedCount = 0;

  const segments: GroundingSegment[] = rawSegments.map((rawSeg, idx) => {
    const assessed = evaluateSegmentGrounding(rawSeg, evidenceMap, idx);
    switch (assessed.assessment) {
      case 'UNCITED_SEGMENT':
        uncitedCount++;
        break;
      case 'NUMERIC_REVIEW_REQUIRED':
        numericReviewCount++;
        break;
      case 'NO_DETERMINISTIC_ALERT':
        noAlertCount++;
        break;
      case 'UNASSESSED':
        unassessedCount++;
        break;
    }
    return assessed;
  });

  const endTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const executionTimeMs = Number((endTime - startTime).toFixed(3));

  return {
    segments,
    executionTimeMs,
    summary: {
      totalSegments: segments.length,
      uncitedCount,
      numericReviewCount,
      noAlertCount,
      unassessedCount,
    },
  };
}
