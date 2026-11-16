/**
 * NeuroClass AI — Local-First Workspace Repository
 * Repositório central de persistência: coordena Modo A (Pasta Local) e Modo B (IndexedDB),
 * serialização de autosave, integridade de arquivos binários e política rigorosa de fonte da verdade.
 */

import { FileSystemAccessAdapter } from './fileSystemAdapter';
import { IndexedDbStorageAdapter } from './indexedDbAdapter';
import { calculateSha256 } from './checksumService';
import { buildSubjectFolderName, sanitizePathComponent } from './pathSanitizer';
import type {
  StorageMode,
  StorageHealth,
  StoragePermissionState,
  AutosaveStatus,
  WorkspaceManifest,
  WorkspaceSubjectRef,
  SubjectBundle,
  PendingOperation,
} from './types';
import type {
  DocumentSource,
  LearningAnalysis,
  StudyNote,
  VisualResource,
  ConceptMastery,
  ConceptReviewSchedule,
  LearningAttempt,
  LearningSession,
  TutorChatMessage,
} from '../../types';
import {
  saveDocument as idbSaveDoc,
  getDocumentById as idbGetDoc,
  getAllUserDocuments as idbGetAllDocs,
  saveAnalysis as idbSaveAnalysis,
  getAnalysisByDocumentId as idbGetAnalysis,
  saveStudyNote as idbSaveNote,
  deleteStudyNote as idbDeleteNote,
  getNotesByDocumentId as idbGetNotes,
  saveVisualResource as idbSaveVisual,
  getVisualResourcesByDocument as idbGetVisuals,
  saveChatSession as idbSaveChatSession,
  saveLearningAttempt as idbSaveAttempt,
  saveLearningSession as idbSaveSession,
  saveConceptMastery as idbSaveMastery,
  getAllMasteryByDocument as idbGetMastery,
  saveReviewSchedule as idbSaveSchedule,
  getReviewSchedulesByDocument as idbGetSchedules,
  deleteDocumentCompletely as idbDeleteDoc,
  getDocumentFileBlob as idbGetFileBlob,
} from '../persistence/indexedDb';

export class WorkspaceStorage {
  private mode: StorageMode = 'indexed_db';
  private fsAdapter = new FileSystemAccessAdapter();
  private permissionState: StoragePermissionState = 'unavailable';
  private directoryName: string | undefined = undefined;
  private manifest: WorkspaceManifest | null = null;
  private lastSavedTimestamp: number = Date.now();
  private inContingency = false;
  private isReconciling = false;
  private activeReconciliation: Promise<{
    success: boolean;
    reconciledCount: number;
    conflicts: Array<{ entityId: string; conflictPath: string }>;
    error?: string;
  }> | null = null;

  // Autosave Queue
  private statusListeners = new Set<(status: AutosaveStatus, message: string) => void>();
  private currentStatus: AutosaveStatus = 'saved';
  private statusMessage = 'Salvo';
  private writeQueue: Promise<any> = Promise.resolve();

  constructor() {
    if (FileSystemAccessAdapter.isSupported()) {
      this.permissionState = 'prompt';
    }
  }

  public subscribeStatus(listener: (status: AutosaveStatus, message: string) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus, this.statusMessage);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(status: AutosaveStatus, message: string): void {
    this.currentStatus = status;
    this.statusMessage = message;
    for (const listener of this.statusListeners) {
      try {
        listener(status, message);
      } catch (e) {
        console.error('[WorkspaceStorage] Erro no ouvinte de status:', e);
      }
    }
  }

  /**
   * Inicializa o repositório no startup, restaurando o handle persistido se existir.
   */
  public async init(): Promise<void> {
    if (!FileSystemAccessAdapter.isSupported()) {
      this.mode = 'indexed_db';
      this.permissionState = 'unavailable';
      this.notifyStatus('saved', 'Armazenamento no Navegador (IndexedDB) Ativo');
      return;
    }

    try {
      const savedHandle = await IndexedDbStorageAdapter.getDirectoryHandle();
      if (savedHandle) {
        this.fsAdapter.setRootHandle(savedHandle);
        this.directoryName = savedHandle.name;

        const perm = await this.fsAdapter.queryPermission();
        this.permissionState = perm;

        if (perm === 'granted') {
          this.mode = 'local_directory';
          await this.loadWorkspaceManifest();
          const pending = await IndexedDbStorageAdapter.getPendingOperations();
          if (pending.length > 0) {
            await this.reconcilePendingOperations();
          } else {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.notifyStatus('saved', `Salvo às ${timeStr} na pasta "${savedHandle.name}"`);
          }
          return;
        } else if (perm === 'prompt') {
          this.mode = 'local_directory';
          const pending = await IndexedDbStorageAdapter.getPendingOperations();
          if (pending.length > 0) {
            this.notifyStatus(
              'contingency_pending',
              `Acesso pendente à pasta "${savedHandle.name}". ${pending.length} sincronização(ões) pendente(s).`
            );
          } else {
            this.notifyStatus(
              'permission_required',
              `Acesso pendente à pasta "${savedHandle.name}". Clique para autorizar.`
            );
          }
          return;
        } else {
          this.mode = 'local_directory';
          this.notifyStatus('permission_required', `Permissão revogada para a pasta "${savedHandle.name}".`);
          return;
        }
      }
    } catch (err) {
      console.warn('[WorkspaceStorage] Falha ao reidratar pasta local no startup:', err);
    }

    this.mode = 'indexed_db';
    this.notifyStatus('saved', 'Armazenamento no Navegador (IndexedDB) Ativo');
  }

  /**
   * Conecta interativamente uma nova pasta local via File System Access API.
   */
  public async connectLocalDirectory(): Promise<{ success: boolean; folderName?: string; error?: string }> {
    try {
      const handle = await FileSystemAccessAdapter.pickRootDirectory();
      if (!handle) return { success: false, error: 'Nenhuma pasta selecionada.' };

      this.fsAdapter.setRootHandle(handle);
      this.directoryName = handle.name;
      this.permissionState = 'granted';
      this.mode = 'local_directory';

      await IndexedDbStorageAdapter.saveDirectoryHandle(handle);

      // Cria a estrutura padrão se for uma pasta vazia
      await this.ensureWorkspaceStructure();

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.notifyStatus('saved', `Pasta conectada: "${handle.name}" (Salvo às ${timeStr})`);
      return { success: true, folderName: handle.name };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Seleção cancelada pelo usuário.' };
      }
      return { success: false, error: err.message || 'Falha ao conectar pasta local.' };
    }
  }

  /**
   * Conecta um handle existente diretamente (usado em testes ou reidratação).
   */
  public async connectWithHandle(handle: any): Promise<void> {
    this.fsAdapter.setRootHandle(handle);
    this.directoryName = handle.name;
    const perm = await this.fsAdapter.queryPermission(handle);
    this.permissionState = perm;
    this.mode = 'local_directory';
    if (perm === 'granted') {
      await this.ensureWorkspaceStructure();
      this.notifyStatus('saved', `Pasta conectada: "${handle.name}"`);
    } else {
      this.notifyStatus('permission_required', 'Permissão necessária para acessar a pasta local.');
    }
  }

  /**
   * Solicita novamente permissão explícita caso o estado seja 'prompt'.
   */
  public async requestCurrentDirectoryPermission(): Promise<boolean> {
    const granted = await this.fsAdapter.requestPermission();
    if (granted) {
      this.permissionState = 'granted';
      await this.loadWorkspaceManifest();
      const pending = await IndexedDbStorageAdapter.getPendingOperations();
      if (pending.length > 0) {
        await this.reconcilePendingOperations();
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.notifyStatus('saved', `Pasta autorizada: "${this.directoryName}" (Salvo às ${timeStr})`);
      }
      return true;
    } else {
      this.permissionState = 'denied';
      this.notifyStatus('permission_required', 'Permissão de leitura/escrita negada para a pasta.');
      return false;
    }
  }

  /**
   * Desconecta a pasta local e volta para o Modo B (IndexedDB) sem apagar arquivos.
   */
  public async disconnectLocalDirectory(): Promise<void> {
    await IndexedDbStorageAdapter.clearDirectoryHandle();
    this.fsAdapter.setRootHandle(null);
    this.directoryName = undefined;
    this.mode = 'indexed_db';
    this.permissionState = FileSystemAccessAdapter.isSupported() ? 'prompt' : 'unavailable';
    this.notifyStatus('saved', 'Pasta desconectada. Modo IndexedDB ativo.');
  }

  public getMode(): StorageMode {
    return this.mode;
  }

  public getDirectoryName(): string | undefined {
    return this.directoryName;
  }

  public getPermissionState(): StoragePermissionState {
    return this.permissionState;
  }

  public isContingencyMode(): boolean {
    return this.inContingency;
  }

  public enterContingencyMode(_reason = 'Pasta local inacessível'): void {
    this.inContingency = true;
    this.notifyStatus(
      'contingency_pending',
      'Salvo localmente no navegador — sincronização com a pasta pendente'
    );
  }

  public exitContingencyMode(): void {
    this.inContingency = false;
  }

  /**
   * Carrega ou cria o manifesto raiz `workspace.json` na pasta local.
   */
  private async loadWorkspaceManifest(): Promise<WorkspaceManifest> {
    try {
      const manifestText = await this.fsAdapter.readFileText([], 'workspace.json');
      if (manifestText) {
        this.manifest = JSON.parse(manifestText);
        return this.manifest!;
      }
    } catch {
      // Cria novo
    }

    this.manifest = {
      formatVersion: '1.0',
      app: 'NeuroClass AI',
      workspaceId: `ws_${Date.now()}`,
      name: 'Meu Caderno NeuroClass AI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      canonicalStorage: 'local_directory',
      subjects: [],
      checksums: {},
    };

    await this.fsAdapter.writeFile([], 'workspace.json', JSON.stringify(this.manifest, null, 2));
    return this.manifest;
  }

  private async ensureWorkspaceStructure(): Promise<void> {
    await this.fsAdapter.getDirectoryHandle(['Assuntos'], true);
    await this.loadWorkspaceManifest();
  }

  /**
   * Enfileira uma operação de gravação atômica/serializada com feedback visual no UI.
   */
  public enqueueSave<T>(taskName: string, writeFn: () => Promise<T>): Promise<T> {
    this.notifyStatus('saving', `Salvando ${taskName}...`);

    const promise = this.writeQueue.then(async () => {
      try {
        const result = await writeFn();
        this.lastSavedTimestamp = Date.now();
        if (this.currentStatus !== 'contingency_pending') {
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          this.notifyStatus('saved', `Salvo às ${timeStr}`);
        }
        return result;
      } catch (err: any) {
        console.error(`[WorkspaceStorage] Falha ao salvar ${taskName}:`, err);
        if (err.name === 'QuotaExceededError') {
          this.notifyStatus('quota_critical', 'Limite de armazenamento atingido (QuotaExceededError).');
        } else if (
          err.name === 'NotAllowedError' ||
          err.message?.includes('permission') ||
          err.message?.includes('permissão') ||
          err.message?.includes('Permissão')
        ) {
          this.notifyStatus('permission_required', 'Permissão necessária para salvar na pasta local.');
        } else {
          this.notifyStatus('error', `Não foi possível salvar ${taskName}. Clique para tentar.`);
        }
        throw err;
      }
    });

    this.writeQueue = promise.catch(() => {});
    return promise;
  }

  /**
   * Salva o PDF original como arquivo binário real antes da análise.
   */
  public async saveOriginalPdf(
    doc: DocumentSource,
    pdfBlobOrBuffer: Blob | ArrayBuffer
  ): Promise<{ path: string; sha256: string }> {
    const buffer =
      pdfBlobOrBuffer instanceof Blob ? await pdfBlobOrBuffer.arrayBuffer() : pdfBlobOrBuffer;
    const sha256 = await calculateSha256(buffer);

    return this.enqueueSave(`PDF Original: ${doc.title}`, async () => {
      const blob = pdfBlobOrBuffer instanceof Blob ? pdfBlobOrBuffer : new Blob([buffer], { type: doc.mimeType });

      // No modo pasta local:
      if (this.mode === 'local_directory') {
        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            const subjectId = doc.subject ? sanitizePathComponent(doc.subject) : 'Geral';
            const folderName = buildSubjectFolderName(doc.subject || 'Geral', subjectId);
            const relativeSegments = ['Assuntos', folderName, 'Materiais', doc.id];

            await this.fsAdapter.writeFile(relativeSegments, 'original.pdf', buffer);
            await this.fsAdapter.writeFile(
              relativeSegments,
              'documento.json',
              JSON.stringify({ ...doc, sha256, savedBinary: true }, null, 2)
            );

            // Mantém no IndexedDB como índice operacional
            await idbSaveDoc(doc, blob);
            return { path: `Assuntos/${folderName}/Materiais/${doc.id}/original.pdf`, sha256 };
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao salvar PDF na pasta local, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência: salva no IndexedDB e registra no journal de pendências
          await idbSaveDoc(doc, blob);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `pdf_${doc.id}`,
            entityType: 'pdf',
            entityId: doc.id,
            subjectName: doc.subject || 'Geral',
            action: 'upsert',
            payload: { ...doc, sha256, savedBinary: true },
            clientUpdatedAt: doc.uploadedAt || Date.now(),
            sha256,
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return { path: `indexeddb://file_blobs/blob_${doc.id}`, sha256 };
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }

      // No modo IndexedDB (padrão):
      await idbSaveDoc(doc, blob);
      return { path: `indexeddb://file_blobs/blob_${doc.id}`, sha256 };
    });
  }

  /**
   * Recupera o PDF original binário salvo na pasta local ou no IndexedDB.
   */
  public async getOriginalPdf(
    docId: string,
    subjectName = 'Geral'
  ): Promise<{ buffer: Uint8Array; mimeType: string } | null> {
    if (this.mode === 'local_directory' && this.permissionState === 'granted') {
      const subjectId = sanitizePathComponent(subjectName);
      const folderName = buildSubjectFolderName(subjectName, subjectId);
      const bytes = await this.fsAdapter.readFileBytes(['Assuntos', folderName, 'Materiais', docId], 'original.pdf');
      if (bytes) {
        return { buffer: bytes, mimeType: 'application/pdf' };
      }
    }

    const doc = await idbGetDoc(docId);
    if (doc?.storageRef) {
      const blob = await idbGetFileBlob(doc.storageRef);
      if (blob) {
        if (blob instanceof Uint8Array) {
          return { buffer: blob, mimeType: 'application/pdf' };
        } else if (typeof (blob as any).arrayBuffer === 'function') {
          const ab = await (blob as any).arrayBuffer();
          return { buffer: new Uint8Array(ab), mimeType: blob.type || 'application/pdf' };
        } else if ((blob as any).buffer instanceof ArrayBuffer) {
          return { buffer: new Uint8Array((blob as any).buffer), mimeType: blob.type || 'application/pdf' };
        }
      }
    }
    return null;
  }

  /**
   * Salva imagem gerada como arquivo binário real (.jpg, .png, .svg) e metadados.
   */
  public async saveVisualResourceBinary(
    resource: VisualResource,
    subjectName = 'Geral'
  ): Promise<{ path: string; sha256: string }> {
    // Converte imageDataUrl para ArrayBuffer binário
    let bytes: Uint8Array;
    let ext = 'jpg';

    if (resource.imageDataUrl.startsWith('data:image/svg+xml')) {
      ext = 'svg';
      const raw = resource.imageDataUrl.includes(';base64,')
        ? atob(resource.imageDataUrl.split(';base64,')[1])
        : decodeURIComponent(resource.imageDataUrl.split(',')[1]);
      bytes = new TextEncoder().encode(raw);
    } else if (resource.imageDataUrl.startsWith('data:')) {
      const base64Data = resource.imageDataUrl.split(';base64,')[1] || '';
      const binaryString = atob(base64Data);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      if (resource.mimeType === 'image/png') ext = 'png';
      else if (resource.mimeType === 'image/webp') ext = 'webp';
    } else {
      bytes = new TextEncoder().encode(resource.imageDataUrl);
    }

    const sha256 = await calculateSha256(bytes);

    return this.enqueueSave(`Recurso Visual: ${resource.title}`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Recursos-Visuais'];
        const fileName = `${resource.id}.${ext}`;

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.writeFile(relativeSegments, fileName, bytes);
            await this.fsAdapter.writeFile(
              relativeSegments,
              `${resource.id}.meta.json`,
              JSON.stringify({ ...resource, fileName, sha256 }, null, 2)
            );

            // Espelha no IndexedDB para acesso instantâneo da interface
            await idbSaveVisual(resource);
            return { path: `Assuntos/${folderName}/Recursos-Visuais/${fileName}`, sha256 };
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar visual na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência
          await idbSaveVisual(resource);
          let b64Str = '';
          if (resource.imageDataUrl.startsWith('data:')) {
            b64Str = resource.imageDataUrl.split(';base64,')[1] || '';
          }
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `visual_${resource.id}`,
            entityType: 'visual',
            entityId: resource.id,
            subjectName,
            action: 'upsert',
            payload: { ...resource, fileName, sha256 },
            binaryBase64: b64Str,
            clientUpdatedAt: resource.createdAt || Date.now(),
            sha256,
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return { path: `indexeddb://visual_resources/${resource.id}`, sha256 };
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }

      await idbSaveVisual(resource);
      return { path: `indexeddb://visual_resources/${resource.id}`, sha256 };
    });
  }

  /**
   * Salva análise, grafo DAG e conceitos do documento.
   */
  public async saveAnalysis(analysis: LearningAnalysis, subjectName = 'Geral'): Promise<void> {
    return this.enqueueSave(`Análise do Documento`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Materiais', analysis.documentId];

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.writeFile(relativeSegments, 'analise.json', JSON.stringify(analysis, null, 2));
            await idbSaveAnalysis(analysis);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar análise na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência
          await idbSaveAnalysis(analysis);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `analysis_${analysis.documentId}`,
            entityType: 'analysis',
            entityId: analysis.documentId,
            subjectName,
            action: 'upsert',
            payload: analysis,
            clientUpdatedAt: analysis.analyzedAt || Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveAnalysis(analysis);
    });
  }

  /**
   * Salva anotação no caderno com debounce e confirmação.
   */
  public async saveStudyNote(note: StudyNote, subjectName = 'Geral'): Promise<void> {
    return this.enqueueSave(`Nota: ${note.title}`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Cadernos'];

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.writeFile(relativeSegments, `${note.id}.json`, JSON.stringify(note, null, 2));

            // Espelha nota em formato legível Markdown (.md) para fácil leitura por estudantes
            try {
              const safeTitle = sanitizePathComponent(note.title).slice(0, 60) || note.id;
              const mdContent = this.formatNoteAsMarkdown(note, subjectName);
              await this.fsAdapter.writeFile(relativeSegments, `${safeTitle}.md`, mdContent);
            } catch (mdErr) {
              console.warn('[WorkspaceStorage] Falha ao espelhar nota em Markdown:', mdErr);
            }

            await idbSaveNote(note);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar nota na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência
          await idbSaveNote(note);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `note_${note.id}`,
            entityType: 'note',
            entityId: note.id,
            subjectName,
            action: 'upsert',
            payload: note,
            clientUpdatedAt: note.updatedAt || Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveNote(note);
    });
  }

  /**
   * Salva domínio cognitivo (ConceptMastery) e agendamentos FSRS-7.
   */
  public async saveLearningProgress(
    mastery: ConceptMastery,
    schedule?: ConceptReviewSchedule,
    subjectName = 'Geral'
  ): Promise<void> {
    return this.enqueueSave(`Progresso FSRS & Domínio`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.writeFile(
              relativeSegments,
              `mastery_${mastery.conceptId}.json`,
              JSON.stringify(mastery, null, 2)
            );
            if (schedule) {
              await this.fsAdapter.writeFile(
                relativeSegments,
                `fsrs_${schedule.conceptId}.json`,
                JSON.stringify(schedule, null, 2)
              );
            }
            await idbSaveMastery(mastery);
            if (schedule) {
              await idbSaveSchedule(schedule);
            }
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar progresso na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência
          await idbSaveMastery(mastery);
          if (schedule) {
            await idbSaveSchedule(schedule);
          }
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `progress_${mastery.conceptId}`,
            entityType: 'mastery',
            entityId: mastery.conceptId,
            subjectName,
            action: 'upsert',
            payload: { mastery, schedule },
            clientUpdatedAt: mastery.lastAttemptAt || Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveMastery(mastery);
      if (schedule) {
        await idbSaveSchedule(schedule);
      }
    });
  }

  /**
   * Remove uma anotação de estudo da pasta local e do IndexedDB.
   */
  public async deleteStudyNote(noteId: string, subjectName = 'Geral'): Promise<void> {
    return this.enqueueSave(`Exclusão de Nota`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Cadernos'];

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.removeEntry(relativeSegments, `${noteId}.json`);
            await idbDeleteNote(noteId);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao excluir nota na pasta:', writeErr);
          }
        }
      }
      await idbDeleteNote(noteId);
    });
  }

  /**
   * Salva sessão de conversa com o Tutor na pasta local e no IndexedDB.
   */
  public async saveChatSession(
    docId: string,
    messages: TutorChatMessage[],
    subjectName = 'Geral'
  ): Promise<void> {
    return this.enqueueSave(`Conversa do Tutor`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
        const fileName = `chat_${docId}.json`;

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.writeFile(relativeSegments, fileName, JSON.stringify(messages, null, 2));

            // Espelha diálogo do Tutor em formato legível Markdown (.md) para fácil leitura por estudantes
            try {
              if (Array.isArray(messages) && messages.length > 0) {
                const chatMdContent = this.formatChatAsMarkdown(messages, subjectName);
                await this.fsAdapter.writeFile(relativeSegments, `conversa_tutor_${docId}.md`, chatMdContent);
              }
            } catch (mdErr) {
              console.warn('[WorkspaceStorage] Falha ao espelhar chat em Markdown:', mdErr);
            }

            await idbSaveChatSession(docId, messages);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar chat na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          await idbSaveChatSession(docId, messages);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `chat_${docId}`,
            entityType: 'document',
            entityId: docId,
            subjectName,
            action: 'upsert',
            payload: messages,
            clientUpdatedAt: Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveChatSession(docId, messages);
    });
  }

  /**
   * Salva tentativa diagnóstica de aprendizagem na pasta local e no IndexedDB.
   */
  public async saveLearningAttempt(
    attempt: LearningAttempt,
    subjectName = 'Geral'
  ): Promise<void> {
    return this.enqueueSave(`Tentativa de Aprendizagem`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
        const fileName = `tentativas_${attempt.documentId}.json`;

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            let currentAttempts: LearningAttempt[] = [];
            const existingText = await this.fsAdapter.readFileText(relativeSegments, fileName);
            if (existingText) {
              try {
                currentAttempts = JSON.parse(existingText);
              } catch {}
            }
            const existingIdx = currentAttempts.findIndex(a => a.id === attempt.id);
            if (existingIdx >= 0) {
              currentAttempts[existingIdx] = attempt;
            } else {
              currentAttempts.push(attempt);
            }

            await this.fsAdapter.writeFile(
              relativeSegments,
              fileName,
              JSON.stringify(currentAttempts, null, 2)
            );
            await idbSaveAttempt(attempt);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar tentativa na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          await idbSaveAttempt(attempt);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `attempt_${attempt.id}`,
            entityType: 'attempt',
            entityId: attempt.documentId,
            subjectName,
            action: 'upsert',
            payload: [attempt],
            clientUpdatedAt: attempt.createdAt || Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveAttempt(attempt);
    });
  }

  /**
   * Salva sessão de aprendizagem C.R.E.A.R. / Avaliação na pasta local e no IndexedDB.
   */
  public async saveLearningSession(
    session: LearningSession,
    subjectName = 'Geral'
  ): Promise<void> {
    return this.enqueueSave(`Sessão de Aprendizagem`, async () => {
      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);
        const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
        const fileName = `sessoes_${session.documentId}.json`;

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            let currentSessions: LearningSession[] = [];
            const existingText = await this.fsAdapter.readFileText(relativeSegments, fileName);
            if (existingText) {
              try {
                currentSessions = JSON.parse(existingText);
              } catch {}
            }
            const existingIdx = currentSessions.findIndex(s => s.id === session.id);
            if (existingIdx >= 0) {
              currentSessions[existingIdx] = session;
            } else {
              currentSessions.push(session);
            }

            await this.fsAdapter.writeFile(
              relativeSegments,
              fileName,
              JSON.stringify(currentSessions, null, 2)
            );
            await idbSaveSession(session);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao gravar sessão na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          await idbSaveSession(session);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `session_${session.id}`,
            entityType: 'session',
            entityId: session.documentId,
            subjectName,
            action: 'upsert',
            payload: [session],
            clientUpdatedAt: session.updatedAt || Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbSaveSession(session);
    });
  }

  /**
   * Exclusão em cascata: remove documento e todos os seus relacionamentos.
   */
  public async deleteDocument(docId: string, subjectName = 'Geral'): Promise<void> {
    return this.enqueueSave(`Exclusão de Documento`, async () => {
      // 1. Limpar operações pendentes da outbox associadas ao documento excluído
      // para evitar ressuscitação ou gravações de itens órfãos após exclusão
      const pendingOps = await IndexedDbStorageAdapter.getPendingOperations();
      for (const op of pendingOps) {
        if (
          op.entityId === docId ||
          op.payload?.documentId === docId ||
          op.payload?.docId === docId ||
          op.id.includes(docId)
        ) {
          await IndexedDbStorageAdapter.removePendingOperation(op.id);
        }
      }

      if (this.mode === 'local_directory') {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);

        if (this.permissionState === 'granted' && !this.inContingency) {
          try {
            await this.fsAdapter.removeEntry(['Assuntos', folderName, 'Materiais'], docId, true);
            // Limpa arquivos de aprendizagem associados ao docId se existirem
            try {
              await this.fsAdapter.removeEntry(['Assuntos', folderName, 'Aprendizagem'], `chat_${docId}.json`);
            } catch {}
            try {
              await this.fsAdapter.removeEntry(['Assuntos', folderName, 'Aprendizagem'], `sessoes_${docId}.json`);
            } catch {}
            try {
              await this.fsAdapter.removeEntry(['Assuntos', folderName, 'Aprendizagem'], `tentativas_${docId}.json`);
            } catch {}

            await idbDeleteDoc(docId);
            return;
          } catch (writeErr) {
            console.warn('[WorkspaceStorage] Falha ao excluir documento na pasta, entrando em contingência:', writeErr);
            this.enterContingencyMode();
          }
        }

        if (this.inContingency) {
          // Modo contingência
          await idbDeleteDoc(docId);
          await IndexedDbStorageAdapter.addPendingOperation({
            id: `delete_${docId}`,
            entityType: 'delete',
            entityId: docId,
            subjectName,
            action: 'delete',
            payload: { docId },
            clientUpdatedAt: Date.now(),
          });
          this.notifyStatus(
            'contingency_pending',
            'Salvo localmente no navegador — sincronização com a pasta pendente'
          );
          return;
        }

        throw new Error('Permissão necessária para salvar na pasta local.');
      }
      await idbDeleteDoc(docId);
    });
  }

  /**
   * Reconcilia operações pendentes acumuladas durante período de contingência.
   * Não destrutivo: detecta conflitos, cria cópias de salvaguarda e garante idempotência.
   * Coordenação de chamadas concorrentes: aguarda reconciliação ativa sem falso retorno de sucesso.
   */
  public async reconcilePendingOperations(): Promise<{
    success: boolean;
    reconciledCount: number;
    conflicts: Array<{ entityId: string; conflictPath: string }>;
    error?: string;
  }> {
    if (this.mode !== 'local_directory' || this.permissionState !== 'granted') {
      return {
        success: false,
        reconciledCount: 0,
        conflicts: [],
        error: 'Pasta local não está conectada com permissão concedida.',
      };
    }

    if (this.activeReconciliation) {
      // Uma reconciliação já está em andamento: aguarda a conclusão da operação ativa
      const activeRes = await this.activeReconciliation;
      const remaining = await IndexedDbStorageAdapter.getPendingOperations();
      if (remaining.length > 0) {
        return this.reconcilePendingOperations();
      }
      return activeRes;
    }

    this.isReconciling = true;

    const run = async () => {
      try {
        const pendingOps = await IndexedDbStorageAdapter.getPendingOperations();
        if (pendingOps.length === 0) {
          return { success: true, reconciledCount: 0, conflicts: [] };
        }

        this.notifyStatus('saving', `Sincronizando ${pendingOps.length} alteração(ões) com a pasta...`);

        const conflicts: Array<{ entityId: string; conflictPath: string }> = [];
        let reconciledCount = 0;

        for (const op of pendingOps) {
          try {
            const subjectId = sanitizePathComponent(op.subjectName || 'Geral');
            const folderName = buildSubjectFolderName(op.subjectName || 'Geral', subjectId);

            if (op.entityType === 'note') {
              const relativeSegments = ['Assuntos', folderName, 'Cadernos'];
              const fileName = `${op.entityId}.json`;
              const existingText = await this.fsAdapter.readFileText(relativeSegments, fileName);
              if (existingText) {
                try {
                  const existingNote = JSON.parse(existingText);
                  if (existingNote.updatedAt && existingNote.updatedAt > op.clientUpdatedAt) {
                    const ts = Date.now();
                    const conflictFileName = `${op.entityId}.conflito_${ts}.json`;
                    await this.fsAdapter.writeFile(relativeSegments, conflictFileName, JSON.stringify(op.payload, null, 2));
                    const verifiedConflict = await this.fsAdapter.readFileText(relativeSegments, conflictFileName);
                    if (!verifiedConflict) {
                      throw new Error(`Falha na verificação de escrita do conflito de nota: ${conflictFileName}`);
                    }
                    conflicts.push({
                      entityId: op.entityId,
                      conflictPath: `Assuntos/${folderName}/Cadernos/${conflictFileName}`,
                    });
                    await IndexedDbStorageAdapter.removePendingOperation(op.id);
                    reconciledCount++;
                    continue;
                  }
                } catch (err: any) {
                  if (err.message?.includes('Falha na verificação')) throw err;
                }
              }
              await this.fsAdapter.writeFile(relativeSegments, fileName, JSON.stringify(op.payload, null, 2));
              const verified = await this.fsAdapter.readFileText(relativeSegments, fileName);
              if (!verified) {
                throw new Error(`Falha na verificação de escrita da nota: ${fileName}`);
              }
              try {
                const notePayload = op.payload as StudyNote;
                if (notePayload && notePayload.title) {
                  const safeTitle = sanitizePathComponent(notePayload.title).slice(0, 60) || notePayload.id;
                  const mdContent = this.formatNoteAsMarkdown(notePayload, op.subjectName || 'Geral');
                  await this.fsAdapter.writeFile(relativeSegments, `${safeTitle}.md`, mdContent);
                }
              } catch {}
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'analysis') {
              const relativeSegments = ['Assuntos', folderName, 'Materiais', op.payload.documentId];
              await this.fsAdapter.writeFile(relativeSegments, 'analise.json', JSON.stringify(op.payload, null, 2));
              const verified = await this.fsAdapter.readFileText(relativeSegments, 'analise.json');
              if (!verified) {
                throw new Error(`Falha na verificação da analise.json para ${op.payload.documentId}`);
              }
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'visual') {
              const relativeSegments = ['Assuntos', folderName, 'Recursos-Visuais'];
              const ext = op.payload.fileName?.split('.').pop() || 'png';
              const fileName = `${op.entityId}.${ext}`;
              const metaFileName = `${op.entityId}.meta.json`;

              const existingMetaText = await this.fsAdapter.readFileText(relativeSegments, metaFileName);
              if (existingMetaText) {
                try {
                  const existingMeta = JSON.parse(existingMetaText);
                  if (
                    existingMeta.createdAt &&
                    existingMeta.createdAt > op.clientUpdatedAt &&
                    existingMeta.sha256 !== op.sha256
                  ) {
                    const ts = Date.now();
                    const conflictBaseName = `${op.entityId}.conflito_${ts}`;
                    const conflictFileName = `${conflictBaseName}.${ext}`;
                    const conflictMetaFileName = `${conflictBaseName}.meta.json`;

                    if (op.binaryBase64) {
                      const binStr = atob(op.binaryBase64);
                      const bytes = new Uint8Array(binStr.length);
                      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                      await this.fsAdapter.writeFile(relativeSegments, conflictFileName, bytes);
                    }
                    const conflictPayload = {
                      ...op.payload,
                      fileName: conflictFileName,
                      conflictOf: op.entityId,
                      conflictDetectedAt: ts,
                    };
                    await this.fsAdapter.writeFile(
                      relativeSegments,
                      conflictMetaFileName,
                      JSON.stringify(conflictPayload, null, 2)
                    );

                    const verifiedBinary = await this.fsAdapter.readFileBytes(relativeSegments, conflictFileName);
                    const verifiedMeta = await this.fsAdapter.readFileText(relativeSegments, conflictMetaFileName);
                    if (!verifiedBinary || !verifiedMeta) {
                      throw new Error(`Falha na verificação de conflito visual: ${conflictFileName}`);
                    }

                    conflicts.push({
                      entityId: op.entityId,
                      conflictPath: `Assuntos/${folderName}/Recursos-Visuais/${conflictFileName}`,
                    });
                    await IndexedDbStorageAdapter.removePendingOperation(op.id);
                    reconciledCount++;
                    continue;
                  }
                } catch (err: any) {
                  if (err.message?.includes('Falha na verificação')) throw err;
                }
              }

              if (op.binaryBase64) {
                const binStr = atob(op.binaryBase64);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                await this.fsAdapter.writeFile(relativeSegments, fileName, bytes);
                const verifiedBinary = await this.fsAdapter.readFileBytes(relativeSegments, fileName);
                if (!verifiedBinary) {
                  throw new Error(`Falha na verificação do arquivo binário visual: ${fileName}`);
                }
              }
              await this.fsAdapter.writeFile(
                relativeSegments,
                metaFileName,
                JSON.stringify(op.payload, null, 2)
              );
              const verifiedMeta = await this.fsAdapter.readFileText(relativeSegments, metaFileName);
              if (!verifiedMeta) {
                throw new Error(`Falha na verificação de metadados visuais: ${metaFileName}`);
              }
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'mastery' || op.entityType === 'schedule') {
              const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
              if (op.payload.mastery) {
                const mFile = `mastery_${op.payload.mastery.conceptId}.json`;
                await this.fsAdapter.writeFile(
                  relativeSegments,
                  mFile,
                  JSON.stringify(op.payload.mastery, null, 2)
                );
                const verified = await this.fsAdapter.readFileText(relativeSegments, mFile);
                if (!verified) throw new Error(`Falha na verificação de ${mFile}`);
              }
              if (op.payload.schedule) {
                const sFile = `fsrs_${op.payload.schedule.conceptId}.json`;
                await this.fsAdapter.writeFile(
                  relativeSegments,
                  sFile,
                  JSON.stringify(op.payload.schedule, null, 2)
                );
                const verified = await this.fsAdapter.readFileText(relativeSegments, sFile);
                if (!verified) throw new Error(`Falha na verificação de ${sFile}`);
              }
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'pdf') {
              const relativeSegments = ['Assuntos', folderName, 'Materiais', op.entityId];
              await this.fsAdapter.writeFile(
                relativeSegments,
                'documento.json',
                JSON.stringify(op.payload, null, 2)
              );
              const verifiedDoc = await this.fsAdapter.readFileText(relativeSegments, 'documento.json');
              if (!verifiedDoc) throw new Error(`Falha na verificação de documento.json`);

              const blobData = await this.getOriginalPdf(op.entityId, op.subjectName);
              if (blobData) {
                await this.fsAdapter.writeFile(relativeSegments, 'original.pdf', blobData.buffer);
                const verifiedPdf = await this.fsAdapter.readFileBytes(relativeSegments, 'original.pdf');
                if (!verifiedPdf) throw new Error(`Falha na verificação de original.pdf`);
              }
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'delete') {
              const relativeSegments = ['Assuntos', folderName, 'Materiais'];
              await this.fsAdapter.removeEntry(relativeSegments, op.entityId, true);
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'attempt' || op.entityType === 'learning_attempts') {
              const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
              const fileName = `tentativas_${op.entityId}.json`;
              await this.fsAdapter.writeFile(relativeSegments, fileName, JSON.stringify(op.payload, null, 2));
              const verified = await this.fsAdapter.readFileText(relativeSegments, fileName);
              if (!verified) throw new Error(`Falha na verificação de tentativas: ${fileName}`);
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'session' || op.entityType === 'learning_sessions') {
              const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
              const fileName = `sessoes_${op.entityId}.json`;
              await this.fsAdapter.writeFile(relativeSegments, fileName, JSON.stringify(op.payload, null, 2));
              const verified = await this.fsAdapter.readFileText(relativeSegments, fileName);
              if (!verified) throw new Error(`Falha na verificação de sessoes: ${fileName}`);
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            } else if (op.entityType === 'chat' || op.id.startsWith('chat_')) {
              const relativeSegments = ['Assuntos', folderName, 'Aprendizagem'];
              const fileName = `chat_${op.entityId}.json`;
              const chatMessages = Array.isArray(op.payload) ? op.payload : op.payload.messages;
              await this.fsAdapter.writeFile(relativeSegments, fileName, JSON.stringify(chatMessages, null, 2));
              const verified = await this.fsAdapter.readFileText(relativeSegments, fileName);
              if (!verified) throw new Error(`Falha na verificação de chat: ${fileName}`);
              try {
                if (Array.isArray(chatMessages) && chatMessages.length > 0) {
                  const chatMdContent = this.formatChatAsMarkdown(chatMessages, op.subjectName || 'Geral');
                  await this.fsAdapter.writeFile(relativeSegments, `conversa_tutor_${op.entityId}.md`, chatMdContent);
                }
              } catch {}
              await IndexedDbStorageAdapter.removePendingOperation(op.id);
              reconciledCount++;
            }
          } catch (err) {
            console.warn(`[WorkspaceStorage] Falha ao reconciliar operação ${op.id}:`, err);
          }
        }

        // Atualiza manifesto
        await this.loadWorkspaceManifest();

        const remaining = await IndexedDbStorageAdapter.getPendingOperations();
        if (remaining.length === 0) {
          this.inContingency = false;
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          this.notifyStatus('saved', `Salvo às ${timeStr} na pasta (Sincronizado)`);
        } else {
          this.notifyStatus(
            'contingency_pending',
            `Salvo localmente no navegador — ${remaining.length} sincronização(ões) pendente(s)`
          );
        }

        return {
          success: true,
          reconciledCount,
          conflicts,
        };
      } finally {
        this.isReconciling = false;
        this.activeReconciliation = null;
      }
    };

    this.activeReconciliation = run();
    return this.activeReconciliation;
  }

  /**
   * Converte uma nota de estudo em documento legível Markdown (.md).
   */
  private formatNoteAsMarkdown(note: StudyNote, subjectName = 'Geral'): string {
    const lines = [
      `# ${note.title || 'Anotação de Estudo'}`,
      `*Assunto/Disciplina: ${subjectName}*`,
      `*Criada em: ${new Date(note.createdAt).toLocaleString('pt-BR')}*`,
      note.pageSource ? `*Página física de referência: Pág. ${note.pageSource}*` : '',
      '',
      note.content,
    ];
    if (note.citedExcerpt) {
      lines.push('', '> **Evidência Documental Citada:**');
      for (const l of note.citedExcerpt.split('\n')) {
        lines.push(`> ${l}`);
      }
    }
    lines.push('');
    return lines.filter((l) => l !== '').join('\n');
  }

  /**
   * Converte uma sessão de conversa do tutor em documento legível Markdown (.md).
   */
  private formatChatAsMarkdown(messages: TutorChatMessage[], subjectName = 'Geral'): string {
    const lines = [
      `# Diálogo de Aprendizagem com o Tutor Socrático`,
      `*Assunto/Disciplina: ${subjectName}*`,
      `*Última atualização: ${new Date().toLocaleString('pt-BR')}*`,
      '',
      '---',
      '',
    ];
    for (const msg of messages) {
      const author = msg.sender === 'user' ? '🧑 Estudante' : '🎓 Tutor Socrático';
      const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      lines.push(`### ${author} (${time})`);
      lines.push('');
      lines.push(msg.text);
      lines.push('');
      if (msg.evidencesCited && msg.evidencesCited.length > 0) {
        lines.push('> **Evidências Documentais Citadas:**');
        for (const ev of msg.evidencesCited) {
          lines.push(`> - *Pág. ${(ev as any).pageNumber || 's/p'}*: "${ev.excerpt}"`);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Retorna o diagnóstico completo de integridade e espaço.
   */
  public async getHealth(): Promise<StorageHealth> {
    const estimate = await IndexedDbStorageAdapter.getStorageEstimate();
    const persisted = await IndexedDbStorageAdapter.isStoragePersisted();
    const userDocs = await idbGetAllDocs();
    const pendingOps = await IndexedDbStorageAdapter.getPendingOperations();

    return {
      mode: this.mode,
      directoryConnected: Boolean(this.fsAdapter.getRootHandle() && this.permissionState === 'granted'),
      directoryName: this.directoryName,
      permissionState: this.permissionState,
      persistentGranted: persisted,
      quotaBytes: estimate.quotaBytes,
      usageBytes: estimate.usageBytes,
      usagePercent: estimate.usagePercent,
      isCritical: estimate.isCritical,
      activeSubjectCount: new Set(userDocs.map(d => d.subject || 'Geral')).size,
      activeDocumentCount: userDocs.length,
      pendingOperationsCount: pendingOps.length,
      lastSavedAt: this.lastSavedTimestamp,
    };
  }
}

export const workspaceStorage = new WorkspaceStorage();
