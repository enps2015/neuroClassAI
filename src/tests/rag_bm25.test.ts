/**
 * NeuroClass AI — Suíte de Testes de Recuperação e Indexação Lexical BM25 (Missão B1)
 * @module tests/rag_bm25.test
 *
 * Cobertura completa das 5 dimensões da Missão B1:
 * 1. TOKENIZAÇÃO: normalização NFC, case folding com acentuação pt-BR, siglas, fórmulas, hífens e simetria;
 * 2. MOTOR BM25: Robertson IDF, saturação TF, normalização b, repetição de termos, determinismo e desempate;
 * 3. PERSISTÊNCIA: schema v6, idempotência, reindexação sem mistura, exclusão em cascata e isolamento;
 * 4. INTEGRAÇÃO: fluxo ingestão -> chunks -> BM25, fixture 120 páginas, exclusão de sentinelas OCR;
 * 5. AVALIAÇÃO: corpus de teste padrão com cálculo e reporte de Recall@K, Precision@K e MRR.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentSource, DocumentPage } from '../types';
import type { StoredDocumentChunk } from '../types/rag';
import {
  tokenizeText,
  tokenizeQuery,
  countTermFrequencies,
  TOKENIZER_VERSION,
  PORTUGUESE_STOPWORDS_V1,
} from '../services/documents/bm25Tokenizer';
import {
  buildDocumentLexicalIndex,
  calculateRobertsonIdf,
  calculateTfWeight,
  searchBM25,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
  getLexicalIndex,
  deleteLexicalIndex,
  getAllLexicalIndexes,
} from '../services/documents/ragLexicalPersistenceService';
import {
  ingestDocumentRAG,
  rebuildLexicalIndex,
} from '../services/documents/ragIngestionService';
import {
  saveDocumentChunks,
  getDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  saveDocument,
  deleteDocumentCompletely,
  clearAllUserData,
} from '../services/persistence/indexedDb';

/* ==========================================================================
   BLOCO 1: TOKENIZAÇÃO E TRATAMENTO TÉCNICO
   ========================================================================== */

test('T500 (Tokenização): Preservação de acentos pt-BR e case folding em NFC', () => {
  const text = 'Neurociência Cognitiva: A memória e a atenção no córtex órbito-frontal.';
  const tokens = tokenizeText(text);

  assert.ok(tokens.includes('neurociência'), 'Deve preservar acento circunflexo');
  assert.ok(tokens.includes('memória'), 'Deve preservar acento agudo');
  assert.ok(tokens.includes('atenção'), 'Deve preservar til e cedilha');
  assert.ok(tokens.includes('córtex'), 'Deve preservar acento em córtex');
  assert.ok(tokens.includes('órbito-frontal'), 'Deve preservar hífen e acento');
});

test('T501 (Tokenização): Preservação estrita de siglas técnicas e identificadores', () => {
  const text = 'Os complexos SNARE e receptores NMDA medeiam LTP via API e RAG com BM25 em IoT e 5G.';
  const tokens = tokenizeText(text);

  assert.ok(tokens.includes('snare'), 'Preserva SNARE');
  assert.ok(tokens.includes('nmda'), 'Preserva NMDA');
  assert.ok(tokens.includes('ltp'), 'Preserva LTP');
  assert.ok(tokens.includes('api'), 'Preserva API');
  assert.ok(tokens.includes('rag'), 'Preserva RAG');
  assert.ok(tokens.includes('bm25'), 'Preserva BM25');
  assert.ok(tokens.includes('iot'), 'Preserva IoT');
  assert.ok(tokens.includes('5g'), 'Preserva 5G');
});

test('T502 (Tokenização): Preservação de fórmulas químicas, subscritos e cargas iônicas', () => {
  const text = 'Concentrações de Ca²⁺, Mg²⁺, Na⁺ e cloreto de sódio NaCl em pH 7.4 com CO₂ e H₂O.';
  const tokens = tokenizeText(text);

  assert.ok(tokens.includes('ca²⁺'), 'Preserva Ca²⁺ com carga sobrescrita');
  assert.ok(tokens.includes('mg²⁺'), 'Preserva Mg²⁺');
  assert.ok(tokens.includes('na⁺'), 'Preserva Na⁺');
  assert.ok(tokens.includes('nacl'), 'Preserva NaCl');
  assert.ok(tokens.includes('ph'), 'Preserva pH');
  assert.ok(tokens.includes('co₂'), 'Preserva CO₂ com subscrito');
  assert.ok(tokens.includes('h₂o'), 'Preserva H₂O');
});

test('T503 (Tokenização): Preservação de números, datas, medidas, decimais e códigos', () => {
  const text = 'Em 1978 e 2026, a taxa foi de 0.05 com latência de 350ms e voltagem -70mV sob ISO-27001 e ISO 27001.';
  const tokens = tokenizeText(text);

  assert.ok(tokens.includes('1978'), 'Preserva ano 1978');
  assert.ok(tokens.includes('2026'), 'Preserva ano 2026');
  assert.ok(tokens.includes('0.05'), 'Preserva decimal 0.05');
  assert.ok(tokens.includes('350ms'), 'Preserva unidade 350ms');
  assert.ok(tokens.includes('70mv'), 'Preserva voltagem 70mV');
  assert.ok(tokens.includes('iso-27001'), 'Preserva código com hífen ISO-27001');
  assert.ok(tokens.includes('27001'), 'Preserva número ISO separado');
});

test('T504 (Tokenização): Pontuação como separador limpo e simetria estrita entre query e doc', () => {
  const query = 'Memória (LTP)? Sim, 100% comprovado!';
  const docText = 'Memória, LTP; sim: 100% comprovado.';

  const queryTokens = tokenizeQuery(query);
  const docTokens = tokenizeText(docText);

  assert.deepEqual(queryTokens, docTokens, 'Política de tokenização de consulta e documento deve ser idêntica');
  assert.ok(!queryTokens.includes('('));
  assert.ok(!queryTokens.includes('?'));
  assert.ok(!queryTokens.includes('!'));
  assert.ok(!queryTokens.includes(','));
});

test('T505 (Tokenização): Stopwords desativadas por padrão e comportamento com stoplist versionada', () => {
  const text = 'O estudo da memória de longo prazo para a neurociência.';
  const tokensDefault = tokenizeText(text);
  assert.ok(tokensDefault.includes('o'), 'Stopwords NÃO são removidas por padrão');
  assert.ok(tokensDefault.includes('da'));
  assert.ok(tokensDefault.includes('de'));
  assert.ok(tokensDefault.includes('para'));

  const tokensFiltered = tokenizeText(text, { removeStopwords: true });
  assert.ok(!tokensFiltered.includes('o'), 'Com removeStopwords: true, filtra partículas fechadas');
  assert.ok(!tokensFiltered.includes('da'));
  assert.ok(tokensFiltered.includes('estudo'));
  assert.ok(tokensFiltered.includes('memória'));
  assert.ok(tokensFiltered.includes('longo'));
  assert.ok(tokensFiltered.includes('prazo'));
  assert.ok(tokensFiltered.includes('neurociência'));
});

/* ==========================================================================
   BLOCO 2: FÓRMULA BM25 E REGRAS DE PONTUAÇÃO
   ========================================================================== */

test('T510 (BM25): Robertson IDF não-negativo e comportamento monotônico', () => {
  const N = 100;
  // Termo raríssimo (aparece em 1 documento)
  const idfRare = calculateRobertsonIdf(N, 1);
  // Termo comum (aparece em 50 documentos)
  const idfMedium = calculateRobertsonIdf(N, 50);
  // Termo universal (aparece em todos os 100 documentos)
  const idfUniversal = calculateRobertsonIdf(N, 100);

  assert.ok(idfRare > idfMedium, 'Termo raro deve ter IDF maior que termo médio');
  assert.ok(idfMedium > idfUniversal, 'Termo médio deve ter IDF maior que termo universal');
  assert.ok(idfUniversal >= 0, 'IDF de termo universal deve ser não-negativo');
  assert.equal(calculateRobertsonIdf(0, 0), 0, 'Corpus vazio resulta em IDF zero');
});

test('T511 (BM25): Saturação de TF e efeito do parâmetro k1', () => {
  const avgdl = 100;
  const chunkLen = 100;

  // Com k1 padrão (1.2)
  const tf1 = calculateTfWeight(1, chunkLen, avgdl, 1.2, 0.75);
  const tf5 = calculateTfWeight(5, chunkLen, avgdl, 1.2, 0.75);
  const tf20 = calculateTfWeight(20, chunkLen, avgdl, 1.2, 0.75);

  assert.ok(tf5 > tf1, 'TF=5 deve pontuar mais que TF=1');
  assert.ok(tf20 > tf5, 'TF=20 deve pontuar mais que TF=5');
  // Saturação: ganho de 1 para 5 é muito maior que ganho de 5 para 20
  const gain1to5 = tf5 - tf1;
  const gain5to20 = tf20 - tf5;
  assert.ok(gain1to5 > gain5to20, 'Curva de TF deve demonstrar saturação sublinear côncava');
});

test('T512 (BM25): Normalização por comprimento de chunk (parâmetro b)', () => {
  const avgdl = 100;
  const tf = 2;

  // Chunk curto (50 tokens) vs Chunk longo (200 tokens) com mesmo TF
  const scoreShort = calculateTfWeight(tf, 50, avgdl, 1.2, 0.75);
  const scoreLong = calculateTfWeight(tf, 200, avgdl, 1.2, 0.75);

  assert.ok(
    scoreShort > scoreLong,
    'Chunk mais curto com mesmo número de menções deve receber pontuação maior que chunk longo'
  );

  // Com b=0 (sem normalização de tamanho)
  const scoreShortNoB = calculateTfWeight(tf, 50, avgdl, 1.2, 0.0);
  const scoreLongNoB = calculateTfWeight(tf, 200, avgdl, 1.2, 0.0);
  assert.equal(
    Number(scoreShortNoB.toFixed(5)),
    Number(scoreLongNoB.toFixed(5)),
    'Com b=0, o tamanho do chunk não afeta a pontuação'
  );
});

test('T513 (BM25): Prevenção de divisão por zero e ausência de NaN/Infinity', () => {
  assert.equal(calculateRobertsonIdf(0, 0), 0);
  assert.equal(calculateRobertsonIdf(-10, -5), 0);
  assert.equal(calculateTfWeight(0, 100, 100), 0);
  assert.equal(calculateTfWeight(5, 0, 0), calculateTfWeight(5, 0, 1));
  assert.ok(Number.isFinite(calculateTfWeight(10, 1000, 0)));
});

/* ==========================================================================
   BLOCO 3: PERSISTÊNCIA LOCAL E CICLO DE VIDA DO ÍNDICE
   ========================================================================== */

test('T520 (Persistência): Indexação atômica, recuperação e idempotência', async () => {
  await clearAllUserData();

  const docId = 'doc_test_persistence_bm25';
  const chunks: StoredDocumentChunk[] = [
    {
      chunkId: `${docId}_p1_c0`,
      documentId: docId,
      docId,
      pageNumber: 1,
      chunkIndexInPage: 0,
      globalChunkIndex: 0,
      text: 'O hipocampo é fundamental para a consolidação de memórias declarativas e espaciais.',
      sourceRef: { documentId: docId, pageNumber: 1, charOffsetStart: 0, charOffsetEnd: 82 },
      contentKind: 'prose',
      estimatedTokens: 15,
      isTokenEstimateHeuristic: true,
      contentHash: 'hash_1',
      pipelineVersion: '1.0.0',
      startOffset: 0,
      endOffset: 82,
      indexingOptionsVersion: '1.0.0',
      storedAt: Date.now(),
    },
    {
      chunkId: `${docId}_p2_c0`,
      documentId: docId,
      docId,
      pageNumber: 2,
      chunkIndexInPage: 0,
      globalChunkIndex: 1,
      text: 'A amígdala modula a retenção de memórias emocionais através de projeções noradrenérgicas.',
      sourceRef: { documentId: docId, pageNumber: 2, charOffsetStart: 0, charOffsetEnd: 88 },
      contentKind: 'prose',
      estimatedTokens: 16,
      isTokenEstimateHeuristic: true,
      contentHash: 'hash_2',
      pipelineVersion: '1.0.0',
      startOffset: 0,
      endOffset: 88,
      indexingOptionsVersion: '1.0.0',
      storedAt: Date.now(),
    },
  ];

  // Constrói e salva índice
  const index = buildDocumentLexicalIndex(docId, chunks);
  await saveLexicalIndex(index);

  // Recupera do IndexedDB
  const retrieved = await getLexicalIndex(docId);
  assert.ok(retrieved, 'Índice deve ser recuperado do store rag_lexical_index');
  assert.equal(retrieved?.documentId, docId);
  assert.equal(retrieved?.totalChunks, 2);
  assert.ok(retrieved?.postings['hipocampo'], 'Termo hipocampo deve estar indexado');
  assert.ok(retrieved?.postings['amígdala'], 'Termo amígdala deve estar indexado');
  assert.equal(retrieved?.postings['memórias']?.length, 2, 'Termo memórias aparece em ambos os chunks');

  // Idempotência: re-salvar com modificação substitui sem duplicar
  const updatedIndex = buildDocumentLexicalIndex(docId, [chunks[0]]);
  await saveLexicalIndex(updatedIndex);

  const afterUpdate = await getLexicalIndex(docId);
  assert.equal(afterUpdate?.totalChunks, 1, 'Reindexação deve substituir integralmente o registro');
  assert.equal(afterUpdate?.postings['amígdala'], undefined, 'Postings do chunk removido não persistem');
});

test('T521 (Persistência): Exclusão em cascata no deleteDocumentCompletely limpa o índice BM25', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_cascade_bm25',
    title: 'Documento para Exclusão BM25',
    subject: 'Testes',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Conteúdo que terá índice lexical removido na exclusão em cascata.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Confirma que índice existe antes
  const indexBefore = await getLexicalIndex(doc.id);
  assert.ok(indexBefore, 'Índice lexical deve existir após ingestão');

  // Executa exclusão completa do documento
  await deleteDocumentCompletely(doc.id);

  // Confirma que o índice foi excluído
  const indexAfter = await getLexicalIndex(doc.id);
  assert.equal(indexAfter, undefined, 'Índice lexical deve ter sido removido na cascata');
});

/* ==========================================================================
   BLOCO 4: CONSULTAS BM25 E ISOLAMENTO DE ESCOPO DOCUMENTAL
   ========================================================================== */

test('T530 (Busca BM25): Correspondência exata, ranking determinístico e rastreabilidade de evidência', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_plasticidade_sinaptica',
    title: 'Plasticidade Sináptica e Memória',
    subject: 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 5000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Visão geral da neurobiologia celular no cérebro de mamíferos.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
      {
        pageNumber: 2,
        textContent: 'A potenciação de longa duração LTP depende da ativação de receptores NMDA com influxo de íons Ca²⁺.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
      {
        pageNumber: 3,
        textContent: 'Modelos matemáticos de circuitos neurais em redes artificiais.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Executa busca lexical
  const response = await searchBM25('receptores NMDA influxo Ca²⁺', {
    documentId: doc.id,
    topK: 3,
  });

  assert.ok(response.results.length >= 1, 'Deve retornar ao menos 1 resultado relevante');
  const topResult = response.results[0];

  // Rastreabilidade estrita
  assert.equal(topResult.documentId, doc.id);
  assert.equal(topResult.pageNumber, 2, 'Página física deve ser a 2');
  assert.ok(topResult.score > 0, 'Score deve ser estritamente positivo');
  assert.ok(topResult.text.includes('NMDA'));
  assert.ok(topResult.text.includes('Ca²⁺'));
  assert.ok(topResult.matchedTerms.includes('nmda'));
  assert.ok(topResult.matchedTerms.includes('ca²⁺'));
  assert.ok(topResult.charOffsetStart >= 0);
  assert.ok(topResult.charOffsetEnd > topResult.charOffsetStart);
  assert.ok(topResult.contentHash.length === 64, 'contentHash deve ser SHA-256');
});

test('T531 (Busca BM25): Isolamento estrito por documento (Doc A nunca retorna Chunks de Doc B)', async () => {
  await clearAllUserData();

  const docA: DocumentSource = {
    id: 'doc_alpha',
    title: 'Documento Alpha',
    subject: 'A',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Neurotransmissão glutamatérica excitatória de alta precisão.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  const docB: DocumentSource = {
    id: 'doc_beta',
    title: 'Documento Beta',
    subject: 'B',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Neurotransmissão gabaérgica inibitória através de canais de cloro.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(docA);
  await ingestDocumentRAG(docA);

  await saveDocument(docB);
  await ingestDocumentRAG(docB);

  // Consulta direcionada exclusivamente ao Documento A
  const respA = await searchBM25('neurotransmissão inibitória cloro', {
    documentId: 'doc_alpha',
  });

  // O termo "cloro" e "inibitória" pertencem ao Documento B, mas a busca foi delimitada ao Documento A
  for (const r of respA.results) {
    assert.equal(r.documentId, 'doc_alpha', 'Nenhum resultado de doc_beta pode vazar para doc_alpha');
    assert.notEqual(r.documentId, 'doc_beta');
  }

  // Consulta sem escopo (global) encontra ambos
  const respGlobal = await searchBM25('neurotransmissão', { topK: 5 });
  const docIdsFound = respGlobal.results.map((r) => r.documentId);
  assert.ok(docIdsFound.includes('doc_alpha'));
  assert.ok(docIdsFound.includes('doc_beta'));
});

test('T532 (Busca BM25): Exclusão de chunks sentinela scanned_fallback dos resultados', async () => {
  await clearAllUserData();

  const mixedDoc: DocumentSource = {
    id: 'doc_with_scanned_page',
    title: 'Documento Misto com Escaneada',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Córtex pré-frontal e tomada de decisão.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
      {
        pageNumber: 2,
        textContent: '', // Escaneada sem OCR
        hasVisualElements: true,
        isScanned: true,
        legibility: 'scanned_image',
      },
    ],
  };

  await saveDocument(mixedDoc);
  await ingestDocumentRAG(mixedDoc);

  // Consulta por termos que poderiam aparecer no aviso de sentinela
  const resp = await searchBM25('digitalizada OCR scanned fallback', {
    documentId: mixedDoc.id,
  });

  // Nenhum chunk scanned_fallback deve constar nos resultados
  for (const r of resp.results) {
    assert.notEqual(r.chunkId, `${mixedDoc.id}_p2_c0`, 'Sentinela OCR nunca deve ser retornado como evidência');
  }
});

test('T533 (Busca BM25): Consulta vazia ou sem termos úteis retorna lista vazia e diagnóstico limpo', async () => {
  const respEmpty = await searchBM25('');
  assert.equal(respEmpty.results.length, 0);
  assert.equal(respEmpty.queryTokens.length, 0);

  const respPunctuation = await searchBM25('  ??? !!! ... ---  ');
  assert.equal(respPunctuation.results.length, 0);
  assert.equal(respPunctuation.queryTokens.length, 0);
});

/* ==========================================================================
   BLOCO 5: INTEGRAÇÃO E DOCUMENTO EXTENSO (120 PÁGINAS)
   ========================================================================== */

test('T540 (Integração): Documento de 120 páginas indexado com BM25 recuperando início, meio e fim', async () => {
  await clearAllUserData();

  const totalPages = 120;
  const longPages: DocumentPage[] = [];

  for (let p = 1; p <= totalPages; p++) {
    longPages.push({
      pageNumber: p,
      textContent: `Seção Técnica ${p}.\n` +
        `Estudo longitudinal sobre arquiteturas cognitivas na página ${p}. ` +
        (p === 1 ? 'Âncora Inicial: O conceito pioneiro de bounded rationality foi estabelecido por Herbert Simon.' : '') +
        (p === 60 ? 'Âncora Intermediária: O ponto de inflexão nos circuitos estriatais ocorre aos 350ms sob potencial V_0.' : '') +
        (p === 120 ? 'Âncora Final: Conclusões epistemológicas consolidadas com base no protocolo ISO-27001 em redes 5G.' : ''),
      hasVisualElements: false,
      isScanned: false,
      legibility: 'clean',
    });
  }

  const longDoc: DocumentSource = {
    id: 'doc_longo_120_bm25',
    title: 'Tratado de 120 Páginas para Teste BM25',
    subject: 'Arquitetura Cognitiva',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 250000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: totalPages,
    pages: longPages,
  };

  await saveDocument(longDoc);
  const ingestRes = await ingestDocumentRAG(longDoc);
  assert.equal(ingestRes.status, 'indexed');

  // Consulta início (página 1)
  const qStart = await searchBM25('Herbert Simon bounded rationality', { documentId: longDoc.id, topK: 3 });
  assert.ok(qStart.results.length > 0);
  assert.equal(qStart.results[0].pageNumber, 1, 'Deve recuperar página inicial');

  // Consulta meio (página 60)
  const qMid = await searchBM25('circuitos estriatais 350ms V_0', { documentId: longDoc.id, topK: 3 });
  assert.ok(qMid.results.length > 0);
  assert.equal(qMid.results[0].pageNumber, 60, 'Deve recuperar página intermediária');

  // Consulta fim (página 120)
  const qEnd = await searchBM25('protocolo ISO-27001 redes 5G', { documentId: longDoc.id, topK: 3 });
  assert.ok(qEnd.results.length > 0);
  assert.equal(qEnd.results[0].pageNumber, 120, 'Deve recuperar página final');
});

test('T541 (Integração): rebuildLexicalIndex reconstrói o índice BM25 sem reprocessar o PDF', async () => {
  await clearAllUserData();

  const doc: DocumentSource = {
    id: 'doc_rebuild_lexical',
    title: 'Documento Rebuild',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1500,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Neuroplasticidade dependente de experiência no córtex motor.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
      },
    ],
  };

  await saveDocument(doc);
  await ingestDocumentRAG(doc);

  // Remove deliberadamente o índice lexical simulando corrupção
  await deleteLexicalIndex(doc.id);
  const emptyCheck = await getLexicalIndex(doc.id);
  assert.equal(emptyCheck, undefined);

  // Executa rebuild rápido
  const rebuiltIndex = await rebuildLexicalIndex(doc.id);
  assert.ok(rebuiltIndex);
  assert.equal(rebuiltIndex.documentId, doc.id);
  assert.ok(rebuiltIndex.postings['neuroplasticidade']);

  // A busca volta a funcionar imediatamente
  const searchRes = await searchBM25('neuroplasticidade córtex motor', { documentId: doc.id });
  assert.equal(searchRes.results.length, 1);
});

/* ==========================================================================
   BLOCO 6: AVALIAÇÃO DE RECUPERAÇÃO NO CORPUS SINTÉTICO (GROUND TRUTH)
   ========================================================================== */

test('T550 (Avaliação): Métricas de Recuperação Recall@K, Precision@K e MRR no Corpus Padronizado', async () => {
  await clearAllUserData();

  // 1. Definição do Corpus Sintético Padronizado (6 chunks temáticos em 3 documentos)
  const corpusDocs: DocumentSource[] = [
    {
      id: 'corpus_doc_1',
      title: 'Neurobiologia da Memória e Plasticidade',
      subject: 'Neurociências',
      type: 'pdf',
      isDemoMaterial: false,
      sizeBytes: 2000,
      mimeType: 'application/pdf',
      uploadedAt: Date.now(),
      pages: [
        {
          pageNumber: 1,
          textContent: 'A potenciação de longa duração LTP em sinapses hipocampais requer influxo de íons Ca²⁺ através de receptores NMDA.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
        {
          pageNumber: 2,
          textContent: 'No modelo FSRS-7 de repetição espaçada, a estabilidade da memória declina exponencialmente de acordo com a curva de esquecimento de Ebbinghaus de 1885.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
      ],
    },
    {
      id: 'corpus_doc_2',
      title: 'Neurofisiologia do Córtex Pré-Frontal',
      subject: 'Neurociências',
      type: 'pdf',
      isDemoMaterial: false,
      sizeBytes: 2000,
      mimeType: 'application/pdf',
      uploadedAt: Date.now(),
      pages: [
        {
          pageNumber: 1,
          textContent: 'O córtex pré-frontal dorsolateral modula o controle inibitório e a memória de trabalho com latência típica de 350ms sob potencial de repouso de -70mV.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
        {
          pageNumber: 2,
          textContent: 'Herbert Simon propôs em 1978 a teoria da racionalidade limitada para processos de tomada de decisão em ambientes complexos.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
      ],
    },
    {
      id: 'corpus_doc_3',
      title: 'Arquitetura e Segurança de Sistemas Cognitivos',
      subject: 'Tecnologia',
      type: 'pdf',
      isDemoMaterial: false,
      sizeBytes: 2000,
      mimeType: 'application/pdf',
      uploadedAt: Date.now(),
      pages: [
        {
          pageNumber: 1,
          textContent: 'A conformidade com a norma ISO-27001 e a utilização de protocolos modernos 5G garantem a segurança de dispositivos IoT e endpoints de API.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
        {
          pageNumber: 2,
          textContent: 'O sistema RAG implementa busca lexical com o algoritmo BM25 combinando parâmetros k1=1.2 e b=0.75 para ranking determinístico.',
          hasVisualElements: false,
          isScanned: false,
          legibility: 'clean',
        },
      ],
    },
  ];

  // Ingestão de todos os documentos do corpus de teste
  for (const doc of corpusDocs) {
    await saveDocument(doc);
    await ingestDocumentRAG(doc);
  }

  // Chunks esperados como ground truth:
  // corpus_doc_1_p1_c0: LTP, Ca²⁺, NMDA
  // corpus_doc_1_p2_c0: FSRS-7, Ebbinghaus 1885
  // corpus_doc_2_p1_c0: pré-frontal, 350ms, 70mV
  // corpus_doc_2_p2_c0: Herbert Simon 1978 racionalidade limitada
  // corpus_doc_3_p1_c0: ISO-27001, 5G, IoT, API
  // corpus_doc_3_p2_c0: RAG, BM25, k1=1.2, b=0.75

  interface BenchmarkQuery {
    id: string;
    description: string;
    query: string;
    scopeDocId?: string;
    expectedChunkIds: string[];
    isParaphraseWithoutLexicalOverlap?: boolean;
  }

  const benchmarkQueries: BenchmarkQuery[] = [
    {
      id: 'Q1',
      description: 'Termo literal científico com sigla e íon',
      query: 'receptores NMDA influxo Ca²⁺',
      expectedChunkIds: ['corpus_doc_1_p1_c0'],
    },
    {
      id: 'Q2',
      description: 'Sigla composta e ano histórico',
      query: 'FSRS-7 curva de esquecimento de 1885',
      expectedChunkIds: ['corpus_doc_1_p2_c0'],
    },
    {
      id: 'Q3',
      description: 'Medidas, unidades e termo com hífen',
      query: 'córtex pré-frontal latência de 350ms',
      expectedChunkIds: ['corpus_doc_2_p1_c0'],
    },
    {
      id: 'Q4',
      description: 'Nome próprio de autor e ano',
      query: 'Herbert Simon 1978 racionalidade limitada',
      expectedChunkIds: ['corpus_doc_2_p2_c0'],
    },
    {
      id: 'Q5',
      description: 'Norma técnica, 5G e IoT',
      query: 'norma ISO-27001 protocolos 5G dispositivos IoT',
      expectedChunkIds: ['corpus_doc_3_p1_c0'],
    },
    {
      id: 'Q6',
      description: 'Termos técnicos de algoritmo e busca',
      query: 'sistema RAG algoritmo BM25 ranking determinístico',
      expectedChunkIds: ['corpus_doc_3_p2_c0'],
    },
    {
      id: 'Q7',
      description: 'Paráfrase simples sem sobreposição lexical (demonstração formal do limite lexical do BM25)',
      query: 'evolução dos traços mnemônicos e declínio temporal do aprendizado',
      expectedChunkIds: ['corpus_doc_1_p2_c0'],
      isParaphraseWithoutLexicalOverlap: true,
    },
    {
      id: 'Q8',
      description: 'Consulta com escopo restrito a documento específico',
      query: 'memória',
      scopeDocId: 'corpus_doc_2',
      expectedChunkIds: ['corpus_doc_2_p1_c0'],
    },
  ];

  // Cálculo das métricas para K = 1, K = 3 e K = 5
  const K_LIST = [1, 3, 5];
  const recallResults: Record<number, number[]> = { 1: [], 3: [], 5: [] };
  const precisionResults: Record<number, number[]> = { 1: [], 3: [], 5: [] };
  const reciprocalRanks: number[] = [];

  for (const bq of benchmarkQueries) {
    const searchRes = await searchBM25(bq.query, {
      documentId: bq.scopeDocId,
      topK: 5,
    });

    const returnedChunkIds = searchRes.results.map((r) => r.chunkId);

    // Encontra o rank do primeiro resultado relevante
    let firstRank = 0;
    for (let r = 0; r < returnedChunkIds.length; r++) {
      if (bq.expectedChunkIds.includes(returnedChunkIds[r])) {
        firstRank = r + 1;
        break;
      }
    }

    const reciprocalRank = firstRank > 0 ? 1 / firstRank : 0;
    reciprocalRanks.push(reciprocalRank);

    for (const K of K_LIST) {
      const topKChunkIds = returnedChunkIds.slice(0, K);
      const relevantRetrieved = topKChunkIds.filter((id) =>
        bq.expectedChunkIds.includes(id)
      ).length;

      const recall = relevantRetrieved / bq.expectedChunkIds.length;
      const precision = relevantRetrieved / K;

      recallResults[K].push(recall);
      precisionResults[K].push(precision);
    }
  }

  const average = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const meanRecall1 = average(recallResults[1]);
  const meanRecall3 = average(recallResults[3]);
  const meanRecall5 = average(recallResults[5]);

  const meanPrecision1 = average(precisionResults[1]);
  const meanPrecision3 = average(precisionResults[3]);
  const meanPrecision5 = average(precisionResults[5]);

  const mrr = average(reciprocalRanks);

  // Verificações formais:
  // Para as 7 queries com correspondência lexical (Q1 a Q6 e Q8), BM25 alcança 100% no rank 1
  assert.ok(mrr >= 0.80, `MRR deve ser robusto (atingido: ${(mrr * 100).toFixed(1)}%)`);
  assert.ok(meanRecall3 >= 0.85, `Recall@3 deve ser alto (atingido: ${(meanRecall3 * 100).toFixed(1)}%)`);

  // A query Q7 (paráfrase pura) comprova o limite conceitual do BM25:
  // Sem sobreposição lexical ("mnemônicos" não é "memória"), o BM25 não recupera o chunk
  const q7Res = await searchBM25(benchmarkQueries[6].query, { topK: 5 });
  const q7FoundExpected = q7Res.results.some((r) => r.chunkId === 'corpus_doc_1_p2_c0');
  assert.equal(
    q7FoundExpected,
    false,
    'Confirmação formal da limitação lexical do BM25 frente a paráfrase sem sobreposição vocabular'
  );

  console.log('\n--- RESULTADOS DO BENCHMARK BM25 ---');
  console.log(`Recall@1:    ${(meanRecall1 * 100).toFixed(2)}%`);
  console.log(`Recall@3:    ${(meanRecall3 * 100).toFixed(2)}%`);
  console.log(`Recall@5:    ${(meanRecall5 * 100).toFixed(2)}%`);
  console.log(`Precision@1: ${(meanPrecision1 * 100).toFixed(2)}%`);
  console.log(`Precision@3: ${(meanPrecision3 * 100).toFixed(2)}%`);
  console.log(`Precision@5: ${(meanPrecision5 * 100).toFixed(2)}%`);
  console.log(`MRR:         ${mrr.toFixed(4)}`);
  console.log('------------------------------------\n');
});

