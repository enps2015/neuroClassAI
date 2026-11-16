/**
 * NeuroClass AI — Suíte de Testes de Regressão e Ciclo de Vida da Camada Semântica (Missão F1.3)
 * @module tests/rag_f1_3_regression.test
 *
 * Cobertura estrita dos 5 domínios de estabilização pós-F1.2:
 * - A1. Consentimento e Governança Fail-Closed
 * - A2. Isolamento no Worker e Fallback Resiliente para BM25 em Falhas
 * - A3. Ingestão Condicional, Indexação de Documentos Pré-existentes e Detecção de Falhas Parciais
 * - A4. Reconciliação de Estado de Interface e Persistência Pós-F5
 * - A5. Integridade Estrutural e Ausência de Quebras de Import / Build
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  getConsentStatus,
  hasConsent,
  grantConsent,
  revokeConsent,
  CONSENT_STORAGE_KEY,
  E5_MODEL_ID,
} from '../services/retrieval/semanticConsentService';
import {
  getDenseWorkerClient,
  disposeDenseWorkerClient,
  DenseEmbeddingWorkerClient,
} from '../services/retrieval/workers/denseWorkerClient';
import {
  indexDocumentDense,
  indexAllUnindexedDocumentsDense,
} from '../services/retrieval/semanticIndexingService';
import { searchHybrid } from '../services/retrieval/hybridSearchService';
import { buildTutorGroundedContext } from '../services/retrieval/tutorContextBuilder';
import {
  saveDenseEmbeddings,
  getDenseEmbeddings,
  clearAllDenseEmbeddings,
  saveDenseIndexMetadata,
  getDenseIndexMetadata,
} from '../services/documents/ragDensePersistenceService';
import {
  saveDocumentChunks,
  getDocumentChunks,
  deleteDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  buildDocumentLexicalIndex,
  searchBM25,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
  getLexicalIndex,
  deleteLexicalIndex,
} from '../services/documents/ragLexicalPersistenceService';
import {
  saveDocument,
  getAllUserDocuments,
  deleteDocumentCompletely,
} from '../services/persistence/indexedDb';
import type { StoredDocumentChunk, StoredDenseEmbedding, DocumentSource } from '../types/rag';

function createMockChunk(
  documentId: string,
  pageNumber: number,
  chunkIndex: number,
  text: string
): StoredDocumentChunk {
  const chunkId = `${documentId}_p${pageNumber}_c${chunkIndex}`;
  return {
    chunkId,
    documentId,
    docId: documentId,
    pageNumber,
    chunkIndexInPage: chunkIndex,
    globalChunkIndex: chunkIndex,
    text,
    sourceRef: {
      documentId,
      pageNumber,
      charOffsetStart: 0,
      charOffsetEnd: text.length,
      sectionTitle: `Seção ${pageNumber}.${chunkIndex}`,
      sectionHierarchy: ['Capítulo de Teste', `Seção ${pageNumber}.${chunkIndex}`],
    },
    contentKind: 'prose',
    estimatedTokens: Math.ceil(text.length / 4),
    isTokenEstimateHeuristic: true,
    contentHash: `hash_${chunkId}_${text.length}`,
    pipelineVersion: '1.0.0',
    startOffset: 0,
    endOffset: text.length,
    indexingOptionsVersion: '1.0.0',
    storedAt: Date.now(),
  };
}

describe('MISSÃO F1.3 — REGRESSÃO, ESTABILIZAÇÃO E CICLO DE VIDA (ESCOPO A)', () => {
  beforeEach(async () => {
    // Estado inicial limpo
    await revokeConsent();
  });

  afterEach(async () => {
    await revokeConsent();
    disposeDenseWorkerClient();
  });

  /* --------------------------------------------------------------------------
     A1. CONSENTIMENTO E GOVERNANÇA FAIL-CLOSED
     -------------------------------------------------------------------------- */
  test('A1.1: Sem consentimento, Tutor e searchHybrid recaem estritamente em BM25 sem inferência densa', async () => {
    assert.strictEqual(hasConsent(), false);
    const status = getConsentStatus();
    assert.strictEqual(status.granted, false);

    const docId = 'doc_f1_3_a1_noconsent';
    const chunk = createMockChunk(docId, 1, 0, 'A mielinização axonal amplia a velocidade de condução nervosa.');
    await saveDocumentChunks(docId, [chunk]);
    const lexIdx = buildDocumentLexicalIndex(docId, [chunk]);
    await saveLexicalIndex(lexIdx);

    // Chamada explícita solicitando dense, mas sem consentimento
    const res = await searchHybrid('mielinização axonal', {
      documentId: docId,
      enableDense: true,
    });

    assert.strictEqual(res.hybridMode, 'lexical_fallback');
    assert.strictEqual(res.denseMatchesCount, 0);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].chunkId, chunk.chunkId);
    assert(res.results[0].bm25Score! > 0);
  });

  test('A1.2: Ausência de preferência explícita (null) nunca é interpretada como consentimento', () => {
    // Garante remoção total de chave
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
    const status = getConsentStatus();
    assert.strictEqual(status.granted, false);
    assert.strictEqual(status.termsAccepted, false);
    assert.strictEqual(hasConsent(), false);
  });

  test('A1.3: Concessão ativa autoriza canal híbrido e revogação no meio da sessão cessa imediatamente chamadas densas', async () => {
    const docId = 'doc_f1_3_a1_toggle';
    const chunk = createMockChunk(docId, 1, 0, 'Sinapses químicas utilizam neurotransmissores.');
    await saveDocumentChunks(docId, [chunk]);
    const lexIdx = buildDocumentLexicalIndex(docId, [chunk]);
    await saveLexicalIndex(lexIdx);

    // 1. Concede consentimento
    grantConsent();
    assert.strictEqual(hasConsent(), true);

    // Indexa vetores
    await indexDocumentDense(docId, [chunk]);
    const embsBefore = await getDenseEmbeddings(docId);
    assert.strictEqual(embsBefore.length, 1);

    // 2. Consulta com consentimento
    const resWithConsent = await searchHybrid('neurotransmissores', { documentId: docId });
    assert.strictEqual(resWithConsent.hybridMode, 'hybrid_rrf');
    assert.strictEqual(resWithConsent.denseMatchesCount, 1);

    // 3. Revoga consentimento durante a sessão
    await revokeConsent();
    assert.strictEqual(hasConsent(), false);

    // 4. Nova consulta imediatamente após revogação recai para BM25 puro
    const resAfterRevoke = await searchHybrid('neurotransmissores', { documentId: docId });
    assert.strictEqual(resAfterRevoke.hybridMode, 'lexical_fallback');
    assert.strictEqual(resAfterRevoke.denseMatchesCount, 0);

    // 5. Confirma que os vetores do IndexedDB foram expurgados na revogação
    const embsAfter = await getDenseEmbeddings(docId);
    assert.strictEqual(embsAfter.length, 0);
  });

  /* --------------------------------------------------------------------------
     A2. ISOLAMENTO NO WORKER E RESILIÊNCIA A FALHAS
     -------------------------------------------------------------------------- */
  test('A2.1: Falha ou indisponibilidade no motor/worker não trava a aplicação e recai em BM25', async () => {
    grantConsent();
    const docId = 'doc_f1_3_a2_resilience';
    const chunk = createMockChunk(docId, 2, 0, 'O potencial pós-sináptico inibitório hiperpolariza o neurônio.');
    await saveDocumentChunks(docId, [chunk]);
    const lexIdx = buildDocumentLexicalIndex(docId, [chunk]);
    await saveLexicalIndex(lexIdx);

    // Cria um embedding sintético válido para existir vetor no IndexedDB
    const fakeEmbedding: StoredDenseEmbedding = {
      chunkId: chunk.chunkId,
      documentId: docId,
      docId,
      pageNumber: 2,
      embedding: new Array(384).fill(0.05),
      modelVersion: 'multilingual-e5-small-int8-v1',
      dimension: 384,
      tokenizerVersion: 'e5-tokenizer-sentencepiece',
      pooling: 'mean+l2',
      contentHash: chunk.contentHash,
      isSegmented: false,
      segmentsCount: 1,
      storedAt: Date.now(),
    };
    await saveDenseEmbeddings(docId, [fakeEmbedding]);

    // Simula falha do worker injetando um client com método search que falha
    const client = getDenseWorkerClient();
    const originalSearch = client.search;
    (client as any).search = async () => {
      throw new Error('Worker crash simulado (ex.: Out of Memory ou Timeout no navegador)');
    };

    try {
      // searchHybrid não deve propagar erro, mas sim registrar aviso e recair em BM25
      const res = await searchHybrid('hiperpolariza neurônio', { documentId: docId });
      assert.strictEqual(res.hybridMode, 'lexical_fallback');
      assert.strictEqual(res.denseMatchesCount, 0);
      assert.strictEqual(res.results.length, 1);
      assert.strictEqual(res.results[0].chunkId, chunk.chunkId);
    } finally {
      (client as any).search = originalSearch;
    }
  });

  /* --------------------------------------------------------------------------
     A3. INGESTÃO CONDICIONAL, DOCUMENTOS PRÉ-EXISTENTES E ERROS PARCIAIS
     -------------------------------------------------------------------------- */
  test('A3.1: Ingestão densa sem consentimento é sumariamente ignorada (zero embeddings gerados)', async () => {
    assert.strictEqual(hasConsent(), false);
    const docId = 'doc_f1_3_a3_noconsent';
    const chunk = createMockChunk(docId, 1, 0, 'Texto demonstrativo.');

    const res = await indexDocumentDense(docId, [chunk]);
    assert.strictEqual(res.status, 'skipped_no_consent');
    assert.strictEqual(res.chunksCount, 0);

    const embs = await getDenseEmbeddings(docId);
    assert.strictEqual(embs.length, 0);
  });

  test('A3.2: Ativação tardia de semântica indexa documentos pré-existentes sem vetores', async () => {
    // 1. Simula documento importado anteriormente (quando não havia consentimento)
    const docId = 'doc_f1_3_a3_preexisting';
    const chunk = createMockChunk(docId, 3, 0, 'Herbert Simon introduziu o conceito de satisficing em 1956.');
    await saveDocumentChunks(docId, [chunk]);

    const docSource: DocumentSource = {
      id: docId,
      title: 'Tomada de Decisão Herbert Simon',
      totalPages: 5,
      uploadedAt: Date.now(),
      status: 'ready',
      ragStatus: 'indexed',
      ragIndexedChunksCount: 1,
    } as any;
    await saveDocument(docSource);

    // Confirma que não tem vetores
    const embsInitial = await getDenseEmbeddings(docId);
    assert.strictEqual(embsInitial.length, 0);

    // 2. Agora o usuário ativa a busca híbrida (grantConsent)
    grantConsent();

    // 3. Executa a reconciliação automática de documentos não-indexados
    let progressCalls = 0;
    const summary = await indexAllUnindexedDocumentsDense((title, cur, tot, chCur, chTot) => {
      progressCalls++;
      assert(title.includes('Herbert Simon'));
    });

    assert(summary.totalIndexed >= 1);
    assert(summary.totalChunks >= 1);
    assert(progressCalls > 0);

    // 4. Confirma que os vetores foram devidamente criados e persistidos no IndexedDB
    const embsAfter = await getDenseEmbeddings(docId);
    assert.strictEqual(embsAfter.length, 1);
    assert.strictEqual(embsAfter[0].chunkId, chunk.chunkId);
    assert.strictEqual(embsAfter[0].dimension, 384);
  });

  test('A3.3: Erro parcial na vetorização não marca indexação como completed', async () => {
    grantConsent();
    const docId = 'doc_f1_3_a3_partial';
    const c1 = createMockChunk(docId, 1, 0, 'Chunk 1 de 2.');
    const c2 = createMockChunk(docId, 1, 1, 'Chunk 2 de 2.');

    // Simula worker retornando apenas 1 chunk de 2
    const client = getDenseWorkerClient();
    const originalEmbed = client.embedChunks;
    (client as any).embedChunks = async () => {
      const singleEmb: StoredDenseEmbedding = {
        chunkId: c1.chunkId,
        documentId: docId,
        docId,
        pageNumber: 1,
        embedding: new Array(384).fill(0.01),
        modelVersion: 'multilingual-e5-small-int8-v1',
        dimension: 384,
        tokenizerVersion: 'e5',
        pooling: 'mean+l2',
        contentHash: c1.contentHash,
        isSegmented: false,
        segmentsCount: 1,
        storedAt: Date.now(),
      };
      return [singleEmb];
    };

    try {
      const res = await indexDocumentDense(docId, [c1, c2], { force: true });
      assert.strictEqual(res.status, 'failed');
      assert.strictEqual(res.chunksCount, 1);
      assert(res.error?.includes('Indexação parcial'));

      const meta = await getDenseIndexMetadata(docId);
      assert.strictEqual(meta?.status, 'partial');
      assert.strictEqual(meta?.indexedChunks, 1);
      assert.strictEqual(meta?.totalChunks, 2);
    } finally {
      (client as any).embedChunks = originalEmbed;
    }
  });

  /* --------------------------------------------------------------------------
     A4. RECONCILIAÇÃO DE ESTADO E PERSISTÊNCIA PÓS-F5
     -------------------------------------------------------------------------- */
  test('A4.1: Estado persiste e se reconcilia fielmente após F5 (reload)', () => {
    // 1. Inicial: Sem consentimento -> TopBar reflete BM25 Puro
    assert.strictEqual(hasConsent(), false);

    // 2. Concede consentimento
    grantConsent();
    assert.strictEqual(hasConsent(), true);

    // 3. Simula F5: Nova leitura de estado avalia exatamente a persistência em storage
    const reloadedConsent = getConsentStatus();
    assert.strictEqual(reloadedConsent.granted, true);
    assert.strictEqual(reloadedConsent.modelId, E5_MODEL_ID);

    // 4. Revoga e simula novo F5
    revokeConsent();
    const reloadedAfterRevoke = getConsentStatus();
    assert.strictEqual(reloadedAfterRevoke.granted, false);
  });

  /* --------------------------------------------------------------------------
     A5. BUILD E INTEGRIDADE DE ASSETS
     -------------------------------------------------------------------------- */
  test('A5.1: Exportações canônicas e ciclo de vida do Worker client', () => {
    const client = getDenseWorkerClient();
    assert(client instanceof DenseEmbeddingWorkerClient);
    assert.strictEqual(typeof client.initialize, 'function');
    assert.strictEqual(typeof client.embedChunks, 'function');
    assert.strictEqual(typeof client.search, 'function');
    assert.strictEqual(typeof client.dispose, 'function');

    disposeDenseWorkerClient();
    const client2 = getDenseWorkerClient();
    assert(client2 instanceof DenseEmbeddingWorkerClient);
  });
});

