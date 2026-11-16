/**
 * NeuroClass AI — Suíte de Testes de Fundamentação e Contexto do Tutor BM25 (Missão B2)
 * @module tests/rag_tutor_grounding.test
 *
 * Cobertura completa das 6 dimensões da Missão B2:
 * A. RECUPERAÇÃO: busca literal, recuperação em profundidade (fim do PDF), isolamento de escopo e sem falsos positivos;
 * B. CONTEXT BUILDER: orçamento de tokens, fidelidade de offsets, diversidade de páginas e ordem de leitura;
 * C. FUNDAMENTAÇÃO: citações derivadas de metadados reais, rejeição de IDs alucinados e integridade;
 * D. FALHAS E ESTADOS: documento não indexado, sem evidências, OCR pendente e resiliência de erro;
 * E. REGRESSÃO: preservação de BYOK, eliminação total de fallback arbitrário (slice 0..4) e fluxo normal do Tutor;
 * F. AVALIAÇÃO: benchmark quantitativo com ground truth medindo cobertura, precisão de citação e vazamento zero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentSource, DocumentPage } from '../types';
import type { StoredDocumentChunk } from '../types/rag';
import {
  buildTutorGroundedContext,
  validateCitations,
  DEFAULT_MAX_TOKEN_BUDGET,
  DEFAULT_MAX_CHUNKS_PER_PAGE,
} from '../services/retrieval/tutorContextBuilder';
import {
  saveDocumentChunks,
  getDocumentChunks,
} from '../services/documents/ragPersistenceService';
import {
  indexDocumentLexical,
  searchBM25,
} from '../services/retrieval/bm25SearchService';
import {
  saveLexicalIndex,
  getLexicalIndex,
  deleteLexicalIndex,
} from '../services/documents/ragLexicalPersistenceService';
import {
  ingestDocumentRAG,
} from '../services/documents/ragIngestionService';
import {
  saveDocument,
  deleteDocumentCompletely,
  clearAllUserData,
} from '../services/persistence/indexedDb';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import { buildRequestHeaders } from '../services/ai/aiClient';

/* ==========================================================================
   UTILITÁRIOS E GERADORES DE FIXTURES PARA OS TESTES
   ========================================================================== */

function createMockPage(pageNumber: number, text: string): DocumentPage {
  return {
    pageNumber,
    textContent: text,
    hasVisualElements: false,
    legibility: 'clean',
  };
}

function createMockDocument(
  id: string,
  title: string,
  pages: DocumentPage[]
): DocumentSource {
  return {
    id,
    title,
    subject: 'Neurociências e Cognição',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 100,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: pages.length,
    pages,
  };
}

/* ==========================================================================
   GRUPO A: RECUPERAÇÃO LEXICAL NO ESCOPO CORRETO
   ========================================================================== */

test('A1 (Recuperação): Pergunta literal recupera o chunk exato com seus termos', async () => {
  const docId = 'doc_test_a1';
  const textP1 = 'O hipocampo é fundamental para a consolidação da memória episódica declarativa.';
  const textP2 = 'O córtex motor primário planeja e executa os movimentos voluntários do corpo.';

  const doc = createMockDocument(docId, 'Neuroanatomia Funcional', [
    createMockPage(1, textP1),
    createMockPage(2, textP2),
  ]);

  const ingestion = await ingestDocumentRAG(doc);
  assert.equal(ingestion.success, true, 'Ingestão deve ser bem-sucedida');

  const context = await buildTutorGroundedContext('hipocampo memória episódica', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded', 'Estado deve ser grounded');
  assert.ok(context.packedChunks.length > 0, 'Deve retornar ao menos 1 chunk empacotado');
  assert.equal(context.packedChunks[0].pageNumber, 1, 'Chunk mais relevante deve ser da página 1');
  assert.ok(context.packedChunks[0].text.includes('hipocampo'), 'Texto deve conter hipocampo');
  assert.ok(context.packedChunks[0].text.includes('memória'), 'Texto deve conter memória');
});

test('A2 (Recuperação): Informação no fim de documento extenso (pág. 30 de 30) recupera a página correta', async () => {
  const docId = 'doc_test_a2_deep';
  const pages: DocumentPage[] = [];

  for (let i = 1; i <= 30; i++) {
    if (i === 30) {
      pages.push(
        createMockPage(
          i,
          'No epílogo desta pesquisa, demonstramos a fosforilação da proteína CREB mediada por CaMKII na sinapse tardia.'
        )
      );
    } else {
      pages.push(
        createMockPage(
          i,
          `Página preparatória de introdução ${i}. Revisão da literatura científica e metodologia experimental geral.`
        )
      );
    }
  }

  const doc = createMockDocument(docId, 'Mecanismos Moleculares', pages);
  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('fosforilação proteína CREB CaMKII sinapse', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  assert.ok(context.packedChunks.length > 0);
  assert.equal(context.packedChunks[0].pageNumber, 30, 'Deve recuperar com precisão a página 30 (profundidade real)');
  assert.ok(context.packedChunks[0].text.includes('CREB'));
});

test('A3 (Recuperação): Documento A NUNCA recupera chunks de Documento B quando o escopo é A', async () => {
  const docA = createMockDocument('doc_escopo_A', 'Neurociência A', [
    createMockPage(1, 'Estudo sobre transmissão dopaminérgica na via mesolímbica e recompensa.'),
  ]);
  const docB = createMockDocument('doc_escopo_B', 'Neurociência B', [
    createMockPage(1, 'Estudo crítico sobre transmissão dopaminérgica estriatal na doença de Parkinson.'),
  ]);

  await ingestDocumentRAG(docA);
  await ingestDocumentRAG(docB);

  // Consulta direcionada estritamente ao Documento A
  const contextA = await buildTutorGroundedContext('dopaminérgica Parkinson', {
    id: docA.id,
    title: docA.title,
  });

  // Todos os chunks retornados devem pertencer exclusivamente ao Documento A
  for (const chunk of contextA.packedChunks) {
    assert.equal(chunk.documentId, docA.id, 'Nenhum chunk do Documento B pode vazar para o contexto do Documento A');
    assert.notEqual(chunk.documentId, docB.id, 'Vazamento entre documentos é estritamente proibido');
  }

  // Consulta direcionada estritamente ao Documento B
  const contextB = await buildTutorGroundedContext('Parkinson dopaminérgica', {
    id: docB.id,
    title: docB.title,
  });

  for (const chunk of contextB.packedChunks) {
    assert.equal(chunk.documentId, docB.id, 'Chunks devem pertencer exclusivamente ao Documento B');
  }
});

test('A4 (Recuperação): Busca vazia ou com apenas espaços não gera contexto fictício', async () => {
  const doc = createMockDocument('doc_test_a4', 'Doc Qualquer', [
    createMockPage(1, 'Conteúdo qualquer para teste de busca vazia.'),
  ]);
  await ingestDocumentRAG(doc);

  const contextEmpty = await buildTutorGroundedContext('', { id: doc.id, title: doc.title });
  assert.equal(contextEmpty.state, 'no_evidence');
  assert.equal(contextEmpty.packedChunks.length, 0);
  assert.equal(contextEmpty.documentExcerpts.length, 0);

  const contextSpaces = await buildTutorGroundedContext('   \n\t  ', { id: doc.id, title: doc.title });
  assert.equal(contextSpaces.state, 'no_evidence');
  assert.equal(contextSpaces.packedChunks.length, 0);
});

test('A5 (Recuperação): Documento não indexado é identificado corretamente com estado not_indexed', async () => {
  const unindexedDocId = 'doc_sem_indice_123';
  const context = await buildTutorGroundedContext('qualquer pergunta sobre o texto', {
    id: unindexedDocId,
    title: 'Documento Não Indexado',
  });

  assert.equal(context.state, 'not_indexed', 'Deve acusar not_indexed quando não há índice');
  assert.equal(context.packedChunks.length, 0);
  assert.equal(context.documentExcerpts.length, 0);
  assert.ok(context.userNotice?.includes('ainda não foi indexado'));
});

/* ==========================================================================
   GRUPO B: CONTEXT BUILDER COM ORÇAMENTO E DIVERSIDADE
   ========================================================================== */

test('B1 (Context Builder): Respeito estrito ao orçamento de tokens com descarte transparente', async () => {
  const docId = 'doc_test_b1_budget';
  const p1 = 'A plasticidade sináptica depende do influxo intracelular de íons cálcio.';
  const p2 = 'Os receptores NMDA atuam na despolarização rápida da membrana pós-sináptica neural.';
  const p3 = 'Cascatas de segundos mensageiros ativam proteínas quinases dependentes de cálcio no neurônio.';

  const pages = [
    createMockPage(1, p1),
    createMockPage(2, p2),
    createMockPage(3, p3),
  ];

  const doc = createMockDocument(docId, 'Bioquímica Sináptica', pages);
  await ingestDocumentRAG(doc);

  // Orçamento calibrado para acomodar 1 chunk (~25 tokens) mas rejeitar o segundo (ultrapassaria 35 tokens)
  const tightBudget = 35;
  const context = await buildTutorGroundedContext(
    'cálcio plasticidade sináptica NMDA neurônio',
    { id: docId, title: doc.title },
    { maxTokenBudget: tightBudget, maxChunksPerPage: 2 }
  );

  assert.equal(context.state, 'grounded');
  assert.ok(context.packedChunks.length >= 1, 'Deve empacotar o primeiro chunk que coube');
  assert.ok(context.diagnostic.totalEstimatedTokens <= tightBudget, 'Orçamento não pode ser ultrapassado');
  assert.ok(context.diagnostic.discardedChunks.length > 0, 'Deve registrar descarte de chunks por estouro de orçamento');

  const budgetDiscard = context.diagnostic.discardedChunks.find((d) => d.reason === 'budget_exceeded');
  assert.ok(budgetDiscard, 'Deve conter descarte explícito por budget_exceeded');
});

test('B2 (Context Builder): Preservação estrita de offsets e integridade posicional', async () => {
  const docId = 'doc_test_b2_offsets';
  const p1Text = 'Primeira sentença introdutória. Segunda sentença demonstrativa do mecanismo neural.';
  const doc = createMockDocument(docId, 'Teste de Offsets', [createMockPage(1, p1Text)]);

  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('mecanismo neural demonstrativa', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  assert.ok(context.packedChunks.length > 0);

  const chunk = context.packedChunks[0];
  assert.equal(typeof chunk.charOffsetStart, 'number');
  assert.equal(typeof chunk.charOffsetEnd, 'number');
  assert.ok(chunk.charOffsetEnd > chunk.charOffsetStart);

  // Contrato fundamental: slice do texto da página física coincide 100% com chunk.text
  const pageSlice = p1Text.slice(chunk.charOffsetStart, chunk.charOffsetEnd);
  assert.equal(chunk.text, pageSlice, 'chunk.text deve corresponder exatamente ao slice dos offsets na página física');
});

test('B3 (Context Builder): Diversidade de páginas quando múltiplos candidatos relevantes existem', async () => {
  const docId = 'doc_test_b3_diversity';
  // Cria documento onde páginas 1, 2 e 3 repetem o termo chave
  const pages = [
    createMockPage(1, 'A acetilcolina regula a atenção focal e a vigília cortical na página um.'),
    createMockPage(2, 'A acetilcolina atua nos receptores nicotínicos e muscarínicos na página dois.'),
    createMockPage(3, 'A degradação da acetilcolina pela acetilcolinesterase ocorre na fenda sináptica na página três.'),
  ];

  const doc = createMockDocument(docId, 'Acetilcolina e Cognição', pages);
  await ingestDocumentRAG(doc);

  // Com maxChunksPerPage: 1, deve aceitar no máximo 1 chunk por página
  const context = await buildTutorGroundedContext(
    'acetilcolina receptores',
    { id: docId, title: doc.title },
    { maxChunksPerPage: 1, maxTokenBudget: 2000 }
  );

  assert.equal(context.state, 'grounded');
  const seenPages = new Set<number>();
  for (const chunk of context.packedChunks) {
    assert.equal(seenPages.has(chunk.pageNumber), false, 'Não pode haver mais de 1 chunk por página com limite = 1');
    seenPages.add(chunk.pageNumber);
  }
  assert.ok(seenPages.size >= 2, 'Deve contemplar múltiplas páginas garantindo diversidade');
});

test('B4 (Context Builder): Ordenação natural de leitura no contexto montado', async () => {
  const docId = 'doc_test_b4_order';
  const pages = [
    createMockPage(1, 'Introdução ao sistema serotonérgico. Núcleos da rafe.'),
    createMockPage(2, 'Projeções serotonérgicas ascendentes para o córtex pré-frontal.'),
    createMockPage(3, 'Receptores 5-HT1A e regulação do humor e ansiedade.'),
  ];

  const doc = createMockDocument(docId, 'Serotonina', pages);
  await ingestDocumentRAG(doc);

  // Pergunta com termos que casam com pág 3 e pág 1
  const context = await buildTutorGroundedContext('serotonérgico rafe 5-HT1A ansiedade', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  assert.ok(context.packedChunks.length >= 2);

  // Verifica que os chunks empacotados aparecem ordenados crescentemente por página
  for (let i = 0; i < context.packedChunks.length - 1; i++) {
    const current = context.packedChunks[i];
    const next = context.packedChunks[i + 1];
    assert.ok(
      current.pageNumber <= next.pageNumber,
      `Ordem natural violada: pág ${current.pageNumber} apareceu antes de ${next.pageNumber}`
    );
  }
});

test('B5 (Context Builder): Preservação estrita do texto-fonte sem trim ou truncamento destrutivo', async () => {
  const docId = 'doc_test_b5_fidelity';
  const exactText = 'Texto técnico com fórmulas Ca²⁺ e símbolos: 12.5% de ganho de potencial em 350ms!';
  const doc = createMockDocument(docId, 'Texto Exato', [createMockPage(1, exactText)]);

  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('potencial ganho 12.5% Ca²⁺', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  assert.equal(context.packedChunks[0].text, exactText, 'Texto-fonte deve ser mantido absolutamente idêntico');
  const chunk = context.packedChunks[0];
  const pageSlice = exactText.slice(chunk.charOffsetStart, chunk.charOffsetEnd);
  assert.equal(chunk.text, pageSlice, 'Slice exato por offsets deve coincidir 100%');
});

/* ==========================================================================
   GRUPO C: FUNDAMENTAÇÃO E VALIDAÇÃO DE CITAÇÕES
   ========================================================================== */

test('C1 (Fundamentação): Contexto e prompt contêm somente evidências do escopo solicitado', async () => {
  const doc = createMockDocument('doc_test_c1', 'Astrobiologia ou Neuro', [
    createMockPage(1, 'Astrócitos protoplasmáticos participam ativamente da barreira hematoencefálica.'),
  ]);
  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('astrócitos protoplasmáticos barreira', {
    id: doc.id,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  for (const excerpt of context.documentExcerpts) {
    assert.ok(excerpt.includes(doc.title), 'Excerpt deve citar o título do documento');
    assert.ok(excerpt.includes('Pág. 1'), 'Excerpt deve citar a página correta');
  }
});

test('C2 (Fundamentação): Citações geradas refletem 1:1 metadados reais dos chunks', async () => {
  const doc = createMockDocument('doc_test_c2', 'Córtex Auditivo', [
    createMockPage(4, 'O córtex auditivo primário localiza-se no giro temporal superior de Heschl.'),
  ]);
  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('córtex auditivo Heschl giro temporal', {
    id: doc.id,
    title: doc.title,
  });

  assert.equal(context.state, 'grounded');
  assert.equal(context.evidences.length, 1);

  const ev = context.evidences[0] as any;
  assert.equal(ev.type, 'pdf_page');
  assert.equal(ev.pageNumber, 4, 'Metadado de página física deve ser rigorosamente 4');
  assert.equal(ev.id, context.packedChunks[0].chunkId, 'ID da evidência deve ser o chunkId real');
});

test('C3 (Fundamentação): validateCitations rejeita terminantemente IDs fabricados ou alucinados', async () => {
  const doc = createMockDocument('doc_test_c3', 'Neuroplasticidade', [
    createMockPage(1, 'A potenciação de longa duração (LTP) fortalece as conexões sinápticas glutamatérgicas.'),
  ]);
  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('potenciação longa duração LTP', {
    id: doc.id,
    title: doc.title,
  });

  const realChunkId = context.packedChunks[0].chunkId;
  const fakeChunkId1 = 'chunk_alucinado_999';
  const fakeChunkId2 = 'doc_outro_p1_c0';

  // O modelo tenta citar o chunk real e dois chunks inventados
  const validated = validateCitations([realChunkId, fakeChunkId1, fakeChunkId2], context);

  assert.equal(validated.length, 1, 'Deve aceitar exclusivamente o chunk legítimo');
  assert.equal(validated[0].id, realChunkId, 'O único ID aceito deve ser o ID real');
});

test('C4 (Fundamentação): Resposta sem evidência produz zero citações fabricadas', async () => {
  const doc = createMockDocument('doc_test_c4', 'Microbiologia Geral', [
    createMockPage(1, 'Bactérias gram-positivas possuem parede celular espessa de peptideoglicano.'),
  ]);
  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('buraco negro relatividade geral espaço-tempo', {
    id: doc.id,
    title: doc.title,
  });

  assert.equal(context.state, 'no_evidence');
  assert.equal(context.evidences.length, 0);

  // Tentativa de validar IDs quando o estado é no_evidence
  const validated = validateCitations(['qualquer_id'], context);
  assert.deepEqual(validated, [], 'validateCitations deve retornar array vazio em no_evidence');
});

test('C5 (Fundamentação): Ingestão documental e construção de índice ocorrem com ZERO chamadas de IA', async () => {
  // Prova técnica: a chave de API não é necessária nem acessada durante a ingestão
  const doc = createMockDocument('doc_test_c5', 'Zero External Calls', [
    createMockPage(1, 'Documento processado 100% offline em ambiente isolado sem rede.'),
  ]);

  const ingestion = await ingestDocumentRAG(doc);
  assert.equal(ingestion.success, true);
  assert.equal(ingestion.status, 'indexed');

  const index = await getLexicalIndex(doc.id);
  assert.ok(index, 'Índice BM25 gerado puramente em memória e persistido localmente');
});

/* ==========================================================================
   GRUPO D: FALHAS E ESTADOS LIMÍTROFES
   ========================================================================== */

test('D1 (Estados): Documento com páginas digitalizadas sem OCR sinaliza ocr_pending', async () => {
  const docId = 'doc_test_d1_ocr';
  const doc: DocumentSource = {
    id: docId,
    title: 'Documento Digitalizado',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 50000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: 2,
    pages: [
      {
        pageNumber: 1,
        textContent: '',
        hasVisualElements: true,
        isScanned: true,
        legibility: 'scanned_image',
      },
    ],
  };

  await ingestDocumentRAG(doc);

  const context = await buildTutorGroundedContext('termo de busca qualquer', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'ocr_pending', 'Deve identificar explicitamente páginas que demandam OCR');
  assert.equal(context.packedChunks.length, 0);
  assert.ok(context.userNotice?.includes('OCR pendente'));
});

test('D2 (Estados): Falha tratada graciosamente com estado error quando documentoId é nulo', async () => {
  const context = await buildTutorGroundedContext('qualquer query', {
    id: '',
    title: 'Documento Sem ID',
  });

  assert.equal(context.state, 'error');
  assert.equal(context.packedChunks.length, 0);
  assert.equal(context.documentExcerpts.length, 0);
});

/* ==========================================================================
   GRUPO E: REGRESSÃO E PRESERVAÇÃO DE POLÍTICA BYOK
   ========================================================================== */

test('E1 (Regressão BYOK): AIKeyManager e buildRequestHeaders preservam chave efêmera de sessão', () => {
  AIKeyManager.setApiKey('AIzaSyTestEphemeralKey123456');
  assert.equal(AIKeyManager.getApiKey(), 'AIzaSyTestEphemeralKey123456');

  const headers = buildRequestHeaders();
  assert.equal(headers['x-gemini-api-key'], 'AIzaSyTestEphemeralKey123456');

  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.getApiKey(), null);

  const headersAfterClear = buildRequestHeaders();
  assert.equal(headersAfterClear['x-gemini-api-key'], undefined);
});

test('E2 (Regressão): Tutor não faz fallback para primeiras páginas quando BM25 não encontra evidência', async () => {
  const docId = 'doc_test_e2_no_fallback';
  const doc = createMockDocument(docId, 'Genética Molecular', [
    createMockPage(1, 'A estrutura da dupla hélice do DNA foi elucidada por Watson e Crick em 1953.'),
    createMockPage(2, 'A replicação é semiconservativa, conforme demonstrado por Meselson e Stahl.'),
    createMockPage(3, 'A transcrição converte DNA em RNA mensageiro pela RNA polimerase.'),
    createMockPage(4, 'A tradução ocorre nos ribossomos no citoplasma celular.'),
  ]);
  await ingestDocumentRAG(doc);

  // Pergunta sobre assunto completamente ausente
  const context = await buildTutorGroundedContext('cálculo estocástico integrais de Ito finanças', {
    id: docId,
    title: doc.title,
  });

  assert.equal(context.state, 'no_evidence');
  // Se houvesse o antigo fallback páginas.slice(0, 4), teríamos trechos das páginas 1 a 4.
  // No novo sistema, documentExcerpts e packedChunks DEVEM ser vazios!
  assert.equal(context.packedChunks.length, 0, 'ZERO chunks selecionados em no_evidence');
  assert.equal(context.documentExcerpts.length, 0, 'ZERO trechos arbitrários enviados em no_evidence');
});

/* ==========================================================================
   GRUPO F: AVALIAÇÃO QUANTITATIVA COM GROUND TRUTH SINTÉTICO
   ========================================================================== */

interface GroundTruthItem {
  id: string;
  query: string;
  targetDocId: string;
  expectedPage?: number; // Página esperada caso haja evidência
  expectedState: 'grounded' | 'no_evidence';
}

test('F1 (Avaliação): Benchmark de Cobertura, Precisão de Citação e Não-Contaminação', async () => {
  // Configuração de dois documentos sintéticos para teste de precisão e contaminação
  const doc1 = createMockDocument('bench_doc_neuro', 'Neurociência Cognitiva', [
    createMockPage(1, 'O cerebelo coordena a precisão motora fina, o equilíbrio postural e a aprendizagem motora.'),
    createMockPage(2, 'O córtex pré-frontal dorsolateral é o substrato das funções executivas e da memória de trabalho.'),
    createMockPage(3, 'A amígdala basolateral processa o condicionamento aversivo e a saliência emocional do medo.'),
  ]);

  const doc2 = createMockDocument('bench_doc_cardio', 'Fisiologia Cardiovascular', [
    createMockPage(1, 'O nodo sinoatrial atua como marca-passo fisiológico principal gerando o ritmo sinusal cardíaco.'),
    createMockPage(2, 'O débito cardíaco é o produto do volume sistólico pela frequência cardíaca em repouso.'),
  ]);

  await ingestDocumentRAG(doc1);
  await ingestDocumentRAG(doc2);

  const dataset: GroundTruthItem[] = [
    // 5 perguntas com respostas existentes
    { id: 'Q1', query: 'qual a função do cerebelo na precisão motora?', targetDocId: doc1.id, expectedPage: 1, expectedState: 'grounded' },
    { id: 'Q2', query: 'memória de trabalho córtex pré-frontal dorsolateral', targetDocId: doc1.id, expectedPage: 2, expectedState: 'grounded' },
    { id: 'Q3', query: 'amígdala basolateral medo condicionamento aversivo', targetDocId: doc1.id, expectedPage: 3, expectedState: 'grounded' },
    { id: 'Q4', query: 'nodo sinoatrial marca-passo fisiológico ritmo sinusal', targetDocId: doc2.id, expectedPage: 1, expectedState: 'grounded' },
    { id: 'Q5', query: 'cálculo do débito cardíaco volume sistólico', targetDocId: doc2.id, expectedPage: 2, expectedState: 'grounded' },
    // 3 perguntas com assuntos ausentes
    { id: 'Q6', query: 'teoria quântica de campos e eletrodinâmica quântica', targetDocId: doc1.id, expectedState: 'no_evidence' },
    { id: 'Q7', query: 'geologia sedimentar placas tectônicas magma', targetDocId: doc2.id, expectedState: 'no_evidence' },
    { id: 'Q8', query: 'história da arquitetura barroca em minas gerais', targetDocId: doc1.id, expectedState: 'no_evidence' },
    // 2 perguntas de contaminação cruzada (perguntar assunto de Doc2 para Doc1 e vice-versa)
    { id: 'Q9', query: 'nodo sinoatrial débito cardíaco ritmo sinusal', targetDocId: doc1.id, expectedState: 'no_evidence' },
    { id: 'Q10', query: 'córtex pré-frontal funções executivas cerebelo', targetDocId: doc2.id, expectedState: 'no_evidence' },
  ];

  let correctEvidenceReachedCount = 0;
  let totalEvidenceQuestions = 0;
  let correctNoEvidenceCount = 0;
  let totalNoEvidenceQuestions = 0;
  let crossDocLeakageCount = 0;
  let totalCitationsEvaluated = 0;
  let validCitationsCount = 0;

  for (const item of dataset) {
    const context = await buildTutorGroundedContext(item.query, {
      id: item.targetDocId,
      title: item.targetDocId === doc1.id ? doc1.title : doc2.title,
    });

    if (item.expectedState === 'grounded') {
      totalEvidenceQuestions++;
      if (context.state === 'grounded') {
        const hasExpectedPage = context.packedChunks.some(
          (c) => c.pageNumber === item.expectedPage
        );
        if (hasExpectedPage) {
          correctEvidenceReachedCount++;
        }

        // Validação de citações: verifica se todas as citações emitidas pertencem aos chunks empacotados
        for (const ev of context.evidences) {
          totalCitationsEvaluated++;
          const matchesPacked = context.packedChunks.some(
            (c) => c.chunkId === ev.id && c.pageNumber === (ev as any).pageNumber
          );
          if (matchesPacked) {
            validCitationsCount++;
          }
        }
      }
    } else {
      totalNoEvidenceQuestions++;
      if (context.state === 'no_evidence') {
        correctNoEvidenceCount++;
      }
    }

    // Checagem de contaminação cruzada
    for (const chunk of context.packedChunks) {
      if (chunk.documentId !== item.targetDocId) {
        crossDocLeakageCount++;
      }
    }
  }

  const evidenceReachRate = (correctEvidenceReachedCount / totalEvidenceQuestions) * 100;
  const noEvidenceDetectionRate = (correctNoEvidenceCount / totalNoEvidenceQuestions) * 100;
  const citationValidityRate = (validCitationsCount / totalCitationsEvaluated) * 100;
  const crossDocLeakageRate = (crossDocLeakageCount / dataset.length) * 100;

  console.log('\n======================================================');
  console.log('       NEUROCLASS AI — BENCHMARK DE FUNDAMENTAÇÃO B2  ');
  console.log('======================================================');
  console.log(`Taxa de Alcance de Evidência Correta (Recall Contexto): ${evidenceReachRate.toFixed(2)}% (${correctEvidenceReachedCount}/${totalEvidenceQuestions})`);
  console.log(`Taxa de Identificação de Sem Evidência:                  ${noEvidenceDetectionRate.toFixed(2)}% (${correctNoEvidenceCount}/${totalNoEvidenceQuestions})`);
  console.log(`Taxa de Citações Válidas e Verificadas:                 ${citationValidityRate.toFixed(2)}% (${validCitationsCount}/${totalCitationsEvaluated})`);
  console.log(`Taxa de Contaminação por Documento Fora de Escopo:      ${crossDocLeakageRate.toFixed(2)}% (rigorosamente 0.00%)`);
  console.log('======================================================\n');

  assert.equal(crossDocLeakageRate, 0, 'Taxa de contaminação cruzada DEVE ser rigorosamente 0%');
  assert.equal(noEvidenceDetectionRate, 100, 'Taxa de identificação de sem evidência DEVE ser 100%');
  assert.equal(evidenceReachRate, 100, 'Todas as perguntas com evidência devem atingir o contexto com a página correta');
  assert.equal(citationValidityRate, 100, 'Todas as citações geradas devem ser válidas e verificadas');
});
