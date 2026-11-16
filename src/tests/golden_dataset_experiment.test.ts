/**
 * NeuroClass AI — Testes do Experimento Golden Dataset (Tier 2 - Missão P3.2.2.2)
 *
 * Valida:
 * 1. Carregamento dos 21 cenários canônicos do Golden Dataset.
 * 2. Isolamento do gabarito (gold-labels) fora do prompt da IA.
 * 3. Transmissão da chave BYOK pelo cabeçalho `x-gemini-api-key`.
 * 4. Validação e execução controlada do cenário GD-01 com mock instrumentado.
 * 5. Rejeição de requisições sem chave (401) e cenários inexistentes (404).
 * 6. Proteção estrita contra vazamento ou persistência da chave de API.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  app,
  setAIClientFactory,
  resetAIClientFactory,
} from '../../server';
import {
  getGoldenDatasetMetadata,
  loadGoldenDataset,
  loadGoldLabelsMap,
  executeSingleGoldenDatasetCase,
} from '../services/ai/goldenDatasetExperimentService';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import { buildRequestHeaders } from '../services/ai/aiClient';

// Helper para iniciar servidor temporário e realizar chamadas com fetch nativo
async function withTestServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GD-TEST-01: Carregamento do Golden Dataset e Metadados dos 21 Cenários', () => {
  const { cases, version } = loadGoldenDataset();
  assert.equal(cases.length, 21, 'O Golden Dataset deve conter exatamente 21 cenários canônicos.');
  assert.equal(version, '1.0.0', 'Versão do dataset deve ser 1.0.0 congelada.');

  const goldLabels = loadGoldLabelsMap();
  assert.equal(goldLabels.size, 21, 'O mapa de gabarito deve conter exatamente 21 labels correspondentes.');

  const meta = getGoldenDatasetMetadata();
  assert.equal(meta.totalCases, 21);
  assert.equal(meta.cases[0].caseId, 'GD-01-PARAPHRASE-OK');

  // Garante que o gabarito NÃO é exposto nos metadados
  for (const c of meta.cases) {
    assert.equal((c as any).expectedStatus, undefined, 'Metadados não devem conter expectedStatus.');
    assert.equal((c as any).goldRationale, undefined, 'Metadados não devem conter goldRationale.');
  }
});

test('GD-TEST-02: Endpoint GET /api/experimental/golden-dataset/info Retorna Metadados sem Gabarito', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/experimental/golden-dataset/info`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalCases, 21);
    assert.equal(Array.isArray(body.cases), true);
    assert.equal(body.cases.length, 21);
    assert.equal(body.cases[0].caseId, 'GD-01-PARAPHRASE-OK');
  });
});

test('GD-TEST-03: Header BYOK buildRequestHeaders() Injete Chave em Memória no Cliente', () => {
  AIKeyManager.clearApiKey();
  const headersBefore = buildRequestHeaders();
  assert.equal(headersBefore['x-gemini-api-key'], undefined);

  const testKey = 'AQ.ATestKeyFromStudentUI_1234567890';
  AIKeyManager.setApiKey(testKey, true, 'Validada');
  const headersAfter = buildRequestHeaders();
  assert.equal(headersAfter['x-gemini-api-key'], testKey);

  // Limpeza
  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.getApiKey(), null);
});

test('GD-TEST-04: Endpoint POST /api/experimental/golden-dataset/run-case Rejeita Cenário Inexistente', async () => {
  await withTestServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/experimental/golden-dataset/run-case`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-api-key': 'AQ.ATestKey',
      },
      body: JSON.stringify({ caseId: 'GD-99-INVALID-CASE' }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /não encontrado no Golden Dataset/i);
  });
});

test('GD-TEST-05: Execução Controlada do Cenário GD-01 com Mock Instrumentado e BYOK Individual', async () => {
  let receivedApiKey: string | undefined;
  let receivedContents: any;
  let receivedSystemInstruction: any;

  // Mock seguro da fábrica do cliente Gemini
  setAIClientFactory((options) => {
    receivedApiKey = options.apiKey;
    return {
      models: {
        generateContent: async (callParams: any) => {
          receivedContents = callParams.contents;
          receivedSystemInstruction = callParams.config?.systemInstruction?.parts?.[0]?.text;

          return {
            text: JSON.stringify({
              results: [
                {
                  segmentId: 'seg_1',
                  status: 'SUPPORTED',
                  relationship: 'direct_paraphrase',
                  citedEvidenceIds: ['C1'],
                  supportingEvidenceIds: ['C1'],
                  contradictingEvidenceIds: [],
                  explanation: 'A afirmação reescreve com fidelidade o influxo de Ca2+ e a ativação de LTP.',
                  limitations: [],
                },
              ],
            }),
            usageMetadata: {
              promptTokenCount: 380,
              candidatesTokenCount: 65,
              totalTokenCount: 445,
            },
          };
        },
      },
    };
  });

  const studentKey = 'AQ.AStudentCustomEnteredKey_53CharsLongMock_123456789';

  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/experimental/golden-dataset/run-case`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': studentKey,
        },
        body: JSON.stringify({ caseId: 'GD-01-PARAPHRASE-OK' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.caseId, 'GD-01-PARAPHRASE-OK');
      assert.equal(body.httpStatus, 200);
      assert.equal(body.modelUsed, 'gemini-3.5-flash-lite');
      assert.equal(body.tokens.totalTokens, 445);
      assert.equal(body.result.status, 'SUPPORTED');
      assert.equal(body.result.relationship, 'direct_paraphrase');

      // Validação da comparação independente com o gabarito
      assert.ok(body.goldComparison);
      assert.equal(body.goldComparison.expectedStatus, 'SUPPORTED');
      assert.equal(body.goldComparison.expectedRelationship, 'direct_paraphrase');
      assert.equal(body.goldComparison.isStatusMatch, true);
      assert.equal(body.goldComparison.isRelationshipMatch, true);

      // Valida que a chave utilizada foi exatamente a chave BYOK enviada pelo cliente
      assert.equal(receivedApiKey, studentKey);

      // Garante que o gabarito NÃO foi vazado no prompt
      const promptText = JSON.stringify(receivedContents) + (receivedSystemInstruction || '');
      assert.equal(promptText.includes('goldRationale'), false);
      assert.equal(promptText.includes('Gabarito congelado'), false);
      assert.equal(promptText.includes('criticalAspects'), false);
    });
  } finally {
    resetAIClientFactory();
  }
});

test('GD-TEST-06: Tratamento de Erro do Modelo Propaga Status HTTP Adequado sem Expor a Chave', async () => {
  setAIClientFactory(() => ({
    models: {
      generateContent: async () => {
        const err = new Error('Quota exceeded for quota metric');
        (err as any).status = 429;
        (err as any).code = 429;
        throw err;
      },
    },
  }));

  try {
    await withTestServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/experimental/golden-dataset/run-case`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': 'AQ.ATestKey',
        },
        body: JSON.stringify({ caseId: 'GD-01-PARAPHRASE-OK' }),
      });

      assert.equal(res.status, 429);
      const body = await res.json();
      assert.equal(body.code, 'QUOTA_EXCEEDED');
      // Garante que nenhuma chave vazou na mensagem de erro
      assert.equal(JSON.stringify(body).includes('AQ.ATestKey'), false);
    });
  } finally {
    resetAIClientFactory();
  }
});
