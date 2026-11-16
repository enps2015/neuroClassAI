/**
 * NeuroClass AI — Harness de Execução do Experimento Controlado P3.2.2.2
 *
 * Executa sequencialmente os 21 cenários canônicos do Golden Dataset com o modelo real
 * gemini-3.5-flash-lite via BYOK local, sem retries, sem misturar com gabarito durante o runtime,
 * e gera métricas completas, matriz de confusão e relatórios.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

import {
  buildSemanticAuditPrompt,
  getSemanticEvaluationSchema,
  validateAndSanitizeEvaluationResult,
  getSemanticEvaluationModel,
} from '../../src/services/ai/semanticGroundingEvaluator';
import type { EvaluationTicket } from '../../src/services/ai/semanticEvaluationTicketService';
import type { SemanticSupportLevel, SemanticRelationType } from '../../src/types/rag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente locais
if (fs.existsSync(path.resolve(__dirname, '../../.env'))) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
if (fs.existsSync(path.resolve(__dirname, '../../.env.local'))) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

interface DatasetCase {
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

interface GoldLabel {
  caseId: string;
  expectedStatus: SemanticSupportLevel;
  expectedRelationship: SemanticRelationType;
  goldRationale: string;
  criticalAspects: string;
}

interface RawResultItem {
  caseId: string;
  callIndex: number;
  model: string;
  httpStatus: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isValidJson: boolean;
  rawResponseText?: string;
  parsedResponse?: any;
  validation: {
    isValid: boolean;
    overallStatus: string;
    sanitizedResults: any[];
    missingSegmentIds: string[];
  };
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('================================================================');
  console.log('   NEUROCLASS AI — HARNESS EXPERIMENTAL P3.2.2.2 (GEMINI REAL)  ');
  console.log('================================================================\n');

  // 1. Preflight da credencial BYOK
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[ERRO CRÍTICO] Chave GEMINI_API_KEY não configurada no ambiente local.');
    process.exit(1);
  }
  console.log('✔ Credencial BYOK detectada em ambiente local (comprimento seguro:', apiKey.length, 'caracteres)');

  // 2. Modelo
  const targetModel = getSemanticEvaluationModel(process.env);
  console.log(`✔ Modelo de avaliação configurado: "${targetModel}"`);

  // 3. Carrega dataset.json (apenas dados de entrada)
  const datasetPath = path.join(__dirname, 'dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error(`[ERRO CRÍTICO] Arquivo dataset.json não encontrado em ${datasetPath}`);
    process.exit(1);
  }
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const cases: DatasetCase[] = dataset.cases;
  console.log(`✔ Dataset carregado: ${cases.length} cenários canônicos (Versão ${dataset.version})\n`);

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
      timeout: 30000,
    },
  });

  const rawResults: RawResultItem[] = [];
  const schema = getSemanticEvaluationSchema();

  console.log('Iniciando execução sequencial (máximo 21 chamadas à API Gemini)...\n');

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const callIndex = i + 1;
    process.stdout.write(`[${callIndex}/21] Executando ${c.caseId}... `);

    // Monta o ticket de avaliação para o cenário
    const evidenceMap = new Map();
    for (const ev of c.evidences) {
      evidenceMap.set(ev.citationTag, {
        citationTag: ev.citationTag,
        chunkId: `chunk_${c.caseId}_${ev.citationTag}`,
        documentId: c.documentId,
        pageNumber: ev.pageNumber,
        sectionTitle: 'Seção de Referência',
        excerpt: ev.text,
      });
    }

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

    const { systemInstruction, userPrompt } = buildSemanticAuditPrompt(ticket);

    const startTime = performance.now();
    let httpStatus = 200;
    let rawText: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let errorMsg: string | undefined;

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
        totalTokens = usage.totalTokenCount || (inputTokens + outputTokens);
      }

      rawText = response.text;
    } catch (err: any) {
      httpStatus = err?.status || err?.code || 500;
      errorMsg = err?.message || 'Falha desconhecida na API';
    }

    const latencyMs = Math.round(performance.now() - startTime);

    let parsed: any = null;
    let isValidJson = false;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
        isValidJson = true;
      } catch {
        isValidJson = false;
      }
    }

    const validation = validateAndSanitizeEvaluationResult(parsed, ticket);

    const itemResult: RawResultItem = {
      caseId: c.caseId,
      callIndex,
      model: targetModel,
      httpStatus,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      isValidJson,
      rawResponseText: rawText,
      parsedResponse: parsed,
      validation,
      error: errorMsg,
    };

    rawResults.push(itemResult);

    if (errorMsg) {
      console.log(`FALHA (HTTP ${httpStatus}) - ${latencyMs}ms: ${errorMsg}`);
      if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) {
        console.error(`[INTERRUPÇÃO DE SEGURANÇA] Status HTTP fatal ${httpStatus}. Interrompendo lote imediatamente.`);
        break;
      }
    } else {
      const firstRes = validation.sanitizedResults[0];
      const statusLabel = firstRes ? firstRes.status : 'NO_RESULT';
      const relLabel = firstRes ? firstRes.relationship : 'NONE';
      console.log(`OK (${latencyMs}ms, in:${inputTokens}/out:${outputTokens} tok) -> [${statusLabel} | ${relLabel}]`);
    }

    // Intervalo de cortesia para controle de taxa RPM
    if (i < cases.length - 1) {
      await sleep(1200);
    }
  }

  // Salva raw-results.json
  const rawResultsPath = path.join(__dirname, 'raw-results.json');
  fs.writeFileSync(rawResultsPath, JSON.stringify(rawResults, null, 2), 'utf-8');
  console.log(`\n✔ Resultados brutos gravados em ${rawResultsPath}`);

  // 4. Carrega gold-labels.json e calcula métricas
  const goldPath = path.join(__dirname, 'gold-labels.json');
  if (!fs.existsSync(goldPath)) {
    console.error(`[AVISO] gold-labels.json não encontrado em ${goldPath}`);
    return;
  }
  const goldData = JSON.parse(fs.readFileSync(goldPath, 'utf-8'));
  const goldLabels: GoldLabel[] = goldData.labels;
  const goldMap = new Map<string, GoldLabel>();
  for (const g of goldLabels) {
    goldMap.set(g.caseId, g);
  }

  // Monta comparação caso a caso
  const casesComparison: any[] = [];
  const classes: SemanticSupportLevel[] = [
    'SUPPORTED',
    'PARTIALLY_SUPPORTED',
    'NOT_SUPPORTED',
    'CONTRADICTED',
    'INSUFFICIENT_EVIDENCE',
  ];

  // Matriz de confusão [expected][returned]
  const matrix: Record<string, Record<string, number>> = {};
  for (const exp of classes) {
    matrix[exp] = {};
    for (const ret of classes) {
      matrix[exp][ret] = 0;
    }
    matrix[exp]['INVALID_OR_MISSING'] = 0;
  }

  let totalCalls = rawResults.length;
  let successfulCalls = 0;
  let matchesCount = 0;
  let criticalFalseSupportCount = 0; // Falso positivo de SUPPORTED quando era NOT_SUPPORTED ou CONTRADICTED
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const latencies: number[] = [];

  for (const r of rawResults) {
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
    latencies.push(r.latencyMs);

    const gold = goldMap.get(r.caseId);
    if (!gold) continue;

    const evaluatedRes = r.validation.sanitizedResults[0];
    const returnedStatus = (evaluatedRes ? evaluatedRes.status : 'INVALID_OR_MISSING') as string;
    const returnedRel = evaluatedRes ? evaluatedRes.relationship : 'NONE';
    const explanation = evaluatedRes ? evaluatedRes.explanation : (r.error || 'Sem resposta');

    if (r.httpStatus === 200 && r.isValidJson && evaluatedRes) {
      successfulCalls++;
    }

    const isMatch = returnedStatus === gold.expectedStatus;
    if (isMatch) {
      matchesCount++;
    }

    if (returnedStatus === 'SUPPORTED' && gold.expectedStatus !== 'SUPPORTED') {
      criticalFalseSupportCount++;
    }

    if (matrix[gold.expectedStatus]) {
      if (matrix[gold.expectedStatus][returnedStatus] !== undefined) {
        matrix[gold.expectedStatus][returnedStatus]++;
      } else {
        matrix[gold.expectedStatus]['INVALID_OR_MISSING']++;
      }
    }

    casesComparison.push({
      caseId: r.caseId,
      expectedStatus: gold.expectedStatus,
      returnedStatus,
      isMatch,
      expectedRelationship: gold.expectedRelationship,
      returnedRelationship: returnedRel,
      goldRationale: gold.goldRationale,
      modelExplanation: explanation,
      latencyMs: r.latencyMs,
      tokens: r.totalTokens,
    });
  }

  // Métricas por classe
  const classMetrics: Record<string, { supportCount: number; precision: number; recall: number; f1: number }> = {};
  let macroF1Sum = 0;
  let classesWithSupportCount = 0;
  let balancedAccSum = 0;

  for (const cls of classes) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;

    const goldSupportCount = goldLabels.filter((g) => g.expectedStatus === cls).length;

    for (const comp of casesComparison) {
      const exp = comp.expectedStatus;
      const ret = comp.returnedStatus;

      if (exp === cls && ret === cls) tp++;
      else if (exp !== cls && ret === cls) fp++;
      else if (exp === cls && ret !== cls) fn++;
      else if (exp !== cls && ret !== cls) tn++;
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    classMetrics[cls] = {
      supportCount: goldSupportCount,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
    };

    if (goldSupportCount > 0) {
      macroF1Sum += f1;
      balancedAccSum += recall;
      classesWithSupportCount++;
    }
  }

  const macroF1 = classesWithSupportCount > 0 ? Math.round((macroF1Sum / classesWithSupportCount) * 1000) / 1000 : 0;
  const balancedAccuracy = classesWithSupportCount > 0 ? Math.round((balancedAccSum / classesWithSupportCount) * 1000) / 1000 : 0;
  const overallAccuracy = casesComparison.length > 0 ? Math.round((matchesCount / casesComparison.length) * 1000) / 1000 : 0;

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  // Estimativa de custo (Gemini 3.5 Flash Lite)
  // Input: $0.075 / 1M tokens ($0.000000075 / token)
  // Output: $0.30 / 1M tokens ($0.0000003 / token)
  const estimatedCostUSD = (totalInputTokens * 0.000000075) + (totalOutputTokens * 0.0000003);

  // Veredito conforme critérios pré-definidos
  let verdict: 'PROMISSOR' | 'INSATISFATÓRIO' | 'INCONCLUSIVO';
  if (totalCalls < 18 || successfulCalls < 18) {
    verdict = 'INCONCLUSIVO';
  } else if (criticalFalseSupportCount >= 3 || macroF1 < 0.50 || (totalCalls - successfulCalls) / totalCalls > 0.20) {
    verdict = 'INSATISFATÓRIO';
  } else if (overallAccuracy >= 0.70 && macroF1 >= 0.65 && criticalFalseSupportCount <= 1) {
    verdict = 'PROMISSOR';
  } else {
    verdict = 'INCONCLUSIVO';
  }

  const aggregatedMetrics = {
    experimentId: 'EXP-P3-2-2-2-GEMINI-REAL',
    evaluatedModel: targetModel,
    timestamp: new Date().toISOString(),
    totalCalls,
    successfulCalls,
    technicalFailures: totalCalls - successfulCalls,
    accuracy: overallAccuracy,
    macroF1,
    balancedAccuracy,
    criticalFalseSupportCount,
    classMetrics,
    confusionMatrix: matrix,
    latencies: {
      medianMs: medianLatency,
      minMs: minLatency,
      maxMs: maxLatency,
      p95ExploratoryMs: p95Latency,
    },
    tokens: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    },
    costEstimation: {
      currency: 'USD',
      pricingModel: 'gemini-3.5-flash-lite standard tier',
      estimatedCostUSD: Math.round(estimatedCostUSD * 1000000) / 1000000,
    },
    finalVerdict: verdict,
  };

  // Salva metrics.json
  const metricsPath = path.join(__dirname, 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(aggregatedMetrics, null, 2), 'utf-8');
  console.log(`✔ Métricas agregadas gravadas em ${metricsPath}`);

  // Salva case-results.csv
  const csvHeaders = 'caseId,expectedStatus,returnedStatus,isMatch,expectedRelationship,returnedRelationship,latencyMs,tokens\n';
  const csvRows = casesComparison.map(
    (c) =>
      `"${c.caseId}","${c.expectedStatus}","${c.returnedStatus}",${c.isMatch},"${c.expectedRelationship}","${c.returnedRelationship}",${c.latencyMs},${c.tokens}`
  );
  const csvPath = path.join(__dirname, 'case-results.csv');
  fs.writeFileSync(csvPath, csvHeaders + csvRows.join('\n'), 'utf-8');
  console.log(`✔ Comparação CSV gravada em ${csvPath}`);

  // Exibe resumo no console
  console.log('\n================================================================');
  console.log(`                     RESUMO DO EXPERIMENTO                      `);
  console.log('================================================================');
  console.log(`Total de Casos:             ${casesComparison.length} / 21`);
  console.log(`Acertos Exatos de Classe:   ${matchesCount} / ${casesComparison.length} (${(overallAccuracy * 100).toFixed(1)}%)`);
  console.log(`Macro-F1 Score:             ${macroF1.toFixed(3)}`);
  console.log(`Balanced Accuracy:          ${(balancedAccuracy * 100).toFixed(1)}%`);
  console.log(`Falsos Suportes Críticos:   ${criticalFalseSupportCount}`);
  console.log(`Latência Mediana:           ${medianLatency} ms (Mín: ${minLatency} ms | Máx: ${maxLatency} ms)`);
  console.log(`Tokens Consumidos:          ${totalInputTokens + totalOutputTokens} (In: ${totalInputTokens} | Out: ${totalOutputTokens})`);
  console.log(`Custo Estimado da Sessão:   $${estimatedCostUSD.toFixed(5)} USD`);
  console.log(`VEREDITO FINAL PRÉ-DEFINIDO: [ ${verdict} ]`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[ERRO FATAL NO HARNESS]', err);
  process.exit(1);
});

