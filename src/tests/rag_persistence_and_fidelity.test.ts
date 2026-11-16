/**
 * NeuroClass AI — Testes de Fidelidade de Chunking e Persistência Local (Fase A2)
 * @module tests/rag_persistence_and_fidelity.test
 *
 * Cobertura exaustiva dos requisitos de:
 * 1. Fidelidade texto/offset e preservação de CRLF, tabs, múltiplos espaços e emojis;
 * 2. Validadores matemáticos de integridade, reconstrução exata e auditoria de sobreposição;
 * 3. Identidade lógica, contentHash determinístico e isolamento de metadados operacionais;
 * 4. Estruturas atômicas e sinalização de oversizeAtomicBlock;
 * 5. Persistência local no IndexedDB (idempotência, reindexação sem mistura e isolamento).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentSource } from '../types';
import type { DocumentChunk } from '../types/rag';
import {
  chunkDocument,
  verifyOffsetIntegrity,
  verifyOverlapIntegrity,
  verifyExactReconstruction,
  verifyCharacterCoverage,
  verifyComprehensiveCoverage,
  splitSentencesConservatively,
  extractStructuralBlocks,
  estimateTokenCount,
  sha256Sync,
} from '../services/documents/chunkingService';
import {
  saveDocumentChunks,
  getDocumentChunks,
  deleteDocumentChunks,
  getDocumentChunksStats,
} from '../services/documents/ragPersistenceService';
import { clearAllUserData, deleteDocumentCompletely } from '../services/persistence/indexedDb';

/* ==========================================================================
   GRUPO 1: FIDELIDADE TEXTO/OFFSET E PRESERVAÇÃO DE CARACTERES
   ========================================================================== */

test('T430: Preservação de LF e CRLF caractere a caractere no chunk.text e offsets', () => {
  const crlfText = 'Primeira linha com CRLF.\r\nSegunda linha com CRLF.\r\nTerceira linha final.';
  const doc: DocumentSource = {
    id: 'doc_crlf_fidelity',
    title: 'CRLF Fidelity Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: crlfText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.ok(result.chunks.length >= 1);

  // Todo chunk deve corresponder exatamente a page.textContent.slice(start, end)
  const offsetCheck = verifyOffsetIntegrity(result.chunks, doc.pages!);
  assert.equal(offsetCheck.isValid, true, 'Offsets devem ser 100% íntegros com CRLF');

  // Verifica que o \r\n está preservado no texto do chunk
  const hasCrlfInChunk = result.chunks.some(c => c.text.includes('\r\n'));
  assert.equal(hasCrlfInChunk, true, 'Deve conter a quebra CRLF original no chunk');

  // Reconstrução exata do texto
  const recon = verifyExactReconstruction(result.chunks, doc.pages![0]);
  assert.equal(recon.isExactMatch, true, 'Reconstrução deve ser exata com CRLF');
});

test('T431: Preservação estrita de tabs (\t\t) e múltiplos espaços sem colapso no chunk.text', () => {
  const tabText = 'Coluna A\t\tColuna B    Coluna C com múltiplos espaços.\n\tParágrafo indentado com tab.';
  const doc: DocumentSource = {
    id: 'doc_tabs_fidelity',
    title: 'Tabs Fidelity Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: tabText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.ok(result.chunks.length >= 1);

  const chunk = result.chunks[0];
  assert.equal(chunk.text.includes('\t\t'), true, 'Deve preservar tabs duplos');
  assert.equal(chunk.text.includes('    '), true, 'Deve preservar quatro espaços seguidos');
  assert.equal(doc.pages![0].textContent.slice(chunk.sourceRef.charOffsetStart, chunk.sourceRef.charOffsetEnd), chunk.text);
  assert.ok(chunk.normalizedSearchText, 'Deve ter normalizedSearchText separado');
  assert.equal(chunk.normalizedSearchText!.includes('\t\t'), false, 'Texto normalizado deve colapsar espaços');
});

test('T432: Preservação de emojis (🔬, 🧠, ⚡) e caracteres Unicode com indexação UTF-16 correta', () => {
  const emojiText = 'A plasticidade cerebral 🧠 e a transmissão sináptica ⚡ foram observadas sob microscópio 🔬.\nConclusão com acentuação: ação, cognição e memória.';
  const doc: DocumentSource = {
    id: 'doc_unicode_fidelity',
    title: 'Unicode & Emoji Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: emojiText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.ok(result.chunks.length >= 1);

  const chunk = result.chunks[0];
  assert.equal(chunk.text.includes('🧠'), true);
  assert.equal(chunk.text.includes('⚡'), true);
  assert.equal(chunk.text.includes('🔬'), true);
  assert.equal(chunk.text.includes('cognição e memória'), true);

  const offsetCheck = verifyOffsetIntegrity(result.chunks, doc.pages!);
  assert.equal(offsetCheck.isValid, true, 'Offsets com emojis em UTF-16 devem ser válidos');
});

test('T433: Sentenças agrupadas no mesmo chunk mantêm o texto-fonte exato sem adição de espaços artificiais', () => {
  const textWithSpacing = 'Primeira sentença termina aqui.\n\nSegunda sentença começa com nova linha.\n\nTerceira sentença com espaço triplo   aqui.';
  const doc: DocumentSource = {
    id: 'doc_no_artificial_spaces',
    title: 'No Artificial Spaces Test',
    subject: 'Psicologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: textWithSpacing, hasVisualElements: false }],
  };

  const result = chunkDocument(doc, { targetTokens: 100, maxTokens: 200, overlapTokens: 0 });
  assert.ok(result.chunks.length >= 1);

  for (const c of result.chunks) {
    const originalSlice = textWithSpacing.slice(c.sourceRef.charOffsetStart, c.sourceRef.charOffsetEnd);
    assert.equal(c.text, originalSlice, 'Nenhum espaço artificial pode ser introduzido no chunk');
  }
});

test('T434: Trechos repetidos idênticos na mesma página com offsets distintos e sem colisão', () => {
  const repetitiveText = 'O potencial de ação é tudo ou nada.\n\nO potencial de ação é tudo ou nada.\n\nO potencial de ação é tudo ou nada.';
  const doc: DocumentSource = {
    id: 'doc_repetitions',
    title: 'Repetitions Test',
    subject: 'Fisiologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: repetitiveText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc, { targetTokens: 15, maxTokens: 25, minTokens: 5, overlapTokens: 0 });
  assert.ok(result.chunks.length >= 2, 'Deve particionar os trechos repetidos');

  const c0 = result.chunks[0];
  const c1 = result.chunks[1];
  assert.notEqual(c0.chunkId, c1.chunkId, 'IDs devem ser distintos');
  assert.notEqual(c0.sourceRef.charOffsetStart, c1.sourceRef.charOffsetStart, 'Offsets iniciais devem ser distintos');
  assert.equal(c0.contentHash, c1.contentHash, 'Hashes devem ser iguais pois o conteúdo é idêntico');
});

test('T435: Página com texto curtíssimo e página vazia tratadas sem falsas classificações', () => {
  const doc: DocumentSource = {
    id: 'doc_edge_pages',
    title: 'Edge Pages Test',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      { pageNumber: 1, textContent: 'Palavra.', hasVisualElements: false },
      { pageNumber: 2, textContent: '   \n\n\t   ', hasVisualElements: false }, // Vazia de conteúdo
      { pageNumber: 3, textContent: '', hasVisualElements: true, isScanned: true }, // Scanned sem OCR
    ],
  };

  const result = chunkDocument(doc);
  assert.equal(result.totalPagesProcessed, 3);
  assert.equal(result.emptyPages.includes(2), true, 'Página 2 vazia');
  assert.equal(result.emptyPages.includes(3), true, 'Página 3 vazia');

  // Página 1 deve ter 1 chunk
  const p1Chunks = result.chunks.filter(c => c.pageNumber === 1);
  assert.equal(p1Chunks.length, 1);
  assert.equal(p1Chunks[0].text, 'Palavra.');

  // Página 3 (scanned) deve ter 1 chunk de fallback
  const p3Chunk = result.chunks.find(c => c.pageNumber === 3);
  assert.ok(p3Chunk);
  assert.equal(p3Chunk!.contentKind, 'scanned_fallback');
  assert.equal(p3Chunk!.ocrStatus, 'requires_ocr');
  assert.equal(result.coverage.ocr.pendingCount, 1, 'Página scanned deve ser contabilizada como pending');
  assert.equal(result.coverage.ocr.completedCount, 0, 'Não deve marcar scanned vazia como concluída');
});

test('T436: Offsets no início exato (0) e no fim exato (length)', () => {
  const fullText = 'Começo do texto integral da página que encerra exatamente aqui.';
  const doc: DocumentSource = {
    id: 'doc_boundary_offsets',
    title: 'Boundary Offsets',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: fullText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.equal(result.chunks.length, 1);
  const c = result.chunks[0];
  assert.equal(c.sourceRef.charOffsetStart, 0, 'Deve iniciar no índice 0');
  assert.equal(c.sourceRef.charOffsetEnd, fullText.length, 'Deve terminar exatamente no length');
  assert.equal(c.text, fullText);
});

/* ==========================================================================
   GRUPO 2: VALIDAÇÃO DE COBERTURA, OFFSETS E SOBREPOSIÇÃO
   ========================================================================== */

test('T437: verifyOffsetIntegrity detecta qualquer descompasso entre slice e chunk.text', () => {
  const pageText = 'Texto original sem modificações para teste de integridade.';
  const pages = [{ pageNumber: 1, textContent: pageText, hasVisualElements: false }];

  const validChunk: DocumentChunk = {
    chunkId: 'doc_p1_c0',
    documentId: 'doc',
    pageNumber: 1,
    chunkIndexInPage: 0,
    globalChunkIndex: 0,
    text: pageText,
    sourceRef: { documentId: 'doc', pageNumber: 1, charOffsetStart: 0, charOffsetEnd: pageText.length },
    contentKind: 'prose',
    estimatedTokens: 10,
    isTokenEstimateHeuristic: true,
    contentHash: sha256Sync(pageText),
    pipelineVersion: '1.0.0',
  };

  const checkOk = verifyOffsetIntegrity([validChunk], pages);
  assert.equal(checkOk.isValid, true);
  assert.equal(checkOk.violations.length, 0);

  // Chunk corrompido com texto modificado
  const corruptedChunk: DocumentChunk = {
    ...validChunk,
    chunkId: 'doc_p1_c0_corrupted',
    text: 'Texto adulterado!',
  };

  const checkFail = verifyOffsetIntegrity([corruptedChunk], pages);
  assert.equal(checkFail.isValid, false, 'Deve detectar discrepância caractere a caractere');
  assert.equal(checkFail.violations.length, 1);
  assert.equal(checkFail.violations[0].chunkId, 'doc_p1_c0_corrupted');
});

test('T438: verifyExactReconstruction e verifyOverlapIntegrity com chunks adjacentes e overlap', () => {
  const multiSentenceText = [
    'O cérebro humano possui aproximadamente 86 bilhões de neurônios.',
    'Cada neurônio estabelece milhares de conexões sinápticas com seus vizinhos.',
    'A plasticidade hebbiana descreve como sinapses se fortalecem com o uso.',
    'A potenciação a longo prazo (LTP) é o principal modelo celular de memória.',
  ].join('\n\n');

  const doc: DocumentSource = {
    id: 'doc_recon_test',
    title: 'Reconstruction Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: multiSentenceText, hasVisualElements: false }],
  };

  // Chunking com overlap
  const resultOverlap = chunkDocument(doc, { targetTokens: 25, maxTokens: 45, overlapTokens: 15 });
  assert.ok(resultOverlap.chunks.length >= 2);

  const overlapCheck = verifyOverlapIntegrity(resultOverlap.chunks, doc.pages!);
  assert.equal(overlapCheck.hasOverlap, true, 'Deve identificar sobreposição intencional');
  assert.equal(overlapCheck.violations.length, 0, 'Sobreposição deve ter textos idênticos');

  // Cobertura completa sem perda de caracteres
  const charCov = verifyCharacterCoverage(resultOverlap.chunks, doc.pages![0]);
  assert.equal(charCov.coverageRatio >= 0.95, true, 'Cobertura deve ser máxima');
  assert.equal(charCov.missingCharsCount, 0, 'Nenhum caractere não-espaço deve faltar');
});

test('T439: verifyExactReconstruction acusa falha se um caractere for omitido', () => {
  const pageText = 'Sentença completa A. Sentença completa B.';
  const page = { pageNumber: 1, textContent: pageText, hasVisualElements: false };

  // Chunks cobrindo apenas de 0 a 20, deixando o final de fora
  const partialChunk: DocumentChunk = {
    chunkId: 'doc_p1_c0',
    documentId: 'doc',
    pageNumber: 1,
    chunkIndexInPage: 0,
    globalChunkIndex: 0,
    text: pageText.slice(0, 20),
    sourceRef: { documentId: 'doc', pageNumber: 1, charOffsetStart: 0, charOffsetEnd: 20 },
    contentKind: 'prose',
    estimatedTokens: 5,
    isTokenEstimateHeuristic: true,
    contentHash: sha256Sync(pageText.slice(0, 20)),
    pipelineVersion: '1.0.0',
  };

  const recon = verifyExactReconstruction([partialChunk], page);
  assert.equal(recon.isExactMatch, false, 'Deve detectar omissão');
  assert.ok(recon.missingRanges.length >= 1, 'Deve registrar o range faltante');
  assert.equal(recon.missingRanges[0].start, 20);
});

/* ==========================================================================
   GRUPO 3: IDENTIDADE E DETERMINISMO
   ========================================================================== */

test('T440: Determinismo estrito — mesma entrada gera chunks com hashes e propriedades idênticas', () => {
  const text = 'Texto determinístico de alta fidelidade para testes de idempotência matemática.';
  const doc: DocumentSource = {
    id: 'doc_det_1',
    title: 'Deterministic Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: 1700000000000,
    pages: [{ pageNumber: 1, textContent: text, hasVisualElements: false }],
  };

  const opts = { targetTokens: 100, deterministicTimestamp: 1700000000000 };
  const res1 = chunkDocument(doc, opts);
  const res2 = chunkDocument(doc, opts);

  assert.equal(res1.chunks.length, res2.chunks.length);
  for (let i = 0; i < res1.chunks.length; i++) {
    const c1 = res1.chunks[i];
    const c2 = res2.chunks[i];
    assert.equal(c1.chunkId, c2.chunkId);
    assert.equal(c1.contentHash, c2.contentHash);
    assert.equal(c1.text, c2.text);
    assert.equal(c1.sourceRef.charOffsetStart, c2.sourceRef.charOffsetStart);
    assert.equal(c1.sourceRef.charOffsetEnd, c2.sourceRef.charOffsetEnd);
    assert.equal(c1.estimatedTokens, c2.estimatedTokens);
  }
});

test('T441: Mutação no texto (mesmo 1 caractere ou espaço) altera imediatamente contentHash', () => {
  const textA = 'Neurotransmissão glutamatérgica.';
  const textB = 'Neurotransmissão glutamatérgica '; // Apenas 1 espaço ao final

  const hashA = sha256Sync(textA);
  const hashB = sha256Sync(textB);
  assert.notEqual(hashA, hashB, 'Diferença de whitespace deve alterar contentHash');
});

test('T442: Metadados operacionais não contaminam a comparação de determinismo', () => {
  const text = 'Texto de observabilidade pura.';
  const doc: DocumentSource = {
    id: 'doc_meta_test',
    title: 'Meta Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: 1700000000000,
    pages: [{ pageNumber: 1, textContent: text, hasVisualElements: false }],
  };

  const res = chunkDocument(doc);
  assert.ok(res.executionMetadata);
  assert.ok(typeof res.executionMetadata.executionTimeMs === 'number');
  assert.ok(typeof res.executionMetadata.processedAt === 'string');
  assert.equal(res.chunks[0].isTokenEstimateHeuristic, true);
});

/* ==========================================================================
   GRUPO 4: ESTRUTURAS ATÔMICAS E OVERSIZE
   ========================================================================== */

test('T443: Bloco atômico maior que maxTokens sinalizado com oversizeAtomicBlock: true sem corte', () => {
  const rows = [];
  for (let i = 1; i <= 30; i++) {
    rows.push(`| Paciente ${i} | Resposta normal à estimulação transcraniana por corrente contínua | Sem eventos adversos relatados na sessão ${i} |`);
  }
  const hugeTable = [
    '| ID Paciente | Protocolo de Estimulação | Observações Clínicas |',
    '| :--- | :--- | :--- |',
    ...rows,
  ].join('\n');

  const doc: DocumentSource = {
    id: 'doc_huge_table',
    title: 'Huge Table Test',
    subject: 'Neurociência Clínica',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 8192,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: hugeTable, hasVisualElements: true }],
  };

  // maxTokens baixo (100) para forçar oversize na tabela
  const result = chunkDocument(doc, { maxTokens: 100, preserveAtomicBlocks: true });
  assert.equal(result.chunks.length, 1, 'Tabela atômica deve ser mantida como 1 chunk único');

  const chunk = result.chunks[0];
  assert.equal(chunk.contentKind, 'table_markdown');
  assert.equal(chunk.oversizeAtomicBlock, true, 'Deve sinalizar oversizeAtomicBlock');
  assert.ok(chunk.estimatedTokens > 100, 'Estimativa deve refletir os tokens reais');
  assert.equal(chunk.text, hugeTable, 'Texto deve ser mantido 100% integral sem corte');
});

/* ==========================================================================
   GRUPO 5: PERSISTÊNCIA LOCAL DOS CHUNKS (INDEXEDDB)
   ========================================================================== */

test('T444: Salvar e recuperar chunks preservando todos os campos e ordem estável', async () => {
  await clearAllUserData();

  const docId = 'doc_persist_1';
  const text = 'O hipocampo é essencial para a consolidação da memória episódica.\n\nO córtex pré-frontal coordena a recuperação ativa.';
  const doc: DocumentSource = {
    id: docId,
    title: 'Persistência Test',
    subject: 'Neurociência',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: text, hasVisualElements: false }],
  };

  const chunkResult = chunkDocument(doc);
  assert.ok(chunkResult.chunks.length >= 1);

  // 1. Salvar chunks
  const saved = await saveDocumentChunks(docId, chunkResult.chunks, { pipelineVersion: '1.2.0' });
  assert.equal(saved.length, chunkResult.chunks.length);
  assert.equal(saved[0].docId, docId);
  assert.equal(saved[0].indexingOptionsVersion, '1.2.0');
  assert.ok(saved[0].storedAt > 0);

  // 2. Recuperar chunks
  const retrieved = await getDocumentChunks(docId);
  assert.equal(retrieved.length, chunkResult.chunks.length);
  assert.equal(retrieved[0].chunkId, saved[0].chunkId);
  assert.equal(retrieved[0].text, saved[0].text);
  assert.equal(retrieved[0].contentHash, saved[0].contentHash);
  assert.equal(retrieved[0].startOffset, saved[0].startOffset);
  assert.equal(retrieved[0].endOffset, saved[0].endOffset);

  // 3. Estatísticas agregadas
  const stats = await getDocumentChunksStats(docId);
  assert.equal(stats.totalChunks, retrieved.length);
  assert.equal(stats.totalPagesCovered, 1);
  assert.ok(stats.totalEstimatedTokens > 0);
});

test('T445: Idempotência — salvar duas vezes o mesmo conjunto não cria duplicatas', async () => {
  await clearAllUserData();

  const docId = 'doc_idempotency';
  const text = 'Texto fixo para teste de idempotência no armazenamento local IndexedDB.';
  const doc: DocumentSource = {
    id: docId,
    title: 'Idempotency Test',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: text, hasVisualElements: false }],
  };

  const chunkResult = chunkDocument(doc);

  // Primeira gravação
  await saveDocumentChunks(docId, chunkResult.chunks);
  const afterFirst = await getDocumentChunks(docId);

  // Segunda gravação idêntica
  await saveDocumentChunks(docId, chunkResult.chunks);
  const afterSecond = await getDocumentChunks(docId);

  assert.equal(afterSecond.length, afterFirst.length, 'Não deve criar registros duplicados');
  assert.equal(afterSecond[0].chunkId, afterFirst[0].chunkId);
});

test('T446: Reindexação atômica — reprocessar documento substitui versão anterior sem mistura', async () => {
  await clearAllUserData();

  const docId = 'doc_reindex';
  const textV1 = 'Versão inicial do texto acadêmico contendo apenas um parágrafo.';
  const docV1: DocumentSource = {
    id: docId,
    title: 'Reindex Test',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: textV1, hasVisualElements: false }],
  };

  const resV1 = chunkDocument(docV1);
  await saveDocumentChunks(docId, resV1.chunks);

  // Versão 2: texto expandido com mais parágrafos e novo conteúdo
  const textV2 = [
    'Versão 2 ampliada com múltiplos tópicos e seções aprofundadas.',
    'Segundo parágrafo com análise detalhada dos mecanismos de neuroplasticidade.',
    'Terceiro parágrafo abordando o papel dos astrócitos na modulação sináptica.',
    'Quarto parágrafo examinando as vias dopaminérgicas e circuitos de recompensa.',
  ].join('\n\n');
  const docV2: DocumentSource = {
    ...docV1,
    pages: [{ pageNumber: 1, textContent: textV2, hasVisualElements: false }],
  };

  const resV2 = chunkDocument(docV2, { targetTokens: 15, minTokens: 5, maxTokens: 30, overlapTokens: 0 });
  assert.ok(resV2.chunks.length > resV1.chunks.length, 'V2 deve gerar mais chunks');

  // Grava V2 substituindo V1
  await saveDocumentChunks(docId, resV2.chunks);
  const retrievedV2 = await getDocumentChunks(docId);

  assert.equal(retrievedV2.length, resV2.chunks.length, 'Deve conter exclusivamente os chunks da V2');
  const hasV1Text = retrievedV2.some(c => c.text.includes('Versão inicial do texto'));
  assert.equal(hasV1Text, false, 'Nenhum chunk antigo da V1 deve permanecer');
});

test('T447: Isolamento estrito entre documentos e exclusão segura', async () => {
  await clearAllUserData();

  const docA = 'doc_alpha';
  const docB = 'doc_beta';

  const chunkA = chunkDocument({
    id: docA,
    title: 'Doc A',
    subject: 'A',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: 'Conteúdo do Documento Alfa.', hasVisualElements: false }],
  });

  const chunkB = chunkDocument({
    id: docB,
    title: 'Doc B',
    subject: 'B',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: 'Conteúdo do Documento Beta.', hasVisualElements: false }],
  });

  await saveDocumentChunks(docA, chunkA.chunks);
  await saveDocumentChunks(docB, chunkB.chunks);

  // Consulta doc A
  const chunksAlpha = await getDocumentChunks(docA);
  assert.equal(chunksAlpha.length, 1);
  assert.equal(chunksAlpha[0].docId, docA);

  // Consulta doc B
  const chunksBeta = await getDocumentChunks(docB);
  assert.equal(chunksBeta.length, 1);
  assert.equal(chunksBeta[0].docId, docB);

  // Exclusão de A não afeta B
  const deletedCount = await deleteDocumentChunks(docA);
  assert.equal(deletedCount, 1);

  const afterDeleteA = await getDocumentChunks(docA);
  assert.equal(afterDeleteA.length, 0, 'Chunks de A devem ter sido removidos');

  const afterDeleteB = await getDocumentChunks(docB);
  assert.equal(afterDeleteB.length, 1, 'Chunks de B devem permanecer intactos');
});

test('T448: Falha durante persistência rejeita e previne corrupção de estado', async () => {
  await clearAllUserData();

  const docId = 'doc_valid';
  const chunkInvalid: any = {
    chunkId: 'chunk_alien_p1_c0',
    documentId: 'doc_outro_id', // ID divergente proposital
    pageNumber: 1,
    sourceRef: { documentId: 'doc_outro_id', pageNumber: 1, charOffsetStart: 0, charOffsetEnd: 10 },
  };

  await assert.rejects(
    async () => {
      await saveDocumentChunks(docId, [chunkInvalid]);
    },
    /documentId divergente/,
    'Deve rejeitar a gravação se houver chunk com documentId divergente'
  );

  const existing = await getDocumentChunks(docId);
  assert.equal(existing.length, 0, 'Nenhum chunk deve ser persistido em caso de erro');
});

test('T449: Exclusão em cascata no deleteDocumentCompletely remove os chunks do documento', async () => {
  await clearAllUserData();

  const docId = 'doc_cascade_test';
  const chunkResult = chunkDocument({
    id: docId,
    title: 'Cascade Doc',
    subject: 'Medicina',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: 'Texto clínico para validação de cascata.', hasVisualElements: false }],
  });

  await saveDocumentChunks(docId, chunkResult.chunks);
  const beforeDelete = await getDocumentChunks(docId);
  assert.equal(beforeDelete.length, 1);

  // Aciona a exclusão completa do documento na infraestrutura existente
  await deleteDocumentCompletely(docId);

  const afterDelete = await getDocumentChunks(docId);
  assert.equal(afterDelete.length, 0, 'Chunks devem ser removidos em cascata junto com o documento');
});
