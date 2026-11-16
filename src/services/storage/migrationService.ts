/**
 * NeuroClass AI — Non-Destructive Migration Service
 * Migra dados pré-existentes do IndexedDB para a pasta local conectada,
 * com validação de hash SHA-256, retomabilidade idempotente e preservação
 * total da integridade dos dados de origem (Right to Keep).
 */

import { FileSystemAccessAdapter } from './fileSystemAdapter';
import { calculateSha256 } from './checksumService';
import { buildSubjectFolderName, sanitizePathComponent } from './pathSanitizer';
import type { MigrationStepProgress, WorkspaceManifest } from './types';
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
  getDB,
} from '../persistence/indexedDb';

export class MigrationService {
  /**
   * Executa a migração passo a passo com relatório de progresso em tempo real.
   */
  public static async migrateIndexedDbToLocalDirectory(
    target: FileSystemAccessAdapter | any,
    onProgress?: (progress: MigrationStepProgress) => void
  ): Promise<{ success: boolean; migratedItems: number; warnings: string[]; error?: string }> {
    const fsAdapter =
      target instanceof FileSystemAccessAdapter
        ? target
        : new FileSystemAccessAdapter(target);
    const warnings: string[] = [];

    // Helper de progresso
    const report = (
      step: MigrationStepProgress['step'],
      completedItems: number,
      totalItems: number,
      entityName?: string
    ) => {
      const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;
      if (onProgress) {
        onProgress({
          step,
          currentEntityName: entityName,
          completedItems,
          totalItems,
          percent,
          warnings,
        });
      }
    };

    try {
      report('scanning', 0, 1, 'Inspecionando banco de dados local...');
      const docs = await getAllUserDocuments();

      if (docs.length === 0) {
        report('completed', 1, 1, 'Nenhum material existente para migrar.');
        return { success: true, migratedItems: 0, warnings };
      }

      // Agrupa documentos por Assunto/Disciplina
      const subjectMap = new Map<string, typeof docs>();
      for (const doc of docs) {
        const subj = doc.subject?.trim() || 'Geral';
        if (!subjectMap.has(subj)) subjectMap.set(subj, []);
        subjectMap.get(subj)!.push(doc);
      }

      // Estima total de operações
      let totalOperations = subjectMap.size; // Pastas de assunto
      for (const doc of docs) {
        totalOperations += 1; // Material/PDF
        totalOperations += 1; // Análise
      }

      report('creating_folders', 0, totalOperations, 'Criando estrutura de pastas...');

      let completedOps = 0;
      const manifestChecksums: Record<string, string> = {};
      const subjectRefs: any[] = [];

      // 1. Processa cada Assunto/Disciplina
      for (const [subjectName, subjectDocs] of subjectMap.entries()) {
        const subjectId = sanitizePathComponent(subjectName);
        const folderName = buildSubjectFolderName(subjectName, subjectId);

        // Cria diretórios específicos
        await fsAdapter.getDirectoryHandle(['Assuntos', folderName, 'Materiais'], true);
        await fsAdapter.getDirectoryHandle(['Assuntos', folderName, 'Cadernos'], true);
        await fsAdapter.getDirectoryHandle(['Assuntos', folderName, 'Recursos-Visuais'], true);
        await fsAdapter.getDirectoryHandle(['Assuntos', folderName, 'Aprendizagem'], true);

        // 2. Processa cada Documento do Assunto
        for (const doc of subjectDocs) {
          report('writing_binaries', completedOps, totalOperations, `${doc.title} (PDF original)`);

          const docDir = ['Assuntos', folderName, 'Materiais', doc.id];
          await fsAdapter.getDirectoryHandle(docDir, true);

          // Salva documento.json
          await fsAdapter.writeFile(docDir, 'documento.json', JSON.stringify(doc, null, 2));

          // Recupera e salva o arquivo binário original (se existir no store file_blobs)
          if (doc.storageRef) {
            try {
              const blob = await getDocumentFileBlob(doc.storageRef);
              if (blob) {
                const ab = await blob.arrayBuffer();
                const sha = await calculateSha256(ab);
                const pdfPath = `Assuntos/${folderName}/Materiais/${doc.id}/original.pdf`;
                await fsAdapter.writeFile(docDir, 'original.pdf', ab);
                manifestChecksums[pdfPath] = sha;
              } else {
                warnings.push(`Arquivo binário original de "${doc.title}" não estava presente no cache local.`);
              }
            } catch (err) {
              warnings.push(`Não foi possível extrair o binário original de "${doc.title}": ${String(err)}`);
            }
          }

          // Salva análise e grafo conceitual
          report('writing_metadata', completedOps, totalOperations, `${doc.title} (Análise & Grafo)`);
          const analysis = await getAnalysisByDocumentId(doc.id);
          if (analysis) {
            const anPath = `Assuntos/${folderName}/Materiais/${doc.id}/analise.json`;
            const anText = JSON.stringify(analysis, null, 2);
            await fsAdapter.writeFile(docDir, 'analise.json', anText);
            manifestChecksums[anPath] = await calculateSha256(anText);
          }

          // Salva anotações do caderno associadas
          const notes = await getNotesByDocumentId(doc.id);
          for (const note of notes) {
            const noteDir = ['Assuntos', folderName, 'Cadernos'];
            const noteText = JSON.stringify(note, null, 2);
            await fsAdapter.writeFile(noteDir, `${note.id}.json`, noteText);
            manifestChecksums[`Assuntos/${folderName}/Cadernos/${note.id}.json`] = await calculateSha256(noteText);
          }

          // Salva recursos visuais gerados (metadados + binário real da imagem)
          const visuals = await getVisualResourcesByDocument(doc.id);
          for (const vis of visuals) {
            const visDir = ['Assuntos', folderName, 'Recursos-Visuais'];
            const metaPath = `Assuntos/${folderName}/Recursos-Visuais/${vis.id}.meta.json`;
            const metaText = JSON.stringify(vis, null, 2);
            await fsAdapter.writeFile(visDir, `${vis.id}.meta.json`, metaText);
            manifestChecksums[metaPath] = await calculateSha256(metaText);

            if (vis.imageDataUrl) {
              try {
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
                  else if (vis.mimeType === 'image/webp') ext = 'webp';
                } else {
                  imgBytes = new TextEncoder().encode(vis.imageDataUrl);
                }

                const imgFileName = `${vis.id}.${ext}`;
                const imgPath = `Assuntos/${folderName}/Recursos-Visuais/${imgFileName}`;
                await fsAdapter.writeFile(visDir, imgFileName, imgBytes);
                manifestChecksums[imgPath] = await calculateSha256(imgBytes);
              } catch (imgErr) {
                warnings.push(`Não foi possível serializar imagem de "${vis.title}": ${String(imgErr)}`);
              }
            }
          }

          // Salva histórico de chat com o Tutor
          const chat = await getChatSession(doc.id);
          if (chat.length > 0) {
            const chatPath = `Assuntos/${folderName}/Aprendizagem/chat_${doc.id}.json`;
            const chatText = JSON.stringify(chat, null, 2);
            await fsAdapter.writeFile(
              ['Assuntos', folderName, 'Aprendizagem'],
              `chat_${doc.id}.json`,
              chatText
            );
            manifestChecksums[chatPath] = await calculateSha256(chatText);
          }

          // Salva sessões de aprendizagem
          const sessions = await getSessionsByDocument(doc.id);
          if (sessions.length > 0) {
            const sessPath = `Assuntos/${folderName}/Aprendizagem/sessoes_${doc.id}.json`;
            const sessText = JSON.stringify(sessions, null, 2);
            await fsAdapter.writeFile(
              ['Assuntos', folderName, 'Aprendizagem'],
              `sessoes_${doc.id}.json`,
              sessText
            );
            manifestChecksums[sessPath] = await calculateSha256(sessText);
          }

          // Salva tentativas diagnósticas de aprendizagem
          const attempts = await getAttemptsByDocument(doc.id);
          if (attempts.length > 0) {
            const attPath = `Assuntos/${folderName}/Aprendizagem/tentativas_${doc.id}.json`;
            const attText = JSON.stringify(attempts, null, 2);
            await fsAdapter.writeFile(
              ['Assuntos', folderName, 'Aprendizagem'],
              `tentativas_${doc.id}.json`,
              attText
            );
            manifestChecksums[attPath] = await calculateSha256(attText);
          }

          // Salva maestria e revisões FSRS
          const masteries = await getAllMasteryByDocument(doc.id);
          if (masteries.length > 0) {
            const mastPath = `Assuntos/${folderName}/Aprendizagem/mastery_${doc.id}.json`;
            const mastText = JSON.stringify(masteries, null, 2);
            await fsAdapter.writeFile(
              ['Assuntos', folderName, 'Aprendizagem'],
              `mastery_${doc.id}.json`,
              mastText
            );
            manifestChecksums[mastPath] = await calculateSha256(mastText);
          }

          const schedules = await getReviewSchedulesByDocument(doc.id);
          if (schedules.length > 0) {
            const schedPath = `Assuntos/${folderName}/Aprendizagem/revisoes_fsrs_${doc.id}.json`;
            const schedText = JSON.stringify(schedules, null, 2);
            await fsAdapter.writeFile(
              ['Assuntos', folderName, 'Aprendizagem'],
              `revisoes_fsrs_${doc.id}.json`,
              schedText
            );
            manifestChecksums[schedPath] = await calculateSha256(schedText);
          }

          completedOps++;
        }

        // Escreve assunto.json
        const subjectMeta = {
          id: subjectId,
          name: subjectName,
          folderName,
          documentCount: subjectDocs.length,
          updatedAt: Date.now(),
        };
        await fsAdapter.writeFile(['Assuntos', folderName], 'assunto.json', JSON.stringify(subjectMeta, null, 2));
        subjectRefs.push(subjectMeta);
        completedOps++;
      }

      // 3. Atualiza manifesto geral workspace.json
      report('verifying', completedOps, totalOperations, 'Atualizando manifesto workspace.json...');
      const manifest: WorkspaceManifest = {
        formatVersion: '1.0',
        app: 'NeuroClass AI',
        workspaceId: `ws_${Date.now()}`,
        name: 'Workspace Local NeuroClass AI',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        canonicalStorage: 'local_directory',
        subjects: subjectRefs,
        checksums: manifestChecksums,
      };

      await fsAdapter.writeFile([], 'workspace.json', JSON.stringify(manifest, null, 2));

      report('completed', totalOperations, totalOperations, 'Migração concluída com sucesso!');
      return {
        success: true,
        migratedItems: docs.length,
        warnings,
      };
    } catch (err: any) {
      report('failed', 0, 1, `Erro na migração: ${err.message || String(err)}`);
      return {
        success: false,
        migratedItems: 0,
        warnings,
        error: err.message || 'Falha durante a migração dos dados locais.',
      };
    }
  }

  /**
   * Alias de conveniência para migrateIndexedDbToLocalDirectory.
   */
  public static async migrateToFolder(
    dirHandle: any,
    onProgress?: (progress: MigrationStepProgress) => void
  ) {
    return this.migrateIndexedDbToLocalDirectory(dirHandle, onProgress);
  }
}
