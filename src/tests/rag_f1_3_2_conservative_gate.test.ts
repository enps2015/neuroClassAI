/**
 * NeuroClass AI — Suíte de Testes do Portão Lexical Conservador (Missão F1.3.2)
 * @module tests/rag_f1_3_2_conservative_gate.test
 *
 * Validação rigorosa dos princípios do Portão Lexical Conservador:
 * 1. Uma única correspondência lexical genérica NÃO basta (processo, mecanismo, propriedades, consumo, fosforilação);
 * 2. Repetição do mesmo termo em múltiplos chunks NÃO conta como múltiplos termos distintos;
 * 3. Exige pelo menos dois termos distintos da consulta OU um termo técnico discriminativo;
 * 4. Os termos genéricos NÃO são bloqueados quando acompanhados por termos informativos;
 * 5. Eliminação comprovada dos 6 falsos grounded residuais de F1.3.1 (N02, N07, N08, N09, N13, N14).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  evaluateConservativeLexicalSupport,
  GENERIC_SCIENTIFIC_STEMS,
  buildTutorGroundedContext,
} from '../services/retrieval/tutorContextBuilder';
import {
  grantConsent,
  revokeConsent,
} from '../services/retrieval/semanticConsentService';
import {
  saveDenseEmbeddings,
} from '../services/documents/ragDensePersistenceService';
import {
  saveDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  buildDocumentLexicalIndex,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
} from '../services/documents/ragLexicalPersistenceService';
import {
  saveDocument,
} from '../services/persistence/indexedDb';
import {
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
      sectionHierarchy: ['Fisiologia', sectionTitle || `Seção ${pageNumber}.${chunkIndex}`],
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

describe('MISSÃO F1.3.2 — PORTÃO LEXICAL CONSERVADOR', () => {
  const docId = 'doc_f1_3_2_gate_test';
  let mockDoc: DocumentSource;
  let allChunks: StoredDocumentChunk[];

  beforeEach(async () => {
    grantConsent();

    allChunks = [
      createMockChunk(docId, 1, 0, 'Introdução: o neurônio e a sinapse realizam o processamento de informação celular.'),
      createMockChunk(docId, 2, 0, 'Bioenergética: a sinalização celular depende de bombas consumindo ATP constantemente.'),
      createMockChunk(docId, 3, 0, 'Bioenergética continuada: homeostase mantida por bombas consumindo ATP sob demanda.'),
      createMockChunk(docId, 4, 0, 'Bioenergética avançada: transporte de íons consumindo ATP em repouso basal.'),
      createMockChunk(docId, 15, 0, 'Canais iônicos voltagem-dependentes Nav e Kv determinam o potencial de repouso.'),
      createMockChunk(docId, 28, 0, 'Mecanismo molecular de exocitose na zona ativa mediado pelo complexo SNARE.'),
      createMockChunk(docId, 42, 0, 'Potenciação de Longa Duração LTP envolvendo receptores NMDA e fosforilação por CaMKII.'),
      createMockChunk(docId, 50, 0, 'Propriedades biofísicas de canais iônicos e bloqueadores farmacológicos como TTX e TEA.'),
      createMockChunk(docId, 55, 0, 'Biomarcador específico: NEUROSYNAPSE_GAMMA_789 contra excitotoxicidade.'),
    ];

    mockDoc = {
      id: docId,
      title: 'Tratado de Fisiologia e Bioenergética',
      totalPages: 60,
      pages: allChunks.map((c) => ({
        pageNumber: c.pageNumber,
        textContent: c.text,
        isScanned: false,
        legibility: 'clean',
      })),
      uploadedAt: Date.now(),
      status: 'ready',
      ragStatus: 'indexed',
    };

    await saveDocument(mockDoc);
    await saveDocumentChunks(docId, allChunks);
    const lexIdx = buildDocumentLexicalIndex(docId, allChunks);
    await saveLexicalIndex(lexIdx);

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
     1. RADICAL GENÉRICO ISOLADO: NÃO BASTA
     -------------------------------------------------------------------------- */
  test('G1: Correspondência de um único radical genérico (process, mecan, etc.) é rejeitada', () => {
    for (const genericStem of GENERIC_SCIENTIFIC_STEMS) {
      const evalResult = evaluateConservativeLexicalSupport({
        matchedTerms: [genericStem],
        bm25Score: 3.5,
      });
      assert.strictEqual(evalResult.accepted, false, `Radical genérico isolado "${genericStem}" deve ser rejeitado`);
      assert(evalResult.reason.includes('isolated_generic_term'));
    }
  });

  /* --------------------------------------------------------------------------
     2. REPETIÇÃO DO MESMO TERMO NÃO CONTA COMO MÚLTIPLOS TERMOS
     -------------------------------------------------------------------------- */
  test('G2: Repetição do mesmo termo em lista de matches NÃO conta como termos múltiplos', () => {
    const evalResult = evaluateConservativeLexicalSupport({
      matchedTerms: ['process', 'process', 'process'], // 3 ocorrências do mesmo termo
      bm25Score: 5.2,
    });
    assert.strictEqual(evalResult.accepted, false, 'Repetição do mesmo termo não deve inflar contagem');
    assert.strictEqual(evalResult.distinctTerms.length, 1);
  });

  /* --------------------------------------------------------------------------
     3. DOIS TERMOS DISTINTOS: UM GENÉRICO + UM INFORMATIVO É ACEITO
     -------------------------------------------------------------------------- */
  test('G3: Termo genérico acompanhado de termo informativo é plenamente aceito', () => {
    // 'propriedad' (genérico) acompanhado de 'ionic' (informativo)
    const evalResult = evaluateConservativeLexicalSupport({
      matchedTerms: ['propriedad', 'ionic'],
      bm25Score: 4.8,
    });
    assert.strictEqual(evalResult.accepted, true, 'Propriedades iônicas deve ser aceito');
    assert(evalResult.reason.includes('multi_term_support'));
  });

  /* --------------------------------------------------------------------------
     4. DOIS TERMOS GENÉRICOS SEM NENHUM INFORMATIVO SÃO REJEITADOS
     -------------------------------------------------------------------------- */
  test('G4: Dois termos que são ambos genéricos são rejeitados', () => {
    const evalResult = evaluateConservativeLexicalSupport({
      matchedTerms: ['process', 'mecan'],
      bm25Score: 4.0,
    });
    assert.strictEqual(evalResult.accepted, false, 'Dois termos genéricos sem termo informativo devem ser rejeitados');
    assert(evalResult.reason.includes('all_terms_generic'));
  });

  /* --------------------------------------------------------------------------
     5. TERMO TÉCNICO DISCRIMINATIVO ISOLADO É ACEITO
     -------------------------------------------------------------------------- */
  test('G5: Identificador raro ou termo técnico específico isolado é aceito pelo portão', () => {
    const evalResult = evaluateConservativeLexicalSupport({
      matchedTerms: ['neurosynapse_gamma_789'],
      bm25Score: 7.5,
    });
    assert.strictEqual(evalResult.accepted, true, 'Identificador discriminativo raro deve ser aceito');
    assert(evalResult.reason.includes('discriminative_single_term'));
  });

  /* --------------------------------------------------------------------------
     6. ELIMINAÇÃO COMPROVADA DOS 6 FALSOS POSITIVOS DE F1.3.1
     -------------------------------------------------------------------------- */
  test('G6: Os 6 falsos grounded residuais de F1.3.1 resultam em no_evidence no Tutor', async () => {
    const residualNegatives = [
      { id: 'N02', q: 'processo de fermentação láctica na fabricação de queijos artesanais' },
      { id: 'N07', q: 'ciclo de Krebs e fosforilação oxidativa em mitocôndrias de leveduras cervejeiras' },
      { id: 'N08', q: 'mecanismo de refração da luz em lentes gravitacionais no espaço profundo' },
      { id: 'N09', q: 'reforma tributária sobre consumo e imposto sobre valor agregado IVA' },
      { id: 'N13', q: 'propriedades aerodinâmicas de asas enflechadas em aeronaves comerciais subsônicas' },
      { id: 'N14', q: 'processamento de sinais de radar Doppler para previsão meteorológica de ciclones' },
    ];

    for (const item of residualNegatives) {
      const ctx = await buildTutorGroundedContext(item.q, mockDoc, { enableDense: true });
      assert.strictEqual(
        ctx.state,
        'no_evidence',
        `Consulta ${item.id} ("${item.q}") DEVE retornar no_evidence, obtido ${ctx.state}`
      );
      assert.strictEqual(ctx.evidences.length, 0, `Consulta ${item.id} não pode ter evidências`);
    }
  });

  /* --------------------------------------------------------------------------
     7. PRESERVAÇÃO DE CONSULTAS POSITIVAS COM CITAÇÕES ÍNTEGRAS
     -------------------------------------------------------------------------- */
  test('G7: Consulta positiva com identificador ou suporte multi-termo preserva grounded e citação', async () => {
    const ctx = await buildTutorGroundedContext('marcador NEUROSYNAPSE_GAMMA_789', mockDoc, {
      enableDense: true,
    });
    assert.strictEqual(ctx.state, 'grounded');
    assert.strictEqual(ctx.evidences.length, 1);
    assert.strictEqual(ctx.evidences[0].pageNumber, 55);
    assert(ctx.documentExcerpts[0].includes('NEUROSYNAPSE_GAMMA_789'));
  });
});

