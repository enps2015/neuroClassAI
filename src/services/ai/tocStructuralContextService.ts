import type { TableOfContentsItem } from '../../types';

export interface TocFormatOptions {
  /** Orçamento máximo estimado em tokens para a representação do sumário (default: 300) */
  maxTokenBudget?: number;
  /**
   * Fator de conversão conservador caracteres/token para pt-BR e texto estruturado.
   * Não assume contagem exata; documenta expressamente a estimativa (default: 3.5).
   */
  charsPerToken?: number;
  /** Nome do conceito ativo no quadro didático para priorização contextual */
  activeConceptName?: string;
  /** Título ou seção em foco para priorização de subitens */
  focusSectionTitle?: string;
}

export interface TocFormatResult {
  /** Bloco textual formatado pronto para injeção no prompt do Gemini, ou null se não houver sumário */
  formattedPromptBlock: string | null;
  /** Linhas de sumário compacto formatadas */
  outlineText: string;
  /** Estimativa conservadora de tokens consumidos */
  estimatedTokens: number;
  /** Quantidade total de nós identificados no sumário válido */
  totalNodesCount: number;
  /** Quantidade de nós incluídos no contexto */
  includedNodesCount: number;
  /** Quantidade de nós omitidos por limite orçamentário */
  omittedNodesCount: number;
  /** Indica se houve truncamento ou omissão por restrição orçamentária */
  hasTruncation: boolean;
}

/**
 * Valida e sanitiza defensivamente a estrutura de sumário recebida do cliente.
 * Não confia cegamente em tipos ou objetos arbitrários.
 *
 * REGRAS DE INTEGRIDADE:
 * 1. Preserva títulos, ordem e relações pai/filho originais.
 * 2. Destinos com numeração física válida (> 0) são preservados como number.
 * 3. Destinos inválidos, negativos, nulos ou indefinidos NÃO recebem fallback 1 nem 0.
 * 4. Limita a profundidade máxima da árvore (max 4 níveis) contra estouro de pilha.
 */
export function sanitizeTableOfContents(rawToc: unknown, maxDepth = 4): TableOfContentsItem[] {
  if (!rawToc || !Array.isArray(rawToc) || rawToc.length === 0) {
    return [];
  }

  const sanitizeNodes = (nodes: unknown[], currentLevel = 0): TableOfContentsItem[] => {
    if (currentLevel > maxDepth || !Array.isArray(nodes)) return [];

    const result: TableOfContentsItem[] = [];

    for (const raw of nodes) {
      if (!raw || typeof raw !== 'object') continue;

      const item = raw as Record<string, unknown>;

      // Título: obrigatório, sanitizado contra quebras excessivas, max 140 chars
      const rawTitle = typeof item.title === 'string' ? item.title : '';
      const cleanTitle = rawTitle
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);

      if (!cleanTitle) continue;

      // Página física: estritamente número inteiro positivo. Se inválido, undefined (NUNCA fallback para 1 ou 0)
      let cleanPage: number | undefined = undefined;
      if (typeof item.pageNumber === 'number' && Number.isFinite(item.pageNumber)) {
        const intPage = Math.floor(item.pageNumber);
        if (intPage >= 1) {
          cleanPage = intPage;
        }
      }

      // Rótulo impresso: opcional, string limpa max 30 chars
      let cleanLabel: string | undefined = undefined;
      if (typeof item.pageLabel === 'string' && item.pageLabel.trim().length > 0) {
        cleanLabel = item.pageLabel.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 30);
      }

      // Nível: número inteiro >= 0
      const cleanLevel =
        typeof item.level === 'number' && Number.isFinite(item.level) && item.level >= 0
          ? Math.min(Math.floor(item.level), currentLevel)
          : currentLevel;

      // Subitens recursivos
      const subItems = Array.isArray(item.subItems) && item.subItems.length > 0
        ? sanitizeNodes(item.subItems, currentLevel + 1)
        : undefined;

      result.push({
        title: cleanTitle,
        pageNumber: cleanPage,
        pageLabel: cleanLabel,
        level: cleanLevel,
        subItems: subItems && subItems.length > 0 ? subItems : undefined,
      });
    }

    return result;
  };

  return sanitizeNodes(rawToc, 0);
}

interface FlattenedNodeRef {
  title: string;
  pageNumber?: number;
  pageLabel?: string;
  level: number;
  isFocusRelevant: boolean;
}

/**
 * Achata o sumário em lista sequencial preservando ordem de leitura e identifica nós em foco.
 */
function flattenTocNodes(
  items: TableOfContentsItem[],
  focusKeywords: string[],
  parentMatchesFocus = false
): FlattenedNodeRef[] {
  const flattened: FlattenedNodeRef[] = [];

  for (const item of items) {
    const titleLower = item.title.toLowerCase();
    const matchesFocus =
      parentMatchesFocus ||
      (focusKeywords.length > 0 && focusKeywords.some((kw) => kw.length >= 3 && titleLower.includes(kw)));

    flattened.push({
      title: item.title,
      pageNumber: item.pageNumber,
      pageLabel: item.pageLabel,
      level: item.level,
      isFocusRelevant: matchesFocus,
    });

    if (item.subItems && item.subItems.length > 0) {
      flattened.push(...flattenTocNodes(item.subItems, focusKeywords, matchesFocus));
    }
  }

  return flattened;
}

/**
 * Constrói o contexto estrutural compacto do documento com separação estrita e controle de orçamento de tokens.
 */
export function buildStructuralContext(
  rawToc: unknown,
  options?: TocFormatOptions
): TocFormatResult {
  const sanitized = sanitizeTableOfContents(rawToc);

  if (sanitized.length === 0) {
    return {
      formattedPromptBlock: null,
      outlineText: '',
      estimatedTokens: 0,
      totalNodesCount: 0,
      includedNodesCount: 0,
      omittedNodesCount: 0,
      hasTruncation: false,
    };
  }

  const budgetTokens = options?.maxTokenBudget ?? 300;
  const charsFactor = options?.charsPerToken ?? 3.5;
  const maxCharsBudget = Math.floor(budgetTokens * charsFactor);

  // Palavras-chave para foco baseadas no conceito ativo ou seção
  const focusKeywords: string[] = [];
  if (options?.activeConceptName) {
    const words = options.activeConceptName
      .toLowerCase()
      .split(/[\s,.;:()\-–—]+/)
      .filter((w) => w.length >= 3 && !['para', 'com', 'dos', 'das', 'uma', 'sobre'].includes(w));
    focusKeywords.push(...words);
  }
  if (options?.focusSectionTitle) {
    focusKeywords.push(options.focusSectionTitle.toLowerCase().trim());
  }

  const allNodes = flattenTocNodes(sanitized, focusKeywords);
  const totalNodesCount = allNodes.length;

  const lines: string[] = [];
  let currentChars = 0;
  let includedNodesCount = 0;
  let omittedNodesCount = 0;

  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];

    // Formatação do marcador e indentação conforme nível
    const indent = '  '.repeat(Math.min(node.level, 3));
    const bullet = node.level === 0 ? '• ' : node.level === 1 ? '- ' : '* ';

    // Indicação de página: NUNCA inventa página se ausente
    let pagePart = '';
    if (typeof node.pageNumber === 'number' && node.pageNumber >= 1) {
      if (node.pageLabel && node.pageLabel !== String(node.pageNumber)) {
        pagePart = ` (Pág. ${node.pageNumber} | Rótulo: "${node.pageLabel}")`;
      } else {
        pagePart = ` (Pág. ${node.pageNumber})`;
      }
    }

    const line = `${indent}${bullet}${node.title}${pagePart}`;
    const lineChars = line.length + 1; // +1 para quebra de linha

    // Se a linha couber no orçamento
    if (currentChars + lineChars <= maxCharsBudget) {
      lines.push(line);
      currentChars += lineChars;
      includedNodesCount++;
    } else {
      // Se não couber e for um nó profundo (nível >= 1) que não é foco, omite
      // Se for nível 0 e tivermos espaço mínimo, ainda tenta registrar
      if (node.level === 0 && currentChars + lineChars <= maxCharsBudget + 100) {
        lines.push(line);
        currentChars += lineChars;
        includedNodesCount++;
      } else {
        omittedNodesCount = allNodes.length - includedNodesCount;
        break;
      }
    }
  }

  const hasTruncation = omittedNodesCount > 0;
  if (hasTruncation) {
    lines.push(`  [... ${omittedNodesCount} seções adicionais omitidas para preservar o orçamento de contexto ...]`);
  }

  const outlineText = lines.join('\n');
  const estimatedTokens = Math.ceil(outlineText.length / charsFactor);

  const formattedPromptBlock = `### CONTEXTO ESTRUTURAL DO DOCUMENTO (SUMÁRIO / ÍNDICE)
Organização das seções, capítulos e páginas originais do documento:
${outlineText}

DIRETRIZES DE USO DA ESTRUTURA DOCUMENTAL:
1. O sumário acima serve EXCLUSIVAMENTE para situar a macroestrutura da obra, a divisão em capítulos e a ordem didática dos tópicos.
2. O sumário NÃO comprova o conteúdo conceitual de nenhuma seção (um título de capítulo não constitui evidência factual).
3. NUNCA cite o sumário como se fosse um trecho de evidência textual do documento.
4. NUNCA deduza, infira ou invente teorias, mecanismos ou dados científicos baseando-se unicamente no título de um capítulo.
5. Para responder a dúvidas conceituais do estudante, fundamente-se OBRIGATORIAMENTE nas EVIDÊNCIAS TEXTUAIS RECUPERADAS (RAG) fornecidas a seguir. Se não houver evidência suficiente nos trechos, aponte a limitação com transparência e indique em qual capítulo/página do sumário o estudante pode encontrar o tema no material integral.`;

  return {
    formattedPromptBlock,
    outlineText,
    estimatedTokens,
    totalNodesCount,
    includedNodesCount,
    omittedNodesCount,
    hasTruncation,
  };
}

