/**
 * NeuroClass AI — Serviço de Persistência de Embeddings Densos Locais (IndexedDB)
 * @module services/documents/ragDensePersistenceService
 *
 * Fornece operações atômicas, tipadas e idempotentes para:
 * 1. Salvar / atualizar em lote os vetores densos (384-d) de chunks de um documento;
 * 2. Recuperar embeddings densos por documento ou escopo multi-documento;
 * 3. Gerenciar metadados de estado do índice vetorial (pendente, em progresso, concluído, parcial);
 * 4. Excluir embeddings e metadados de forma transacional e sem resíduos;
 * 5. Verificar compatibilidade de versão de modelo e contentHash para evitar dados stale.
 */

import { getDB } from '../persistence/indexedDb';
import type { StoredDenseEmbedding, DenseIndexMetadata } from '../../types/rag';

export const CURRENT_DENSE_MODEL_VERSION = 'Xenova/multilingual-e5-small:761b726dd34fb83930e26aab4e9ac3899aa1fa78:q8';
export const DENSE_VECTOR_DIMENSION = 384;

/**
 * Salva em lote os embeddings densos gerados para os chunks de um documento.
 * A gravação é transacional e atômica.
 */
export async function saveDenseEmbeddings(
  documentId: string,
  embeddings: StoredDenseEmbedding[]
): Promise<void> {
  if (!documentId) {
    throw new Error('[Dense Persistence] documentId obrigatório para salvar embeddings.');
  }
  if (!embeddings || embeddings.length === 0) {
    return;
  }

  const db = await getDB();
  const tx = db.transaction(['document_dense_embeddings'], 'readwrite');
  const store = tx.objectStore('document_dense_embeddings');

  for (const emb of embeddings) {
    // Garante identificadores canônicos
    emb.documentId = documentId;
    emb.storedAt = emb.storedAt || Date.now();
    await store.put(emb as any);
  }

  await tx.done;
}

/**
 * Recupera todos os embeddings densos persistidos para um documento específico.
 */
export async function getDenseEmbeddings(
  documentId: string
): Promise<StoredDenseEmbedding[]> {
  if (!documentId) return [];
  const db = await getDB();
  const list = await db.getAllFromIndex('document_dense_embeddings', 'by-document', documentId);
  return (list as StoredDenseEmbedding[]) || [];
}

/**
 * Recupera embeddings densos para uma lista de documentos permitidos (escopo multi-documento).
 */
export async function getDenseEmbeddingsForDocuments(
  documentIds: string[]
): Promise<StoredDenseEmbedding[]> {
  if (!documentIds || documentIds.length === 0) return [];
  const results: StoredDenseEmbedding[] = [];
  for (const docId of documentIds) {
    const embs = await getDenseEmbeddings(docId);
    results.push(...embs);
  }
  return results;
}

/**
 * Recupera todos os embeddings densos persistidos no IndexedDB (busca global em todo o repositório).
 */
export async function getAllDenseEmbeddings(): Promise<StoredDenseEmbedding[]> {
  const db = await getDB();
  const list = await db.getAll('document_dense_embeddings');
  return (list as StoredDenseEmbedding[]) || [];
}

/**
 * Salva ou atualiza os metadados do índice denso de um documento.
 */
export async function saveDenseIndexMetadata(
  metadata: DenseIndexMetadata
): Promise<void> {
  if (!metadata || !metadata.documentId) {
    throw new Error('[Dense Persistence] Metadados inválidos: documentId obrigatório.');
  }
  const db = await getDB();
  const tx = db.transaction(['rag_dense_index_metadata'], 'readwrite');
  const store = tx.objectStore('rag_dense_index_metadata');
  await store.put(metadata as any);
  await tx.done;
}

/**
 * Recupera os metadados do índice denso de um documento.
 */
export async function getDenseIndexMetadata(
  documentId: string
): Promise<DenseIndexMetadata | null> {
  if (!documentId) return null;
  const db = await getDB();
  const raw = await db.get('rag_dense_index_metadata', documentId);
  return (raw as DenseIndexMetadata) || null;
}

/**
 * Exclui todos os embeddings densos e metadados de um documento do IndexedDB.
 */
export async function deleteDenseEmbeddings(documentId: string): Promise<void> {
  if (!documentId) return;
  const db = await getDB();
  const tx = db.transaction(['document_dense_embeddings', 'rag_dense_index_metadata'], 'readwrite');
  
  const denseStore = tx.objectStore('document_dense_embeddings');
  const keys = await denseStore.index('by-document').getAllKeys(documentId);
  for (const key of keys) {
    await denseStore.delete(key);
  }

  const metaStore = tx.objectStore('rag_dense_index_metadata');
  await metaStore.delete(documentId);

  await tx.done;
}

/**
 * Limpa todos os embeddings densos e metadados locais (ex.: usuário revoga consentimento semântico).
 * NÃO afeta documentos, chunks estruturados ou índices BM25.
 */
export async function clearAllDenseEmbeddings(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['document_dense_embeddings', 'rag_dense_index_metadata'], 'readwrite');
  await tx.objectStore('document_dense_embeddings').clear();
  await tx.objectStore('rag_dense_index_metadata').clear();
  await tx.done;
}

/**
 * Verifica se um embedding persistido é estritamente compatível com a versão ativa do modelo
 * e se o hash criptográfico do conteúdo do chunk confere (evitando vetores stale).
 */
export function isEmbeddingCompatible(
  embedding: StoredDenseEmbedding,
  currentModelVersion: string = CURRENT_DENSE_MODEL_VERSION,
  expectedContentHash?: string
): boolean {
  if (!embedding || !embedding.embedding || embedding.embedding.length !== DENSE_VECTOR_DIMENSION) {
    return false;
  }
  if (embedding.modelVersion !== currentModelVersion) {
    return false;
  }
  if (expectedContentHash && embedding.contentHash !== expectedContentHash) {
    return false;
  }
  return true;
}

