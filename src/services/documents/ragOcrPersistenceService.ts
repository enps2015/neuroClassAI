/**
 * NeuroClass AI — Serviço de Persistência Local de Páginas OCR (IndexedDB)
 * @module services/documents/ragOcrPersistenceService
 *
 * Fornece operações atômicas, tipadas e idempotentes para:
 * 1. Salvar / atualizar o resultado de reconhecimento OCR por página física;
 * 2. Recuperar páginas OCR salvas em ordem física estrita;
 * 3. Excluir dados OCR associados a um documento em cascata;
 * 4. Obter métricas de cobertura de OCR por documento.
 *
 * REGRAS INVIOLÁVEIS:
 * - 100% local no IndexedDB, sem transmissão externa;
 * - Idempotente: reprocessar a mesma página substitui sem duplicatas;
 * - Checkpoint por página para garantir resiliência contra cancelamento ou interrupção.
 */

import { getDB } from '../persistence/indexedDb';
import type { StoredOcrPage, OcrCoverageMetrics } from '../../types/rag';

/**
 * Salva ou atualiza atomicamente o registro de OCR de uma página física.
 */
export async function saveOcrPage(page: StoredOcrPage): Promise<void> {
  if (!page || !page.documentId || page.pageNumber === undefined || page.pageNumber === null) {
    throw new Error('[OCR Persistence] Registro de página inválido: documentId e pageNumber são obrigatórios.');
  }

  const db = await getDB();
  const id = page.id || `${page.documentId}_p${page.pageNumber}`;
  const recordToSave: StoredOcrPage = {
    ...page,
    id,
    processedAt: page.processedAt || Date.now(),
  };

  await db.put('document_ocr_pages', recordToSave);
}

/**
 * Obtém o registro de OCR de uma página física específica.
 */
export async function getOcrPage(
  documentId: string,
  pageNumber: number
): Promise<StoredOcrPage | null> {
  if (!documentId || pageNumber === undefined || pageNumber === null) {
    return null;
  }

  const db = await getDB();
  const id = `${documentId}_p${pageNumber}`;
  const result = await db.get('document_ocr_pages', id);
  return result || null;
}

/**
 * Recupera todas as páginas OCR processadas de um documento, ordenadas crescentemente por número de página.
 */
export async function getDocumentOcrPages(documentId: string): Promise<StoredOcrPage[]> {
  if (!documentId) return [];

  const db = await getDB();
  const pages = await db.getAllFromIndex('document_ocr_pages', 'by-document', documentId);
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Exclui todos os registros de OCR de um documento específico.
 */
export async function deleteDocumentOcrPages(documentId: string): Promise<void> {
  if (!documentId) return;

  const db = await getDB();
  const tx = db.transaction(['document_ocr_pages'], 'readwrite');
  const store = tx.objectStore('document_ocr_pages');
  const keys = await store.index('by-document').getAllKeys(documentId);

  for (const key of keys) {
    await store.delete(key);
  }
  await tx.done;
}

/**
 * Consolida estatísticas de cobertura de OCR para um documento.
 */
export async function getDocumentOcrStats(documentId: string): Promise<{
  totalOcrPages: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  averageConfidence: number;
}> {
  const pages = await getDocumentOcrPages(documentId);

  let completedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let totalConfidence = 0;
  let confidenceSamples = 0;

  for (const page of pages) {
    if (page.status === 'completed') {
      completedCount++;
      if (typeof page.confidenceScore === 'number' && Number.isFinite(page.confidenceScore)) {
        totalConfidence += page.confidenceScore;
        confidenceSamples++;
      }
    } else if (page.status === 'failed') {
      failedCount++;
    } else if (page.status === 'pending' || page.status === 'processing') {
      pendingCount++;
    }
  }

  const averageConfidence = confidenceSamples > 0 ? totalConfidence / confidenceSamples : 0;

  return {
    totalOcrPages: pages.length,
    completedCount,
    failedCount,
    pendingCount,
    averageConfidence,
  };
}

