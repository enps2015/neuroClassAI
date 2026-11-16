/**
 * NeuroClass AI — Serviço de Gerenciamento de Tickets Temporários de Avaliação Semântica (Tier 2)
 * @module services/ai/semanticEvaluationTicketService
 *
 * Responsável por emitir e validar identificadores opacos (evaluationHandle) para preservar
 * estritamente a proveniência das evidências citadas, garantindo que o backend não confie
 * em textos de evidências, números de página ou metadados reenviados livremente pelo cliente.
 *
 * DIRETRIZES INVIOLÁVEIS DE SEGURANÇA E MEMÓRIA (Missão P3.2.2.1 - Seção 7):
 * 1. 100% Volátil em memória (nunca persiste em IndexedDB, localStorage ou banco de dados);
 * 2. TTL curto (default 10 minutos = 600.000 ms);
 * 3. Identificador opaco gerado por mecanismo criptograficamente imprevisível (crypto.randomUUID);
 * 4. Teto máximo configurável de tickets ativos (MAX_ACTIVE_TICKETS = 100) para prevenir DoS/vazamento de memória;
 * 5. Expiração e descarte automático por LRU/tempo;
 * 6. Limite de utilizações por identificador (default 5 tentativas manuais);
 * 7. NUNCA armazena chaves de API (BYOK) nem respostas do modelo no ticket;
 * 8. NUNCA expõe o handle completo em logs.
 */

import crypto from 'node:crypto';
import type { ControlledEvidenceItem } from '../../types/rag';

export interface EvaluationTicketEvidenceItem {
  tag: string; // Ex: "C1"
  chunkId: string;
  pageNumber?: number;
  sectionTitle?: string;
  excerpt: string;
}

export interface EvaluationTicketSegment {
  id: string; // Ex: "seg_1"
  index: number;
  text: string;
  citationTags: string[]; // Ex: ["C1"]
  evidenceChunkIds: string[];
}

export interface EvaluationTicket {
  handle: string;
  documentId: string;
  messageTimestamp?: number;
  createdAt: number;
  expiresAt: number;
  useCount: number;
  maxUses: number;
  eligibleSegments: EvaluationTicketSegment[];
  evidenceMap: Map<string, EvaluationTicketEvidenceItem>;
}

// Configurações de tempo e capacidade em memória
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutos
const DEFAULT_MAX_ACTIVE_TICKETS = 100;
const DEFAULT_MAX_USES = 5;

let customTTLMs: number | null = null;
const ticketStore = new Map<string, EvaluationTicket>();

/**
 * Retorna o TTL efetivo (permitindo customização para testes automatizados).
 */
export function getEffectiveTTLMs(): number {
  if (customTTLMs !== null && customTTLMs > 0) {
    return customTTLMs;
  }
  const envTTL = process.env.EVALUATION_TICKET_TTL_MS;
  if (envTTL) {
    const parsed = parseInt(envTTL, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MS;
}

/**
 * Permite definir TTL customizado para ensaios de expiração em testes unitários.
 */
export function setCustomTicketTTL(ms: number | null): void {
  customTTLMs = ms;
}

/**
 * Retorna a capacidade máxima de tickets em memória.
 */
export function getMaxActiveTickets(): number {
  const envMax = process.env.MAX_ACTIVE_EVALUATION_TICKETS;
  if (envMax) {
    const parsed = parseInt(envMax, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_ACTIVE_TICKETS;
}

/**
 * Remove tickets expirados do mapa em memória.
 */
export function pruneExpiredTickets(now: number = Date.now()): number {
  let prunedCount = 0;
  for (const [handle, ticket] of ticketStore.entries()) {
    if (now >= ticket.expiresAt) {
      ticketStore.delete(handle);
      prunedCount++;
    }
  }
  return prunedCount;
}

/**
 * Garante que o mapa não exceda a capacidade máxima descartando os tickets mais antigos.
 */
function evictOldestTicketsIfNeeded(maxCapacity: number): void {
  if (ticketStore.size <= maxCapacity) return;

  // Converte para array ordenado por criação crescente (mais antigos primeiro)
  const sorted = Array.from(ticketStore.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );

  const excess = ticketStore.size - maxCapacity;
  for (let i = 0; i < excess; i++) {
    ticketStore.delete(sorted[i][0]);
  }
}

/**
 * Cria um novo ticket temporário de avaliação semântica contendo exclusivamente
 * as evidências documentais controladas pelo backend para os segmentos elegíveis.
 */
export function createEvaluationTicket(params: {
  documentId: string;
  messageTimestamp?: number;
  segments: Array<{
    id: string;
    index: number;
    text: string;
    citationTags: string[];
    evidenceChunkIds?: string[];
  }>;
  evidenceMap: Map<string, ControlledEvidenceItem> | Record<string, ControlledEvidenceItem>;
  maxUses?: number;
}): EvaluationTicket | null {
  const now = Date.now();
  pruneExpiredTickets(now);

  // Filtra apenas segmentos com citações explícitas [C#]
  const eligibleSegments: EvaluationTicketSegment[] = [];
  const neededCitationTags = new Set<string>();

  for (const seg of params.segments) {
    if (seg.citationTags && seg.citationTags.length > 0) {
      eligibleSegments.push({
        id: seg.id,
        index: seg.index,
        text: seg.text,
        citationTags: [...seg.citationTags],
        evidenceChunkIds: seg.evidenceChunkIds ? [...seg.evidenceChunkIds] : [],
      });
      for (const t of seg.citationTags) {
        neededCitationTags.add(t);
      }
    }
  }

  // Se não houver nenhum segmento elegível, nenhum ticket precisa ser criado
  if (eligibleSegments.length === 0 || neededCitationTags.size === 0) {
    return null;
  }

  // Normaliza o mapa de evidências de entrada
  const rawMap: Map<string, ControlledEvidenceItem> =
    params.evidenceMap instanceof Map
      ? params.evidenceMap
      : new Map(Object.entries(params.evidenceMap || {}));

  // Extrai exclusivamente as evidências requeridas pelas citações elegíveis
  const filteredEvidenceMap = new Map<string, EvaluationTicketEvidenceItem>();
  for (const tag of neededCitationTags) {
    // Normaliza a chave para buscar com ou sem colchetes
    const rawTag = tag.replace(/[\[\]]/g, '');
    const item = rawMap.get(tag) || rawMap.get(rawTag) || rawMap.get(`[${rawTag}]`);
    if (item) {
      filteredEvidenceMap.set(rawTag, {
        tag: rawTag,
        chunkId: item.chunkId || `chunk_${rawTag}`,
        pageNumber: item.pageNumber,
        sectionTitle: item.sectionTitle,
        excerpt: item.text || item.excerpt || (item.evidenceReference ? item.evidenceReference.excerpt : ''),
      });
    }
  }

  if (filteredEvidenceMap.size === 0) {
    return null;
  }

  // Gera identificador opaco criptográfico seguro
  const handle = crypto.randomUUID();
  const ttlMs = getEffectiveTTLMs();
  const expiresAt = now + ttlMs;

  const ticket: EvaluationTicket = {
    handle,
    documentId: params.documentId,
    messageTimestamp: params.messageTimestamp,
    createdAt: now,
    expiresAt,
    useCount: 0,
    maxUses: params.maxUses || DEFAULT_MAX_USES,
    eligibleSegments,
    evidenceMap: filteredEvidenceMap,
  };

  ticketStore.set(handle, ticket);
  evictOldestTicketsIfNeeded(getMaxActiveTickets());

  return ticket;
}

export type TicketConsumptionError =
  | 'TICKET_NOT_FOUND'
  | 'TICKET_EXPIRED'
  | 'TICKET_MAX_USES_EXCEEDED';

/**
 * Recupera e valida um ticket de avaliação a partir do handle opaco.
 * Incrementa o contador de utilizações de forma segura.
 */
export function consumeEvaluationTicket(
  handle: string,
  now: number = Date.now()
): { ticket: EvaluationTicket | null; error?: TicketConsumptionError } {
  if (!handle || typeof handle !== 'string') {
    return { ticket: null, error: 'TICKET_NOT_FOUND' };
  }

  const ticket = ticketStore.get(handle);
  if (!ticket) {
    return { ticket: null, error: 'TICKET_NOT_FOUND' };
  }

  if (now >= ticket.expiresAt) {
    ticketStore.delete(handle);
    return { ticket: null, error: 'TICKET_EXPIRED' };
  }

  if (ticket.useCount >= ticket.maxUses) {
    return { ticket: null, error: 'TICKET_MAX_USES_EXCEEDED' };
  }

  ticket.useCount++;
  return { ticket, error: undefined };
}

/**
 * Limpa todos os tickets em memória (utilizado em reinícios lógicos e testes).
 */
export function clearAllTickets(): void {
  ticketStore.clear();
  customTTLMs = null;
}

/**
 * Retorna a contagem atual de tickets armazenados.
 */
export function getActiveTicketCount(): number {
  return ticketStore.size;
}

/**
 * Sanitiza o handle para exibição segura em logs operacionais sem expor o identificador completo.
 */
export function sanitizeHandleForLog(handle?: string): string {
  if (!handle || typeof handle !== 'string') return '[handle_indefinido]';
  return `${handle.slice(0, 8)}...`;
}
