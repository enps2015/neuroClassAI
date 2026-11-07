import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentSource, LearningAnalysis, StudyNote, TutorChatMessage } from '../../types';

interface NeuroClassDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentSource;
    indexes: { 'by-uploaded': number };
  };
  analyses: {
    key: string;
    value: LearningAnalysis;
    indexes: { 'by-document': string };
  };
  notes: {
    key: string;
    value: StudyNote;
    indexes: { 'by-document': string; 'by-updated': number };
  };
  chat_sessions: {
    key: string; // documentId
    value: { documentId: string; messages: TutorChatMessage[]; updatedAt: number };
  };
  file_blobs: {
    key: string;
    value: { id: string; blob: Blob; mimeType: string; size: number };
  };
}

const DB_NAME = 'neuroclass_ai_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NeuroClassDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<NeuroClassDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NeuroClassDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('by-uploaded', 'uploadedAt');
        }
        if (!db.objectStoreNames.contains('analyses')) {
          const analysisStore = db.createObjectStore('analyses', { keyPath: 'id' });
          analysisStore.createIndex('by-document', 'documentId');
        }
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('by-document', 'documentId');
          notesStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('chat_sessions')) {
          db.createObjectStore('chat_sessions', { keyPath: 'documentId' });
        }
        if (!db.objectStoreNames.contains('file_blobs')) {
          db.createObjectStore('file_blobs', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Verifica o espaço disponível no armazenamento local.
 */
export async function checkStorageQuota(): Promise<{
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isCritical: boolean;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const percent = (usage / quota) * 100;
      return {
        usageBytes: usage,
        quotaBytes: quota,
        usagePercent: percent,
        isCritical: percent > 85,
      };
    } catch {
      // Fallback gracioso
    }
  }
  return { usageBytes: 0, quotaBytes: 0, usagePercent: 0, isCritical: false };
}

/**
 * Salva documento pessoal com tratamento de quota e fallback de Blob.
 */
export async function saveDocument(
  doc: DocumentSource,
  fileBlob?: Blob
): Promise<{ success: boolean; storageOptimized: boolean }> {
  const db = await getDB();
  let storageOptimized = false;
  let shouldStoreBlob = false;
  let blobId: string | undefined = undefined;

  if (fileBlob) {
    // Verificar quota ANTES de iniciar a transação para não causar auto-commit do IndexedDB
    const quota = await checkStorageQuota();
    if (quota.isCritical) {
      storageOptimized = true;
    } else {
      shouldStoreBlob = true;
      blobId = `blob_${doc.id}`;
      doc.storageRef = blobId;
    }
  }

  const tx = db.transaction(['documents', 'file_blobs'], 'readwrite');
  try {
    if (shouldStoreBlob && blobId && fileBlob) {
      await tx.objectStore('file_blobs').put({
        id: blobId,
        blob: fileBlob,
        mimeType: doc.mimeType,
        size: doc.sizeBytes,
      });
    }
    await tx.objectStore('documents').put(doc);
    await tx.done;
    return { success: true, storageOptimized };
  } catch (error) {
    console.error('Falha ao salvar documento no IndexedDB:', error);
    throw error;
  }
}

export async function getAllUserDocuments(): Promise<DocumentSource[]> {
  const db = await getDB();
  const allDocs = await db.getAllFromIndex('documents', 'by-uploaded');
  // Filtra estritamente apenas documentos pessoais; demos ficam isoladas em memória/catálogo
  return allDocs.filter(d => !d.isDemoMaterial).reverse();
}

export async function getDocumentById(id: string): Promise<DocumentSource | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function getDocumentFileBlob(blobId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const entry = await db.get('file_blobs', blobId);
  return entry?.blob;
}

export async function saveAnalysis(analysis: LearningAnalysis): Promise<void> {
  const db = await getDB();
  await db.put('analyses', analysis);
}

export async function getAnalysisByDocumentId(documentId: string): Promise<LearningAnalysis | undefined> {
  const db = await getDB();
  return db.getFromIndex('analyses', 'by-document', documentId);
}

export async function saveStudyNote(note: StudyNote): Promise<void> {
  const db = await getDB();
  await db.put('notes', note);
}

export async function getNotesByDocumentId(documentId: string): Promise<StudyNote[]> {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'by-document', documentId);
}

export async function deleteStudyNote(noteId: string): Promise<void> {
  const db = await getDB();
  await db.delete('notes', noteId);
}

export async function saveChatSession(documentId: string, messages: TutorChatMessage[]): Promise<void> {
  const db = await getDB();
  await db.put('chat_sessions', {
    documentId,
    messages,
    updatedAt: Date.now(),
  });
}

export async function getChatSession(documentId: string): Promise<TutorChatMessage[]> {
  const db = await getDB();
  const session = await db.get('chat_sessions', documentId);
  return session?.messages || [];
}

/**
 * Exclusão definitiva de documento e todos os seus relacionamentos (Right to be Forgotten).
 */
export async function deleteDocumentCompletely(documentId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'analyses', 'notes', 'chat_sessions', 'file_blobs'], 'readwrite');
  
  const doc = await tx.objectStore('documents').get(documentId);
  if (doc?.storageRef) {
    await tx.objectStore('file_blobs').delete(doc.storageRef);
  }
  
  await tx.objectStore('documents').delete(documentId);
  
  // Limpar análises associadas
  const analysisStore = tx.objectStore('analyses');
  const analysisKeys = await analysisStore.index('by-document').getAllKeys(documentId);
  for (const key of analysisKeys) {
    await analysisStore.delete(key);
  }
  
  // Limpar notas associadas
  const notesStore = tx.objectStore('notes');
  const noteKeys = await notesStore.index('by-document').getAllKeys(documentId);
  for (const key of noteKeys) {
    await notesStore.delete(key);
  }
  
  // Limpar histórico de conversa
  await tx.objectStore('chat_sessions').delete(documentId);
  
  await tx.done;
}

/**
 * Exporta todo o histórico de aprendizagem e notas em formato JSON para resguardo do estudante.
 */
export async function exportUserDataAsJson(): Promise<string> {
  const db = await getDB();
  const documents = await db.getAll('documents');
  const analyses = await db.getAll('analyses');
  const notes = await db.getAll('notes');
  
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    version: '2.2',
    data: {
      documents: documents.filter(d => !d.isDemoMaterial),
      analyses,
      notes,
    },
  };
  return JSON.stringify(exportPayload, null, 2);
}
