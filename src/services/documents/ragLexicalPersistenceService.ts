/**
 * NeuroClass AI — Serviço de Persistência do Índice Lexical BM25 (IndexedDB)
 * @module services/documents/ragLexicalPersistenceService
 *
 * Fornece operações atômicas, tipadas e idempotentes para:
 * 1. Salvar / substituir integralmente o índice lexical invertido de um documento;
 * 2. Recuperar o índice e as estatísticas BM25 de um ou mais documentos;
 * 3. Excluir o índice lexical de um documento de forma limpa e sem resíduos;
 * 4. Listar todos os índices para consultas de escopo global ou multi-documento.
 */

import { getDB } from '../persistence/indexedDb';
import type { StoredLexicalIndex } from '../../types/rag';

/**
 * Salva ou substitui de forma atômica e idempotente o índice lexical invertido de um documento.
 */
export async function saveLexicalIndex(index: StoredLexicalIndex): Promise<void> {
  if (!index || !index.documentId) {
    throw new Error('[BM25 Persistence] Índice lexical inválido: documentId é obrigatório.');
  }

  const db = await getDB();
  const tx = db.transaction(['rag_lexical_index'], 'readwrite');
  const store = tx.objectStore('rag_lexical_index');

  await store.put(index as any);
  await tx.done;
}

/**
 * Recupera o índice lexical invertido e metadados de um documento específico.
 */
export async function getLexicalIndex(
  documentId: string
): Promise<StoredLexicalIndex | undefined> {
  if (!documentId) return undefined;
  const db = await getDB();
  const raw = await db.get('rag_lexical_index', documentId);
  return raw as StoredLexicalIndex | undefined;
}

/**
 * Exclui o índice lexical invertido de um documento do IndexedDB.
 */
export async function deleteLexicalIndex(documentId: string): Promise<void> {
  if (!documentId) return;
  const db = await getDB();
  const tx = db.transaction(['rag_lexical_index'], 'readwrite');
  const store = tx.objectStore('rag_lexical_index');
  await store.delete(documentId);
  await tx.done;
}

/**
 * Recupera todos os índices lexicais persistidos no banco local.
 */
export async function getAllLexicalIndexes(): Promise<StoredLexicalIndex[]> {
  const db = await getDB();
  const list = await db.getAll('rag_lexical_index');
  return list as StoredLexicalIndex[];
}

