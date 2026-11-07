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
}

export interface ExtractPdfOptions {
  /** Intervalo específico de páginas para PDFs extensos (>300 páginas) */
  pageRange?: { startPage: number; endPage: number };
  onProgress?: (progressPercent: number, currentPage: number, totalPages: number) => void;
}

/**
 * Mapeia os tópicos do sumário nativo (Outline) do PDF.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractOutline(pdfDoc: any): Promise<TableOfContentsItem[]> {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || !Array.isArray(outline)) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processItems = async (items: any[], level = 0): Promise<TableOfContentsItem[]> => {
      const result: TableOfContentsItem[] = [];
      for (const item of items) {
        let pageNum = 1;
        if (item.dest) {
          try {
            let destRef = item.dest;
            if (typeof destRef === 'string') {
              destRef = await pdfDoc.getDestination(destRef);
            }
            if (Array.isArray(destRef) && destRef[0]) {
              const pageIndex = await pdfDoc.getPageIndex(destRef[0]);
              pageNum = pageIndex + 1; // 1-indexed
            }
          } catch {
            // Se falhar dest, mantém 1
          }
        }
        result.push({
          title: item.title || 'Seção',
          pageNumber: pageNum,
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

  const suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }> = [];

  if (tableOfContents.length > 0) {
    for (let i = 0; i < tableOfContents.length; i++) {
      const current = tableOfContents[i];
      const next = tableOfContents[i + 1];
      const startPage = current.pageNumber;
      const endPage = next ? Math.max(startPage, next.pageNumber - 1) : pageCount;
      suggestedChunkRanges.push({
        title: current.title,
        startPage,
        endPage,
      });
    }
  } else if (pageCount > 25) {
    // Segmentação sugerida em blocos de até 30 páginas para PDFs extensos (>300 páginas)
    const chunkSize = 30;
    for (let p = 1; p <= pageCount; p += chunkSize) {
      const end = Math.min(p + chunkSize - 1, pageCount);
      suggestedChunkRanges.push({
        title: `Capítulo / Bloco ${Math.floor(p / chunkSize) + 1} (Págs. ${p} a ${end})`,
        startPage: p,
        endPage: end,
      });
    }
  }

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

    // Preserva o número original da página no documento físico/digital
    pages.push({
      pageNumber: pageNum,
      textContent: pageString,
      hasVisualElements,
    });

    if (options?.onProgress) {
      const processedSoFar = pageNum - startPage + 1;
      const percent = Math.round((processedSoFar / pagesToProcessCount) * 100);
      options.onProgress(percent, pageNum, totalPages);
    }
  }

  const tableOfContents = await extractOutline(pdfDoc);

  // Sugestões de blocos
  const suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }> = [];
  if (tableOfContents.length > 0) {
    for (let i = 0; i < tableOfContents.length; i++) {
      const current = tableOfContents[i];
      const next = tableOfContents[i + 1];
      const s = current.pageNumber;
      const e = next ? Math.max(s, next.pageNumber - 1) : totalPages;
      suggestedChunkRanges.push({
        title: current.title,
        startPage: s,
        endPage: e,
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

  return {
    pageCount: totalPages,
    pages,
    tableOfContents,
    suggestedChunkRanges,
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
