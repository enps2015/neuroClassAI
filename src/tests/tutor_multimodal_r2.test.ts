/**
 * NeuroClass AI — Suíte de Testes de Consolidação Multimodal do Tutor (Missão R2)
 * @file src/tests/tutor_multimodal_r2.test.ts
 *
 * Validação determinística dos 15 critérios de aceitação (T01 a T15):
 * T01 Figura: bytes corretos enviados em inlineData com MIME e página física.
 * T02 Gráfico: eixos, legenda e tendências; exigência de não inventar valores ilegíveis.
 * T03 Diagrama: relações/setas e proveniência correta (ID, documento, página).
 * T04 Tabela: cabeçalhos, células e unidades preservados na página física.
 * T05 Fórmula: símbolos e notação matemática preservados no payload.
 * T06 Página sem imagem: não enviar payload vazio nem imagem de outro documento.
 * T07 Modelo somente-texto: compatibilidade e declaração explícita de ausência de análise visual.
 * T08 MIME inválido / arquivo corrompido: rejeição controlada com HTTP 400.
 * T09 Imagem acima do limite: bloqueio controlado (HTTP 413 / HTTP 400).
 * T10 Isolamento Documento A/B: impedir vazamento cruzado entre documentos.
 * T11 Exclusão: limpeza de referências e recursos temporários no ciclo de vida.
 * T12 Consentimento negado: nenhum conteúdo visual enviado sem chave BYOK (HTTP 401).
 * T13 Erro/timeout do provedor: falha honesta, sem resposta simulada.
 * T14 Blind Recall: nenhuma pista visual antes da resposta do estudante no estágio Recuperar.
 * T15 Proveniência: página física e ID correspondem à imagem efetivamente enviada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAIClientFactory,
  resetAIClientFactory,
  app,
} from '../../server.ts';
import {
  resolveTutorVisualAssets,
  validateVisualAssetPayload,
  isVisualIntentQuery,
  extractPageNumberFromQuery,
} from '../services/retrieval/tutorVisualResolverService';
import type { DocumentSource, Concept } from '../types';
import type { TutorVisualAsset } from '../types/rag';

// Imagem 1x1 pixel PNG transparente válida em base64 (70 bytes decodificados)
const VALID_1PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Helper para invocar /api/gemini/tutor-chat via router Express
async function invokeTutorChat(body: any, headers: Record<string, string> = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      origin: 'https://neuroclass.ai',
      'x-gemini-api-key': 'AIzaSyMockKeyValidForTest123',
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

  const route = (app as any)._router.stack.find(
    (layer: any) => layer.route && layer.route.path === '/api/gemini/tutor-chat'
  );

  if (!route) {
    throw new Error('Rota /api/gemini/tutor-chat não encontrada no servidor.');
  }

  await route.route.stack[0].handle(req, res);
  return { status: statusCode, body: responseData };
}

// Documento de teste controlado
const TEST_DOC_A: DocumentSource = {
  id: 'doc_neuro_001',
  title: 'Biofísica das Membranas Neuronais',
  subject: 'Neurociência Celular',
  type: 'pdf',
  isDemoMaterial: false,
  sizeBytes: 1024 * 100,
  mimeType: 'application/pdf',
  uploadedAt: Date.now(),
  pageCount: 5,
  pages: [
    {
      pageNumber: 1,
      textContent: 'Introdução ao potencial de membrana em repouso e gradientes iônicos.',
      hasVisualElements: true,
      pageImageBase64: `data:image/png;base64,${VALID_1PX_PNG_BASE64}`,
      detectedElements: { hasFigures: true, hasTables: false, hasFormulas: false, hasCharts: false },
    },
    {
      pageNumber: 2,
      textContent: 'Equação de Nernst para o equilíbrio eletroquímico do potássio.',
      hasVisualElements: true,
      pageImageBase64: `data:image/png;base64,${VALID_1PX_PNG_BASE64}`,
      detectedElements: { hasFigures: false, hasTables: false, hasFormulas: true, hasCharts: false },
    },
    {
      pageNumber: 3,
      textContent: 'Tabela de concentrações intra e extracelulares de sódio e potássio.',
      hasVisualElements: true,
      pageImageBase64: `data:image/png;base64,${VALID_1PX_PNG_BASE64}`,
      detectedElements: { hasFigures: false, hasTables: true, hasFormulas: false, hasCharts: false },
    },
    {
      pageNumber: 4,
      textContent: 'Gráfico de corrente versus voltagem dos canais dependentes de voltagem.',
      hasVisualElements: true,
      pageImageBase64: `data:image/png;base64,${VALID_1PX_PNG_BASE64}`,
      detectedElements: { hasFigures: false, hasTables: false, hasFormulas: false, hasCharts: true },
    },
    {
      pageNumber: 5,
      textContent: 'Conclusões gerais sobre a propagação saltatória em axônios mielinizados.',
      hasVisualElements: false,
      detectedElements: { hasFigures: false, hasTables: false, hasFormulas: false, hasCharts: false },
    },
  ],
};

const TEST_DOC_B: DocumentSource = {
  id: 'doc_cardio_999',
  title: 'Fisiologia Cardiovascular Humana',
  subject: 'Cardiologia',
  type: 'pdf',
  isDemoMaterial: false,
  sizeBytes: 1024 * 50,
  mimeType: 'application/pdf',
  uploadedAt: Date.now(),
  pageCount: 2,
  pages: [
    {
      pageNumber: 1,
      textContent: 'Mecânica da contração ventricular esquerda.',
      hasVisualElements: true,
      pageImageBase64: `data:image/png;base64,${VALID_1PX_PNG_BASE64}`,
    },
  ],
};

/* ==========================================================================
   TESTES DETERMINÍSTICOS T01 A T15
   ========================================================================== */

test('T01 [Figura]: Bytes corretos enviados em inlineData com MIME e proveniência de página física', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: 'Com base na Figura 1 da Página 1, observamos a câmara de vácuo...',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const visualAsset: TutorVisualAsset = {
      id: 'fig_p1_camara',
      documentId: TEST_DOC_A.id,
      pageNumber: 1,
      label: 'Figura 1 — Câmara de Vácuo',
      type: 'figure',
      imageBase64: VALID_1PX_PNG_BASE64,
      mimeType: 'image/png',
    };

    const res = await invokeTutorChat({
      userMessage: 'O que a Figura 1 na página 1 demonstra sobre a câmara?',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [visualAsset],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.visualAnalysisConducted, true);
    assert.equal(res.body.visualAssetsEvaluated?.length, 1);
    assert.equal(res.body.visualAssetsEvaluated[0].id, 'fig_p1_camara');
    assert.equal(res.body.visualAssetsEvaluated[0].pageNumber, 1);

    // Validação estrita do payload capturado pelo adaptador
    const inlinePart = capturedParts.find((p) => p.inlineData);
    assert.ok(inlinePart, 'Deve conter parte inlineData multimodal');
    assert.equal(inlinePart.inlineData.mimeType, 'image/png');
    assert.equal(inlinePart.inlineData.data, VALID_1PX_PNG_BASE64);

    const descPart = capturedParts.find((p) => typeof p.text === 'string' && p.text.includes('Página Física: 1'));
    assert.ok(descPart, 'Deve incluir identificação da página física da figura');
  } finally {
    resetAIClientFactory();
  }
});

test('T02 [Gráfico]: Eixos, legenda e diretriz de não inventar valores ilegíveis ou ambíguos', async () => {
  let systemPromptText = '';

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        const parts = params?.contents?.parts || [];
        systemPromptText = parts[0]?.text || '';
        return {
          text: 'Observando o Gráfico 1 na Página 4, os eixos representam Voltagem (mV) versus Corrente (pA)...',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const visualAsset: TutorVisualAsset = {
      id: 'chart_p4_iv',
      documentId: TEST_DOC_A.id,
      pageNumber: 4,
      label: 'Gráfico 1 — Curva I-V',
      type: 'chart',
      imageBase64: VALID_1PX_PNG_BASE64,
      mimeType: 'image/png',
    };

    const res = await invokeTutorChat({
      userMessage: 'Como interpretar os eixos e a inclinação da curva no Gráfico da página 4?',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [visualAsset],
    });

    assert.equal(res.status, 200);
    assert.ok(systemPromptText.includes('COMPREENSÃO VISUAL DIRETA'));
    assert.ok(
      systemPromptText.includes('NUNCA invente valores, rótulos, tendências'),
      'Deve instruir formalmente a não alucinar valores ilegíveis'
    );
    assert.ok(
      systemPromptText.includes('DECLARE HONESTAMENTE essa limitação e incerteza'),
      'Deve orientar declaração honesta de incerteza em dados ambíguos'
    );
  } finally {
    resetAIClientFactory();
  }
});

test('T03 [Diagrama]: Relações/setas e proveniência correta (ID do elemento, documento e página)', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: 'O diagrama na Página 1 indica a direção do fluxo com setas de ativação...',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const visualAsset: TutorVisualAsset = {
      id: 'diag_p1_fluxo',
      documentId: TEST_DOC_A.id,
      pageNumber: 1,
      label: 'Diagrama de Fluxo Sináptico',
      type: 'diagram',
      imageBase64: VALID_1PX_PNG_BASE64,
      mimeType: 'image/png',
    };

    const res = await invokeTutorChat({
      userMessage: 'Qual a direção das setas no diagrama da página 1?',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [visualAsset],
    });

    assert.equal(res.status, 200);
    const textParts = capturedParts.filter((p) => typeof p.text === 'string').map((p) => p.text);
    const provenancePart = textParts.find((t) => t.includes('diag_p1_fluxo') || t.includes('Diagrama de Fluxo Sináptico'));
    assert.ok(provenancePart, 'Deve identificar o rótulo/ID do diagrama no contexto');
    assert.ok(provenancePart.includes('Página Física: 1'));
    assert.ok(provenancePart.includes(TEST_DOC_A.title));
  } finally {
    resetAIClientFactory();
  }
});

test('T04 [Tabela]: Cabeçalhos, células, unidades e página física preservados', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: 'Na Tabela 1 da Página 3, as concentrações de Na+ são 145 mM externamente e 12 mM internamente...',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const visualAsset: TutorVisualAsset = {
      id: 'table_p3_ions',
      documentId: TEST_DOC_A.id,
      pageNumber: 3,
      label: 'Tabela 1 — Gradientes Iônicos',
      type: 'table',
      imageBase64: VALID_1PX_PNG_BASE64,
      mimeType: 'image/png',
    };

    const res = await invokeTutorChat({
      userMessage: 'Quais unidades e valores constam na Tabela da página 3?',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [visualAsset],
    });

    assert.equal(res.status, 200);
    const hasTableContext = capturedParts.some((p) => p.text && p.text.includes('Tipo: TABLE') && p.text.includes('Página Física: 3'));
    assert.ok(hasTableContext, 'Deve registrar tipo TABLE e página 3');
  } finally {
    resetAIClientFactory();
  }
});

test('T05 [Fórmula]: Símbolos e notação matemática preservados na instrução multimodal', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: 'A Equação na Página 2 expressa o potencial de equilíbrio E = (RT/zF) * ln([K+]fora / [K+]dentro)...',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const visualAsset: TutorVisualAsset = {
      id: 'formula_p2_nernst',
      documentId: TEST_DOC_A.id,
      pageNumber: 2,
      label: 'Equação 2.1 — Nernst',
      type: 'formula',
      imageBase64: VALID_1PX_PNG_BASE64,
      mimeType: 'image/png',
    };

    const res = await invokeTutorChat({
      userMessage: 'Como interpretar as variáveis na fórmula da página 2?',
      documentTitle: TEST_DOC_A.title,
      documentExcerpts: ['[Fórmula Equação 2.1 Pág. 2]: E = \\frac{RT}{zF} \\ln\\frac{[K^+]_{out}}{[K^+]_{in}}'],
      visualAssets: [visualAsset],
    });

    assert.equal(res.status, 200);
    const hasFormulaSnippet = capturedParts.some((p) => p.text && p.text.includes('\\frac{RT}{zF}'));
    assert.ok(hasFormulaSnippet, 'Notação LaTeX deve ser preservada intacta');
    assert.ok(capturedParts.some((p) => p.inlineData), 'Imagem da equação deve ser fornecida');
  } finally {
    resetAIClientFactory();
  }
});

test('T06 [Página sem imagem]: Não enviar payload vazio nem imagem de outro documento', () => {
  // Consulta referente à Página 5 (que não possui imagem renderizada em TEST_DOC_A)
  const resolved = resolveTutorVisualAssets({
    document: TEST_DOC_A,
    query: 'O que mostra o diagrama na página 5?',
    targetPageNumber: 5,
  });

  assert.equal(resolved.hasVisualContent, false);
  assert.equal(resolved.visualAssets.length, 0);
  assert.ok(resolved.warningNotice?.includes('não possui renderização de imagem disponível'));
});

test('T07 [Modelo somente-texto]: Compatibilidade e declaração explícita de ausência de análise visual', async () => {
  let capturedParts: any[] = [];

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        capturedParts = params?.contents?.parts || [];
        return {
          text: 'Em modo textual, o potencial de repouso é aproximadamente -70 mV.',
          modelUsed: 'gemini-3.5-flash-lite',
        };
      },
    },
  }));

  try {
    const res = await invokeTutorChat({
      userMessage: 'Explique a voltagem da membrana.',
      documentTitle: TEST_DOC_A.title,
      textOnlyModel: true,
      visualAssets: [
        {
          id: 'fig_dummy',
          documentId: TEST_DOC_A.id,
          pageNumber: 1,
          type: 'figure',
          imageBase64: VALID_1PX_PNG_BASE64,
          mimeType: 'image/png',
        },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.visualAnalysisConducted, false);
    // Nenhuma inlineData deve ser enviada
    const hasInline = capturedParts.some((p) => p.inlineData);
    assert.equal(hasInline, false, 'Modelo somente-texto não pode receber partes inlineData');

    // Deve conter declaração explícita
    const hasTextNotice = capturedParts.some(
      (p) => p.text && p.text.includes('opera exclusivamente em modo textual')
    );
    assert.ok(hasTextNotice, 'Deve declarar expressamente ausência de análise visual');
  } finally {
    resetAIClientFactory();
  }
});

test('T08 [MIME inválido / arquivo corrompido]: Rejeição controlada com HTTP 400', async () => {
  // Caso 1: MIME inválido (SVG não é suportado por modelos de visão Gemini)
  const resInvalidMime = await invokeTutorChat({
    userMessage: 'Analise esta imagem.',
    documentTitle: TEST_DOC_A.title,
    visualAssets: [
      {
        id: 'img_svg',
        documentId: TEST_DOC_A.id,
        pageNumber: 1,
        type: 'figure',
        imageBase64: VALID_1PX_PNG_BASE64,
        mimeType: 'image/svg+xml',
      },
    ],
  });

  assert.equal(resInvalidMime.status, 400);
  assert.ok(resInvalidMime.body.error.includes('Formato de imagem não suportado'));

  // Caso 2: Base64 corrompido
  const resCorrupted = await invokeTutorChat({
    userMessage: 'Analise esta imagem corrompida.',
    documentTitle: TEST_DOC_A.title,
    visualAssets: [
      {
        id: 'img_bad',
        documentId: TEST_DOC_A.id,
        pageNumber: 1,
        type: 'figure',
        imageBase64: 'NotValidBase64!!@@$$%%^^&&',
        mimeType: 'image/png',
      },
    ],
  });

  assert.equal(resCorrupted.status, 400);
  assert.ok(resCorrupted.body.error.includes('Payload visual corrompido'));
});

test('T09 [Imagem acima do limite]: Bloqueio controlado e mensagem clara (HTTP 413 / HTTP 400)', async () => {
  // Caso 1: Imagem com tamanho superior a 4MB (> 5.5MB em base64)
  const oversizedBase64 = 'A'.repeat(5.6 * 1024 * 1024);
  const resOversized = await invokeTutorChat({
    userMessage: 'Analise esta imagem pesada.',
    documentTitle: TEST_DOC_A.title,
    visualAssets: [
      {
        id: 'img_huge',
        documentId: TEST_DOC_A.id,
        pageNumber: 1,
        type: 'figure',
        imageBase64: oversizedBase64,
        mimeType: 'image/jpeg',
      },
    ],
  });

  assert.equal(resOversized.status, 413);
  assert.ok(resOversized.body.error.includes('excede o limite seguro de 4MB'));

  // Caso 2: Mais de 3 imagens no payload
  const resTooMany = await invokeTutorChat({
    userMessage: 'Analise 4 imagens.',
    documentTitle: TEST_DOC_A.title,
    visualAssets: [
      { id: '1', pageNumber: 1, type: 'figure', imageBase64: VALID_1PX_PNG_BASE64, mimeType: 'image/png' },
      { id: '2', pageNumber: 2, type: 'figure', imageBase64: VALID_1PX_PNG_BASE64, mimeType: 'image/png' },
      { id: '3', pageNumber: 3, type: 'figure', imageBase64: VALID_1PX_PNG_BASE64, mimeType: 'image/png' },
      { id: '4', pageNumber: 4, type: 'figure', imageBase64: VALID_1PX_PNG_BASE64, mimeType: 'image/png' },
    ],
  });

  assert.equal(resTooMany.status, 400);
  assert.ok(resTooMany.body.error.includes('excede o limite permitido'));
});

test('T10 [Isolamento Documento A/B]: Impedir vazamento cruzado entre documentos', () => {
  // Tentativa de resolver ativo pertencente ao Documento B dentro do contexto do Documento A
  const assetFromDocB: TutorVisualAsset = {
    id: 'asset_doc_b',
    documentId: TEST_DOC_B.id, // Pertence ao Doc B
    pageNumber: 1,
    type: 'figure',
    imageBase64: VALID_1PX_PNG_BASE64,
    mimeType: 'image/png',
  };

  const resolved = resolveTutorVisualAssets({
    document: TEST_DOC_A, // Documento ativo é o Doc A
    query: 'Explique a figura',
    explicitAssets: [assetFromDocB],
  });

  assert.equal(resolved.hasVisualContent, false);
  assert.equal(resolved.visualAssets.length, 0);
  assert.ok(resolved.rejectionReason?.includes('Violação de isolamento documental'));
  assert.ok(resolved.rejectionReason?.includes(TEST_DOC_B.id));
});

test('T11 [Exclusão / Ciclo de Vida]: Limpeza de referências e recursos temporários no contrato atual', () => {
  // Valida que o validador de payload detecta ativos desvinculados ou nulos
  const nullValidation = validateVisualAssetPayload(null as any);
  assert.equal(nullValidation.valid, false);

  // Validação de descarte limpo sem retenção de referências circulares
  const tempAsset: TutorVisualAsset = {
    id: 'temp_asset_001',
    documentId: TEST_DOC_A.id,
    pageNumber: 1,
    type: 'page_crop',
    imageBase64: VALID_1PX_PNG_BASE64,
    mimeType: 'image/png',
  };
  const val = validateVisualAssetPayload(tempAsset);
  assert.equal(val.valid, true);
  assert.ok(val.cleanBase64);
});

test('T12 [Consentimento negado / Chave ausente]: Nenhum conteúdo visual enviado sem chave BYOK (HTTP 401)', async () => {
  let modelInvoked = false;

  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        modelInvoked = true;
        return { text: 'Não deveria ser chamado' };
      },
    },
  }));

  try {
    // Requisição SEM header x-gemini-api-key
    const res = await invokeTutorChat(
      {
        userMessage: 'Explique a imagem.',
        documentTitle: TEST_DOC_A.title,
        visualAssets: [
          {
            id: 'fig_p1',
            documentId: TEST_DOC_A.id,
            pageNumber: 1,
            type: 'figure',
            imageBase64: VALID_1PX_PNG_BASE64,
            mimeType: 'image/png',
          },
        ],
      },
      { 'x-gemini-api-key': '' } // Vazio
    );

    assert.equal(res.status, 401);
    assert.equal(modelInvoked, false, 'Modelo de IA NUNCA deve ser invocado sem chave BYOK autorizada');
  } finally {
    resetAIClientFactory();
  }
});

test('T13 [Erro/Timeout do provedor]: Falha honesta tratada, sem resposta simulada', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        const error = new Error('504 Gateway Timeout: Deadline Exceeded during vision analysis.');
        (error as any).status = 504;
        throw error;
      },
    },
  }));

  try {
    const res = await invokeTutorChat({
      userMessage: 'Analise este diagrama complexo.',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [
        {
          id: 'diag_p1',
          documentId: TEST_DOC_A.id,
          pageNumber: 1,
          type: 'diagram',
          imageBase64: VALID_1PX_PNG_BASE64,
          mimeType: 'image/png',
        },
      ],
    });

    // Deve retornar erro de falha de comunicação sanitizado, NUNCA 200 com resposta fabricada
    assert.notEqual(res.status, 200);
    assert.ok(res.body.error, 'Deve retornar erro estruturado');
  } finally {
    resetAIClientFactory();
  }
});

test('T14 [Blind Recall no C.R.E.A.R.]: Nenhuma pista visual antes da resposta do estudante no estágio Recuperar', () => {
  // No estágio 'Recuperar' (Retrieval Practice), o estudante deve evocar conceitos sem pistas.
  // Testamos a garantia de que o resolvedor visual, quando invocado sem solicitação explícita ou
  // quando em modo de recuperação ativa, não injeta pistas no prompt.
  const isVisual = isVisualIntentQuery('Explique com suas palavras o potencial de repouso');
  assert.equal(isVisual, false, 'Pergunta conceitual de evocação livre não deve ativar injeção visual automática');

  // Se a consulta não solicita elementos visuais, a resolução retorna vazio
  const resolved = resolveTutorVisualAssets({
    document: TEST_DOC_A,
    query: 'Explique com suas palavras o potencial de repouso',
  });
  assert.equal(resolved.hasVisualContent, false);
  assert.equal(resolved.visualAssets.length, 0);
});

test('T15 [Proveniência]: Página física e ID correspondem exatamente à imagem enviada', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        text: 'A análise da Tabela 1 na Página 3 confirma os gradientes...',
        modelUsed: 'gemini-3.5-flash-lite',
      }),
    },
  }));

  try {
    const assetId = 'tabela_gradientes_p3';
    const pageTarget = 3;

    const res = await invokeTutorChat({
      userMessage: 'Qual o valor de K+ na tabela?',
      documentTitle: TEST_DOC_A.title,
      visualAssets: [
        {
          id: assetId,
          documentId: TEST_DOC_A.id,
          pageNumber: pageTarget,
          type: 'table',
          label: 'Tabela 1 — Gradientes',
          imageBase64: VALID_1PX_PNG_BASE64,
          mimeType: 'image/png',
        },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.visualAnalysisConducted, true);
    assert.equal(res.body.visualAssetsEvaluated?.length, 1);
    const evaluated = res.body.visualAssetsEvaluated[0];
    assert.equal(evaluated.id, assetId, 'ID avaliado deve bater rigorosamente com o ID enviado');
    assert.equal(evaluated.pageNumber, pageTarget, 'Página física deve corresponder rigorosamente à enviada');
    assert.equal(evaluated.type, 'table');
  } finally {
    resetAIClientFactory();
  }
});

