import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MATERIALS } from '../services/documents/demoMaterials.ts';
import { AIServiceHealth, CircuitBreakerOpenError } from '../services/ai/aiHealth.ts';
import { safeBufferToBase64 } from '../services/documents/pdfService.ts';

test('T01 & T05: Catálogo de demonstração possui evidências estritas e multirrreferências reais', () => {
  assert.equal(DEMO_MATERIALS.length, 2, 'Devem existir exatamente 2 materiais científicos demonstrativos');

  const neuroDoc = DEMO_MATERIALS[0];
  assert.equal(neuroDoc.document.subject, 'Neurociência e Fisiologia Celular');
  assert.ok(neuroDoc.document.pages && neuroDoc.document.pages.length === 6);

  // Valida que os conceitos fundamentais possuem evidências tipadas de página ou figura
  for (const concept of neuroDoc.analysis.fundamentalConcepts) {
    assert.ok(concept.evidenceReferences.length > 0, `Conceito ${concept.name} deve ter ao menos 1 evidência documental`);
    for (const ev of concept.evidenceReferences) {
      assert.ok(['pdf_page', 'note_section', 'figure', 'table'].includes(ev.type));
      assert.ok(ev.excerpt.length > 5, 'Evidência deve ter trecho literal extraído');
    }
  }

  // Conceito com multirrreferência (página + figura)
  const influxCa = neuroDoc.analysis.fundamentalConcepts.find(c => c.id === 'c_influxo_ca');
  assert.ok(influxCa, 'Conceito c_influxo_ca deve existir');
  assert.ok(influxCa.evidenceReferences.length >= 2, 'Influxo de Ca2+ deve possuir múltiplas evidências documentais');
  const hasFigure = influxCa.evidenceReferences.some(ev => ev.type === 'figure');
  assert.ok(hasFigure, 'Influxo de Ca2+ deve referenciar figura original');
});

test('T06: Relações conceituais mantêm integridade epistemológica sem alucinação de dados', () => {
  const quantumDoc = DEMO_MATERIALS[1];
  assert.equal(quantumDoc.document.subject, 'Física Moderna e Quântica');

  for (const rel of quantumDoc.analysis.relationships) {
    assert.ok(rel.sourceConceptId, 'Relação deve ter origem');
    assert.ok(rel.targetConceptId, 'Relação deve ter destino');
    assert.ok(rel.evidences.length > 0, 'Relação deve possuir evidência documental');
    assert.ok(rel.internalModelConfidence >= 0 && rel.internalModelConfidence <= 1.0);
    assert.equal(typeof rel.isModelInference, 'boolean');
  }
});

test('T07: Grafo de dependências conceituais e pré-requisitos (DAG)', () => {
  const neuroDoc = DEMO_MATERIALS[0];
  const graph = neuroDoc.analysis.prerequisiteGraph;

  assert.ok(graph.nodes.length >= 5, 'Grafo deve conter nós');
  assert.ok(graph.edges.length >= 4, 'Grafo deve conter arestas de pré-requisito');

  // Verifica que um conceito avançado como LTP exige pré-requisitos
  const ltp = neuroDoc.analysis.fundamentalConcepts.find(c => c.id === 'c_ltp');
  assert.ok(ltp);
  assert.ok(ltp.prerequisiteConceptIds.includes('c_fenda_receptores'));
});

test('T08: Isolamento estrito dos materiais de demonstração', () => {
  for (const item of DEMO_MATERIALS) {
    assert.equal(item.document.isDemoMaterial, true, 'Documentos de demonstração devem ter isDemoMaterial: true');
  }
});

test('T11: Resiliência passiva e Circuit Breaker do AIServiceHealth', async () => {
  AIServiceHealth.recordSuccess('gemini_multimodal');
  const initialHealth = AIServiceHealth.getStatus('gemini_multimodal');
  assert.equal(initialHealth.state, 'healthy');

  // Simula 3 falhas consecutivas para abrir o circuito
  AIServiceHealth.recordFailure('gemini_multimodal', 'Erro de Teste 1');
  AIServiceHealth.recordFailure('gemini_multimodal', 'Erro de Teste 2');
  AIServiceHealth.recordFailure('gemini_multimodal', 'Erro de Teste 3');

  const trippedHealth = AIServiceHealth.getStatus('gemini_multimodal');
  assert.equal(trippedHealth.state, 'circuit_open');
  assert.equal(trippedHealth.consecutiveFailures, 3);

  // Executar operação com circuito aberto deve rejeitar imediatamente com CircuitBreakerOpenError
  await assert.rejects(
    async () => {
      await AIServiceHealth.executeWithResilience('gemini_multimodal', async () => 'sucesso');
    },
    (err: any) => err instanceof CircuitBreakerOpenError || err.message.includes('circuito') || err.message.includes('pausa')
  );

  // Recupera circuito
  AIServiceHealth.recordSuccess('gemini_multimodal');
  assert.equal(AIServiceHealth.getStatus('gemini_multimodal').state, 'healthy');
});

test('Regressão P0: Buffer nunca fica destacado após conversão Base64 e cópias defensivas', () => {
  const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const base64 = safeBufferToBase64(original.buffer);
  assert.ok(base64.length > 0, 'Base64 deve ser gerado');
  // Verifica que o buffer original continua intacto e acessível
  assert.equal(original.buffer.byteLength, 8, 'ArrayBuffer não pode ter sido destacado (detached)');
  assert.equal(original[0], 1);
  assert.equal(original[7], 8);
});
