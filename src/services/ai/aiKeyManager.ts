/**
 * NeuroClass AI — Gerenciador de Chave de API Gemini em Memória (BYOK)
 *
 * ARQUITETURA DE SEGURANÇA E PRIVACIDADE ESTRITA:
 * 1. A chave do usuário reside EXCLUSIVAMENTE em variável volátil de memória JavaScript.
 * 2. NUNCA é salva em localStorage, IndexedDB, sessionStorage ou cookies.
 * 3. NUNCA é enviada para ferramentas de telemetria, analytics ou logs de console.
 * 4. Ao recarregar a página, fechar a aba ou chamar `clearApiKey()`, a chave é apagada imediatamente.
 */

export type KeyValidationState = 'unconfigured' | 'checking' | 'valid' | 'invalid' | 'quota_exceeded' | 'error';
export type KeySourceType = 'none' | 'byok' | 'managed';

interface KeyStateListener {
  (state: {
    hasKey: boolean;
    validationState: KeyValidationState;
    source: KeySourceType;
    lastMessage?: string;
  }): void;
}

let inMemoryApiKey: string | null = null;
let validationState: KeyValidationState = 'unconfigured';
let keySource: KeySourceType = 'none';
let statusMessage: string = '';
const listeners: Set<KeyStateListener> = new Set();

function notifyListeners() {
  const payload = {
    hasKey: Boolean(inMemoryApiKey) || keySource === 'managed',
    validationState,
    source: keySource,
    lastMessage: statusMessage,
  };
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      console.warn('[AIKeyManager] Erro em listener:', err);
    }
  });
}

export const AIKeyManager = {
  /**
   * Obtém a chave atual da sessão em memória.
   */
  getApiKey(): string | null {
    return inMemoryApiKey;
  },

  /**
   * Define uma chave BYOK na memória volátil da sessão.
   */
  setApiKey(key: string, isValidated = false, message = ''): void {
    const trimmed = (key || '').trim();
    if (trimmed) {
      inMemoryApiKey = trimmed;
      keySource = 'byok';
      validationState = isValidated ? 'valid' : 'unconfigured';
      statusMessage = message || (isValidated ? 'Chave conectada com sucesso na sessão ativa.' : 'Chave inserida aguardando validação.');
    } else {
      this.clearApiKey();
    }
    notifyListeners();
  },

  /**
   * Remove a chave da memória imediatamente (encerramento de sessão).
   */
  clearApiKey(): void {
    inMemoryApiKey = null;
    keySource = 'none';
    validationState = 'unconfigured';
    statusMessage = 'Nenhuma chave configurada na sessão ativa.';
    notifyListeners();
  },

  /**
   * Atualiza o estado de validação da chave.
   */
  setValidationState(state: KeyValidationState, message: string): void {
    validationState = state;
    statusMessage = message;
    notifyListeners();
  },

  /**
   * Sinaliza que o backend possui chave administrada (.env).
   */
  setManagedMode(): void {
    if (!inMemoryApiKey) {
      keySource = 'managed';
      validationState = 'valid';
      statusMessage = 'Operando com credencial administrada do servidor local.';
      notifyListeners();
    }
  },

  /**
   * Retorna se há chave disponível (BYOK em memória ou administrada pelo servidor).
   */
  hasApiKey(): boolean {
    return Boolean(inMemoryApiKey) || keySource === 'managed';
  },

  /**
   * Retorna a origem da credencial ativa ('none' | 'byok' | 'managed').
   */
  getSource(): KeySourceType {
    return keySource;
  },

  /**
   * Retorna se a chave ativa é especificamente uma chave própria de usuário (BYOK).
   */
  isUserKey(): boolean {
    return keySource === 'byok' && Boolean(inMemoryApiKey);
  },

  /**
   * Retorna o estado atual completo.
   */
  getState() {
    return {
      hasKey: Boolean(inMemoryApiKey) || keySource === 'managed',
      validationState,
      source: keySource,
      lastMessage: statusMessage,
    };
  },

  /**
   * Subscreve para atualizações de estado da chave.
   */
  subscribe(listener: KeyStateListener): () => void {
    listeners.add(listener);
    // Dispara estado atual imediatamente
    listener({
      hasKey: Boolean(inMemoryApiKey) || keySource === 'managed',
      validationState,
      source: keySource,
      lastMessage: statusMessage,
    });
    return () => listeners.delete(listener);
  },
};
