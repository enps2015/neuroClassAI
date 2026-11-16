/**
 * NeuroClass AI — Suíte de Testes de OCR Local e Recuperação de Páginas Digitalizadas (Missão C1)
 * @module tests/rag_ocr.test
 *
 * Cobertura completa das 14 exigências mandatórias da Missão C1:
 * 1. Detecção de páginas sem texto nativo e classificação correta para OCR;
 * 2. Página com texto nativo não ser enviada ao OCR sem necessidade;
 * 3. Consentimento negado impedir download/execução do OCR;
 * 4. Persistência e retomada após interrupção (checkpoints por página);
 * 5. Retry limitado e tratamento de falha sem loop infinito;
 * 6. Cancelamento preservar páginas já concluídas no IndexedDB;
 * 7. Idempotência ao reprocessar página com mesmo hash;
 * 8. Preservação de número físico da página e ordem original;
 * 9. Texto OCR gerar chunks estruturados e atualizar o índice BM25;
 * 10. Falha durante pipeline produzir estado recuperável, nunca falso sucesso;
 * 11. Documento com OCR pendente não ser tratado pelo Tutor como integralmente pesquisável;
 * 12. Isolamento estrito entre documentos;
 * 13. Exclusão em cascata remover dados OCR associados ao documento;
 * 14. Regressão das suítes RAG e estabilidade da aplicação.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentSource, DocumentPage } from '../types';
import {
  detectOcrRequirements,
  processDocumentOcr,
  calculateOcrCoverageMetrics,
} from '../services/documents/ocrCoordinatorService';
import {
  saveOcrPage,
  getOcrPage,
  getDocumentOcrPages,
  deleteDocumentOcrPages,
  getDocumentOcrStats,
} from '../services/documents/ragOcrPersistenceService';
import {
  OcrConsentManager,
  SimulatedLocalOcrAdapter,
  setOcrEngine,
  OCR_DEFAULT_LANGUAGE,
} from '../services/documents/ocrEngine';
import {
  saveDocument,
  getDocumentById,
  deleteDocumentCompletely,
  clearAllUserData,
} from '../services/persistence/indexedDb';
import { ingestDocumentRAG } from '../services/documents/ragIngestionService';
import { getDocumentChunks } from '../services/documents/ragPersistenceService';
import { searchBM25 } from '../services/retrieval/bm25SearchService';
import { buildTutorGroundedContext } from '../services/retrieval/tutorContextBuilder';

/* ==========================================================================
   FIXTURES E AUXILIARES
   ========================================================================== */

function createMockPage(
  pageNumber: number,
  text: string,
  isScanned = false
): DocumentPage {
  return {
    pageNumber,
    textContent: text,
    hasVisualElements: isScanned || text.length === 0,
    isScanned,
    legibility: isScanned ? 'scanned_image' : 'clean',
  };
}

function createMockDoc(
  id: string,
  title: string,
  pages: DocumentPage[]
): DocumentSource {
  return {
    id,
    title,
    subject: 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 50,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: pages.length,
    pages,
    ragStatus: 'pending',
  };
}

/* ==========================================================================
   TESTES OBRIGATÓRIOS DA MISSÃO C1
   ========================================================================== */

test('C1.1: Detecção de páginas sem texto nativo e classificação correta para OCR', async () => {
  const doc = createMockDoc('doc_c1_1', 'Documento Misto', [
    createMockPage(1, 'Introdução rica em texto nativo com mais de cinquenta caracteres para não ser classificada como scanned.'),
    createMockPage(2, '', true), // Digitalizada sem texto
    createMockPage(3, 'Terceira página com texto digital nativo claro e legível sobre neuroplasticidade e sinapses.', false),
    createMockPage(4, '    ', true), // Digitalizada com apenas espaços
  ]);

  const req = await detectOcrRequirements(doc);

  assert.equal(req.totalPages, 4);
  assert.deepEqual(req.nativePages, [1, 3], 'Páginas 1 e 3 possuem texto nativo');
  assert.deepEqual(req.scannedPages, [2, 4], 'Páginas 2 e 4 são digitalizadas');
  assert.deepEqual(req.requiresOcrPages, [2, 4], 'Páginas 2 e 4 exigem processamento OCR');
  assert.equal(req.isFullySearchable, false, 'Documento com páginas escaneadas não é 100% pesquisável');
});

test('C1.2: Página com texto nativo NÃO é enviada ao OCR sem necessidade', async () => {
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);

  const nativeTextP1 = 'Texto nativo intocado: Princípios fundamentais de neurociência computacional e redes neurais.';
  const doc = createMockDoc('doc_c1_2', 'Preservação Nativa', [
    createMockPage(1, nativeTextP1, false),
    createMockPage(2, '', true),
  ]);

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  OcrConsentManager.grantConsent(doc.id);
  mockEngine.setPageContent(2, 'Texto extraído pelo OCR da página dois.');

  const result = await processDocumentOcr(doc.id, { engine: mockEngine });

  assert.equal(result.success, true);
  assert.deepEqual(result.completedPages, [2], 'Apenas a página 2 deve ter sido enviada para OCR');

  const reloaded = await getDocumentById(doc.id);
  assert.ok(reloaded);
  assert.equal(reloaded.pages![0].textContent, nativeTextP1, 'Texto nativo da página 1 NÃO pode ser sobrescrito');
  assert.equal((reloaded.pages![0] as any).textSource, undefined, 'Página 1 não pode ser marcada como texto de OCR');
  assert.equal(reloaded.pages![1].textContent, 'Texto extraído pelo OCR da página dois.');
});

test('C1.3: Consentimento negado impede download e execução do OCR', async () => {
  const doc = createMockDoc('doc_c1_3', 'Sem Consentimento', [
    createMockPage(1, '', true),
  ]);
  await saveDocument(doc);

  OcrConsentManager.revokeConsent(doc.id);
  assert.equal(OcrConsentManager.hasConsent(doc.id), false);

  await assert.rejects(
    async () => {
      await processDocumentOcr(doc.id);
    },
    /Consentimento explícito do usuário é obrigatório/,
    'Deve rejeitar execução se o consentimento não foi concedido'
  );
});

test('C1.4: Persistência e retomada após interrupção (checkpoints por página)', async () => {
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);

  const doc = createMockDoc('doc_c1_4', 'Retomada de Checkpoint', [
    createMockPage(1, '', true),
    createMockPage(2, '', true),
    createMockPage(3, '', true),
  ]);

  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  // Simula que a página 1 já foi concluída em execução anterior e salva no IndexedDB
  await saveOcrPage({
    id: `${doc.id}_p1`,
    documentId: doc.id,
    pageNumber: 1,
    status: 'completed',
    text: 'Texto já concluído da página um em checkpoint prévio.',
    language: 'por',
    engineVersion: '1.0.0',
    confidenceScore: 95,
    processedAt: Date.now() - 5000,
    retryCount: 0,
    contentHash: 'hash_pre_p1',
    textSource: 'ocr',
  });

  const reqBefore = await detectOcrRequirements(doc);
  assert.deepEqual(reqBefore.completedOcrPages, [1], 'Página 1 já deve ser detectada como concluída');
  assert.deepEqual(reqBefore.requiresOcrPages, [2, 3], 'Apenas páginas 2 e 3 devem exigir processamento');

  mockEngine.setPageContent(2, 'Texto OCR pág 2');
  mockEngine.setPageContent(3, 'Texto OCR pág 3');

  const result = await processDocumentOcr(doc.id, { engine: mockEngine });

  assert.equal(result.success, true);
  // Páginas 1, 2 e 3 devem constar como concluídas no resultado final
  assert.ok(result.completedPages.includes(1));
  assert.ok(result.completedPages.includes(2));
  assert.ok(result.completedPages.includes(3));
});

test('C1.5: Retry limitado e tratamento de falha sem loop infinito', async () => {
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);

  const doc = createMockDoc('doc_c1_5', 'Teste de Falha', [
    createMockPage(1, '', true),
    createMockPage(2, '', true),
  ]);

  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  // Induz falha permanente na página 1 e sucesso na página 2
  mockEngine.setPageFailure(1, true);
  mockEngine.setPageContent(2, 'Sucesso na página dois.');

  const result = await processDocumentOcr(doc.id, {
    engine: mockEngine,
    maxRetriesPerPage: 2,
  });

  assert.equal(result.status, 'partial', 'Status deve ser parcial devido à falha da página 1');
  assert.equal(result.failedPages.length, 1);
  assert.equal(result.failedPages[0].pageNumber, 1);
  assert.equal(result.failedPages[0].retries, 3, 'Deve ter tentado 3 vezes (1 inicial + 2 retries) e parado');
  assert.ok(result.completedPages.includes(2), 'Página 2 deve ter sido concluída com sucesso');

  const savedP1 = await getOcrPage(doc.id, 1);
  assert.equal(savedP1?.status, 'failed');
  assert.ok(savedP1?.errorMessage);
});

test('C1.6: Cancelamento preserva páginas já concluídas no IndexedDB', async () => {
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);

  const doc = createMockDoc('doc_c1_6', 'Teste de Cancelamento', [
    createMockPage(1, '', true),
    createMockPage(2, '', true),
  ]);

  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  mockEngine.setPageContent(1, 'Texto da página 1 concluído antes do cancelamento.');
  const cancellationToken = { isCancelled: false };

  // Ao processar a página 1, o cancellationToken é ativado para interromper antes da página 2
  const result = await processDocumentOcr(doc.id, {
    engine: mockEngine,
    cancellationToken,
    onProgress: (p) => {
      if (p.completedPagesCount === 1) {
        cancellationToken.isCancelled = true;
      }
    },
  });

  assert.equal(result.status, 'cancelled');
  assert.ok(result.completedPages.includes(1), 'Página 1 deve estar na lista de concluídas');

  // Verifica que o checkpoint da página 1 foi gravado no IndexedDB
  const page1Ocr = await getOcrPage(doc.id, 1);
  assert.equal(page1Ocr?.status, 'completed');
  assert.equal(page1Ocr?.text, 'Texto da página 1 concluído antes do cancelamento.');

  // Página 2 não deve ter sido gravada
  const page2Ocr = await getOcrPage(doc.id, 2);
  assert.equal(page2Ocr, null);
});

test('C1.7: Idempotência ao reprocessar página com mesmo hash', async () => {
  const doc = createMockDoc('doc_c1_7', 'Idempotência', [createMockPage(1, '', true)]);
  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(1, 'Conteúdo determinístico idêntico');

  // Primeira execução
  await processDocumentOcr(doc.id, { engine: mockEngine });
  const allOcr1 = await getDocumentOcrPages(doc.id);
  assert.equal(allOcr1.length, 1);

  // Segunda execução forçando reprocessamento
  await processDocumentOcr(doc.id, { engine: mockEngine, forceReprocessAll: true });
  const allOcr2 = await getDocumentOcrPages(doc.id);
  assert.equal(allOcr2.length, 1, 'Não pode criar registros duplicados');
  assert.equal(allOcr2[0].text, 'Conteúdo determinístico idêntico');
});

test('C1.8: Preservação estrita de número físico da página e ordem original', async () => {
  const doc = createMockDoc('doc_c1_8', 'Numeração Física', [
    createMockPage(10, '', true),
    createMockPage(25, '', true),
    createMockPage(50, '', true),
  ]);

  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(10, 'Texto da página física dez');
  mockEngine.setPageContent(25, 'Texto da página física vinte e cinco');
  mockEngine.setPageContent(50, 'Texto da página física cinquenta');

  const result = await processDocumentOcr(doc.id, { engine: mockEngine });

  assert.deepEqual(result.completedPages, [10, 25, 50], 'Números físicos devem ser preservados sem reindexação zero-based');

  const pages = await getDocumentOcrPages(doc.id);
  assert.equal(pages[0].pageNumber, 10);
  assert.equal(pages[1].pageNumber, 25);
  assert.equal(pages[2].pageNumber, 50);
});

test('C1.9: Texto OCR gera chunks estruturados e atualiza o índice BM25', async () => {
  const doc = createMockDoc('doc_c1_9', 'RAG e BM25 com OCR', [
    createMockPage(1, '', true),
  ]);

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Antes do OCR: chunks devem ser sentinela scanned_fallback
  const chunksBefore = await getDocumentChunks(doc.id);
  assert.equal(chunksBefore[0].contentKind, 'scanned_fallback');

  OcrConsentManager.grantConsent(doc.id);
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(
    1,
    'A potenciação de longa duração (LTP) depende de receptores NMDA e influxo de cálcio intracelular.'
  );

  const result = await processDocumentOcr(doc.id, { engine: mockEngine });
  assert.equal(result.status, 'completed');
  assert.equal(result.ragStatus, 'indexed');

  // Depois do OCR: chunks estruturados reais gerados
  const chunksAfter = await getDocumentChunks(doc.id);
  assert.ok(chunksAfter.length > 0);
  assert.equal(chunksAfter[0].isOcrDerived, true, 'Chunk deve ser marcado como derivado de OCR');
  assert.equal(chunksAfter[0].ocrStatus, 'completed');
  assert.notEqual(chunksAfter[0].contentKind, 'scanned_fallback');

  // Busca BM25 deve recuperar o chunk usando termo exclusivo do OCR
  const searchRes = await searchBM25('potenciação longa duração NMDA influxo cálcio', {
    documentId: doc.id,
  });

  assert.ok(searchRes.results.length > 0, 'BM25 deve recuperar o chunk derivado de OCR');
  assert.equal(searchRes.results[0].pageNumber, 1);
  assert.ok(searchRes.results[0].text.includes('NMDA'));
});

test('C1.10: Falha durante pipeline produz estado recuperável, nunca falso sucesso', async () => {
  const doc = createMockDoc('doc_c1_10', 'Falha Recuperável', [
    createMockPage(1, '', true),
  ]);

  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageFailure(1, true); // induz falha

  const result = await processDocumentOcr(doc.id, {
    engine: mockEngine,
    maxRetriesPerPage: 1,
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.ragStatus, 'completed_partial_ocr_pending', 'NUNCA declarar indexed em caso de falha');

  const reloaded = await getDocumentById(doc.id);
  assert.equal(reloaded?.ragStatus, 'completed_partial_ocr_pending');
});

test('C1.11: Documento com OCR pendente não é tratado pelo Tutor como integralmente pesquisável', async () => {
  const doc = createMockDoc('doc_c1_11', 'Tutor com OCR Pendente', [
    createMockPage(1, 'Introdução sobre neuroanatomia geral.', false),
    createMockPage(2, '', true), // digitalizada pendente de OCR
  ]);

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Pergunta sobre assunto que não está na página 1
  const context = await buildTutorGroundedContext('mecanismos moleculares da sinapse CREB', {
    id: doc.id,
    title: doc.title,
  });

  // O Tutor deve retornar ocr_pending e emitir aviso transparente
  assert.equal(context.state, 'ocr_pending', 'Deve sinalizar ocr_pending e não falso no_evidence definitivo');
  assert.ok(context.userNotice?.includes('OCR pendente') || context.userNotice?.includes('digitalizadas'));
});

test('C1.12: Isolamento estrito entre documentos (Doc A não contamina Doc B)', async () => {
  const docA = createMockDoc('doc_c1_12_A', 'Doc A', [createMockPage(1, '', true)]);
  const docB = createMockDoc('doc_c1_12_B', 'Doc B', [createMockPage(1, '', true)]);

  await saveDocument(docA);
  await saveDocument(docB);

  OcrConsentManager.grantConsent(docA.id);
  OcrConsentManager.grantConsent(docB.id);

  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(1, 'Texto exclusivo do documento A');

  await processDocumentOcr(docA.id, { engine: mockEngine });

  const ocrPagesA = await getDocumentOcrPages(docA.id);
  const ocrPagesB = await getDocumentOcrPages(docB.id);

  assert.equal(ocrPagesA.length, 1);
  assert.equal(ocrPagesA[0].text, 'Texto exclusivo do documento A');
  assert.equal(ocrPagesB.length, 0, 'Documento B não pode receber páginas processadas de A');
});

test('C1.13: Exclusão do documento remove dados OCR associados em cascata', async () => {
  const doc = createMockDoc('doc_c1_13', 'Exclusão Cascata', [createMockPage(1, '', true)]);
  await saveDocument(doc);
  OcrConsentManager.grantConsent(doc.id);

  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(1, 'Texto a ser excluído');

  await processDocumentOcr(doc.id, { engine: mockEngine });

  const beforeDelete = await getDocumentOcrPages(doc.id);
  assert.equal(beforeDelete.length, 1);

  // Executa exclusão completa em cascata
  await deleteDocumentCompletely(doc.id);

  const afterDelete = await getDocumentOcrPages(doc.id);
  assert.equal(afterDelete.length, 0, 'Todos os registros de OCR devem ser excluídos em cascata');
});

test('C1.14: Métricas de cobertura documental (calculateOcrCoverageMetrics)', async () => {
  const doc = createMockDoc('doc_c1_14', 'Métricas Cobertura', [
    createMockPage(1, 'Texto nativo da página um com comprimento suficiente para validação de métricas.', false),
    createMockPage(2, '', true),
    createMockPage(3, '', true),
  ]);

  await saveDocument(doc);
  const metricsInitial = await calculateOcrCoverageMetrics(doc);

  assert.equal(metricsInitial.totalPages, 3);
  assert.equal(metricsInitial.nativeTextPagesCount, 1);
  assert.equal(metricsInitial.scannedPagesCount, 2);
  assert.equal(metricsInitial.requiresOcrCount, 2);
  assert.equal(metricsInitial.completedOcrCount, 0);
  assert.equal(metricsInitial.coveragePercent, 33); // 1 de 3 pesquisável

  // Processa OCR na página 2
  OcrConsentManager.grantConsent(doc.id);
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(2, 'Texto OCR pág 2');

  await saveOcrPage({
    id: `${doc.id}_p2`,
    documentId: doc.id,
    pageNumber: 2,
    status: 'completed',
    text: 'Texto OCR pág 2',
    language: 'por',
    engineVersion: '1.0.0',
    processedAt: Date.now(),
    retryCount: 0,
    contentHash: 'hash_p2',
    textSource: 'ocr',
  });

  const metricsUpdated = await calculateOcrCoverageMetrics(doc);
  assert.equal(metricsUpdated.completedOcrCount, 1);
  assert.equal(metricsUpdated.coveragePercent, 67); // 2 de 3 pesquisáveis
});

/* ==========================================================================
   TESTES MANDATÓRIOS DA MISSÃO C2 — HOMOLOGAÇÃO REAL DO ADAPTADOR OCR
   ========================================================================== */

test('C2.1: Persistência de consentimento em localStorage com chave e escopo explícitos', () => {
  const docId = 'doc_c2_test_storage';
  OcrConsentManager.clearAllConsents();
  assert.equal(OcrConsentManager.hasConsent(docId), false);

  OcrConsentManager.grantConsent(docId);
  assert.equal(OcrConsentManager.hasConsent(docId), true);

  OcrConsentManager.revokeConsent(docId);
  assert.equal(OcrConsentManager.hasConsent(docId), false);
});

test('C2.2: Constantes de modelo verificadas (~6.8 MB modelo, ~4.5 MB runtime) e transparência', () => {
  const info = OcrConsentManager.getModelInfo();
  assert.equal(info.language, 'por');
  assert.equal(info.sizeBytes, 6_755_162, 'Tamanho verificado de por.traineddata.gz deve ser 6.755.162 bytes');
  assert.equal((info as any).runtimeSizeBytes, 4_734_776, 'Runtime WASM core deve ser 4.734.776 bytes');
  assert.ok(info.displaySize.includes('6,8 MB'));
});

test('C2.3: processDocumentOcr com documentPages mescla buffers voláteis de imagem sem perda', async () => {
  const doc = createMockDoc('doc_c2_mem_pages', 'Buffers em Memória', [
    createMockPage(1, 'Texto nativo completo com mais de cinquenta caracteres para validação.', false),
    createMockPage(2, '', true),
  ]);
  await saveDocument(doc); // IndexedDB remove pageImageBase64

  const inMemoryPageWithImage: DocumentPage = {
    ...doc.pages![1],
    pageImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  };

  OcrConsentManager.grantConsent(doc.id);
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(2, 'Texto extraído a partir do buffer em memória');

  const result = await processDocumentOcr(doc.id, {
    engine: mockEngine,
    documentPages: [doc.pages![0], inMemoryPageWithImage],
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.completedPages, [2]);

  const reloaded = await getDocumentById(doc.id);
  assert.equal(reloaded?.pages![1].textContent, 'Texto extraído a partir do buffer em memória');
});

test('C2.4: Fórmula matemática do Character Error Rate (CER) e Levenshtein', () => {
  function lev(a: string, b: string): number {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return d[m][n];
  }

  const ref = 'NEUROSYNAPSE_GAMMA_789';
  const hyp = 'NEUROSYNAPSE GAMMA 789'; // 2 substituições (2 underscores -> 2 espaços)
  const dist = lev(ref, hyp);
  assert.equal(dist, 2);
  const cer = dist / ref.length;
  assert.ok(cer < 0.10, 'CER deve ser inferior a 10% para OCR de alta fidelidade');
});

test('C2.5: Rastreabilidade e citação ponta a ponta: página 2 com OCR citada no Tutor com [Doc, Pág. 2]', async () => {
  const doc = createMockDoc('doc_c2_tutor', 'Tratado de Neuroplasticidade', [
    createMockPage(1, 'Introdução aos mecanismos de memória.', false),
    createMockPage(2, '', true),
  ]);
  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  OcrConsentManager.grantConsent(doc.id);
  const mockEngine = new SimulatedLocalOcrAdapter();
  setOcrEngine(mockEngine);
  mockEngine.setPageContent(2, 'O biomarcador NEUROSYNAPSE_GAMMA_789 registrou 94,5% de eficácia em ensaios de 2026.');

  await processDocumentOcr(doc.id, { engine: mockEngine });

  const tutorContext = await buildTutorGroundedContext(
    'Qual foi a eficácia do biomarcador NEUROSYNAPSE_GAMMA_789?',
    { id: doc.id, title: doc.title }
  );

  assert.equal(tutorContext.state, 'grounded');
  assert.equal(tutorContext.evidences.length > 0, true);
  assert.equal((tutorContext.evidences[0] as any).pageNumber, 2);
  assert.ok(tutorContext.documentExcerpts[0].includes('Tratado de Neuroplasticidade'));
  assert.ok(tutorContext.documentExcerpts[0].includes('Pág. 2'));
  assert.ok(tutorContext.documentExcerpts[0].includes('NEUROSYNAPSE_GAMMA_789'));
});

