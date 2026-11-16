import * as pdfjsLib from 'pdfjs-dist';
import type { DocumentPage, TableOfContentsItem } from '../../types';

// Configuração do worker do PDF.js servido diretamente pelo Express/Vite
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface ExtractedPdfData {
  pageCount: number;
  pages: DocumentPage[];
  tableOfContents: TableOfContentsItem[];
  suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }>;
  isScannedDocument?: boolean;
  scannedPageCount?: number;
  legibilitySummary?: {
    isFullyDigital: boolean;
    scannedPageCount: number;
    degradedPageCount: number;
    warnings: string[];
  };
}

export interface ExtractPdfOptions {
  /** Intervalo específico de páginas para PDFs extensos (>300 páginas) */
  pageRange?: { startPage: number; endPage: number };
  onProgress?: (progressPercent: number, currentPage: number, totalPages: number) => void;
  /** Se true, renderiza páginas digitalizadas como imagem JPEG/PNG via canvas */
  renderScannedPagesAsImages?: boolean;
}

/**
 * Renderiza uma página do PDF.js em canvas e retorna em Base64 (data:image/jpeg;base64,...)
 * Utilizado para páginas digitalizadas ou que exigem inspeção visual multimodal.
 */
export async function renderPdfPageToImageBase64(
  page: any,
  scale = 1.2,
  quality = 0.75
): Promise<string | undefined> {
  if (typeof document === 'undefined') {
    return undefined; // Ambiente SSR ou Node.js sem DOM
  }
  try {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } catch (err) {
    console.warn(`[PDF Render] Falha ao renderizar página ${page?.pageNumber || ''} em canvas:`, err);
    return undefined;
  }
}

/**
 * Mapeia os tópicos do sumário nativo (Outline) do PDF.
 * Preserva títulos, hierarquia, ordem e destinos válidos.
 * Destinos não resolvidos NÃO recebem fallback arbitrário de página 1 (Missão P2.1).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractOutline(pdfDoc: any): Promise<TableOfContentsItem[]> {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || !Array.isArray(outline)) return [];

    // Tenta obter rótulos de páginas impressas (ex.: "i", "ii", "1", etc.), se suportado
    let pageLabels: string[] | null = null;
    try {
      if (typeof pdfDoc.getPageLabels === 'function') {
        pageLabels = await pdfDoc.getPageLabels();
      }
    } catch {
      // Ignora falha em getPageLabels graciosamente
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processItems = async (items: any[], level = 0): Promise<TableOfContentsItem[]> => {
      const result: TableOfContentsItem[] = [];
      for (const item of items) {
        let pageNum: number | undefined = undefined;
        let pageLabel: string | undefined = undefined;

        if (item.dest) {
          try {
            let destRef = item.dest;
            if (typeof destRef === 'string') {
              destRef = await pdfDoc.getDestination(destRef);
            }
            if (Array.isArray(destRef) && destRef[0]) {
              const pageIndex = await pdfDoc.getPageIndex(destRef[0]);
              if (typeof pageIndex === 'number' && pageIndex >= 0 && pageIndex < (pdfDoc.numPages || 100000)) {
                pageNum = pageIndex + 1; // 1-indexed físico
                if (pageLabels && pageIndex < pageLabels.length && pageLabels[pageIndex]) {
                  pageLabel = String(pageLabels[pageIndex]).trim();
                }
              } else {
                console.warn(`[PDF Outline] Destino com pageIndex inválido (${pageIndex}) para item "${item.title || 'Seção'}".`);
              }
            } else {
              console.warn(`[PDF Outline] Destino com formato de referência não reconhecido para item "${item.title || 'Seção'}".`);
            }
          } catch (err) {
            console.warn(`[PDF Outline] Falha ao resolver destino do item "${item.title || 'Seção'}":`, err);
            pageNum = undefined;
          }
        }

        result.push({
          title: (item.title || 'Seção').trim(),
          pageNumber: pageNum,
          pageLabel,
          level,
          subItems: item.items && item.items.length > 0 ? await processItems(item.items, level + 1) : undefined,
        });
      }
      return result;
    };

    return await processItems(outline);
  } catch (err) {
    console.warn('Não foi possível extrair sumário nativo do PDF:', err);
    return [];
  }
}

/**
 * Constrói sugestões de blocos/capítulos de estudo para PDFs a partir do sumário e total de páginas.
 * Garante que cada capítulo comece rigorosamente na sua página física real (ACH-RT-01).
 */
export function buildSuggestedChunkRanges(
  tableOfContents: TableOfContentsItem[],
  totalPages: number
): Array<{ title: string; startPage: number; endPage: number }> {
  const suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }> = [];
  const itemsWithPage = tableOfContents.filter(
    (item): item is TableOfContentsItem & { pageNumber: number } =>
      typeof item.pageNumber === 'number' && item.pageNumber >= 1
  );

  if (itemsWithPage.length > 0) {
    for (let i = 0; i < itemsWithPage.length; i++) {
      const current = itemsWithPage[i];
      const next = itemsWithPage[i + 1];
      const startPage = current.pageNumber;
      const endPage = next && next.pageNumber > startPage ? next.pageNumber - 1 : totalPages;
      suggestedChunkRanges.push({
        title: current.title,
        startPage,
        endPage: Math.max(startPage, endPage),
      });
    }
  } else if (totalPages > 25) {
    const chunkSize = 30;
    for (let p = 1; p <= totalPages; p += chunkSize) {
      const end = Math.min(p + chunkSize - 1, totalPages);
      suggestedChunkRanges.push({
        title: `Capítulo / Bloco ${Math.floor(p / chunkSize) + 1} (Págs. ${p} a ${end})`,
        startPage: p,
        endPage: end,
      });
    }
  }

  return suggestedChunkRanges;
}

/**
 * Inspeciona apenas a contagem de páginas e o sumário do PDF sem carregar o texto todo.
 * Rápido para documentos com centenas ou milhares de páginas.
 */
export async function inspectPdfOverview(sourceData: ArrayBuffer | Uint8Array): Promise<{
  pageCount: number;
  tableOfContents: TableOfContentsItem[];
  suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }>;
}> {
  // Cria cópia defensiva para não sofrer com transferência/detachment
  const bufferCopy = sourceData instanceof Uint8Array ? sourceData.slice() : new Uint8Array(sourceData.slice(0));

  const loadingTask = pdfjsLib.getDocument({
    data: bufferCopy,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const tableOfContents = await extractOutline(pdfDoc);

  const suggestedChunkRanges = buildSuggestedChunkRanges(tableOfContents, pageCount);

  return {
    pageCount,
    tableOfContents,
    suggestedChunkRanges,
  };
}

/**
 * Extrai texto página a página preservando a paginação original e inspeciona sumário.
 * IMPORTANTE: Utiliza cópia defensiva do buffer para evitar 'Cannot perform Construct on a detached ArrayBuffer'.
 */
export async function extractPdfDocument(
  sourceData: ArrayBuffer | Uint8Array,
  options?: ExtractPdfOptions
): Promise<ExtractedPdfData> {
  // Cópia defensiva isolada para a tarefa de extração
  const bufferCopy = sourceData instanceof Uint8Array ? sourceData.slice() : new Uint8Array(sourceData.slice(0));

  const loadingTask = pdfjsLib.getDocument({
    data: bufferCopy,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  // Determina intervalo de páginas a processar
  const startPage = options?.pageRange ? Math.max(1, options.pageRange.startPage) : 1;
  const endPage = options?.pageRange ? Math.min(totalPages, options.pageRange.endPage) : totalPages;
  const pagesToProcessCount = endPage - startPage + 1;

  const pages: DocumentPage[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageString = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Verificação de operadores visuais (imagens, vetores, curvas)
    let hasVisualElements = false;
    try {
      const operatorList = await page.getOperatorList();
      hasVisualElements = operatorList.fnArray.some(
        (fn: number) =>
          fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintInlineImageXObject ||
          fn === pdfjsLib.OPS.constructPath
      );
    } catch {
      hasVisualElements = false;
    }

    // Detecção heurística de elementos multimodais no texto
    const hasFigures = /(figura|figure|fig\.|diagrama|ilustra[çc][ãa]o)\s*\d+/i.test(pageString);
    const hasTables = /(tabela|table|tab\.|quadro)\s*\d+/i.test(pageString);
    const hasFormulas = /(equa[çc][ãa]o|equation|eq\.|f[óo]rmula)\s*(\d+|\()|[=≈≠≤≥∑∫√π∆λ\^]|\b[a-zA-Z]\s*=\s*[\w\+\-\*\/\\]+/i.test(pageString);
    const hasCharts = /(gr[áa]fico|chart|plot|eixo|curva|histograma)\s*\d*/i.test(pageString);

    // Detecção de páginas digitalizadas (sem texto suficiente, mas com presença de operadores visuais/imagem)
    const isScanned = pageString.length < 50 && hasVisualElements;
    let legibility: 'clean' | 'scanned_image' | 'hybrid' | 'degraded' = 'clean';

    if (isScanned) {
      legibility = 'scanned_image';
    } else if (pageString.length < 50) {
      legibility = 'degraded';
    } else if (hasVisualElements) {
      legibility = 'hybrid';
    } else {
      legibility = 'clean';
    }

    // Renderização visual de páginas digitalizadas se estiver em ambiente com canvas/DOM
    let pageImageBase64: string | undefined = undefined;
    if ((isScanned || options?.renderScannedPagesAsImages) && typeof document !== 'undefined') {
      try {
        pageImageBase64 = await renderPdfPageToImageBase64(page);
      } catch {
        // Fallback defensivo
      }
    }

    // Preserva o número original da página no documento físico/digital
    pages.push({
      pageNumber: pageNum,
      textContent: pageString,
      hasVisualElements,
      isScanned,
      legibility,
      detectedElements: {
        hasFigures,
        hasTables,
        hasFormulas,
        hasCharts,
      },
      pageImageBase64,
    });

    if (options?.onProgress) {
      const processedSoFar = pageNum - startPage + 1;
      const percent = Math.round((processedSoFar / pagesToProcessCount) * 100);
      options.onProgress(percent, pageNum, totalPages);
    }
  }

  const tableOfContents = await extractOutline(pdfDoc);

  // Análise agregada de legibilidade e páginas digitalizadas
  const scannedPages = pages.filter((p) => p.isScanned);
  const degradedPages = pages.filter((p) => p.legibility === 'degraded');
  const isScannedDocument = scannedPages.length > pages.length / 2;
  const warnings: string[] = [];

  if (scannedPages.length > 0) {
    warnings.push(
      `Identificamos ${scannedPages.length} página(s) digitalizada(s) sem camada textual direta. O NeuroClass AI ativou o modo multimodal.`
    );
  }
  if (degradedPages.length > 0) {
    warnings.push(
      `${degradedPages.length} página(s) apresentam texto escasso ou inconclusivo.`
    );
  }

  // Sugestões de blocos (construídas sem sombreamento de escopo via buildSuggestedChunkRanges)
  const suggestedChunkRanges = buildSuggestedChunkRanges(tableOfContents, totalPages);

  return {
    pageCount: totalPages,
    pages,
    tableOfContents,
    suggestedChunkRanges,
    isScannedDocument,
    scannedPageCount: scannedPages.length,
    legibilitySummary: {
      isFullyDigital: scannedPages.length === 0,
      scannedPageCount: scannedPages.length,
      degradedPageCount: degradedPages.length,
      warnings,
    },
  };
}

/**
 * Converte ArrayBuffer ou Uint8Array em Base64 de forma segura em chunks,
 * evitando stack overflow em arquivos grandes e garantindo que o buffer nunca seja detached.
 */
export function safeBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32768 bytes por fatia para não estourar call stack
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(binary);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  return '';
}

/**
 * Alias mantido para compatibilidade, agora seguro contra detachment.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return safeBufferToBase64(buffer);
}
