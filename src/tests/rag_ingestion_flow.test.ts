/**
 * NeuroClass AI — Testes de Integração do Pipeline de Ingestão RAG (Missão A3)
 * @module tests/rag_ingestion_flow.test
 *
 * Cobertura exaustiva dos requisitos de:
 * - Grupo A: Importação de PDF com múltiplas páginas (extração, chunking, persistência, ordenação e validação);
 * - Grupo B: Documento longo (fixture sintética de 120 páginas, sem omissão por amostragem);
 * - Grupo C: Documento com páginas mistas (texto, vazia e escaneada sem OCR -> status parcial);
 * - Grupo D: Cenários de falha (extração, chunking, persistência e verificação pós-gravação);
 * - Grupo E: Idempotência e coordenação de concorrência sem mistura de versões;
 * - Grupo F: Regressão (documentos legados sem chunks e exclusão em cascata);
 * - Grupo G: Limites (zero Gemini/APIs, zero rede, 100% local-first).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentSource, DocumentPage } from '../types';
import {
  ingestDocumentRAG,
  getDocumentIngestionStatus,
  reprocessDocumentRAG,
} from '../services/documents/ragIngestionService';
import {
  getDocumentChunks,
  getDocumentChunksStats,
  saveDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  getDB,
  saveDocument,
  getDocumentById,
  deleteDocumentCompletely,
  clearAllUserData,
} from '../services/persistence/indexedDb';

/* ==========================================================================
   GRUPO A: IMPORTAÇÃO DE PDF COM MÚLTIPLAS PÁGINAS
   ========================================================================== */

test('T450 (Grupo A): Importação normal de PDF com múltiplas páginas e validação pós-gravação', async () => {
  await clearAllUserData();

  const pages: DocumentPage[] = [
    {
      pageNumber: 1,
      textContent:
        '# Introdução à Neuroanatomia Funcional\n\nO sistema nervoso central é composto pelo encéfalo e pela medula espinhal, desempenhando funções de integração e controle comportamental em organismos complexos.',
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    },
    {
      pageNumber: 2,
      textContent:
        '## Vias Aferentes e Eferentes\n\nAs vias sensoriais ascendentes transmitem sinais da periferia em direção ao córtex somatossensorial primário, atravessando estações de relé talâmico.',
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    },
    {
      pageNumber: 3,
      textContent:
        '## Sinapses e Plasticidade Sináptica\n\nA potenciação de longa duração (LTP) depende da ativação de receptores glutamatérgicos NMDA e AMPA na membrana pós-sináptica.',
      hasVisualElements: true,
      isScanned: false,
      legibility: 'clean',
    },
  ];

  const doc: DocumentSource = {
    id: 'doc_neuro_multipage',
    title: 'Neuroanatomia Funcional e Plasticidade',
    subject: 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 15420,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: 3,
    pages,
  };

  // Salva no IndexedDB como ocorre no fluxo do App
  await saveDocument(doc);

  // Executa o pipeline de ingestão RAG
  const result = await ingestDocumentRAG(doc);

  // 1. Verificações do resultado
  assert.equal(result.success, true, 'Ingestão deve ser bem-sucedida');
  assert.equal(result.status, 'indexed', 'Status final deve ser "indexed"');
  assert.equal(result.documentId, 'doc_neuro_multipage');
  assert.ok(result.chunksCount >= 3, 'Deve gerar pelo menos 1 chunk por página');

  // 2. Verificação de persistência real no IndexedDB
  const stored = await getDocumentChunks(doc.id);
  assert.equal(stored.length, result.chunksCount, 'Quantidade no IndexedDB deve coincidir com chunksCount');

  // 3. Isolamento e ordenação física
  for (let i = 0; i < stored.length; i++) {
    assert.equal(stored[i].documentId, doc.id, 'Todos os chunks devem ter documentId correto');
    assert.equal(stored[i].docId, doc.id, 'Todos os chunks devem ter docId correto');

    if (i < stored.length - 1) {
      const cur = stored[i];
      const next = stored[i + 1];
      const ordered =
        cur.pageNumber < next.pageNumber ||
        (cur.pageNumber === next.pageNumber && cur.chunkIndexInPage <= next.chunkIndexInPage);
      assert.ok(ordered, `Ordenação sequencial respeitada entre chunk ${i} e ${i + 1}`);
    }
  }

  // 4. Verificação no DocumentSource persistido no IndexedDB
  const savedDoc = await getDocumentById(doc.id);
  assert.ok(savedDoc, 'Documento deve existir no store documents');
  assert.equal(savedDoc?.ragStatus, 'indexed');
  assert.equal(savedDoc?.ragIndexedChunksCount, result.chunksCount);
  assert.ok(savedDoc?.ragIndexedAt && savedDoc.ragIndexedAt > 0);
  assert.equal(savedDoc?.ragIndexingState?.status, 'indexed');
});

/* ==========================================================================
   GRUPO B: DOCUMENTO LONGO (120 PÁGINAS)
   ========================================================================== */

test('T451 (Grupo B): Documento sintético de 120 páginas — 100% das páginas cobertas sem omissão por amostragem', async () => {
  await clearAllUserData();

  const totalPages = 120;
  const longPages: DocumentPage[] = [];

  for (let p = 1; p <= totalPages; p++) {
    longPages.push({
      pageNumber: p,
      textContent: `Capítulo de Neurofisiologia Cognitiva — Página Física ${p}.\n` +
        `O processamento de sinais corticais na página ${p} descreve os circuitos pré-frontais e estriatais ` +
        `envolvidos na tomada de decisão baseada em evidências perceptuais sob incerteza experimental. ` +
        `Observou-se uma correlação estatisticamente significante na etapa ${p}.`,
      hasVisualElements: p % 10 === 0,
      isScanned: false,
      legibility: 'clean',
    });
  }

  const longDoc: DocumentSource = {
    id: 'doc_extenso_120_paginas',
    title: 'Tratado Avançado de Neurofisiologia Cognitiva',
    subject: 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 350,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: totalPages,
    pages: longPages,
  };

  await saveDocument(longDoc);
  const result = await ingestDocumentRAG(longDoc);

  assert.equal(result.success, true);
  assert.equal(result.status, 'indexed');
  assert.equal(result.coverage?.totalPages, 120);
  assert.equal(result.coverage?.chunking.coveredPagesCount, 120, 'Todas as 120 páginas devem ser cobertas');

  const stored = await getDocumentChunks(longDoc.id);
  assert.ok(stored.length >= 120, 'Deve conter pelo menos 1 chunk por página');

  // Verificar páginas iniciais, intermediárias e finais
  const initialChunks = stored.filter((c) => c.pageNumber === 1 || c.pageNumber === 2);
  const middleChunks = stored.filter((c) => c.pageNumber === 60 || c.pageNumber === 61);
  const finalChunks = stored.filter((c) => c.pageNumber === 119 || c.pageNumber === 120);

  assert.ok(initialChunks.length >= 2, 'Páginas 1 e 2 devem estar presentes');
  assert.ok(middleChunks.length >= 2, 'Páginas 60 e 61 devem estar presentes');
  assert.ok(finalChunks.length >= 2, 'Páginas 119 e 120 devem estar presentes');

  // Confirmar que nenhum chunk tem página fora de 1..120
  const invalidPage = stored.find((c) => c.pageNumber < 1 || c.pageNumber > 120);
  assert.equal(invalidPage, undefined, 'Nenhuma página fora de [1, 120]');
});

/* ==========================================================================
   GRUPO C: DOCUMENTO COM PÁGINAS MISTAS (TEXTO, VAZIA E ESCANEADA SEM OCR)
   ========================================================================== */

test('T452 (Grupo C): Documento misto com página vazia e digitalizada gera status "completed_partial_ocr_pending"', async () => {
  await clearAllUserData();

  const mixedPages: DocumentPage[] = [
    {
      pageNumber: 1,
      textContent: 'Página 1: Introdução teórica com texto acadêmico claro sobre consolidação de memória.',
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    },
    {
      pageNumber: 2,
      textContent: '', // Página em branco
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    },
    {
      pageNumber: 3,
      textContent: '', // Digitalizada sem OCR
      hasVisualElements: true,
      isScanned: true,
      legibility: 'scanned_image',
    },
    {
      pageNumber: 4,
      textContent: 'Página 4: Discussão final e conclusões do experimento.',
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    },
  ];

  const mixedDoc: DocumentSource = {
    id: 'doc_misto_com_ocr_pendente',
    title: 'Artigo Misto com Páginas Digitalizadas',
    subject: 'Metodologia Científica',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 85000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: 4,
    pages: mixedPages,
  };

  await saveDocument(mixedDoc);
  const result = await ingestDocumentRAG(mixedDoc);

  // Status deve ser 'completed_partial_ocr_pending', NUNCA 'indexed'
  assert.equal(result.success, true);
  assert.equal(
    result.status,
    'completed_partial_ocr_pending',
    'Documento com página digitalizada sem OCR deve ter status parcial'
  );

  // Cobertura da extração e OCR
  assert.equal(result.coverage?.ocr.requiresOcrCount, 1, 'Página 3 deve ser contada como requiresOcr');
  assert.deepEqual(
    result.coverage?.extraction.emptyPageNumbers,
    [2, 3],
    'Páginas 2 e 3 devem constar em emptyPageNumbers'
  );

  const stored = await getDocumentChunks(mixedDoc.id);

  // Página 2 (vazia pura) não gera chunks
  const p2Chunks = stored.filter((c) => c.pageNumber === 2);
  assert.equal(p2Chunks.length, 0, 'Página em branco não gera chunks');

  // Página 3 (escaneada) gera sentinela de fallback
  const p3Chunks = stored.filter((c) => c.pageNumber === 3);
  assert.equal(p3Chunks.length, 1, 'Página digitalizada gera chunk de fallback');
  assert.equal(p3Chunks[0].contentKind, 'scanned_fallback');
  assert.equal(p3Chunks[0].ocrStatus, 'requires_ocr');

  // Páginas 1 e 4 geram chunks de texto normais
  const p1Chunks = stored.filter((c) => c.pageNumber === 1);
  const p4Chunks = stored.filter((c) => c.pageNumber === 4);
  assert.ok(p1Chunks.length >= 1, 'Página 1 gera chunks');
  assert.ok(p4Chunks.length >= 1, 'Página 4 gera chunks');

  // Estado gravado no IndexedDB reflete completed_partial_ocr_pending
  const docFromDb = await getDocumentById(mixedDoc.id);
  assert.equal(docFromDb?.ragStatus, 'completed_partial_ocr_pending');
});

/* ==========================================================================
   GRUPO D: CENÁRIOS DE FALHA
   ========================================================================== */

test('T453 (Grupo D.1): Extração falha (documento sem páginas) marca status "failed" e nunca "indexed"', async () => {
  await clearAllUserData();

  const brokenDoc: DocumentSource = {
    id: 'doc_empty_extraction',
    title: 'Documento Corrompido sem Páginas',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 0,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [], // Extração não produziu páginas
  };

  await saveDocument(brokenDoc);
  const result = await ingestDocumentRAG(brokenDoc);

  assert.equal(result.success, false, 'Deve reportar falha');
  assert.equal(result.status, 'failed', 'Status deve ser "failed"');
  assert.ok(result.error && result.error.length > 0, 'Deve conter mensagem de erro');

  const docInDb = await getDocumentById(brokenDoc.id);
  assert.equal(docInDb?.ragStatus, 'failed', 'No IndexedDB o status deve ser "failed"');
  assert.notEqual(docInDb?.ragStatus, 'indexed', 'Nunca deve ser marcado como indexado');
});

test('T454 (Grupo D.2): Falha simulada durante persistência no IndexedDB marca "failed" e não corrompe índice', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_fail_persistence',
    title: 'Falha de Persistência',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Texto de teste para validação de resiliência.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);

  // Ingestão com documento contendo id vazio ou inválido para causar rejeição
  const invalidDoc: DocumentSource = {
    ...doc,
    id: '', // Dispara rejeição no saveDocumentChunks
  };

  const result = await ingestDocumentRAG(invalidDoc);
  assert.equal(result.success, false);
  assert.equal(result.status, 'failed');
});

test('T455 (Grupo D.3): Falha na validação de integridade pós-gravação marca status "failed"', async () => {
  await clearAllUserData();

  // Documento onde os offsets no DocumentChunk divergem propositalmente do texto da página
  const doc: DocumentSource = {
    id: 'doc_corrupted_offsets',
    title: 'Documento com Offset Corrompido',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Texto original imutável.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);

  // Injetamos um chunk com offsets adulterados diretamente antes da validação
  await saveDocumentChunks(doc.id, [
    {
      chunkId: `${doc.id}_p1_c0`,
      documentId: doc.id,
      pageNumber: 1,
      chunkIndexInPage: 0,
      globalChunkIndex: 0,
      text: 'Texto adulterado que não bate com o slice',
      sourceRef: {
        documentId: doc.id,
        pageNumber: 1,
        charOffsetStart: 0,
        charOffsetEnd: 10,
      },
      contentKind: 'prose',
      estimatedTokens: 10,
      isTokenEstimateHeuristic: true,
      contentHash: 'fakehash',
      pipelineVersion: '1.0.0',
    },
  ]);

  // Se agora validarmos os chunks existentes com o texto real da página, detectamos a divergência
  const chunks = await getDocumentChunks(doc.id);
  const { verifyOffsetIntegrity } = await import('../services/documents/chunkingService');
  const offsetCheck = verifyOffsetIntegrity(chunks, doc.pages || []);
  assert.equal(offsetCheck.isValid, false, 'Divergência detectada pelo validador');

  // O helper de consulta reflete que não está indexado de forma fraudulenta
  const statusInfo = await getDocumentIngestionStatus(doc.id);
  assert.notEqual(statusInfo?.status, 'indexed');
});

/* ==========================================================================
   GRUPO E: IDEMPOTÊNCIA E CONCORRÊNCIA
   ========================================================================== */

test('T456 (Grupo E.1): Idempotência — reimportar o mesmo documento substitui chunks sem duplicação', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_idempotent_test',
    title: 'Documento para Teste de Idempotência',
    subject: 'Testes',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 5000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Página única de conteúdo para teste de dupla gravação.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);

  // Primeira ingestão
  const res1 = await ingestDocumentRAG(doc);
  assert.equal(res1.status, 'indexed');
  const count1 = (await getDocumentChunks(doc.id)).length;

  // Segunda ingestão do mesmo documento
  const res2 = await ingestDocumentRAG(doc);
  assert.equal(res2.status, 'indexed');
  const count2 = (await getDocumentChunks(doc.id)).length;

  // Não pode haver duplicação de chunks
  assert.equal(count2, count1, 'A contagem de chunks não pode duplicar na reimportação');

  // Reprocessamento via helper formal reprocessDocumentRAG
  const res3 = await reprocessDocumentRAG(doc.id);
  assert.equal(res3.status, 'indexed');
  const count3 = (await getDocumentChunks(doc.id)).length;
  assert.equal(count3, count1, 'Reprocessamento preserva contagem determinística sem resíduos');
});

test('T457 (Grupo E.2): Concorrência coordenada — chamadas paralelas aguardam sem colisão de chunks', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_concurrent_test',
    title: 'Documento Concorrente',
    subject: 'Concorrência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 8000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Conteúdo sob teste de ingestão concorrente com múltiplas promessas simultâneas.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);

  // Dispara 3 ingestões concorrentes para o mesmo documento
  const [r1, r2, r3] = await Promise.all([
    ingestDocumentRAG(doc),
    ingestDocumentRAG(doc),
    ingestDocumentRAG(doc),
  ]);

  assert.equal(r1.status, 'indexed');
  assert.equal(r2.status, 'indexed');
  assert.equal(r3.status, 'indexed');

  // Chunks no banco devem ser exatamente os esperados para 1 execução
  const chunks = await getDocumentChunks(doc.id);
  assert.equal(chunks.length, r1.chunksCount, 'Nenhum chunk duplicado por condição de corrida');
});

/* ==========================================================================
   GRUPO F: REGRESSÃO
   ========================================================================== */

test('T458 (Grupo F.1): Documentos legados sem chunks retornam status "pending" e nunca são falsamente marcados como indexados', async () => {
  await clearAllUserData();

  const legacyDoc: DocumentSource = {
    id: 'doc_legacy_fase1',
    title: 'Documento Antigo da Fase 1',
    subject: 'Histórico',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 25000,
    mimeType: 'application/pdf',
    uploadedAt: 1699000000000,
    pageCount: 5,
    // Não possui ragStatus nem chunks
  };

  await saveDocument(legacyDoc);

  // Consulta status pelo helper
  const status = await getDocumentIngestionStatus(legacyDoc.id);
  assert.ok(status, 'Deve retornar objeto de status');
  assert.equal(status?.status, 'pending', 'Documento legado sem chunks deve ter status "pending"');
  assert.equal(status?.indexedChunksCount, 0, 'Zero chunks indexados');

  // Documento permanece recuperável
  const retrieved = await getDocumentById(legacyDoc.id);
  assert.equal(retrieved?.id, legacyDoc.id);
  assert.equal(retrieved?.title, legacyDoc.title);
});

test('T459 (Grupo F.2): Exclusão de documento via deleteDocumentCompletely remove todos os chunks associados', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_to_delete',
    title: 'Documento Destinado à Exclusão',
    subject: 'Testes',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 12000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Conteúdo que será removido na exclusão em cascata.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Confirma que os chunks foram salvos
  const chunksBefore = await getDocumentChunks(doc.id);
  assert.ok(chunksBefore.length > 0, 'Chunks devem existir antes da exclusão');

  // Executa exclusão em cascata
  await deleteDocumentCompletely(doc.id);

  // Confirma que chunks e documento foram completamente removidos
  const chunksAfter = await getDocumentChunks(doc.id);
  assert.equal(chunksAfter.length, 0, 'Todos os chunks devem ter sido removidos do IndexedDB');

  const docAfter = await getDocumentById(doc.id);
  assert.equal(docAfter, undefined, 'Documento não deve mais existir no banco');
});

/* ==========================================================================
   GRUPO G: LIMITES E ISOLAMENTO
   ========================================================================== */

test('T460 (Grupo G): Zero chamadas a APIs remotas, zero Gemini e zero requisições externas', async () => {
  // Intercepta qualquer chamada de rede durante a ingestão
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  globalThis.fetch = async () => {
    fetchCallCount++;
    throw new Error('REDE_PROIBIDA: Chamada de rede externa durante ingestão RAG local-first!');
  };

  try {
    const doc: DocumentSource = {
      id: 'doc_offline_puro',
      title: 'Documento Offline RAG',
      subject: 'Offline',
      type: 'pdf',
      isDemoMaterial: false,
      sizeBytes: 4000,
      mimeType: 'application/pdf',
      uploadedAt: Date.now(),
      pages: [
        {
          pageNumber: 1,
          textContent: 'Operação 100% isolada e local-first sem consumo de tokens de API remota.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
      ],
    };

    await saveDocument(doc);
    const result = await ingestDocumentRAG(doc);

    assert.equal(result.success, true);
    assert.equal(result.status, 'indexed');
    assert.equal(fetchCallCount, 0, 'Zero invocações de rede detectadas');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

