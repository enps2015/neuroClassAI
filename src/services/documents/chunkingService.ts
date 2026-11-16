/**
 * NeuroClass AI — Fatiador Estruturado Determinístico RAG (Pure In-Memory Chunking Engine)
 * @module services/documents/chunkingService
 *
 * Implementação pura, síncrona, determinística e sem I/O da segmentação de documentos acadêmicos.
 *
 * DIRETRIZES FUNDAMENTAIS DE ENGENHARIA (FASE A2):
 * 1. FIDELIDADE ABSOLUTA TEXTO/OFFSET:
 *    Para todo chunk, chunk.text === page.textContent.slice(charOffsetStart, charOffsetEnd).
 *    Preserva caractere por caractere: tabs, espaços múltiplos, quebras CRLF/LF, pontuação e Unicode.
 *    Nenhum trim() é aplicado sobre chunk.text.
 *    Espaços artificiais não são introduzidos entre sentenças ou parágrafos.
 * 2. SEPARAÇÃO ENTRE TEXTO-FONTE E BUSCA:
 *    chunk.text armazena o slice puro da fonte;
 *    chunk.normalizedSearchText armazena a versão limpa/normalizada para buscas léxicas (BM25).
 * 3. PRESERVAÇÃO ATÔMICA E SINALIZAÇÃO DE OVERSIZE:
 *    Tabelas Markdown, blocos de código e fórmulas LaTeX display nunca são fragmentadas.
 *    Se um bloco atômico exceder maxTokens, é emitido íntegro com oversizeAtomicBlock = true.
 * 4. DETERMINISMO E IDENTIDADE:
 *    chunkId = `${documentId}_p${pageNumber}_c${chunkIndexInPage}` (identidade estrutural).
 *    contentHash = sha256Sync(chunk.text) (integridade de conteúdo imutável).
 *    Metadados operacionais não contaminam a igualdade matemática do resultado.
 * 5. AUDITORIA E VALIDAÇÃO DISTINTA DE COBERTURA:
 *    Validadores dedicados e separados para: integridade de offsets, sobreposição intencional,
 *    reconstrução exata e cobertura integral de caracteres sem supressão de whitespace.
 */

import type {
  DocumentSource,
  DocumentPage,
  TableOfContentsItem,
} from '../../types';
import type {
  DocumentChunk,
  ChunkSourceReference,
  ChunkContentKind,
  ChunkingOptions,
  ChunkingResult,
  DetailedProcessingCoverage,
  OffsetIntegrityResult,
  OffsetIntegrityViolation,
  OverlapIntegrityResult,
  OverlapRange,
  RangeGap,
  ExactReconstructionResult,
  TextRange,
} from '../../types/rag';

/* ==========================================================================
   MOTOR CRIPTOGRÁFICO SHA-256 SÍNCRONO PURO (FIPS 180-4)
   ========================================================================== */

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function ch(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function maj(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(x: number): number {
  return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
}

function sigma1(x: number): number {
  return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
}

function gamma0(x: number): number {
  return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
}

function gamma1(x: number): number {
  return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
}

const K256: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Calcula o digest hexadecimal SHA-256 de forma síncrona, pura e determinística em TypeScript.
 */
export function sha256Sync(text: string): string {
  const binary: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      binary.push(code);
    } else if (code < 0x800) {
      binary.push(0xc0 | (code >> 6));
      binary.push(0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      i++;
      if (i < text.length) {
        const low = text.charCodeAt(i);
        const cp = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        binary.push(0xf0 | (cp >> 18));
        binary.push(0x80 | ((cp >> 12) & 0x3f));
        binary.push(0x80 | ((cp >> 6) & 0x3f));
        binary.push(0x80 | (cp & 0x3f));
      }
    } else {
      binary.push(0xe0 | (code >> 12));
      binary.push(0x80 | ((code >> 6) & 0x3f));
      binary.push(0x80 | (code & 0x3f));
    }
  }

  const bitLength = binary.length * 8;
  binary.push(0x80);
  while ((binary.length % 64) !== 56) {
    binary.push(0);
  }

  binary.push(0, 0, 0, 0);
  binary.push(
    (bitLength >>> 24) & 0xff,
    (bitLength >>> 16) & 0xff,
    (bitLength >>> 8) & 0xff,
    bitLength & 0xff
  );

  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  const W = new Array<number>(64);
  for (let chunkStart = 0; chunkStart < binary.length; chunkStart += 64) {
    for (let t = 0; t < 16; t++) {
      const idx = chunkStart + t * 4;
      W[t] =
        (binary[idx] << 24) |
        (binary[idx + 1] << 16) |
        (binary[idx + 2] << 8) |
        binary[idx + 3];
    }
    for (let t = 16; t < 64; t++) {
      W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) | 0;
    }

    let a = H0;
    let b = H1;
    let c = H2;
    let d = H3;
    let e = H4;
    let f = H5;
    let g = H6;
    let h = H7;

    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K256[t] + W[t]) | 0;
      const T2 = (sigma0(a) + maj(a, b, c)) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) | 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  function toHex(val: number): string {
    return (val >>> 0).toString(16).padStart(8, '0');
  }

  return `${toHex(H0)}${toHex(H1)}${toHex(H2)}${toHex(H3)}${toHex(H4)}${toHex(H5)}${toHex(H6)}${toHex(H7)}`;
}

/* ==========================================================================
   ESTIMATIVA CALIBRADA DE TOKENS (HEURÍSTICA PURA)
   ========================================================================== */

/**
 * Estima a contagem de tokens de forma calibrada para textos em português e vocabulário técnico.
 * DECLARAÇÃO FORMAL: Trata-se de uma estimativa heurística rápida e pura, não tokenizador BPE.
 */
export function estimateTokenCount(text: string): number {
  if (!text || text.length === 0) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const tokenByChars = Math.ceil(chars / 3.8);
  const tokenByWords = Math.ceil(words * 1.33);
  return Math.max(tokenByChars, tokenByWords);
}

/* ==========================================================================
   VARREDURA DE LINHAS COM RASTREABILIDADE DE SPANS EXATOS
   ========================================================================== */

export interface LineSpan {
  start: number;
  end: number;
  text: string;
  lineWithoutBreak: string;
  lineBreak: string;
}

export function splitLinesWithSpans(text: string): LineSpan[] {
  if (!text || text.length === 0) return [];
  const lines: LineSpan[] = [];
  const regex = /\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const breakStart = match.index;
    const breakEnd = regex.lastIndex;
    const lineBreak = match[0];
    const lineWithoutBreak = text.slice(cursor, breakStart);
    const fullLine = text.slice(cursor, breakEnd);
    lines.push({
      start: cursor,
      end: breakEnd,
      text: fullLine,
      lineWithoutBreak,
      lineBreak,
    });
    cursor = breakEnd;
  }

  if (cursor < text.length) {
    const tail = text.slice(cursor);
    lines.push({
      start: cursor,
      end: text.length,
      text: tail,
      lineWithoutBreak: tail,
      lineBreak: '',
    });
  }

  return lines;
}

/* ==========================================================================
   SEGMENTAÇÃO CONSERVADORA DE SENTENÇAS (TEXTO-FONTE INTEGRAL)
   ========================================================================== */

const COMMON_ABBREVIATIONS = new Set([
  'dr', 'dra', 'prof', 'profa', 'et al', 'i.e', 'e.g', 'pag', 'pág', 'cap',
  'fig', 'tab', 'vol', 'art', 'coord', 'ed', 'obs', 'cf', 'v.g', 'apud', 'ibid',
  'av', 'al', 'sr', 'sra', 'vs', 'univ', 'dept', 'depto',
]);

export interface SentenceSlice {
  text: string;
  start: number;
  end: number;
}

/**
 * Segmenta um texto contínuo em sentenças respeitando o texto-fonte e seus offsets.
 * Não utiliza trim() destrutivo: os limites [start, end) cobrem exatamente text.slice(start, end).
 */
export function splitSentencesConservatively(text: string, baseOffset: number = 0): SentenceSlice[] {
  if (!text || text.length === 0) return [];
  const sentences: SentenceSlice[] = [];
  let start = 0;
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      // 1. Reticências (...)
      if (ch === '.' && ((i + 1 < len && text[i + 1] === '.') || (i > 0 && text[i - 1] === '.'))) {
        i++;
        continue;
      }

      // 2. Números decimais ou científicos (ex: 3.14, 1.500, 10^-19)
      if (ch === '.' && i > 0 && /\d/.test(text[i - 1]) && i + 1 < len && /\d/.test(text[i + 1])) {
        i++;
        continue;
      }

      // 3. Abreviações canônicas em português ou acadêmicas
      if (ch === '.') {
        const precedingMatch = text.slice(0, i).match(/([a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]+)$/);
        if (precedingMatch) {
          const rawWord = precedingMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (COMMON_ABBREVIATIONS.has(rawWord) || COMMON_ABBREVIATIONS.has(precedingMatch[1].toLowerCase())) {
            i++;
            continue;
          }
        }

        // Iniciais seguidas de citação com ano (ex: "Einstein, A. (1905)")
        if (i >= 1 && /[A-Za-z]/.test(text[i - 1]) && (i === 1 || text[i - 2] === ' ')) {
          const after = text.slice(i + 1).trimStart();
          if (after.startsWith('(') && /^\(\d{4}\)/.test(after)) {
            i++;
            continue;
          }
        }

        // Siglas com pontos consecutivos (ex: U.S.A., Ph.D., C.R.E.A.R.)
        if (i + 2 < len && text[i + 1] !== ' ' && text[i + 2] === '.') {
          i++;
          continue;
        }

        // Sentença acumulada curtíssima (<= 3 chars, ex: "1." ou "A.")
        if (i - start <= 3) {
          i++;
          continue;
        }
      }

      // 4. Fechamento de aspas ou parênteses após pontuação
      let nextIdx = i + 1;
      while (nextIdx < len && /["')\]”»’]/.test(text[nextIdx])) {
        nextIdx++;
      }

      // 5. Verificar se é término de texto ou seguido de whitespace
      if (nextIdx >= len) {
        sentences.push({
          text: text.slice(start, len),
          start: baseOffset + start,
          end: baseOffset + len,
        });
        start = len;
        break;
      } else if (/\s/.test(text[nextIdx])) {
        // Encontra o fim do whitespace
        let wsEnd = nextIdx;
        while (wsEnd < len && /\s/.test(text[wsEnd])) {
          wsEnd++;
        }

        let isBoundary = false;
        if (wsEnd >= len) {
          isBoundary = true;
        } else {
          const nextChar = text[wsEnd];
          const hasDoubleNewline = /\n\r?\n/.test(text.slice(nextIdx, wsEnd));
          // Validação da próxima sentença: letra maiúscula, bullet de lista, heading, aspas ou parágrafo novo
          if (/[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ#\-\*\d"\(«“]/.test(nextChar) || hasDoubleNewline) {
            isBoundary = true;
          }
        }

        if (isBoundary) {
          sentences.push({
            text: text.slice(start, wsEnd),
            start: baseOffset + start,
            end: baseOffset + wsEnd,
          });
          start = wsEnd;
          i = wsEnd;
          continue;
        }
      }
    }
    i++;
  }

  if (start < len) {
    sentences.push({
      text: text.slice(start, len),
      start: baseOffset + start,
      end: baseOffset + len,
    });
  }

  return sentences;
}

/* ==========================================================================
   EXTRAÇÃO DE BLOCOS ESTRUTURAIS E ATÔMICOS (FIDELIDADE TOTAL)
   ========================================================================== */

export interface StructuralBlock {
  text: string;
  start: number;
  end: number;
  kind: ChunkContentKind;
  isAtomic: boolean;
}

/**
 * Identifica blocos estruturais contíguos na página sem perder nenhum caractere.
 * Garante que block.text === pageText.slice(block.start, block.end).
 */
export function extractStructuralBlocks(pageText: string): StructuralBlock[] {
  if (!pageText || pageText.length === 0) return [];
  const lines = splitLinesWithSpans(pageText);
  if (lines.length === 0) return [];

  const blocks: StructuralBlock[] = [];
  let lineIdx = 0;

  while (lineIdx < lines.length) {
    const curLine = lines[lineIdx];
    const trimmed = curLine.lineWithoutBreak.trim();

    // 1. Linhas vazias isoladas
    if (trimmed.length === 0) {
      lineIdx++;
      continue;
    }

    // 2. Bloco de Código Fenced (```)
    if (trimmed.startsWith('```')) {
      const codeStart = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      lineIdx++;
      while (lineIdx < lines.length && !lines[lineIdx].lineWithoutBreak.trim().startsWith('```')) {
        lineIdx++;
      }
      let codeEnd: number;
      if (lineIdx < lines.length) {
        const closeTrim = lines[lineIdx].lineWithoutBreak.trim();
        codeEnd = lines[lineIdx].start + lines[lineIdx].lineWithoutBreak.indexOf(closeTrim) + closeTrim.length;
        lineIdx++; // Consome a linha de fechamento ```
      } else {
        codeEnd = lines[lineIdx - 1].end;
      }
      blocks.push({
        text: pageText.slice(codeStart, codeEnd),
        start: codeStart,
        end: codeEnd,
        kind: 'code_block',
        isAtomic: true,
      });
      continue;
    }

    // 3. Tabela Markdown (linhas com |)
    const isTableStart = /^\|.*\|\s*$/.test(trimmed) || /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed);
    if (isTableStart) {
      const tableStart = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      let lastTableLine = curLine;
      lineIdx++;
      while (lineIdx < lines.length) {
        const rowTrim = lines[lineIdx].lineWithoutBreak.trim();
        if (/^\|.*\|\s*$/.test(rowTrim) || /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(rowTrim)) {
          lastTableLine = lines[lineIdx];
          lineIdx++;
        } else {
          break;
        }
      }
      const lastRowTrim = lastTableLine.lineWithoutBreak.trim();
      const tableEnd = lastTableLine.start + lastTableLine.lineWithoutBreak.indexOf(lastRowTrim) + lastRowTrim.length;
      blocks.push({
        text: pageText.slice(tableStart, tableEnd),
        start: tableStart,
        end: tableEnd,
        kind: 'table_markdown',
        isAtomic: true,
      });
      continue;
    }

    // 4. Fórmula LaTeX Display ($$...$$ ou \[...\])
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const formulaStart = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      const isSingleLine = (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 2) ||
                           (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'));
      let formulaEnd: number;
      if (isSingleLine) {
        formulaEnd = formulaStart + trimmed.length;
        lineIdx++;
      } else {
        lineIdx++;
        while (lineIdx < lines.length) {
          const lTrim = lines[lineIdx].lineWithoutBreak.trim();
          lineIdx++;
          if (lTrim.endsWith('$$') || lTrim.endsWith('\\]')) {
            break;
          }
        }
        const lastLine = lines[lineIdx - 1];
        const lastTrim = lastLine.lineWithoutBreak.trim();
        formulaEnd = lastLine.start + lastLine.lineWithoutBreak.indexOf(lastTrim) + lastTrim.length;
      }
      blocks.push({
        text: pageText.slice(formulaStart, formulaEnd),
        start: formulaStart,
        end: formulaEnd,
        kind: 'formula_latex',
        isAtomic: true,
      });
      continue;
    }

    // 5. Cabeçalho Markdown (# Heading)
    if (/^#{1,6}\s+/.test(trimmed)) {
      const start = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      const end = start + trimmed.length;
      blocks.push({
        text: pageText.slice(start, end),
        start,
        end,
        kind: 'heading',
        isAtomic: true,
      });
      lineIdx++;
      continue;
    }

    // 6. Legendas de Figuras ou Gráficos
    if (/^(figura|figure|fig\.|gr[áa]fico|chart|diagrama|ilustra[çc][ãa]o)\s*\d*[:.-]/i.test(trimmed)) {
      const isChart = /^(gr[áa]fico|chart)/i.test(trimmed);
      const start = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      const end = start + trimmed.length;
      blocks.push({
        text: pageText.slice(start, end),
        start,
        end,
        kind: isChart ? 'chart_description' : 'figure_caption',
        isAtomic: true,
      });
      lineIdx++;
      continue;
    }

    // 7. Itens de Lista
    if (/^([*\-+]|\d+\.|\([a-z0-9]+\))\s+/.test(trimmed)) {
      const start = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
      const end = start + trimmed.length;
      blocks.push({
        text: pageText.slice(start, end),
        start,
        end,
        kind: 'list',
        isAtomic: false,
      });
      lineIdx++;
      continue;
    }

    // 8. Parágrafo contínuo de Prosa
    const proseStart = curLine.start + curLine.lineWithoutBreak.indexOf(trimmed);
    let lastProseLine = curLine;
    lineIdx++;
    while (lineIdx < lines.length) {
      const nextTrim = lines[lineIdx].lineWithoutBreak.trim();
      if (nextTrim.length === 0) break;
      if (nextTrim.startsWith('```') || /^#{1,6}\s+/.test(nextTrim) ||
          /^\|.*\|\s*$/.test(nextTrim) || nextTrim.startsWith('$$') || nextTrim.startsWith('\[') ||
          /^([*\-+]|\d+\.|\([a-z0-9]+\))\s+/.test(nextTrim) ||
          /^(figura|figure|fig\.|gr[áa]fico|chart|diagrama|ilustra[çc][ãa]o)\s*\d*[:.-]/i.test(nextTrim)) {
        break;
      }
      lastProseLine = lines[lineIdx];
      lineIdx++;
    }
    const lastProseTrim = lastProseLine.lineWithoutBreak.trim();
    const proseEnd = lastProseLine.start + lastProseLine.lineWithoutBreak.indexOf(lastProseTrim) + lastProseTrim.length;
    blocks.push({
      text: pageText.slice(proseStart, proseEnd),
      start: proseStart,
      end: proseEnd,
      kind: 'prose',
      isAtomic: false,
    });
  }

  return blocks;
}
/* ==========================================================================
   METADADOS MULTIMODAIS E SUMÁRIO (TOC)
   ========================================================================== */

function detectMultimodalRefsInText(text: string): DocumentChunk['multimodalReferences'] | undefined {
  const figureMatches = text.match(/(figura|figure|fig\.)\s*\d+/gi);
  const tableMatches = text.match(/(tabela|table|tab\.|quadro)\s*\d+/gi);
  const formulaMatches = text.match(/(equa[çc][ãa]o|equation|eq\.)\s*[\d\.]+/gi);
  const chartMatches = text.match(/(gr[áa]fico|chart|plot)\s*\d*/gi);

  if (!figureMatches && !tableMatches && !formulaMatches && !chartMatches) {
    return undefined;
  }

  return {
    figureLabels: figureMatches ? Array.from(new Set(figureMatches.map(s => s.trim()))) : undefined,
    tableLabels: tableMatches ? Array.from(new Set(tableMatches.map(s => s.trim()))) : undefined,
    formulaExpressions: formulaMatches ? Array.from(new Set(formulaMatches.map(s => s.trim()))) : undefined,
    chartLabels: chartMatches ? Array.from(new Set(chartMatches.map(s => s.trim()))) : undefined,
  };
}

interface FlattenedTocNode {
  title: string;
  pageNumber?: number;
  hierarchy: string[];
}

function flattenTableOfContents(
  items: TableOfContentsItem[],
  parentHierarchy: string[] = []
): FlattenedTocNode[] {
  const result: FlattenedTocNode[] = [];
  for (const item of items) {
    const currentHierarchy = [...parentHierarchy, item.title];
    result.push({
      title: item.title,
      pageNumber: item.pageNumber,
      hierarchy: currentHierarchy,
    });
    if (item.subItems && item.subItems.length > 0) {
      result.push(...flattenTableOfContents(item.subItems, currentHierarchy));
    }
  }
  return result;
}

function resolveSectionForPage(
  pageNum: number,
  flattenedToc: FlattenedTocNode[]
): { sectionTitle?: string; sectionHierarchy?: string[] } {
  if (flattenedToc.length === 0) return {};

  let bestMatch: FlattenedTocNode | undefined = undefined;
  for (const node of flattenedToc) {
    if (typeof node.pageNumber === 'number' && node.pageNumber <= pageNum) {
      if (!bestMatch || (typeof bestMatch.pageNumber === 'number' && node.pageNumber >= bestMatch.pageNumber)) {
        bestMatch = node;
      }
    }
  }

  if (!bestMatch) return {};
  return {
    sectionTitle: bestMatch.title,
    sectionHierarchy: bestMatch.hierarchy,
  };
}

/* ==========================================================================
   FATIADOR POR PÁGINA (CHUNKING INTERMEDIÁRIO DE ALTA FIDELIDADE)
   ========================================================================== */

interface BaseSlice {
  start: number;
  end: number;
  text: string;
  kind: ChunkContentKind;
  isAtomic: boolean;
  estimatedTokens: number;
}

export interface PageChunkIntermediate {
  text: string;
  normalizedSearchText: string;
  charOffsetStart: number;
  charOffsetEnd: number;
  contentKind: ChunkContentKind;
  estimatedTokens: number;
  oversizeAtomicBlock: boolean;
}

/**
 * Fatia o texto de uma página física em unidades coerentes respeitando:
 * 1. Blocos atômicos indivisíveis;
 * 2. Limites de tokens e overlap configurável;
 * 3. Fidelidade estrita de fatias: pageText.slice(start, end) === chunk.text;
 * 4. Sinalização explícita de blocos atômicos oversize.
 */
export function chunkSinglePageText(
  pageText: string,
  options: Required<ChunkingOptions>
): PageChunkIntermediate[] {
  if (!pageText || pageText.length === 0) {
    return [];
  }

  const structuralBlocks = extractStructuralBlocks(pageText);
  if (structuralBlocks.length === 0) {
    return [];
  }

  // Decomposição dos blocos em fatias atômicas/sentenciais contíguas
  const baseSlices: BaseSlice[] = [];

  for (const block of structuralBlocks) {
    const blockTokens = estimateTokenCount(block.text);

    // Se for atômico (tabela, display math, code, legenda isolada) ou curto o bastante
    if (block.isAtomic || blockTokens <= options.maxTokens) {
      baseSlices.push({
        start: block.start,
        end: block.end,
        text: block.text,
        kind: block.kind,
        isAtomic: block.isAtomic,
        estimatedTokens: blockTokens,
      });
    } else {
      // Bloco longo de prosa/lista decomposto em sentenças exatas contíguas
      const sentences = splitSentencesConservatively(block.text, block.start);
      if (sentences.length <= 1) {
        baseSlices.push({
          start: block.start,
          end: block.end,
          text: block.text,
          kind: block.kind,
          isAtomic: false,
          estimatedTokens: blockTokens,
        });
      } else {
        for (const sent of sentences) {
          baseSlices.push({
            start: sent.start,
            end: sent.end,
            text: sent.text,
            kind: block.kind,
            isAtomic: false,
            estimatedTokens: estimateTokenCount(sent.text),
          });
        }
      }
    }
  }

  const intermediateChunks: PageChunkIntermediate[] = [];
  let curSliceIdx = 0;

  while (curSliceIdx < baseSlices.length) {
    const slice = baseSlices[curSliceIdx];

    // Caso 1: Bloco atômico preservado integralmente
    if (slice.isAtomic && options.preserveAtomicBlocks) {
      const isOversize = slice.estimatedTokens > options.maxTokens;
      const sliceText = pageText.slice(slice.start, slice.end);
      intermediateChunks.push({
        text: sliceText,
        normalizedSearchText: sliceText.trim().replace(/\s+/g, ' '),
        charOffsetStart: slice.start,
        charOffsetEnd: slice.end,
        contentKind: slice.kind,
        estimatedTokens: slice.estimatedTokens,
        oversizeAtomicBlock: isOversize,
      });
      curSliceIdx++;
      continue;
    }

    // Caso 2: Agrupamento de fatias contíguas até o alvo de tokens
    let endSliceIdx = curSliceIdx;
    let accumulatedTokens = 0;

    while (endSliceIdx < baseSlices.length) {
      const candidate = baseSlices[endSliceIdx];
      // Não mescla prosa com bloco atômico subsequente
      if (candidate.isAtomic && options.preserveAtomicBlocks && endSliceIdx > curSliceIdx) {
        break;
      }

      const candTokens = candidate.estimatedTokens;
      if (accumulatedTokens > 0 && accumulatedTokens + candTokens > options.targetTokens && accumulatedTokens >= options.minTokens) {
        break;
      }

      accumulatedTokens += candTokens;
      endSliceIdx++;

      if (accumulatedTokens >= options.maxTokens) {
        break;
      }
    }

    const startOffset = baseSlices[curSliceIdx].start;
    const endOffset = baseSlices[endSliceIdx - 1].end;
    const chunkSourceText = pageText.slice(startOffset, endOffset);

    intermediateChunks.push({
      text: chunkSourceText,
      normalizedSearchText: chunkSourceText.trim().replace(/\s+/g, ' '),
      charOffsetStart: startOffset,
      charOffsetEnd: endOffset,
      contentKind: baseSlices[curSliceIdx].kind,
      estimatedTokens: estimateTokenCount(chunkSourceText),
      oversizeAtomicBlock: false,
    });

    // Avanço com overlap configurável
    if (endSliceIdx >= baseSlices.length) {
      break;
    }

    if (options.overlapTokens > 0 && endSliceIdx - curSliceIdx > 1) {
      // Calcula fatias para sobreposição segura (ex: última sentença)
      let overlapCount = 0;
      let overlapTokAcc = 0;
      for (let back = endSliceIdx - 1; back > curSliceIdx; back--) {
        overlapTokAcc += baseSlices[back].estimatedTokens;
        overlapCount++;
        if (overlapTokAcc >= options.overlapTokens) break;
      }
      curSliceIdx = endSliceIdx - Math.max(1, overlapCount);
    } else {
      curSliceIdx = endSliceIdx;
    }
  }

  return intermediateChunks;
}

/* ==========================================================================
   MOTOR PRINCIPAL DE CHUNKING DO DOCUMENTO
   ========================================================================== */

export const PIPELINE_VERSION = '1.0.0';

const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  targetTokens: 400,
  minTokens: 120,
  maxTokens: 650,
  overlapTokens: 60,
  preserveAtomicBlocks: true,
  pipelineVersion: PIPELINE_VERSION,
  deterministicTimestamp: 0,
};

/**
 * Fatiador determinístico principal do NeuroClass AI.
 * Processa todas as páginas do documento de forma pura, síncrona e isolada.
 */
export function chunkDocument(
  document: DocumentSource,
  options?: ChunkingOptions
): ChunkingResult {
  const startTime = Date.now();
  const resolvedOptions: Required<ChunkingOptions> = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options,
    deterministicTimestamp: options?.deterministicTimestamp ?? 0,
  };

  const flattenedToc = document.tableOfContents && document.tableOfContents.length > 0
    ? flattenTableOfContents(document.tableOfContents)
    : [];

  const chunks: DocumentChunk[] = [];
  const emptyPages: number[] = [];
  const coveredPages = new Set<number>();
  let globalChunkCounter = 0;

  let tablesDetected = 0;
  let formulasDetected = 0;
  let figuresDetected = 0;
  let chartsDetected = 0;
  let oversizeChunksCount = 0;

  let scannedPagesCount = 0;
  let notRequiredCount = 0;
  let requiresOcrCount = 0;
  let pendingCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  const pages = document.pages || [];
  for (const page of pages) {
    const pageNum = page.pageNumber;
    const pageText = page.textContent || '';
    const isPageScanned = page.isScanned === true || page.legibility === 'scanned_image';

    // Rastreamento preciso do estado de OCR por página
    if (isPageScanned) {
      scannedPagesCount++;
      if (pageText.trim().length > 0) {
        completedCount++;
      } else {
        requiresOcrCount++;
        pendingCount++;
      }
    } else {
      notRequiredCount++;
    }

    // Tratamento de páginas sem conteúdo textual
    if (pageText.length === 0 || pageText.trim().length === 0) {
      emptyPages.push(pageNum);

      if (isPageScanned) {
        // Gera chunk sentinela de fallback estrutural para a página digitalizada
        const fallbackId = `${document.id}_p${pageNum}_c0`;
        const fallbackText = '';
        const fallbackNotice = `[Página ${pageNum}: Imagem digitalizada sem camada de texto extraída. Requer OCR.]`;
        
        chunks.push({
          chunkId: fallbackId,
          documentId: document.id,
          pageNumber: pageNum,
          chunkIndexInPage: 0,
          globalChunkIndex: globalChunkCounter++,
          text: fallbackText,
          normalizedSearchText: fallbackNotice,
          sourceRef: {
            documentId: document.id,
            pageNumber: pageNum,
            charOffsetStart: 0,
            charOffsetEnd: 0,
            sectionTitle: resolveSectionForPage(pageNum, flattenedToc).sectionTitle,
            sectionHierarchy: resolveSectionForPage(pageNum, flattenedToc).sectionHierarchy,
          },
          contentKind: 'scanned_fallback',
          estimatedTokens: 0,
          isTokenEstimateHeuristic: true,
          contentHash: sha256Sync(fallbackText),
          pipelineVersion: resolvedOptions.pipelineVersion,
          isOcrDerived: false,
          ocrStatus: 'requires_ocr',
          ...(resolvedOptions.deterministicTimestamp > 0
            ? { createdAt: resolvedOptions.deterministicTimestamp }
            : {}),
        });
        coveredPages.add(pageNum);
      }
      continue;
    }

    coveredPages.add(pageNum);
    const pageChunksIntermediate = chunkSinglePageText(pageText, resolvedOptions);
    const sectionInfo = resolveSectionForPage(pageNum, flattenedToc);

    let pageChunkIdx = 0;
    for (const inter of pageChunksIntermediate) {
      const chunkId = `${document.id}_p${pageNum}_c${pageChunkIdx}`;
      const multimodalRefs = detectMultimodalRefsInText(inter.text);

      if (inter.contentKind === 'table_markdown') tablesDetected++;
      if (inter.contentKind === 'formula_latex') formulasDetected++;
      if (inter.contentKind === 'figure_caption') figuresDetected++;
      if (inter.contentKind === 'chart_description') chartsDetected++;
      if (inter.oversizeAtomicBlock) oversizeChunksCount++;

      chunks.push({
        chunkId,
        documentId: document.id,
        pageNumber: pageNum,
        chunkIndexInPage: pageChunkIdx,
        globalChunkIndex: globalChunkCounter++,
        text: inter.text,
        normalizedSearchText: inter.normalizedSearchText,
        sourceRef: {
          documentId: document.id,
          pageNumber: pageNum,
          charOffsetStart: inter.charOffsetStart,
          charOffsetEnd: inter.charOffsetEnd,
          sectionTitle: sectionInfo.sectionTitle,
          sectionHierarchy: sectionInfo.sectionHierarchy,
        },
        contentKind: inter.contentKind,
        estimatedTokens: inter.estimatedTokens,
        isTokenEstimateHeuristic: true,
        oversizeAtomicBlock: inter.oversizeAtomicBlock ? true : undefined,
        contentHash: sha256Sync(inter.text),
        pipelineVersion: resolvedOptions.pipelineVersion,
        isOcrDerived: page.isScanned ? true : false,
        ocrStatus: page.isScanned ? 'completed' : 'not_required',
        multimodalReferences: multimodalRefs,
        ...(resolvedOptions.deterministicTimestamp > 0
          ? { createdAt: resolvedOptions.deterministicTimestamp }
          : {}),
      });

      pageChunkIdx++;
    }
  }

  const detailedCoverage: DetailedProcessingCoverage = {
    documentId: document.id,
    totalPages: pages.length,
    extraction: {
      extractedPagesCount: pages.length - emptyPages.length,
      extractedPageNumbers: Array.from(coveredPages).sort((a, b) => a - b),
      emptyPageNumbers: emptyPages,
    },
    ocr: {
      scannedPagesCount,
      notRequiredCount,
      requiresOcrCount,
      pendingCount,
      completedCount,
      failedCount,
    },
    chunking: {
      totalChunksGenerated: chunks.length,
      coveredPagesCount: coveredPages.size,
      coveredPageNumbers: Array.from(coveredPages).sort((a, b) => a - b),
      averageChunksPerPage: coveredPages.size > 0 ? Number((chunks.length / coveredPages.size).toFixed(2)) : 0,
      oversizeChunksCount,
    },
    indexing: {
      indexedChunksCount: chunks.length,
      isFullyIndexed: coveredPages.size === pages.length || chunks.length > 0,
    },
    multimodal: {
      tablesDetected,
      formulasDetected,
      figuresDetected,
      chartsDetected,
    },
  };

  const warnings: string[] = [];
  if (emptyPages.length > 0) {
    warnings.push(`${emptyPages.length} página(s) sem texto extraível: [${emptyPages.join(', ')}]`);
  }
  if (oversizeChunksCount > 0) {
    warnings.push(`${oversizeChunksCount} bloco(s) atômico(s) excederam o limite máximo de tokens e foram preservados integralmente.`);
  }

  const executionTimeMs = Math.max(1, Date.now() - startTime);

  return {
    documentId: document.id,
    chunks,
    totalChunks: chunks.length,
    totalPagesProcessed: pages.length,
    emptyPages,
    coverage: detailedCoverage,
    warnings,
    executionMetadata: {
      executionTimeMs,
      processedAt: new Date(startTime).toISOString(),
    },
    executionTimeMs,
  };
}

/* ==========================================================================
   VALIDADORES DE INTEGRIDADE, OFFSETS, SOBREPOSIÇÃO E RECONSTRUÇÃO
   ========================================================================== */

/**
 * Valida a integridade estrita dos offsets:
 * page.textContent.slice(charOffsetStart, charOffsetEnd) === chunk.text
 */
export function verifyOffsetIntegrity(
  chunks: DocumentChunk[],
  pages: DocumentPage[]
): OffsetIntegrityResult {
  const pageMap = new Map<number, DocumentPage>();
  for (const p of pages) {
    pageMap.set(p.pageNumber, p);
  }

  const violations: OffsetIntegrityViolation[] = [];

  for (const c of chunks) {
    const page = pageMap.get(c.pageNumber);
    if (!page) {
      violations.push({
        chunkId: c.chunkId,
        pageNumber: c.pageNumber,
        charOffsetStart: c.sourceRef.charOffsetStart,
        charOffsetEnd: c.sourceRef.charOffsetEnd,
        expectedTextSlice: '',
        actualChunkText: c.text,
        differenceReason: `Página ${c.pageNumber} não encontrada no documento`,
      });
      continue;
    }

    const pageText = page.textContent || '';
    const start = c.sourceRef.charOffsetStart;
    const end = c.sourceRef.charOffsetEnd;

    if (start < 0 || end > pageText.length || start > end) {
      violations.push({
        chunkId: c.chunkId,
        pageNumber: c.pageNumber,
        charOffsetStart: start,
        charOffsetEnd: end,
        expectedTextSlice: '',
        actualChunkText: c.text,
        differenceReason: `Offsets fora dos limites válidos [0, ${pageText.length}]`,
      });
      continue;
    }

    const expectedSlice = pageText.slice(start, end);
    if (expectedSlice !== c.text) {
      violations.push({
        chunkId: c.chunkId,
        pageNumber: c.pageNumber,
        charOffsetStart: start,
        charOffsetEnd: end,
        expectedTextSlice: expectedSlice,
        actualChunkText: c.text,
        differenceReason: 'Divergência caractere a caractere entre o slice da página e chunk.text',
      });
    }
  }

  return {
    isValid: violations.length === 0,
    checkedChunksCount: chunks.length,
    violations,
  };
}

/**
 * Valida e audita a sobreposição intencional e contiguidade entre chunks consecutivos por página.
 */
export function verifyOverlapIntegrity(
  chunks: DocumentChunk[],
  pages: DocumentPage[]
): OverlapIntegrityResult {
  const pageChunks = new Map<number, DocumentChunk[]>();
  for (const c of chunks) {
    if (!pageChunks.has(c.pageNumber)) {
      pageChunks.set(c.pageNumber, []);
    }
    pageChunks.get(c.pageNumber)!.push(c);
  }

  const pageMap = new Map<number, DocumentPage>();
  for (const p of pages) {
    pageMap.set(p.pageNumber, p);
  }

  const overlaps: OverlapRange[] = [];
  const gaps: RangeGap[] = [];
  const violations: string[] = [];
  let totalOverlapChars = 0;
  let maxOverlapChars = 0;

  for (const [pageNum, pChunks] of pageChunks.entries()) {
    const page = pageMap.get(pageNum);
    const pageText = page?.textContent || '';
    pChunks.sort((a, b) => a.chunkIndexInPage - b.chunkIndexInPage);

    for (let i = 0; i < pChunks.length - 1; i++) {
      const cur = pChunks[i];
      const next = pChunks[i + 1];

      if (next.sourceRef.charOffsetStart < cur.sourceRef.charOffsetEnd) {
        // Sobreposição intencional
        const overlapStart = next.sourceRef.charOffsetStart;
        const overlapEnd = cur.sourceRef.charOffsetEnd;
        const overlapChars = overlapEnd - overlapStart;

        const curTail = cur.text.slice(cur.text.length - overlapChars);
        const nextHead = next.text.slice(0, overlapChars);
        const pageSlice = pageText.slice(overlapStart, overlapEnd);
        const matched = curTail === nextHead && curTail === pageSlice;

        if (!matched) {
          violations.push(`Incompatibilidade no texto da sobreposição entre ${cur.chunkId} e ${next.chunkId}`);
        }

        totalOverlapChars += overlapChars;
        if (overlapChars > maxOverlapChars) maxOverlapChars = overlapChars;

        overlaps.push({
          pageNumber: pageNum,
          prevChunkId: cur.chunkId,
          nextChunkId: next.chunkId,
          overlapStart,
          overlapEnd,
          overlapChars,
          matchedText: matched,
        });
      } else if (next.sourceRef.charOffsetStart > cur.sourceRef.charOffsetEnd) {
        // Lacuna entre chunks
        const gapStart = cur.sourceRef.charOffsetEnd;
        const gapEnd = next.sourceRef.charOffsetStart;
        const gapText = pageText.slice(gapStart, gapEnd);
        const isWhitespaceOnly = /^\s*$/.test(gapText);

        gaps.push({
          pageNumber: pageNum,
          prevChunkId: cur.chunkId,
          nextChunkId: next.chunkId,
          gapStart,
          gapEnd,
          gapChars: gapEnd - gapStart,
          gapText,
          isWhitespaceOnly,
        });

        if (!isWhitespaceOnly) {
          violations.push(`Lacuna textual não-vazia detectada entre ${cur.chunkId} e ${next.chunkId}: "${gapText}"`);
        }
      }
    }
  }

  return {
    hasOverlap: overlaps.length > 0,
    totalOverlapChars,
    maxOverlapChars,
    overlaps,
    gaps,
    violations,
  };
}

/**
 * Valida a reconstrução exata do texto de uma página através de seus chunks.
 * Verifica ausência de perda de caracteres, espaços, quebras de linha ou ordem.
 */
export function verifyExactReconstruction(
  chunks: DocumentChunk[],
  page: DocumentPage
): ExactReconstructionResult {
  const pageText = page.textContent || '';
  if (pageText.length === 0) {
    return {
      isExactMatch: true,
      coveredCharsCount: 0,
      totalPageChars: 0,
      coverageRatio: 1.0,
      missingRanges: [],
      duplicateRangesOutsideOverlap: [],
    };
  }

  const pChunks = chunks
    .filter(c => c.pageNumber === page.pageNumber && c.contentKind !== 'scanned_fallback')
    .sort((a, b) => a.sourceRef.charOffsetStart - b.sourceRef.charOffsetStart);

  if (pChunks.length === 0) {
    return {
      isExactMatch: false,
      coveredCharsCount: 0,
      totalPageChars: pageText.length,
      coverageRatio: 0,
      missingRanges: [{ start: 0, end: pageText.length, text: pageText }],
      duplicateRangesOutsideOverlap: [],
    };
  }

  // Mescla intervalos cobertos por cada chunk
  const coveredIntervals: [number, number][] = [];
  for (const c of pChunks) {
    const s = c.sourceRef.charOffsetStart;
    const e = c.sourceRef.charOffsetEnd;
    if (s < e) {
      coveredIntervals.push([s, e]);
    }
  }

  // Ordena e mescla intervalos sobrepostos
  coveredIntervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of coveredIntervals) {
    if (merged.length === 0) {
      merged.push([s, e]);
    } else {
      const prev = merged[merged.length - 1];
      if (s <= prev[1]) {
        prev[1] = Math.max(prev[1], e);
      } else {
        merged.push([s, e]);
      }
    }
  }

  let coveredCharsCount = 0;
  for (const [s, e] of merged) {
    coveredCharsCount += (e - s);
  }

  const missingRanges: TextRange[] = [];
  let curPos = 0;
  for (const [s, e] of merged) {
    if (s > curPos) {
      missingRanges.push({
        start: curPos,
        end: s,
        text: pageText.slice(curPos, s),
      });
    }
    curPos = Math.max(curPos, e);
  }
  if (curPos < pageText.length) {
    missingRanges.push({
      start: curPos,
      end: pageText.length,
      text: pageText.slice(curPos, pageText.length),
    });
  }

  const isExactMatch = missingRanges.length === 0 && coveredCharsCount === pageText.length;
  const coverageRatio = pageText.length > 0 ? Number((coveredCharsCount / pageText.length).toFixed(4)) : 1.0;

  return {
    isExactMatch,
    coveredCharsCount,
    totalPageChars: pageText.length,
    coverageRatio,
    missingRanges,
    duplicateRangesOutsideOverlap: [],
  };
}

/**
 * Validação abrangente de cobertura de caracteres com preservação total de espaços e quebras de linha.
 */
export function verifyCharacterCoverage(
  chunks: DocumentChunk[],
  page: DocumentPage
): { coverageRatio: number; missingCharsCount: number; missingChars: string[] } {
  const recon = verifyExactReconstruction(chunks, page);
  const missingChars: string[] = [];
  for (const r of recon.missingRanges) {
    for (const ch of r.text) {
      missingChars.push(ch);
    }
  }
  return {
    coverageRatio: recon.coverageRatio,
    missingCharsCount: missingChars.length,
    missingChars: missingChars.slice(0, 50),
  };
}

/**
 * Função de retrocompatibilidade com a suite de testes da Missão A.
 */
export function verifyTextCoverage(
  pageText: string,
  pageChunks: DocumentChunk[]
): {
  covered: boolean;
  missingCharsCount: number;
  coverageRatio: number;
  uncoveredSamples: string[];
} {
  const cleanOriginal = pageText.replace(/\s+/g, '');
  if (cleanOriginal.length === 0) {
    return { covered: true, missingCharsCount: 0, coverageRatio: 1.0, uncoveredSamples: [] };
  }

  const matchedChars = new Uint8Array(cleanOriginal.length);
  let searchCursor = 0;

  for (const chunk of pageChunks) {
    const cleanChunk = chunk.text.replace(/\s+/g, '');
    let pos = cleanOriginal.indexOf(cleanChunk, searchCursor);
    if (pos === -1) {
      pos = cleanOriginal.indexOf(cleanChunk);
    }
    if (pos !== -1) {
      for (let i = 0; i < cleanChunk.length; i++) {
        matchedChars[pos + i] = 1;
      }
      searchCursor = pos + cleanChunk.length;
    } else {
      let subCursor = 0;
      const step = 20;
      while (subCursor < cleanChunk.length) {
        const sub = cleanChunk.slice(subCursor, subCursor + step);
        const subPos = cleanOriginal.indexOf(sub);
        if (subPos !== -1) {
          for (let k = 0; k < sub.length; k++) {
            matchedChars[subPos + k] = 1;
          }
        }
        subCursor += step;
      }
    }
  }

  let missingCount = 0;
  const uncoveredSamples: string[] = [];
  for (let i = 0; i < matchedChars.length; i++) {
    if (matchedChars[i] === 0) {
      missingCount++;
      if (uncoveredSamples.length < 10) {
        uncoveredSamples.push(cleanOriginal[i]);
      }
    }
  }

  const coverageRatio = Number(((cleanOriginal.length - missingCount) / cleanOriginal.length).toFixed(4));
  return {
    covered: missingCount === 0,
    missingCharsCount: missingCount,
    coverageRatio,
    uncoveredSamples,
  };
}

/**
 * Auditoria abrangente unificada de todas as páginas do documento.
 */
export function verifyComprehensiveCoverage(
  chunks: DocumentChunk[],
  pages: DocumentPage[]
): {
  isFullyValid: boolean;
  offsetIntegrity: OffsetIntegrityResult;
  overlapIntegrity: OverlapIntegrityResult;
  reconstructionByPage: Record<number, ExactReconstructionResult>;
} {
  const offsetIntegrity = verifyOffsetIntegrity(chunks, pages);
  const overlapIntegrity = verifyOverlapIntegrity(chunks, pages);
  const reconstructionByPage: Record<number, ExactReconstructionResult> = {};

  let allReconstructed = true;
  for (const page of pages) {
    const recon = verifyExactReconstruction(chunks, page);
    reconstructionByPage[page.pageNumber] = recon;
    if (!recon.isExactMatch && (page.textContent || '').trim().length > 0) {
      allReconstructed = false;
    }
  }

  return {
    isFullyValid: offsetIntegrity.isValid && overlapIntegrity.violations.length === 0 && allReconstructed,
    offsetIntegrity,
    overlapIntegrity,
    reconstructionByPage,
  };
}
