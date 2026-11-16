/**
 * NeuroClass AI — Golden Dataset de Testes de Segmentação Determinística e Checagens Locais (Tier 1)
 * @module tests/rag_deterministic_grounding.test
 *
 * Suíte de testes atualizada para a Missão P3.2.1.2:
 * 1. Neutralização de números estruturais (listas, seções, páginas) sem falsos alertas;
 * 2. Tratamento conservador de formulações didáticas/hipotéticas (UNASSESSED);
 * 3. Diferenciação estrita de unidades e grandezas (35% vs 35 neurônios, 35mg vs 35%);
 * 4. Normalização segura de unidades idênticas (2,5 mg/mL vs 2.5 mg/mL);
 * 5. Valores calculados/derivados sem acusação de contradição;
 * 6. Política conservadora para sentenças com múltiplas evidências (UNASSESSED);
 * 7. Segmentos sem citação (UNCITED_SEGMENT);
 * 8. Preservação formal de UNASSESSED no contrato de tipos e resumos;
 * 9. Ausência de falsos selos de verificação na interface;
 * 10. Benchmark indicativo de latência (N=100) com alta resolução e aquecimento.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  segmentResponseText,
  extractNumericTokens,
  extractParsedNumericTokens,
  evaluateSegmentGrounding,
  processResponseGroundingSegments,
  buildDeterministicNumberRegex,
  isNumberInEvidencePool,
  sanitizeStructuralNumbers,
  isHypotheticalFraming,
  isCalculatedOrInferredContext,
  type RawSentenceSegment,
} from '../services/retrieval/claimSegmenter';
import type { ControlledEvidenceMap, ControlledEvidenceItem } from '../types/rag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockEvidenceMap(items: Array<{ tag: string; chunkId: string; pageNumber: number; text: string }>): ControlledEvidenceMap {
  const map: ControlledEvidenceMap = new Map();
  for (const item of items) {
    map.set(item.tag, {
      tag: item.tag,
      chunkId: item.chunkId,
      documentId: 'doc_neuro_01',
      pageNumber: item.pageNumber,
      text: item.text,
      evidenceReference: {
        id: item.chunkId,
        type: 'pdf_page',
        excerpt: item.text,
        pageNumber: item.pageNumber,
      },
    });
  }
  return map;
}

describe('Missão P3.2.1.2 — Correção dos Falsos Alertas e Limitações do Tier 1', () => {
  // Teste 1: Número de item de lista
  it('Teste 1: Número de item de lista (1.) não gera falso alerta quando o dado empírico é verificado', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p1_c1',
        pageNumber: 1,
        text: 'A dose diária de manutenção recomendada é de 250mg ao dia.',
      },
    ]);

    const tutorText = '1. A dose diária de manutenção recomendada é de 250mg ao dia [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NO_DETERMINISTIC_ALERT');
    // Confirma que '1' foi neutralizado e '250 mg' foi verificado
    assert.ok(seg.checks.extractedNumbers.some(n => n.includes('250')));
    assert.ok(!seg.checks.extractedNumbers.includes('1'));
    assert.equal(seg.checks.unmatchedNumbers.length, 0);
  });

  // Teste 2: Número de seção
  it('Teste 2: Número de seção (seção 3.2) não gera falso alerta quando o dado empírico é verificado', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p2_c1',
        pageNumber: 2,
        text: 'A amígdala responde a estímulos de ameaça com latência de 15ms.',
      },
    ]);

    const tutorText = 'Na seção 3.2, vimos que a amígdala responde a estímulos de ameaça com latência de 15ms [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NO_DETERMINISTIC_ALERT');
    assert.ok(!seg.checks.extractedNumbers.includes('3.2'));
    assert.ok(seg.checks.extractedNumbers.some(n => n.includes('15')));
    assert.equal(seg.checks.unmatchedNumbers.length, 0);
  });

  // Teste 3: Número de página
  it('Teste 3: Referência discursiva de página (pág. 15) não gera falso alerta', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p3_c1',
        pageNumber: 3,
        text: 'A taxa de retenção média observada alcançou 78% dos voluntários.',
      },
    ]);

    const tutorText = 'Conforme detalhado na pág. 15, a taxa de retenção média alcançou 78% [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NO_DETERMINISTIC_ALERT');
    assert.ok(!seg.checks.extractedNumbers.includes('15'));
    assert.ok(seg.checks.extractedNumbers.some(n => n.includes('78')));
    assert.equal(seg.checks.unmatchedNumbers.length, 0);
  });

  // Teste 4: Número em exemplo hipotético / didático
  it('Teste 4: Número em exemplo didático ("imagine 5 pacientes") é classificado conservadoramente como UNASSESSED', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p4_c1',
        pageNumber: 4,
        text: 'O protocolo avalia a plasticidade sináptica após intervenção comportamental.',
      },
    ]);

    const tutorText = 'Para ilustrar, imagine 5 pacientes submetidos ao protocolo de intervenção [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'UNASSESSED');
    assert.ok(seg.notes?.includes('formulação didática ou hipotética'));
  });

  // Teste 5: 35% versus 35 neurônios
  it('Teste 5: 35% na evidência versus 35 neurônios na resposta resulta em NUMERIC_REVIEW_REQUIRED (sem falso negativo)', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p5_c1',
        pageNumber: 5,
        text: 'A taxa de acerto no teste cognitivo foi de 35% no grupo controle.',
      },
    ]);

    const tutorText = 'Foram identificados 35 neurônios piramidais na lâmina histológica [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NUMERIC_REVIEW_REQUIRED');
    assert.ok(seg.checks.unmatchedNumbers.some(n => n.includes('35')));
  });

  // Teste 6: 35 mg versus 35%
  it('Teste 6: 35 mg na evidência versus 35% na resposta resulta em NUMERIC_REVIEW_REQUIRED', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p6_c1',
        pageNumber: 6,
        text: 'A posologia recomendada do composto foi de 35 mg ao dia.',
      },
    ]);

    const tutorText = 'A taxa de eficácia observada no estudo clínico foi de 35% [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NUMERIC_REVIEW_REQUIRED');
    assert.ok(seg.checks.unmatchedNumbers.some(n => n.includes('35')));
  });

  // Teste 7: 2,5 mg/mL versus 2.5 mg/mL
  it('Teste 7: 2,5 mg/mL na evidência versus 2.5 mg/mL na resposta resulta em equivalência segura (NO_DETERMINISTIC_ALERT)', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p7_c1',
        pageNumber: 7,
        text: 'A concentração plasmática eficaz média foi de 2,5 mg/mL após infusão.',
      },
    ]);

    const tutorText = 'A concentração plasmática observada atingiu 2.5 mg/mL após a infusão [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NO_DETERMINISTIC_ALERT');
    assert.equal(seg.checks.unmatchedNumbers.length, 0);
  });

  // Teste 8: Valor calculado a partir de valores citados (2,5 e 3,0 -> média 2,75)
  it('Teste 8: Valor derivado (média 2,75 a partir de 2,5 e 3,0) requer conferência sem acusação de contradição', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p8_c1',
        pageNumber: 8,
        text: 'Os índices de retenção foram de 2,5 e 3,0 nos dois momentos amostrais.',
      },
    ]);

    const tutorText = 'A média calculada entre os dois momentos amostrais foi de 2,75 [C1].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'NUMERIC_REVIEW_REQUIRED');
    assert.ok(seg.notes?.includes('cálculo ou inferência derivável'));
    assert.ok(!seg.notes?.includes('contradição'));
  });

  // Teste 9: Duas evidências com números diferentes em sentença com múltiplas fontes
  it('Teste 9: Sentença que cita múltiplas fontes com números distintos não mascara a atribuição (avalia como UNASSESSED)', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p9_c1',
        pageNumber: 9,
        text: 'O Grupo A recebeu a dose de 25mg pela manhã.',
      },
      {
        tag: 'C2',
        chunkId: 'doc_p9_c2',
        pageNumber: 9,
        text: 'O Grupo B recebeu a dose de 50mg ao entardecer.',
      },
    ]);

    // O tutor formula sentença única citando ambas as fontes
    const tutorText = 'O Grupo A recebeu a posologia de 50mg no protocolo de estudo [C1][C2].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    // Política conservadora: não atesta certeza individual via pooling; classifica como UNASSESSED
    assert.equal(seg.assessment, 'UNASSESSED');
    assert.ok(seg.notes?.includes('Múltiplas fontes citadas'));
  });

  // Teste 10: Sentença com múltiplas referências sem números
  it('Teste 10: Sentença com múltiplas referências conceituais [C1][C2] preserva ambiguidade e diagnostica UNASSESSED', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p10_c1',
        pageNumber: 10,
        text: 'A plasticidade sináptica depende de processos de potenciação e depressão.',
      },
      {
        tag: 'C2',
        chunkId: 'doc_p10_c2',
        pageNumber: 10,
        text: 'A memória de longo prazo requer síntese proteica ribossomal.',
      },
    ]);

    const tutorText = 'A retenção duradoura envolve plasticidade e síntese de novas proteínas [C1][C2].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    const seg = result.segments[0];
    assert.equal(seg.assessment, 'UNASSESSED');
    assert.deepEqual(seg.citationTags.sort(), ['C1', 'C2']);
  });

  // Teste 11: Segmento sem citação
  it('Teste 11: Segmento sem citação resulta estritamente em UNCITED_SEGMENT', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p11_c1',
        pageNumber: 11,
        text: 'O cerebelo participa da coordenação motora fina.',
      },
    ]);

    const tutorText = 'O cerebelo é uma estrutura encafálica situada na fossa posterior.';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0].assessment, 'UNCITED_SEGMENT');
    assert.equal(result.summary.uncitedCount, 1);
  });

  // Teste 12: Preservação formal de UNASSESSED
  it('Teste 12: Preservação formal de UNASSESSED no resumo e nos tipos de saída', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p12_c1',
        pageNumber: 12,
        text: 'Texto de prova 1.',
      },
      {
        tag: 'C2',
        chunkId: 'doc_p12_c2',
        pageNumber: 12,
        text: 'Texto de prova 2.',
      },
    ]);

    const tutorText = 'Afirmação fundamentada por duas referências distintas [C1][C2].';
    const result = processResponseGroundingSegments(tutorText, evidenceMap);

    assert.equal(result.summary.unassessedCount, 1);
    assert.equal(result.segments[0].assessment, 'UNASSESSED');
  });

  // Teste 13: Ausência de falso selo de verificação na interface
  it('Teste 13: TutorPanel não contém termos inflados como "OK", "comprovado", "verificado" ou "correto"', () => {
    const tutorPanelPath = path.resolve(__dirname, '../components/tutor/TutorPanel.tsx');
    const content = fs.readFileSync(tutorPanelPath, 'utf-8');

    // Verifica que a expressão antiga com "OK" foi erradicada
    assert.ok(!content.includes('Consistência determinística local OK'));

    // Verifica presença da nova linguagem neutra
    assert.ok(content.includes('Nenhum alerta detectado nas checagens locais'));
    assert.ok(content.includes('Essas verificações identificam algumas inconsistências explícitas'));
    assert.ok(content.includes('Necessidade de conferência: valores numéricos a revisar'));
    assert.ok(content.includes('Trecho(s) sem citação direta'));
    assert.ok(content.includes('Atribuição detalhada não avaliada localmente'));

    // Verifica ausência de selos inflados de validação factual
    assert.ok(!content.includes('Resposta comprovada'));
    assert.ok(!content.includes('Afirmação verificada'));
    assert.ok(!content.includes('Resposta correta'));
  });

  // Teste 14: Benchmark Indicativo de Desempenho (N = 100) com alta resolução
  it('Teste 14: Medição indicativa de latência (N = 100) com performance.now() e warm-up', () => {
    const evidenceMap = createMockEvidenceMap([
      {
        tag: 'C1',
        chunkId: 'doc_p14_c1',
        pageNumber: 14,
        text: 'O hipocampo é fundamental para a memória declarativa. O estudo contou com 120 participantes.',
      },
      {
        tag: 'C2',
        chunkId: 'doc_p14_c2',
        pageNumber: 14,
        text: 'A taxa de retenção foi de 65% após 24 horas no grupo experimental.',
      },
    ]);

    const longTutorText =
      '1. O hipocampo atua como articulador da consolidação de memórias de longa duração [C1]. ' +
      'Neste protocolo clínico, participaram exatamente 120 voluntários hígidos [C1]. ' +
      'Na seção 2, a taxa de retenção alcançou 65% em 24 horas [C2]. ' +
      'Em contrapartida, informações sem repetição ativa sofrem decaimento gradual com o tempo.';

    const sampleSize = 100;
    const latencies: number[] = [];

    // Aquecimento prévio do runtime (Warm-up)
    for (let w = 0; w < 5; w++) {
      processResponseGroundingSegments(longTutorText, evidenceMap);
    }

    // Amostragem indicativa
    for (let k = 0; k < sampleSize; k++) {
      const res = processResponseGroundingSegments(longTutorText, evidenceMap);
      latencies.push(res.executionTimeMs);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(sampleSize * 0.5)];
    const p95 = latencies[Math.floor(sampleSize * 0.95)];
    const avg = latencies.reduce((acc, v) => acc + v, 0) / sampleSize;

    console.log(
      `[Grounding Benchmark] Medição indicativa (N=${sampleSize}) | ` +
      `P50: ${p50.toFixed(3)}ms | P95: ${p95.toFixed(3)}ms | Média: ${avg.toFixed(3)}ms`
    );

    assert.ok(avg < 2.0, `Média de execução indicativa deve ser < 2ms (obtido: ${avg.toFixed(3)}ms)`);
    assert.ok(p95 < 5.0, `P95 indicativo deve ser < 5ms (obtido: ${p95.toFixed(3)}ms)`);
  });
});
