/**
 * NeuroClass AI — File System Access API Adapter (Modo A: Pasta Local)
 * Gerencia leitura, gravação resiliente, journaling e permissões em pastas locais reais.
 */

import { isSafeRelativePath } from './pathSanitizer';

export class FileSystemAccessAdapter {
  private rootHandle: any | null = null;

  constructor(handle?: any) {
    if (handle) this.rootHandle = handle;
  }

  /**
   * Verifica se o navegador atual oferece suporte à File System Access API
   * em contexto seguro (HTTPS ou localhost).
   */
  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasPicker = typeof (window as any).showDirectoryPicker === 'function';
    const isSecure = window.isSecureContext === true || window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1';
    return hasPicker && isSecure;
  }

  public setRootHandle(handle: any | null): void {
    this.rootHandle = handle;
  }

  public getRootHandle(): any | null {
    return this.rootHandle;
  }

  /**
   * Solicita interativamente ao estudante a escolha de uma pasta raiz no disco.
   */
  public static async pickRootDirectory(): Promise<any> {
    if (!this.isSupported()) {
      throw new Error('File System Access API não é suportada neste navegador ou ambiente.');
    }
    const handle = await (window as any).showDirectoryPicker({
      id: 'neuroclass_workspace_root',
      mode: 'readwrite',
      startIn: 'documents',
    });
    return handle;
  }

  /**
   * Consulta o estado atual de permissão do handle sem forçar prompt.
   */
  public async queryPermission(handle = this.rootHandle): Promise<'granted' | 'prompt' | 'denied'> {
    if (!handle) return 'denied';
    if (typeof handle.queryPermission !== 'function') return 'granted'; // Emulators / polyfills
    try {
      const state = await handle.queryPermission({ mode: 'readwrite' });
      return state;
    } catch {
      return 'denied';
    }
  }

  /**
   * Solicita permissão ativa ao estudante (deve ser disparado por clique ou ação de usuário).
   */
  public async requestPermission(handle = this.rootHandle): Promise<boolean> {
    if (!handle) return false;
    if (typeof handle.requestPermission !== 'function') return true;
    try {
      const state = await handle.requestPermission({ mode: 'readwrite' });
      return state === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Navega ou cria recursivamente diretórios aninhados seguros.
   */
  public async getDirectoryHandle(
    pathSegments: string[],
    create = true,
    startHandle = this.rootHandle
  ): Promise<any> {
    if (!startHandle) throw new Error('Nenhum diretório raiz conectado.');

    let current = startHandle;
    for (const segment of pathSegments) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        throw new Error('Tentativa de path traversal detectada.');
      }
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  /**
   * Escreve um arquivo de forma resiliente no diretório especificado.
   * Suporta ArrayBuffer, Uint8Array ou string.
   */
  public async writeFile(
    pathSegments: string[],
    fileName: string,
    data: ArrayBuffer | Uint8Array | string
  ): Promise<void> {
    if (!this.rootHandle) throw new Error('Nenhum diretório raiz conectado.');

    const dirHandle = await this.getDirectoryHandle(pathSegments, true);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      if (typeof data === 'string') {
        await writable.write(data);
      } else {
        await writable.write(data as any);
      }
    } finally {
      await writable.close();
    }
  }

  /**
   * Lê um arquivo como Uint8Array binário.
   */
  public async readFileBytes(
    pathSegments: string[],
    fileName: string
  ): Promise<Uint8Array | undefined> {
    if (!this.rootHandle) return undefined;
    try {
      const dirHandle = await this.getDirectoryHandle(pathSegments, false);
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const ab = await file.arrayBuffer();
      return new Uint8Array(ab);
    } catch {
      return undefined;
    }
  }

  /**
   * Lê um arquivo como string de texto UTF-8.
   */
  public async readFileText(
    pathSegments: string[],
    fileName: string
  ): Promise<string | undefined> {
    const bytes = await this.readFileBytes(pathSegments, fileName);
    if (!bytes) return undefined;
    return new TextDecoder().decode(bytes);
  }

  /**
   * Remove arquivo ou diretório com segurança.
   */
  public async removeEntry(
    pathSegments: string[],
    entryName: string,
    recursive = false
  ): Promise<void> {
    if (!this.rootHandle) return;
    try {
      const dirHandle = await this.getDirectoryHandle(pathSegments, false);
      await dirHandle.removeEntry(entryName, { recursive });
    } catch {
      // Entrada não existia
    }
  }

  /**
   * Lista nomes de subdiretórios ou arquivos dentro de um caminho.
   */
  public async listEntries(pathSegments: string[] = []): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
    if (!this.rootHandle) return [];
    try {
      const dirHandle = await this.getDirectoryHandle(pathSegments, false);
      const results: Array<{ name: string; kind: 'file' | 'directory' }> = [];
      for await (const [name, handle] of dirHandle.entries()) {
        results.push({ name, kind: handle.kind });
      }
      return results;
    } catch {
      return [];
    }
  }
}

