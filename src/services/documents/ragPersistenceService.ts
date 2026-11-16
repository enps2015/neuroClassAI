/**
 * NeuroClass AI — Serviço de Persistência Local de Chunks RAG (IndexedDB)
 * @module services/documents/ragPersistenceService
 *
 * Fornece operações pequenas, tipadas, atômicas e idempotentes para:
 * 1. Salvar / substituir integralmente os chunks estruturados de um documento;
 * 2. Recuperar chunks de um documento em ordem estável e determinística;
 * 3. Excluir chunks de um documento específico sem contaminar os demais;
 * 4. Obter métricas de cobertura e agregação de chunks locais.
 */

import { getDB } from '../persistence/indexedDb';
import type { DocumentChunk, StoredDocumentChunk } from '../../types/rag';

export interface SaveChunksOptions {
  pipelineVersion?: string;
}

export interface DocumentChunksStats {
  documentId: string;
  totalChunks: number;
  totalPagesCovered: number;
  totalEstimatedTokens: number;
  oversizeChunksCount: number;
  kindsCount: Record<string, number>;
}

/**
 * Salva ou substitui integralmente os chunks de um documento no IndexedDB.
 * Operação atômica e idempotente:
 * - Remove os chunks pré-existentes do documento (prevenindo mistura de versões antigas e novas);
 * - Insere os novos chunks enriquecidos com metadados de armazenamento (StoredDocumentChunk);
 * - Rejeita em caso de falha antes de confirmar, impedindo que o documento fique em estado parcialmente indexado.
 */
export async function saveDocumentChunks(
  documentId: string,
  chunks: DocumentChunk[],
  options?: SaveChunksOptions
): Promise<StoredDocumentChunk[]> {
  if (!documentId) {
    throw new Error('[RAG Persistence] documentId obrigatório para salvar chunks.');
  }

  const db = await getDB();
  const tx = db.transaction(['document_chunks'], 'readwrite');
  const store = tx.objectStore('document_chunks');

  // 1. Obter e remover todos os chunks pré-existentes do documento
  const existingChunkKeys = await store.index('by-document').getAllKeys(documentId);
  for (const chunkKey of existingChunkKeys) {
    await store.delete(chunkKey);
  }

  // 2. Preparar registros StoredDocumentChunk enriquecidos
  const now = Date.now();
  const pipelineVer = options?.pipelineVersion || (chunks[0]?.pipelineVersion) || '1.0.0';
  const storedChunks: StoredDocumentChunk[] = [];

  for (const c of chunks) {
    // Validação estrita de isolamento: todo chunk deve pertencer ao documentId
    if (c.documentId !== documentId) {
      throw new Error(`[RAG Persistence] Chunk ${c.chunkId} possui documentId divergente (${c.documentId} != ${documentId}).`);
    }

    const storedChunk: StoredDocumentChunk = {
      ...c,
      docId: c.documentId,
      sectionPath: c.sourceRef.sectionHierarchy?.join(' > ') || c.sourceRef.sectionTitle || '',
      startOffset: c.sourceRef.charOffsetStart,
      endOffset: c.sourceRef.charOffsetEnd,
      indexingOptionsVersion: pipelineVer,
      storedAt: now,
    };

    await store.put(storedChunk as any);
    storedChunks.push(storedChunk);
  }

  await tx.done;

  // Retorna os chunks em ordem estável (página, índice na página, startOffset)
  return storedChunks.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.chunkIndexInPage !== b.chunkIndexInPage) return a.chunkIndexInPage - b.chunkIndexInPage;
    return a.startOffset - b.startOffset;
  });
}

/**
 * Recupera todos os chunks estruturados de um documento em ordem estável e determinística.
 */
export async function getDocumentChunks(documentId: string): Promise<StoredDocumentChunk[]> {
  if (!documentId) return [];
  const db = await getDB();
  const rawChunks = await db.getAllFromIndex('document_chunks', 'by-document', documentId);
  
  return (rawChunks as StoredDocumentChunk[]).sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.chunkIndexInPage !== b.chunkIndexInPage) return a.chunkIndexInPage - b.chunkIndexInPage;
    return a.startOffset - b.startOffset;
  });
}

/**
 * Remove todos os chunks pertencentes a um documento do IndexedDB.
 * Não afeta chunks de nenhum outro documento (isolamento estrito).
 */
export async function deleteDocumentChunks(documentId: string): Promise<number> {
  if (!documentId) return 0;
  const db = await getDB();
  const tx = db.transaction(['document_chunks'], 'readwrite');
  const store = tx.objectStore('document_chunks');
  const chunkKeys = await store.index('by-document').getAllKeys(documentId);
  
  for (const k of chunkKeys) {
    await store.delete(k);
  }
  
  await tx.done;
  return chunkKeys.length;
}

/**
 * Calcula estatísticas consolidadas dos chunks persistidos para um documento.
 */
export async function getDocumentChunksStats(documentId: string): Promise<DocumentChunksStats> {
  const chunks = await getDocumentChunks(documentId);
  const pages = new Set<number>();
  let totalEstimatedTokens = 0;
  let oversizeChunksCount = 0;
  const kindsCount: Record<string, number> = {};

  for (const c of chunks) {
    pages.add(c.pageNumber);
    totalEstimatedTokens += c.estimatedTokens || 0;
    if (c.oversizeAtomicBlock) oversizeChunksCount++;
    kindsCount[c.contentKind] = (kindsCount[c.contentKind] || 0) + 1;
  }

  return {
    documentId,
    totalChunks: chunks.length,
    totalPagesCovered: pages.size,
    totalEstimatedTokens,
    oversizeChunksCount,
    kindsCount,
  };
}

