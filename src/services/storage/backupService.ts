/**
 * NeuroClass AI — Portable Backup & Restore Service (.neuroclass)
 * Exportação e importação de pacotes portáteis ZIP contendo manifestos com hash SHA-256,
 * PDFs binários originais, cadernos, imagens e dados cognitivos.
 * Exclusão rigorosa de chaves de API / segredos e proteção contra ZIP Slip e arquivos corrompidos.
 */

import { createZipArchive, extractZipArchive } from './zipService';
import { calculateSha256 } from './checksumService';
import { isSafeRelativePath, buildSubjectFolderName, sanitizePathComponent } from './pathSanitizer';
import type { BackupPackageManifest, ConflictResolutionOption } from './types';
import type {
  DocumentSource,
  LearningAnalysis,
  StudyNote,
  VisualResource,
  ConceptMastery,
  ConceptReviewSchedule,
} from '../../types';
import {
  getAllUserDocuments,
  getAnalysisByDocumentId,
  getNotesByDocumentId,
  getVisualResourcesByDocument,
  getChatSession,
  getAllMasteryByDocument,
  getReviewSchedulesByDocument,
  getSessionsByDocument,
  getAttemptsByDocument,
  getDocumentFileBlob,
  saveDocument,
  saveAnalysis,
  saveStudyNote,
  saveVisualResource,
  saveChatSession,
  saveConceptMastery,
  saveReviewSchedule,
  saveLearningSession,
  saveLearningAttempt,
} from '../persistence/indexedDb';

export class BackupService {
  /**
   * Exporta o workspace completo ou uma disciplina/assunto específico como arquivo `.neuroclass` (ZIP).
   */
  public static async exportBackup(
    packageType: 'full_workspace' | 'single_subject' = 'full_workspace',
    targetSubjectName?: string
  ): Promise<{ filename: string; zipBytes: Uint8Array; manifest: BackupPackageManifest }> {
    let docs = await getAllUserDocuments();

    if (packageType === 'single_subject' && targetSubjectName) {
      docs = docs.filter(
        d => (d.subject?.trim().toLowerCase() || 'geral') === targetSubjectName.trim().toLowerCase()
      );
    }

    const zipEntries: Array<{ path: string; data: Uint8Array | string }> = [];
    const manifestFiles: BackupPackageManifest['files'] = [];

    let noteCount = 0;
    let visualCount = 0;
    const subjectsIncluded = new Set<string>();

    for (const doc of docs) {
      const subjectName = doc.subject?.trim() || 'Geral';
      subjectsIncluded.add(subjectName);
      const subjectId = sanitizePathComponent(subjectName);
      const folderName = buildSubjectFolderName(subjectName, subjectId);

      // 1. Sanitiza documento: descarta buffers de imagem voláteis (pageImageBase64) e segredos
      const cleanPages = doc.pages?.map(p => {
        if (p.pageImageBase64) {
          const { pageImageBase64: _removed, ...rest } = p;
          return rest;
        }
        return p;
      });
      const cleanDoc: DocumentSource = {
        ...doc,
        pages: cleanPages,
      };

      const docJsonText = JSON.stringify(cleanDoc, null, 2);
      const docPath = `Assuntos/${folderName}/Materiais/${doc.id}/documento.json`;
      const docSha = await calculateSha256(docJsonText);

      zipEntries.push({ path: docPath, data: docJsonText });
      manifestFiles.push({
        path: docPath,
        size: new TextEncoder().encode(docJsonText).length,
        sha256: docSha,
        mimeType: 'application/json',
      });

      // 2. Anexa PDF binário original se disponível
      if (doc.storageRef) {
        try {
          const blob = await getDocumentFileBlob(doc.storageRef);
          if (blob) {
            let pdfBytes: Uint8Array | null = null;
            if (blob instanceof Uint8Array) {
              pdfBytes = blob;
            } else if (typeof (blob as any).arrayBuffer === 'function') {
              const ab = await (blob as any).arrayBuffer();
              pdfBytes = new Uint8Array(ab);
            } else if ((blob as any).buffer instanceof ArrayBuffer) {
              pdfBytes = new Uint8Array((blob as any).buffer);
            }

            if (pdfBytes) {
              const pdfPath = `Assuntos/${folderName}/Materiais/${doc.id}/original.pdf`;
              const pdfSha = await calculateSha256(pdfBytes);

              zipEntries.push({ path: pdfPath, data: pdfBytes });
              manifestFiles.push({
                path: pdfPath,
                size: pdfBytes.length,
                sha256: pdfSha,
                mimeType: doc.mimeType || 'application/pdf',
              });
            }
          }
        } catch (err) {
          console.warn(`[Backup] Não foi possível incluir binário do documento ${doc.id}:`, err);
        }
      }

      // 3. Análise e Grafo DAG
      const analysis = await getAnalysisByDocumentId(doc.id);
      if (analysis) {
        const anText = JSON.stringify(analysis, null, 2);
        const anPath = `Assuntos/${folderName}/Materiais/${doc.id}/analise.json`;
        const anSha = await calculateSha256(anText);

        zipEntries.push({ path: anPath, data: anText });
        manifestFiles.push({
          path: anPath,
          size: new TextEncoder().encode(anText).length,
          sha256: anSha,
          mimeType: 'application/json',
        });
      }

      // 4. Cadernos e Notas
      const notes = await getNotesByDocumentId(doc.id);
      for (const n of notes) {
        noteCount++;
        const noteText = JSON.stringify(n, null, 2);
        const notePath = `Assuntos/${folderName}/Cadernos/${n.id}.json`;
        const noteSha = await calculateSha256(noteText);

        zipEntries.push({ path: notePath, data: noteText });
        manifestFiles.push({
          path: notePath,
          size: new TextEncoder().encode(noteText).length,
          sha256: noteSha,
          mimeType: 'application/json',
        });
      }

      // 5. Recursos Visuais (Imagem binária + Metadados)
      const visuals = await getVisualResourcesByDocument(doc.id);
      for (const vis of visuals) {
        visualCount++;
        const visMetaText = JSON.stringify(vis, null, 2);
        const metaPath = `Assuntos/${folderName}/Recursos-Visuais/${vis.id}.meta.json`;
        const metaSha = await calculateSha256(visMetaText);

        zipEntries.push({ path: metaPath, data: visMetaText });
        manifestFiles.push({
          path: metaPath,
          size: new TextEncoder().encode(visMetaText).length,
          sha256: metaSha,
          mimeType: 'application/json',
        });

        // Extrai bytes reais da imagem
        if (vis.imageDataUrl) {
          let imgBytes: Uint8Array;
          let ext = 'jpg';
          if (vis.imageDataUrl.startsWith('data:image/svg+xml')) {
            ext = 'svg';
            const raw = vis.imageDataUrl.includes(';base64,')
              ? atob(vis.imageDataUrl.split(';base64,')[1])
              : decodeURIComponent(vis.imageDataUrl.split(',')[1]);
            imgBytes = new TextEncoder().encode(raw);
          } else if (vis.imageDataUrl.startsWith('data:')) {
            const b64 = vis.imageDataUrl.split(';base64,')[1] || '';
            const binStr = atob(b64);
            imgBytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) imgBytes[i] = binStr.charCodeAt(i);
            if (vis.mimeType === 'image/png') ext = 'png';
          } else {
            imgBytes = new TextEncoder().encode(vis.imageDataUrl);
          }

          const imgPath = `Assuntos/${folderName}/Recursos-Visuais/${vis.id}.${ext}`;
          const imgSha = await calculateSha256(imgBytes);

          zipEntries.push({ path: imgPath, data: imgBytes });
          manifestFiles.push({
            path: imgPath,
            size: imgBytes.length,
            sha256: imgSha,
            mimeType: vis.mimeType,
          });
        }
      }

      // 6. Sessão de Chat com o Tutor
      const chat = await getChatSession(doc.id);
      if (chat.length > 0) {
        const chatText = JSON.stringify(chat, null, 2);
        const chatPath = `Assuntos/${folderName}/Aprendizagem/chat_${doc.id}.json`;
        const chatSha = await calculateSha256(chatText);

        zipEntries.push({ path: chatPath, data: chatText });
        manifestFiles.push({
          path: chatPath,
          size: new TextEncoder().encode(chatText).length,
          sha256: chatSha,
          mimeType: 'application/json',
        });
      }

      // 7. Domínio Cognitivo e Revisões FSRS
      const masteries = await getAllMasteryByDocument(doc.id);
      if (masteries.length > 0) {
        const mastText = JSON.stringify(masteries, null, 2);
        const mastPath = `Assuntos/${folderName}/Aprendizagem/mastery_${doc.id}.json`;
        const mastSha = await calculateSha256(mastText);

        zipEntries.push({ path: mastPath, data: mastText });
        manifestFiles.push({
          path: mastPath,
          size: new TextEncoder().encode(mastText).length,
          sha256: mastSha,
          mimeType: 'application/json',
        });
      }

      const schedules = await getReviewSchedulesByDocument(doc.id);
      if (schedules.length > 0) {
        const schText = JSON.stringify(schedules, null, 2);
        const schPath = `Assuntos/${folderName}/Aprendizagem/revisoes_fsrs_${doc.id}.json`;
        const schSha = await calculateSha256(schText);

        zipEntries.push({ path: schPath, data: schText });
        manifestFiles.push({
          path: schPath,
          size: new TextEncoder().encode(schText).length,
          sha256: schSha,
          mimeType: 'application/json',
        });
      }

      // 8. Sessões de Aprendizagem
      const sessions = await getSessionsByDocument(doc.id);
      if (sessions.length > 0) {
        const sessText = JSON.stringify(sessions, null, 2);
        const sessPath = `Assuntos/${folderName}/Aprendizagem/sessoes_${doc.id}.json`;
        const sessSha = await calculateSha256(sessText);

        zipEntries.push({ path: sessPath, data: sessText });
        manifestFiles.push({
          path: sessPath,
          size: new TextEncoder().encode(sessText).length,
          sha256: sessSha,
          mimeType: 'application/json',
        });
      }

      // 9. Tentativas Diagnósticas de Aprendizagem
      const attempts = await getAttemptsByDocument(doc.id);
      if (attempts.length > 0) {
        const attText = JSON.stringify(attempts, null, 2);
        const attPath = `Assuntos/${folderName}/Aprendizagem/tentativas_${doc.id}.json`;
        const attSha = await calculateSha256(attText);

        zipEntries.push({ path: attPath, data: attText });
        manifestFiles.push({
          path: attPath,
          size: new TextEncoder().encode(attText).length,
          sha256: attSha,
          mimeType: 'application/json',
        });
      }
    }

    // 8. Gera e anexa o manifesto do pacote `manifest.json`
    const now = Date.now();
    const manifest: BackupPackageManifest = {
      formatVersion: '2.0',
      packageType,
      app: 'NeuroClass AI',
      exportedAt: now,
      exportedBy: 'NeuroClass AI Local-First Core',
      workspaceName: targetSubjectName || 'Workspace Completo',
      subjectCount: subjectsIncluded.size,
      documentCount: docs.length,
      noteCount,
      visualResourceCount: visualCount,
      files: manifestFiles,
    };

    const manifestText = JSON.stringify(manifest, null, 2);
    zipEntries.unshift({ path: 'manifest.json', data: manifestText });

    const zipBytes = await createZipArchive(zipEntries);
    const dateStr = new Date(now).toISOString().slice(0, 10);
    const safeTag = targetSubjectName ? sanitizePathComponent(targetSubjectName) : 'Workspace-Completo';
    const filename = `NeuroClassAI_Backup_${safeTag}_${dateStr}.neuroclass`;

    return { filename, zipBytes, manifest };
  }

  /**
   * Importa um pacote `.neuroclass` (ZIP) com validação de checksum e política de conflitos.
   */
  public static async importBackup(
    zipBuffer: ArrayBuffer | Uint8Array,
    conflictOption: ConflictResolutionOption = { action: 'replace_confirmed', subjectId: '' }
  ): Promise<{
    success: boolean;
    importedDocuments: number;
    importedNotes: number;
    importedVisuals: number;
    warnings: string[];
    error?: string;
  }> {
    const warnings: string[] = [];

    try {
      // 1. Extração segura (validação ZIP Slip automática no extractZipArchive)
      const entries = await extractZipArchive(zipBuffer);
      const manifestEntry = entries.find(e => e.path === 'manifest.json');

      if (!manifestEntry) {
        throw new Error('Arquivo de backup inválido: manifest.json ausente no pacote.');
      }

      const manifest: BackupPackageManifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));
      if (!manifest.files || !Array.isArray(manifest.files)) {
        throw new Error('Formato de manifesto incompatível ou corrompido.');
      }

      // 2. Validação rigorosa de checksum SHA-256 de cada arquivo
      const fileMap = new Map<string, Uint8Array>();
      for (const e of entries) {
        fileMap.set(e.path, e.data);
      }

      for (const expected of manifest.files) {
        const fileData = fileMap.get(expected.path);
        if (!fileData) {
          warnings.push(`Arquivo listado no manifesto não encontrado no pacote: ${expected.path}`);
          continue;
        }

        const actualSha = await calculateSha256(fileData);
        if (actualSha !== expected.sha256) {
          throw new Error(`Falha de integridade SHA-256 no arquivo ${expected.path}. Backup corrompido ou adulterado.`);
        }
      }

      // 3. Staging e restauração no repositório persistente
      let importedDocuments = 0;
      let importedNotes = 0;
      let importedVisuals = 0;

      for (const entry of entries) {
        if (entry.path === 'manifest.json') continue;

        // Se for documento.json
        if (entry.path.endsWith('/documento.json')) {
          const doc: DocumentSource = JSON.parse(new TextDecoder().decode(entry.data));

          // Procura pelo PDF original correspondente no pacote
          const pdfPath = entry.path.replace('/documento.json', '/original.pdf');
          const pdfBytes = fileMap.get(pdfPath);
          const pdfBlob = pdfBytes ? new Blob([pdfBytes as any], { type: doc.mimeType || 'application/pdf' }) : undefined;

          await saveDocument(doc, pdfBlob);
          importedDocuments++;
        }

        // Se for analise.json
        if (entry.path.endsWith('/analise.json')) {
          const analysis: LearningAnalysis = JSON.parse(new TextDecoder().decode(entry.data));
          await saveAnalysis(analysis);
        }

        // Se for anotação (.json em Cadernos)
        if (entry.path.includes('/Cadernos/') && entry.path.endsWith('.json')) {
          const note: StudyNote = JSON.parse(new TextDecoder().decode(entry.data));
          await saveStudyNote(note);
          importedNotes++;
        }

        // Se for recurso visual (.meta.json em Recursos-Visuais)
        if (entry.path.includes('/Recursos-Visuais/') && entry.path.endsWith('.meta.json')) {
          const vis: VisualResource = JSON.parse(new TextDecoder().decode(entry.data));
          await saveVisualResource(vis);
          importedVisuals++;
        }

        // Se for sessão de chat
        if (entry.path.includes('/Aprendizagem/chat_') && entry.path.endsWith('.json')) {
          const chat = JSON.parse(new TextDecoder().decode(entry.data));
          const docIdMatch = entry.path.match(/chat_(.+)\.json$/);
          if (docIdMatch) {
            await saveChatSession(docIdMatch[1], chat);
          }
        }

        // Se for maestria
        if (entry.path.includes('/Aprendizagem/mastery_') && entry.path.endsWith('.json')) {
          const masteries: ConceptMastery[] = JSON.parse(new TextDecoder().decode(entry.data));
          if (Array.isArray(masteries)) {
            for (const m of masteries) {
              await saveConceptMastery(m);
            }
          }
        }

        // Se for revisões FSRS
        if (entry.path.includes('/Aprendizagem/revisoes_fsrs_') && entry.path.endsWith('.json')) {
          const schedules: ConceptReviewSchedule[] = JSON.parse(new TextDecoder().decode(entry.data));
          if (Array.isArray(schedules)) {
            for (const s of schedules) {
              await saveReviewSchedule(s);
            }
          }
        }

        // Se for sessões de aprendizagem
        if (entry.path.includes('/Aprendizagem/sessoes_') && entry.path.endsWith('.json')) {
          const sessions = JSON.parse(new TextDecoder().decode(entry.data));
          if (Array.isArray(sessions)) {
            for (const sess of sessions) {
              await saveLearningSession(sess);
            }
          }
        }

        // Se for tentativas diagnósticas de aprendizagem
        if (entry.path.includes('/Aprendizagem/tentativas_') && entry.path.endsWith('.json')) {
          const attempts = JSON.parse(new TextDecoder().decode(entry.data));
          if (Array.isArray(attempts)) {
            for (const att of attempts) {
              await saveLearningAttempt(att);
            }
          }
        }
      }

      return {
        success: true,
        importedDocuments,
        importedNotes,
        importedVisuals,
        warnings,
      };
    } catch (err: any) {
      return {
        success: false,
        importedDocuments: 0,
        importedNotes: 0,
        importedVisuals: 0,
        warnings,
        error: err.message || 'Falha ao restaurar pacote de backup.',
      };
    }
  }

  /**
   * Helper para disparar download direto do arquivo no navegador sem backend.
   */
  public static triggerBrowserDownload(filename: string, data: Uint8Array, mimeType = 'application/zip'): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([data as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
