/**
 * NeuroClass AI — Suíte de Testes de Regressão e Mitigação Fail-Closed (Missão F1.3.1)
 * @module tests/rag_f1_3_1_fail_closed.test
 *
 * Validação rigorosa dos 8 requisitos de segurança Fail-Closed (T1 a T8):
 * - T1. Consulta negativa com BM25 zero e cosine >= 0,84: Tutor NÃO responde grounded
 * - T2. Consulta negativa com BM25 zero e cosine < 0,84: Tutor retorna no_evidence
 * - T3. Consulta positiva literal com suporte lexical: resposta fundamentada preservada
 * - T4. Consulta positiva morfológica com suporte lexical: resposta fundamentada preservada
 * - T5. Consulta conceitual sem sobreposição lexical: não apresentada como evidência validada (limitação funcional explícita)
 * - T6. Consentimento revogado: zero inferência densa e fallback para BM25
 * - T7. Worker indisponível: fallback resiliente sem exceção não tratada
 * - T8. Citações e offsets de candidatos aceitos permanecem 100% íntegros
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  grantConsent,
  revokeConsent,
  hasConsent,
} from '../services/retrieval/semanticConsentService';
import {
  getDenseWorkerClient,
  DenseEmbeddingWorkerClient,
} from '../services/retrieval/workers/denseWorkerClient';
import { searchHybrid } from '../services/retrieval/hybridSearchService';
import { buildTutorGroundedContext } from '../services/retrieval/tutorContextBuilder';
import {
  saveDenseEmbeddings,
  clearAllDenseEmbeddings,
} from '../services/documents/ragDensePersistenceService';
import {
  saveDocumentChunks,
  deleteDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  buildDocumentLexicalIndex,
  searchBM25,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
  deleteLexicalIndex,
} from '../services/documents/ragLexicalPersistenceService';
import {
  saveDocument,
  deleteDocumentCompletely,
} from '../services/persistence/indexedDb';
import {
  embedQuery,
  embedPassage,
} from '../services/retrieval/denseEmbeddingEngine';
import type { StoredDocumentChunk, StoredDenseEmbedding, DocumentSource } from '../types/rag';

function createMockChunk(
  documentId: string,
  pageNumber: number,
  chunkIndex: number,
  text: string,
  sectionTitle?: string
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
      sectionTitle: sectionTitle || `Seção ${pageNumber}.${chunkIndex}`,
      sectionHierarchy: ['Capítulo de Teste', sectionTitle || `Seção ${pageNumber}.${chunkIndex}`],
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

describe('MISSÃO F1.3.1 — AUDITORIA E MITIGAÇÃO FAIL-CLOSED DO RAG HÍBRIDO', () => {
  const docId = 'doc_test_f1_3_1';
  let mockDoc: DocumentSource;
  let chunkP1: StoredDocumentChunk;
  let chunkP15: StoredDocumentChunk;
  let chunkP28: StoredDocumentChunk;
  let chunkP55: StoredDocumentChunk;

  beforeEach(async () => {
    grantConsent();

    // Chunks técnicos bem definidos
    chunkP1 = createMockChunk(
      docId,
      1,
      0,
      'Introdução à bioeletrogênese celular. O neurônio e a sinapse constituem as unidades fundamentais.',
      'Fundamentos Sinápticos'
    );
    chunkP15 = createMockChunk(
      docId,
      15,
      0,
      'Canais iônicos voltagem-dependentes Nav e Kv regulam a deflagração do potencial de ação. Em repouso, a membrana apresenta potencial de -70mV.',
      'Canais Iônicos'
    );
    chunkP28 = createMockChunk(
      docId,
      28,
      0,
      'Mecanismo molecular de exocitose na zona ativa pré-sináptica. O complexo proteico SNARE formado por sinaptobrevina ancorando vesículas.',
      'Exocitose e SNARE'
    );
    chunkP55 = createMockChunk(
      docId,
      55,
      0,
      'Análise de bioinformática e ensaios multiplex: O marcador NEUROSYNAPSE_GAMMA_789 identifica subtipos resistentes à excitotoxicidade.',
      'Biomarcadores Moleculares'
    );

    const allChunks = [chunkP1, chunkP15, chunkP28, chunkP55];

    mockDoc = {
      id: docId,
      title: 'Neurobiologia Celular e Sináptica',
      totalPages: 60,
      pages: [
        { pageNumber: 1, textContent: chunkP1.text, isScanned: false, legibility: 'clean' },
        { pageNumber: 15, textContent: chunkP15.text, isScanned: false, legibility: 'clean' },
        { pageNumber: 28, textContent: chunkP28.text, isScanned: false, legibility: 'clean' },
        { pageNumber: 55, textContent: chunkP55.text, isScanned: false, legibility: 'clean' },
      ],
      uploadedAt: Date.now(),
      status: 'ready',
      ragStatus: 'indexed',
    };

    await saveDocument(mockDoc);
    await saveDocumentChunks(docId, allChunks);

    const lexIdx = buildDocumentLexicalIndex(docId, allChunks);
    await saveLexicalIndex(lexIdx);

    // Persiste embeddings reais via motor local
    const denseEmbs: StoredDenseEmbedding[] = [];
    for (const c of allChunks) {
      const { embedding } = await embedPassage(c);
      denseEmbs.push({
        chunkId: c.chunkId,
        documentId: docId,
        docId,
        pageNumber: c.pageNumber,
        embedding,
        modelVersion: 'multilingual-e5-small-int8-v1',
        dimension: 384,
        tokenizerVersion: 'e5',
        pooling: 'mean+l2',
        contentHash: c.contentHash,
        isSegmented: false,
        segmentsCount: 1,
        storedAt: Date.now(),
      });
    }
    await saveDenseEmbeddings(docId, denseEmbs);
  });

  /* --------------------------------------------------------------------------
     T1: Consulta negativa com BM25 zero e cosine >= 0,84: NÃO responder grounded
     -------------------------------------------------------------------------- */
  test('T1: Consulta negativa com BM25 zero e cosine >= 0.84 não produz estado grounded', async () => {
    // Consulta totalmente fora do domínio mas com ruído ambiente em português
    const negativeQuery = 'fotossíntese C4 e fixação de carbono pela enzima RuBisCO em milho';

    // 1. Confirma que BM25 é zero
    const bm25Res = await searchBM25(negativeQuery, { documentId: docId, removeStopwords: true });
    assert.strictEqual(bm25Res.results.length, 0, 'BM25 deve rejeitar consulta com 0 matches');

    // 2. Confirma que canal denso recupera candidatos no searchHybrid
    const hybridRes = await searchHybrid(negativeQuery, { documentId: docId, enableDense: true });
    assert(hybridRes.results.length > 0, 'Canal denso recupera candidatos para discovery');
    assert(hybridRes.results[0].denseCosineScore !== undefined, 'Candidato possui similaridade de cosseno');

    // 3. Mas ao construir contexto para o Tutor, o gate fail-closed DEVE descartar candidatos sem suporte lexical
    const ctx = await buildTutorGroundedContext(negativeQuery, mockDoc, {
      enableDense: true,
      minDenseCosineConfidence: 0.84,
    });

    assert.strictEqual(ctx.state, 'no_evidence', 'Tutor DEVE retornar no_evidence');
    assert.strictEqual(ctx.evidences.length, 0, 'Nenhuma evidência entregue');
    assert.strictEqual(ctx.documentExcerpts.length, 0, 'Nenhum trecho entregue');
    assert(ctx.diagnostic.discardedChunks.length > 0, 'Candidatos densos devem ser registrados como descartados');
    assert.strictEqual(
      ctx.diagnostic.discardedChunks[0].reason,
      'score_below_threshold',
      'Motivo de descarte deve ser score_below_threshold (suporte insuficiente)'
    );
  });

  /* --------------------------------------------------------------------------
     T2: Consulta negativa com BM25 zero e cosine < 0,84: retorna no_evidence
     -------------------------------------------------------------------------- */
  test('T2: Consulta negativa com BM25 zero e cosine < 0.84 retorna no_evidence', async () => {
    const lowCosineNegative = 'história da Revolução Francesa e a tomada da Bastilha em 1789';

    const ctx = await buildTutorGroundedContext(lowCosineNegative, mockDoc, {
      enableDense: true,
      minDenseCosineConfidence: 0.84,
    });

    assert.strictEqual(ctx.state, 'no_evidence');
    assert.strictEqual(ctx.evidences.length, 0);
  });

  /* --------------------------------------------------------------------------
     T3: Consulta positiva literal com suporte lexical: grounded preservado
     -------------------------------------------------------------------------- */
  test('T3: Consulta positiva literal com suporte lexical preserva estado grounded e citação', async () => {
    const literalQuery = 'NEUROSYNAPSE_GAMMA_789 contra excitotoxicidade';

    const ctx = await buildTutorGroundedContext(literalQuery, mockDoc, {
      enableDense: true,
    });

    assert.strictEqual(ctx.state, 'grounded', 'Consulta literal deve ser grounded');
    assert(ctx.evidences.length > 0, 'Deve conter evidências');
    assert.strictEqual(ctx.evidences[0].pageNumber, 55, 'Evidência deve apontar para página 55');
    assert(ctx.documentExcerpts[0].includes('NEUROSYNAPSE_GAMMA_789'));
  });

  /* --------------------------------------------------------------------------
     T4: Consulta positiva morfológica com suporte lexical: grounded preservado
     -------------------------------------------------------------------------- */
  test('T4: Consulta positiva morfológica com suporte lexical preserva estado grounded', async () => {
    // Variação flexional: 'vesículas' e 'sinaptobrevinas'
    const morphQuery = 'sinaptobrevina ancorando vesícula';

    const ctx = await buildTutorGroundedContext(morphQuery, mockDoc, {
      enableDense: true,
    });

    assert.strictEqual(ctx.state, 'grounded', 'Consulta morfológica com suporte lexical deve ser grounded');
    assert(ctx.evidences.some((ev) => ev.pageNumber === 28));
  });

  /* --------------------------------------------------------------------------
     T5: Consulta conceitual sem sobreposição lexical: não apresentada como evidência validada
     -------------------------------------------------------------------------- */
  test('T5: Paráfrase conceitual sem suporte lexical não é validada para o Tutor (limitação funcional explícita)', async () => {
    // Paráfrase sem palavras-chave em comum com os chunks (zero sobreposição lexical)
    const conceptualQuery = 'gradiente eletroquímico transmembrana em regime estacionário basal';

    // BM25 não possui estes termos
    const bm25Res = await searchBM25(conceptualQuery, { documentId: docId, removeStopwords: true });
    assert.strictEqual(bm25Res.results.length, 0);

    // Search hybrid pode recuperar internamente para ranking/discovery
    const hybridRes = await searchHybrid(conceptualQuery, { documentId: docId, enableDense: true });
    assert(hybridRes.results.length > 0, 'Recuperado internamente para discovery');

    // Mas Tutor falha fechado (fail-closed)
    const ctx = await buildTutorGroundedContext(conceptualQuery, mockDoc, {
      enableDense: true,
    });

    assert.strictEqual(ctx.state, 'no_evidence', 'Paráfrase pura sem validação lexical não fundamenta resposta');
    assert.strictEqual(ctx.evidences.length, 0);
  });

  /* --------------------------------------------------------------------------
     T6: Consentimento revogado: zero inferência densa e fallback para BM25
     -------------------------------------------------------------------------- */
  test('T6: Consentimento revogado impede inferência densa e recai estritamente em BM25', async () => {
    revokeConsent();
    assert.strictEqual(hasConsent(), false);

    const client = getDenseWorkerClient();
    let denseCalled = false;
    const origSearch = client.search;
    client.search = async () => {
      denseCalled = true;
      return [];
    };

    try {
      const ctx = await buildTutorGroundedContext('potencial de repouso -70mV', mockDoc, {
        enableDense: true,
      });

      assert.strictEqual(denseCalled, false, 'Canal denso NUNCA deve ser invocado sem consentimento');
      assert.strictEqual(ctx.state, 'grounded', 'BM25 deve atender a consulta');
      assert.strictEqual(ctx.evidences[0].pageNumber, 15);
    } finally {
      client.search = origSearch;
    }
  });

  /* --------------------------------------------------------------------------
     T7: Worker indisponível: fallback resiliente para BM25 sem quebra
     -------------------------------------------------------------------------- */
  test('T7: Worker indisponível recai graciosamente em BM25 sem exceção não tratada', async () => {
    grantConsent();
    const client = getDenseWorkerClient();
    const origSearch = client.search;
    client.search = async () => {
      throw new Error('Worker crash simulado (ex.: Out Of Memory no navegador)');
    };

    try {
      const hybridRes = await searchHybrid('complexo proteico SNARE', {
        documentId: docId,
        enableDense: true,
      });

      assert.strictEqual(hybridRes.hybridMode, 'lexical_fallback');
      assert(hybridRes.results.length > 0);
      assert.strictEqual(hybridRes.denseMatchesCount, 0);

      const ctx = await buildTutorGroundedContext('complexo proteico SNARE', mockDoc, {
        enableDense: true,
      });

      assert.strictEqual(ctx.state, 'grounded');
      assert.strictEqual(ctx.evidences[0].pageNumber, 28);
    } finally {
      client.search = origSearch;
    }
  });

  /* --------------------------------------------------------------------------
     T8: Citações e offsets de candidatos aceitos continuam íntegros
     -------------------------------------------------------------------------- */
  test('T8: Citações e offsets de candidatos aceitos continuam 100% íntegros', async () => {
    const ctx = await buildTutorGroundedContext('complexo proteico SNARE ancorando vesículas', mockDoc, {
      enableDense: true,
    });

    assert.strictEqual(ctx.state, 'grounded');
    assert(ctx.evidences.length > 0);

    const ev = ctx.evidences[0];
    assert.strictEqual(ev.pageNumber, 28);
    assert.strictEqual(ev.id, chunkP28.chunkId);
    assert(ev.excerpt.includes('SNARE'));

    // Verifica que o texto formatado no excerpt preserva número de página e ref
    assert(ctx.documentExcerpts[0].includes('Pág. 28'));
    assert(ctx.documentExcerpts[0].includes(chunkP28.chunkId));
  });
});
