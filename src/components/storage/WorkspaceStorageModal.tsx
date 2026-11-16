/**
 * NeuroClass AI — Workspace Storage & Persistence Modal
 * Modal unificado de governança Local-First: seleção de pasta local, migração não destrutiva,
 * exportação/importação de pacotes portáteis .neuroclass e diagnóstico de integridade e quota.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  HardDrive,
  FolderSync,
  FolderCheck,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
  FileArchive,
  Info,
} from 'lucide-react';
import { workspaceStorage } from '../../services/storage/workspaceStorage';
import { MigrationService } from '../../services/storage/migrationService';
import { BackupService } from '../../services/storage/backupService';
import { IndexedDbStorageAdapter } from '../../services/storage/indexedDbAdapter';
import type { StorageHealth, MigrationStepProgress } from '../../services/storage/types';

interface WorkspaceStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => Promise<void>;
}

export const WorkspaceStorageModal: React.FC<WorkspaceStorageModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationStepProgress | null>(null);

  const refreshHealth = async () => {
    const h = await workspaceStorage.getHealth();
    setHealth(h);
  };

  useEffect(() => {
    if (isOpen) {
      refreshHealth();
      setStatusMessage(null);
      setErrorMessage(null);
      setMigrationProgress(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectDirectory = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Aguardando escolha da pasta pelo estudante...');

    try {
      const res = await workspaceStorage.connectLocalDirectory();
      if (res.success) {
        setStatusMessage(`Pasta conectada com sucesso: "${res.folderName}"!`);
        await refreshHealth();
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao conectar pasta.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestPermission = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const ok = await workspaceStorage.requestCurrentDirectoryPermission();
      if (ok) {
        setStatusMessage('Permissão de leitura e escrita concedida!');
        await refreshHealth();
      } else {
        setErrorMessage('Permissão negada pelo estudante.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      'Deseja desconectar a pasta local? A aplicação retornará ao armazenamento do navegador (IndexedDB) sem apagar os arquivos da pasta.'
    );
    if (!confirmed) return;

    await workspaceStorage.disconnectLocalDirectory();
    setStatusMessage('Pasta local desconectada. Modo IndexedDB ativo.');
    await refreshHealth();
  };

  const handleRunMigration = async () => {
    const confirmed = window.confirm(
      'Deseja migrar todos os materiais, cadernos, imagens e revisões do navegador para a pasta local? Esta operação é não destrutiva e preserva cópias no IndexedDB.'
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const adapter = (workspaceStorage as any).fsAdapter;
    const res = await MigrationService.migrateIndexedDbToLocalDirectory(adapter, (p) => {
      setMigrationProgress(p);
    });

    setIsProcessing(false);
    if (res.success) {
      setStatusMessage(`Migração concluída com sucesso! ${res.migratedItems} materiais copiados e verificados.`);
      await refreshHealth();
    } else {
      setErrorMessage(res.error || 'Falha durante a migração dos dados.');
    }
  };

  const handleExportBackup = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Gerando pacote seguro .neuroclass (ZIP)...');

    try {
      const { filename, zipBytes } = await BackupService.exportBackup('full_workspace');
      BackupService.triggerBrowserDownload(filename, zipBytes);
      setStatusMessage(`Backup exportado com sucesso: "${filename}"!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao exportar backup.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Validando integridade SHA-256 e extraindo pacote...');

    try {
      const ab = await file.arrayBuffer();
      const res = await BackupService.importBackup(ab);
      if (res.success) {
        setStatusMessage(
          `Backup restaurado com sucesso! ${res.importedDocuments} documentos, ${res.importedNotes} notas e ${res.importedVisuals} recursos visuais restaurados.`
        );
        if (onRefreshData) await onRefreshData();
        await refreshHealth();
      } else {
        setErrorMessage(res.error || 'Falha ao importar pacote de backup.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao processar arquivo.');
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  const handleRequestDurableStorage = async () => {
    const res = await IndexedDbStorageAdapter.requestPersistentStorage();
    if (res.persisted) {
      setStatusMessage('Armazenamento durável concedido pelo navegador!');
    } else {
      setErrorMessage('O navegador não concedeu o status de armazenamento durável.');
    }
    await refreshHealth();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Armazenamento & Persistência Local-First</h2>
              <p className="text-xs text-slate-400">Seus dados e cadernos protegidos no seu computador</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {/* Mensagens de Feedback */}
          {statusMessage && (
            <div className="flex items-start gap-2.5 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Banner do Modo Ativo */}
          <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Repositório Canônico:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    health?.mode === 'local_directory' && health?.permissionState === 'granted'
                      ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
                  }`}
                >
                  {health?.mode === 'local_directory' && health?.permissionState === 'granted'
                    ? 'Pasta Local no Disco (Modo A)'
                    : 'Navegador IndexedDB (Modo B)'}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                {health?.mode === 'local_directory' && health?.permissionState === 'granted'
                  ? `Arquivos gravados como PDFs e JSONs legíveis na pasta "${health.directoryName}".`
                  : 'Armazenado no banco local do navegador. Conecte uma pasta ou exporte backups para segurança absoluta.'}
              </p>
            </div>

            {health?.mode === 'local_directory' && health.permissionState === 'granted' ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 font-medium transition-colors cursor-pointer shrink-0"
              >
                Desconectar Pasta
              </button>
            ) : health?.mode === 'local_directory' && health.permissionState === 'prompt' ? (
              <button
                type="button"
                onClick={handleRequestPermission}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <FolderSync className="w-3.5 h-3.5" />
                Autorizar Acesso
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectDirectory}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow-sm shadow-cyan-600/20"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Conectar Pasta Local
              </button>
            )}
          </div>

          {/* Seção 1: Pasta Local no Computador */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FolderCheck className="w-4 h-4 text-cyan-400" />
              1. Pasta Local no Computador (File System Access)
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Permite ao NeuroClass AI salvar seus PDFs originais, cadernos em Markdown, análises e ilustrações didáticas em uma pasta do seu computador organizada por assunto.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleConnectDirectory}
                disabled={isProcessing}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-cyan-400" />
                {health?.directoryConnected ? 'Alterar Pasta Raiz' : 'Escolher Pasta no Meu Computador'}
              </button>

              {health?.directoryConnected && (
                <button
                  type="button"
                  onClick={handleRunMigration}
                  disabled={isProcessing}
                  className="px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 rounded-lg border border-emerald-500/40 font-medium flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                  Copiar Dados Anteriores para a Pasta
                </button>
              )}
            </div>

            {/* Barra de Progresso da Migração */}
            {migrationProgress && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-300">
                    {migrationProgress.step === 'completed'
                      ? 'Concluído!'
                      : migrationProgress.currentEntityName || 'Processando...'}
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">{migrationProgress.percent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${migrationProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Seção 2: Backup & Restauração Portáteis */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileArchive className="w-4 h-4 text-violet-400" />
              2. Backup Portátil Seguro (.neuroclass ZIP)
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Gera um arquivo único e portátil contendo todos os PDFs, imagens, análises, cadernos e histórico de repetição espaçada com validação criptográfica SHA-256. Ideal para transferir entre computadores ou guardar cópias de segurança.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isProcessing}
                className="px-3 py-2 bg-violet-950/60 hover:bg-violet-900/60 text-violet-200 rounded-lg border border-violet-500/40 font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-violet-400" />
                Exportar Backup Completo (.neuroclass)
              </button>

              <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 font-medium flex items-center gap-2 transition-colors cursor-pointer">
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>Restaurar de Arquivo (.neuroclass)</span>
                <input
                  type="file"
                  accept=".neuroclass,.zip"
                  onChange={handleImportBackup}
                  disabled={isProcessing}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Seção 3: Diagnóstico de Integridade e Quota */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              3. Diagnóstico de Quota e Integridade
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">Uso da Quota</span>
                <span className="text-sm font-bold font-mono text-white">{health?.usagePercent || 0}%</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">Disciplinas / Assuntos</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{health?.activeSubjectCount || 0}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">Documentos Pessoais</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{health?.activeDocumentCount || 0}</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">Armazenamento Durável</span>
                <span className="text-sm font-bold font-mono text-violet-400">
                  {health?.persistentGranted ? 'Concedido' : 'Padrão'}
                </span>
              </div>
            </div>

            {!health?.persistentGranted && (
              <button
                type="button"
                onClick={handleRequestDurableStorage}
                disabled={isProcessing}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
              >
                Solicitar proteção contra limpeza automática de cache do navegador (navigator.storage.persist)
              </button>
            )}

            <div className="flex items-start gap-2 p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-[11px] text-slate-400">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong>Privacidade BYOK Garantida:</strong> Suas chaves de API da Google Gemini API nunca são incluídas nos backups ou gravadas na pasta do disco. Elas permanecem estritamente em memória volátil de sessão.
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400">
          <span>Local-First Core v1.0 • Seguro & Confiável</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

