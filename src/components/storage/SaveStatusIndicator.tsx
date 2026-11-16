/**
 * NeuroClass AI — Save Status Indicator
 * Indicador visual discreto e moderno do estado de persistência Local-First (Autosave).
 * Permite ao estudante saber exatamente quando o trabalho intelectual foi salvo e
 * avisa imediatamente sobre quota ou necessidade de permissão na pasta local.
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  FolderSync,
  HardDrive,
  FolderCheck,
} from 'lucide-react';
import { workspaceStorage } from '../../services/storage/workspaceStorage';
import type { AutosaveStatus } from '../../services/storage/types';

interface SaveStatusIndicatorProps {
  onOpenStorageModal: () => void;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ onOpenStorageModal }) => {
  const [status, setStatus] = useState<AutosaveStatus>('saved');
  const [message, setMessage] = useState<string>('Salvo');
  const [mode, setMode] = useState<'local_directory' | 'indexed_db'>('indexed_db');
  const [folderName, setFolderName] = useState<string | undefined>(undefined);

  useEffect(() => {
    setMode(workspaceStorage.getMode());
    setFolderName(workspaceStorage.getDirectoryName());

    const unsubscribe = workspaceStorage.subscribeStatus((newStatus, newMsg) => {
      setStatus(newStatus);
      setMessage(newMsg);
      setMode(workspaceStorage.getMode());
      setFolderName(workspaceStorage.getDirectoryName());
    });

    return () => unsubscribe();
  }, []);

  return (
    <button
      type="button"
      onClick={onOpenStorageModal}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer select-none shadow-sm ${
        status === 'saving'
          ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 animate-pulse'
          : status === 'error'
          ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
          : status === 'permission_required'
          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60 animate-bounce'
          : status === 'contingency_pending'
          ? 'bg-amber-950/70 border-amber-500/60 text-amber-300 hover:bg-amber-900/70 animate-pulse'
          : status === 'quota_critical'
          ? 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
          : mode === 'local_directory'
          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40'
          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
      }`}
      title={
        status === 'contingency_pending'
          ? message || 'Salvo localmente no navegador — sincronização com a pasta pendente. Clique para gerenciar.'
          : mode === 'local_directory'
          ? `Pasta Local: "${folderName || 'Conectada'}". Clique para gerenciar armazenamento.`
          : 'Armazenamento no Navegador (IndexedDB). Clique para escolher uma pasta local ou exportar backup.'
      }
    >
      {status === 'saving' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
      ) : status === 'error' ? (
        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
      ) : status === 'permission_required' || status === 'contingency_pending' ? (
        <FolderSync className="w-3.5 h-3.5 text-amber-400 animate-spin" />
      ) : mode === 'local_directory' ? (
        <FolderCheck className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <HardDrive className="w-3.5 h-3.5 text-slate-400" />
      )}

      <span className="hidden sm:inline font-mono truncate max-w-[140px]">
        {status === 'saving'
          ? 'Salvando...'
          : status === 'permission_required'
          ? 'Autorizar Pasta'
          : status === 'contingency_pending'
          ? 'Sincronizar'
          : status === 'error'
          ? 'Erro ao Salvar'
          : mode === 'local_directory'
          ? folderName || 'Pasta Local'
          : 'Armazenado'}
      </span>
    </button>
  );
};

