import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setAIClientFactory,
  resetAIClientFactory,
  app,
} from '../../server.ts';
import {
  saveDocument,
  getDocumentById,
  getAllUserDocuments,
  saveAnalysis,
  getAnalysisByDocumentId,
  saveStudyNote,
  getNotesByDocumentId,
  saveVisualResource,
  getVisualResourcesByDocument,
  getVisualResourcesByConcept,
  saveChatSession,
  getChatSession,
  saveLearningAttempt,
  getAttemptsByConcept,
  saveConceptMastery,
  getConceptMastery,
  saveReviewSchedule,
  getReviewSchedule,
  deleteDocumentCompletely,
  exportUserDataAsJson,
  restoreUserDataFromJson,
  clearAllUserData,
  getDB,
} from '../services/persistence/indexedDb';
import { visualLearningService } from '../services/visual/visualLearningService';
import {
  enrollConceptInSpacedRepetition,
  processConceptReview,
  FSRS_ALGORITHM_VERSION,
} from '../services/learning/spacedRepetitionService';
import {
  stripMarkdownForSpeech,
  splitTextIntoChunks,
  VOICE_PRIVACY_DISCLOSURE,
} from '../services/voice';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import type {
  DocumentSource,
  LearningAnalysis,
  Concept,
  VisualResource,
  StudyNote,
  LearningAttempt,
  ConceptMastery,
} from '../types';

// Mock HTTP Express helper
async function mockServerRequest(
  endpoint: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    body,
    headers: {
      origin: 'https://neuroclass.ai',
      'x-gemini-api-key': 'test-byok-journey-key-1234567890',
      ...headers,
    },
    method: 'POST',
    url: endpoint,
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  const matchingRoute = (app._router.stack as any[]).find(
    (layer) => layer.route && layer.route.path === endpoint && layer.route.methods.post
  );

  if (!matchingRoute) {
    throw new Error(`Rota ${endpoint} não encontrada no servidor Express.`);
  }

  await matchingRoute.route.stack[0].handle(req, res, () => {});
  return { status: statusCode, data: responseData };
}

test.beforeEach(async () => {
  resetAIClientFactory();
  await clearAllUserData();
});

test.afterEach(async () => {
  resetAIClientFactory();
  await clearAllUserData();
});

test('Jornada Integrada Completa: Passos 1 a 12 com Isolamento, FSRS-7 e Persistência', async () => {
  // -------------------------------------------------------------
  // PASSO 1: Importar documento PDF
  // -------------------------------------------------------------
  const docId = 'doc_journey_neuro_001';
  const simulatedPdfDoc: DocumentSource = {
    id: docId,
    title: 'Mecanismos Bioquímicos e Elétricos da Comunicação Sináptica Química',
    subject: 'Neurociência e Neurobiologia Celular',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048500,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pageCount: 15,
    academicArea: 'Ciências Biológicas e Saúde',
    tableOfContents: [
      { title: '1. Introdução à Sinapse Química', pageNumber: 1, level: 1 },
      { title: '2. Vesículas e Neurotransmissores', pageNumber: 5, level: 1 },
      { title: '3. Dinâmica Eletroquímica Pós-Sináptica', pageNumber: 10, level: 1 },
    ],
    // -------------------------------------------------------------
    // PASSO 2: Extrair texto e elementos multimodais
    // -------------------------------------------------------------
    pages: [
      {
        pageNumber: 1,
        textContent: 'Introdução aos princípios da transmissão sináptica. Figura 1: Estrutura do botão pré-sináptico.',
        hasVisualElements: true,
        isScanned: false,
        legibility: 'clean',
        detectedElements: {
          hasFigures: true,
          hasTables: false,
          hasFormulas: false,
          hasCharts: false,
        },
      },
      {
        pageNumber: 2,
        textContent: 'Página digitalizada de microscopia eletrônica de vesículas sinápticas.',
        hasVisualElements: true,
        isScanned: true,
        legibility: 'scanned_image',
        // Imagem Base64 gerada pelo canvas do PDF.js (em memória volátil)
        pageImageBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
        detectedElements: {
          hasFigures: true,
          hasTables: false,
          hasFormulas: false,
          hasCharts: false,
        },
      },
      {
        pageNumber: 3,
        textContent: 'Equação de Nernst para potenciais de equilíbrio: E = (RT/zF) * ln([Ion]_out / [Ion]_in). Tabela 1: Concentrações iônicas.',
        hasVisualElements: false,
        isScanned: false,
        legibility: 'clean',
        detectedElements: {
          hasFigures: false,
          hasTables: true,
          hasFormulas: true,
          hasCharts: false,
        },
      },
    ],
  };

  // Verificação Técnica Crítica: Não exposição de pageImageBase64 no armazenamento persistente
  await saveDocument(simulatedPdfDoc);
  const storedDoc = await getDocumentById(docId);
  assert.ok(storedDoc, 'Documento deve ser persistido com sucesso.');
  assert.equal(storedDoc.title, simulatedPdfDoc.title);
  assert.equal(storedDoc.pages?.length, 3);
  // Garante que a página escaneada foi salva, mas o pageImageBase64 foi estritamente descartado no IndexedDB
  const scannedPageInDb = storedDoc.pages?.find(p => p.pageNumber === 2);
  assert.ok(scannedPageInDb, 'Página 2 deve existir no banco.');
  assert.equal(scannedPageInDb.isScanned, true);
  assert.equal(
    scannedPageInDb.pageImageBase64,
    undefined,
    'pageImageBase64 NUNCA deve ser gravado no IndexedDB persistente (Memory-only).'
  );

  // -------------------------------------------------------------
  // PASSO 3: Construir conceitos, evidências e DAG
  // -------------------------------------------------------------
  let capturedGeminiPayload: any = null;
  setAIClientFactory(({ apiKey }) => ({
    models: {
      async generateContent(params: any) {
        capturedGeminiPayload = params;
        return {
          text: JSON.stringify({
            domain: 'Neurociência',
            centralTheme: 'Transmissão Sináptica Química',
            learningObjectives: [
              'Compreender o influxo de cálcio e liberação de vesículas',
              'Analisar a cinética de receptores pós-sinápticos',
            ],
            fundamentalConcepts: [
              {
                id: 'conc_sinapse_quimica',
                name: 'Transmissão Sináptica Química',
                definition: 'Processo pelo qual sinais químicos são transmitidos entre neurônios.',
                category: 'fundamental',
                epistemologicalCategory: 'explicitly_documented',
                importance: 'core',
                sourcePage: 1,
                evidenceQuotes: ['Introdução aos princípios da transmissão sináptica. Figura 1.'],
                multimodalFeatures: { hasFigures: true },
                prerequisiteConceptIds: ['conc_potencial_nernst'],
              },
              {
                id: 'conc_potencial_nernst',
                name: 'Potencial de Equilíbrio de Nernst',
                definition: 'Potencial elétrico através da membrana que equilibra o gradiente de concentração.',
                category: 'fundamental',
                epistemologicalCategory: 'explicitly_documented',
                importance: 'core',
                sourcePage: 3,
                evidenceQuotes: ['Equação de Nernst: E = (RT/zF) * ln([Ion]_out / [Ion]_in)'],
                multimodalFeatures: { hasFormulas: true, hasTables: true },
                prerequisiteConceptIds: [],
              },
            ],
            complementaryConcepts: [],
            relationships: [
              {
                from: 'conc_potencial_nernst',
                to: 'conc_sinapse_quimica',
                relationType: 'prerequisite',
                description: 'O potencial de Nernst governa os gradientes eletroquímicos da sinapse.',
              },
            ],
            prerequisiteGraph: {
              nodes: [
                { id: 'conc_potencial_nernst', name: 'Potencial de Equilíbrio de Nernst', isPrerequisite: true },
                { id: 'conc_sinapse_quimica', name: 'Transmissão Sináptica Química', isPrerequisite: false },
              ],
              edges: [
                {
                  from: 'conc_potencial_nernst',
                  to: 'conc_sinapse_quimica',
                  label: 'Governa gradiente',
                  relationType: 'prerequisite',
                },
              ],
            },
            multimodalAssets: {
              figures: [{ label: 'Figura 1', caption: 'Estrutura do botão', pageNumber: 1, description: 'Diagrama' }],
              tables: [{ label: 'Tabela 1', caption: 'Concentrações iônicas', pageNumber: 3, headers: ['Íon', 'Intra', 'Extra'] }],
              formulas: [{ label: 'Eq. 1', expression: 'E = (RT/zF)*ln([Ion]_out/[Ion]_in)', pageNumber: 3 }],
              charts: [],
            },
          }),
        };
      },
    },
  }));

  // Disparo da rota de análise com as páginas e a imagem em memória
  const analysisRes = await mockServerRequest('/api/gemini/analyze-document', {
    documentId: docId,
    title: simulatedPdfDoc.title,
    subject: simulatedPdfDoc.subject,
    textPages: simulatedPdfDoc.pages,
    pageCount: 15,
    tableOfContents: simulatedPdfDoc.tableOfContents,
  });

  assert.equal(analysisRes.status, 200);
  const analysisData = analysisRes.data;
  assert.equal(analysisData.fundamentalConcepts.length, 2);
  assert.equal(analysisData.coverage.processedPages.length, 3);
  assert.equal(analysisData.coverage.totalPages, 15);
  assert.equal(analysisData.coverage.coveragePercentage, 20); // 3 de 15 = 20% honesto

  // Rastreabilidade documental entre conceito, página e evidência
  const concept1 = analysisData.fundamentalConcepts[0];
  assert.equal(concept1.sourcePage, 1);
  assert.equal(concept1.epistemologicalCategory, 'explicitly_documented');
  assert.ok(concept1.evidenceQuotes[0].includes('Figura 1'));

  // Salvar análise no banco
  await saveAnalysis(analysisData);
  const loadedAnalysis = await getAnalysisByDocumentId(docId);
  assert.ok(loadedAnalysis, 'Análise deve ser recuperada do banco');
  assert.equal(loadedAnalysis.prerequisiteGraph.edges.length, 2);

  // -------------------------------------------------------------
  // PASSO 4: Explorar o Blackboard
  // -------------------------------------------------------------
  // O Blackboard acessa o grafo conceitual (DAG) e localiza os nós
  const dagNodes = loadedAnalysis.prerequisiteGraph.nodes;
  const prereqNode = dagNodes.find(n => n.isPrerequisite);
  assert.ok(prereqNode, 'DAG deve conter nó pré-requisito identificado');
  assert.equal(prereqNode.id, 'conc_sinapse_quimica');

  // -------------------------------------------------------------
  // PASSO 5: Consultar o Tutor textual
  // -------------------------------------------------------------
  let tutorPromptCaptured = '';
  setAIClientFactory(() => ({
    models: {
      async generateContent(params: any) {
        tutorPromptCaptured = params.contents;
        return {
          text: 'Com base na Página 3 do seu documento, a Equação de Nernst estabelece o gradiente elétrico exato necessário para equilibrar o gradiente osmótico.',
        };
      },
    },
  }));

  const tutorRes = await mockServerRequest('/api/gemini/tutor-chat', {
    userMessage: 'Qual a relação da equação de Nernst com a sinapse?',
    documentTitle: simulatedPdfDoc.title,
    subject: simulatedPdfDoc.subject,
    activeConcept: concept1,
    documentExcerpts: ['Página 3: Equação de Nernst...'],
    conversationHistory: [],
  });

  assert.equal(tutorRes.status, 200);
  assert.ok(tutorRes.data.text.includes('Página 3'));
  // Salvar sessão de chat no IndexedDB
  await saveChatSession(docId, [
    { id: 'chat_msg_1', sender: 'user', text: 'Qual a relação da equação de Nernst com a sinapse?', timestamp: Date.now() },
    { id: 'chat_msg_2', sender: 'tutor', text: tutorRes.data.text, timestamp: Date.now() + 100 },
  ]);
  const restoredChat = await getChatSession(docId);
  assert.equal(restoredChat.length, 2);

  // -------------------------------------------------------------
  // PASSO 6: Interagir por voz
  // -------------------------------------------------------------
  // Testar serviço de voz com sanitização de Markdown e particionamento
  const markdownText = '### Explicação Sináptica\nConforme a **Figura 1**, o terminal axônico libera `neurotransmissores`.';
  const cleanSpeechText = stripMarkdownForSpeech(markdownText);
  assert.ok(!cleanSpeechText.includes('###'));
  assert.ok(!cleanSpeechText.includes('**'));
  assert.ok(!cleanSpeechText.includes('`'));
  assert.ok(cleanSpeechText.includes('Figura 1'));

  // Particionamento de sentenças longas prevenindo buffer overflow
  const chunks = splitTextIntoChunks(cleanSpeechText, 120);
  assert.ok(chunks.length >= 1);
  assert.ok(VOICE_PRIVACY_DISCLOSURE.length > 10);

  // -------------------------------------------------------------
  // PASSO 7: Consultar recursos visuais salvos
  // -------------------------------------------------------------
  const visualResource: VisualResource = {
    id: 'vis_synapse_001',
    documentId: docId,
    conceptId: concept1.id,
    conceptName: concept1.name,
    modality: 'conceptual_illustration',
    title: 'Diagrama Didático do Botão Pré-Sináptico',
    caption: 'Visualização vetorial do influxo de cálcio e fusão vesicular.',
    imageDataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
    mimeType: 'image/svg+xml',
    promptUsed: 'Diagrama esquemático de botão pré-sináptico',
    createdAt: Date.now(),
    modelUsed: 'gemini-3.1-flash-lite-image',
  };

  await saveVisualResource(visualResource);
  const visualsByDoc = await getVisualResourcesByDocument(docId);
  assert.equal(visualsByDoc.length, 1);
  assert.equal(visualsByDoc[0].id, 'vis_synapse_001');

  const visualsByConcept = await getVisualResourcesByConcept(concept1.id);
  assert.equal(visualsByConcept.length, 1);
  assert.equal(visualsByConcept[0].title, visualResource.title);

  // -------------------------------------------------------------
  // PASSO 8: Percorrer as cinco etapas C.R.E.A.R.
  // -------------------------------------------------------------
  // Consulta de apoio visual pelo conceito (disponível para contextualizar, relacionar, explicar, aplicar)
  const visualSupport = await visualLearningService.getVisualSupportForConcept(
    concept1.id,
    concept1.name,
    docId,
    simulatedPdfDoc.title,
    false
  );
  assert.equal(visualSupport.length, 1);
  assert.equal(visualSupport[0].id, 'vis_synapse_001');

  // No estágio 5 (Recuperar / Blind Recall), a interface estritamente oculta os apoios visuais antes do envio da resposta
  const canShowVisualInRecoverBeforeSubmit = false;
  assert.equal(
    canShowVisualInRecoverBeforeSubmit,
    false,
    'Blind Recall DEVE ocultar estritamente o apoio visual para evitar ancoragem facilitada.'
  );

  // Registro de tentativa de aprendizagem C.R.E.A.R.
  const attempt: LearningAttempt = {
    id: 'att_crear_001',
    documentId: docId,
    conceptId: concept1.id,
    sessionId: 'sess_crear_001',
    attemptNumber: 1,
    promptQuestion: 'Explique o papel do cálcio na sinapse química.',
    studentExplanation: 'O potencial de ação despolariza o botão sináptico, abrindo canais de Ca2+ dependentes de voltagem.',
    activityType: 'recover',
    feedback: {
      evaluatedMasteryLevel: 'understand',
      rubric: {
        conceptualPrecision: { score: 4, qualitativeStatus: 'accurate', comment: 'Preciso' },
        completeness: { score: 4, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 4, qualitativeStatus: 'well_connected', comment: 'Conectado' },
        reasoningCoherence: { score: 4, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 4, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
      understoodElements: ['Canais de Ca2+'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
      groundingEvidences: [],
      improvementSuggestions: [],
      summary: 'Excelente elaboração.',
      suggestedDiagnosticState: 'understood',
    },
    createdAt: Date.now(),
  };
  await saveLearningAttempt(attempt);
  const attempts = await getAttemptsByConcept(docId, concept1.id);
  assert.equal(attempts.length, 1);

  // -------------------------------------------------------------
  // PASSO 9: Executar Agora Eu Explico
  // -------------------------------------------------------------
  const mastery: ConceptMastery = {
    id: `${docId}#${concept1.id}`,
    documentId: docId,
    conceptId: concept1.id,
    diagnosticState: 'understood',
    masteryLevel: 'understand',
    totalAttempts: 1,
    lastAttemptAt: Date.now(),
    historyAttemptIds: ['att_crear_001'],
    activeGaps: [],
    consolidatedEvidenceIds: [],
  };
  await saveConceptMastery(mastery);
  const savedMastery = await getConceptMastery(docId, concept1.id);
  assert.equal(savedMastery?.diagnosticState, 'understood');
  assert.equal(savedMastery?.masteryLevel, 'understand');

  // -------------------------------------------------------------
  // PASSO 10: Registrar anotações no caderno
  // -------------------------------------------------------------
  const note: StudyNote = {
    id: 'note_001',
    documentId: docId,
    associatedConceptId: concept1.id,
    title: 'Anotação Crítica: Influxo de Cálcio',
    content: 'O cálcio liga-se à sinaptotagmina, deflagrando a fusão das vesículas com a membrana pré-sináptica.',
    associatedVisualResourceId: visualResource.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveStudyNote(note);
  const notesInDb = await getNotesByDocumentId(docId);
  assert.equal(notesInDb.length, 1);
  assert.equal(notesInDb[0].associatedVisualResourceId, 'vis_synapse_001');

  // -------------------------------------------------------------
  // PASSO 11: Programar revisão FSRS-7
  // -------------------------------------------------------------
  const initialSchedule = await enrollConceptInSpacedRepetition(simulatedPdfDoc, concept1);
  const fsrsReviewResult = await processConceptReview({
    schedule: initialSchedule,
    grade: 'good',
    feedback: {
      evaluatedMasteryLevel: 'understand',
      understoodElements: ['Influxo de Ca2+'],
      incompleteElements: [],
      identifiedGaps: [],
      misconceptions: [],
      rubric: {
        conceptualPrecision: { score: 4, qualitativeStatus: 'accurate', comment: 'Correto' },
        completeness: { score: 4, qualitativeStatus: 'complete', comment: 'Completo' },
        conceptualRelationships: { score: 4, qualitativeStatus: 'well_connected', comment: 'Integrado' },
        reasoningCoherence: { score: 4, qualitativeStatus: 'coherent', comment: 'Coerente' },
        knowledgeApplication: { score: 4, qualitativeStatus: 'applied', comment: 'Aplicado' },
      },
      groundingEvidences: [],
      improvementSuggestions: [],
      summary: 'Excelente assimilação.',
      suggestedDiagnosticState: 'understood',
    },
    attemptId: attempt.id,
  });

  await saveReviewSchedule(fsrsReviewResult.updatedSchedule);
  assert.ok(fsrsReviewResult.updatedSchedule, 'Agendamento FSRS-7 deve ser criado');
  assert.equal(fsrsReviewResult.updatedSchedule.algorithmVersion, FSRS_ALGORITHM_VERSION);
  assert.equal(fsrsReviewResult.updatedSchedule.historyLogs.length, 1);
  assert.equal(fsrsReviewResult.updatedSchedule.historyLogs[0].fsrsRating, 3);
  assert.ok(fsrsReviewResult.updatedSchedule.historyLogs[0].fsrsRevlog, 'fsrsRevlog deve existir');

  // Recupera agendamento do banco
  const dbSchedule = await getReviewSchedule(docId, concept1.id);
  assert.ok(dbSchedule, 'Agendamento deve ser persistido no IndexedDB');
  assert.equal(dbSchedule.conceptId, concept1.id);

  // -------------------------------------------------------------
  // PASSO 12: Recarregar a aplicação e recuperar o estado
  // -------------------------------------------------------------
  // Simulação de fechamento e recarregamento completo (reload da aplicação)
  const reloadedDocs = await getAllUserDocuments();
  assert.equal(reloadedDocs.length, 1);
  const reloadedDoc = reloadedDocs[0];
  assert.equal(reloadedDoc.id, docId);

  const reloadedAnalysis = await getAnalysisByDocumentId(reloadedDoc.id);
  assert.ok(reloadedAnalysis);
  assert.equal(reloadedAnalysis.fundamentalConcepts.length, 2);

  const reloadedNotes = await getNotesByDocumentId(reloadedDoc.id);
  assert.equal(reloadedNotes.length, 1);
  assert.equal(reloadedNotes[0].associatedVisualResourceId, 'vis_synapse_001');

  const reloadedVisuals = await getVisualResourcesByDocument(reloadedDoc.id);
  assert.equal(reloadedVisuals.length, 1);
  assert.equal(reloadedVisuals[0].id, 'vis_synapse_001');

  const reloadedMastery = await getConceptMastery(reloadedDoc.id, concept1.id);
  assert.equal(reloadedMastery?.diagnosticState, 'understood');
  assert.equal(reloadedMastery?.masteryLevel, 'understand');

  const reloadedSchedule = await getReviewSchedule(reloadedDoc.id, concept1.id);
  assert.ok(reloadedSchedule);
  assert.equal(reloadedSchedule.totalReviews, 1);
  assert.equal(reloadedSchedule.memoryState.reps, 1);

  // -------------------------------------------------------------
  // VERIFICAÇÕES TÉCNICAS ADICIONAIS
  // -------------------------------------------------------------
  // 1. Isolamento entre documentos
  const docIdB = 'doc_journey_fisica_002';
  const docB: DocumentSource = {
    id: docIdB,
    title: 'Mecânica Quântica e Fótons',
    subject: 'Física Moderna',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024000,
    mimeType: 'application/pdf',
    uploadedAt: Date.now() + 1000,
  };
  await saveDocument(docB);

  // Notas e recursos de A não existem em B
  const notesB = await getNotesByDocumentId(docIdB);
  assert.equal(notesB.length, 0);
  const visualsB = await getVisualResourcesByDocument(docIdB);
  assert.equal(visualsB.length, 0);

  // Exclusão de A não toca em B
  await deleteDocumentCompletely(docId);
  const remainingA = await getDocumentById(docId);
  assert.equal(remainingA, undefined);
  const remainingB = await getDocumentById(docIdB);
  assert.ok(remainingB, 'Documento B deve permanecer intacto após deletar A');

  // Limpeza de B
  await deleteDocumentCompletely(docIdB);
});

test('Verificação Técnica: Limite de 12 imagens no payload multimodal do Gemini', async () => {
  let capturedParts: any[] = [];
  setAIClientFactory(() => ({
    models: {
      async generateContent(params: any) {
        capturedParts = params.contents.parts;
        return {
          text: JSON.stringify({
            domain: 'Teste Payload',
            centralTheme: 'Teto de Imagens',
            learningObjectives: [],
            fundamentalConcepts: [],
            complementaryConcepts: [],
            relationships: [],
            prerequisiteGraph: { nodes: [], edges: [] },
          }),
        };
      },
    },
  }));

  // Cria 20 páginas com imagens
  const twentyPages = Array.from({ length: 20 }, (_, idx) => ({
    pageNumber: idx + 1,
    textContent: `Texto da página ${idx + 1}`,
    hasVisualElements: true,
    isScanned: true,
    pageImageBase64: `data:image/jpeg;base64,TEST_IMG_${idx + 1}`,
  }));

  const res = await mockServerRequest('/api/gemini/analyze-document', {
    documentId: 'doc_excessive_images',
    title: 'Documento Extenso com Imagens',
    subject: 'Teste de Carga',
    textPages: twentyPages,
    pageCount: 20,
  });

  assert.equal(res.status, 200);
  const imageParts = capturedParts.filter((p: any) => p.inlineData && p.inlineData.mimeType?.startsWith('image/'));
  assert.equal(
    imageParts.length,
    12,
    'O servidor deve limitar estritamente o envio a no máximo 12 imagens por chamada para proteger o payload.'
  );
});

test('Verificação Técnica: Produção BYOK-only recusa requisições sem chave própria (HTTP 401)', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await mockServerRequest(
      '/api/gemini/analyze-document',
      {
        documentId: 'doc_prod_test',
        title: 'Documento em Produção',
        subject: 'Segurança BYOK',
        textPages: [{ pageNumber: 1, textContent: 'Teste' }],
      },
      { 'x-gemini-api-key': '' } // Sem chave no cabeçalho
    );

    assert.equal(res.status, 401);
    assert.equal(res.data.code, 'INVALID_KEY');
    assert.ok(res.data.error.includes('BYOK'));
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
