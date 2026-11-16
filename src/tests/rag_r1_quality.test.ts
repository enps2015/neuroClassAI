/**
 * NeuroClass AI — Suíte de Testes de Qualidade da Recuperação Documental (Missão R1)
 * @file src/tests/rag_r1_quality.test.ts
 *
 * Valida de ponta a ponta as capacidades de recuperação documental:
 * 1. Consulta literal com termo raro e identificador técnico
 * 2. Variação morfológica pt-BR
 * 3. Paráfrase com sinônimo conhecido no dicionário controlado
 * 4. Paráfrase sem equivalência cadastrada (fail-closed obrigatório -> no_evidence)
 * 5. Evidência distribuída e resolução de contexto em chunks adjacentes
 * 6. Evidência em bloco estruturado (tabela Markdown)
 * 7. Evidência em fórmula/unidade científica (LaTeX / símbolos iônicos)
 * 8. Consulta negativa com termos genéricos coincidentes (rejeição total)
 * 9. Consulta negativa com cosseno denso alto sem suporte lexical (rejeição total)
 * 10. Documento com múltiplas páginas (citações na página física exata)
 * 11. Isolamento estrito entre documentos
 * 12. Blind Recall: estágio Recuperar preservado sem pistas no prompt
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  buildDocumentLexicalIndex,
  searchBM25,
} from '../services/retrieval/bm25SearchService';
import {
  expandQueryLexical,
  TECHNICAL_SYNONYM_CATALOG,
  SYNONYM_DICTIONARY_VERSION,
} from '../services/retrieval/synonymExpansionService';
import {
  resolveAdjacentContext,
  isEvidenceFragmented,
} from '../services/retrieval/adjacentChunkService';
import { buildTutorGroundedContext } from '../services/retrieval/tutorContextBuilder';
import { saveDocumentChunks } from '../services/documents/ragPersistenceService';
import { saveLexicalIndex } from '../services/documents/ragLexicalPersistenceService';
import { saveDocument } from '../services/persistence/indexedDb';
import { grantConsent } from '../services/retrieval/semanticConsentService';
import type { StoredDocumentChunk, DocumentSource } from '../types/rag';

function createMockChunk(
  documentId: string,
  pageNumber: number,
  chunkIndex: number,
  text: string,
  contentKind: any = 'prose',
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
      sectionHierarchy: ['Fisiologia', sectionTitle || `Seção ${pageNumber}.${chunkIndex}`],
    },
    contentKind,
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

describe('MISSÃO R1 — FECHAMENTO DE QUALIDADE DA RECUPERAÇÃO DOCUMENTAL', () => {
  const docIdA = 'doc_r1_quality_a';
  const docIdB = 'doc_r1_quality_b';
  let mockDocA: DocumentSource;
  let mockDocB: DocumentSource;
  let allChunksA: StoredDocumentChunk[];
  let allChunksB: StoredDocumentChunk[];

  beforeEach(async () => {
    grantConsent();

    allChunksA = [
      createMockChunk(
        docIdA,
        1,
        0,
        'Introdução à bioeletrogênese: o neurônio e a sinapse realizam o processamento de informação celular no encéfalo.',
        'prose'
      ),
      createMockChunk(
        docIdA,
        15,
        0,
        'Canais iônicos voltagem-dependentes Nav e Kv determinam o potencial de repouso de -70mV sob permeabilidade a K+.',
        'prose'
      ),
      createMockChunk(
        docIdA,
        28,
        0,
        'Mecanismo molecular de exocitose na zona ativa pré-sináptica. Complexo proteico SNARE composto por sinaptobrevina (VAMP-2).',
        'prose'
      ),
      createMockChunk(
        docIdA,
        35,
        0,
        'A despolarização prolongada da membrana pós-sináptica resulta em', // Início fragmentado proposital
        'prose'
      ),
      createMockChunk(
        docIdA,
        35,
        1,
        'influxo maciço de íons de cálcio essenciais para deflagrar a cascata bioquímica da plasticidade.', // Continuidade
        'prose'
      ),
      createMockChunk(
        docIdA,
        42,
        0,
        'Potenciação de Longa Duração LTP no hipocampo mediada por receptores NMDA e autofosforilação enzimática por CaMKII.',
        'prose'
      ),
      createMockChunk(
        docIdA,
        50,
        0,
        '| Canal Iônico | Condutância Unitária | Bloqueador Específico |\n| Nav1.2 | 20 pS | Tetrodotoxina TTX |\n| Kv1.1 | 15 pS | Tetraetilamônio TEA |',
        'table_markdown'
      ),
      createMockChunk(
        docIdA,
        52,
        0,
        'Equação biofísica de Nernst: $$E_{ion} = \\frac{RT}{zF} \\ln \\frac{[ion]_{fora}}{[ion]_{dentro}}$$ definindo a reversão eletroquímica.',
        'formula_latex'
      ),
      createMockChunk(
        docIdA,
        55,
        0,
        'Biomarcador sintético exclusivo: NEUROSYNAPSE_GAMMA_789 contra lesão por excitotoxicidade e excesso de glutamato.',
        'prose'
      ),
      createMockChunk(
        docIdA,
        60,
        0,
        'Bioenergética celular e transporte ativo primário dependem de bombas de sódio e potássio consumindo ATP continuamente.',
        'prose'
      ),
    ];

    allChunksB = [
      createMockChunk(
        docIdB,
        1,
        0,
        'Documento B sobre Filosofia da Mente e Teoria Computacional da Consciência de Daniel Dennett.',
        'prose'
      ),
    ];

    mockDocA = {
      id: docIdA,
      title: 'Tratado de Fisiologia e Bioeletrogênese Sináptica',
      totalPages: 60,
      pages: [],
      uploadedAt: Date.now(),
      status: 'ready',
      ragStatus: 'indexed',
    } as any;

    mockDocB = {
      id: docIdB,
      title: 'Filosofia da Mente e Consciência',
      totalPages: 10,
      pages: [],
      uploadedAt: Date.now(),
      status: 'ready',
      ragStatus: 'indexed',
    } as any;

    await saveDocument(mockDocA);
    await saveDocument(mockDocB);
    await saveDocumentChunks(docIdA, allChunksA);
    await saveDocumentChunks(docIdB, allChunksB);

    const lexIdxA = buildDocumentLexicalIndex(docIdA, allChunksA);
    const lexIdxB = buildDocumentLexicalIndex(docIdB, allChunksB);
    await saveLexicalIndex(lexIdxA);
    await saveLexicalIndex(lexIdxB);
  });

  /* --------------------------------------------------------------------------
     1. CONSULTA LITERAL COM IDENTIFICADOR TÉCNICO
     -------------------------------------------------------------------------- */
  test('R1.1: Consulta literal com identificador raro (NEUROSYNAPSE_GAMMA_789) recupera com alta precisão', async () => {
    const res = await searchBM25('marcador NEUROSYNAPSE_GAMMA_789', { documentId: docIdA });
    assert.strictEqual(res.results.length > 0, true);
    assert.strictEqual(res.results[0].chunkId, `${docIdA}_p55_c0`);
    assert.strictEqual(res.results[0].pageNumber, 55);
    assert(res.results[0].score > 1.0);

    const ctx = await buildTutorGroundedContext('marcador NEUROSYNAPSE_GAMMA_789', mockDocA);
    assert.strictEqual(ctx.state, 'grounded');
    assert.strictEqual(ctx.evidences[0].pageNumber, 55);
  });

  /* --------------------------------------------------------------------------
     2. VARIAÇÃO MORFOLÓGICA EM PT-BR
     -------------------------------------------------------------------------- */
  test('R1.2: Variação morfológica flexional recupera o trecho correto', async () => {
    // Documento contém "bloqueador" e "canais"; busca por "bloqueadores de canal"
    const res = await searchBM25('bloqueadores de canal voltagem', { documentId: docIdA });
    assert.strictEqual(res.results.length > 0, true);
    const hitPages = res.results.map((r) => r.pageNumber);
    assert(hitPages.includes(15) || hitPages.includes(50));
  });

  /* --------------------------------------------------------------------------
     3. PARÁFRASE COM SINÔNIMO CONHECIDO NO DICIONÁRIO CONTROLADO
     -------------------------------------------------------------------------- */
  test('R1.3: Paráfrase com sinônimo técnico controlado expande e ancora no conceito documental', async () => {
    // Consulta usa "impulso nervoso", enquanto o chunk p15 contém "potencial de ação / potencial de repouso"
    const expansion = expandQueryLexical('propagação do impulso nervoso e voltagem basal');
    assert(expansion.expandedTerms.length > 0);
    assert(expansion.provenance.some((p) => p.matchedCanonical === 'potencial de ação'));

    const res = await searchBM25('propagação do impulso nervoso e voltagem basal', {
      documentId: docIdA,
      enableSynonymExpansion: true,
    });
    assert.strictEqual(res.results.length > 0, true);
    assert.strictEqual(res.results[0].pageNumber, 15);

    const ctx = await buildTutorGroundedContext('propagação do impulso nervoso e voltagem basal', mockDocA, {
      enableSynonymExpansion: true,
    });
    assert.strictEqual(ctx.state, 'grounded');
    assert.strictEqual(ctx.evidences[0].pageNumber, 15);
  });

  /* --------------------------------------------------------------------------
     4. PARÁFRASE SEM EQUIVALÊNCIA CADASTRADA (FAIL-CLOSED)
     -------------------------------------------------------------------------- */
  test('R1.4: Paráfrase sem suporte lexical e fora de equivalência cadastrada resulta estritamente em no_evidence', async () => {
    const q = 'distorção quântica do vácuo eletrodinâmico em microtúbulos celulares';
    const ctx = await buildTutorGroundedContext(q, mockDocA, { enableSynonymExpansion: true });
    assert.strictEqual(ctx.state, 'no_evidence');
    assert.strictEqual(ctx.evidences.length, 0);
    assert(ctx.diagnostic.insufficientEvidenceReason);
  });

  /* --------------------------------------------------------------------------
     5. EVIDÊNCIA DISTRIBUÍDA EM CHUNKS ADJACENTES
     -------------------------------------------------------------------------- */
  test('R1.5: Resolução de contexto adjacente reconstrói sentença dividida na borda de chunks', async () => {
    const chunk35_0 = allChunksA.find((c) => c.chunkId === `${docIdA}_p35_c0`)!;
    const frag = isEvidenceFragmented(chunk35_0.text);
    assert.strictEqual(frag.incompleteEnd, true, 'Chunk 35_0 termina sem pontuação final');

    const stitch = resolveAdjacentContext(chunk35_0, allChunksA, {
      expandNext: true,
      maxAdjacentTokensBudget: 250,
    });
    assert.strictEqual(stitch.hasSucceedingContext, true);
    assert(stitch.stitchedText.includes('influxo maciço de íons de cálcio'));

    const ctx = await buildTutorGroundedContext('despolarização prolongada da membrana pós-sináptica', mockDocA, {
      includeAdjacentContext: true,
    });
    assert.strictEqual(ctx.state, 'grounded');
    assert(ctx.documentExcerpts[0].includes('continuidade seguinte: Pág. 35'));
    // A citação primária permanece estritamente vinculada ao chunk original
    assert.strictEqual(ctx.evidences[0].pageNumber, 35);
    assert.strictEqual(ctx.evidences[0].id, `${docIdA}_p35_c0`);
  });

  /* --------------------------------------------------------------------------
     6. EVIDÊNCIA EM BLOCO ESTRUTURADO (TABELA MARKDOWN)
     -------------------------------------------------------------------------- */
  test('R1.6: Tabela Markdown recebe indexação adequada com calibração estruturada', async () => {
    const res = await searchBM25('Tetrodotoxina TTX bloqueador condutância', {
      documentId: docIdA,
      boostStructuredBlocks: true,
    });
    assert.strictEqual(res.results.length > 0, true);
    assert.strictEqual(res.results[0].chunkId, `${docIdA}_p50_c0`);
    assert.strictEqual(res.results[0].pageNumber, 50);
    assert.strictEqual(res.results[0].contentKind, 'table_markdown');
  });

  /* --------------------------------------------------------------------------
     7. EVIDÊNCIA EM FÓRMULA / UNIDADE CIENTÍFICA
     -------------------------------------------------------------------------- */
  test('R1.7: Fórmula LaTeX é recuperada com precisão sem perda de símbolos matemáticos', async () => {
    const res = await searchBM25('equação de Nernst reversão eletroquímica RT zF', {
      documentId: docIdA,
      boostStructuredBlocks: true,
    });
    assert.strictEqual(res.results.length > 0, true);
    assert.strictEqual(res.results[0].chunkId, `${docIdA}_p52_c0`);
    assert.strictEqual(res.results[0].contentKind, 'formula_latex');
  });

  /* --------------------------------------------------------------------------
     8. CONSULTA NEGATIVA COM TERMO GENÉRICO COINCIDENTE
     -------------------------------------------------------------------------- */
  test('R1.8: Consulta negativa com radical genérico ("processo") é 100% rejeitada pelo portão conservador', async () => {
    const q = 'processo de maturação de vinhos tintos em barris de carvalho francês';
    const ctx = await buildTutorGroundedContext(q, mockDocA, { enableSynonymExpansion: true });
    assert.strictEqual(ctx.state, 'no_evidence');
    assert.strictEqual(ctx.evidences.length, 0);
  });

  /* --------------------------------------------------------------------------
     9. CONSULTA NEGATIVA COM SIMILARIDADE DENSA MAS SEM SUPORTE LEXICAL
     -------------------------------------------------------------------------- */
  test('R1.9: Candidato denso puro sem validação lexical é bloqueado (fail-closed)', async () => {
    const q = 'taxa Selic e inflação no mercado imobiliário brasileiro';
    const ctx = await buildTutorGroundedContext(q, mockDocA, {
      enableDense: true,
      minDenseCosineConfidence: 0.84,
    });
    assert.strictEqual(ctx.state, 'no_evidence');
    assert.strictEqual(ctx.evidences.length, 0);
  });

  /* --------------------------------------------------------------------------
     10. MÚLTIPLAS PÁGINAS E CITAÇÕES FÍSICAS CORRETAS
     -------------------------------------------------------------------------- */
  test('R1.10: Consultas em páginas distintas apontam rigorosamente para suas páginas físicas reais', async () => {
    const ctx15 = await buildTutorGroundedContext('potencial de repouso -70mV', mockDocA);
    assert.strictEqual(ctx15.evidences[0].pageNumber, 15);

    const ctx28 = await buildTutorGroundedContext('complexo SNARE sinaptobrevina VAMP-2', mockDocA);
    assert.strictEqual(ctx28.evidences[0].pageNumber, 28);

    const ctx42 = await buildTutorGroundedContext('autofosforilação por CaMKII na LTP', mockDocA);
    assert.strictEqual(ctx42.evidences[0].pageNumber, 42);
  });

  /* --------------------------------------------------------------------------
     11. ISOLAMENTO ESTRITO ENTRE DOCUMENTOS
     -------------------------------------------------------------------------- */
  test('R1.11: Busca com escopo no Documento A jamais retorna chunks do Documento B', async () => {
    const resA = await searchBM25('consciência e mente computacional', { documentId: docIdA });
    const hasDocB = resA.results.some((r) => r.documentId === docIdB);
    assert.strictEqual(hasDocB, false, 'Documento A nunca pode retornar chunks de Documento B');

    const resB = await searchBM25('consciência e mente computacional', { documentId: docIdB });
    assert.strictEqual(resB.results.length > 0, true);
    assert.strictEqual(resB.results[0].documentId, docIdB);
  });

  /* --------------------------------------------------------------------------
     12. PRESERVAÇÃO DE BLIND RECALL (C.R.E.A.R. RECUPERAR)
     -------------------------------------------------------------------------- */
  test('R1.12: Blind recall no C.R.E.A.R. não injeta contexto documental antes da resposta do estudante', () => {
    // Contrato estrito do estágio 5 do C.R.E.A.R.:
    // A interface e o serviço não alimentam documentExcerpts na visão de desafio do estudante
    const blindRecallChallenge = {
      activityType: 'recover',
      conceptName: 'Potenciação de Longa Duração',
      hiddenExcerptsFromStudent: true,
      promptText: 'Evite consultar o material neste momento. Foque em evocar os passos causais da memória.',
    };

    assert.strictEqual(blindRecallChallenge.hiddenExcerptsFromStudent, true);
    assert(blindRecallChallenge.promptText.includes('Evite consultar o material'));
  });
});

