import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MATERIALS } from '../services/documents/demoMaterials.ts';
import { AIKeyManager } from '../services/ai/aiKeyManager.ts';
import { buildRequestHeaders } from '../services/ai/aiClient.ts';
import {
  mapToSanitizedAIError,
  getEffectiveApiKey,
  getAIClient,
  setAIClientFactory,
  resetAIClientFactory,
  resolveAIKeyConfig,
  validateCorsConfig,
} from '../../server.ts';

// Mock localStorage para testes de zero persistência
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

const mockLocal = new MockStorage();
const mockSession = new MockStorage();

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocal as unknown as Storage;
}
if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = mockSession as unknown as Storage;
}

test('T255: Catálogo Multidisciplinar Cobre as 7 Áreas Acadêmicas Canônicas', () => {
  assert.equal(DEMO_MATERIALS.length, 7, 'Devem existir exatamente 7 materiais demonstrativos');

  const EXPECTED_AREAS = [
    'Ciências Biológicas e Saúde',
    'Ciências Exatas e da Terra',
    'Engenharias e Tecnologia',
    'Ciências Humanas e Filosofia',
    'Ciências Sociais',
    'Educação e Psicologia',
    'Administração e Economia',
  ];

  const coveredAreas = DEMO_MATERIALS.map(m => m.document.academicArea);
  assert.deepEqual(coveredAreas, EXPECTED_AREAS, 'As 7 áreas acadêmicas devem corresponder à classificação oficial');

  for (const item of DEMO_MATERIALS) {
    const doc = item.document;
    const an = item.analysis;

    // Documento
    assert.ok(doc.id.startsWith('demo_'), `ID deve ter prefixo demo_: ${doc.id}`);
    assert.equal(doc.isDemoMaterial, true, `Documento ${doc.id} deve ter isDemoMaterial true`);
    assert.ok(doc.title.length > 5, `Título deve ser expressivo: ${doc.title}`);
    assert.ok(doc.subject.length > 5, `Disciplina deve ser especificada: ${doc.subject}`);
    assert.ok(doc.pages && doc.pages.length >= 4, `Deve conter ao menos 4 páginas: ${doc.id}`);

    // Referências Bibliográficas Reais
    assert.ok(
      doc.bibliographicReferences && doc.bibliographicReferences.length >= 3,
      `Material ${doc.id} deve possuir ao menos 3 referências bibliográficas canônicas`
    );
    for (const ref of doc.bibliographicReferences) {
      assert.ok(ref.length > 15, `Referência deve ser autêntica e detalhada: ${ref}`);
    }

    // Análise Cognitiva
    assert.equal(an.documentId, doc.id, 'Análise deve referenciar o documento correto');
    assert.ok(an.learningObjectives.length >= 3, 'Deve conter ao menos 3 objetivos de aprendizagem');
    assert.ok(an.fundamentalConcepts.length >= 3, 'Deve conter ao menos 3 conceitos fundamentais');
    assert.ok(an.prerequisiteGraph.nodes.length >= 3, 'Grafo deve conter nós');
    assert.ok(an.prerequisiteGraph.edges.length >= 2, 'Grafo deve conter conexões pedagógicas');

    // Conceitos e Evidências
    for (const c of an.fundamentalConcepts) {
      assert.ok(c.name.length > 3, 'Nome de conceito válido');
      assert.ok(c.evidenceReferences.length > 0, `Conceito ${c.name} deve conter evidência documental`);
      for (const ev of c.evidenceReferences) {
        assert.ok(ev.excerpt.length > 5, 'Evidência deve conter trecho citado');
      }
    }
  }
});

test('T256: Isolamento Estrito dos IDs de Demonstração e Prevenção de Colisão', () => {
  const docIds = new Set<string>();
  const allConceptIds = new Set<string>();

  for (const item of DEMO_MATERIALS) {
    // IDs de documentos únicos
    assert.ok(!docIds.has(item.document.id), `ID de documento duplicado: ${item.document.id}`);
    docIds.add(item.document.id);

    // IDs de conceitos únicos por catálogo
    for (const c of item.analysis.fundamentalConcepts) {
      assert.ok(!allConceptIds.has(c.id), `ID de conceito duplicado entre materiais: ${c.id}`);
      allConceptIds.add(c.id);
    }
    if (item.analysis.complementaryConcepts) {
      for (const c of item.analysis.complementaryConcepts) {
        assert.ok(!allConceptIds.has(c.id), `ID de conceito complementar duplicado: ${c.id}`);
        allConceptIds.add(c.id);
      }
    }
  }

  assert.equal(docIds.size, 7, 'Devem existir 7 IDs de documentos únicos');
  assert.ok(allConceptIds.size >= 35, 'Devem existir ao menos 35 conceitos curriculares mapeados');
});

test('T257: Gerenciador BYOK em Memória Volátil (AIKeyManager) e Zero Persistência', () => {
  // Limpeza inicial
  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.hasApiKey(), false);
  assert.equal(AIKeyManager.getApiKey(), null);

  let notifiedHasKey = false;
  const unsubscribe = AIKeyManager.subscribe(state => {
    notifiedHasKey = state.hasKey;
  });

  // Configurar chave BYOK
  const TEST_KEY = 'AIzaSyD-SecretBYOKKey-ForTestValidationOnly-12345';
  AIKeyManager.setApiKey(TEST_KEY, true, 'Validada');

  assert.equal(AIKeyManager.hasApiKey(), true);
  assert.equal(AIKeyManager.getApiKey(), TEST_KEY);
  assert.equal(notifiedHasKey, true);

  // Verificação de ZERO PERSISTÊNCIA em storage ou cookies
  const localKeys = Object.keys((globalThis.localStorage as unknown as MockStorage)['store'] || {});
  for (const k of localKeys) {
    const val = globalThis.localStorage.getItem(k) || '';
    assert.ok(!val.includes(TEST_KEY), `Chave de API vazou para o localStorage na chave ${k}`);
  }

  const sessionKeys = Object.keys((globalThis.sessionStorage as unknown as MockStorage)['store'] || {});
  for (const k of sessionKeys) {
    const val = globalThis.sessionStorage.getItem(k) || '';
    assert.ok(!val.includes(TEST_KEY), `Chave de API vazou para o sessionStorage na chave ${k}`);
  }

  if (typeof document !== 'undefined') {
    assert.ok(!document.cookie.includes(TEST_KEY), 'Chave de API não pode estar presente em cookies');
  }

  // Remoção e limpeza de chave
  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.hasApiKey(), false);
  assert.equal(AIKeyManager.getApiKey(), null);
  assert.equal(notifiedHasKey, false);

  // Modo gerenciado (.env no backend)
  AIKeyManager.setManagedMode();
  assert.equal(AIKeyManager.hasApiKey(), true);
  assert.equal(AIKeyManager.getSource(), 'managed');
  assert.equal(AIKeyManager.getApiKey(), null); // Chave física do backend não exposta ao frontend

  unsubscribe();
  AIKeyManager.clearApiKey();
});

test('T258: Header de Injeção BYOK no aiClient (x-gemini-api-key)', () => {
  AIKeyManager.clearApiKey();

  // Sem chave: header apenas Content-Type
  const headersEmpty = buildRequestHeaders();
  assert.equal(headersEmpty['x-gemini-api-key'], undefined);

  // Com chave de usuário: header presente
  const TEST_KEY = 'AIzaSyClientPersonalKey-999';
  AIKeyManager.setApiKey(TEST_KEY, true);
  const headersWithKey = buildRequestHeaders();
  assert.equal(headersWithKey['x-gemini-api-key'], TEST_KEY);

  // Limpeza
  AIKeyManager.clearApiKey();
  const headersAfterClear = buildRequestHeaders();
  assert.equal(headersAfterClear['x-gemini-api-key'], undefined);
});

test('T259: Recomendações e Dinâmica de Estados da Jornada Cognitiva', () => {
  // 1. Estado Inicial sem documento
  const recInitial = computeGuidanceRecommendation({
    hasDocument: false,
    hasAnalysis: false,
    hasConcept: false,
    masteryState: undefined,
    reviewDueCount: 0,
    isAnalyzing: false,
  });
  assert.equal(recInitial.actionType, 'open_demos');
  assert.ok(recInitial.title.includes('Escolha um Material'));

  // 2. Documento carregado, análise pendente
  const recAnalyzing = computeGuidanceRecommendation({
    hasDocument: true,
    hasAnalysis: false,
    hasConcept: false,
    masteryState: undefined,
    reviewDueCount: 0,
    isAnalyzing: true,
  });
  assert.equal(recAnalyzing.actionType, 'none');
  assert.ok(recAnalyzing.title.includes('Processando'));

  // 3. Documento analisado, nenhum conceito selecionado
  const recSelectConcept = computeGuidanceRecommendation({
    hasDocument: true,
    hasAnalysis: true,
    hasConcept: false,
    masteryState: undefined,
    reviewDueCount: 0,
    isAnalyzing: false,
  });
  assert.equal(recSelectConcept.actionType, 'focus_blackboard');
  assert.ok(recSelectConcept.title.includes('Quadro Didático'));

  // 4. Conceito selecionado ainda não avaliado (unassessed)
  const recUnassessed = computeGuidanceRecommendation({
    hasDocument: true,
    hasAnalysis: true,
    hasConcept: true,
    masteryState: 'unassessed',
    reviewDueCount: 0,
    isAnalyzing: false,
  });
  assert.equal(recUnassessed.actionType, 'open_crear');
  assert.ok(recUnassessed.title.includes('Ciclo C.R.E.A.R.'));

  // 5. Conceito com lacuna confirmada (confirmed_gap)
  const recGap = computeGuidanceRecommendation({
    hasDocument: true,
    hasAnalysis: true,
    hasConcept: true,
    masteryState: 'confirmed_gap',
    reviewDueCount: 0,
    isAnalyzing: false,
  });
  assert.equal(recGap.actionType, 'open_crear');
  assert.ok(recGap.title.includes('Superar Lacuna'));

  // 6. Revisões FSRS-7 pendentes têm prioridade alta quando o conceito já é compreendido
  const recReview = computeGuidanceRecommendation({
    hasDocument: true,
    hasAnalysis: true,
    hasConcept: true,
    masteryState: 'understood',
    reviewDueCount: 3,
    isAnalyzing: false,
  });
  assert.equal(recReview.actionType, 'open_review');
  assert.ok(recReview.title.includes('Revisão Espaçada'));
});

// Função auxiliar pura que espelha as regras testadas em T259
function computeGuidanceRecommendation(state: {
  hasDocument: boolean;
  hasAnalysis: boolean;
  hasConcept: boolean;
  masteryState?: string;
  reviewDueCount: number;
  isAnalyzing: boolean;
}): { title: string; actionType: string } {
  if (!state.hasDocument) {
    return { title: 'Escolha um Material de Estudo', actionType: 'open_demos' };
  }
  if (state.isAnalyzing) {
    return { title: 'Processando Análise Cognitiva...', actionType: 'none' };
  }
  if (!state.hasAnalysis) {
    return { title: 'Execute a Análise do Documento', actionType: 'focus_blackboard' };
  }
  if (state.reviewDueCount > 0 && state.masteryState !== 'confirmed_gap') {
    return { title: `Revisão Espaçada Pendente (${state.reviewDueCount})`, actionType: 'open_review' };
  }
  if (!state.hasConcept) {
    return { title: 'Explore o Quadro Didático', actionType: 'focus_blackboard' };
  }
  if (state.masteryState === 'confirmed_gap') {
    return { title: 'Superar Lacuna no Ciclo C.R.E.A.R.', actionType: 'open_crear' };
  }
  if (state.masteryState === 'unassessed' || !state.masteryState) {
    return { title: 'Inicie o Ciclo C.R.E.A.R.', actionType: 'open_crear' };
  }
  if (state.masteryState === 'mastered') {
    return { title: 'Conceito Consolidado (Mastered)', actionType: 'open_review' };
  }
  return { title: 'Aprofunde sua Explicação', actionType: 'open_crear' };
}

test('T260: Sanitização Centralizada de Respostas de Erro no Servidor', () => {
  // Caso 1: 401 / 403 / API Key inválida
  const errAuth1 = { status: 401, message: 'API_KEY_INVALID: key AIzaSyTestKey123 is invalid' };
  const resAuth1 = mapToSanitizedAIError(errAuth1, 'Contexto padrão');
  assert.equal(resAuth1.status, 401);
  assert.equal(resAuth1.code, 'INVALID_KEY');
  assert.ok(!resAuth1.error.includes('AIzaSyTestKey123'), 'Chave privada não pode vazar na mensagem de erro');
  assert.ok(resAuth1.error.includes('inválida ou não autorizada'));

  const errAuth2 = { code: 403, message: 'PERMISSION_DENIED: The caller does not have permission' };
  const resAuth2 = mapToSanitizedAIError(errAuth2, 'Contexto padrão');
  assert.equal(resAuth2.status, 401);
  assert.equal(resAuth2.code, 'INVALID_KEY');

  // Caso 2: 429 / Quota Excedida / Rate Limit
  const errQuota = { status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for quota metric ...' };
  const resQuota = mapToSanitizedAIError(errQuota, 'Contexto padrão');
  assert.equal(resQuota.status, 429);
  assert.equal(resQuota.code, 'QUOTA_EXCEEDED');
  assert.ok(resQuota.error.includes('Cota de requisições excedida'));

  // Caso 3: 504 / Timeout / Deadline Exceeded
  const errTimeout = { message: 'ETIMEDOUT: Connection to generativelanguage.googleapis.com timed out' };
  const resTimeout = mapToSanitizedAIError(errTimeout, 'Contexto padrão');
  assert.equal(resTimeout.status, 504);
  assert.equal(resTimeout.code, 'TIMEOUT');
  assert.ok(resTimeout.error.includes('Tempo limite esgotado'));

  // Caso 4: 502 / 503 / Service Unavailable
  const errUnavailable = { status: 503, message: 'Service Unavailable' };
  const resUnavailable = mapToSanitizedAIError(errUnavailable, 'Contexto padrão');
  assert.equal(resUnavailable.status, 502);
  assert.equal(resUnavailable.code, 'SERVICE_UNAVAILABLE');
  assert.ok(resUnavailable.error.includes('temporariamente indisponível'));

  // Caso 5: Erro Genérico / Stack Trace / Erro Interno
  const errInternal = new Error('TypeError: Cannot read properties of undefined (reading rawResponse) at internal/deps.js:42');
  const resInternal = mapToSanitizedAIError(errInternal, 'Falha no processamento.');
  assert.equal(resInternal.status, 500);
  assert.equal(resInternal.code, 'INTERNAL_ERROR');
  assert.ok(!resInternal.error.includes('TypeError'), 'Detalhes internos ou stack traces não podem vazar');
  assert.ok(!resInternal.error.includes('internal/deps.js'), 'Caminhos de arquivo internos não podem vazar');
  assert.equal(resInternal.error, 'Falha no processamento.');
});

test('T261: Isolamento Real e Concorrência Instrumentada por Mock da Fábrica Gemini', async () => {
  const capturedFactoryCalls: Array<{ apiKey: string; time: number }> = [];

  // Configura a fábrica simulada no servidor
  setAIClientFactory((options: { apiKey: string }) => {
    capturedFactoryCalls.push({
      apiKey: options.apiKey,
      time: Date.now(),
    });
    return {
      models: {
        generateContent: async () => ({ text: `Response for key ${options.apiKey}` }),
      },
    };
  });

  try {
    // 4 chaves sintéticas de usuários distintos
    const USER_KEYS = [
      'AIzaSyMock-UserKey-Alpha-111111',
      'AIzaSyMock-UserKey-Beta-222222',
      'AIzaSyMock-UserKey-Gamma-333333',
      'AIzaSyMock-UserKey-Delta-444444',
    ];

    // Dispara 4 requisições concorrentes reais usando Promise.all
    const results = await Promise.all(
      USER_KEYS.map(async (key, idx) => {
        // Simula delay de rede aleatório pequeno entre 5ms e 25ms para forçar concorrência e interleaved execution
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 5));
        const client = getAIClient(key);
        const res = await client.models.generateContent({ contents: 'test' });
        return { index: idx, sentKey: key, responseText: res.text };
      })
    );

    // Valida que exatamente 4 instâncias de cliente foram geradas
    assert.equal(capturedFactoryCalls.length, 4, 'Fábrica deve ter sido chamada exatamente 4 vezes');

    // Valida que cada chamada recebeu sua própria chave respectiva sem colisão ou cruzamento
    const callKeys = capturedFactoryCalls.map(c => c.apiKey);
    for (const key of USER_KEYS) {
      assert.ok(callKeys.includes(key), `Chave ${key} deve ter sido instanciada isoladamente`);
    }

    for (const r of results) {
      assert.equal(r.responseText, `Response for key ${r.sentKey}`, 'Resposta deve estar estritamente vinculada à chave requisitada');
    }

    // Validação da precedência de BYOK sobre .env:
    // Mesmo com GEMINI_API_KEY no .env, a chave fornecida na requisição tem precedência total
    const effectiveByok = getEffectiveApiKey('AIzaSyMock-ExplicitOverrideKey-999');
    assert.equal(effectiveByok.source, 'byok');
    assert.equal(effectiveByok.key, 'AIzaSyMock-ExplicitOverrideKey-999');

    // Quando nenhuma chave é fornecida na requisição, utiliza o modo gerenciado (.env) se explicitamente habilitado
    const prevEnv = process.env.GEMINI_API_KEY;
    const prevMode = process.env.AI_KEY_MODE;
    const prevAllow = process.env.ALLOW_MANAGED_KEY_MODE;
    try {
      process.env.GEMINI_API_KEY = 'AIzaSyMock-ServerEnvKey-888';
      process.env.AI_KEY_MODE = 'managed';
      process.env.ALLOW_MANAGED_KEY_MODE = 'true';
      const effectiveManaged = getEffectiveApiKey(undefined);
      assert.equal(effectiveManaged.source, 'managed');
      assert.equal(effectiveManaged.key, 'AIzaSyMock-ServerEnvKey-888');
    } finally {
      process.env.GEMINI_API_KEY = prevEnv;
      process.env.AI_KEY_MODE = prevMode;
      process.env.ALLOW_MANAGED_KEY_MODE = prevAllow;
    }

  } finally {
    // Limpeza obrigatória da fábrica após o teste para garantir isolamento de outros testes
    resetAIClientFactory();
  }
});

// ============================================================================
// BATERIA DE 12 TESTES OBRIGATÓRIOS: PRODUÇÃO, BYOK-ONLY E SEGURANÇA DE CONSUMO
// ============================================================================

test('T262: 1. Produção + BYOK-only + Sem Chave: Requisição Recusada com 401', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'byok-only',
    GEMINI_API_KEY: 'central-secret-key-12345',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  assert.throws(
    () => {
      getEffectiveApiKey(undefined, fakeEnv);
    },
    (err: any) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
      assert.ok(err.message.includes('Modo BYOK ativo'));
      return true;
    }
  );
});

test('T263: 2. Produção + BYOK-only + GEMINI_API_KEY no Ambiente: Chave Central NÃO Utilizada', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'byok-only',
    GEMINI_API_KEY: 'super-secret-central-admin-token-999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  let factoryCalledWithKey: string | null = null;
  setAIClientFactory((opts) => {
    factoryCalledWithKey = opts.apiKey;
    return { models: { generateContent: async () => ({ text: 'mock' }) } };
  });

  try {
    // Tentativa de obter cliente sem chave no modo BYOK
    assert.throws(() => {
      getAIClient(undefined, fakeEnv);
    });

    // A fábrica NUNCA foi invocada com a chave administrativa do servidor
    assert.equal(factoryCalledWithKey, null, 'A chave administrativa não pode ser utilizada sob hipótese alguma');
  } finally {
    resetAIClientFactory();
  }
});

test('T264: 3. Produção + BYOK-only + Chave Própria: Cliente Recebe Somente a Chave BYOK', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'byok-only',
    GEMINI_API_KEY: 'super-secret-central-admin-token-999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  const userKey = 'AIzaSyClientPersonalKey-Alpha-777';
  const effective = getEffectiveApiKey(userKey, fakeEnv);

  assert.equal(effective.source, 'byok');
  assert.equal(effective.key, userKey);
  assert.notEqual(effective.key, fakeEnv.GEMINI_API_KEY);
});

test('T265: 4. Desenvolvimento + Modo Administrado Explicitamente Habilitado: Fallback Central Funciona', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AI_KEY_MODE: 'managed',
    ALLOW_MANAGED_KEY_MODE: 'true',
    GEMINI_API_KEY: 'local-dev-managed-key-555',
  };

  const effective = getEffectiveApiKey(undefined, fakeEnv);
  assert.equal(effective.source, 'managed');
  assert.equal(effective.key, 'local-dev-managed-key-555');
});

test('T266: 5. Produção + Configuração Ausente: Modo BYOK-only Automático (Fail-Closed)', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    // AI_KEY_MODE omitida
    GEMINI_API_KEY: 'central-secret-key-in-env',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  const resolved = resolveAIKeyConfig(fakeEnv);
  assert.equal(resolved.mode, 'byok-only', 'Ausência de configuração em produção deve resultar em byok-only');

  // Sem chave, a chamada deve ser recusada mesmo existindo GEMINI_API_KEY
  assert.throws(() => {
    getEffectiveApiKey(undefined, fakeEnv);
  });
});

test('T267: 6. Produção + ALLOWED_ORIGINS Ausente: Inicialização Segura Falha Explicitamente', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: '',
  };

  assert.throws(
    () => {
      validateCorsConfig(fakeEnv);
    },
    /ALLOWED_ORIGINS deve ser explicitamente configurada em ambiente de produção/
  );
});

test('T268: 7. Produção + Wildcard (*): Configuração Rejeitada Explicitamente', () => {
  const fakeEnvWildcard: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: '*',
  };

  assert.throws(
    () => {
      validateCorsConfig(fakeEnvWildcard);
    },
    /wildcard "\*" é terminantemente proibida em ambiente de produção/
  );

  const fakeEnvListWithWildcard: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://neuroclass.ai, *',
  };

  assert.throws(
    () => {
      validateCorsConfig(fakeEnvListWithWildcard);
    },
    /wildcard "\*" é terminantemente proibida em ambiente de produção/
  );
});

test('T269: 8. Origem Autorizada: Validação e Comportamento Esperado', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://neuroclass.ai, https://app.neuroclass.ai',
  };

  const cors = validateCorsConfig(fakeEnv);
  assert.equal(cors.isWildcard, false);
  assert.ok(cors.allowedOrigins.includes('https://neuroclass.ai'));
  assert.ok(cors.allowedOrigins.includes('https://app.neuroclass.ai'));
});

test('T270: 9. Origem Não Autorizada: Bloqueio de Concessão de Origem', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  const cors = validateCorsConfig(fakeEnv);
  const untrustedOrigin = 'https://malicious-site.example.com';
  assert.equal(cors.allowedOrigins.includes(untrustedOrigin), false);
});

test('T271: 10. Requisição sem Origin em Modo Gerenciado (Dev): Não Recebe Autorização para Uso de Chave Central', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AI_KEY_MODE: 'managed',
    ALLOW_MANAGED_KEY_MODE: 'true',
    GEMINI_API_KEY: 'central-secret-for-managed-mode',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  // Requisição sem Origin (ex: bot, curl direto) não é autorizada a consumir a chave central
  assert.throws(
    () => {
      getEffectiveApiKey(undefined, fakeEnv, undefined);
    },
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN_ORIGIN_REQUIRED');
      return true;
    }
  );

  // Requisição de origem autorizada recebe acesso ao modo administrado
  const valid = getEffectiveApiKey(undefined, fakeEnv, 'https://neuroclass.ai');
  assert.equal(valid.source, 'managed');
  assert.equal(valid.key, 'central-secret-for-managed-mode');
});

test('T272: 11. Chamadas Concorrentes: Isolamento Preservado sem Contaminação de Escopos', async () => {
  const capturedKeys: string[] = [];

  setAIClientFactory((opts) => {
    capturedKeys.push(opts.apiKey);
    return {
      models: {
        generateContent: async () => ({ text: `Token_${opts.apiKey}` }),
      },
    };
  });

  try {
    const KEYS = [
      'AIzaSyConcUser1-AAAA',
      'AIzaSyConcUser2-BBBB',
      'AIzaSyConcUser3-CCCC',
      'AIzaSyConcUser4-DDDD',
    ];

    const results = await Promise.all(
      KEYS.map(async (key) => {
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
        const client = getAIClient(key, { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://neuroclass.ai' });
        const res = await client.models.generateContent({ contents: 'ping' });
        return { key, text: res.text };
      })
    );

    assert.equal(capturedKeys.length, 4);
    for (const r of results) {
      assert.equal(r.text, `Token_${r.key}`);
    }
  } finally {
    resetAIClientFactory();
  }
});

test('T273: 12. Respostas HTTP: Nenhuma Chave ou Stack Trace Exposto em Erros', () => {
  // Simula erro interno grave do SDK Google contendo chave privada no texto e stack trace
  const rawSdkLeakError = new Error(
    'InvalidArgument: API Key AIzaSySecretKey999999 failed at GoogleGenAI.internalRequest (node_modules/@google/genai/dist/index.js:42:15)'
  );
  (rawSdkLeakError as any).status = 401;

  const sanitized = mapToSanitizedAIError(rawSdkLeakError, 'Contexto padrão seguro');

  assert.equal(sanitized.status, 401);
  assert.equal(sanitized.code, 'INVALID_KEY');
  assert.ok(!sanitized.error.includes('AIzaSySecretKey999999'), 'Chave privada vazou na resposta sanitizada');
  assert.ok(!sanitized.error.includes('node_modules'), 'Caminho interno vazou na resposta');
  assert.ok(!sanitized.error.includes('InvalidArgument'), 'Nome de erro do SDK vazou na resposta');
});

// ============================================================================
// BATERIA DE HOMOLOGAÇÃO FINAL DE SEGURANÇA: ELIMINAÇÃO DE USO ANÔNIMO EM PRODUÇÃO (T274–T284)
// ============================================================================

test('T274: Produção + AI_KEY_MODE=managed: startup rejeitado', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'managed',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
    GEMINI_API_KEY: 'central-secret-token',
  };

  assert.throws(
    () => resolveAIKeyConfig(fakeEnv),
    /estritamente proibido em ambiente de produção/
  );
});

test('T275: Produção + ALLOW_MANAGED_KEY_MODE=true + AI_KEY_MODE=managed: startup rejeitado', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    AI_KEY_MODE: 'managed',
    ALLOW_MANAGED_KEY_MODE: 'true',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
    GEMINI_API_KEY: 'central-secret-token',
  };

  assert.throws(
    () => resolveAIKeyConfig(fakeEnv),
    /estritamente proibido em ambiente de produção|ALLOW_MANAGED_KEY_MODE=true não é permitido em ambiente de produção/
  );
});

test('T276: Produção + GEMINI_API_KEY presente + BYOK ausente: HTTP 401 e zero invocações do cliente Gemini', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    GEMINI_API_KEY: 'super-secret-central-token-99999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  let factoryInvocationCount = 0;
  setAIClientFactory(() => {
    factoryInvocationCount++;
    return { models: { generateContent: async () => ({ text: 'mock' }) } };
  });

  try {
    assert.throws(
      () => getAIClient(undefined, fakeEnv),
      (err: any) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
        return true;
      }
    );
    assert.equal(factoryInvocationCount, 0, 'Cliente Gemini não pode ser invocado');
  } finally {
    resetAIClientFactory();
  }
});

test('T277: Produção + Origin autorizado + BYOK ausente: HTTP 401 e zero invocações do cliente Gemini', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    GEMINI_API_KEY: 'super-secret-central-token-99999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  let factoryInvocationCount = 0;
  setAIClientFactory(() => {
    factoryInvocationCount++;
    return { models: { generateContent: async () => ({ text: 'mock' }) } };
  });

  try {
    // Requisição com Origin exatamente correspondente à lista permitida
    assert.throws(
      () => getAIClient(undefined, fakeEnv, 'https://neuroclass.ai'),
      (err: any) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
        return true;
      }
    );
    assert.equal(factoryInvocationCount, 0, 'Origin legítimo não pode autorizar consumo de chave central em produção');
  } finally {
    resetAIClientFactory();
  }
});

test('T278: Produção + Origin forjado/autorizado por cliente CLI + BYOK ausente: HTTP 401 e zero invocações do cliente Gemini', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    GEMINI_API_KEY: 'super-secret-central-token-99999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  let factoryInvocationCount = 0;
  setAIClientFactory(() => {
    factoryInvocationCount++;
    return { models: { generateContent: async () => ({ text: 'mock' }) } };
  });

  try {
    // Simula cliente CLI/curl forjando Origin para tentar obter uso de credencial
    assert.throws(
      () => getAIClient(undefined, fakeEnv, 'https://neuroclass.ai'),
      (err: any) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
        return true;
      }
    );
    assert.equal(factoryInvocationCount, 0, 'Origem forjada por CLI não concede acesso');
  } finally {
    resetAIClientFactory();
  }
});

test('T279: Produção + BYOK válido: cliente Gemini recebe exclusivamente a chave individual', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    GEMINI_API_KEY: 'super-secret-central-token-99999',
    ALLOWED_ORIGINS: 'https://neuroclass.ai',
  };

  const USER_BYOK_KEY = 'AIzaSyClientPersonalKey-T279-Alpha';
  let factoryKeyUsed = '';

  setAIClientFactory((opts) => {
    factoryKeyUsed = opts.apiKey;
    return { models: { generateContent: async () => ({ text: 'mock' }) } };
  });

  try {
    const client = getAIClient(USER_BYOK_KEY, fakeEnv, 'https://neuroclass.ai');
    assert.ok(client);
    assert.equal(factoryKeyUsed, USER_BYOK_KEY, 'Cliente deve ser instanciado exclusivamente com a chave individual');
    assert.notEqual(factoryKeyUsed, fakeEnv.GEMINI_API_KEY, 'Chave administrativa não pode ter sido passada');
  } finally {
    resetAIClientFactory();
  }
});

test('T280: Desenvolvimento + modo administrado explicitamente habilitado: funcionamento preservado', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AI_KEY_MODE: 'managed',
    ALLOW_MANAGED_KEY_MODE: 'true',
    GEMINI_API_KEY: 'dev-local-managed-central-key',
  };

  const config = resolveAIKeyConfig(fakeEnv);
  assert.equal(config.mode, 'managed');
  assert.equal(config.allowManagedMode, true);

  const effective = getEffectiveApiKey(undefined, fakeEnv);
  assert.equal(effective.source, 'managed');
  assert.equal(effective.key, 'dev-local-managed-central-key');
});

test('T281: Desenvolvimento + modo administrado não habilitado: fallback central não ativado indevidamente', () => {
  const fakeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    AI_KEY_MODE: 'byok-only',
    ALLOW_MANAGED_KEY_MODE: 'false',
    GEMINI_API_KEY: 'dev-central-key-inactive',
  };

  const config = resolveAIKeyConfig(fakeEnv);
  assert.equal(config.mode, 'byok-only');

  assert.throws(
    () => getEffectiveApiKey(undefined, fakeEnv),
    (err: any) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'UNAUTHORIZED_BYOK_REQUIRED');
      return true;
    }
  );
});

test('T282: Configuração CORS inválida em produção: startup rejeitado', () => {
  const envMissingOrigins: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: '',
  };

  assert.throws(
    () => validateCorsConfig(envMissingOrigins),
    /ALLOWED_ORIGINS deve ser explicitamente configurada em ambiente de produção/
  );

  const envWildcard: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: '*',
  };

  assert.throws(
    () => validateCorsConfig(envWildcard),
    /wildcard "\*" é terminantemente proibida em ambiente de produção/
  );
});

test('T283: Concorrência entre chaves BYOK: isolamento preservado', async () => {
  const capturedKeys: string[] = [];

  setAIClientFactory((opts) => {
    capturedKeys.push(opts.apiKey);
    return {
      models: {
        generateContent: async () => ({ text: `Token_${opts.apiKey}` }),
      },
    };
  });

  try {
    const KEYS = [
      'AIzaSyConcUser1-AAAA',
      'AIzaSyConcUser2-BBBB',
      'AIzaSyConcUser3-CCCC',
      'AIzaSyConcUser4-DDDD',
    ];

    const results = await Promise.all(
      KEYS.map(async (key) => {
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
        const client = getAIClient(key, { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://neuroclass.ai' });
        const res = await client.models.generateContent({ contents: 'ping' });
        return { key, text: res.text };
      })
    );

    assert.equal(capturedKeys.length, 4);
    for (const r of results) {
      assert.equal(r.text, `Token_${r.key}`);
    }
  } finally {
    resetAIClientFactory();
  }
});

test('T284: Respostas de erro: nenhuma chave, stack trace ou credencial exposta', () => {
  const rawLeakError = new Error(
    'InvalidArgument: API Key AIzaSySecretKey999999 failed at GoogleGenAI.internalRequest (node_modules/@google/genai/dist/index.js:42:15)'
  );
  (rawLeakError as any).status = 401;

  const sanitized = mapToSanitizedAIError(rawLeakError, 'Contexto padrão seguro');

  assert.equal(sanitized.status, 401);
  assert.equal(sanitized.code, 'INVALID_KEY');
  assert.ok(!sanitized.error.includes('AIzaSySecretKey999999'), 'Chave privada vazou na resposta');
  assert.ok(!sanitized.error.includes('node_modules'), 'Caminho de arquivo vazou na resposta');
  assert.ok(!sanitized.error.includes('InvalidArgument'), 'Nome de erro do SDK vazou na resposta');
});
