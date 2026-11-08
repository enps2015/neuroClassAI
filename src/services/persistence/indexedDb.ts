import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  DocumentSource,
  LearningAnalysis,
  StudyNote,
  TutorChatMessage,
  LearningSession,
  LearningAttempt,
  ConceptMastery,
  ConceptReviewSchedule,
} from '../../types';

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
  /* Fase 2: Stores de Avaliação Cognitiva e C.R.E.A.R. */
  learning_sessions: {
    key: string; // id da sessão
    value: LearningSession;
    indexes: { 'by-document': string; 'by-updated': number };
  };
  learning_attempts: {
    key: string; // id da tentativa
    value: LearningAttempt;
    indexes: {
      'by-document': string;
      'by-concept': string;
      'by-session': string;
      'by-created': number;
    };
  };
  concept_mastery: {
    key: string; // `${documentId}#${conceptId}`
    value: ConceptMastery;
    indexes: {
      'by-document': string;
      'by-concept': string;
      'by-diagnostic-state': string;
    };
  };
  /* Marco 2D: Recuperação Espaçada e Memória Longitudinal FSRS-7 */
  review_schedules: {
    key: string; // `${documentId}#${conceptId}`
    value: ConceptReviewSchedule;
    indexes: {
      'by-document': string;
      'by-concept': string;
      'by-due': string;
    };
  };
}

const DB_NAME = 'neuroclass_ai_db';
const DB_VERSION = 3; // Evolução de schema v2 -> v3 (Marco 2D: FSRS-7)

let dbPromise: Promise<IDBPDatabase<NeuroClassDB>> | null = null;

// Emulador em memória para execução de testes em ambiente Node.js puro sem indexedDB global
const inMemoryStore = new Map<string, Map<string, any>>();
function getInMemStore(storeName: string): Map<string, any> {
  if (!inMemoryStore.has(storeName)) {
    inMemoryStore.set(storeName, new Map());
  }
  return inMemoryStore.get(storeName)!;
}

const inMemoryMockDb: any = {
  put: async (store: string, value: any) => {
    const s = getInMemStore(store);
    const key = value.id || value.documentId || value.key;
    s.set(key, JSON.parse(JSON.stringify(value)));
  },
  get: async (store: string, key: string) => {
    const s = getInMemStore(store);
    const val = s.get(key);
    return val ? JSON.parse(JSON.stringify(val)) : undefined;
  },
  delete: async (store: string, key: string) => {
    const s = getInMemStore(store);
    s.delete(key);
  },
  getAll: async (store: string) => {
    const s = getInMemStore(store);
    return Array.from(s.values()).map(v => JSON.parse(JSON.stringify(v)));
  },
  getAllFromIndex: async (store: string, index: string, queryKey: any) => {
    const s = getInMemStore(store);
    const all = Array.from(s.values());
    if (index === 'by-document') {
      return all.filter(item => item.documentId === queryKey).map(v => JSON.parse(JSON.stringify(v)));
    }
    if (index === 'by-concept') {
      return all.filter(item => item.conceptId === queryKey).map(v => JSON.parse(JSON.stringify(v)));
    }
    if (index === 'by-session') {
      return all.filter(item => item.sessionId === queryKey).map(v => JSON.parse(JSON.stringify(v)));
    }
    if (index === 'by-diagnostic-state') {
      return all.filter(item => item.diagnosticState === queryKey).map(v => JSON.parse(JSON.stringify(v)));
    }
    return all.map(v => JSON.parse(JSON.stringify(v)));
  },
  transaction: (stores: string[], mode: string) => ({
    objectStore: (store: string) => ({
      get: async (key: string) => inMemoryMockDb.get(store, key),
      delete: async (key: string) => inMemoryMockDb.delete(store, key),
      index: (indexName: string) => ({
        getAllKeys: async (queryKey: any) => {
          const items = await inMemoryMockDb.getAllFromIndex(store, indexName, queryKey);
          return items.map((i: any) => i.id || i.documentId);
        },
      }),
    }),
    done: Promise.resolve(),
  }),
};

export async function getDB(): Promise<IDBPDatabase<NeuroClassDB>> {
  if (typeof indexedDB === 'undefined') {
    return inMemoryMockDb as IDBPDatabase<NeuroClassDB>;
  }

  if (!dbPromise) {
    dbPromise = openDB<NeuroClassDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 Stores (Preservação estrita da Fase 1)
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

        // v2 Stores (Fase 2: Aprendizagem Cognitiva e Avaliação)
        if (oldVersion < 2 || !db.objectStoreNames.contains('learning_sessions')) {
          if (!db.objectStoreNames.contains('learning_sessions')) {
            const sessionStore = db.createObjectStore('learning_sessions', { keyPath: 'id' });
            sessionStore.createIndex('by-document', 'documentId');
            sessionStore.createIndex('by-updated', 'updatedAt');
          }
        }

        if (oldVersion < 2 || !db.objectStoreNames.contains('learning_attempts')) {
          if (!db.objectStoreNames.contains('learning_attempts')) {
            const attemptStore = db.createObjectStore('learning_attempts', { keyPath: 'id' });
            attemptStore.createIndex('by-document', 'documentId');
            attemptStore.createIndex('by-concept', 'conceptId');
            attemptStore.createIndex('by-session', 'sessionId');
            attemptStore.createIndex('by-created', 'createdAt');
          }
        }

        if (oldVersion < 2 || !db.objectStoreNames.contains('concept_mastery')) {
          if (!db.objectStoreNames.contains('concept_mastery')) {
            const masteryStore = db.createObjectStore('concept_mastery', { keyPath: 'id' });
            masteryStore.createIndex('by-document', 'documentId');
            masteryStore.createIndex('by-concept', 'conceptId');
            masteryStore.createIndex('by-diagnostic-state', 'diagnosticState');
          }
        }

        // v3 Store (Marco 2D: Recuperação Espaçada e Memória Longitudinal FSRS-7)
        if (oldVersion < 3 || !db.objectStoreNames.contains('review_schedules')) {
          if (!db.objectStoreNames.contains('review_schedules')) {
            const scheduleStore = db.createObjectStore('review_schedules', { keyPath: 'id' });
            scheduleStore.createIndex('by-document', 'documentId');
            scheduleStore.createIndex('by-concept', 'conceptId');
            scheduleStore.createIndex('by-due', 'nextReviewDue');
          }
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

/* ==========================================================================
   MÉTODOS DA FASE 2: APRENDIZAGEM COGNITIVA E MÓDULO AGORA EU EXPLICO
   ========================================================================== */

export async function saveLearningAttempt(attempt: LearningAttempt): Promise<void> {
  const db = await getDB();
  await db.put('learning_attempts', attempt);
}

export async function getAttemptsByConcept(documentId: string, conceptId: string): Promise<LearningAttempt[]> {
  const db = await getDB();
  const allForConcept = await db.getAllFromIndex('learning_attempts', 'by-concept', conceptId);
  return allForConcept.filter(a => a.documentId === documentId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAttemptsBySession(sessionId: string): Promise<LearningAttempt[]> {
  const db = await getDB();
  const attempts = await db.getAllFromIndex('learning_attempts', 'by-session', sessionId);
  return attempts.sort((a, b) => a.createdAt - b.createdAt);
}

export function buildMasteryKey(documentId: string, conceptId: string): string {
  return `${documentId}#${conceptId}`;
}

export async function getConceptMastery(documentId: string, conceptId: string): Promise<ConceptMastery | undefined> {
  const db = await getDB();
  const key = buildMasteryKey(documentId, conceptId);
  return db.get('concept_mastery', key);
}

export async function saveConceptMastery(mastery: ConceptMastery): Promise<void> {
  const db = await getDB();
  await db.put('concept_mastery', mastery);
}

export async function getAllMasteryByDocument(documentId: string): Promise<ConceptMastery[]> {
  const db = await getDB();
  return db.getAllFromIndex('concept_mastery', 'by-document', documentId);
}

export async function saveLearningSession(session: LearningSession): Promise<void> {
  const db = await getDB();
  await db.put('learning_sessions', session);
}

export async function getLearningSession(sessionId: string): Promise<LearningSession | undefined> {
  const db = await getDB();
  return db.get('learning_sessions', sessionId);
}

export async function getSessionsByDocument(documentId: string): Promise<LearningSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('learning_sessions', 'by-document', documentId);
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Exclusão definitiva de documento e todos os seus relacionamentos (Right to be Forgotten).
 * Atualizado na v2 para limpar também dados cognitivos da Fase 2.
 */
export async function deleteDocumentCompletely(documentId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [
      'documents',
      'analyses',
      'notes',
      'chat_sessions',
      'file_blobs',
      'learning_sessions',
      'learning_attempts',
      'concept_mastery',
      'review_schedules',
    ],
    'readwrite'
  );

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

  // Limpar sessões de aprendizagem Fase 2
  const sessionStore = tx.objectStore('learning_sessions');
  const sessionKeys = await sessionStore.index('by-document').getAllKeys(documentId);
  for (const key of sessionKeys) {
    await sessionStore.delete(key);
  }

  // Limpar tentativas de aprendizagem Fase 2
  const attemptStore = tx.objectStore('learning_attempts');
  const attemptKeys = await attemptStore.index('by-document').getAllKeys(documentId);
  for (const key of attemptKeys) {
    await attemptStore.delete(key);
  }

  // Limpar maestria de conceitos Fase 2
  const masteryStore = tx.objectStore('concept_mastery');
  const masteryKeys = await masteryStore.index('by-document').getAllKeys(documentId);
  for (const key of masteryKeys) {
    await masteryStore.delete(key);
  }

  // Limpar agendamentos de repetição espaçada Marco 2D
  const scheduleStore = tx.objectStore('review_schedules');
  const scheduleKeys = await scheduleStore.index('by-document').getAllKeys(documentId);
  for (const key of scheduleKeys) {
    await scheduleStore.delete(key);
  }

  await tx.done;
}

/**
 * Persiste ou atualiza o agendamento de repetição espaçada de um conceito.
 */
export async function saveReviewSchedule(schedule: ConceptReviewSchedule): Promise<void> {
  const db = await getDB();
  await db.put('review_schedules', schedule);
}

/**
 * Obtém o agendamento de repetição espaçada de um conceito específico.
 */
export async function getReviewSchedule(
  documentId: string,
  conceptId: string
): Promise<ConceptReviewSchedule | null> {
  const db = await getDB();
  const schedule = await db.get('review_schedules', buildMasteryKey(documentId, conceptId));
  return schedule || null;
}

/**
 * Lista todos os agendamentos de repetição espaçada de um documento.
 */
export async function getReviewSchedulesByDocument(
  documentId: string
): Promise<ConceptReviewSchedule[]> {
  const db = await getDB();
  return db.getAllFromIndex('review_schedules', 'by-document', documentId);
}

/**
 * Remove o agendamento de repetição espaçada de um conceito.
 */
export async function deleteReviewSchedule(
  documentId: string,
  conceptId: string
): Promise<void> {
  const db = await getDB();
  await db.delete('review_schedules', buildMasteryKey(documentId, conceptId));
}

/**
 * Exporta todo o histórico de aprendizagem, avaliações e notas em formato JSON para resguardo do estudante.
 */
export async function exportUserDataAsJson(): Promise<string> {
  const db = await getDB();
  const documents = await db.getAll('documents');
  const analyses = await db.getAll('analyses');
  const notes = await db.getAll('notes');
  const attempts = await db.getAll('learning_attempts');
  const mastery = await db.getAll('concept_mastery');
  const sessions = await db.getAll('learning_sessions');
  const schedules = await db.getAll('review_schedules');

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    version: '2.4',
    data: {
      documents: documents.filter(d => !d.isDemoMaterial),
      analyses,
      notes,
      learningAttempts: attempts,
      conceptMastery: mastery,
      learningSessions: sessions,
      reviewSchedules: schedules,
    },
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Restaura dados do usuário a partir de um backup JSON, garantindo reconstituição fiel
 * de documentos, análises, notas, tentativas, domínio cognitivo e agendamentos FSRS com histórico de logs.
 */
export async function restoreUserDataFromJson(jsonString: string): Promise<{
  documentsCount: number;
  analysesCount: number;
  notesCount: number;
  attemptsCount: number;
  masteryCount: number;
  sessionsCount: number;
  schedulesCount: number;
}> {
  const payload = JSON.parse(jsonString);
  const data = payload?.data;
  if (!data) throw new Error('Formato de backup inválido: bloco "data" não encontrado.');

  const db = await getDB();

  let documentsCount = 0;
  if (Array.isArray(data.documents)) {
    for (const doc of data.documents) {
      await db.put('documents', doc);
      documentsCount++;
    }
  }

  let analysesCount = 0;
  if (Array.isArray(data.analyses)) {
    for (const analysis of data.analyses) {
      await db.put('analyses', analysis);
      analysesCount++;
    }
  }

  let notesCount = 0;
  if (Array.isArray(data.notes)) {
    for (const note of data.notes) {
      await db.put('notes', note);
      notesCount++;
    }
  }

  let attemptsCount = 0;
  if (Array.isArray(data.learningAttempts)) {
    for (const attempt of data.learningAttempts) {
      await db.put('learning_attempts', attempt);
      attemptsCount++;
    }
  }

  let masteryCount = 0;
  if (Array.isArray(data.conceptMastery)) {
    for (const m of data.conceptMastery) {
      await db.put('concept_mastery', m);
      masteryCount++;
    }
  }

  let sessionsCount = 0;
  if (Array.isArray(data.learningSessions)) {
    for (const session of data.learningSessions) {
      await db.put('learning_sessions', session);
      sessionsCount++;
    }
  }

  let schedulesCount = 0;
  if (Array.isArray(data.reviewSchedules)) {
    for (const sched of data.reviewSchedules) {
      await db.put('review_schedules', sched);
      schedulesCount++;
    }
  }

  return {
    documentsCount,
    analysesCount,
    notesCount,
    attemptsCount,
    masteryCount,
    sessionsCount,
    schedulesCount,
  };
}
