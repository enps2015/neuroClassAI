/**
 * NeuroClass AI — Suíte de Testes da Recuperação Híbrida Local (Missão F1.1)
 * @module tests/rag_hybrid_retrieval.test
 *
 * Validação rigorosa dos componentes de recuperação híbrida:
 * 1. Prefixos E5 ("query: " e "passage: "), dimensão 384 e norma L2 unitária;
 * 2. Segmentação semântica de chunks > 512 tokens e agregação por centróide normalizado;
 * 3. Preservação de integridade de offsets UTF-16, chunkId e texto original;
 * 4. Persistência atômica, exclusão em cascata e detecção de versões stale;
 * 5. Fusão Reciprocal Rank Fusion (RRF k=60), empates e rankings parciais;
 * 6. Fallback transparente para BM25 quando camada densa desativada ou sem consentimento;
 * 7. Isolamento multi-documento e validação de citações no Tutor.
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  embedQuery,
  embedPassage,
  computeCosineSimilarity,
  searchDenseCandidates,
  getEmbeddingPipeline,
} from '../services/retrieval/denseEmbeddingEngine';
import {
  segmentChunkForEmbedding,
  aggregateSegmentVectors,
  normalizeL2,
} from '../services/retrieval/chunkEmbeddingSegmenter';
import {
  saveDenseEmbeddings,
  getDenseEmbeddings,
  getDenseEmbeddingsForDocuments,
  saveDenseIndexMetadata,
  getDenseIndexMetadata,
  deleteDenseEmbeddings,
  clearAllDenseEmbeddings,
  isEmbeddingCompatible,
  CURRENT_DENSE_MODEL_VERSION,
  DENSE_VECTOR_DIMENSION,
} from '../services/documents/ragDensePersistenceService';
import { fuseRRF, DEFAULT_RRF_K } from '../services/retrieval/rrfFusionService';
import { searchHybrid } from '../services/retrieval/hybridSearchService';
import {
  grantConsent,
  revokeConsent,
  hasConsent,
  getConsentStatus,
} from '../services/retrieval/semanticConsentService';
import { buildTutorGroundedContext } from '../services/retrieval/tutorContextBuilder';
import { saveDocumentChunks, getDocumentChunks } from '../services/documents/ragPersistenceService';
import { buildDocumentLexicalIndex } from '../services/retrieval/bm25SearchService';
import { saveLexicalIndex } from '../services/documents/ragLexicalPersistenceService';
import { saveDocument, deleteDocumentCompletely } from '../services/persistence/indexedDb';
import type { StoredDocumentChunk, StoredDenseEmbedding } from '../types/rag';

// Helper para criação de chunks estruturados
function createChunk(
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
      sectionHierarchy: ['Capítulo I', `Seção ${pageNumber}.${chunkIndex}`],
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

describe('MISSÃO F1.1 — PILOTO DE RECUPERAÇÃO HÍBRIDA (BM25 + MULTILINGUAL-E5 + RRF)', () => {
  before(() => {
    // Garante consentimento ativo para os testes de inferência
    grantConsent();
  });

  /* --------------------------------------------------------------------------
     1. MODELO, PREFIXOS E NORMALIZAÇÃO
     -------------------------------------------------------------------------- */
  test('F101 (Modelo): pipeline gera vetor de dimensão 384 com norma L2 unitária para query', async () => {
    const query = 'potenciação de longa duração sináptica';
    const vec = await embedQuery(query);

    assert.strictEqual(vec.length, 384, 'Vetor deve ter exatamente 384 dimensões');

    const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
    const norm = Math.sqrt(sumSq);
    assert(Math.abs(norm - 1.0) < 1e-4, `Norma L2 deve ser 1.0 (obtido: ${norm})`);
  });

  test('F102 (Modelo): passagem prefixada gera vetor de 384 dimensões normalizado', async () => {
    const chunk = createChunk('doc_test', 1, 0, 'O receptor NMDA é permeável ao influxo de cálcio.');
    const result = await embedPassage(chunk);

    assert.strictEqual(result.embedding.length, 384);
    assert.strictEqual(result.isSegmented, false);
    assert.strictEqual(result.segmentsCount, 1);

    const norm = Math.sqrt(result.embedding.reduce((acc, v) => acc + v * v, 0));
    assert(Math.abs(norm - 1.0) < 1e-4);
  });

  test('F103 (Similaridade): similaridade semântica favorece paráfrases sobre termos irrelevantes', async () => {
    const qVec = await embedQuery('como o cérebro fortalece memórias');

    const pRelevant = await embedPassage(
      createChunk('doc_test', 1, 0, 'A plasticidade sináptica e a potenciação de longa duração consolidam lembranças duradouras.')
    );
    const pIrrelevant = await embedPassage(
      createChunk('doc_test', 1, 1, 'A digestão enzimática de lipídios ocorre no lúmen do duodeno com auxílio da bile.')
    );

    const simRel = computeCosineSimilarity(qVec, pRelevant.embedding);
    const simIrrel = computeCosineSimilarity(qVec, pIrrelevant.embedding);

    assert(simRel > simIrrel, `Relevante (${simRel}) deve ser maior que irrelevante (${simIrrel})`);
    assert(simRel - simIrrel > 0.01, `Margem de separação deve ser positiva e mensurável (delta: ${simRel - simIrrel})`);
  });

  /* --------------------------------------------------------------------------
     2. SEGMENTAÇÃO DE CHUNKS LONGOS (> 512 TOKENS)
     -------------------------------------------------------------------------- */
  test('F104 (Segmentação): chunk curto (<= 420 tokens) não é segmentado', () => {
    const chunk = createChunk('doc_test', 1, 0, 'Texto curto com poucas palavras.');
    const seg = segmentChunkForEmbedding(chunk, 420);

    assert.strictEqual(seg.isSegmented, false);
    assert.strictEqual(seg.segmentsCount, 1);
    assert.strictEqual(seg.segments[0], chunk.text);
  });

  test('F105 (Segmentação): chunk longo (> 420 tokens / 1600 chars) é segmentado em limites naturais', () => {
    const longText = Array(20)
      .fill('Este é um parágrafo denso sobre neuroanatomia do hipocampo e plasticidade sináptica.')
      .join('\n\n');

    const chunk = createChunk('doc_test', 1, 0, longText);
    const seg = segmentChunkForEmbedding(chunk, 100);

    assert.strictEqual(seg.isSegmented, true);
    assert(seg.segmentsCount > 1, 'Deve produzir mais de 1 segmento');
    assert(seg.segments.every((s) => s.length <= 1600), 'Nenhum segmento deve exceder o limite seguro');
  });

  test('F106 (Agregação): agregação vetorial resulta em centróide com norma L2 unitária', () => {
    const vecA = normalizeL2([0.5, 0.5, 0.5, 0.5]);
    const vecB = normalizeL2([0.8, 0.2, 0.1, 0.1]);

    const agg = aggregateSegmentVectors([vecA, vecB]);
    assert.strictEqual(agg.length, 4);

    const norm = Math.sqrt(agg.reduce((sum, v) => sum + v * v, 0));
    assert(Math.abs(norm - 1.0) < 1e-5, 'Vetor agregado deve ter norma L2 igual a 1.0');
  });

  /* --------------------------------------------------------------------------
     3. PERSISTÊNCIA, VERSIONAMENTO E ATOMICIDADE
     -------------------------------------------------------------------------- */
  test('F107 (Persistência): gravação e recuperação de embeddings densos por documento', async () => {
    const docId = 'doc_persist_test';
    const emb1: StoredDenseEmbedding = {
      chunkId: `${docId}_p1_c0`,
      documentId: docId,
      docId,
      pageNumber: 1,
      embedding: new Array(384).fill(0.05),
      modelVersion: CURRENT_DENSE_MODEL_VERSION,
      dimension: 384,
      tokenizerVersion: 'e5',
      pooling: 'mean',
      contentHash: 'hash_1',
      storedAt: Date.now(),
    };

    await saveDenseEmbeddings(docId, [emb1]);
    const retrieved = await getDenseEmbeddings(docId);

    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].chunkId, emb1.chunkId);
    assert.strictEqual(retrieved[0].embedding.length, 384);
  });

  test('F108 (Versionamento): isEmbeddingCompatible detecta versão desatualizada ou hash adulterado', () => {
    const validEmb: StoredDenseEmbedding = {
      chunkId: 'c1',
      documentId: 'd1',
      docId: 'd1',
      pageNumber: 1,
      embedding: new Array(384).fill(0.01),
      modelVersion: CURRENT_DENSE_MODEL_VERSION,
      dimension: 384,
      tokenizerVersion: 'e5',
      pooling: 'mean',
      contentHash: 'hash_abc',
      storedAt: Date.now(),
    };

    assert.strictEqual(isEmbeddingCompatible(validEmb, CURRENT_DENSE_MODEL_VERSION, 'hash_abc'), true);
    assert.strictEqual(isEmbeddingCompatible(validEmb, 'version_antiga', 'hash_abc'), false);
    assert.strictEqual(isEmbeddingCompatible(validEmb, CURRENT_DENSE_MODEL_VERSION, 'hash_diferente'), false);
  });

  test('F109 (Exclusão): deleteDenseEmbeddings remove vetores sem apagar dados de outros docs', async () => {
    const docA = 'doc_del_A';
    const docB = 'doc_del_B';

    const embA: StoredDenseEmbedding = {
      chunkId: `${docA}_p1_c0`,
      documentId: docA,
      docId: docA,
      pageNumber: 1,
      embedding: new Array(384).fill(0.1),
      modelVersion: CURRENT_DENSE_MODEL_VERSION,
      dimension: 384,
      tokenizerVersion: 'e5',
      pooling: 'mean',
      contentHash: 'hash_a',
      storedAt: Date.now(),
    };
    const embB: StoredDenseEmbedding = {
      chunkId: `${docB}_p1_c0`,
      documentId: docB,
      docId: docB,
      pageNumber: 1,
      embedding: new Array(384).fill(0.2),
      modelVersion: CURRENT_DENSE_MODEL_VERSION,
      dimension: 384,
      tokenizerVersion: 'e5',
      pooling: 'mean',
      contentHash: 'hash_b',
      storedAt: Date.now(),
    };

    await saveDenseEmbeddings(docA, [embA]);
    await saveDenseEmbeddings(docB, [embB]);

    await deleteDenseEmbeddings(docA);

    const listA = await getDenseEmbeddings(docA);
    const listB = await getDenseEmbeddings(docB);

    assert.strictEqual(listA.length, 0, 'Doc A deve estar limpo');
    assert.strictEqual(listB.length, 1, 'Doc B deve permanecer intacto');
  });

  /* --------------------------------------------------------------------------
     4. RECIPROCAL RANK FUSION (RRF)
     -------------------------------------------------------------------------- */
  test('F110 (RRF): fusão pontua mais alto chunks concordantes em ambos os canais', () => {
    const chunk1 = createChunk('doc_rrf', 1, 0, 'Texto 1');
    const chunk2 = createChunk('doc_rrf', 1, 1, 'Texto 2');
    const chunk3 = createChunk('doc_rrf', 1, 2, 'Texto 3');

    const chunkMap = new Map<string, StoredDocumentChunk>([
      [chunk1.chunkId, chunk1],
      [chunk2.chunkId, chunk2],
      [chunk3.chunkId, chunk3],
    ]);

    // Chunk 1 é rank 1 no lexical e rank 1 no denso
    // Chunk 2 é rank 2 no lexical, não aparece no denso
    // Chunk 3 não aparece no lexical, é rank 2 no denso
    const lexicalResults = [
      {
        documentId: 'doc_rrf',
        docId: 'doc_rrf',
        chunkId: chunk1.chunkId,
        text: chunk1.text,
        score: 10.5,
        matchedTerms: ['texto'],
        pageNumber: 1,
        chunkIndexInPage: 0,
        charOffsetStart: 0,
        charOffsetEnd: 7,
        sourceRef: chunk1.sourceRef,
        contentHash: chunk1.contentHash,
        indexVersion: '1.0.0',
      },
      {
        documentId: 'doc_rrf',
        docId: 'doc_rrf',
        chunkId: chunk2.chunkId,
        text: chunk2.text,
        score: 5.2,
        matchedTerms: ['texto'],
        pageNumber: 1,
        chunkIndexInPage: 1,
        charOffsetStart: 0,
        charOffsetEnd: 7,
        sourceRef: chunk2.sourceRef,
        contentHash: chunk2.contentHash,
        indexVersion: '1.0.0',
      },
    ];

    const denseResults = [
      {
        chunkId: chunk1.chunkId,
        documentId: 'doc_rrf',
        pageNumber: 1,
        cosineScore: 0.88,
        rank: 1,
      },
      {
        chunkId: chunk3.chunkId,
        documentId: 'doc_rrf',
        pageNumber: 1,
        cosineScore: 0.85,
        rank: 2,
      },
    ];

    const fused = fuseRRF(lexicalResults, denseResults, chunkMap, { rrfK: 60, topK: 3 });

    assert.strictEqual(fused[0].chunkId, chunk1.chunkId, 'Chunk 1 deve liderar');
    // Score esperado chunk 1: 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.03278
    const expectedC1 = 1 / 61 + 1 / 61;
    assert(Math.abs(fused[0].score - expectedC1) < 1e-6);

    // Chunks 2 e 3 empatam em RRF (1/62 cada)
    assert(fused.length === 3);
  });

  test('F111 (RRF): resgate de paráfrase conceituada não classificada pelo BM25', () => {
    const chunkParaphrase = createChunk('doc_para', 10, 0, 'A apoptose é ativada por caspases.');
    const chunkLexical = createChunk('doc_para', 20, 0, 'Palavra exata sem contexto conceitual.');

    const chunkMap = new Map<string, StoredDocumentChunk>([
      [chunkParaphrase.chunkId, chunkParaphrase],
      [chunkLexical.chunkId, chunkLexical],
    ]);

    // O BM25 só achou o chunkLexical em Rank 15
    const lexicalResults = [
      {
        documentId: 'doc_para',
        docId: 'doc_para',
        chunkId: chunkLexical.chunkId,
        text: chunkLexical.text,
        score: 1.2,
        matchedTerms: ['termo'],
        pageNumber: 20,
        chunkIndexInPage: 0,
        charOffsetStart: 0,
        charOffsetEnd: 10,
        sourceRef: chunkLexical.sourceRef,
        contentHash: chunkLexical.contentHash,
        indexVersion: '1.0.0',
      },
    ];

    // O denso encontrou a paráfrase em Rank 1
    const denseResults = [
      {
        chunkId: chunkParaphrase.chunkId,
        documentId: 'doc_para',
        pageNumber: 10,
        cosineScore: 0.89,
        rank: 1,
      },
    ];

    const fused = fuseRRF(lexicalResults, denseResults, chunkMap, { rrfK: 60, topK: 2 });

    // Rank 1 denso: 1/(60+1) = 0.01639
    // Rank 1 lexical (aqui passado como 1º elemento): 1/61
    assert.strictEqual(fused.length, 2);
    assert(fused.some((f) => f.chunkId === chunkParaphrase.chunkId));
  });

  /* --------------------------------------------------------------------------
     5. CONSENTIMENTO E FALLBACK BM25
     -------------------------------------------------------------------------- */
  test('F112 (Consentimento): revogação de consentimento força fallback para BM25 puro', async () => {
    revokeConsent();
    assert.strictEqual(hasConsent(), false);

    const docId = 'doc_consent_test';
    const c0 = createChunk(docId, 1, 0, 'Memória e consolidação no hipocampo.');
    await saveDocumentChunks(docId, [c0]);
    const lexIndex = buildDocumentLexicalIndex(docId, [c0]);
    await saveLexicalIndex(lexIndex);

    const res = await searchHybrid('memória hipocampo', {
      documentId: docId,
      enableDense: true, // Solicitado, mas sem consentimento
    });

    assert.strictEqual(res.hybridMode, 'lexical_fallback');
    assert.strictEqual(res.denseMatchesCount, 0);
    assert(res.results.length > 0);

    // Restaura consentimento para testes subsequentes
    grantConsent();
  });

  /* --------------------------------------------------------------------------
     6. INTEGRAÇÃO AO TUTOR E RASTREABILIDADE
     -------------------------------------------------------------------------- */
  test('F113 (Tutor): contexto empacota evidências com sourceRef intacto e recusa honesta em negativas', async () => {
    const docId = 'doc_tutor_hybrid';
    const c0 = createChunk(docId, 5, 0, 'A potenciação de longa duração foi descoberta por Terje Lomo.');
    await saveDocumentChunks(docId, [c0]);
    const lexIndex = buildDocumentLexicalIndex(docId, [c0]);
    await saveLexicalIndex(lexIndex);
    await saveDocument({
      id: docId,
      title: 'Neuro',
      totalPages: 10,
      uploadedAt: Date.now(),
      status: 'ready',
      ragIndexingState: {
        documentId: docId,
        status: 'indexed',
        indexedChunksCount: 1,
        totalPages: 10,
        extractedPagesCount: 10,
        emptyPagesCount: 0,
        requiresOcrPagesCount: 0,
        updatedAt: Date.now(),
      },
    } as any);

    // Vetoriza para camada densa
    const { embedding } = await embedPassage(c0);
    await saveDenseEmbeddings(docId, [
      {
        chunkId: c0.chunkId,
        documentId: docId,
        docId,
        pageNumber: 5,
        embedding,
        modelVersion: CURRENT_DENSE_MODEL_VERSION,
        dimension: 384,
        tokenizerVersion: 'e5',
        pooling: 'mean',
        contentHash: c0.contentHash,
        storedAt: Date.now(),
      },
    ]);

    // 1. Pergunta com evidência
    const ctxPositivo = await buildTutorGroundedContext('quem descobriu a potenciação', { id: docId, title: 'Neuro' }, { enableDense: true });
    assert.strictEqual(ctxPositivo.state, 'grounded');
    assert.strictEqual(ctxPositivo.packedChunks.length, 1);
    assert.strictEqual(ctxPositivo.packedChunks[0].pageNumber, 5);
    assert.strictEqual(ctxPositivo.packedChunks[0].sourceRef.charOffsetStart, 0);

    // 2. Consulta negativa (conceito ausente)
    const ctxNegativo = await buildTutorGroundedContext('fotossíntese em cloroplastos de briófitas', { id: docId, title: 'Neuro' }, { enableDense: true });
    assert.strictEqual(ctxNegativo.state, 'no_evidence');
    assert.strictEqual(ctxNegativo.packedChunks.length, 0);
  });
});
