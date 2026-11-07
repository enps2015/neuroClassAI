/**
 * @file Contratos de Dados do NeuroClass AI — Versão 2.2
 * Rastreabilidade epistemológica, referências polimórficas e grafo conceitual.
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
  | 'confirmed_gap'  // Lacuna confirmada por resposta incorreta
  | 'understood'     // Compreensão fundamentada
  | 'mastered';      // Domínio com capacidade de aplicação

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
  service: 'gemini_multimodal' | 'gemini_tutor' | 'local_storage';
  state: 'healthy' | 'degraded' | 'circuit_open';
  consecutiveFailures: number;
  lastFailureTime?: number;
  lastErrorMessage?: string;
}
