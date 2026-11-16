/**
 * NeuroClass AI — Serviço do Experimento Golden Dataset (Tier 2 - Missão P3.2.2.2)
 * @module services/ai/goldenDatasetExperimentService
 *
 * Responsável por:
 * 1. Carregar localmente no servidor o Golden Dataset (21 cenários canônicos) e seu gabarito independente.
 * 2. Proteger as evidências e o gabarito contra manipulação arbitrária pelo cliente.
 * 3. Garantir que o modelo receba exclusivamente o prompt de auditoria sem qualquer acesso ao gabarito.
 * 4. Executar cada cenário de forma independente, controlada e síncrona.
 * 5. Consumir a credencial BYOK enviada pela requisição HTTP do usuário (em memória volátil, zero persistência).
 * 6. Rastrear métricas de acurácia, latência, consumo de tokens e matriz de concordância.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSemanticAuditPrompt,
  getSemanticEvaluationSchema,
  validateAndSanitizeEvaluationResult,
  getSemanticEvaluationModel,
} from './semanticGroundingEvaluator';
import type { EvaluationTicket } from './semanticEvaluationTicketService';
import type { SemanticSupportLevel, SemanticRelationType, SemanticClaimAssessment } from '../../types/rag';

export interface DatasetCase {
  caseId: string;
  documentId: string;
  description: string;
  claim: {
    id: string;
    text: string;
    citationTags: string[];
  };
  evidences: Array<{
    citationTag: string;
    pageNumber: number;
    text: string;
  }>;
}

export interface GoldLabel {
  caseId: string;
  expectedStatus: SemanticSupportLevel;
  expectedRelationship: SemanticRelationType;
  goldRationale: string;
  criticalAspects: string;
}

export interface CaseExecutionResult {
  caseId: string;
  documentId: string;
  description: string;
  httpStatus: number;
  modelUsed: string;
  latencyMs: number;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  result: SemanticClaimAssessment | null;
  overallStatus: string;
  goldComparison?: {
    expectedStatus: SemanticSupportLevel;
    expectedRelationship: SemanticRelationType;
    goldRationale: string;
    criticalAspects: string;
    isStatusMatch: boolean;
    isRelationshipMatch: boolean;
  };
  error?: string;
}

let cachedCases: DatasetCase[] | null = null;
let cachedGoldLabels: Map<string, GoldLabel> | null = null;

function resolveDatasetPaths(): { datasetPath: string; goldPath: string } {
  const cwd = process.cwd();
  const candidatesDataset = [
    path.resolve(cwd, 'experiments/p3-2-2-2/dataset.json'),
    path.resolve(cwd, '../experiments/p3-2-2-2/dataset.json'),
  ];
  const candidatesGold = [
    path.resolve(cwd, 'experiments/p3-2-2-2/gold-labels.json'),
    path.resolve(cwd, '../experiments/p3-2-2-2/gold-labels.json'),
  ];

  let datasetPath = candidatesDataset.find((p) => fs.existsSync(p));
  let goldPath = candidatesGold.find((p) => fs.existsSync(p));

  if (!datasetPath || !goldPath) {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      if (!datasetPath) {
        const alt = path.resolve(currentDir, '../../../experiments/p3-2-2-2/dataset.json');
        if (fs.existsSync(alt)) datasetPath = alt;
      }
      if (!goldPath) {
        const altGold = path.resolve(currentDir, '../../../experiments/p3-2-2-2/gold-labels.json');
        if (fs.existsSync(altGold)) goldPath = altGold;
      }
    } catch {
      // Fallback para caminhos diretos
    }
  }

  if (!datasetPath) {
    datasetPath = path.resolve(cwd, 'experiments/p3-2-2-2/dataset.json');
  }
  if (!goldPath) {
    goldPath = path.resolve(cwd, 'experiments/p3-2-2-2/gold-labels.json');
  }

  return { datasetPath, goldPath };
}

export function loadGoldenDataset(): { cases: DatasetCase[]; version: string; description: string } {
  if (cachedCases) {
    return {
      cases: cachedCases,
      version: '1.0.0',
      description: 'Golden Dataset de 21 cenários canônicos de avaliação semântica de fundamentação (Tier 2).',
    };
  }

  const { datasetPath } = resolveDatasetPaths();
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Arquivo Golden Dataset não encontrado em: ${datasetPath}`);
  }

  const raw = fs.readFileSync(datasetPath, 'utf-8');
  const parsed = JSON.parse(raw);
  cachedCases = parsed.cases || [];
  return {
    cases: cachedCases!,
    version: parsed.version || '1.0.0',
    description: parsed.description || '',
  };
}

export function loadGoldLabelsMap(): Map<string, GoldLabel> {
  if (cachedGoldLabels) {
    return cachedGoldLabels;
  }

  const { goldPath } = resolveDatasetPaths();
  if (!fs.existsSync(goldPath)) {
    throw new Error(`Arquivo de gabarito independente não encontrado em: ${goldPath}`);
  }

  const raw = fs.readFileSync(goldPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const map = new Map<string, GoldLabel>();
  for (const label of parsed.labels || []) {
    map.set(label.caseId, label);
  }
  cachedGoldLabels = map;
  return map;
}

/**
 * Retorna os metadados dos 21 cenários para visualização na interface,
 * sem expor os gabaritos confidenciais ao frontend.
 */
export function getGoldenDatasetMetadata(): {
  totalCases: number;
  version: string;
  description: string;
  cases: Array<{
    caseId: string;
    documentId: string;
    description: string;
    claimText: string;
    citationTags: string[];
    evidenceCount: number;
  }>;
} {
  const { cases, version, description } = loadGoldenDataset();
  return {
    totalCases: cases.length,
    version,
    description,
    cases: cases.map((c) => ({
      caseId: c.caseId,
      documentId: c.documentId,
      description: c.description,
      claimText: c.claim.text,
      citationTags: c.claim.citationTags,
      evidenceCount: c.evidences.length,
    })),
  };
}

/**
 * Executa uma chamada experimental de avaliação semântica para um único cenário do Golden Dataset.
 *
 * GARANTIAS DE SEGURANÇA:
 * 1. O cliente Gemini é instanciado com a chave BYOK fornecida na requisição (req.headers['x-gemini-api-key']).
 * 2. O gabarito NUNCA é passado ao modelo.
 * 3. O texto e evidências são carregados estritamente do dataset oficial no servidor.
 * 4. A chave de API NUNCA é gravada em logs ou arquivos.
 */
export async function executeSingleGoldenDatasetCase(params: {
  caseId: string;
  clientApiKey?: string;
  reqOrigin?: string;
  getAIClientFn: (apiKey?: string, env?: NodeJS.ProcessEnv, origin?: string) => any;
  env?: NodeJS.ProcessEnv;
}): Promise<CaseExecutionResult> {
  const { cases } = loadGoldenDataset();
  const goldLabels = loadGoldLabelsMap();

  const c = cases.find((item) => item.caseId === params.caseId);
  if (!c) {
    const error = new Error(`Cenário "${params.caseId}" não encontrado no Golden Dataset.`);
    (error as any).status = 404;
    throw error;
  }

  // Constrói o evidenceMap oficial a partir das evidências registradas no dataset
  const evidenceMap = new Map();
  for (const ev of c.evidences) {
    evidenceMap.set(ev.citationTag, {
      citationTag: ev.citationTag,
      chunkId: `chunk_${c.caseId}_${ev.citationTag}`,
      documentId: c.documentId,
      pageNumber: ev.pageNumber,
      sectionTitle: 'Seção de Referência Documental',
      excerpt: ev.text,
    });
  }

  // Cria ticket controlado em memória para o cenário
  const ticket: EvaluationTicket = {
    handle: `exp_${c.caseId}_${Date.now()}`,
    documentId: c.documentId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    useCount: 0,
    maxUses: 1,
    eligibleSegments: [
      {
        id: c.claim.id,
        index: 0,
        text: c.claim.text,
        citationTags: c.claim.citationTags,
        evidenceChunkIds: [],
      },
    ],
    evidenceMap,
  };

  const env = params.env || process.env;
  const targetModel = getSemanticEvaluationModel(env);
  const client = params.getAIClientFn(params.clientApiKey, env, params.reqOrigin);
  const { systemInstruction, userPrompt } = buildSemanticAuditPrompt(ticket);
  const schema = getSemanticEvaluationSchema();

  const startTime = performance.now();
  let responseText: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  try {
    const response = await client.models.generateContent({
      model: targetModel,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const usage = response.usageMetadata;
    if (usage) {
      inputTokens = usage.promptTokenCount || 0;
      outputTokens = usage.candidatesTokenCount || 0;
      totalTokens = usage.totalTokenCount || inputTokens + outputTokens;
    }

    responseText = response.text;
  } catch (err: any) {
    const status = err?.status || err?.code || 500;
    const errorMsg = err?.message || 'Falha na chamada ao modelo Gemini.';
    const error = new Error(`Falha no cenário ${c.caseId} com modelo "${targetModel}": ${errorMsg}`);
    (error as any).status = status;
    (error as any).code = err?.code || 'MODEL_ERROR';
    throw error;
  }

  const latencyMs = Math.round(performance.now() - startTime);

  let parsed: any = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  const { sanitizedResults, overallStatus } = validateAndSanitizeEvaluationResult(parsed, ticket);
  const primaryResult = sanitizedResults[0] || null;

  // Comparação independente pós-avaliação com o gabarito
  const gold = goldLabels.get(c.caseId);
  let goldComparison: CaseExecutionResult['goldComparison'] | undefined;

  if (gold) {
    const isStatusMatch = Boolean(primaryResult && primaryResult.status === gold.expectedStatus);
    const isRelationshipMatch = Boolean(primaryResult && primaryResult.relationship === gold.expectedRelationship);
    goldComparison = {
      expectedStatus: gold.expectedStatus,
      expectedRelationship: gold.expectedRelationship,
      goldRationale: gold.goldRationale,
      criticalAspects: gold.criticalAspects,
      isStatusMatch,
      isRelationshipMatch,
    };
  }

  return {
    caseId: c.caseId,
    documentId: c.documentId,
    description: c.description,
    httpStatus: 200,
    modelUsed: targetModel,
    latencyMs,
    tokens: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
    result: primaryResult,
    overallStatus,
    goldComparison,
  };
}

/**
 * Salva os resultados consolidados do experimento localmente no diretório experiments/p3-2-2-2/
 * SEM persistir chaves, credenciais ou dados sensíveis.
 */
export function persistExperimentArtifacts(results: CaseExecutionResult[]): {
  success: boolean;
  savedPath: string;
  totalRecorded: number;
} {
  const { datasetPath } = resolveDatasetPaths();
  const expDir = path.dirname(datasetPath);

  // 1. raw-results.json
  const rawPath = path.join(expDir, 'raw-results.json');
  fs.writeFileSync(rawPath, JSON.stringify(results, null, 2), 'utf-8');

  // 2. case-results.csv
  const csvPath = path.join(expDir, 'case-results.csv');
  const csvHeaders = 'caseId,httpStatus,modelUsed,latencyMs,inputTokens,outputTokens,predictedStatus,expectedStatus,statusMatch,predictedRelation,expectedRelation,relationMatch\n';
  const csvRows = results
    .map((r) => {
      const predStat = r.result?.status || 'N/A';
      const expStat = r.goldComparison?.expectedStatus || 'N/A';
      const statMatch = r.goldComparison?.isStatusMatch ? 'MATCH' : 'MISMATCH';
      const predRel = r.result?.relationship || 'N/A';
      const expRel = r.goldComparison?.expectedRelationship || 'N/A';
      const relMatch = r.goldComparison?.isRelationshipMatch ? 'MATCH' : 'MISMATCH';
      return `${r.caseId},${r.httpStatus},${r.modelUsed},${r.latencyMs},${r.tokens.inputTokens},${r.tokens.outputTokens},${predStat},${expStat},${statMatch},${predRel},${expRel},${relMatch}`;
    })
    .join('\n');
  fs.writeFileSync(csvPath, csvHeaders + csvRows, 'utf-8');

  // 3. metrics.json
  const validResults = results.filter((r) => r.httpStatus === 200 && r.goldComparison);
  const totalCases = validResults.length;
  const statusMatches = validResults.filter((r) => r.goldComparison?.isStatusMatch).length;
  const relationMatches = validResults.filter((r) => r.goldComparison?.isRelationshipMatch).length;
  const accuracy = totalCases > 0 ? Number(((statusMatches / totalCases) * 100).toFixed(2)) : 0;
  const relationAccuracy = totalCases > 0 ? Number(((relationMatches / totalCases) * 100).toFixed(2)) : 0;
  const totalLatencyMs = validResults.reduce((acc, r) => acc + r.latencyMs, 0);
  const totalTokens = validResults.reduce((acc, r) => acc + r.tokens.totalTokens, 0);

  const metrics = {
    executedAt: new Date().toISOString(),
    totalCases,
    statusMatches,
    accuracyPercent: accuracy,
    relationMatches,
    relationAccuracyPercent: relationAccuracy,
    avgLatencyMs: totalCases > 0 ? Math.round(totalLatencyMs / totalCases) : 0,
    totalTokens,
  };

  const metricsPath = path.join(expDir, 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');

  return {
    success: true,
    savedPath: expDir,
    totalRecorded: results.length,
  };
}
