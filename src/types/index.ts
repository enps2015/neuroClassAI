/**
 * @file Contratos de Dados do NeuroClass AI — Versão 2.3 (Fase 1 + Fase 2: Aprendizagem Cognitiva)
 * Rastreabilidade epistemológica, referências polimórficas, grafo conceitual e avaliação formativa C.R.E.A.R.
 */

export type EvidenceSourceType = 'pdf_page' | 'note_section' | 'figure' | 'table';

export interface BaseEvidenceReference {
  id: string;
  type: EvidenceSourceType;
  excerpt: string;
  context?: string;
}

export interface PdfPageEvidence extends BaseEvidenceReference {
  type: 'pdf_page';
  pageNumber: number; // Página física original
}

export interface NoteSectionEvidence extends BaseEvidenceReference {
  type: 'note_section';
  sectionTitle: string;
  subheading?: string;
  lineRange?: { start: number; end: number };
}

export interface FigureEvidence extends BaseEvidenceReference {
  type: 'figure';
  figureLabel: string; // Ex.: "Figura 1.2"
  pageNumber?: number;
  captionExcerpt?: string;
}

export interface TableEvidence extends BaseEvidenceReference {
  type: 'table';
  tableLabel: string; // Ex.: "Tabela 2"
  pageNumber?: number;
  rowHeader?: string;
  columnHeader?: string;
}

export type EvidenceReference =
  | PdfPageEvidence
  | NoteSectionEvidence
  | FigureEvidence
  | TableEvidence;

/**
 * Classificação epistemológica da informação.
 * Garante que nada seja apresentado como factual sem evidência explícita.
 */
export type EpistemicStatus =
  | 'explicitly_documented' // Afirmação textual ou visual direta e inequívoca
  | 'synthesized'           // Síntese fundamentada de múltiplos trechos explícitos
  | 'model_inference';      // Hipótese deduzida pelo modelo para suporte didático

/**
 * Estado formativo do estudante para um conceito.
 * Regra: Ausência de evidência != Desconhecimento.
 */
export type DiagnosticState =
  | 'unassessed'     // Ainda não avaliado por pergunta formativa
  | 'confirmed_gap'  // Lacuna confirmada por resposta incorreta ou equívoco conceitual
  | 'understood'     // Compreensão fundamentada demonstrada
  | 'mastered';      // Domínio consolidado com capacidade de aplicação/transferência

/**
 * Níveis de Domínio Cognitivo (Fase 2).
 * Progressão fundamentada em evidências acumuladas, não em respostas isoladas.
 */
export type MasteryLevel =
  | 'recognize'   // Reconhecer: Identifica termos e definições básicas
  | 'understand'  // Compreender: Explica o mecanismo e pré-requisitos com próprias palavras
  | 'apply'       // Aplicar: Conecta a situações práticas, problemas ou exemplos reais
  | 'transfer';   // Transferir: Relaciona a novos domínios, contrasta e extrapola princípios

export interface Concept {
  id: string;
  name: string;
  definition: string;
  importance: 'fundamental' | 'complementary';
  epistemicStatus: EpistemicStatus;
  evidenceReferences: EvidenceReference[];
  prerequisiteConceptIds: string[];
  diagnosticQuestions?: Array<{
    id: string;
    question: string;
    targetedPrerequisiteId: string;
    expectedEvidence: string;
  }>;
  diagnosticState: DiagnosticState;
  visualContext?: {
    associatedFigureLabels: string[];
    hasFormulas: boolean;
  };
}

export type RelationshipType =
  | 'causes'       // A é causa motriz ou necessária de B
  | 'composes'     // B é parte estrutural de A
  | 'regulates'    // A modula ou inibe B
  | 'precedes'     // A ocorre antes ou é pré-requisito de B
  | 'contrasts'    // A se opõe ou difere de B
  | 'correlates';  // Associação empírica observada

export interface ConceptRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationshipType;
  description: string;
  evidences: EvidenceReference[];
  /** Métrica algorítmica interna de backend (0.0 a 1.0) - NÃO É PROVA CIENTÍFICA */
  internalModelConfidence: number;
  isModelInference: boolean;
  epistemicStatus: EpistemicStatus;
}

export interface TableOfContentsItem {
  title: string;
  pageNumber: number; // Numeração original real
  level: number;
  subItems?: TableOfContentsItem[];
}

export interface DocumentPage {
  pageNumber: number;
  textContent: string;
  hasVisualElements: boolean;
}

export interface DocumentSource {
  id: string;
  title: string;
  subject: string;
  type: 'pdf' | 'notes';
  isDemoMaterial: boolean; // Separação absoluta entre dados pessoais e demonstrações
  sizeBytes: number;
  mimeType: string;
  uploadedAt: number;
  pageCount?: number;
  tableOfContents?: TableOfContentsItem[];
  activeChunkRange?: { startPage: number; endPage: number };
  pages?: DocumentPage[];
  noteSections?: Array<{ title: string; content: string }>;
  storageRef?: string; // ID da chave de armazenamento IndexedDB
}

export interface LearningAnalysis {
  id: string;
  documentId: string;
  domain: string;
  centralTheme: string;
  learningObjectives: string[];
  fundamentalConcepts: Concept[];
  complementaryConcepts: Concept[];
  relationships: ConceptRelationship[];
  prerequisiteGraph: {
    nodes: Array<{ id: string; name: string; isPrerequisite: boolean }>;
    edges: Array<{ from: string; to: string; label: string; relationType?: RelationshipType }>;
  };
  identifiedGaps: string[];
  suggestedDiagramType: 'concept-map' | 'process-flow' | 'comparative' | 'hierarchy';
  analyzedAt: number;
}

export interface TutorChatMessage {
  id: string;
  sender: 'user' | 'tutor';
  text: string;
  timestamp: number;
  contextConceptId?: string;
  evidencesCited?: EvidenceReference[];
  pedagogicalRole?: 'explanation' | 'diagnostic_question' | 'analogy' | 'practical_example' | 'clarification';
}

export interface StudyNote {
  id: string;
  documentId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  associatedConceptId?: string;
  citedExcerpt?: string;
  pageSource?: number;
}

export interface ServiceHealthStatus {
  service: 'gemini_multimodal' | 'gemini_tutor' | 'gemini_evaluation' | 'local_storage';
  state: 'healthy' | 'degraded' | 'circuit_open';
  consecutiveFailures: number;
  lastFailureTime?: number;
  lastErrorMessage?: string;
}

/* ==========================================================================
   CONTRATOS DA FASE 2: APRENDIZAGEM COGNITIVA E AVALIAÇÃO FORMATIVA (C.R.E.A.R.)
   ========================================================================== */

/**
 * Rubrica multidimensional de avaliação das explicações do estudante (Marco 2A).
 * Evita notas simplistas e decompõe a resposta em 5 dimensões cognitivas.
 */
export interface RubricDimension {
  score: number; // 0.0 a 1.0 (calibração interna)
  qualitativeStatus: string;
  comment: string;
}

export interface ExplanationRubric {
  conceptualPrecision: {
    score: number;
    qualitativeStatus: 'accurate' | 'partially_accurate' | 'inaccurate';
    comment: string;
  };
  completeness: {
    score: number;
    qualitativeStatus: 'complete' | 'partially_complete' | 'incomplete';
    comment: string;
  };
  conceptualRelationships: {
    score: number;
    qualitativeStatus: 'well_connected' | 'isolated' | 'confused';
    connectedConceptIds?: string[];
    comment: string;
  };
  reasoningCoherence: {
    score: number;
    qualitativeStatus: 'coherent' | 'fragmented' | 'contradictory';
    comment: string;
  };
  knowledgeApplication: {
    score: number;
    qualitativeStatus: 'applied' | 'theoretical_only' | 'misapplied';
    comment: string;
  };
}

/**
 * Evidência de aprendizagem observável gerada durante uma tentativa do estudante.
 */
export interface LearningEvidence {
  id: string;
  type: 'student_elaboration' | 'document_quote' | 'applied_example' | 'contrast';
  content: string;
  referenceEvidenceId?: string;
  pageNumber?: number;
  epistemicStatus: EpistemicStatus;
}

/**
 * Feedback pedagógico estruturado, detalhado e explicável.
 */
export interface ExplanationFeedback {
  summary: string;
  understoodElements: string[];
  incompleteElements: string[];
  misconceptions: string[];
  identifiedGaps: string[];
  groundingEvidences: EvidenceReference[];
  improvementSuggestions: string[];
  rubric: ExplanationRubric;
  evaluatedMasteryLevel: MasteryLevel;
  suggestedDiagnosticState: DiagnosticState;
}

/**
 * Tentativa individual de explicação dentro do módulo "Agora Eu Explico".
 * Mantém rastreabilidade completa entre documento, conceito, resposta e avaliação.
 */
export interface LearningAttempt {
  id: string;
  sessionId: string;
  documentId: string;
  conceptId: string;
  attemptNumber: number;
  promptQuestion: string;
  studentExplanation: string;
  feedback: ExplanationFeedback;
  createdAt: number;
  usedPedagogicalHint?: boolean;
}

/**
 * Registro de consolidação do domínio de um conceito pelo estudante.
 * Acumula evidências de múltiplas tentativas ao longo do tempo.
 */
export interface ConceptMastery {
  id: string; // Composto: `${documentId}#${conceptId}`
  documentId: string;
  conceptId: string;
  masteryLevel: MasteryLevel;
  diagnosticState: DiagnosticState;
  totalAttempts: number;
  lastAttemptAt: number;
  historyAttemptIds: string[];
  activeGaps: string[];
  consolidatedEvidenceIds: string[];
  nextReviewDue?: number; // Próxima data para revisão espaçada (Marco 2D)
}

/**
 * Sessão de aprendizagem ativa agrupando tentativas e progresso C.R.E.A.R.
 */
export interface LearningSession {
  id: string;
  documentId: string;
  startedAt: number;
  updatedAt: number;
  activeConceptId?: string;
  sessionType: 'agora_eu_explico' | 'crear_cycle' | 'spaced_review';
  attemptCount: number;
  conceptsAddressed: string[];
}

/**
 * Contratos de Requisição e Resposta para a API de Avaliação.
 */
export interface EvaluateExplanationRequest {
  documentId: string;
  documentTitle: string;
  subject?: string;
  concept: {
    id: string;
    name: string;
    definition: string;
    prerequisiteConceptIds?: string[];
    evidenceReferences?: EvidenceReference[];
  };
  promptQuestion: string;
  studentExplanation: string;
  attemptNumber: number;
  previousAttempts?: Array<{
    attemptNumber: number;
    studentExplanation: string;
    feedbackSummary?: string;
  }>;
  documentExcerpts?: string[];
  usedPedagogicalHint?: boolean;
}

export interface EvaluateExplanationResponse {
  feedback: ExplanationFeedback;
  timestamp: number;
  modelUsed: string;
}

export interface GenerateConceptQuestionRequest {
  documentTitle: string;
  subject?: string;
  concept: {
    id: string;
    name: string;
    definition: string;
    prerequisiteConceptIds?: string[];
    evidenceReferences?: EvidenceReference[];
  };
  targetMasteryLevel?: MasteryLevel;
  documentExcerpts?: string[];
}

export interface GenerateConceptQuestionResponse {
  question: string;
  targetedPrerequisiteIds: string[];
  contextTip?: string;
  timestamp: number;
}
