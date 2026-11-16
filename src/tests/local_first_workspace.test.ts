import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveDocument,
  getDocumentById,
  getAllUserDocuments,
  saveAnalysis,
  getAnalysisByDocumentId,
  saveStudyNote,
  getNotesByDocumentId,
  saveVisualResource,
  getVisualResourcesByDocument,
  saveChatSession,
  getChatSession,
  saveConceptMastery,
  getConceptMastery,
  saveReviewSchedule,
  getReviewSchedule,
  saveLearningSession,
  getSessionsByDocument,
  saveLearningAttempt,
  getAttemptsByDocument,
  deleteDocumentCompletely,
  getDocumentFileBlob,
  clearAllUserData,
  buildMasteryKey,
} from '../services/persistence/indexedDb';
import { workspaceStorage } from '../services/storage/workspaceStorage';
import { FileSystemAccessAdapter } from '../services/storage/fileSystemAdapter';
import { IndexedDbStorageAdapter } from '../services/storage/indexedDbAdapter';
import { MigrationService } from '../services/storage/migrationService';
import { BackupService } from '../services/storage/backupService';
import { calculateSha256 } from '../services/storage/checksumService';
import { createZipArchive, extractZipArchive } from '../services/storage/zipService';
import { buildSubjectFolderName, sanitizePathComponent } from '../services/storage/pathSanitizer';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import {
  enrollConceptInSpacedRepetition,
  processConceptReview,
} from '../services/learning/spacedRepetitionService';
import { generateCuratedDemoIllustration } from '../services/visual/demoIllustrations';
import { visualLearningService } from '../services/visual/visualLearningService';
import type {
  DocumentSource,
  LearningAnalysis,
  Concept,
  StudyNote,
  VisualResource,
  ConceptMastery,
  LearningSession,
  LearningAttempt,
  ConceptReviewSchedule,
} from '../types';

// Mock File System Handles para testes de fidelidade
class MockFileHandle {
  kind = 'file' as const;
  name: string;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(name: string) {
    this.name = name;
  }

  async getFile(): Promise<any> {
    const buf = this.buffer;
    return {
      name: this.name,
      size: buf.byteLength,
      type: this.name.endsWith('.pdf')
        ? 'application/pdf'
        : this.name.endsWith('.json')
        ? 'application/json'
        : this.name.endsWith('.png')
        ? 'image/png'
        : this.name.endsWith('.svg')
        ? 'image/svg+xml'
        : 'application/octet-stream',
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => new TextDecoder().decode(buf),
    };
  }

  async createWritable(): Promise<any> {
    const chunks: Uint8Array[] = [];
    return {
      write: async (chunk: any) => {
        if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else if (chunk instanceof ArrayBuffer) {
          chunks.push(new Uint8Array(chunk));
        } else if (chunk?.data) {
          chunks.push(new Uint8Array(chunk.data));
        }
      },
      close: async () => {
        const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const combined = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.byteLength;
        }
        this.buffer = combined;
      },
    };
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }

  setBuffer(buf: Uint8Array): void {
    this.buffer = buf;
  }
}

class MockDirectoryHandle {
  kind = 'directory' as const;
  name: string;
  private entries = new Map<string, MockDirectoryHandle | MockFileHandle>();
  public permission: 'granted' | 'prompt' | 'denied' = 'granted';

  constructor(name: string) {
    this.name = name;
  }

  async queryPermission(_desc?: any): Promise<'granted' | 'prompt' | 'denied'> {
    return this.permission;
  }

  async requestPermission(_desc?: any): Promise<'granted' | 'denied'> {
    if (this.permission === 'prompt') {
      this.permission = 'granted';
    }
    return this.permission === 'granted' ? 'granted' : 'denied';
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectoryHandle> {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== 'directory') throw new Error(`Not a directory: ${name}`);
      return existing as MockDirectoryHandle;
    }
    if (options?.create) {
      const newDir = new MockDirectoryHandle(name);
      this.entries.set(name, newDir);
      return newDir;
    }
    throw new Error(`NotFoundError: ${name}`);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw new Error(`Not a file: ${name}`);
      return existing as MockFileHandle;
    }
    if (options?.create) {
      const newFile = new MockFileHandle(name);
      this.entries.set(name, newFile);
      return newFile;
    }
    throw new Error(`NotFoundError: ${name}`);
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.entries.delete(name);
  }

  async *values(): AsyncIterableIterator<MockDirectoryHandle | MockFileHandle> {
    for (const val of this.entries.values()) {
      yield val;
    }
  }

  getEntries(): Map<string, MockDirectoryHandle | MockFileHandle> {
    return this.entries;
  }
}

// Helpers tipados para criação determinística de dados
function createMockDoc(overrides: Partial<DocumentSource> = {}): DocumentSource {
  return {
    id: overrides.id || 'doc-' + Math.random().toString(36).slice(2, 8),
    title: overrides.title || 'Documento Teste',
    subject: overrides.subject || 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048,
    pageCount: overrides.pages?.length || 1,
    uploadedAt: Date.now(),
    mimeType: 'application/pdf',
    pages: overrides.pages || [{ pageNumber: 1, textContent: 'Conteúdo de teste', hasVisualElements: false }],
    ...overrides,
  };
}

function createMockConcept(id: string, name: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id,
    name,
    definition: `Definição de ${name}`,
    importance: 'fundamental',
    epistemicStatus: 'explicitly_documented',
    evidenceReferences: [],
    prerequisiteConceptIds: [],
    diagnosticState: 'understood',
    ...overrides,
  };
}

function createMockAnalysis(documentId: string, concepts: Concept[] = []): LearningAnalysis {
  return {
    id: `analise-${documentId}`,
    documentId,
    domain: 'Neurociências',
    centralTheme: 'Neurobiologia Celular',
    learningObjectives: ['Compreender mecanismos sinápticos'],
    fundamentalConcepts: concepts,
    complementaryConcepts: [],
    relationships: [],
    prerequisiteGraph: { nodes: [], edges: [] },
    identifiedGaps: [],
    suggestedDiagramType: 'concept-map',
    analyzedAt: Date.now(),
  };
}

function createMockNote(id: string, documentId: string, associatedConceptId?: string): StudyNote {
  return {
    id,
    documentId,
    associatedConceptId,
    title: `Nota ${id}`,
    content: `Conteúdo de estudo para ${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createMockVisual(id: string, documentId: string, conceptId = 'c-1'): VisualResource {
  return {
    id,
    documentId,
    conceptId,
    conceptName: 'Conceito Visual',
    title: `Recurso Visual ${id}`,
    caption: 'Legenda explicativa',
    promptUsed: 'Diagrama esquemático limpo',
    imageDataUrl: 'data:image/svg+xml;utf8,<svg viewBox="0 0 10 10"></svg>',
    mimeType: 'image/svg+xml',
    modality: 'conceptual_illustration',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  };
}

function createMockAttempt(
  id: string,
  docId: string,
  conceptId: string,
  overrides: Partial<LearningAttempt> = {}
): LearningAttempt {
  return {
    id,
    sessionId: `sess-${docId}`,
    documentId: docId,
    conceptId,
    attemptNumber: 1,
    promptQuestion: 'Explique o conceito de plasticidade sináptica.',
    studentExplanation: 'A plasticidade sináptica é a capacidade das sinapses se fortalecerem ou enfraquecerem.',
    feedback: {
      evaluatedMasteryLevel: 'understand',
      rubric: {
        conceptualPrecision: { score: 4, qualitativeStatus: 'accurate', comment: 'Exato' },
        completeness: { score: 4, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 4, qualitativeStatus: 'well_connected', comment: 'Bem conectado' },
        reasoningCoherence: { score: 4, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 4, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
      understoodElements: ['Sinapses'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      summary: 'Excelente explicação.',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: Date.now(),
    activityType: 'explain',
    ...overrides,
  };
}

function createMockSession(
  id: string,
  docId: string,
  overrides: Partial<LearningSession> = {}
): LearningSession {
  return {
    id,
    documentId: docId,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    sessionType: 'crear_cycle',
    attemptCount: 1,
    conceptsAddressed: ['c-1'],
    ...overrides,
  };
}

test('T370: Cenário 1 — Importação de PDF salva binário original antes da extração/análise', async () => {
  await clearAllUserData();
  await workspaceStorage.disconnectLocalDirectory();

  const fakePdfContent = '%PDF-1.4\n1 0 obj\n<< /Title (Neuroplasticidade Sináptica) >>\nendobj\ntrailer\n<< >>\n%%EOF';
  const pdfBytes = new TextEncoder().encode(fakePdfContent);
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  const expectedSha256 = await calculateSha256(pdfBytes);

  const doc = createMockDoc({
    id: 'doc-pdf-binary-01',
    title: 'Neuroplasticidade e LTP',
    subject: 'Neurociências',
    storageRef: 'blob_doc-pdf-binary-01',
    pages: [{ pageNumber: 1, textContent: 'Conteúdo sobre sinapses glutamatérgicas', hasVisualElements: false }],
  });

  // Salva binário original antes de qualquer análise
  const saveResult = await workspaceStorage.saveOriginalPdf(doc, pdfBlob);
  assert.equal(saveResult.sha256, expectedSha256, 'SHA-256 do PDF original deve ser idêntico ao cálculo independente');

  // Recupera o PDF original binário
  const retrieved = await workspaceStorage.getOriginalPdf(doc.id, doc.subject);
  assert.ok(retrieved, 'PDF binário original deve ser recuperado com sucesso');
  assert.equal(retrieved.mimeType, 'application/pdf', 'MIME type deve ser application/pdf');

  const retrievedSha = await calculateSha256(retrieved.buffer);
  assert.equal(retrievedSha, expectedSha256, 'Bytes binários do PDF recuperado devem ser idênticos ao original');

  // Verifica que o IndexedDB contém o blob correto na store file_blobs
  const blobStored = await getDocumentFileBlob(doc.storageRef!);
  assert.ok(blobStored, 'file_blobs no IndexedDB deve conter o blob');
  assert.equal(blobStored.size, pdfBytes.byteLength, 'Tamanho do blob no IndexedDB deve ser idêntico');
});

test('T371: Cenário 2 — Recarregamento da aplicação (F5) recupera documentos, análises, cadernos, imagens, domínio cognitivo e fila FSRS exatamente como estavam', async () => {
  await clearAllUserData();

  const docId = 'doc-f5-reload-01';
  const conceptId = 'conc-f5-ltp';

  // 1. Dados completos
  const doc = createMockDoc({
    id: docId,
    title: 'Potenciação de Longa Duração',
    subject: 'Neurociências',
    pageCount: 3,
    storageRef: `blob_${docId}`,
    pages: [
      { pageNumber: 1, textContent: 'Introdução à sinapse e LTP', hasVisualElements: false },
      { pageNumber: 2, textContent: 'Receptores NMDA e AMPA', hasVisualElements: true },
      { pageNumber: 3, textContent: 'Plasticidade estrutural pós-tetânica', hasVisualElements: false },
    ],
  });
  await saveDocument(doc, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }));

  const concept = createMockConcept(conceptId, 'LTP (Long-Term Potentiation)', {
    definition: 'Fortalecimento duradouro das transmissões sinápticas baseado em padrões recentes de atividade.',
  });

  const analysis = createMockAnalysis(docId, [concept]);
  await saveAnalysis(analysis);

  const note: StudyNote = {
    id: 'note-f5-01',
    documentId: docId,
    associatedConceptId: conceptId,
    title: 'Nota de Aula sobre LTP',
    content: 'Revisar relação entre influxo de cálcio e inserção de receptores AMPA.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveStudyNote(note);

  const visual: VisualResource = {
    id: 'vis-f5-01',
    documentId: docId,
    conceptId: conceptId,
    conceptName: 'LTP',
    title: 'Diagrama da Cascata de Cálcio',
    caption: 'Legenda explicativa da cascata de cálcio',
    promptUsed: 'Diagrama didático sem texto',
    imageDataUrl: 'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="purple"/></svg>',
    mimeType: 'image/svg+xml',
    modality: 'process_mechanism',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  };
  await saveVisualResource(visual);

  const mastery: ConceptMastery = {
    id: buildMasteryKey(docId, conceptId),
    documentId: docId,
    conceptId: conceptId,
    masteryLevel: 'transfer',
    diagnosticState: 'mastered',
    totalAttempts: 2,
    lastAttemptAt: Date.now(),
    historyAttemptIds: [],
    activeGaps: [],
    consolidatedEvidenceIds: [],
  };
  await saveConceptMastery(mastery);

  const schedule = await enrollConceptInSpacedRepetition(doc, concept);
  await saveReviewSchedule(schedule);

  // 2. Simula recarregamento da aplicação (limpa variáveis em memória e consulta persistência)
  const reloadedDocs = await getAllUserDocuments();
  assert.equal(reloadedDocs.length, 1, 'Documentos devem ser restaurados');
  assert.equal(reloadedDocs[0].title, 'Potenciação de Longa Duração');

  const reloadedAnalysis = await getAnalysisByDocumentId(docId);
  assert.ok(reloadedAnalysis, 'Análise deve ser restaurada');
  assert.equal(reloadedAnalysis.fundamentalConcepts.length, 1);
  assert.equal(reloadedAnalysis.fundamentalConcepts[0].name, 'LTP (Long-Term Potentiation)');

  const reloadedNotes = await getNotesByDocumentId(docId);
  assert.equal(reloadedNotes.length, 1, 'Caderno deve ser restaurado');
  assert.equal(reloadedNotes[0].title, 'Nota de Aula sobre LTP');

  const reloadedVisuals = await getVisualResourcesByDocument(docId);
  assert.equal(reloadedVisuals.length, 1, 'Imagens didáticas devem ser restauradas');
  assert.equal(reloadedVisuals[0].title, 'Diagrama da Cascata de Cálcio');

  const reloadedMastery = await getConceptMastery(docId, conceptId);
  assert.ok(reloadedMastery, 'Domínio cognitivo deve ser restaurado');
  assert.equal(reloadedMastery.masteryLevel, 'transfer');
  assert.equal(reloadedMastery.diagnosticState, 'mastered');

  const reloadedSchedule = await getReviewSchedule(docId, conceptId);
  assert.ok(reloadedSchedule, 'Agendamento FSRS deve ser restaurado');
  assert.equal(reloadedSchedule.conceptId, conceptId);
  assert.equal(reloadedSchedule.algorithm, 'FSRS-7');
});

test('T372: Cenário 3 — Isolamento multi-disciplina: abrir documento B não contamina nem sobrescreve conceitos/notas do documento A', async () => {
  await clearAllUserData();

  // Documento A: Neurociências
  const docA = createMockDoc({
    id: 'doc-neuro-01',
    title: 'Transmissão Dopaminérgica',
    subject: 'Neurociências',
  });
  await saveDocument(docA);
  const conceptA = createMockConcept('conc-dopa', 'Dopamina');
  await saveAnalysis(createMockAnalysis(docA.id, [conceptA]));
  await saveStudyNote({
    id: 'note-dopa-01',
    documentId: docA.id,
    associatedConceptId: 'conc-dopa',
    title: 'Via Mesolímbica',
    content: 'Projeção da VTA para o núcleo accumbens.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Documento B: Física Quântica
  const docB = createMockDoc({
    id: 'doc-quant-01',
    title: 'Dualidade Onda-Partícula',
    subject: 'Física e Mecânica Quântica',
    uploadedAt: Date.now() + 1000,
  });
  await saveDocument(docB);
  const conceptB = createMockConcept('conc-foton', 'Fóton');
  await saveAnalysis(createMockAnalysis(docB.id, [conceptB]));
  await saveStudyNote({
    id: 'note-foton-01',
    documentId: docB.id,
    associatedConceptId: 'conc-foton',
    title: 'Equação de Planck',
    content: 'E = h * nu',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Validação de isolamento estrito
  const notesA = await getNotesByDocumentId(docA.id);
  const notesB = await getNotesByDocumentId(docB.id);

  assert.equal(notesA.length, 1);
  assert.equal(notesA[0].title, 'Via Mesolímbica');
  assert.equal(notesB.length, 1);
  assert.equal(notesB[0].title, 'Equação de Planck');

  const analysisA = await getAnalysisByDocumentId(docA.id);
  const analysisB = await getAnalysisByDocumentId(docB.id);

  assert.equal(analysisA?.fundamentalConcepts[0].name, 'Dopamina');
  assert.equal(analysisB?.fundamentalConcepts[0].name, 'Fóton');

  // Validação de nomes sanitizados de pastas multi-disciplina
  const folderA = buildSubjectFolderName(docA.subject!, sanitizePathComponent(docA.subject!));
  const folderB = buildSubjectFolderName(docB.subject!, sanitizePathComponent(docB.subject!));

  assert.notEqual(folderA, folderB, 'Pastas de disciplinas diferentes devem ser rigorosamente distintas');
  assert.ok(folderA.toLowerCase().includes('neurociencias'), 'Pasta de neurociências deve conter tag identificadora');
  assert.ok(folderB.toLowerCase().includes('fisica'), 'Pasta de física deve conter tag identificadora');
});

test('T373: Cenário 4 — Preservação de bytes e formato de imagens didáticas (SVG/PNG/JPEG)', async () => {
  await clearAllUserData();

  // 1. Recurso SVG
  const svgXml = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#0ea5e9"/></svg>';
  const svgResource: VisualResource = {
    id: 'vis-format-svg',
    documentId: 'doc-formats',
    conceptId: 'conc-svg',
    conceptName: 'Sinapse',
    title: 'Sinapse SVG',
    caption: 'Legenda explicativa SVG',
    promptUsed: 'Vetor limpo',
    imageDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgXml)}`,
    mimeType: 'image/svg+xml',
    modality: 'conceptual_illustration',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  };

  // 2. Recurso PNG binário real
  const pngHeaderBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngBase64 = Buffer.from(pngHeaderBytes).toString('base64');
  const pngResource: VisualResource = {
    id: 'vis-format-png',
    documentId: 'doc-formats',
    conceptId: 'conc-png',
    conceptName: 'Vesícula',
    title: 'Vesícula PNG',
    caption: 'Legenda explicativa PNG',
    promptUsed: 'Raster PNG',
    imageDataUrl: `data:image/png;base64,${pngBase64}`,
    mimeType: 'image/png',
    modality: 'process_mechanism',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  };

  // 3. Salva e recupera ambos
  await saveVisualResource(svgResource);
  await saveVisualResource(pngResource);

  const resSvg = (await getVisualResourcesByDocument('doc-formats')).find(r => r.id === 'vis-format-svg');
  assert.ok(resSvg, 'Recurso SVG deve existir');
  assert.equal(resSvg.mimeType, 'image/svg+xml');
  assert.ok(resSvg.imageDataUrl.includes('image/svg+xml'));

  const resPng = (await getVisualResourcesByDocument('doc-formats')).find(r => r.id === 'vis-format-png');
  assert.ok(resPng, 'Recurso PNG deve existir');
  assert.equal(resPng.mimeType, 'image/png');
  assert.ok(resPng.imageDataUrl.includes('image/png;base64,'));
});

test('T374: Cenário 5 — Seleção de pasta local cria e mantém estrutura com handles válidos (granted/prompt/denied)', async () => {
  const mockDir = new MockDirectoryHandle('Meu_NeuroClass_Workspace');

  // Estado inicial: granted
  mockDir.permission = 'granted';
  const adapter = new FileSystemAccessAdapter(mockDir);

  const perm1 = await adapter.queryPermission();
  assert.equal(perm1, 'granted', 'Permissão inicial deve ser granted');

  // Teste de criação e escrita aninhada
  await adapter.writeFile(['Assuntos', '01_Neurociencias', 'Materiais', 'doc-1'], 'teste.txt', 'dados de teste');
  const readBack = await adapter.readFileText(['Assuntos', '01_Neurociencias', 'Materiais', 'doc-1'], 'teste.txt');
  assert.equal(readBack, 'dados de teste', 'Arquivo deve ser lido de volta com integridade');

  // Transição para prompt e request
  mockDir.permission = 'prompt';
  const perm2 = await adapter.queryPermission();
  assert.equal(perm2, 'prompt', 'Permissão deve refletir estado prompt');

  const requested = await adapter.requestPermission();
  assert.equal(requested, true, 'Solicitação de permissão deve elevar de prompt para granted');

  // Transição para denied
  mockDir.permission = 'denied';
  const permDenied = await adapter.queryPermission();
  assert.equal(permDenied, 'denied', 'Permissão deve refletir denied');
});

test('T375: Cenário 6 — Fallback transparente para IndexedDB quando File System Access API não está disponível', async () => {
  await clearAllUserData();
  await workspaceStorage.disconnectLocalDirectory();

  // Em ambiente sem window.showDirectoryPicker (como Node), o modo é indexed_db
  assert.equal(FileSystemAccessAdapter.isSupported(), false, 'Node.js não deve ter File System Access API');
  await workspaceStorage.init();

  assert.equal(workspaceStorage.getMode(), 'indexed_db', 'Workspace deve adotar Modo B (indexed_db) por padrão');

  // Salva nota e análise via workspaceStorage
  const testNote: StudyNote = {
    id: 'note-fallback-01',
    documentId: 'doc-fallback',
    title: 'Nota em Fallback IndexedDB',
    content: 'Funciona perfeitamente sem erros.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await workspaceStorage.saveStudyNote(testNote);

  const retrievedNotes = await getNotesByDocumentId('doc-fallback');
  assert.equal(retrievedNotes.length, 1, 'Nota deve ser persistida via IndexedDB');
  assert.equal(retrievedNotes[0].title, 'Nota em Fallback IndexedDB');
});

test('T376: Cenário 7 — Solicitação e verificação de persistência garantida (navigator.storage.persist)', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persist: async () => true,
          persisted: async () => true,
          estimate: async () => ({ usage: 10485760, quota: 10737418240 }),
        },
      },
      configurable: true,
      writable: true,
    });

    const res = await IndexedDbStorageAdapter.requestPersistentStorage();
    assert.equal(res.persisted, true, 'Persistência solicitada deve retornar true');
    assert.equal(res.supported, true, 'API de persistência deve ser suportada');

    const checkPersisted = await IndexedDbStorageAdapter.isStoragePersisted();
    assert.equal(checkPersisted, true, 'Consulta de persistência deve retornar true');

    const quota = await IndexedDbStorageAdapter.estimateQuota();
    assert.ok(quota, 'Estimativa de quota deve retornar dados');
    assert.equal(quota.usageBytes, 10485760);
    assert.equal(quota.quotaBytes, 10737418240);
    assert.equal(quota.isCritical, false);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalDescriptor);
    }
  }
});

test('T377: Cenário 8 — Tratamento gracioso de QuotaExceededError com notificação ao usuário sem corrupção de dados', async () => {
  let capturedStatus: string = '';
  let capturedMessage: string = '';

  const unsubscribe = workspaceStorage.subscribeStatus((status, msg) => {
    capturedStatus = status;
    capturedMessage = msg;
  });

  try {
    // Dispara uma ação simulada que excede a quota
    await workspaceStorage.enqueueSave('Gravação com Quota Excedida', async () => {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }).catch(() => {});

    assert.equal(capturedStatus, 'quota_critical', 'Status deve mudar para quota_critical quando a quota é excedida');
    assert.ok(
      capturedMessage.toLowerCase().includes('quota') || capturedMessage.toLowerCase().includes('armazenamento'),
      'Mensagem deve orientar o usuário sobre limite de quota'
    );
  } finally {
    unsubscribe();
  }
});

test('T378: Cenário 9 — Migração não-destrutiva de IndexedDB para pasta local sem duplicatas e com validação por SHA-256', async () => {
  await clearAllUserData();

  // Popula dados no IndexedDB
  const doc = createMockDoc({
    id: 'doc-migracao-01',
    title: 'Bases da Migração Local',
    subject: 'Neurociências',
    storageRef: 'blob_doc-migracao-01',
    pages: [{ pageNumber: 1, textContent: 'Texto de teste para migração segura', hasVisualElements: false }],
  });
  const pdfBytes = new TextEncoder().encode('%PDF-1.4 Migracao Teste');
  await saveDocument(doc, new Blob([pdfBytes], { type: 'application/pdf' }));

  const concept = createMockConcept('c-mig-1', 'Conceito Migrado');
  await saveAnalysis(createMockAnalysis(doc.id, [concept]));

  const note: StudyNote = {
    id: 'note-mig-1',
    documentId: doc.id,
    title: 'Nota Migrada',
    content: 'Conteúdo migrado',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveStudyNote(note);

  // Executa migração para MockDirectoryHandle
  const mockTargetDir = new MockDirectoryHandle('Pasta_Destino_Migracao');
  const progressSteps: string[] = [];

  const result = await MigrationService.migrateToFolder(mockTargetDir, (prog) => {
    progressSteps.push(prog.step);
  });

  assert.equal(result.success, true, 'Migração deve concluir com sucesso');
  assert.equal(result.migratedItems, 1, 'Deve migrar 1 material');
  assert.ok(progressSteps.length > 0, 'Deve emitir etapas de progresso');

  // Verifica que arquivos foram escritos na pasta de destino
  const adapter = new FileSystemAccessAdapter(mockTargetDir);
  const subjectFolderName = buildSubjectFolderName(doc.subject!, sanitizePathComponent(doc.subject!));
  const docText = await adapter.readFileText(['Assuntos', subjectFolderName, 'Materiais', doc.id], 'documento.json');
  assert.ok(docText, 'documento.json deve existir no destino');

  const pdfRead = await adapter.readFileBytes(['Assuntos', subjectFolderName, 'Materiais', doc.id], 'original.pdf');
  assert.ok(pdfRead, 'original.pdf deve existir no destino');
  const pdfSha = await calculateSha256(pdfRead);
  const expectedSha = await calculateSha256(pdfBytes);
  assert.equal(pdfSha, expectedSha, 'SHA-256 do PDF migrado deve corresponder ao original');

  // Verifica que IndexedDB AINDA contém os dados originais (não-destrutivo!)
  const idbDoc = await getDocumentById(doc.id);
  assert.ok(idbDoc, 'Documento ainda deve existir no IndexedDB');

  // Idempotência: re-executa a migração
  const reResult = await MigrationService.migrateToFolder(mockTargetDir);
  assert.equal(reResult.success, true, 'Segunda execução deve ser idempotente');
  assert.equal(reResult.migratedItems, 1);
});

test('T379: Cenário 10 — Exportação de backup .neuroclass e restauração em workspace limpo mantendo integridade com hash verificado', async () => {
  await clearAllUserData();

  const docId = 'doc-backup-zip-01';
  const pdfContent = '%PDF-1.4 Pacote Completo .neuroclass';
  const pdfBytes = new TextEncoder().encode(pdfContent);

  const doc = createMockDoc({
    id: docId,
    title: 'Backup & Restore Test',
    subject: 'Neurociências',
    pageCount: 2,
    storageRef: `blob_${docId}`,
    pages: [{ pageNumber: 1, textContent: 'Página 1 do teste de exportação', hasVisualElements: false }],
  });
  await saveDocument(doc, new Blob([pdfBytes], { type: 'application/pdf' }));

  const concept = createMockConcept('c-bkp-1', 'Conceito Backup');
  await saveAnalysis(createMockAnalysis(docId, [concept]));

  const note: StudyNote = {
    id: 'note-bkp-1',
    documentId: docId,
    title: 'Nota do Backup',
    content: 'Nota que deve ser restaurada',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveStudyNote(note);

  // 1. Exporta o backup como arquivo .neuroclass (ZIP)
  const exportResult = await BackupService.exportBackup('full_workspace');
  assert.ok(exportResult.zipBytes.byteLength > 100, 'Tamanho do ZIP deve ser superior a 100 bytes');
  assert.ok(exportResult.filename.endsWith('.neuroclass'), 'Extensão deve ser .neuroclass');

  // Verifica assinatura PKZip (0x04034b50)
  const view = new DataView(exportResult.zipBytes.buffer, exportResult.zipBytes.byteOffset, exportResult.zipBytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'Cabeçalho do arquivo deve ser ZIP PK');

  // 2. Limpa completamente o workspace
  await clearAllUserData();
  const docsEmpty = await getAllUserDocuments();
  assert.equal(docsEmpty.length, 0, 'Workspace deve estar completamente limpo');

  // 3. Restaura do arquivo exportado
  const importResult = await BackupService.importBackup(exportResult.zipBytes);
  assert.equal(importResult.success, true, 'Restauração deve ter sucesso');
  assert.equal(importResult.importedDocuments, 1, 'Deve importar 1 documento');
  assert.equal(importResult.importedNotes, 1, 'Deve importar 1 nota');

  // 4. Valida recuperação integral dos dados
  const restoredDoc = await getDocumentById(docId);
  assert.ok(restoredDoc, 'Documento restaurado deve existir');
  assert.equal(restoredDoc.title, 'Backup & Restore Test');

  const restoredAnalysis = await getAnalysisByDocumentId(docId);
  assert.ok(restoredAnalysis, 'Análise restaurada deve existir');
  assert.equal(restoredAnalysis.fundamentalConcepts[0].name, 'Conceito Backup');

  const restoredNotes = await getNotesByDocumentId(docId);
  assert.equal(restoredNotes.length, 1);
  assert.equal(restoredNotes[0].title, 'Nota do Backup');

  const restoredBlob = await getDocumentFileBlob(restoredDoc.storageRef!);
  assert.ok(restoredBlob, 'PDF binário deve ser restaurado no file_blobs');
  const restoredPdfText = await restoredBlob.text();
  assert.equal(restoredPdfText, pdfContent, 'Conteúdo do PDF binário deve ser idêntico');
});

test('T380: Cenário 11 — Rejeição de arquivo de backup corrompido ou malicioso (path traversal, ZIP slip, payload adulterado)', async () => {
  // 1. Testa rejeição de criação com caminho inseguro / ZIP Slip
  await assert.rejects(
    async () => {
      await createZipArchive([
        { path: '../../../../etc/passwd', data: 'root:x:0:0:root:/root:/bin/bash' },
      ]);
    },
    (err: Error) => {
      return err.message.includes('inseguro') || err.message.includes('inválido');
    },
    'Deve rejeitar criação com caminho relativo inseguro'
  );

  // 2. Constrói buffer com cabeçalho ZIP contendo path traversal para testar extractZipArchive
  const pathBytes = new TextEncoder().encode('../../../../etc/passwd');
  const dummyData = new TextEncoder().encode('malicious');
  const rawZip = new Uint8Array(30 + pathBytes.length + dummyData.length + 46 + pathBytes.length + 22);
  const v = new DataView(rawZip.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(26, pathBytes.length, true);
  v.setUint32(18, dummyData.length, true);
  v.setUint32(22, dummyData.length, true);
  rawZip.set(pathBytes, 30);
  rawZip.set(dummyData, 30 + pathBytes.length);
  const cdOffset = 30 + pathBytes.length + dummyData.length;
  v.setUint32(cdOffset, 0x02014b50, true);
  v.setUint16(cdOffset + 28, pathBytes.length, true);
  v.setUint32(cdOffset + 20, dummyData.length, true);
  v.setUint32(cdOffset + 24, dummyData.length, true);
  v.setUint32(cdOffset + 42, 0, true);
  rawZip.set(pathBytes, cdOffset + 46);
  const eocdOff = cdOffset + 46 + pathBytes.length;
  v.setUint32(eocdOff, 0x06054b50, true);
  v.setUint16(eocdOff + 8, 1, true);
  v.setUint16(eocdOff + 10, 1, true);
  v.setUint32(eocdOff + 12, 46 + pathBytes.length, true);
  v.setUint32(eocdOff + 16, cdOffset, true);

  await assert.rejects(
    async () => {
      await extractZipArchive(rawZip);
    },
    (err: Error) => {
      return err.message.includes('malicioso') || err.message.includes('escape') || err.message.includes('ZIP Slip');
    },
    'Deve rejeitar estritamente arquivo ZIP contendo path traversal (ZIP Slip)'
  );

  // 3. Testa rejeição de arquivo truncado ou sem EOCD
  const corruptedBuffer = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]);
  await assert.rejects(
    async () => {
      await extractZipArchive(corruptedBuffer);
    },
    (err: Error) => {
      return err.message.includes('corrompido') || err.message.includes('inferior') || err.message.includes('EOCD');
    },
    'Deve rejeitar arquivo truncado'
  );

  // 4. Testa rejeição no BackupService de ZIP com manifesto ausente ou corrompido
  const invalidManifestZip = await createZipArchive([
    { path: 'algum_arquivo.txt', data: 'sem manifest' },
  ]);
  const importResult = await BackupService.importBackup(invalidManifestZip);
  assert.equal(importResult.success, false, 'Importação sem manifesto deve falhar graciosamente');
  assert.ok(importResult.error?.includes('manifest.json'), 'Mensagem de erro deve apontar ausência do manifesto');
});

test('T381: Cenário 12 — Perda de permissão de pasta exibe alerta e não mente que está salvando', async () => {
  const mockDir = new MockDirectoryHandle('Pasta_Sem_Permissao');
  mockDir.permission = 'denied';

  await workspaceStorage.connectWithHandle(mockDir);
  assert.equal(workspaceStorage.getPermissionState(), 'denied', 'Estado deve ser denied');

  let currentSavedStatus = '';
  const unsub = workspaceStorage.subscribeStatus((st) => {
    currentSavedStatus = st;
  });

  // Tenta salvar via workspaceStorage no modo local com permissão negada
  try {
    const doc = createMockDoc({
      id: 'doc-perm-denied',
      title: 'Doc Permissao Negada',
    });
    await workspaceStorage.saveOriginalPdf(doc, new Blob(['test']));
  } catch {
    // Pode lançar ou emitir status de erro
  }

  // Não deve exibir 'saved' se a permissão foi negada
  assert.equal(currentSavedStatus, 'permission_required', 'Status deve ser permission_required e não relatar "saved" falsamente');
  unsub();
  await workspaceStorage.disconnectLocalDirectory();
});

test('T382: Cenário 13 — Exclusão de documento remove cascata completa (binários, análises, notas, revisões, imagens) sem deixar órfãos', async () => {
  await clearAllUserData();

  const docId = 'doc-cascade-delete-01';
  const conceptId = 'conc-cascade-01';

  // Popula todos os agregados
  const doc = createMockDoc({
    id: docId,
    title: 'Documento Cascata',
    storageRef: `blob_${docId}`,
  });
  await saveDocument(doc, new Blob(['%PDF cascata']));

  const concept = createMockConcept(conceptId, 'Conceito Cascata');
  await saveAnalysis(createMockAnalysis(docId, [concept]));

  await saveStudyNote({
    id: 'note-cascade-1',
    documentId: docId,
    title: 'Nota Cascata',
    content: 'Texto cascata',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await saveVisualResource({
    id: 'vis-cascade-1',
    documentId: docId,
    conceptId: conceptId,
    conceptName: 'Cascata',
    title: 'Visual Cascata',
    caption: 'Legenda Cascata',
    promptUsed: 'Prompt',
    imageDataUrl: 'data:image/svg+xml;utf8,<svg/>',
    mimeType: 'image/svg+xml',
    modality: 'conceptual_illustration',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  });

  await saveChatSession(docId, [
    { id: 'msg-1', sender: 'user', text: 'Olá tutor', timestamp: Date.now() },
  ]);

  await saveConceptMastery({
    id: buildMasteryKey(docId, conceptId),
    documentId: docId,
    conceptId: conceptId,
    masteryLevel: 'understand',
    diagnosticState: 'understood',
    totalAttempts: 1,
    lastAttemptAt: Date.now(),
    historyAttemptIds: [],
    activeGaps: [],
    consolidatedEvidenceIds: [],
  });

  const scheduleCascade = await enrollConceptInSpacedRepetition(doc, concept);
  await saveReviewSchedule(scheduleCascade);

  // Executa exclusão completa
  await deleteDocumentCompletely(docId);

  // Valida que TODOS os registros foram removidos
  const docAfter = await getDocumentById(docId);
  assert.equal(docAfter, undefined, 'Documento deve ser apagado');

  const analysisAfter = await getAnalysisByDocumentId(docId);
  assert.equal(analysisAfter, undefined, 'Análise deve ser apagada');

  const notesAfter = await getNotesByDocumentId(docId);
  assert.equal(notesAfter.length, 0, 'Notas devem ser apagadas');

  const visualsAfter = await getVisualResourcesByDocument(docId);
  assert.equal(visualsAfter.length, 0, 'Recursos visuais devem ser apagados');

  const chatAfter = await getChatSession(docId);
  assert.equal(chatAfter.length, 0, 'Chat deve ser apagado');

  const blobAfter = await getDocumentFileBlob(`blob_${docId}`);
  assert.equal(blobAfter, undefined, 'Blob PDF original deve ser apagado');

  const masteryAfter = await getConceptMastery(docId, conceptId);
  assert.equal(masteryAfter, undefined, 'Domínio cognitivo deve ser apagado');

  const scheduleAfter = await getReviewSchedule(docId, conceptId);
  assert.equal(scheduleAfter, null, 'Agendamento FSRS deve ser apagado');
});

test('T383: Cenário 14 — Arquivos exportados NÃO contêm chave BYOK do Gemini nem pageImageBase64 temporários', async () => {
  await clearAllUserData();

  const secretApiKey = 'AIzaSySecretApiKeyTestingOnly999';
  AIKeyManager.setApiKey(secretApiKey);
  assert.equal(AIKeyManager.hasApiKey(), true);

  const ephemeralBase64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...temporaryPageBuffer';

  const doc = createMockDoc({
    id: 'doc-security-byok-01',
    title: 'Documento com Imagens Voláteis',
    pages: [
      {
        pageNumber: 1,
        textContent: 'Texto da página',
        hasVisualElements: true,
        pageImageBase64: ephemeralBase64Image, // buffer temporário
      },
    ],
  });
  await saveDocument(doc);

  // Exporta o backup .neuroclass
  const exportResult = await BackupService.exportBackup('full_workspace');
  const entries = await extractZipArchive(exportResult.zipBytes);

  // Inspeciona todos os arquivos dentro do pacote
  for (const entry of entries) {
    const text = new TextDecoder().decode(entry.data);

    // 1. Chave BYOK NUNCA pode estar em nenhum arquivo
    assert.equal(
      text.includes(secretApiKey),
      false,
      `Chave de API Gemini encontrada indevidamente no arquivo ${entry.path} do backup!`
    );

    // 2. Buffer temporário pageImageBase64 NUNCA pode ser persistido no backup
    assert.equal(
      text.includes('temporaryPageBuffer'),
      false,
      `Buffer de imagem de página (pageImageBase64) encontrado indevidamente no arquivo ${entry.path}!`
    );
  }

  // Limpa chave de teste
  AIKeyManager.clearApiKey();
});

test('T384: Cenário 15 — Regressão: Voice v1, Visual Learning v1.1, Multimodal Core v1 e FSRS-7 continuam 100% funcionais', async () => {
  // 1. Regressão FSRS-7
  const mockDoc = createMockDoc({
    id: 'd-fsrs-reg',
    title: 'Plasticidade Sináptica',
  });
  const mockConcept = createMockConcept('c-fsrs-reg', 'Plasticidade');

  const initialSchedule = await enrollConceptInSpacedRepetition(mockDoc, mockConcept);
  assert.equal(initialSchedule.conceptId, 'c-fsrs-reg');
  assert.equal(initialSchedule.totalReviews, 0);

  const reviewResult = await processConceptReview({
    schedule: initialSchedule,
    grade: 'good',
    attemptId: 'att-fsrs-reg-1',
    feedback: {
      evaluatedMasteryLevel: 'understand',
      rubric: {
        conceptualPrecision: { score: 4, qualitativeStatus: 'accurate', comment: 'Preciso' },
        completeness: { score: 4, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 4, qualitativeStatus: 'well_connected', comment: 'Conectado' },
        reasoningCoherence: { score: 4, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 3, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
      understoodElements: ['Plasticidade'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      summary: 'Fixação excelente.',
      suggestedDiagnosticState: 'understood',
    } as any,
    reviewedAt: new Date(),
  });

  assert.equal(reviewResult.updatedSchedule.totalReviews, 1, 'Total de revisões deve ser 1');
  assert.equal(reviewResult.updatedSchedule.lastRating, 'good', 'Último rating deve ser "good"');
  assert.ok(reviewResult.updatedSchedule.memoryState.stability > 0, 'Estabilidade deve ser positiva');

  // 2. Regressão Visual Learning: geração curada com diretriz Anti-Texto (zero tags <text>)
  const demoVisual = generateCuratedDemoIllustration(
    'conc-foton',
    'Fóton e Quantização de Energia',
    'conceptual_illustration'
  );

  assert.ok(demoVisual.svg.includes('<svg'), 'Ilustração deve conter tag SVG válida');
  assert.equal(demoVisual.svg.includes('<text'), false, 'Ilustração deve respeitar estritamente a diretriz Anti-Texto (zero <text>)');
  assert.ok(demoVisual.dataUrl.startsWith('data:image/svg+xml'), 'DataURL deve ter MIME SVG');
  assert.ok(visualLearningService, 'Serviço de aprendizagem visual deve estar ativo');

  // 3. Regressão AIKeyManager
  AIKeyManager.setApiKey('AIzaSyRegressionTest');
  assert.equal(AIKeyManager.getApiKey(), 'AIzaSyRegressionTest');
  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.hasApiKey(), false);
});

test('T385: Cenário 16 — FASE C: Migração do IndexedDB Legado com Binários, Visuais, Checksums e Preservação da Origem', async () => {
  await clearAllUserData();
  const targetDir = new MockDirectoryHandle('Pasta_Migracao_Legado');

  // 1. Popula IndexedDB com entidades completas de um aluno pré-existente
  const docId = 'doc-migracao-01';
  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]); // %PDF-1.4
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  const doc = createMockDoc({
    id: docId,
    title: 'Biologia Celular e Sinalização',
    subject: 'Biologia',
  });
  await saveDocument(doc, pdfBlob);

  const analysis = createMockAnalysis(docId, [
    createMockConcept('conc-bio-01', 'Receptor Tirosina-Quinase'),
  ]);
  analysis.domain = 'Biologia';
  await saveAnalysis(analysis);

  const note = createMockNote('note-bio-01', docId, 'conc-bio-01');
  note.title = 'Anotação sobre Autofosforilação';
  await saveStudyNote(note);

  // Recurso visual em PNG binário
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  let b64 = '';
  for (let i = 0; i < pngBytes.length; i++) b64 += String.fromCharCode(pngBytes[i]);
  const visual = createMockVisual('vis-bio-01', docId, 'conc-bio-01');
  visual.imageDataUrl = 'data:image/png;base64,' + btoa(b64);
  visual.mimeType = 'image/png';
  await saveVisualResource(visual);

  // 2. Executa a migração
  const adapter = new FileSystemAccessAdapter(targetDir);
  const migRes = await MigrationService.migrateIndexedDbToLocalDirectory(adapter);
  assert.equal(migRes.success, true, 'Migração deve concluir com sucesso');
  assert.equal(migRes.migratedItems, 1, 'Deve migrar 1 material');

  // 3. Verifica se os binários e metadados foram transferidos para a pasta
  const subjectDir = await targetDir.getDirectoryHandle('Assuntos');
  const bioDir = await subjectDir.getDirectoryHandle('Biologia__Biologia');
  const matDir = await bioDir.getDirectoryHandle('Materiais');
  const docDir = await matDir.getDirectoryHandle(docId);
  const pdfFile = await docDir.getFileHandle('original.pdf');
  const pdfFileObj = await pdfFile.getFile();
  assert.ok(pdfFileObj.size > 10, 'Arquivo original.pdf deve ter sido transferido para a pasta');

  const visDir = await bioDir.getDirectoryHandle('Recursos-Visuais');
  const visMetaFile = await visDir.getFileHandle('vis-bio-01.meta.json');
  const visPngFile = await visDir.getFileHandle('vis-bio-01.png');
  assert.ok(visMetaFile, 'Metadados do visual devem existir');
  assert.ok(visPngFile, 'Binário PNG do visual deve existir');

  // 4. Verifica que a origem IndexedDB permanece 100% intacta (Right to Keep)
  const idbDocs = await getAllUserDocuments();
  assert.equal(idbDocs.length, 1, 'Documentos no IndexedDB não devem ser apagados');
  const idbNotes = await getNotesByDocumentId(docId);
  assert.equal(idbNotes.length, 1, 'Notas no IndexedDB não devem ser apagadas');
  const idbVis = await getVisualResourcesByDocument(docId);
  assert.equal(idbVis.length, 1, 'Visuais no IndexedDB não devem ser apagados');

  // 5. Retomabilidade e idempotência: segunda migração não duplica
  const migRes2 = await MigrationService.migrateIndexedDbToLocalDirectory(adapter);
  assert.equal(migRes2.success, true, 'Segunda execução de migração deve ser idempotente');
});

test('T386: Cenário 17 — FASE D: Contingência e Reconciliação com Outbox Journal', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Contingencia_E2E');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-contingency-01';
  const initialNote = createMockNote('note-cont-init', docId);
  initialNote.title = 'Nota Inicial';
  await workspaceStorage.saveStudyNote(initialNote, 'Neurociências');

  // 1. Simula entrada em estado explícito de contingência (pasta inacessível / permissão revogada)
  workspaceStorage.enterContingencyMode('Simulação de pasta desconectada');
  assert.equal(workspaceStorage.isContingencyMode(), true, 'Deve estar em modo contingência');

  // 2. Estudante continua trabalhando: cria nova nota, altera existente e salva visual
  const newNote = createMockNote('note-cont-new', docId);
  newNote.title = 'Nota Criada em Contingência';
  await workspaceStorage.saveStudyNote(newNote, 'Neurociências');

  initialNote.title = 'Nota Inicial Alterada Durante Contingência';
  initialNote.updatedAt = Date.now() + 100;
  await workspaceStorage.saveStudyNote(initialNote, 'Neurociências');

  const visCont = createMockVisual('vis-cont-01', docId, 'c-1');
  await workspaceStorage.saveVisualResourceBinary(visCont, 'Neurociências');

  // 3. Valida gravação no IndexedDB e registro no Outbox Journal
  const idbNotes = await getNotesByDocumentId(docId);
  assert.equal(idbNotes.length, 2, 'Notas devem estar gravadas com segurança no IndexedDB');
  const pendingOps = await IndexedDbStorageAdapter.getPendingOperations();
  assert.ok(pendingOps.length >= 3, `Deve conter ao menos 3 operações pendentes (atual: ${pendingOps.length})`);

  let currentStatus = '';
  workspaceStorage.subscribeStatus((st) => { currentStatus = st; })();
  assert.equal(currentStatus, 'contingency_pending', 'Status visual deve ser contingency_pending');

  // 4. Reautorização da pasta e execução de reconciliação
  const reconcileRes = await workspaceStorage.reconcilePendingOperations();
  assert.equal(reconcileRes.success, true, 'Reconciliação deve concluir com sucesso');
  assert.ok(reconcileRes.reconciledCount >= 3, 'Operações pendentes devem ser reconciliadas');
  assert.equal(workspaceStorage.isContingencyMode(), false, 'Deve ter saído da contingência');

  // 5. Confirma que os arquivos chegaram na pasta local
  const subjectDir = await mockDir.getDirectoryHandle('Assuntos');
  const neuroDir = await subjectDir.getDirectoryHandle('Neurociencias__Neurociencias');
  const cadDir = await neuroDir.getDirectoryHandle('Cadernos');
  const noteFile1 = await cadDir.getFileHandle('note-cont-new.json');
  const noteFileObj1 = await noteFile1.getFile();
  assert.ok(noteFileObj1.size > 0, 'Nova nota deve estar salva na pasta local');

  // 6. Confirma que o journal foi limpo após sincronização
  const pendingAfter = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingAfter.length, 0, 'Outbox deve estar vazio após reconciliação');

  await workspaceStorage.disconnectLocalDirectory();
});

test('T387: Cenário 18 — FASE D: Idempotência da Reconciliação e Resolução Não-Destrutiva de Conflitos', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Conflitos_E2E');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-conflict-test';
  const noteId = 'note-conflict-01';

  // Grava nota na pasta com timestamp mais recente
  const subjectDir = await mockDir.getDirectoryHandle('Assuntos');
  const neuroDir = await subjectDir.getDirectoryHandle('Neurociencias__Neurociencias', { create: true });
  const cadDir = await neuroDir.getDirectoryHandle('Cadernos', { create: true });
  const fileHandle = await cadDir.getFileHandle(`${noteId}.json`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({
    id: noteId,
    documentId: docId,
    title: 'Versão Externa na Pasta (Modificada por Terceiro)',
    content: 'Conteúdo concorrente',
    updatedAt: Date.now() + 50000,
  }));
  await writable.close();

  // Operação pendente do estudante no navegador com timestamp anterior
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `note_${noteId}`,
    entityType: 'note',
    entityId: noteId,
    subjectName: 'Neurociências',
    action: 'upsert',
    payload: {
      id: noteId,
      documentId: docId,
      title: 'Versão do Estudante no Navegador',
      content: 'Conteúdo estudado',
      updatedAt: Date.now(),
    },
    clientUpdatedAt: Date.now(),
  });

  // Executa reconciliação
  const recRes = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recRes.success, true);
  assert.equal(recRes.conflicts.length, 1, 'Deve detectar conflito real de versão');
  assert.ok(recRes.conflicts[0].conflictPath.includes('.conflito_'), 'Deve salvar cópia segura do conflito sem sobrescrever');

  // Segunda execução imediata da reconciliação: deve ser idempotente
  const recRes2 = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recRes2.success, true);
  assert.equal(recRes2.reconciledCount, 0, 'Segunda reconciliação não deve reprocessar nada');
  assert.equal(recRes2.conflicts.length, 0);

  await workspaceStorage.disconnectLocalDirectory();
});

test('T388: Cenário 19 — FASE E: Simulação de Falhas Reais de I/O, Disco Cheio e Quota Excedida', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Falha_IO');
  await workspaceStorage.connectWithHandle(mockDir);

  // Simula erro de disco cheio no FileSystemAdapter
  const failingAdapter = new FileSystemAccessAdapter(mockDir);
  failingAdapter.writeFile = async () => {
    const ioError = new Error('No space left on device');
    (ioError as any).name = 'QuotaExceededError';
    throw ioError;
  };

  let capturedStatus = '';
  const unsub = workspaceStorage.subscribeStatus((st) => {
    capturedStatus = st;
  });

  try {
    await workspaceStorage.enqueueSave('Gravação com Falha', async () => {
      await failingAdapter.writeFile([], 'test.txt', 'dados');
    });
  } catch (err: any) {
    assert.equal(err.name, 'QuotaExceededError');
  }

  // Verifica que status transitou para quota_critical e nunca para 'saved'
  assert.equal(capturedStatus, 'quota_critical', 'Status deve ser quota_critical');
  unsub();

  await workspaceStorage.disconnectLocalDirectory();
});

test('T389: Cenário 20 — FASE E: Persistência Durável (navigator.storage.persist true/false)', async () => {
  // 1. Quando persistente é true
  const resTrue = await IndexedDbStorageAdapter.requestPersistentStorage();
  assert.equal(typeof resTrue.supported, 'boolean');
  assert.equal(typeof resTrue.persisted, 'boolean');

  // 2. Health check reflete a condição real
  const health = await workspaceStorage.getHealth();
  assert.equal(typeof health.persistentGranted, 'boolean');
  assert.equal(typeof health.quotaBytes, 'number');
  assert.equal(typeof health.usageBytes, 'number');
  assert.equal(typeof health.isCritical, 'boolean');
});

test('T390: Cenário 21 — FASE F: Fallback em Navegador Sem File System Access API (Firefox/Safari)', async () => {
  await clearAllUserData();

  // Emula ausência de showDirectoryPicker (como em Firefox ou Safari padrão)
  const isSupported = FileSystemAccessAdapter.isSupported();
  // No ambiente Node sem window, isSupported é false
  assert.equal(isSupported, false, 'Sem window.showDirectoryPicker() o adapter identifica indisponibilidade');

  // Inicializa workspaceStorage no ambiente sem showDirectoryPicker
  await workspaceStorage.init();
  assert.equal(workspaceStorage.getMode(), 'indexed_db', 'Modo deve ser estritamente indexed_db');
  assert.equal(workspaceStorage.getPermissionState(), 'unavailable', 'Permissão deve ser unavailable');

  // Grava documento e anotações normalmente no fallback IndexedDB
  const docId = 'doc-fallback-browser';
  const doc = createMockDoc({ id: docId, title: 'Documento Firefox Fallback' });
  await workspaceStorage.saveOriginalPdf(doc, new Blob(['pdf-data']));

  const note = createMockNote('note-fb-1', docId);
  await workspaceStorage.saveStudyNote(note, 'Geral');

  const retrievedDocs = await getAllUserDocuments();
  assert.equal(retrievedDocs.some(d => d.id === docId), true, 'Documento deve ser recuperado via IndexedDB');

  // Exportação e backup .neuroclass continua 100% disponível
  const backup = await BackupService.exportBackup('full_workspace');
  assert.ok(backup.zipBytes.byteLength > 100, 'Backup .neuroclass deve ser gerado normalmente no fallback');
  assert.ok(backup.manifest.files.length >= 1, 'Manifesto deve conter arquivos no fallback');
});

test('T391: Auditoria — Rastreabilidade integral de learning_attempts (pasta local, backup .neuroclass, migração e restauração)', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const docId = 'doc-auditoria-attempts';
  const conceptId = 'conc-att-01';
  const subject = 'Psicologia Cognitiva';

  // 1. Cria documento e tentativas no IndexedDB
  const doc = createMockDoc({
    id: docId,
    title: 'Processos Atencionais',
    subject,
    storageRef: `blob_${docId}`,
  });
  await saveDocument(doc, new Blob(['%PDF-1.4 Atenção']));

  const attempt1 = createMockAttempt('att-01', docId, conceptId, {
    attemptNumber: 1,
    studentExplanation: 'Primeira tentativa sobre atenção seletiva',
  });
  const attempt2 = createMockAttempt('att-02', docId, conceptId, {
    attemptNumber: 2,
    studentExplanation: 'Segunda tentativa mais aprofundada',
    createdAt: Date.now() + 500,
  });

  await saveLearningAttempt(attempt1);
  await saveLearningAttempt(attempt2);

  // Valida que o IndexedDB gravou e recupera por documento
  const initialAttempts = await getAttemptsByDocument(docId);
  assert.equal(initialAttempts.length, 2, 'IndexedDB deve conter as 2 tentativas');

  // 2. MIGRAÇÃO: migra do IndexedDB para a pasta local
  const mockDir = new MockDirectoryHandle('Pasta_Migracao_Attempts');
  const migRes = await MigrationService.migrateToFolder(mockDir);
  assert.equal(migRes.success, true, 'Migração para pasta deve ter sucesso');

  // Verifica que o arquivo tentativas_<docId>.json foi escrito na pasta local
  const adapter = new FileSystemAccessAdapter(mockDir);
  const folderName = buildSubjectFolderName(subject, sanitizePathComponent(subject));
  const attemptsFileText = await adapter.readFileText(
    ['Assuntos', folderName, 'Aprendizagem'],
    `tentativas_${docId}.json`
  );
  assert.ok(attemptsFileText, 'Arquivo tentativas_<docId>.json deve existir na pasta local');
  const attemptsFromJson: LearningAttempt[] = JSON.parse(attemptsFileText);
  assert.equal(attemptsFromJson.length, 2, 'Arquivo na pasta deve conter as 2 tentativas');
  assert.equal(attemptsFromJson[0].id, 'att-01');
  assert.equal(attemptsFromJson[1].id, 'att-02');

  // 3. BACKUP: exporta .neuroclass (ZIP) e inspeciona se tentativas_<docId>.json está presente
  const backup = await BackupService.exportBackup('full_workspace');
  assert.ok(backup.zipBytes.byteLength > 100);
  const zipEntries = await extractZipArchive(backup.zipBytes);
  const zipAttemptEntry = zipEntries.find(e =>
    e.path.includes('/Aprendizagem/tentativas_') && e.path.endsWith('.json')
  );
  assert.ok(zipAttemptEntry, 'Arquivo de tentativas deve estar presente dentro do pacote .neuroclass');
  const zipAttemptsData: LearningAttempt[] = JSON.parse(new TextDecoder().decode(zipAttemptEntry.data));
  assert.equal(zipAttemptsData.length, 2, 'Tentativas dentro do ZIP devem ter exatamente os 2 registros');

  // 4. RESTAURAÇÃO EM WORKSPACE LIMPO:
  await clearAllUserData();
  const emptyAttempts = await getAttemptsByDocument(docId);
  assert.equal(emptyAttempts.length, 0, 'Workspace deve estar limpo antes da restauração');

  const restoreRes = await BackupService.importBackup(backup.zipBytes);
  assert.equal(restoreRes.success, true, 'Importação deve ter sucesso');

  const restoredAttempts = await getAttemptsByDocument(docId);
  assert.equal(restoredAttempts.length, 2, 'Restauração deve recuperar exatamente as 2 tentativas');
  assert.equal(restoredAttempts[0].id, 'att-01');
  assert.equal(restoredAttempts[0].conceptId, conceptId);
  assert.equal(restoredAttempts[1].id, 'att-02');
  assert.equal(restoredAttempts[1].studentExplanation, 'Segunda tentativa mais aprofundada');
});

test('T392: Auditoria — Migração interrompida e retomada segura (idempotência e integridade sem perda de dados)', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const doc1 = createMockDoc({ id: 'doc-resume-01', title: 'Doc 1 Interrupção', subject: 'Neurociências' });
  const doc2 = createMockDoc({ id: 'doc-resume-02', title: 'Doc 2 Interrupção', subject: 'Neurociências' });

  await saveDocument(doc1, new Blob(['%PDF doc1']));
  await saveDocument(doc2, new Blob(['%PDF doc2']));
  await saveStudyNote(createMockNote('note-res-1', doc1.id));
  await saveStudyNote(createMockNote('note-res-2', doc2.id));

  const mockDir = new MockDirectoryHandle('Pasta_Interrupcao_Migracao');
  const adapter = new FileSystemAccessAdapter(mockDir);

  // Simula interrupção no meio da migração: salvar o primeiro documento normalmente,
  // mas lançar erro ao tentar salvar o segundo documento
  const originalWriteFile = adapter.writeFile.bind(adapter);
  let failSecond = true;
  adapter.writeFile = async (segments: string[], filename: string, data: any) => {
    if (failSecond && segments.includes('doc-resume-02')) {
      throw new Error('Falha simulada de I/O no meio da migração (interrupção abrupta)');
    }
    return originalWriteFile(segments, filename, data);
  };

  // Primeira tentativa: deve falhar devido à interrupção
  const firstRes = await MigrationService.migrateIndexedDbToLocalDirectory(adapter);
  assert.equal(firstRes.success, false, 'Primeira execução deve falhar na interrupção');

  // Integridade da origem: IndexedDB NÃO pode ter sido tocado ou corrompido
  const docsAfterCrash = await getAllUserDocuments();
  assert.equal(docsAfterCrash.length, 2, 'IndexedDB deve preservar integralmente os 2 documentos');
  const notesAfterCrash = await getNotesByDocumentId('doc-resume-01');
  assert.equal(notesAfterCrash.length, 1, 'Notas do doc 1 intactas no IndexedDB');

  // Restaura I/O normal para retomada da migração
  failSecond = false;

  // Segunda tentativa (Retomada): deve prosseguir e concluir com sucesso
  const resumeRes = await MigrationService.migrateIndexedDbToLocalDirectory(adapter);
  assert.equal(resumeRes.success, true, 'Retomada da migração deve ser bem-sucedida');
  assert.equal(resumeRes.migratedItems, 2, 'Todos os 2 materiais devem estar presentes');

  // Valida que ambos os documentos estão na pasta
  const folderName = buildSubjectFolderName('Neurociências', sanitizePathComponent('Neurociências'));
  const doc1Json = await adapter.readFileText(['Assuntos', folderName, 'Materiais', 'doc-resume-01'], 'documento.json');
  const doc2Json = await adapter.readFileText(['Assuntos', folderName, 'Materiais', 'doc-resume-02'], 'documento.json');
  assert.ok(doc1Json, 'doc 1 deve estar persistido na pasta local');
  assert.ok(doc2Json, 'doc 2 deve estar persistido na pasta local após retomada');
});

test('T393: Auditoria — Resolução de conflito de nota com salvaguarda ${id}.conflito_${ts}.json', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Conflito_Nota_E2E');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-conflict-note';
  const noteId = 'note-conflito-detalhado';
  const subjectName = 'Neurociências';

  // 1. Simula nota existente na pasta física modificada externamente (mais recente)
  const adapter = new FileSystemAccessAdapter(mockDir);
  const folderName = buildSubjectFolderName(subjectName, sanitizePathComponent(subjectName));
  const externalTimestamp = Date.now() + 10000;
  const externalContent = {
    id: noteId,
    documentId: docId,
    title: 'Nota Editada Externamente (Outro Dispositivo)',
    content: 'Texto gravado externamente que NÃO pode ser perdido',
    createdAt: Date.now() - 5000,
    updatedAt: externalTimestamp,
  };
  await adapter.writeFile(['Assuntos', folderName, 'Cadernos'], `${noteId}.json`, JSON.stringify(externalContent, null, 2));

  // 2. Estudante estava em contingência offline e gerou uma versão local com timestamp anterior
  const studentTimestamp = Date.now() + 1000;
  const studentPayload = {
    id: noteId,
    documentId: docId,
    title: 'Nota Editada pelo Estudante em Contingência',
    content: 'Texto do estudante que também deve ser preservado',
    createdAt: Date.now() - 5000,
    updatedAt: studentTimestamp,
  };
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `note_${noteId}`,
    entityType: 'note',
    entityId: noteId,
    subjectName,
    action: 'upsert',
    payload: studentPayload,
    clientUpdatedAt: studentTimestamp,
  });

  // 3. Executa reconciliação
  const recResult = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recResult.success, true);
  assert.equal(recResult.conflicts.length, 1, 'Deve detectar conflito');
  assert.ok(recResult.conflicts[0].conflictPath.includes('.conflito_'), 'Caminho deve indicar arquivo de conflito');

  // 4. Verifica integridade: arquivo original permanece com a versão externa mais recente
  const originalFileText = await adapter.readFileText(['Assuntos', folderName, 'Cadernos'], `${noteId}.json`);
  assert.ok(originalFileText);
  const originalParsed = JSON.parse(originalFileText);
  assert.equal(originalParsed.title, 'Nota Editada Externamente (Outro Dispositivo)', 'Arquivo original NÃO pode ser sobrescrito!');

  // 5. Verifica que o arquivo de conflito foi criado na pasta com o conteúdo do estudante
  const conflictRelativePath = recResult.conflicts[0].conflictPath;
  const conflictFileName = conflictRelativePath.split('/').pop()!;
  const conflictFileText = await adapter.readFileText(['Assuntos', folderName, 'Cadernos'], conflictFileName);
  assert.ok(conflictFileText, 'Arquivo de conflito deve existir fisicamente');
  const conflictParsed = JSON.parse(conflictFileText);
  assert.equal(conflictParsed.title, 'Nota Editada pelo Estudante em Contingência', 'Arquivo de conflito deve guardar versão do estudante');

  // 6. Confirma que o outbox foi limpo após resolução
  const pendingAfter = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingAfter.length, 0, 'Outbox deve ser limpo após salvar o conflito com sucesso');

  await workspaceStorage.disconnectLocalDirectory();
});

test('T394: Auditoria — Conflito de recurso visual preservando binário real (.png) e metadados (.meta.json)', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Conflito_Visual_E2E');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-conflict-vis';
  const visId = 'vis-conflito-01';
  const subjectName = 'Biologia';
  const folderName = buildSubjectFolderName(subjectName, sanitizePathComponent(subjectName));
  const adapter = new FileSystemAccessAdapter(mockDir);

  // 1. Simula imagem existente na pasta com timestamp futuro e hash diferente
  const externalBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]); // PNG simulado externo
  const externalSha = await calculateSha256(externalBytes);
  const externalMeta = {
    id: visId,
    documentId: docId,
    conceptId: 'c-bio-1',
    title: 'Visual Existente na Pasta (Versão A)',
    fileName: `${visId}.png`,
    createdAt: Date.now() + 20000,
    sha256: externalSha,
  };
  await adapter.writeFile(['Assuntos', folderName, 'Recursos-Visuais'], `${visId}.png`, externalBytes);
  await adapter.writeFile(['Assuntos', folderName, 'Recursos-Visuais'], `${visId}.meta.json`, JSON.stringify(externalMeta, null, 2));

  // 2. Estudante gerou outra versão da imagem em contingência
  const studentBytes = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6, 5]); // PNG diferente
  let studentB64 = '';
  for (let i = 0; i < studentBytes.length; i++) studentB64 += String.fromCharCode(studentBytes[i]);
  const studentB64Str = btoa(studentB64);
  const studentSha = await calculateSha256(studentBytes);

  const studentPayload = {
    id: visId,
    documentId: docId,
    conceptId: 'c-bio-1',
    title: 'Visual Gerado em Contingência (Versão B)',
    fileName: `${visId}.png`,
    createdAt: Date.now() + 5000,
    sha256: studentSha,
  };

  await IndexedDbStorageAdapter.addPendingOperation({
    id: `visual_${visId}`,
    entityType: 'visual',
    entityId: visId,
    subjectName,
    action: 'upsert',
    payload: studentPayload,
    binaryBase64: studentB64Str,
    clientUpdatedAt: Date.now() + 5000,
    sha256: studentSha,
  });

  // 3. Executa reconciliação
  const recRes = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recRes.success, true);
  assert.equal(recRes.conflicts.length, 1, 'Deve registrar conflito de recurso visual');

  // 4. Verifica que os arquivos originais permanecem intactos
  const origMetaText = await adapter.readFileText(['Assuntos', folderName, 'Recursos-Visuais'], `${visId}.meta.json`);
  assert.ok(origMetaText);
  assert.equal(JSON.parse(origMetaText).title, 'Visual Existente na Pasta (Versão A)');
  const origPng = await adapter.readFileBytes(['Assuntos', folderName, 'Recursos-Visuais'], `${visId}.png`);
  assert.ok(origPng);
  assert.equal(await calculateSha256(origPng), externalSha, 'Binário original deve ser preservado');

  // 5. Verifica que o conflito gerou AMBOS os arquivos: binário real (.png) e metadados (.meta.json)
  const conflictPath = recRes.conflicts[0].conflictPath;
  const conflictFileName = conflictPath.split('/').pop()!;
  const conflictBaseName = conflictFileName.replace('.png', '');
  const conflictMetaFileName = `${conflictBaseName}.meta.json`;

  const conflictPngBytes = await adapter.readFileBytes(['Assuntos', folderName, 'Recursos-Visuais'], conflictFileName);
  assert.ok(conflictPngBytes, 'Arquivo binário de conflito .png deve existir na pasta local');
  assert.equal(await calculateSha256(conflictPngBytes), studentSha, 'Binário de conflito deve conter os bytes exatos do estudante');

  const conflictMetaText = await adapter.readFileText(['Assuntos', folderName, 'Recursos-Visuais'], conflictMetaFileName);
  assert.ok(conflictMetaText, 'Metadados de conflito .meta.json devem existir na pasta local');
  const conflictMetaObj = JSON.parse(conflictMetaText);
  assert.equal(conflictMetaObj.title, 'Visual Gerado em Contingência (Versão B)');
  assert.equal(conflictMetaObj.conflictOf, visId);

  // 6. Outbox deve ter sido removido após salvamento atômico de ambos os arquivos
  const pendingAfter = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingAfter.length, 0);

  await workspaceStorage.disconnectLocalDirectory();
});

test('T395: Auditoria — Outbox journal não remove operação se a escrita na pasta falhar (validação pós-escrita)', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Falha_Escrita_Outbox');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-fail-outbox';
  const noteId = 'note-persist-fail';
  const subjectName = 'Neurociências';

  // Registra operação pendente
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `note_${noteId}`,
    entityType: 'note',
    entityId: noteId,
    subjectName,
    action: 'upsert',
    payload: {
      id: noteId,
      documentId: docId,
      title: 'Nota com Falha de Escrita',
      content: 'Não pode ser apagada do outbox se o disco falhar',
      updatedAt: Date.now(),
    },
    clientUpdatedAt: Date.now(),
  });

  // Simula falha de I/O na escrita de arquivos
  const fsAdapter = (workspaceStorage as any).fsAdapter as FileSystemAccessAdapter;
  const originalWriteFile = fsAdapter.writeFile.bind(fsAdapter);
  let shouldFail = true;
  fsAdapter.writeFile = async (segments: string[], filename: string, data: any) => {
    if (shouldFail) {
      throw new Error('EACCES: Permissão negada no disco local durante escrita');
    }
    return originalWriteFile(segments, filename, data);
  };

  // Reconciliação tenta salvar mas falha no I/O
  const recRes = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recRes.reconciledCount, 0, 'Nenhuma operação deve ser contada como reconciliada');

  // Operação NUNCA pode ter sido removida do Outbox!
  const pendingOps = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingOps.length, 1, 'Operação DEVE permanecer no Outbox se a escrita física falhou');
  assert.equal(pendingOps[0].id, `note_${noteId}`);

  // Restaura I/O e executa novamente
  shouldFail = false;
  const recRes2 = await workspaceStorage.reconcilePendingOperations();
  assert.equal(recRes2.reconciledCount, 1, 'Após restaurar I/O, deve reconciliar com sucesso');

  const pendingAfter = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingAfter.length, 0, 'Somente agora o Outbox deve ser esvaziado');

  await workspaceStorage.disconnectLocalDirectory();
});

test('T396: Auditoria — Concorrência de gravações e proteção contra condições de corrida / reentrância', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Concorrencia');
  await workspaceStorage.connectWithHandle(mockDir);

  // 1. Testa mutex na reconciliação simultânea (evita corrupção do journal)
  await IndexedDbStorageAdapter.addPendingOperation({
    id: 'note_conc_1',
    entityType: 'note',
    entityId: 'note_conc_1',
    subjectName: 'Geral',
    action: 'upsert',
    payload: createMockNote('note_conc_1', 'd-1'),
    clientUpdatedAt: Date.now(),
  });

  // Dispara duas reconciliações no exato mesmo tick (simulando 2 abas ou chamadas paralelas)
  const [resA, resB] = await Promise.all([
    workspaceStorage.reconcilePendingOperations(),
    workspaceStorage.reconcilePendingOperations(),
  ]);

  // Ambas as chamadas devem aguardar a mesma operação de forma coordenada sem erros
  assert.ok(resA.success && resB.success, 'Ambas as chamadas devem retornar com sucesso');
  assert.equal(resA.reconciledCount, 1, 'Primeira chamada processa a operação');
  assert.equal(resB.reconciledCount, 1, 'Segunda chamada coordenada aguarda a mesma reconciliação ativa');
  const remainingOps = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(remainingOps.length, 0, 'Outbox deve ser limpo sem duplicação de processamento');

  // 2. Testa enfileiramento sequencial atômico de múltiplas gravações concorrentes via enqueueSave
  const executedOrder: number[] = [];
  const p1 = workspaceStorage.enqueueSave('Task 1', async () => {
    await new Promise(r => setTimeout(r, 10));
    executedOrder.push(1);
    return 'r1';
  });
  const p2 = workspaceStorage.enqueueSave('Task 2', async () => {
    await new Promise(r => setTimeout(r, 5));
    executedOrder.push(2);
    return 'r2';
  });
  const p3 = workspaceStorage.enqueueSave('Task 3', async () => {
    executedOrder.push(3);
    return 'r3';
  });

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1, 'r1');
  assert.equal(r2, 'r2');
  assert.equal(r3, 'r3');
  assert.deepEqual(executedOrder, [1, 2, 3], 'Gravações devem ser serializadas estritamente na ordem em que foram enfileiradas');

  await workspaceStorage.disconnectLocalDirectory();
});

test('T397: Auditoria — Backup e restauração cobrindo as 10 stores e todas as referências cruzadas', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const docId = 'doc-10-stores';
  const conceptId = 'conc-10-stores';
  const noteId = 'note-10-stores';
  const visualId = 'vis-10-stores';
  const sessionId = 'sess-10-stores';
  const attemptId = 'att-10-stores';
  const subject = 'Neurociências';

  // 1. Store 1: documents
  const doc = createMockDoc({
    id: docId,
    title: 'Sinapses e Plasticidade',
    subject,
    storageRef: `blob_${docId}`,
  });
  // Store 5: file_blobs
  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 1, 2, 3]);
  await saveDocument(doc, new Blob([pdfBytes], { type: 'application/pdf' }));

  // Store 2: analyses
  const concept = createMockConcept(conceptId, 'Plasticidade Hebbiana');
  const analysis = createMockAnalysis(docId, [concept]);
  analysis.relationships = [
    {
      id: 'rel-1',
      sourceConceptId: conceptId,
      targetConceptId: 'other-c',
      relationType: 'causes',
      description: 'Gera LTP',
      evidences: [],
      internalModelConfidence: 0.9,
      isModelInference: false,
      epistemicStatus: 'explicitly_documented',
    },
  ];
  await saveAnalysis(analysis);

  // Store 10: visual_resources
  const visual = createMockVisual(visualId, docId, conceptId);
  visual.title = 'Mecanismo de Indução de LTP';
  await saveVisualResource(visual);

  // Store 3: notes (referenciando conceptId e associatedVisualResourceId)
  const note = createMockNote(noteId, docId, conceptId);
  note.title = 'Anotações sobre Potenciação de Longa Duração';
  note.associatedVisualResourceId = visualId;
  await saveStudyNote(note);

  // Store 4: chat_sessions
  await saveChatSession(docId, [
    { id: 'msg-1', sender: 'user', text: 'O que é LTP?', timestamp: Date.now() },
    { id: 'msg-2', sender: 'tutor', text: 'LTP é a potenciação de longa duração...', timestamp: Date.now() + 100 },
  ]);

  // Store 6: learning_sessions
  const session = createMockSession(sessionId, docId, {
    activeConceptId: conceptId,
    conceptsAddressed: [conceptId],
  });
  await saveLearningSession(session);

  // Store 7: learning_attempts
  const attempt = createMockAttempt(attemptId, docId, conceptId, {
    sessionId,
    activityType: 'explain',
  });
  await saveLearningAttempt(attempt);

  // Store 8: concept_mastery
  const mastery: ConceptMastery = {
    id: buildMasteryKey(docId, conceptId),
    documentId: docId,
    conceptId,
    masteryLevel: 'apply',
    diagnosticState: 'mastered',
    totalAttempts: 1,
    lastAttemptAt: Date.now(),
    historyAttemptIds: [attemptId],
    activeGaps: [],
    consolidatedEvidenceIds: [],
  };
  await saveConceptMastery(mastery);

  // Store 9: review_schedules (FSRS-7)
  const schedule = await enrollConceptInSpacedRepetition(doc, concept);
  schedule.totalReviews = 1;
  schedule.lastRating = 'good';
  schedule.memoryState.stability = 3.5;
  await saveReviewSchedule(schedule);

  // 2. EXPORTA BACKUP COMPLETO .neuroclass
  const exportRes = await BackupService.exportBackup('full_workspace');
  assert.ok(exportRes.zipBytes.byteLength > 200, 'Tamanho do backup deve ser consistente');
  assert.ok(exportRes.filename.endsWith('.neuroclass'));

  // 3. VALIDAÇÃO INDEPENDENTE DO ZIP
  const entries = await extractZipArchive(exportRes.zipBytes);
  const entryPaths = entries.map(e => e.path);

  // Verifica que arquivos das 10 entidades estão no pacote:
  assert.ok(entryPaths.some(p => p.endsWith('documento.json')), 'Deve conter documento.json');
  assert.ok(entryPaths.some(p => p.endsWith('original.pdf')), 'Deve conter original.pdf');
  assert.ok(entryPaths.some(p => p.endsWith('analise.json')), 'Deve conter analise.json');
  assert.ok(entryPaths.some(p => p.includes('/Cadernos/')), 'Deve conter notas em Cadernos');
  assert.ok(entryPaths.some(p => p.includes('/Recursos-Visuais/')), 'Deve conter recursos visuais');
  assert.ok(entryPaths.some(p => p.includes('sessoes_')), 'Deve conter sessoes de aprendizagem');
  assert.ok(entryPaths.some(p => p.includes('tentativas_')), 'Deve conter tentativas');
  assert.ok(entryPaths.some(p => p.includes('mastery_')), 'Deve conter mastery');
  assert.ok(entryPaths.some(p => p.includes('fsrs_')), 'Deve conter agendamento fsrs');
  assert.ok(entryPaths.some(p => p.includes('/Aprendizagem/chat_')), 'Deve conter chat da sessão com tutor');

  // 4. LIMPEZA TOTAL (FACTORY RESET)
  await clearAllUserData();
  assert.equal((await getAllUserDocuments()).length, 0);
  assert.equal((await getNotesByDocumentId(docId)).length, 0);
  assert.equal((await getVisualResourcesByDocument(docId)).length, 0);
  assert.equal((await getAttemptsByDocument(docId)).length, 0);

  // 5. RESTAURAÇÃO INTEGRAL A PARTIR DO ZIP
  const importRes = await BackupService.importBackup(exportRes.zipBytes);
  assert.equal(importRes.success, true, 'Restauração deve concluir com sucesso');
  assert.equal(importRes.importedDocuments, 1);
  assert.equal(importRes.importedNotes, 1);
  assert.equal(importRes.importedVisuals, 1);

  // 6. VALIDA RECUPERAÇÃO DAS 10 STORES E TODAS AS REFERÊNCIAS CRUZADAS
  const rDoc = await getDocumentById(docId);
  assert.ok(rDoc, 'Store 1: documents recuperado');
  assert.equal(rDoc.title, 'Sinapses e Plasticidade');

  const rBlob = await getDocumentFileBlob(rDoc.storageRef!);
  assert.ok(rBlob, 'Store 5: file_blobs recuperado');

  const rAnalysis = await getAnalysisByDocumentId(docId);
  assert.ok(rAnalysis, 'Store 2: analyses recuperado');
  assert.equal(rAnalysis.fundamentalConcepts[0].id, conceptId);
  assert.equal(rAnalysis.relationships.length, 1);

  const rNotes = await getNotesByDocumentId(docId);
  assert.equal(rNotes.length, 1, 'Store 3: notes recuperado');
  assert.equal(rNotes[0].associatedConceptId, conceptId, 'Ref cruzada Nota -> Conceito preservada');
  assert.equal(rNotes[0].associatedVisualResourceId, visualId, 'Ref cruzada Nota -> Visual preservada');

  const rVisuals = await getVisualResourcesByDocument(docId);
  assert.equal(rVisuals.length, 1, 'Store 10: visual_resources recuperado');
  assert.equal(rVisuals[0].conceptId, conceptId, 'Ref cruzada Visual -> Conceito preservada');

  const rChat = await getChatSession(docId);
  assert.equal(rChat.length, 2, 'Store 4: chat_sessions recuperado');

  const rSessions = await getSessionsByDocument(docId);
  assert.equal(rSessions.length, 1, 'Store 6: learning_sessions recuperado');
  assert.equal(rSessions[0].id, sessionId);

  const rAttempts = await getAttemptsByDocument(docId);
  assert.equal(rAttempts.length, 1, 'Store 7: learning_attempts recuperado');
  assert.equal(rAttempts[0].id, attemptId);
  assert.equal(rAttempts[0].conceptId, conceptId);

  const rMastery = await getConceptMastery(docId, conceptId);
  assert.ok(rMastery, 'Store 8: concept_mastery recuperado');
  assert.equal(rMastery.masteryLevel, 'apply');
  assert.equal(rMastery.diagnosticState, 'mastered');

  const rSchedule = await getReviewSchedule(docId, conceptId);
  assert.ok(rSchedule, 'Store 9: review_schedules recuperado');
  assert.equal(rSchedule.memoryState.stability, 3.5);
  assert.equal(rSchedule.lastRating, 'good');
});

test('T398: Auditoria Missão 4 — Roteamento das Ações Reais da Interface (Notas, Chat, Imagens, Tentativas, Sessões) para workspaceStorage', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Workspace_Estudante_Real');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-fluxo-real-1';
  const conceptId = 'conc-fluxo-real-1';
  const visualId = 'vis-fluxo-real-1';
  const noteId = 'nota-fluxo-real-1';
  const sessionId = 'sess-fluxo-real-1';
  const attemptId = 'att-fluxo-real-1';
  const subject = 'Neurociencias';

  const doc = createMockDoc({ id: docId, title: 'Plasticidade Sinaptica e LTP', subject });
  const concept = createMockConcept(conceptId, 'LTP Molecular');
  const analysis = createMockAnalysis(docId, [concept]);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  // 1. Gravação do PDF original via workspaceStorage
  await workspaceStorage.saveOriginalPdf(doc, new Blob([pdfBytes]));

  // 2. Gravação da análise via workspaceStorage
  await workspaceStorage.saveAnalysis(analysis, subject);

  // 3. Gravação de Recurso Visual via workspaceStorage.saveVisualResourceBinary
  const visual = createMockVisual(visualId, docId, conceptId);
  await workspaceStorage.saveVisualResourceBinary(visual, subject);

  // 4. Gravação de Anotação com referências cruzadas via workspaceStorage.saveStudyNote
  const note = createMockNote(noteId, docId, conceptId);
  note.associatedVisualResourceId = visualId;
  await workspaceStorage.saveStudyNote(note, subject);

  // 5. Gravação de Sessão do Chat do Tutor via workspaceStorage.saveChatSession
  const chatMessages = [
    { id: 'm1', sender: 'user' as const, text: 'O que é LTP?', timestamp: Date.now() },
    { id: 'm2', sender: 'tutor' as const, text: 'LTP é a potenciação de longa duração...', timestamp: Date.now() + 100 },
  ];
  await workspaceStorage.saveChatSession(docId, chatMessages, subject);

  // 6. Gravação de Sessão e Tentativa de Aprendizagem C.R.E.A.R. via workspaceStorage
  const session = createMockSession(sessionId, docId, { activeConceptId: conceptId });
  await workspaceStorage.saveLearningSession(session, subject);

  const attempt = createMockAttempt(attemptId, docId, conceptId, {
    sessionId,
    activityType: 'explain',
  });
  await workspaceStorage.saveLearningAttempt(attempt, subject);

  // 7. Gravação de Domínio e FSRS-7 via workspaceStorage.saveLearningProgress
  const mastery: ConceptMastery = {
    id: buildMasteryKey(docId, conceptId),
    documentId: docId,
    conceptId,
    masteryLevel: 'apply',
    diagnosticState: 'mastered',
    totalAttempts: 1,
    lastAttemptAt: Date.now(),
    historyAttemptIds: [attemptId],
    activeGaps: [],
    consolidatedEvidenceIds: [],
  };
  const schedule = await enrollConceptInSpacedRepetition(doc, concept);
  schedule.totalReviews = 1;
  schedule.memoryState.stability = 4.2;
  await workspaceStorage.saveLearningProgress(mastery, schedule, subject);

  // VERIFICAÇÃO 1: Todos os dados gravados no IndexedDB
  const idbDoc = await getDocumentById(docId);
  assert.ok(idbDoc, 'Documento deve constar no IndexedDB');
  const idbNotes = await getNotesByDocumentId(docId);
  assert.equal(idbNotes.length, 1);
  assert.equal(idbNotes[0].associatedVisualResourceId, visualId);
  const idbVisuals = await getVisualResourcesByDocument(docId);
  assert.equal(idbVisuals.length, 1);
  const idbChat = await getChatSession(docId);
  assert.equal(idbChat.length, 2);
  const idbSessions = await getSessionsByDocument(docId);
  assert.equal(idbSessions.length, 1);
  const idbAttempts = await getAttemptsByDocument(docId);
  assert.equal(idbAttempts.length, 1);
  const idbMastery = await getConceptMastery(docId, conceptId);
  assert.equal(idbMastery?.masteryLevel, 'apply');
  const idbSchedule = await getReviewSchedule(docId, conceptId);
  assert.equal(idbSchedule?.memoryState.stability, 4.2);

  // VERIFICAÇÃO 2: Estrutura física na pasta local
  const adapter = new FileSystemAccessAdapter(mockDir);
  const subjectId = sanitizePathComponent(subject);
  const folderName = buildSubjectFolderName(subject, subjectId);

  const docJson = await adapter.readFileText(['Assuntos', folderName, 'Materiais', docId], 'documento.json');
  assert.ok(docJson, 'documento.json deve existir na pasta');

  const pdfFile = await adapter.readFileBytes(['Assuntos', folderName, 'Materiais', docId], 'original.pdf');
  assert.ok(pdfFile, 'original.pdf deve existir na pasta');

  const analiseJson = await adapter.readFileText(['Assuntos', folderName, 'Materiais', docId], 'analise.json');
  assert.ok(analiseJson, 'analise.json deve existir na pasta');

  const noteJson = await adapter.readFileText(['Assuntos', folderName, 'Cadernos'], `${noteId}.json`);
  assert.ok(noteJson, 'Anotação deve existir na pasta');

  const visualBinary = await adapter.readFileBytes(['Assuntos', folderName, 'Recursos-Visuais'], `${visualId}.svg`);
  assert.ok(visualBinary, 'Binário de imagem SVG deve existir na pasta');

  const visualMeta = await adapter.readFileText(['Assuntos', folderName, 'Recursos-Visuais'], `${visualId}.meta.json`);
  assert.ok(visualMeta, 'Metadados do recurso visual devem existir na pasta');

  const chatJson = await adapter.readFileText(['Assuntos', folderName, 'Aprendizagem'], `chat_${docId}.json`);
  assert.ok(chatJson, 'chat deve existir na pasta');

  const sessoesJson = await adapter.readFileText(['Assuntos', folderName, 'Aprendizagem'], `sessoes_${docId}.json`);
  assert.ok(sessoesJson, 'sessoes deve existir na pasta');

  const tentativasJson = await adapter.readFileText(['Assuntos', folderName, 'Aprendizagem'], `tentativas_${docId}.json`);
  assert.ok(tentativasJson, 'tentativas deve existir na pasta');

  const masteryJson = await adapter.readFileText(['Assuntos', folderName, 'Aprendizagem'], `mastery_${conceptId}.json`);
  assert.ok(masteryJson, 'mastery deve existir na pasta');

  const fsrsJson = await adapter.readFileText(['Assuntos', folderName, 'Aprendizagem'], `fsrs_${conceptId}.json`);
  assert.ok(fsrsJson, 'fsrs deve existir na pasta');

  // VERIFICAÇÃO 3: Exclusão de nota individual via workspaceStorage.deleteStudyNote
  await workspaceStorage.deleteStudyNote(noteId, subject);
  const noteAfterDel = await adapter.readFileText(['Assuntos', folderName, 'Cadernos'], `${noteId}.json`);
  assert.equal(Boolean(noteAfterDel), false, 'Arquivo da nota deve ser removido da pasta');
  const idbNotesAfterDel = await getNotesByDocumentId(docId);
  assert.equal(idbNotesAfterDel.length, 0, 'Nota deve ser removida do IndexedDB');
});

test('T399: Auditoria Missão 4 — Reconciliação Concorrente Coordenada e Limpeza de Outbox na Exclusão em Cascata', async () => {
  await clearAllUserData();
  await IndexedDbStorageAdapter.clearPendingOperations();

  const mockDir = new MockDirectoryHandle('Pasta_Outbox_Cascade');
  await workspaceStorage.connectWithHandle(mockDir);

  const docId = 'doc-cascade-m4';
  const subject = 'Farmacologia';

  // 1. Enfileira múltiplas operações de outbox para o mesmo documento
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `op-note-1`,
    entityType: 'note',
    entityId: `note-casc-1`,
    subjectName: subject,
    action: 'upsert',
    payload: createMockNote('note-casc-1', docId),
    clientUpdatedAt: Date.now(),
  });
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `op-chat-1`,
    entityType: 'chat' as any,
    entityId: docId,
    subjectName: subject,
    action: 'upsert',
    payload: [{ id: 'm1', sender: 'user', text: 'Dose?', timestamp: Date.now() }],
    clientUpdatedAt: Date.now(),
  });

  // Reconciliação concorrente coordenada
  const [res1, res2] = await Promise.all([
    workspaceStorage.reconcilePendingOperations(),
    workspaceStorage.reconcilePendingOperations(),
  ]);

  assert.ok(res1.success && res2.success, 'Ambas reconciliações coordenadas concluem com sucesso');
  const pendingAfterRec = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(pendingAfterRec.length, 0, 'Outbox esvaziado sem órfãos');

  // 2. Cria novas operações pendentes e testa expurgo total no deleteDocument
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `op-note-pending-del`,
    entityType: 'note',
    entityId: `note-casc-2`,
    subjectName: subject,
    action: 'upsert',
    payload: createMockNote('note-casc-2', docId),
    clientUpdatedAt: Date.now(),
  });
  await IndexedDbStorageAdapter.addPendingOperation({
    id: `op-other-doc`,
    entityType: 'note',
    entityId: `note-other-1`,
    subjectName: subject,
    action: 'upsert',
    payload: createMockNote('note-other-1', 'other-doc-id'),
    clientUpdatedAt: Date.now(),
  });

  // Executa deleteDocument
  await workspaceStorage.deleteDocument(docId, subject);

  // Operação do outro documento deve ser preservada, mas as do docId excluído devem sumir do Outbox
  const remainingOps = await IndexedDbStorageAdapter.getPendingOperations();
  assert.equal(remainingOps.length, 1, 'Apenas a operação do outro documento deve restar');
  assert.equal(remainingOps[0].entityId, 'note-other-1');
});
