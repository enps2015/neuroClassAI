/**
 * NeuroClass AI — IndexedDB Storage Adapter (Modo B & Metadados de Workspace)
 * Gerencia persistência de handles de diretório (structured clone),
 * estimativa de quota e verificação de persistência durável (navigator.storage.persist).
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { PendingOperation } from './types';

const CONFIG_DB_NAME = 'neuroclass_storage_config_db';
const CONFIG_DB_VERSION = 1;

interface StorageConfigDB {
  settings: {
    key: string;
    value: any;
  };
}

let configDbPromise: Promise<IDBPDatabase<StorageConfigDB>> | null = null;
const inMemoryConfigStore = new Map<string, any>();

async function getConfigDB(): Promise<IDBPDatabase<StorageConfigDB>> {
  if (typeof indexedDB === 'undefined') {
    // Emulador em memória para testes Node.js
    return {
      get: async (_store: string, key: string) => inMemoryConfigStore.get(key),
      put: async (_store: string, value: any, key?: string) => {
        inMemoryConfigStore.set(key || value.id || 'handle', value);
      },
      delete: async (_store: string, key: string) => {
        inMemoryConfigStore.delete(key);
      },
    } as any;
  }

  if (!configDbPromise) {
    configDbPromise = openDB<StorageConfigDB>(CONFIG_DB_NAME, CONFIG_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return configDbPromise;
}

export class IndexedDbStorageAdapter {
  /**
   * Salva o handle da pasta local no IndexedDB (suportado via Structured Clone nativo).
   */
  public static async saveDirectoryHandle(handle: any): Promise<void> {
    try {
      const db = await getConfigDB();
      await db.put('settings', handle, 'active_workspace_directory_handle');
    } catch (err) {
      console.warn('[Workspace Storage] Falha ao persistir directory handle:', err);
    }
  }

  /**
   * Recupera o handle da pasta local armazenado anteriormente.
   */
  public static async getDirectoryHandle(): Promise<any | undefined> {
    try {
      const db = await getConfigDB();
      return await db.get('settings', 'active_workspace_directory_handle');
    } catch {
      return undefined;
    }
  }

  /**
   * Remove o handle da pasta local (desconecta a pasta).
   */
  public static async clearDirectoryHandle(): Promise<void> {
    try {
      const db = await getConfigDB();
      await db.delete('settings', 'active_workspace_directory_handle');
    } catch {
      // Ignora erro
    }
  }

  /**
   * Recupera a lista de operações pendentes gravadas em contingência.
   */
  public static async getPendingOperations(): Promise<PendingOperation[]> {
    try {
      const db = await getConfigDB();
      const ops = await db.get('settings', 'pending_operations');
      return Array.isArray(ops) ? ops : [];
    } catch {
      return [];
    }
  }

  /**
   * Adiciona ou atualiza uma operação pendente no journal de contingência.
   */
  public static async addPendingOperation(op: PendingOperation): Promise<void> {
    try {
      const db = await getConfigDB();
      const current = await this.getPendingOperations();
      const filtered = current.filter(o => o.id !== op.id);
      filtered.push(op);
      await db.put('settings', filtered, 'pending_operations');
    } catch (err) {
      console.warn('[IndexedDbStorageAdapter] Falha ao registrar operação pendente:', err);
    }
  }

  /**
   * Remove uma operação pendente após reconciliação confirmada.
   */
  public static async removePendingOperation(id: string): Promise<void> {
    try {
      const db = await getConfigDB();
      const current = await this.getPendingOperations();
      const filtered = current.filter(o => o.id !== id);
      await db.put('settings', filtered, 'pending_operations');
    } catch (err) {
      console.warn('[IndexedDbStorageAdapter] Falha ao remover operação pendente:', err);
    }
  }

  /**
   * Limpa o journal de contingência.
   */
  public static async clearPendingOperations(): Promise<void> {
    try {
      const db = await getConfigDB();
      await db.put('settings', [], 'pending_operations');
    } catch (err) {
      console.warn('[IndexedDbStorageAdapter] Falha ao limpar operações pendentes:', err);
    }
  }

  /**
   * Solicita persistência durável ao navegador (impede que o navegador limpe dados em baixa memória).
   */
  public static async requestPersistentStorage(): Promise<{
    supported: boolean;
    persisted: boolean;
  }> {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      try {
        const persisted = await navigator.storage.persist();
        return { supported: true, persisted };
      } catch {
        return { supported: true, persisted: false };
      }
    }
    return { supported: false, persisted: false };
  }

  /**
   * Consulta se o armazenamento já está marcado como durável (persisted).
   */
  public static async isStoragePersisted(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      try {
        return await navigator.storage.persisted();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Estima quota e espaço utilizado no disco.
   */
  public static async getStorageEstimate(): Promise<{
    usageBytes: number;
    quotaBytes: number;
    usagePercent: number;
    isCritical: boolean;
  }> {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 1;
        const percent = Math.min(100, (usage / quota) * 100);
        return {
          usageBytes: usage,
          quotaBytes: quota,
          usagePercent: Math.round(percent),
          isCritical: percent > 85,
        };
      } catch {
        // Fallback
      }
    }
    return { usageBytes: 0, quotaBytes: 0, usagePercent: 0, isCritical: false };
  }

  /**
   * Alias de conveniência para getStorageEstimate.
   */
  public static async estimateQuota() {
    return this.getStorageEstimate();
  }
}
