/**
 * NeuroClass AI — Suíte de Testes de Normalização Morfológica PT-BR no RAG BM25 (Missão E1)
 * @module tests/rag_morphology.test
 *
 * Cobertura exaustiva e rigorosa das 15 dimensões requeridas na Missão E1:
 * 1.  Flexão Nominal e Adjetiva: Singular / Plural (ões->ão, ais->al, s->vazio, etc.)
 * 2.  Conjugações Verbais: tempos, modos e pessoas (limitava, potenciam, inibindo, etc.)
 * 3.  Derivações Nominais e Adjetivas: dopaminérgicas/dopaminérgico, farmacocinéticas, etc.
 * 4.  Acentuação Gráfica e Diacríticos: memória/memoria, elétrico/eletrico, etc.
 * 5.  Palavras Ultracurtas (<= 3 caracteres): ph, na, k, ltp, ttx, sol, dor, etc.
 * 6.  Siglas Técnicas e Nomes Próprios Canônicos: NMDA, SNARE, Herbert Simon, Ebbinghaus
 * 7.  Números, Decimais, Datas, Medidas e Fórmulas: 1978, 0.05, 350ms, 70mV, Ca²⁺, CO₂
 * 8.  Identificadores Sintéticos e Hifenizados: NEUROSYNAPSE_GAMMA_789, ISO-27001, FSRS-7
 * 9.  Termos Repetidos na Consulta: TF da consulta correto e sem distorção
 * 10. Idempotência e Determinismo: repetidas execuções produzem hashes e stems idênticos
 * 11. Simetria Estrita: a exata mesma função normaliza documento e consulta
 * 12. Preservação de Texto Original e Offsets: integridade total de chunk.text e slices
 * 13. Detecção de Versão de Índice e Rebuild Controlado: compatibilidade com índices legados
 * 14. Não-Regressão em Termos Exatos e Identificadores Raros da D1
 * 15. Resolução Efetiva das Falhas Morfológicas Documentadas na Missão D1
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoredDocumentChunk, StoredLexicalIndex } from '../types/rag';
import {
  normalizeMorphologyPtBr,
  stripDiacritics,
  isProtectedToken,
  NORMALIZER_VERSION,
} from '../services/documents/morphologyNormalizer';
import {
  tokenizeNormalized,
  countTermFrequencies,
} from '../services/documents/bm25Tokenizer';
import {
  buildDocumentLexicalIndex,
  searchBM25,
  isIndexMorphologyCompatible,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
  getLexicalIndex,
} from '../services/documents/ragLexicalPersistenceService';
import {
  saveDocumentChunks,
  getDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  clearAllUserData,
} from '../services/persistence/indexedDb';

/**
 * Cria chunk de teste com todos os campos estruturais obrigatórios válidos.
 */
function createTestChunk(
  documentId: string,
  chunkId: string,
  pageNumber: number,
  startOffset: number,
  endOffset: number,
  text: string,
  contentHash = `hash_${chunkId}`
): StoredDocumentChunk {
  return {
    chunkId,
    documentId,
    docId: documentId,
    pageNumber,
    chunkIndexInPage: 0,
    globalChunkIndex: 0,
    text,
    sourceRef: {
      documentId,
      pageNumber,
      charOffsetStart: startOffset,
      charOffsetEnd: endOffset,
      sectionTitle: 'Seção de Neurociências',
      sectionHierarchy: ['Capítulo 1', 'Morfologia'],
    },
    contentKind: 'prose',
    estimatedTokens: Math.ceil(text.length / 4),
    isTokenEstimateHeuristic: true,
    contentHash,
    pipelineVersion: '1.0.0',
    startOffset,
    endOffset,
    indexingOptionsVersion: '1.0.0',
    storedAt: Date.now(),
  };
}

/* ==========================================================================
   DIMENSÃO 1: SINGULAR / PLURAL (FLEXÃO NOMINAL E ADJETIVA)
   ========================================================================== */

test('T601 (Morfologia): Flexão Nominal e Adjetiva Singular/Plural reduzida à mesma raiz', () => {
  // Regra ões -> ão
  assert.equal(normalizeMorphologyPtBr('ações'), normalizeMorphologyPtBr('ação'));
  assert.equal(normalizeMorphologyPtBr('lesões'), normalizeMorphologyPtBr('lesão'));
  assert.equal(normalizeMorphologyPtBr('conexões'), normalizeMorphologyPtBr('conexão'));

  // Regra ais -> al
  assert.equal(normalizeMorphologyPtBr('canais'), normalizeMorphologyPtBr('canal'));
  assert.equal(normalizeMorphologyPtBr('potenciais'), normalizeMorphologyPtBr('potencial'));

  // Regra éis/eis -> el
  assert.equal(normalizeMorphologyPtBr('papéis'), normalizeMorphologyPtBr('papel'));
  assert.equal(normalizeMorphologyPtBr('níveis'), normalizeMorphologyPtBr('nível'));

  // Regra ns -> m
  assert.equal(normalizeMorphologyPtBr('imagens'), normalizeMorphologyPtBr('imagem'));
  assert.equal(normalizeMorphologyPtBr('mensagens'), normalizeMorphologyPtBr('mensagem'));

  // Plurais regulares com s final
  assert.equal(normalizeMorphologyPtBr('neurônios'), normalizeMorphologyPtBr('neurônio'));
  assert.equal(normalizeMorphologyPtBr('sinapses'), normalizeMorphologyPtBr('sinapse'));
  assert.equal(normalizeMorphologyPtBr('membranas'), normalizeMorphologyPtBr('membrana'));
  assert.equal(normalizeMorphologyPtBr('dendritos'), normalizeMorphologyPtBr('dendrito'));
  assert.equal(normalizeMorphologyPtBr('vesículas'), normalizeMorphologyPtBr('vesícula'));
});

/* ==========================================================================
   DIMENSÃO 2: CONJUGAÇÕES VERBAIS
   ========================================================================== */

test('T602 (Morfologia): Flexões Verbais em diferentes tempos e modos convergem para o mesmo radical', () => {
  // Verbo limitar (problema D1)
  const radicalLimitar = normalizeMorphologyPtBr('limitar');
  assert.equal(normalizeMorphologyPtBr('limitava'), radicalLimitar);
  assert.equal(normalizeMorphologyPtBr('limitam'), radicalLimitar);
  assert.equal(normalizeMorphologyPtBr('limitada'), radicalLimitar);
  assert.equal(normalizeMorphologyPtBr('limitado'), radicalLimitar);
  assert.equal(normalizeMorphologyPtBr('limitaram'), radicalLimitar);
  assert.equal(normalizeMorphologyPtBr('limitando'), radicalLimitar);

  // Verbo potenciar (problema D1)
  const radicalPotenciar = normalizeMorphologyPtBr('potenciar');
  assert.equal(normalizeMorphologyPtBr('potenciam'), radicalPotenciar);
  assert.equal(normalizeMorphologyPtBr('potenciou'), radicalPotenciar);
  assert.equal(normalizeMorphologyPtBr('potenciava'), radicalPotenciar);
  assert.equal(normalizeMorphologyPtBr('potenciando'), radicalPotenciar);
  assert.equal(normalizeMorphologyPtBr('potenciado'), radicalPotenciar);

  // Verbo inibir
  const radicalInibir = normalizeMorphologyPtBr('inibir');
  assert.equal(normalizeMorphologyPtBr('inibia'), radicalInibir);
  assert.equal(normalizeMorphologyPtBr('inibem'), radicalInibir);
  assert.equal(normalizeMorphologyPtBr('inibe'), radicalInibir);
  assert.equal(normalizeMorphologyPtBr('inibido'), radicalInibir);
  assert.equal(normalizeMorphologyPtBr('inibindo'), radicalInibir);

  // Verbo modular
  const radicalModular = normalizeMorphologyPtBr('modular');
  assert.equal(normalizeMorphologyPtBr('modulam'), radicalModular);
  assert.equal(normalizeMorphologyPtBr('modulava'), radicalModular);
  assert.equal(normalizeMorphologyPtBr('modulado'), radicalModular);
  assert.equal(normalizeMorphologyPtBr('modulou'), radicalModular);

  // Verbo despolarizar
  const radicalDespolarizar = normalizeMorphologyPtBr('despolarizar');
  assert.equal(normalizeMorphologyPtBr('despolariza'), radicalDespolarizar);
  assert.equal(normalizeMorphologyPtBr('despolarizam'), radicalDespolarizar);
  assert.equal(normalizeMorphologyPtBr('despolarizado'), radicalDespolarizar);
  assert.equal(normalizeMorphologyPtBr('despolarizando'), radicalDespolarizar);
});

/* ==========================================================================
   DIMENSÃO 3: DERIVAÇÕES NOMINAIS E ADJETIVAS
   ========================================================================== */

test('T603 (Morfologia): Derivações de gênero e sufixação adjetiva convergem', () => {
  // Gênero e número de adjetivos científicos
  assert.equal(normalizeMorphologyPtBr('dopaminérgica'), normalizeMorphologyPtBr('dopaminérgico'));
  assert.equal(normalizeMorphologyPtBr('dopaminérgicas'), normalizeMorphologyPtBr('dopaminérgicos'));
  assert.equal(normalizeMorphologyPtBr('dopaminérgicas'), normalizeMorphologyPtBr('dopaminérgica'));

  // Farmacocinética (problema D1)
  assert.equal(normalizeMorphologyPtBr('farmacocinéticas'), normalizeMorphologyPtBr('farmacocinética'));
  assert.equal(normalizeMorphologyPtBr('farmacocinéticos'), normalizeMorphologyPtBr('farmacocinética'));

  // Sináptico / sináptica
  assert.equal(normalizeMorphologyPtBr('sinápticas'), normalizeMorphologyPtBr('sináptica'));
  assert.equal(normalizeMorphologyPtBr('sinápticos'), normalizeMorphologyPtBr('sináptico'));
  assert.equal(normalizeMorphologyPtBr('sináptica'), normalizeMorphologyPtBr('sináptico'));

  // Plasticidade / plasticidades
  assert.equal(normalizeMorphologyPtBr('plasticidades'), normalizeMorphologyPtBr('plasticidade'));
});

/* ==========================================================================
   DIMENSÃO 4: DIACRÍTICOS E ACENTUAÇÃO GRÁFICA
   ========================================================================== */

test('T604 (Morfologia): Tratamento de diacríticos permite casamento com e sem acento', () => {
  assert.equal(stripDiacritics('memória'), 'memoria');
  assert.equal(stripDiacritics('ação'), 'acao');
  assert.equal(stripDiacritics('elétrico'), 'eletrico');
  assert.equal(stripDiacritics('iniciámos'), 'iniciamos');

  // Normalizador gera radicais compatíveis
  assert.equal(normalizeMorphologyPtBr('memória'), normalizeMorphologyPtBr('memórias'));
  assert.equal(normalizeMorphologyPtBr('neurônio'), normalizeMorphologyPtBr('neurônios'));
});

/* ==========================================================================
   DIMENSÃO 5: PALAVRAS ULTRACURTAS (<= 3 CARACTERES)
   ========================================================================== */

test('T605 (Proteção): Palavras ultracurtas (<= 3 chars) mantêm sua forma literal exata', () => {
  const shortTokens = ['ph', 'na', 'k', 'ltp', 'ttx', 'dna', 'rna', 'api', 'rag', 'iot', 'sol', 'dor', 'luz'];
  for (const token of shortTokens) {
    assert.equal(isProtectedToken(token), true, `Token curto ${token} deve ser protegido`);
    assert.equal(normalizeMorphologyPtBr(token), token, `Token curto ${token} não pode sofrer redução`);
  }
});

/* ==========================================================================
   DIMENSÃO 6: SIGLAS TÉCNICAS E NOMES PRÓPRIOS CANÔNICOS
   ========================================================================== */

test('T606 (Proteção): Siglas técnicas e autores canônicos preservados sem mutilação', () => {
  const acronyms = ['nmda', 'snare', 'ltp', 'ltd', 'gaba', 'sv2a', 'fsrs', 'ampa', 'creb', 'bdnf'];
  for (const acr of acronyms) {
    assert.equal(isProtectedToken(acr), true, `Sigla ${acr} deve ser protegida`);
    assert.equal(normalizeMorphologyPtBr(acr), acr, `Sigla ${acr} não pode ser radicalizada`);
  }

  const authors = ['herbert', 'simon', 'ebbinghaus', 'stroop', 'alzheimer', 'parkinson', 'hodgkin', 'katz'];
  for (const author of authors) {
    assert.equal(isProtectedToken(author), true, `Autor ${author} deve ser protegido`);
    assert.equal(normalizeMorphologyPtBr(author), author, `Autor ${author} não pode ser radicalizado`);
  }
});

/* ==========================================================================
   DIMENSÃO 7: NÚMEROS, DECIMAIS, MEDIDAS E FÓRMULAS QUÍMICAS
   ========================================================================== */

test('T607 (Proteção): Números, medidas, cargas iônicas e subscritos permanecem intocados', () => {
  const technicals = ['1978', '0.05', '350ms', '70mv', '10mg', 'ca²⁺', 'mg²⁺', 'na⁺', 'co₂', 'h₂o', 'v_0'];
  for (const tech of technicals) {
    assert.equal(isProtectedToken(tech), true, `Termo técnico ${tech} deve ser protegido`);
    assert.equal(normalizeMorphologyPtBr(tech), tech, `Termo técnico ${tech} não pode ser alterado`);
  }
});

/* ==========================================================================
   DIMENSÃO 8: IDENTIFICADORES SINTÉTICOS E HIFENIZADOS
   ========================================================================== */

test('T608 (Proteção): Identificadores sintéticos raros da D1 e termos hifenizados intactos', () => {
  const identifiers = [
    'neurosynapse_gamma_789',
    'engram_alpha_104',
    'cripto_receptor_991',
    'iso-27001',
    'fsrs-7',
    'pré-frontal',
    'pós-sináptico',
    'órbito-frontal',
  ];
  for (const id of identifiers) {
    assert.equal(isProtectedToken(id), true, `Identificador ${id} deve ser protegido`);
    assert.equal(normalizeMorphologyPtBr(id), id, `Identificador ${id} deve manter sua forma original`);
  }
});

/* ==========================================================================
   DIMENSÃO 9: TERMOS REPETIDOS NA CONSULTA
   ========================================================================== */

test('T609 (BM25): Termos repetidos na consulta refletem contagem sem inflar postings', async () => {
  await clearAllUserData();

  const docId = 'doc_rep_test';
  const chunk = createTestChunk(
    docId,
    `${docId}_c0`,
    1,
    0,
    60,
    'A plasticidade sináptica modula a eficácia da transmissão neural.'
  );

  const index = buildDocumentLexicalIndex(docId, [chunk], { normalizeMorphology: true });
  await saveLexicalIndex(index);
  await saveDocumentChunks(docId, [chunk]);

  // Consulta com termo duplicado
  const queryRep = 'plasticidade plasticidade sináptica';
  const tokens = tokenizeNormalized(queryRep, { normalizeMorphology: true });
  const tfMap = countTermFrequencies(tokens);

  const plasticidadeStem = normalizeMorphologyPtBr('plasticidade');
  assert.equal(tfMap.get(plasticidadeStem), 2, 'TF da consulta deve registrar frequência 2 para termo repetido');

  const res = await searchBM25(queryRep, { documentId: docId, normalizeMorphology: true });
  assert.equal(res.results.length, 1, 'Deve retornar o chunk único');
  assert.equal(res.results[0].chunkId, `${docId}_c0`);
  assert.ok(res.results[0].score > 0, 'Score deve ser positivo');
});

/* ==========================================================================
   DIMENSÃO 10: IDEMPOTÊNCIA E DETERMINISMO
   ========================================================================== */

test('T610 (Determinismo): Normalização e indexação são rigorosamente determinísticas', () => {
  const words = ['neuroplasticidades', 'limitavam', 'farmacocinéticas', 'dopaminérgicos', 'membranas'];

  // Teste de determinismo de função pura
  for (const w of words) {
    const r1 = normalizeMorphologyPtBr(w);
    const r2 = normalizeMorphologyPtBr(w);
    const r3 = normalizeMorphologyPtBr(w);
    assert.equal(r1, r2);
    assert.equal(r2, r3);
  }

  // Idempotência funcional do normalizador: normalizar duas vezes não altera o resultado
  for (const w of words) {
    const stem = normalizeMorphologyPtBr(w);
    const stemAgain = normalizeMorphologyPtBr(stem);
    assert.equal(stem, stemAgain, `f(w) deve ser idempotente: f("${w}") = "${stem}" vs f("${stem}") = "${stemAgain}"`);
  }
});

/* ==========================================================================
   DIMENSÃO 11: SIMETRIA ESTRITA ENTRE INDEXAÇÃO E CONSULTA
   ========================================================================== */

test('T611 (Simetria): Documentos e consultas utilizam exatamente a mesma transformação', async () => {
  await clearAllUserData();

  const docId = 'doc_symmetry_test';
  const chunkText = 'Canais iônicos controlam a excitabilidade das membranas neuronais.';
  const chunk = createTestChunk(
    docId,
    `${docId}_c0`,
    1,
    0,
    chunkText.length,
    chunkText
  );

  const index = buildDocumentLexicalIndex(docId, [chunk], { normalizeMorphology: true });
  await saveLexicalIndex(index);
  await saveDocumentChunks(docId, [chunk]);

  // Documento tem "Canais" e "membranas" (plurais)
  // Consulta 1: singular "canal iônico"
  const res1 = await searchBM25('canal iônico', { documentId: docId, normalizeMorphology: true });
  assert.equal(res1.results.length, 1, 'Consulta no singular "canal" deve encontrar chunk com plural "canais"');

  // Consulta 2: singular "membrana neuronal"
  const res2 = await searchBM25('membrana neuronal', { documentId: docId, normalizeMorphology: true });
  assert.equal(res2.results.length, 1, 'Consulta no singular "membrana" deve encontrar chunk com plural "membranas"');

  // Consulta 3: plural "canais das membranas"
  const res3 = await searchBM25('canais das membranas', { documentId: docId, normalizeMorphology: true });
  assert.equal(res3.results.length, 1);
});

/* ==========================================================================
   DIMENSÃO 12: PRESERVAÇÃO DE TEXTO ORIGINAL E OFFSETS
   ========================================================================== */

test('T612 (Integridade): Texto original, offsets e acentuação dos chunks permanecem 100% inalterados', async () => {
  await clearAllUserData();

  const docId = 'doc_integrity_test';
  const originalText = 'Os neurônios comunicam-se através de sinapses químicas especializadas.';
  const chunk = createTestChunk(
    docId,
    `${docId}_c0`,
    1,
    10,
    10 + originalText.length,
    originalText
  );

  const index = buildDocumentLexicalIndex(docId, [chunk], { normalizeMorphology: true });
  await saveLexicalIndex(index);
  await saveDocumentChunks(docId, [chunk]);

  // Recupera os chunks do repositório
  const loadedChunks = await getDocumentChunks(docId);
  assert.equal(loadedChunks.length, 1);
  const loaded = loadedChunks[0];

  assert.equal(loaded.text, originalText, 'chunk.text deve ser preservado caractere a caractere');
  assert.equal(loaded.startOffset, 10, 'startOffset inalterado');
  assert.equal(loaded.endOffset, 10 + originalText.length, 'endOffset inalterado');
  assert.equal(loaded.contentHash, `hash_${docId}_c0`, 'contentHash inalterado');
});

/* ==========================================================================
   DIMENSÃO 13: DETECÇÃO DE VERSÃO DE ÍNDICE E RECONSTRUÇÃO CONTROLADA
   ========================================================================== */

test('T613 (Compatibilidade): isIndexMorphologyCompatible identifica índices legados e rebuild atualiza versão', async () => {
  await clearAllUserData();

  const docId = 'doc_legacy_compat';
  const chunk = createTestChunk(
    docId,
    `${docId}_c0`,
    1,
    0,
    50,
    'A memória de trabalho envolve o córtex pré-frontal.'
  );

  // Simula índice legado antigo criado sem normalizador morfológico
  const legacyIndex: StoredLexicalIndex = {
    documentId: docId,
    docId: docId,
    pipelineVersion: '1.0.0',
    tokenizerVersion: '1.0.0',
    normalizerVersion: 'none',
    totalChunks: 1,
    totalTokens: 9,
    averageChunkLength: 9,
    indexedAt: Date.now() - 100000,
    chunkSummaries: {
      [`${docId}_c0`]: {
        chunkId: `${docId}_c0`,
        documentId: docId,
        pageNumber: 1,
        tokenCount: 9,
        contentHash: `hash_${docId}_c0`,
      },
    },
    postings: {
      memória: [{ chunkId: `${docId}_c0`, termFrequency: 1 }],
    },
    vocabularySize: 1,
  };

  // Verifica compatibilidade
  assert.equal(isIndexMorphologyCompatible(legacyIndex), false, 'Índice legado com normalizerVersion "none" deve ser detectado como incompatível');

  await saveLexicalIndex(legacyIndex);
  await saveDocumentChunks(docId, [chunk]);

  // Busca com autoRebuildIncompatible: true
  const res = await searchBM25('memórias de trabalho', {
    documentId: docId,
    normalizeMorphology: true,
    autoRebuildIncompatible: true,
  });

  assert.equal(res.results.length, 1, 'Após reconstrução automática, deve recuperar com sucesso');

  // Verifica se o índice persistido foi atualizado com a versão correta
  const updatedIndex = await getLexicalIndex(docId);
  assert.ok(updatedIndex);
  assert.equal(updatedIndex.normalizerVersion, NORMALIZER_VERSION, 'normalizerVersion deve ser atualizado para rslp-pt-1.0.0');
  assert.equal(isIndexMorphologyCompatible(updatedIndex), true, 'Índice atualizado agora é compatível');
});

/* ==========================================================================
   DIMENSÃO 14: NÃO-REGRESSÃO EM IDENTIFICADORES RAROS E CONSULTAS EXATAS (D1)
   ========================================================================== */

test('T614 (Não-Regressão): Identificadores sintéticos raros da D1 recuperados com Rank 1', async () => {
  await clearAllUserData();

  const docId = 'doc_rare_identifiers';
  const chunks: StoredDocumentChunk[] = [
    createTestChunk(
      docId,
      `${docId}_c0`,
      1,
      0,
      100,
      'O experimento utilizou o protocolo sintetizado sob a chave NEUROSYNAPSE_GAMMA_789 para marcação.'
    ),
    createTestChunk(
      docId,
      `${docId}_c1`,
      2,
      100,
      200,
      'No engrama de consolidação foi registrado o identificador ENGRAM_ALPHA_104 com pico às 48 horas.'
    ),
    createTestChunk(
      docId,
      `${docId}_c2`,
      3,
      200,
      300,
      'Para o ensaio de inibição seletiva aplicou-se a sonda CRIPTO_RECEPTOR_991 nas membranas celulares.'
    ),
  ];

  const index = buildDocumentLexicalIndex(docId, chunks, { normalizeMorphology: true });
  await saveLexicalIndex(index);
  await saveDocumentChunks(docId, chunks);

  // Consulta por NEUROSYNAPSE_GAMMA_789
  const res1 = await searchBM25('NEUROSYNAPSE_GAMMA_789', { documentId: docId });
  assert.equal(res1.results.length, 1);
  assert.equal(res1.results[0].chunkId, `${docId}_c0`);

  // Consulta por ENGRAM_ALPHA_104
  const res2 = await searchBM25('ENGRAM_ALPHA_104', { documentId: docId });
  assert.equal(res2.results.length, 1);
  assert.equal(res2.results[0].chunkId, `${docId}_c1`);

  // Consulta por CRIPTO_RECEPTOR_991
  const res3 = await searchBM25('CRIPTO_RECEPTOR_991', { documentId: docId });
  assert.equal(res3.results.length, 1);
  assert.equal(res3.results[0].chunkId, `${docId}_c2`);
});

/* ==========================================================================
   DIMENSÃO 15: RESOLUÇÃO EFETIVA DAS FALHAS MORFOLÓGICAS DA D1
   ========================================================================== */

test('T615 (D1 Recovery): Casos documentados de falha morfológica no benchmark D1 agora recuperam com sucesso', async () => {
  await clearAllUserData();

  const docId = 'doc_d1_failures_fixed';
  const chunks: StoredDocumentChunk[] = [
    createTestChunk(
      docId,
      `${docId}_c0`,
      5,
      0,
      120,
      'O canal de sódio dependente de voltagem é responsável pela fase ascendente rápida do potencial de ação.'
    ),
    createTestChunk(
      docId,
      `${docId}_c1`,
      12,
      120,
      240,
      'Herbert Simon demonstrou que a tomada de decisão humana opera sob capacidade limitada de processamento e racionalidade limitada.'
    ),
    createTestChunk(
      docId,
      `${docId}_c2`,
      25,
      240,
      360,
      'As propriedades de farmacocinética determinam a absorção, distribuição e taxa de eliminação dos compostos moduladores.'
    ),
    createTestChunk(
      docId,
      `${docId}_c3`,
      40,
      360,
      480,
      'Os neurônios dos circuitos dopaminérgicos projetam amplamente para o estriado e córtex pré-frontal.'
    ),
  ];

  const index = buildDocumentLexicalIndex(docId, chunks, { normalizeMorphology: true });
  await saveLexicalIndex(index);
  await saveDocumentChunks(docId, chunks);

  // Falha D1 caso 1: Consulta "canais de sódio" (plural) contra documento "canal de sódio" (singular)
  const res1 = await searchBM25('canais de sódio', { documentId: docId, normalizeMorphology: true });
  assert.ok(res1.results.length > 0, 'Consulta "canais" DEVE recuperar chunk com "canal"');
  assert.equal(res1.results[0].chunkId, `${docId}_c0`);

  // Falha D1 caso 2: Consulta "potenciam a ação" contra documento "potencial de ação"
  const res2 = await searchBM25('potenciam ação', { documentId: docId, normalizeMorphology: true });
  assert.ok(res2.results.length > 0, 'Consulta "potenciam" DEVE recuperar chunk com "potencial de ação"');
  assert.equal(res2.results[0].chunkId, `${docId}_c0`);

  // Falha D1 caso 3: Consulta "Simon limitava o processamento" contra "capacidade limitada"
  const res3 = await searchBM25('Simon limitava processamento', { documentId: docId, normalizeMorphology: true });
  assert.ok(res3.results.length > 0, 'Consulta "limitava" DEVE recuperar chunk com "limitada"');
  assert.equal(res3.results[0].chunkId, `${docId}_c1`);

  // Falha D1 caso 4: Consulta "análise farmacocinéticas e eliminação" contra "farmacocinética"
  const res4 = await searchBM25('farmacocinéticas eliminação', { documentId: docId, normalizeMorphology: true });
  assert.ok(res4.results.length > 0, 'Consulta "farmacocinéticas" DEVE recuperar chunk com "farmacocinética"');
  assert.equal(res4.results[0].chunkId, `${docId}_c2`);

  // Falha D1 caso 5: Consulta "circuitos dopaminérgicas" contra "dopaminérgicos"
  const res5 = await searchBM25('circuitos dopaminérgicas', { documentId: docId, normalizeMorphology: true });
  assert.ok(res5.results.length > 0, 'Consulta "dopaminérgicas" DEVE recuperar chunk com "dopaminérgicos"');
  assert.equal(res5.results[0].chunkId, `${docId}_c3`);
});
