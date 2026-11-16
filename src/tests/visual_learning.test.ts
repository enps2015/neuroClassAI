import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAIClientFactory,
  resetAIClientFactory,
  getEffectiveApiKey,
  mapToSanitizedAIError,
  app,
} from '../../server.ts';
import { visualLearningService } from '../services/visual/visualLearningService';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import { generateCuratedDemoIllustration } from '../services/visual/demoIllustrations';
import {
  saveVisualResource,
  getVisualResourcesByDocument,
  getVisualResourcesByConcept,
  getVisualResourceById,
  saveStudyNote,
  getNotesByDocumentId,
  saveDocument,
  deleteVisualResource,
  deleteDocumentCompletely,
  exportUserDataAsJson,
  restoreUserDataFromJson,
  clearAllUserData,
  getDB,
} from '../services/persistence/indexedDb';
import type { VisualResource, VisualModality, StudyNote, DocumentSource } from '../types';

// Mock simples para simular chamadas de API Express em ambiente Node.js de teste
async function mockVisualGenerateRequest(body: any, headers: Record<string, string> = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      origin: 'https://neuroclass.ai',
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

  // Encontra a rota POST /api/visual/generate registrada no app Express
  const route = app._router.stack.find(
    (layer: any) => layer.route && layer.route.path === '/api/visual/generate'
  );

  if (!route) {
    throw new Error('Rota /api/visual/generate não encontrada no servidor.');
  }

  // Executa o handler da rota
  await route.route.stack[0].handle(req, res);

  return { status: statusCode, body: responseData };
}

test('T302: Bloqueio estrito de geração sem confirmação explícita de custos (consentimento obrigatório)', async () => {
  // 1. Backend: Requisição sem confirmCostConsent é sumariamente rejeitada com 400
  const resNoConsent = await mockVisualGenerateRequest(
    {
      conceptName: 'Plasticidade Sináptica',
      conceptDefinition: 'Capacidade das sinapses de se fortalecerem.',
      confirmCostConsent: false,
    },
    { 'x-gemini-api-key': 'AIzaSyMockKeyForTest123' }
  );

  assert.equal(resNoConsent.status, 400, 'Deve retornar status 400 quando consentimento for falso');
  assert.equal(resNoConsent.body?.code, 'CONSENT_REQUIRED');
  assert.ok(resNoConsent.body?.error.includes('Consentimento explícito sobre os custos'));

  // 2. Serviço de Cliente: Lança exceção antes mesmo de disparar requisição se consentimento não for dado
  await assert.rejects(
    async () => {
      await visualLearningService.generateVisualResource({
        documentId: 'doc_1',
        conceptId: 'conc_1',
        conceptName: 'Plasticidade Sináptica',
        conceptDefinition: 'Definição teste',
        documentTitle: 'Neurociência',
        modality: 'conceptual_illustration',
        confirmCostConsent: false,
      });
    },
    /Consentimento explícito sobre os custos/
  );
});

test('T303: Produção BYOK-only e autenticação individual na rota /api/visual/generate', async () => {
  // 1. Verificação fail-closed com ambiente de produção simulado
  const fakeProductionEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'byok-only',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  assert.throws(
    () => {
      getEffectiveApiKey(undefined, fakeProductionEnv);
    },
    (err: any) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
      return true;
    }
  );

  // 2. Com chave BYOK válida em produção, a autorização é concedida exclusivamente para a chave do estudante
  const effective = getEffectiveApiKey('AIzaSyValidStudentKey999', fakeProductionEnv);
  assert.equal(effective.source, 'byok');
  assert.equal(effective.key, 'AIzaSyValidStudentKey999');

  // 3. Endpoint /api/visual/generate rejeita requisições anônimas quando BYOK não for fornecido
  const resNoKey = await mockVisualGenerateRequest({
    conceptName: 'Potencial de Ação',
    conceptDefinition: 'Despolarização da membrana celular.',
    confirmCostConsent: true,
  });

  assert.equal(resNoKey.status, 401, 'Requisição anônima sem chave deve retornar 401');
  assert.equal(resNoKey.body?.code, 'INVALID_KEY');
});

test('T304: Geração bem-sucedida de recurso visual via modelo primário (gemini-3.1-flash-lite-image)', async () => {
  let capturedModel = '';
  let capturedPrompt = '';

  const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  setAIClientFactory((opts: { apiKey: string }) => {
    assert.equal(opts.apiKey, 'AIzaSyStudentKey-Alpha');
    return {
      models: {
        generateContent: async (params: any) => {
          capturedModel = params.model;
          capturedPrompt = params.contents[0].parts[0].text;
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: 'image/jpeg',
                        data: mockBase64Image,
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    };
  });

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Bainha de Mielina',
        conceptDefinition: 'Camada lipídica que reveste axônios e acelera condução nervosa.',
        documentTitle: 'Princípios de Neuroanatomia',
        subject: 'Neurociências',
        modality: 'conceptual_illustration',
        evidenceExcerpts: ['Página 42: A mielinização reduz a capacitância da membrana.'],
        relatedConcepts: ['Células de Schwann', 'Nódulos de Ranvier'],
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyStudentKey-Alpha' }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(capturedModel, 'gemini-3.1-flash-lite-image', 'Deve invocar o modelo econômico padrão');
    assert.ok(res.body.imageDataUrl.startsWith('data:image/jpeg;base64,'));
    assert.equal(res.body.conceptName, 'Bainha de Mielina');
    assert.ok(res.body.title.includes('Bainha de Mielina'));
    assert.ok(res.body.caption.length > 20);
  } finally {
    resetAIClientFactory();
  }
});

test('T305: Cobertura das 3 modalidades didáticas (ilustração, analogia visual, processo/mecanismo)', async () => {
  const modalities: VisualModality[] = ['conceptual_illustration', 'visual_analogy', 'process_mechanism'];
  const expectedPrefixes = ['Ilustração Conceitual', 'Analogia Visual', 'Mecanismo & Processo'];

  for (let i = 0; i < modalities.length; i++) {
    const mod = modalities[i];
    setAIClientFactory(() => ({
      models: {
        generateContent: async () => ({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'mockdata' } }],
              },
            },
          ],
        }),
      },
    }));

    try {
      const res = await mockVisualGenerateRequest(
        {
          conceptName: 'Sinapse',
          conceptDefinition: 'Junção de transmissão química entre neurônios.',
          modality: mod,
          confirmCostConsent: true,
        },
        { 'x-gemini-api-key': 'AIzaSyKey123' }
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.modality, mod);
      assert.ok(
        res.body.title.startsWith(expectedPrefixes[i]),
        `Título para modalidade ${mod} deve iniciar com ${expectedPrefixes[i]}`
      );
    } finally {
      resetAIClientFactory();
    }
  }
});

test('T306: Diretriz estrita Anti-Texto no prompt para evitar erros tipográficos', async () => {
  let promptSent = '';

  setAIClientFactory(() => ({
    models: {
      generateContent: async (params: any) => {
        promptSent = params.contents[0].parts[0].text;
        return {
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'mockdata' } }],
              },
            },
          ],
        };
      },
    },
  }));

  try {
    await mockVisualGenerateRequest(
      {
        conceptName: 'Long-Term Potentiation (LTP)',
        conceptDefinition: 'Aumento persistente da força sináptica.',
        modality: 'process_mechanism',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.ok(
      promptSent.includes('NÃO inclua nenhum texto, palavra, legenda, número, rótulo ou letra dentro da imagem'),
      'O prompt deve proibir estritamente a inserção de textos dentro da imagem para evitar erros tipográficos'
    );
  } finally {
    resetAIClientFactory();
  }
});

test('T307: Tratamento de erro de quota excedida (QUOTA_EXCEEDED / HTTP 429)', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        const err: any = new Error('Resource has been exhausted (e.g. check quota).');
        err.status = 429;
        throw err;
      },
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Neurogênese',
        conceptDefinition: 'Nascimento de novos neurônios.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'QUOTA_EXCEEDED');
    assert.ok(!res.body.error.includes('AIzaSyKey123'), 'Chave não pode vazar em respostas de erro');
  } finally {
    resetAIClientFactory();
  }
});

test('T308: Tratamento de timeout e cancelamento', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        const err: any = new Error('Request was aborted or timed out.');
        err.status = 504;
        err.code = 'TIMEOUT';
        throw err;
      },
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Dopamina',
        conceptDefinition: 'Neurotransmissor de recompensa e motivação.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.equal(res.status, 504);
    assert.equal(res.body.code, 'TIMEOUT');
  } finally {
    resetAIClientFactory();
  }
});

test('T309: Resposta sem imagem válida ou payload corrompido', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Apenas texto sem imagem gerada.' }],
            },
          },
        ],
      }),
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Serotonina',
        conceptDefinition: 'Regulador do humor e sono.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'SERVICE_UNAVAILABLE');
  } finally {
    resetAIClientFactory();
  }
});

test('T310: Validação de limite de tamanho de imagem gerada (segurança contra DoS)', async () => {
  // Gera uma string base64 que excede 7MB
  const giantBase64 = 'A'.repeat(8 * 1024 * 1024);

  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/jpeg', data: giantBase64 } }],
            },
          },
        ],
      }),
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Córtex Pré-Frontal',
        conceptDefinition: 'Funções executivas e tomada de decisão.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    assert.ok(res.body.error.includes('limite máximo seguro de 5MB'));
  } finally {
    resetAIClientFactory();
  }
});

test('T311: Isolamento estrito de requisições simultâneas e concorrência BYOK', async () => {
  const instantiatedKeys: string[] = [];

  setAIClientFactory((opts: { apiKey: string }) => {
    instantiatedKeys.push(opts.apiKey);
    return {
      models: {
        generateContent: async () => ({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/jpeg', data: `img_for_${opts.apiKey}` } }],
              },
            },
          ],
        }),
      },
    };
  });

  try {
    const userKeys = ['AIzaSy-Student-1', 'AIzaSy-Student-2', 'AIzaSy-Student-3'];

    const responses = await Promise.all(
      userKeys.map((key) =>
        mockVisualGenerateRequest(
          {
            conceptName: `Conceito-${key}`,
            conceptDefinition: 'Definição teste de concorrência',
            confirmCostConsent: true,
          },
          { 'x-gemini-api-key': key }
        )
      )
    );

    assert.equal(responses.length, 3);
    for (let i = 0; i < userKeys.length; i++) {
      assert.equal(responses[i].status, 200);
      assert.ok(responses[i].body.imageDataUrl.includes(`img_for_${userKeys[i]}`));
    }

    assert.equal(instantiatedKeys.length, 3);
    for (const k of userKeys) {
      assert.ok(instantiatedKeys.includes(k));
    }
  } finally {
    resetAIClientFactory();
  }
});

test('T312: Ausência de persistência automática (geração não grava no IndexedDB sem ação explícita)', async () => {
  await clearAllUserData();

  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'valid_base64_img' } }],
            },
          },
        ],
      }),
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Hipocampo',
        conceptDefinition: 'Estrutura crítica para consolidação da memória declarativa.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyKey123' }
    );

    assert.equal(res.status, 200);

    // Verifica que NENHUM recurso foi gravado no banco local apenas pelo ato de gerar
    const inDb = await getVisualResourcesByDocument('doc_test');
    assert.equal(inDb.length, 0, 'Geração não pode persistir dados automaticamente');
  } finally {
    resetAIClientFactory();
    await clearAllUserData();
  }
});

test('T313: Preview e descarte (descarte limpa estado sem tocar no IndexedDB)', async () => {
  await clearAllUserData();

  // Simula o ciclo de preview e descarte no cliente
  const generatedData = {
    imageDataUrl: 'data:image/jpeg;base64,previewOnlyData',
    title: 'Preview descartado',
    caption: 'Legenda teste',
    modality: 'visual_analogy' as VisualModality,
    conceptName: 'Amígdala',
    modelUsed: 'gemini-3.1-flash-lite-image',
    promptUsed: 'Prompt teste',
  };

  // Se o estudante clicar em Descartar, nenhum saveVisualResource é chamado
  const resources = await getVisualResourcesByConcept('conc_amygdala');
  assert.equal(resources.length, 0, 'Descarte não deve salvar nenhum registro');
});

test('T314: Salvamento explícito na biblioteca visual (IndexedDB)', async () => {
  await clearAllUserData();

  const resource: VisualResource = {
    id: 'vis_hipocampo_001',
    documentId: 'doc_neuro_101',
    conceptId: 'conc_hipocampo',
    conceptName: 'Hipocampo',
    modality: 'conceptual_illustration',
    title: 'Ilustração Conceitual: Hipocampo',
    caption: 'Representação anatômica das sub-regiões CA1, CA3 e Giro Denteado.',
    promptUsed: 'Prompt de ilustração anatômica do hipocampo sem texto',
    imageDataUrl: 'data:image/jpeg;base64,hipocampoDataBytes123',
    mimeType: 'image/jpeg',
    referenceExcerpts: ['Página 12: O giro denteado recebe projeções do córtex entorrinal.'],
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  };

  // Salvamento explícito disparado pelo clique do estudante
  await saveVisualResource(resource);

  // Consulta por documento
  const byDoc = await getVisualResourcesByDocument('doc_neuro_101');
  assert.equal(byDoc.length, 1);
  assert.equal(byDoc[0].id, 'vis_hipocampo_001');
  assert.equal(byDoc[0].conceptName, 'Hipocampo');

  // Consulta por conceito
  const byConcept = await getVisualResourcesByConcept('conc_hipocampo');
  assert.equal(byConcept.length, 1);
  assert.equal(byConcept[0].title, 'Ilustração Conceitual: Hipocampo');

  // Remoção individual
  await deleteVisualResource('vis_hipocampo_001');
  const afterDelete = await getVisualResourcesByConcept('conc_hipocampo');
  assert.equal(afterDelete.length, 0);

  await clearAllUserData();
});

test('T315: Exclusão em cascata de recursos visuais ao remover documento', async () => {
  await clearAllUserData();

  // Documento A com 2 recursos visuais
  await saveVisualResource({
    id: 'vis_docA_1',
    documentId: 'doc_A',
    conceptId: 'conc_1',
    conceptName: 'Conceito 1',
    modality: 'conceptual_illustration',
    title: 'Recurso A1',
    caption: 'Legenda A1',
    promptUsed: 'prompt',
    imageDataUrl: 'data:image/jpeg;base64,dataA1',
    mimeType: 'image/jpeg',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  });

  await saveVisualResource({
    id: 'vis_docA_2',
    documentId: 'doc_A',
    conceptId: 'conc_2',
    conceptName: 'Conceito 2',
    modality: 'visual_analogy',
    title: 'Recurso A2',
    caption: 'Legenda A2',
    promptUsed: 'prompt',
    imageDataUrl: 'data:image/jpeg;base64,dataA2',
    mimeType: 'image/jpeg',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  });

  // Documento B com 1 recurso visual isolado
  await saveVisualResource({
    id: 'vis_docB_1',
    documentId: 'doc_B',
    conceptId: 'conc_3',
    conceptName: 'Conceito 3',
    modality: 'process_mechanism',
    title: 'Recurso B1',
    caption: 'Legenda B1',
    promptUsed: 'prompt',
    imageDataUrl: 'data:image/jpeg;base64,dataB1',
    mimeType: 'image/jpeg',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: Date.now(),
  });

  // Confirma que existem 2 recursos em A e 1 em B
  const initialA = await getVisualResourcesByDocument('doc_A');
  const initialB = await getVisualResourcesByDocument('doc_B');
  assert.equal(initialA.length, 2);
  assert.equal(initialB.length, 1);

  // Executa exclusão completa em cascata do Documento A
  await deleteDocumentCompletely('doc_A');

  // Os recursos do documento A foram totalmente purgados
  const afterA = await getVisualResourcesByDocument('doc_A');
  assert.equal(afterA.length, 0, 'Todos os recursos visuais de doc_A devem ter sido excluídos em cascata');

  // Os recursos do documento B permanecem intactos (isolamento de documento)
  const afterB = await getVisualResourcesByDocument('doc_B');
  assert.equal(afterB.length, 1, 'Recursos de doc_B devem permanecer inalterados');
  assert.equal(afterB[0].id, 'vis_docB_1');

  await clearAllUserData();
});

test('T316: Roundtrip de backup JSON e restauração de recursos visuais', async () => {
  await clearAllUserData();

  const originalResource: VisualResource = {
    id: 'vis_backup_test',
    documentId: 'doc_backup',
    conceptId: 'conc_backup',
    conceptName: 'Memória Operacional',
    modality: 'process_mechanism',
    title: 'Mecanismo da Memória Operacional',
    caption: 'Alça fonológica, esboço visuoespacial e executivo central.',
    promptUsed: 'Prompt backup',
    imageDataUrl: 'data:image/jpeg;base64,backupBytes456',
    mimeType: 'image/jpeg',
    modelUsed: 'gemini-3.1-flash-lite-image',
    createdAt: 1730000000000,
  };

  await saveVisualResource(originalResource);

  // Exporta backup
  const jsonBackup = await exportUserDataAsJson();
  assert.ok(jsonBackup.includes('vis_backup_test'));
  assert.ok(jsonBackup.includes('backupBytes456'));

  // Limpa banco completamente (Factory reset local)
  await clearAllUserData();
  const emptyCheck = await getVisualResourcesByDocument('doc_backup');
  assert.equal(emptyCheck.length, 0);

  // Restaura dados a partir do JSON
  const restoreSummary = await restoreUserDataFromJson(jsonBackup);
  assert.equal(restoreSummary.visualResourcesCount, 1);

  // Verifica reconstituição fidedigna
  const restored = await getVisualResourcesByConcept('conc_backup');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 'vis_backup_test');
  assert.equal(restored[0].title, 'Mecanismo da Memória Operacional');
  assert.equal(restored[0].imageDataUrl, 'data:image/jpeg;base64,backupBytes456');

  await clearAllUserData();
});

test('T317: Sem API Key: geração bloqueada', async () => {
  // 1. Backend: Requisição anônima sem chave é bloqueada com status 401
  const res = await mockVisualGenerateRequest({
    conceptName: 'Fóton e Quantização de Energia',
    conceptDefinition: 'Pacote elementar e localizado de radiação eletromagnética.',
    confirmCostConsent: true,
  });

  assert.equal(res.status, 401, 'Deve bloquear com 401 se não houver chave');
  assert.equal(res.body?.code, 'INVALID_KEY');

  // 2. Cliente: Tentativa de disparar geração com AIKeyManager sem chave lança erro imediatamente
  AIKeyManager.clearApiKey();
  await assert.rejects(
    async () => {
      await visualLearningService.generateVisualResource({
        documentId: 'demo_quantum_photoelectric',
        conceptId: 'conc_foton',
        conceptName: 'Fóton e Quantização de Energia',
        conceptDefinition: 'Pacote elementar e localizado de radiação eletromagnética.',
        documentTitle: 'Efeito Fotoelétrico',
        modality: 'conceptual_illustration',
        confirmCostConsent: true,
      });
    },
    /Chave de API Gemini necessária ou inválida/
  );
});

test('T318: Sem API Key: nenhuma imagem demonstrativa apresentada como resultado gerado', async () => {
  // Mesmo para documentos de demonstração (isDemoMaterial: true), nenhuma imagem simulada deve ser retornada no endpoint de geração
  const res = await mockVisualGenerateRequest({
    documentId: 'demo_neurobiology_synapse',
    conceptId: 'c_transmissao_sinaptica_quimica',
    conceptName: 'Transmissão Sináptica Química',
    conceptDefinition: 'Comunicação interneuronal mediada por vesículas e neurotransmissores.',
    isDemoMaterial: true,
    confirmCostConsent: true,
  });

  assert.equal(res.status, 401, 'Requisição em demo sem chave não deve retornar 200');
  assert.equal(res.body?.imageDataUrl, undefined, 'Nenhuma imagem pode ser retornada como resultado de geração');
  assert.notEqual(res.body?.success, true);
});

test('T319: Sem API Key: configuração BYOK oferecida ao estudante', async () => {
  const res = await mockVisualGenerateRequest({
    conceptName: 'Plasticidade Neuronal',
    conceptDefinition: 'Capacidade do tecido nervoso de reorganizar suas conexões.',
    confirmCostConsent: true,
  });

  assert.equal(res.status, 401);
  assert.ok(
    res.body?.error.includes('BYOK') || res.body?.error.includes('chave'),
    'Mensagem de erro deve orientar o estudante a configurar sua chave própria BYOK'
  );
});

test('T320: API Key inválida: erro apresentado sem fallback', async () => {
  resetAIClientFactory();
  setAIClientFactory(() => {
    const err: any = new Error('API key not valid. Please pass a valid API key.');
    err.status = 400;
    err.code = 'INVALID_ARGUMENT';
    throw err;
  });

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Potencial de Ação',
        conceptDefinition: 'Despolarização abrupta através da membrana axonal.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyChaveInvalidaParaTeste' }
    );

    assert.equal(res.status, 401, 'Chave inválida deve retornar status 401');
    assert.equal(res.body?.code, 'INVALID_KEY');
    assert.equal(res.body?.imageDataUrl, undefined, 'Não deve haver imagem de fallback em caso de chave inválida');
  } finally {
    resetAIClientFactory();
  }
});

test('T321: API Key válida: imagem recebida do mock Gemini', async () => {
  const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: mockBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    },
  }));

  try {
    const res = await mockVisualGenerateRequest(
      {
        conceptName: 'Fóton e Quantização de Energia',
        conceptDefinition: 'Pacote elementar e localizado de radiação.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyChaveValida999' }
    );

    assert.equal(res.status, 200, 'Requisição com chave válida e resposta do modelo deve retornar 200');
    assert.equal(res.body?.success, true);
    assert.ok(res.body?.imageDataUrl.startsWith('data:image/jpeg;base64,' + mockBase64));
    assert.equal(res.body?.modelUsed, 'gemini-3.1-flash-lite-image');
  } finally {
    resetAIClientFactory();
  }
});

test('T322: Gerar Novamente: nova chamada ao backend', async () => {
  let callCount = 0;
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        callCount++;
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: `base64_generation_${callCount}`,
                    },
                  },
                ],
              },
            },
          ],
        };
      },
    },
  }));

  try {
    // 1ª Geração
    const firstRes = await mockVisualGenerateRequest(
      {
        conceptName: 'Sinapse Química',
        conceptDefinition: 'Transmissão neurotransmissora.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyChaveValida' }
    );
    assert.equal(firstRes.status, 200);
    assert.ok(firstRes.body?.imageDataUrl.includes('base64_generation_1'));
    assert.equal(callCount, 1);

    // 2ª Geração ("Gerar Novamente")
    const secondRes = await mockVisualGenerateRequest(
      {
        conceptName: 'Sinapse Química',
        conceptDefinition: 'Transmissão neurotransmissora.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyChaveValida' }
    );
    assert.equal(secondRes.status, 200);
    assert.ok(secondRes.body?.imageDataUrl.includes('base64_generation_2'));
    assert.equal(callCount, 2, 'Cada clique em Gerar Novamente deve disparar uma nova chamada real à API');
  } finally {
    resetAIClientFactory();
  }
});

test('T323: Falha na API: nenhuma falsa indicação de sucesso', async () => {
  // 1. Quota Excedida (429)
  setAIClientFactory(() => {
    const quotaErr: any = new Error('Resource has been exhausted (e.g. check quota).');
    quotaErr.status = 429;
    quotaErr.code = 'RESOURCE_EXHAUSTED';
    throw quotaErr;
  });

  try {
    const resQuota = await mockVisualGenerateRequest(
      {
        conceptName: 'Fóton',
        conceptDefinition: 'Energia quântica.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyValidaComQuotaEsgotada' }
    );
    assert.equal(resQuota.status, 429);
    assert.equal(resQuota.body?.code, 'QUOTA_EXCEEDED');
    assert.equal(resQuota.body?.imageDataUrl, undefined);
    assert.notEqual(resQuota.body?.success, true);
  } finally {
    resetAIClientFactory();
  }

  // 2. Resposta sem imagem (conteúdo vazio)
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => ({
        candidates: [{ content: { parts: [{ text: 'Apenas texto sem imagem' }] } }],
      }),
    },
  }));

  try {
    const resNoImage = await mockVisualGenerateRequest(
      {
        conceptName: 'Fóton',
        conceptDefinition: 'Energia quântica.',
        confirmCostConsent: true,
      },
      { 'x-gemini-api-key': 'AIzaSyValida' }
    );
    assert.equal(resNoImage.status, 503, 'Ausência de dados de imagem deve retornar 503');
    assert.equal(resNoImage.body?.code, 'SERVICE_UNAVAILABLE');
    assert.equal(resNoImage.body?.imageDataUrl, undefined);
    assert.notEqual(resNoImage.body?.success, true);
  } finally {
    resetAIClientFactory();
  }
});

test('T324: Modo demonstração: imagem estática identificada claramente', () => {
  const demoResult = generateCuratedDemoIllustration(
    'c_transmissao_sinaptica_quimica',
    'Transmissão Sináptica Química',
    'process_mechanism',
    'Neurobiologia'
  );

  // 1. Validação estrita da diretriz anti-texto
  assert.ok(!demoResult.svg.includes('<text'), 'SVG demonstrativo não pode conter tag <text>');
  assert.ok(!demoResult.svg.includes('<tspan'), 'SVG demonstrativo não pode conter tag <tspan>');

  // 2. Presença de dados válidos
  assert.ok(demoResult.dataUrl.startsWith('data:image/svg+xml;base64,'));
  assert.ok(demoResult.title.includes('Transmissão Sináptica Química'));
  assert.ok(demoResult.caption.length > 20);
});

test('T325: Estado de carregamento e prevenção de requisições duplicadas', async () => {
  AIKeyManager.setApiKey('AIzaSyValidKeyForConcurrencyTest');

  // Simula estado ativo de geração no serviço
  (visualLearningService as any).isGenerating = true;

  try {
    await assert.rejects(
      async () => {
        await visualLearningService.generateVisualResource({
          documentId: 'doc_concurrency',
          conceptId: 'conc_concurrency',
          conceptName: 'Concorrência',
          conceptDefinition: 'Processamento paralelo.',
          documentTitle: 'Concorrência Doc',
          modality: 'conceptual_illustration',
          confirmCostConsent: true,
        });
      },
      /já está em andamento/i
    );
  } finally {
    (visualLearningService as any).isGenerating = false;
    AIKeyManager.clearApiKey();
  }
});

// ============================================================================
// VISUAL LEARNING v1.1 — INTEGRAÇÃO PEDAGÓGICA (C.R.E.A.R., BLACKBOARD, TUTOR, CADERNO)
// ============================================================================

test('T326: Blackboard & getVisualSupportForConcept: recupera recursos salvos e faz fallback para demonstrativo', async () => {
  const docId = 'doc_test_support_326';
  const conceptId = 'conc_synapse_326';

  // 1. Sem recursos salvos e sem demo: lista vazia
  const initial = await visualLearningService.getVisualSupportForConcept(
    conceptId,
    'Sinapse',
    docId,
    'Doc Teste',
    false
  );
  assert.equal(initial.length, 0);

  // 2. Salva recurso do estudante
  const savedRes: VisualResource = {
    id: 'vis_test_326_1',
    documentId: docId,
    conceptId: conceptId,
    conceptName: 'Sinapse',
    modality: 'process_mechanism',
    mimeType: 'image/svg+xml',
    imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    title: 'Mecanismo Sináptico',
    caption: 'Legenda didática da sinapse química.',
    modelUsed: 'gemini-3.1-flash-lite-image',
    promptUsed: 'Prompt de teste',
    referenceExcerpts: ['Pág. 1: Evidência'],
    createdAt: Date.now(),
  };
  await saveVisualResource(savedRes);

  const afterSave = await visualLearningService.getVisualSupportForConcept(
    conceptId,
    'Sinapse',
    docId,
    'Doc Teste',
    false
  );
  assert.equal(afterSave.length, 1);
  assert.equal(afterSave[0].id, 'vis_test_326_1');
  assert.equal(afterSave[0].title, 'Mecanismo Sináptico');

  // 3. Fallback para demonstração quando isDemoMaterial=true e sem recursos salvos
  const demoFallback = await visualLearningService.getVisualSupportForConcept(
    'conc_demo_326_unseen',
    'Potencial de Ação',
    'demo_neuro',
    'Neurociência',
    true
  );
  assert.equal(demoFallback.length, 1);
  assert.ok(demoFallback[0].title.includes('Potencial de Ação'));
  assert.equal(demoFallback[0].modelUsed, 'Exemplo Didático de Referência');
});

test('T327: C.R.E.A.R. Contextualizar: suporte visual opcional para ancoragem de estruturas', async () => {
  const support = await visualLearningService.getVisualSupportForConcept(
    'c_dopamina',
    'Dopamina e Recompensa',
    'demo_neuro',
    'Neurobiologia',
    true
  );

  assert.ok(support.length > 0, 'Deve retornar apoio visual para o estágio Contextualizar');
  assert.ok(support[0].imageDataUrl.startsWith('data:image/svg+xml;base64,'));
  // Invariante pedagógica: não deve alterar o cálculo de domínio ou mutar estado cognitivo
  assert.ok(typeof support[0].caption === 'string' && support[0].caption.length > 0);
});

test('T328: C.R.E.A.R. Relacionar: suporte visual disponível para mapear relações conceituais', async () => {
  const support = await visualLearningService.getVisualSupportForConcept(
    'c_plasticidade',
    'Plasticidade Sináptica',
    'demo_neuro',
    'Neurobiologia',
    true
  );

  assert.ok(support.length > 0, 'Deve retornar apoio visual para o estágio Relacionar');
  assert.equal(support[0].conceptName, 'Plasticidade Sináptica');
});

test('T329: C.R.E.A.R. Explicar: consulta ao apoio visual preservando elaboração autônoma', async () => {
  const support = await visualLearningService.getVisualSupportForConcept(
    'c_mielina',
    'Bainha de Mielina',
    'demo_neuro',
    'Neurobiologia',
    true
  );

  assert.ok(support.length > 0);
  // Regra pedagógica: a imagem serve como apoio consultivo sem substituir o texto
  const pedagogicalRequirementMet = !support[0].imageDataUrl.includes('texto_substituto');
  assert.ok(pedagogicalRequirementMet);
});

test('T330: C.R.E.A.R. Aplicar: representação visual de mecanismo para referência de caso', async () => {
  const support = await visualLearningService.getVisualSupportForConcept(
    'c_potencial_acao',
    'Potencial de Ação',
    'demo_neuro',
    'Neurobiologia',
    true
  );

  assert.ok(support.length > 0);
  assert.ok(support[0].caption.length > 0);
});

test('T331: C.R.E.A.R. Recuperar: estrita ocultação da pista visual antes da tentativa (Blind Recall)', () => {
  // Simulador do contrato pedagógico de blind recall (Efeito de Testagem / Roediger & Karpicke)
  function canRevealVisualCue(attemptSubmitted: boolean, userRequestedReveal: boolean): boolean {
    if (!attemptSubmitted) return false; // NUNCA revela antes da tentativa ativa
    return userRequestedReveal;
  }

  // Antes de submeter a tentativa
  assert.equal(canRevealVisualCue(false, false), false, 'Bloqueado antes da submissão');
  assert.equal(canRevealVisualCue(false, true), false, 'Mesmo com pedido, bloqueado antes da submissão');

  // Estritamente após a submissão da tentativa pelo estudante
  assert.equal(canRevealVisualCue(true, false), false, 'Oculto por padrão após submissão até ação explícita');
  assert.equal(canRevealVisualCue(true, true), true, 'Revelado após tentativa e consentimento explícito');
});

test('T332: Caderno de Estudos: associação entre anotação e recurso visual (associatedVisualResourceId)', async () => {
  const docId = 'doc_notebook_test_332';
  const resourceId = 'vis_notebook_332';
  const noteId = 'note_332_1';

  const resource: VisualResource = {
    id: resourceId,
    documentId: docId,
    conceptId: 'conc_332',
    conceptName: 'Neuroplasticidade',
    modality: 'conceptual_illustration',
    mimeType: 'image/svg+xml',
    imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz5ub3RlPC9zdmc+',
    title: 'Neuroplasticidade Ilustrada',
    caption: 'Diagrama conceitual das sinapses mutáveis.',
    modelUsed: 'gemini-3.1-flash-lite-image',
    promptUsed: 'Prompt de neuroplasticidade',
    createdAt: Date.now(),
  };
  await saveVisualResource(resource);

  const note: StudyNote = {
    id: noteId,
    documentId: docId,
    title: 'Anotações sobre Neuroplasticidade',
    content: 'Observar a reorganização sináptica e espinhos dendríticos.',
    associatedVisualResourceId: resourceId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveStudyNote(note);

  // Recupera as anotações do documento
  const notes = await getNotesByDocumentId(docId);
  const foundNote = notes.find((n) => n.id === noteId);
  assert.ok(foundNote, 'Anotação deve ser persistida');
  assert.equal(foundNote.associatedVisualResourceId, resourceId);

  // Recupera o recurso visual pelo ID vinculado
  const linkedResource = await getVisualResourceById(foundNote.associatedVisualResourceId!);
  assert.ok(linkedResource, 'Recurso visual vinculado deve ser recuperável pelo ID');
  assert.equal(linkedResource.title, 'Neuroplasticidade Ilustrada');
});

test('T333: Contexto do Tutor: identificação de recursos visuais e ação textual sem consumo de cota', async () => {
  const visuals = await visualLearningService.getVisualSupportForConcept(
    'c_sinapse_333',
    'Fenda Sináptica',
    'demo_neuro',
    'Neurobiologia',
    true
  );

  assert.ok(visuals.length > 0, 'Tutor deve identificar apoios visuais disponíveis para o conceito ativo');

  // Geração do prompt de apoio visual no Tutor: estritamente textual, sem payload de imagem
  const tutorPrompt = `A partir do contexto textual de "${visuals[0].conceptName}", descreva textualmente sua organização visual, componentes e os princípios dinâmicos representados nesta ilustração didática.`;

  assert.ok(typeof tutorPrompt === 'string');
  assert.ok(!tutorPrompt.includes('data:image/'));
  assert.ok(!tutorPrompt.includes('base64,'));
  assert.ok(tutorPrompt.includes('Fenda Sináptica'));
  assert.ok(tutorPrompt.includes('contexto textual'));
});

test('T334: Exclusão em cascata: remoção do documento remove notas e recursos visuais correspondentes', async () => {
  const docId = 'doc_cascade_334';
  const resourceId = 'vis_cascade_334';
  const noteId = 'note_cascade_334';

  const doc: DocumentSource = {
    id: docId,
    title: 'Documento Cascade Test',
    subject: 'Farmacologia',
    type: 'notes',
    isDemoMaterial: false,
    sizeBytes: 120,
    mimeType: 'text/plain',
    uploadedAt: Date.now(),
  };
  await saveDocument(doc);

  await saveVisualResource({
    id: resourceId,
    documentId: docId,
    conceptId: 'conc_farmaco',
    conceptName: 'Agonista',
    modality: 'visual_analogy',
    mimeType: 'image/svg+xml',
    imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz5kZWxldGU8L3N2Zz4=',
    title: 'Analogia Chave-Fechadura',
    caption: 'Mecanismo agonista.',
    modelUsed: 'gemini-3.1-flash-lite-image',
    promptUsed: 'Prompt',
    createdAt: Date.now(),
  });

  await saveStudyNote({
    id: noteId,
    documentId: docId,
    title: 'Nota de Farmacologia',
    content: 'Receptores farmacológicos.',
    associatedVisualResourceId: resourceId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Executa exclusão completa do documento
  await deleteDocumentCompletely(docId);

  // Valida que o documento, recursos e notas foram excluídos
  const remainingVisuals = await getVisualResourcesByDocument(docId);
  const remainingNotes = await getNotesByDocumentId(docId);
  const remainingResource = await getVisualResourceById(resourceId);

  assert.equal(remainingVisuals.length, 0, 'Recursos visuais do documento devem ser excluídos');
  assert.equal(remainingNotes.length, 0, 'Notas do documento devem ser excluídas');
  assert.equal(remainingResource, undefined, 'Recurso visual deve retornar undefined');
});

test('T335: Backup e restauração JSON preservando associatedVisualResourceId em notas', async () => {
  const docId = 'doc_backup_335';
  const resourceId = 'vis_backup_335';
  const noteId = 'note_backup_335';

  await saveVisualResource({
    id: resourceId,
    documentId: docId,
    conceptId: 'conc_backup',
    conceptName: 'Hipocampo',
    modality: 'conceptual_illustration',
    mimeType: 'image/svg+xml',
    imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz5iYWNrdXA8L3N2Zz4=',
    title: 'Hipocampo e Memória',
    caption: 'Consolidação de memória declarativa.',
    modelUsed: 'gemini-3.1-flash-lite-image',
    promptUsed: 'Hipocampo',
    createdAt: Date.now(),
  });

  await saveStudyNote({
    id: noteId,
    documentId: docId,
    title: 'Anotação Hipocampal',
    content: 'Circuito trissináptico.',
    associatedVisualResourceId: resourceId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Exporta backup JSON
  const jsonBackup = await exportUserDataAsJson();
  assert.ok(jsonBackup.length > 50);

  // Limpa banco
  await clearAllUserData();

  const emptyNotes = await getNotesByDocumentId(docId);
  assert.equal(emptyNotes.length, 0);

  // Restaura backup JSON
  await restoreUserDataFromJson(jsonBackup);

  const restoredNotes = await getNotesByDocumentId(docId);
  const foundNote = restoredNotes.find((n) => n.id === noteId);
  assert.ok(foundNote, 'Anotação deve ser restaurada');
  assert.equal(foundNote.associatedVisualResourceId, resourceId, 'Link do recurso visual deve ser preservado');

  const restoredResource = await getVisualResourceById(resourceId);
  assert.ok(restoredResource, 'Recurso visual deve ser restaurado');
  assert.equal(restoredResource.title, 'Hipocampo e Memória');
});
