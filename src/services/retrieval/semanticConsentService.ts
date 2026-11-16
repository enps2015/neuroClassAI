/**
 * NeuroClass AI — Serviço de Consentimento e Governança Semântica Local
 * @module services/retrieval/semanticConsentService
 *
 * Garante que a camada de embeddings densos locais permaneça estritamente opcional
 * e que nenhum download de pesos (~135 MB) ocorra sem autorização informada do estudante.
 */

import type { SemanticConsentStatus } from '../../types/rag';
import { clearAllDenseEmbeddings } from '../documents/ragDensePersistenceService';
import { disposeDenseWorkerClient } from './workers/denseWorkerClient';

export const CONSENT_STORAGE_KEY = 'neuroclass_semantic_consent_v1';
export const E5_MODEL_ID = 'Xenova/multilingual-e5-small';
export const E5_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const E5_ESTIMATED_SIZE_BYTES = 135_390_915; // ~118.3 MB ONNX + 17 MB tokenizer

// Fallback em memória para ambientes sem localStorage (ex: Node.js / testes / scripts)
let inMemoryConsent: SemanticConsentStatus | null = null;

/**
 * Obtém o estado atual de consentimento do usuário.
 */
export function getConsentStatus(): SemanticConsentStatus {
  if (typeof localStorage === 'undefined') {
    return inMemoryConsent || {
      granted: false,
      modelId: E5_MODEL_ID,
      modelRevision: E5_MODEL_REVISION,
      modelEstimatedSizeBytes: E5_ESTIMATED_SIZE_BYTES,
      termsAccepted: false,
    };
  }

  const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
  if (!raw) {
    return {
      granted: false,
      modelId: E5_MODEL_ID,
      modelRevision: E5_MODEL_REVISION,
      modelEstimatedSizeBytes: E5_ESTIMATED_SIZE_BYTES,
      termsAccepted: false,
    };
  }

  try {
    return JSON.parse(raw) as SemanticConsentStatus;
  } catch {
    return {
      granted: false,
      modelId: E5_MODEL_ID,
      modelRevision: E5_MODEL_REVISION,
      modelEstimatedSizeBytes: E5_ESTIMATED_SIZE_BYTES,
      termsAccepted: false,
    };
  }
}

/**
 * Verifica rapidamente se o consentimento está ativo.
 */
export function hasConsent(): boolean {
  return getConsentStatus().granted === true;
}

/**
 * Registra formalmente a concessão de consentimento pelo estudante.
 */
export function grantConsent(): SemanticConsentStatus {
  const status: SemanticConsentStatus = {
    granted: true,
    grantedAt: Date.now(),
    modelId: E5_MODEL_ID,
    modelRevision: E5_MODEL_REVISION,
    modelEstimatedSizeBytes: E5_ESTIMATED_SIZE_BYTES,
    termsAccepted: true,
  };

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(status));
  } else {
    inMemoryConsent = status;
  }

  return status;
}

/**
 * Revoga o consentimento semântico e apaga os vetores densos persistidos.
 * Preserva integralmente documentos, chunks e índices BM25.
 * Termina o Web Worker de inferência imediatamente.
 * Por padrão, preserva os pesos pré-baixados no Cache API do navegador para evitar
 * download desnecessário de 135 MB em reativações, mas impede estritamente qualquer inferência.
 */
export async function revokeConsent(options?: { purgeModelFilesCache?: boolean }): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } else {
    inMemoryConsent = null;
  }

  // 1. Termina imediatamente o Web Worker para liberar memória e sessões ONNX
  try {
    disposeDenseWorkerClient();
  } catch (workerErr) {
    console.warn('[Consent] Erro ao descartar worker de embeddings:', workerErr);
  }

  // 2. Expurga todos os embeddings densos e metadados locais do IndexedDB
  await clearAllDenseEmbeddings();

  // 3. Se solicitado explicitamente, purga o cache de arquivos do modelo na Cache API
  if (options?.purgeModelFilesCache && typeof caches !== 'undefined') {
    try {
      await caches.delete('transformers-cache');
    } catch (e) {
      console.warn('[Consent] Não foi possível limpar transformers-cache:', e);
    }
  }
}

