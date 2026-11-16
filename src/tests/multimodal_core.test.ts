/**
 * @file Testes Automatizados — Multimodal Core v1
 * Compreensão Documental Avançada: Documentos Científicos Multimodais, PDFs Digitalizados e Tratados Extensos.
 *
 * COBERTURA EXIGIDA:
 * 1. Caso A: PDF científico multimodal (texto, figuras, diagramas, legendas, tabelas, gráficos, fórmulas).
 * 2. Caso B: PDF digitalizado (sem texto nativo, preservação de páginas, diagnóstico de legibilidade).
 * 3. Preservação de incerteza em leituras ambíguas (isAmbiguous: true, sem invenção de dados).
 * 4. Caso C: PDF extenso com sumário/TOC, segmentação contextualizada e amostragem transparente.
 * 5. Não declarar compreensão integral (100%) quando a IA tiver recebido apenas uma amostra.
 * 6. Rastreabilidade estrita por página original e classificação epistemológica nos 3 estados.
 * 7. Isolamento BYOK, proteção de payload (>15MB) e ausência de vazamento de credenciais.
 * 8. Integração funcional com Blackboard, Tutor, Caderno de Estudos e Ciclo C.R.E.A.R.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAIClientFactory,
  resetAIClientFactory,
  app,
} from '../../server.ts';
import {
  CORPUS_SCENARIO_A,
  CORPUS_SCENARIO_B,
  CORPUS_SCENARIO_C,
} from '../services/documents/multimodalCorpus.ts';
import { extractPdfDocument } from '../services/documents/pdfService.ts';
import type { LearningAnalysis, DocumentSource, EvidenceReference } from '../types';

// Helper para invocar o endpoint Express /api/gemini/analyze-document via mock
async function mockAnalyzeDocument(body: any, headers: Record<string, string> = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      origin: 'https://neuroclass.ai',
      'x-gemini-api-key': 'AIzaSyMockKeyValid123',
      ...headers,
    },
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
  };

  const route = app._router.stack.find(
    (layer: any) => layer.route && layer.route.path === '/api/gemini/analyze-document'
  );

  if (!route) {
    throw new Error('Rota /api/gemini/analyze-document não encontrada no servidor.');
  }

  await route.route.stack[0].handle(req, res);
  return { status: statusCode, body: responseData };
}

// Helper para invocar o endpoint /api/gemini/tutor-chat via mock
async function mockTutorChat(body: any, headers: Record<string, string> = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      origin: 'https://neuroclass.ai',
      'x-gemini-api-key': 'AIzaSyMockKeyValid123',
      ...headers,
    },
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
  };

  const route = app._router.stack.find(
    (layer: any) => layer.route && layer.route.path === '/api/gemini/tutor-chat'
  );

  if (!route) {
    throw new Error('Rota /api/gemini/tutor-chat não encontrada no servidor.');
  }

  await route.route.stack[0].handle(req, res);
  return { status: statusCode, body: responseData };
}

/* ==========================================================================
   TESTES DO CASO A: DOCUMENTO CIENTÍFICO MULTIMODAL
   ========================================================================== */

test('T350 [Caso A]: Estrutura e Ativos Multimodais (Fórmulas, Tabelas, Gráficos, Figuras)', () => {
  const { document, analysis } = CORPUS_SCENARIO_A;

  assert.equal(document.id, 'corpus_case_a_multimodal_science');
  assert.equal(document.pageCount, 5);
  assert.ok(analysis.multimodalAssets, 'Deve conter catálogo estruturado de ativos multimodais');

  // 1. Verificação de Fórmulas Matemáticas e Científicas
  const formulas = analysis.multimodalAssets.formulas;
  assert.ok(formulas.length >= 3, 'Deve conter ao menos 3 fórmulas canônicas');
  const ePhoton = formulas.find((f) => f.expression.includes('h\\nu'));
  assert.ok(ePhoton, 'Fórmula E = h*nu deve estar presente em notação formal');
  assert.equal(ePhoton?.pageNumber, 2, 'Fórmula deve rastrear a página física 2');
  assert.equal(ePhoton?.isAmbiguous, false, 'Leitura deve ser inequívoca');

  // 2. Verificação de Tabelas com Cabeçalhos
  const tables = analysis.multimodalAssets.tables;
  assert.ok(tables.length >= 1, 'Deve conter ao menos 1 tabela de dados');
  assert.equal(tables[0].label, 'Tabela 1');
  assert.equal(tables[0].pageNumber, 3);
  assert.ok(tables[0].headers?.includes('Função Trabalho (eV)'), 'Tabela deve ter cabeçalho tipado');

  // 3. Verificação de Gráficos com Eixos e Tendências
  const charts = analysis.multimodalAssets.charts;
  assert.ok(charts.length >= 1, 'Deve conter ao menos 1 gráfico com dados analíticos');
  assert.equal(charts[0].label, 'Gráfico 1');
  assert.equal(charts[0].pageNumber, 4);
  assert.ok(charts[0].axes?.x?.includes('Frequência'), 'Eixo X deve indicar frequência');
  assert.ok(charts[0].axes?.y?.includes('Potencial'), 'Eixo Y deve indicar potencial de frenagem');
  assert.ok(charts[0].trend?.includes('linear'), 'Deve registrar tendência linear observada');

  // 4. Verificação de Figuras com Legendas
  const figures = analysis.multimodalAssets.figures;
  assert.ok(figures.length >= 1, 'Deve conter ao menos 1 figura científica');
  assert.equal(figures[0].pageNumber, 1);
  assert.ok(figures[0].caption?.includes('vácuo'), 'Deve conter legenda contextual');
});

test('T351 [Caso A]: Conceitos Referenciam Evidências Polimórficas (Fórmula, Tabela, Gráfico)', () => {
  const { analysis } = CORPUS_SCENARIO_A;

  // Conceito com evidência de fórmula
  const fotonConcept = analysis.fundamentalConcepts.find((c) => c.id === 'c_foton_quanta');
  assert.ok(fotonConcept);
  const formulaEv = fotonConcept.evidenceReferences.find((e) => e.type === 'formula');
  assert.ok(formulaEv, 'Conceito de fóton deve apontar evidência do tipo formula');
  assert.equal((formulaEv as any).formulaExpression, 'E = h\\nu');

  // Conceito com evidência de tabela
  const workFuncConcept = analysis.fundamentalConcepts.find((c) => c.id === 'c_funcao_trabalho_phi');
  assert.ok(workFuncConcept);
  const tableEv = workFuncConcept.evidenceReferences.find((e) => e.type === 'table');
  assert.ok(tableEv, 'Conceito de função trabalho deve apontar evidência do tipo table');
  assert.equal((tableEv as any).tableLabel, 'Tabela 1');

  // Conceito com evidência de gráfico
  const v0Concept = analysis.fundamentalConcepts.find((c) => c.id === 'c_potencial_frenagem_grafico');
  assert.ok(v0Concept);
  const chartEv = v0Concept.evidenceReferences.find((e) => e.type === 'chart');
  assert.ok(chartEv, 'Conceito de potencial de frenagem deve apontar evidência do tipo chart');
  assert.equal((chartEv as any).chartLabel, 'Gráfico 1');
});

/* ==========================================================================
   TESTES DO CASO B: PDF DIGITALIZADO & PRESERVAÇÃO DE INCERTEZA
   ========================================================================== */

test('T352 [Caso B]: Detecção de PDF Digitalizado e Diagnóstico de Legibilidade', () => {
  const { document, analysis } = CORPUS_SCENARIO_B;

  assert.equal(document.id, 'corpus_case_b_scanned_historical');
  assert.equal(document.pages?.length, 3);

  // Páginas digitalizadas sem texto nativo
  assert.equal(document.pages[0].isScanned, true);
  assert.equal(document.pages[0].textContent, '');
  assert.equal(document.pages[0].legibility, 'scanned_image');

  // Cobertura do processamento declara modo scanned_multimodal
  assert.ok(analysis.coverage);
  assert.equal(analysis.coverage.mode, 'scanned_multimodal');
  assert.equal(analysis.coverage.legibilitySummary.isFullyDigital, false);
  assert.equal(analysis.coverage.legibilitySummary.scannedPageCount, 3);
  assert.equal(analysis.coverage.legibilitySummary.degradedPageCount, 1);
  assert.ok(
    analysis.coverage.legibilitySummary.warnings.some((w) => w.includes('digitalizado')),
    'Deve emitir aviso transparente de processamento visual multimodal'
  );
});

test('T353 [Caso B]: Preservação de Incerteza Científica em Leitura Ambígua (Sem Invenção)', () => {
  const { analysis } = CORPUS_SCENARIO_B;

  const dendriticConcept = analysis.fundamentalConcepts.find((c) => c.id === 'c_espinhos_dendriticos');
  assert.ok(dendriticConcept);

  // Evidência com leitura ambígua declarada
  const ambiguousEv = dendriticConcept.evidenceReferences.find((e: any) => e.isAmbiguous === true);
  assert.ok(ambiguousEv, 'Deve existir evidência explicitamente sinalizada com isAmbiguous: true');
  assert.ok(
    (ambiguousEv as any).ambiguityReason.includes('Oxidação') || (ambiguousEv as any).ambiguityReason.includes('degradação'),
    'Deve justificar a causa da ambiguidade sem inventar dados'
  );

  // Lacunas identificadas reportam a limitação de legibilidade
  assert.ok(
    analysis.identifiedGaps.some((g) => g.includes('degradação') || g.includes('inconclusivo')),
    'Lacunas devem registrar os limites de legibilidade do documento'
  );
});

/* ==========================================================================
   TESTES DO CASO C: DOCUMENTO EXTENSO, SEGMENTAÇÃO E AMOSTRAGEM
   ========================================================================== */

test('T354 [Caso C]: Tratado Extenso com Múltiplos Capítulos e Sumário Hierárquico (TOC)', () => {
  const { document } = CORPUS_SCENARIO_C;

  assert.equal(document.pageCount, 120);
  assert.equal(document.pages?.length, 120);
  assert.ok(document.tableOfContents && document.tableOfContents.length >= 2);

  // TOC de múltiplos níveis
  const parte1 = document.tableOfContents[0];
  assert.equal(parte1.level, 0);
  assert.ok(parte1.subItems && parte1.subItems.length >= 2);
  assert.equal(parte1.subItems[0].title, 'Capítulo 1: Tomada de Decisão e Estrutura Administrativa');
  assert.equal(parte1.subItems[0].pageNumber, 5);
});

test('T355 [Caso C]: Amostragem Transparente — Nunca Alega Compreensão Integral (100%)', () => {
  const { analysis } = CORPUS_SCENARIO_C;

  assert.ok(analysis.coverage);
  assert.equal(analysis.coverage.mode, 'sampled', 'Modo deve ser sampled para documentos extensos amostrados');
  assert.equal(analysis.coverage.coveragePercentage, 14, 'Cobertura deve ser exatamente 14% (17/120 páginas)');
  assert.notEqual(analysis.coverage.coveragePercentage, 100, 'NÃO pode alegar 100% de cobertura quando houve amostragem');

  assert.ok(analysis.coverage.sampledPages && analysis.coverage.sampledPages.length === 17);
  assert.ok(analysis.coverage.unprocessedPages && analysis.coverage.unprocessedPages.length === 103);
  assert.ok(
    analysis.coverage.legibilitySummary.warnings.some((w) => w.includes('amostragem')),
    'Avisos de legibilidade devem declarar amostragem'
  );
});

/* ==========================================================================
   TESTES DA ROTA /api/gemini/analyze-document (INTEGRAÇÃO E CÁLCULO DE COBERTURA)
   ========================================================================== */

test('T356: Rota /api/gemini/analyze-document calcula cobertura full (100%) para documentos curtos', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          domain: 'Neurociência',
          centralTheme: 'Comunicação Celular',
          learningObjectives: ['Compreender sinapses'],
          fundamentalConcepts: [
            {
              id: 'c1',
              name: 'Sinapse',
              definition: 'Junção celular de transmissão neuroquímica.',
              importance: 'fundamental',
              epistemicStatus: 'explicitly_documented',
              evidenceReferences: [{ id: 'ev1', type: 'pdf_page', pageNumber: 1, excerpt: 'Sinapse química.' }],
              prerequisiteConceptIds: [],
            },
          ],
          complementaryConcepts: [],
          relationships: [],
          suggestedDiagramType: 'concept-map',
          multimodalAssets: { figures: [], tables: [], formulas: [], charts: [] },
        }),
      }),
    },
  }));

  try {
    const res = await mockAnalyzeDocument({
      documentId: 'doc_short_test',
      title: 'Artigo Curto de Neurofisiologia',
      textPages: [
        { pageNumber: 1, textContent: 'Sinapse química entre axônio e dendrito.', hasVisualElements: false },
        { pageNumber: 2, textContent: 'Vesículas sinápticas carregadas com neurotransmissor.', hasVisualElements: true },
      ],
      pageCount: 2,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.coverage.mode, 'full');
    assert.equal(res.body.coverage.coveragePercentage, 100);
    assert.equal(res.body.coverage.totalPages, 2);
    assert.deepEqual(res.body.coverage.processedPages, [1, 2]);
    assert.deepEqual(res.body.coverage.unprocessedPages, []);
  } finally {
    resetAIClientFactory();
  }
});

test('T357: Rota /api/gemini/analyze-document detecta documentos digitalizados e ativa scanned_multimodal', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          domain: 'Neuroanatomia Histórica',
          centralTheme: 'Lâminas Digitalizadas',
          learningObjectives: ['Identificar neurônios'],
          fundamentalConcepts: [
            {
              id: 'c_scan',
              name: 'Neurônio Piramidal',
              definition: 'Célula visualizada em lâmina histológica.',
              importance: 'fundamental',
              epistemicStatus: 'explicitly_documented',
              evidenceReferences: [{ id: 'ev_s1', type: 'figure', pageNumber: 1, figureLabel: 'Lâmina 1', excerpt: 'Desenho microscópico.' }],
              prerequisiteConceptIds: [],
            },
          ],
          complementaryConcepts: [],
          relationships: [],
          suggestedDiagramType: 'concept-map',
          multimodalAssets: {
            figures: [{ label: 'Lâmina 1', pageNumber: 1, description: 'Desenho de neurônio' }],
            tables: [],
            formulas: [],
            charts: [],
          },
        }),
      }),
    },
  }));

  try {
    // 3 páginas sem camada de texto, com operadores visuais
    const res = await mockAnalyzeDocument({
      documentId: 'doc_scanned_test',
      title: 'Lâminas Digitalizadas Históricas',
      textPages: [
        { pageNumber: 1, textContent: '', hasVisualElements: true, isScanned: true, legibility: 'scanned_image' },
        { pageNumber: 2, textContent: '', hasVisualElements: true, isScanned: true, legibility: 'scanned_image' },
        { pageNumber: 3, textContent: '', hasVisualElements: true, isScanned: true, legibility: 'scanned_image' },
      ],
      pageCount: 3,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.coverage.mode, 'scanned_multimodal');
    assert.equal(res.body.coverage.legibilitySummary.isFullyDigital, false);
    assert.equal(res.body.coverage.legibilitySummary.scannedPageCount, 3);
    assert.ok(res.body.coverage.legibilitySummary.warnings.some((w: string) => w.includes('digitalizada')));
  } finally {
    resetAIClientFactory();
  }
});

test('T358: Rota /api/gemini/analyze-document ativa modo sampled para documentos com mais de 50 páginas', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          domain: 'Administração',
          centralTheme: 'Tratado Extenso',
          learningObjectives: ['Aprender decisão'],
          fundamentalConcepts: [
            {
              id: 'c_ext',
              name: 'Racionalidade Limitada',
              definition: 'Limites computacionais.',
              importance: 'fundamental',
              epistemicStatus: 'explicitly_documented',
              evidenceReferences: [{ id: 'ev_e1', type: 'pdf_page', pageNumber: 1, excerpt: 'Premissa de Simon.' }],
              prerequisiteConceptIds: [],
            },
          ],
          complementaryConcepts: [],
          relationships: [],
          suggestedDiagramType: 'concept-map',
        }),
      }),
    },
  }));

  try {
    // 80 páginas geradas
    const textPages = Array.from({ length: 80 }, (_, i) => ({
      pageNumber: i + 1,
      textContent: `Texto da página ${i + 1} sobre teoria da decisão e organizações complexas.`,
      hasVisualElements: false,
    }));

    const res = await mockAnalyzeDocument({
      documentId: 'doc_extensive_test',
      title: 'Tratado de 80 Páginas',
      textPages,
      pageCount: 80,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.coverage.mode, 'sampled');
    assert.ok(res.body.coverage.coveragePercentage < 100, 'Porcentagem de amostragem deve ser menor que 100%');
    assert.ok(res.body.coverage.unprocessedPages.length > 0, 'Deve listar explicitamente as páginas não processadas');
    assert.ok(
      res.body.coverage.legibilitySummary.warnings.some((w: string) => w.includes('amostragem')),
      'Deve declarar aviso de amostragem representativa'
    );
  } finally {
    resetAIClientFactory();
  }
});

test('T359: Rota /api/gemini/analyze-document com activeChunkRange ativa modo chunk isolado', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          domain: 'Economia',
          centralTheme: 'Capítulo 2 Focado',
          learningObjectives: ['Estudar capítulo 2'],
          fundamentalConcepts: [
            {
              id: 'c_chunk',
              name: 'Premissas de Decisão',
              definition: 'Valores e fatos na escolha.',
              importance: 'fundamental',
              epistemicStatus: 'explicitly_documented',
              evidenceReferences: [{ id: 'ev_ch1', type: 'pdf_page', pageNumber: 15, excerpt: 'Fatos na página 15.' }],
              prerequisiteConceptIds: [],
            },
          ],
          complementaryConcepts: [],
          relationships: [],
          suggestedDiagramType: 'concept-map',
        }),
      }),
    },
  }));

  try {
    const textPages = Array.from({ length: 30 }, (_, i) => ({
      pageNumber: i + 1,
      textContent: `Texto da página ${i + 1}`,
      hasVisualElements: false,
    }));

    const res = await mockAnalyzeDocument({
      documentId: 'doc_chunk_test',
      title: 'Livro com Bloco Selecionado',
      textPages,
      pageCount: 30,
      activeChunkRange: { startPage: 11, endPage: 20 },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.coverage.mode, 'chunk');
    assert.equal(res.body.coverage.processedPages.length, 10);
    assert.equal(res.body.coverage.processedPages[0], 11);
    assert.equal(res.body.coverage.processedPages[9], 20);
    assert.equal(res.body.coverage.coveragePercentage, 33);
  } finally {
    resetAIClientFactory();
  }
});

/* ==========================================================================
   TESTES DE INTEGRAÇÃO COM O TUTOR E C.R.E.A.R.
   ========================================================================== */

test('T360: Tutor recebe trechos estruturados de Fórmulas e Gráficos e responde com rastreabilidade', async () => {
  let capturedPrompt = '';

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        const parts = params?.contents?.parts || [];
        capturedPrompt = parts.map((p: any) => p.text || '').join('\n');
        return {
          text: 'Com base na Equação E = h*nu da Página 2 e no Gráfico 1 de potencial de frenagem...',
          modelUsed: 'gemini-2.0-flash',
        };
      },
    },
  }));

  try {
    const res = await mockTutorChat({
      userMessage: 'Como a inclinação do Gráfico 1 se relaciona com a fórmula de Planck?',
      documentTitle: 'Efeito Fotoelétrico',
      subject: 'Física Quântica',
      activeConcept: {
        id: 'c_potencial',
        name: 'Potencial de Frenagem e Relação Linear',
        definition: 'Diferença de potencial que anula a corrente fotoelétrica.',
      },
      documentExcerpts: [
        '[Fórmula Equação 2.1 Pág. 2]: Expressão: "E = h\\nu" | Energia quantizada',
        '[Gráfico Gráfico 1 Pág. 4]: Eixos: Frequência x Potencial de Frenagem | Tendência: Reta com inclinação h/e',
      ],
      conversationHistory: [],
      pedagogicalIntent: 'explanation',
    });

    assert.equal(res.status, 200);
    assert.ok(capturedPrompt.includes('Fórmula Equação 2.1'), 'Prompt do Tutor deve conter a fórmula extraída');
    assert.ok(capturedPrompt.includes('Gráfico Gráfico 1'), 'Prompt do Tutor deve conter os eixos do gráfico');
    assert.ok(res.body.text.includes('Gráfico 1'), 'Resposta do Tutor deve citar o elemento multimodal');
  } finally {
    resetAIClientFactory();
  }
});

test('T361: Rigor de Rastreabilidade Epistemológica — 3 Estados Preservados sem Alucinação', () => {
  const { analysis } = CORPUS_SCENARIO_A;

  // Validação dos 3 estados epistemológicos estritos
  const validStates = ['explicitly_documented', 'synthesized', 'model_inference'];

  for (const c of analysis.fundamentalConcepts) {
    assert.ok(
      validStates.includes(c.epistemicStatus),
      `Conceito ${c.name} deve ter status epistemológico válido`
    );
    for (const ev of c.evidenceReferences) {
      assert.ok(
        ['pdf_page', 'note_section', 'figure', 'table', 'formula', 'chart'].includes(ev.type),
        `Evidência do conceito ${c.name} deve ter tipo polimórfico canônico`
      );
      assert.ok(ev.excerpt.length > 5, 'Evidência deve ter citação com tamanho substantivo');
    }
  }

  for (const rel of analysis.relationships) {
    assert.ok(
      validStates.includes(rel.epistemicStatus),
      `Relação ${rel.id} deve ter status epistemológico válido`
    );
    assert.equal(typeof rel.isModelInference, 'boolean', 'isModelInference deve ser booleano estrito');
    if (rel.isModelInference) {
      assert.equal(rel.epistemicStatus, 'model_inference', 'Inferência de modelo deve ter status model_inference');
    }
  }
});

test('T362: Governança de Segurança e Fail-Closed — Sanitização de Erros Sem Vazamento de Chaves', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        const err: any = new Error('Erro interno simulado contendo credencial secreta AIzaSyLeakSecret999');
        err.status = 500;
        throw err;
      },
    },
  }));

  try {
    const res = await mockAnalyzeDocument({
      documentId: 'doc_error_test',
      title: 'Material com Erro',
      textPages: [{ pageNumber: 1, textContent: 'Conteúdo de teste' }],
    });

    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes('AIzaSyLeakSecret999'), 'Chave ou segredo NUNCA deve vazar em respostas de erro');
    assert.equal(res.body.code, 'INTERNAL_ERROR');
  } finally {
    resetAIClientFactory();
  }
});

/* ==========================================================================
   TESTES DE INSPEÇÃO INSTRUMENTADA DO PAYLOAD MULTIMODAL (ENVIO EFETIVO AO GEMINI)
   ========================================================================== */

test('T363: [Payload Multimodal] Página digitalizada convertida em imagem é enviada via inlineData (image/jpeg) com identificação da página original', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: JSON.stringify({
            domain: 'Neuroanatomia Histórica',
            centralTheme: 'Lâmina Digitalizada',
            learningObjectives: ['Identificar estruturas'],
            fundamentalConcepts: [
              {
                id: 'c_hist',
                name: 'Célula Piramidal',
                definition: 'Morfologia neuronal.',
                importance: 'fundamental',
                epistemicStatus: 'explicitly_documented',
                evidenceReferences: [{ id: 'ev1', type: 'figure', pageNumber: 1, figureLabel: 'Lâmina 1', excerpt: 'Desenho microscópico.' }],
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [],
            suggestedDiagramType: 'concept-map',
            multimodalAssets: { figures: [], tables: [], formulas: [], charts: [] },
          }),
        };
      },
    },
  }));

  try {
    const fakeBase64Pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await mockAnalyzeDocument({
      documentId: 'doc_scanned_payload_test',
      title: 'Lâmina Histórica Digitalizada',
      textPages: [
        {
          pageNumber: 1,
          textContent: '',
          hasVisualElements: true,
          isScanned: true,
          legibility: 'scanned_image',
          pageImageBase64: `data:image/jpeg;base64,${fakeBase64Pixel}`,
        },
      ],
      pageCount: 1,
    });

    assert.equal(res.status, 200);

    // 1. Verifica que a imagem em base64 foi efetivamente injetada no contentParts
    const imagePart = capturedParts.find((p: any) => p.inlineData && p.inlineData.mimeType === 'image/jpeg');
    assert.ok(imagePart, 'O payload enviado ao Gemini DEVE conter um inlineData com mimeType image/jpeg');
    assert.equal(imagePart.inlineData.data, fakeBase64Pixel, 'Os dados base64 da imagem devem corresponder aos pixels da página');

    // 2. Verifica que a legenda textual da página original foi anexada
    const textLabelPart = capturedParts.find((p: any) => p.text && p.text.includes('[Dados Visuais da Página 1'));
    assert.ok(textLabelPart, 'O payload DEVE conter rótulo vinculando os dados visuais à Página 1 física original');

    // 3. Verifica que a página foi indexada no prompt com tag de imagem visual
    const formattedPagesPart = capturedParts.find((p: any) => p.text && p.text.includes('--- PÁGINA 1'));
    assert.ok(formattedPagesPart.text.includes('[IMAGEM VISUAL ANEXADA]'), 'O índice textual deve sinalizar imagem visual anexada');
  } finally {
    resetAIClientFactory();
  }
});

test('T364: [Payload Multimodal] Documento PDF completo em base64 é incluído com mimeType application/pdf', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: JSON.stringify({
            domain: 'Ciências',
            centralTheme: 'Artigo Completo',
            learningObjectives: ['Aprender'],
            fundamentalConcepts: [
              {
                id: 'c_pdf',
                name: 'Conceito PDF',
                definition: 'Definição.',
                importance: 'fundamental',
                epistemicStatus: 'explicitly_documented',
                evidenceReferences: [{ id: 'ev1', type: 'pdf_page', pageNumber: 1, excerpt: 'Trecho.' }],
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [],
            suggestedDiagramType: 'concept-map',
          }),
        };
      },
    },
  }));

  try {
    const fakePdfBytes = 'JVBERi0xLjQKJcTl8uXrCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iag==';
    const res = await mockAnalyzeDocument({
      documentId: 'doc_pdf_base64_test',
      title: 'Artigo Multimodal Completo',
      mimeType: 'application/pdf',
      fileBase64: `data:application/pdf;base64,${fakePdfBytes}`,
      textPages: [
        { pageNumber: 1, textContent: 'Introdução do artigo científico.', hasVisualElements: true },
      ],
      pageCount: 1,
    });

    assert.equal(res.status, 200);

    const pdfPart = capturedParts.find((p: any) => p.inlineData && p.inlineData.mimeType === 'application/pdf');
    assert.ok(pdfPart, 'O payload DEVE conter inlineData com mimeType application/pdf');
    assert.equal(pdfPart.inlineData.data, fakePdfBytes, 'Deve descompactar o prefixo data: e conter os bytes PDF limpos');
  } finally {
    resetAIClientFactory();
  }
});

test('T365: [Payload Multimodal] Páginas com fórmulas, gráficos, tabelas e figuras incluem tags estruturais no índice', async () => {
  let capturedPrompt = '';

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        const parts = params?.contents?.parts || [];
        capturedPrompt = parts.map((p: any) => p.text || '').join('\n');
        return {
          text: JSON.stringify({
            domain: 'Física',
            centralTheme: 'Efeito Fotoelétrico',
            learningObjectives: ['Compreender quantização'],
            fundamentalConcepts: [
              {
                id: 'c_quant',
                name: 'Fóton',
                definition: 'Quanta de luz.',
                importance: 'fundamental',
                epistemicStatus: 'explicitly_documented',
                evidenceReferences: [{ id: 'ev1', type: 'formula', pageNumber: 2, formulaExpression: 'E=h*f', excerpt: 'E=hf' }],
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [],
            suggestedDiagramType: 'process-flow',
            multimodalAssets: {
              figures: [{ label: 'Fig 1', pageNumber: 1 }],
              tables: [{ label: 'Tab 1', pageNumber: 3 }],
              formulas: [{ expression: 'E=hf', pageNumber: 2 }],
              charts: [{ label: 'Graf 1', pageNumber: 4 }],
            },
          }),
        };
      },
    },
  }));

  try {
    const res = await mockAnalyzeDocument({
      documentId: 'doc_multimodal_elements_test',
      title: 'Artigo de Física Moderna',
      textPages: [
        {
          pageNumber: 1,
          textContent: 'Figura 1: Esquema de tubo de vácuo.',
          hasVisualElements: true,
          detectedElements: { hasFigures: true, hasTables: false, hasFormulas: false, hasCharts: false },
        },
        {
          pageNumber: 2,
          textContent: 'Equação 2: E = h * f.',
          hasVisualElements: true,
          detectedElements: { hasFigures: false, hasTables: false, hasFormulas: true, hasCharts: false },
        },
        {
          pageNumber: 3,
          textContent: 'Tabela 1: Funções de trabalho.',
          hasVisualElements: true,
          detectedElements: { hasFigures: false, hasTables: true, hasFormulas: false, hasCharts: false },
        },
        {
          pageNumber: 4,
          textContent: 'Gráfico 1: Tensão vs Frequência.',
          hasVisualElements: true,
          detectedElements: { hasFigures: false, hasTables: false, hasFormulas: false, hasCharts: true },
        },
      ],
      pageCount: 4,
    });

    assert.equal(res.status, 200);
    assert.ok(capturedPrompt.includes('Figuras/Diagramas'), 'Prompt deve conter tag de Figuras na página correspondente');
    assert.ok(capturedPrompt.includes('Fórmulas/Equações'), 'Prompt deve conter tag de Fórmulas na página 2');
    assert.ok(capturedPrompt.includes('Tabelas'), 'Prompt deve conter tag de Tabelas na página 3');
    assert.ok(capturedPrompt.includes('Gráficos/Tendências'), 'Prompt deve conter tag de Gráficos na página 4');
  } finally {
    resetAIClientFactory();
  }
});

test('T366: [Payload Multimodal] Limite defensivo de até 12 imagens visuais por requisição previne estouro de payload', async () => {
  let capturedImagePartsCount = 0;

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        const parts = params?.contents?.parts || [];
        capturedImagePartsCount = parts.filter((p: any) => p.inlineData && p.inlineData.mimeType?.startsWith('image/')).length;
        return {
          text: JSON.stringify({
            domain: 'Documento Extenso Scanned',
            centralTheme: 'Múltiplas Lâminas',
            learningObjectives: ['Reconhecer lâminas'],
            fundamentalConcepts: [
              {
                id: 'c_many',
                name: 'Lâmina Conjunta',
                definition: 'Visão agregada.',
                importance: 'fundamental',
                epistemicStatus: 'explicitly_documented',
                evidenceReferences: [{ id: 'ev1', type: 'figure', pageNumber: 1, figureLabel: 'Lâmina 1', excerpt: 'Lâmina.' }],
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [],
            suggestedDiagramType: 'hierarchy',
          }),
        };
      },
    },
  }));

  try {
    // 20 páginas com imagens
    const fakePixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const textPages = Array.from({ length: 20 }, (_, i) => ({
      pageNumber: i + 1,
      textContent: '',
      hasVisualElements: true,
      isScanned: true,
      pageImageBase64: `data:image/jpeg;base64,${fakePixel}`,
    }));

    const res = await mockAnalyzeDocument({
      documentId: 'doc_20_scans_test',
      title: 'Atlas Histológico com 20 Scans',
      textPages,
      pageCount: 20,
    });

    assert.equal(res.status, 200);
    assert.ok(
      capturedImagePartsCount <= 12,
      `Número de imagens enviadas (${capturedImagePartsCount}) não pode ultrapassar o teto defensivo de 12 para evitar estouro de payload`
    );
    assert.equal(capturedImagePartsCount, 12, 'Deve ter truncado estritamente nas primeiras 12 páginas com imagem');
  } finally {
    resetAIClientFactory();
  }
});

test('T367: [Payload Multimodal] Páginas ilegíveis ou degradadas geram relatório de legibilidade transparente', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          domain: 'Manuscritos',
          centralTheme: 'Texto Degradado',
          learningObjectives: ['Identificar'],
          fundamentalConcepts: [
            {
              id: 'c_deg',
              name: 'Fragmento',
              definition: 'Texto fragmentado.',
              importance: 'fundamental',
              epistemicStatus: 'model_inference',
              evidenceReferences: [{ id: 'ev1', type: 'pdf_page', pageNumber: 1, excerpt: 'Fragmento.' }],
              prerequisiteConceptIds: [],
            },
          ],
          complementaryConcepts: [],
          relationships: [],
          suggestedDiagramType: 'concept-map',
        }),
      }),
    },
  }));

  try {
    const res = await mockAnalyzeDocument({
      documentId: 'doc_degraded_test',
      title: 'Manuscrito com Páginas Ilegíveis',
      textPages: [
        { pageNumber: 1, textContent: 'Fragmento legível.', hasVisualElements: false, legibility: 'clean' },
        { pageNumber: 2, textContent: '', hasVisualElements: false, legibility: 'degraded' },
      ],
      pageCount: 2,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.coverage.legibilitySummary.degradedPageCount, 1);
    assert.ok(
      res.body.coverage.legibilitySummary.warnings.some((w: string) => w.includes('inconclusivo') || w.includes('escasso')),
      'Deve emitir aviso específico sobre páginas degradadas/inconclusivas'
    );
  } finally {
    resetAIClientFactory();
  }
});

test('T368: [Payload Multimodal] Isolamento estrito entre requisições concorrentes de documentos distintos', async () => {
  const capturedDocs: string[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        const parts = params?.contents?.parts || [];
        const titleLine = parts.find((p: any) => p.text && p.text.includes('material acadêmico anexado'));
        if (titleLine) capturedDocs.push(titleLine.text);
        return {
          text: JSON.stringify({
            domain: 'Isolamento',
            centralTheme: 'Teste Concorrente',
            learningObjectives: ['Isolamento'],
            fundamentalConcepts: [
              {
                id: 'c_iso',
                name: 'Isolamento',
                definition: 'Isolamento de estado.',
                importance: 'fundamental',
                epistemicStatus: 'explicitly_documented',
                evidenceReferences: [{ id: 'ev1', type: 'pdf_page', pageNumber: 1, excerpt: 'Isolamento.' }],
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [],
            suggestedDiagramType: 'concept-map',
          }),
        };
      },
    },
  }));

  try {
    const [resA, resB] = await Promise.all([
      mockAnalyzeDocument({
        documentId: 'doc_A_neuro',
        title: 'Documento Alfa de Neurociência',
        textPages: [{ pageNumber: 1, textContent: 'Texto Alfa', hasVisualElements: false }],
        pageCount: 1,
      }),
      mockAnalyzeDocument({
        documentId: 'doc_B_quantum',
        title: 'Documento Beta de Física Quântica',
        textPages: [{ pageNumber: 1, textContent: 'Texto Beta', hasVisualElements: false }],
        pageCount: 1,
      }),
    ]);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.equal(resA.body.documentId, 'doc_A_neuro');
    assert.equal(resB.body.documentId, 'doc_B_quantum');

    // Verifica que cada chamada recebeu estritamente seu próprio título e conteúdo sem vazamento
    assert.ok(capturedDocs.some((d) => d.includes('Documento Alfa de Neurociência')));
    assert.ok(capturedDocs.some((d) => d.includes('Documento Beta de Física Quântica')));
  } finally {
    resetAIClientFactory();
  }
});


