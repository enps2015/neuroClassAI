# NeuroClass AI — Plano de Implementação (Fase 1: Núcleo Educacional)

**Versão:** 2.2 — Final Architecture & Epistemic Pre-requisites Graph  
**Status:** Plano técnico consolidado aguardando autorização para execução. **(Zero código nesta etapa)**.

---

## 1. Ajustes Estratégicos Incorporados (Versão 2.2)

### 1.1 Processamento Dinâmico de PDFs Extensos
- **Limites Parametrizáveis e Não Universais**: Os limiares de segmentação (ex.: 15 MB e 30 páginas) tornam-se parâmetros de configuração de ambiente (`CONFIG.DOCUMENT_PROCESSING.CHUNK_THRESHOLD_PAGES = 30`, `MAX_PAYLOAD_BYTES = 15 * 1024 * 1024`), ajustáveis de acordo com a cota de tokens por minuto (TPM), tamanho máximo do corpo HTTP no proxy do Express e tempo limite de resposta do backend.
- **Detecção Inteligente de Sumário (TOC) & Sugestão de Intervalos**:
  - O `pdfjs-dist` no cliente inspeciona o Outline/TOC (Table of Contents) nativo do PDF.
  - Caso o PDF possua sumário estruturado e exceda o limiar de processamento único, o sistema apresenta os capítulos identificados com seus intervalos de páginas (ex: *"Capítulo 3: Sinapses Químicas — Págs. 42 a 68"*).
  - Caso o documento não possua sumário digital, o sistema sugere blocos semânticos baseados na estrutura de cabeçalhos das páginas iniciais.
- **Preservação Rígida da Numeração Real**: Ao extrair um intervalo (ex: páginas 42–68), os metadados e os nós do grafo preservam estritamente o número original `pageNumber: 42`, garantindo que toda citação remeta exatamente à página original do arquivo físico ou digital.

### 1.2 Tratamento Rigoroso da Confiança do Modelo (`modelConfidenceScore`)
- **Natureza Algorítmica Exclusiva**: O `modelConfidenceScore` (0.0 a 1.0) é categorizado expressamente como uma **métrica heurística de calibração interna do modelo**, utilizada pelo motor pedagógico para decidir se uma relação deve ser submetida a verificação adicional.
- **Proibição de Equiparação a Fato Científico**: Em nenhuma hipótese o valor numérico de confiança é exibido ao estudante como "probabilidade de veracidade científica" ou "certeza factual".
- **Prevalência da Evidência Documental**: A evidência textual/visual (`excerpt`, `pageNumber`, `figureLabel`) é a única base probatória aceita. Relações com alta confiança estatística do modelo, porém sem evidência citável no documento, são obrigatoriamente rotuladas como `isModelInference: true` e `epistemicStatus: 'model_inference'`.

### 1.3 Persistência, Quota IndexedDB e Segurança
- **Gestão de Quota do Armazenamento (`navigator.storage.estimate`)**:
  - Monitoramento pró-ativo de armazenamento disponível antes de salvar arquivos PDF volumosos.
  - Em caso de estouro de quota (`QuotaExceededError`), o sistema aciona estratégia de contingência: armazena no IndexedDB apenas o texto estruturado extraído e os metadados dos conceitos, descartando o Blob binário pesado mediante aviso ao usuário ("Modo de Armazenamento Otimizado ativado").
- **Integridade Transacional & Recuperação**:
  - Operações de escrita em lote envolvidas em transações com tratamento de falhas (`readwrite` atômico).
  - Mecanismo de exportação/backup local em JSON para que o estudante possa resguardar seu caderno de estudos e conceitos.
- **Direito ao Esquecimento & Limpeza Total**:
  - Botão de exclusão definitiva de documento: remove atomizadamente o documento, páginas extraídas, conceitos associados, análises, histórico do tutor e anotações vinculadas do IndexedDB.
- **Segurança e Zero Exposição de Segredos**:
  - O envio de PDFs ao backend para análise via visão multimodal é realizado por fluxo seguro em `/api/gemini/analyze-document` via POST com validação de tipo MIME.
  - A chave `GEMINI_API_KEY` reside exclusivamente nas variáveis de ambiente do servidor Node.js (`server.ts`).

### 1.4 Grafo de Dependências Conceituais & Diagnóstico C.R.E.A.R.
- **Grafo Dirigido Acíclico (DAG) de Pré-Requisitos**:
  - Cada conceito possui uma lista explícita de `prerequisiteConceptIds` (ex: Para compreender *"Potencial de Ação Pós-Sináptico"*, é pré-requisito compreender *"Canais Iônicos Dependentes de Voltagem"* e *"Gradiente Eletroquímico"*).
  - O Quadro Didático renderiza as arestas de dependência com estilo semântico diferenciado (linha tracejada com sentido direcional de fundamento $\to$ avançado).
- **Perguntas Diagnósticas Formativas**:
  - No início do estudo ou ao selecionar um conceito avançado, o estudante pode solicitar *"Verificar Meus Conhecimentos Prévios"*.
  - O tutor gera 1 a 2 perguntas diagnósticas pontuais sobre os pré-requisitos identificados.
- **Distinção Fundamental: Ausência de Evidência $\neq$ Desconhecimento**:
  - Se o estudante não respondeu sobre um conceito pré-requisito, seu estado é classificado como `unassessed` (não avaliado).
  - Somente é categorizado como `identified_gap` (lacuna confirmada) quando houver evidência observável de erro conceitual ou contradição em sua resposta.
  - A recomendação de revisão é emitida **apenas** quando lacunas reais forem confirmadas, evitando redundâncias e frustração no processo de aprendizagem.

---

## 2. Contratos TypeScript Consolidados (Versão 2.2)

```typescript
/**
 * Tipos de referências documentais polimórficas.
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
  pageNumber: number; // Numeração original real do PDF
}

export interface NoteSectionEvidence extends BaseEvidenceReference {
  type: 'note_section';
  sectionTitle: string;
  subheading?: string;
  lineRange?: { start: number; end: number };
}

export interface FigureEvidence extends BaseEvidenceReference {
  type: 'figure';
  figureLabel: string; // Ex: "Figura 2.1"
  pageNumber?: number;
  captionExcerpt?: string;
}

export interface TableEvidence extends BaseEvidenceReference {
  type: 'table';
  tableLabel: string; // Ex: "Tabela 1"
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
 * Classificação epistemológica rigorosa da informação.
 */
export type EpistemicStatus =
  | 'explicitly_documented' // Literal no texto ou imagem do documento
  | 'synthesized'           // Articulação direta de múltiplos trechos explícitos
  | 'model_inference';      // Hipótese deduzida pelo modelo para fins didáticos

/**
 * Estado cognitivo de diagnóstico de um conceito no ciclo de aprendizagem.
 */
export type DiagnosticState =
  | 'unassessed'     // Sem evidência de domínio ou erro (NÃO confundir com desconhecimento)
  | 'confirmed_gap'  // Evidência explícita de erro conceitual ou confusão
  | 'understood'     // Evidência de compreensão correta dos princípios fundamentais
  | 'mastered';      // Evidência de aplicação e capacidade de transferência

/**
 * Conceito com suporte a Grafo de Pré-Requisitos e múltiplas fontes.
 */
export interface Concept {
  id: string;
  name: string;
  definition: string;
  importance: 'fundamental' | 'complementary';
  epistemicStatus: EpistemicStatus;
  evidenceReferences: EvidenceReference[];
  /** IDs de conceitos necessários antes de estudar este */
  prerequisiteConceptIds: string[];
  /** Questões diagnósticas elaboradas para testar a base prévia */
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

/**
 * Relacionamentos conceituais no material.
 */
export type RelationshipType =
  | 'causes'       // A é causa necessária ou suficiente de B
  | 'composes'     // B é elemento constituinte de A
  | 'regulates'    // A modula a taxa ou intensidade de B
  | 'precedes'     // A antecede B lógica ou temporalmente
  | 'contrasts'    // A diferencia-se de B sob condição C
  | 'correlates';  // Associação empírica observada sem causalidade afirmada

export interface ConceptRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationshipType;
  description: string;
  evidences: EvidenceReference[];
  /**
   * Estimativa interna de calibração algorítmica (0.0 a 1.0).
   * Restrita à telemetria de backend; NÃO exposta como comprovação científica.
   */
  internalModelConfidence: number;
  isModelInference: boolean;
  epistemicStatus: EpistemicStatus;
}

/**
 * Metadados de Sumário do PDF para segmentação inteligente.
 */
export interface TableOfContentsItem {
  title: string;
  pageNumber: number; // Página original
  level: number;
  subItems?: TableOfContentsItem[];
}

export interface DocumentSource {
  id: string;
  title: string;
  subject: string;
  type: 'pdf' | 'notes';
  isDemoMaterial: boolean; // Separação absoluta entre dados pessoais e de demonstração
  sizeBytes: number;
  mimeType: string;
  uploadedAt: number;
  pageCount?: number;
  tableOfContents?: TableOfContentsItem[];
  /** Indicador de segmentação de capítulo ativo */
  activeChunkRange?: { startPage: number; endPage: number };
  pages?: Array<{
    pageNumber: number; // Número original da página no documento de origem
    textContent: string;
    hasVisualElements: boolean;
  }>;
  noteSections?: Array<{ title: string; content: string }>;
  storageRef?: string; // Chave IndexedDB para o Blob
}

/**
 * Resultado da Análise de Aprendizagem Documental.
 */
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
    edges: Array<{ from: string; to: string; label: string }>;
  };
  identifiedGaps: string[];
  suggestedDiagramType: 'concept-map' | 'process-flow' | 'comparative' | 'hierarchy';
  analyzedAt: number;
}
```

---

## 3. Arquitetura de Processamento e Resiliência

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        INTERFACE DO ESTUDANTE (React 19)                               │
│  - TopBar: Navegação e Catálogo de Demonstração Isolado                                │
│  - Dialog de Segmentação: Detecção de Sumário (TOC) para PDFs Extensos                 │
│  - Quadro Didático (SVG): Grafo de Dependências + Mapas Conceituais Interativos        │
│  - Tutor Textual: Diálogo C.R.E.A.R., Diagnóstico Formativo e Citação de Páginas       │
│  - Caderno de Estudos: Notas, Citações e Backup Local em JSON                          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                    CAMADA DE NEGÓCIO, PERSISTÊNCIA & RESILIÊNCIA                       │
│  - DocumentProcessingService:                                                          │
│      * Extração de texto por página original via pdfjs-dist.                           │
│      * Inspeção de sumário (TOC) e segmentação preservando paginação original.         │
│  - DiagnosticAssessmentEngine:                                                         │
│      * Grafo de pré-requisitos (DAG).                                                  │
│      * Avaliação de evidências formativas (unassessed vs. confirmed_gap).              │
│  - IndexedDBPersistenceAdapter:                                                        │
│      * Detecção de quota (`navigator.storage.estimate`) com fallback para texto puro.  │
│      * Transações atômicas com tratamento de erro e isolamento absoluto de demos.      │
│      * Exclusão atômica de documentos e todos os seus relacionamentos.                 │
│  - AIServiceHealth & CircuitBreaker:                                                   │
│      * Saúde observada passiva (sem queima de cota).                                   │
│      * Backoff exponencial + jitter (1s, 2s, 4s) para falhas transitórias (429, 503).  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                  BACKEND NODE.JS & SERVIÇOS SEGUROS (server.ts)                        │
│  - POST /api/gemini/analyze-document                                                   │
│      * Recepção de PDF via visão multimodal (gemini-3.8-flash) com schema estruturado. │
│      * Limites configuráveis de payload e timeout de 45s.                              │
│  - POST /api/gemini/tutor-chat                                                         │
│      * Contextualização com documento, conceito ativo e evidências documentais.        │
│      * Prompt de contenção de alucinações ("Não encontrado no documento").            │
│  - Proteção de Segredos: `GEMINI_API_KEY` exclusivamente no backend.                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Matriz de Critérios de Aceitação Atualizada (Fase 1)

Os testes de aceitação da Fase 1 foram enriquecidos com os novos cenários estipulados:

| ID | Cenário de Teste | Critério de Sucesso Observável |
| :--- | :--- | :--- |
| **T01** | **PDF Multimodal (Texto + Figuras)** | O modelo identifica conceitos do texto e cita explicitamente figuras associadas (`figureLabel`), incluindo suas legendas e números de página. |
| **T02** | **PDF Digitalizado (Imagem/Scan)** | Páginas escaneadas são lidas via visão nativa do Gemini 3.8 Flash, identificando conceitos sem depender de OCR local. |
| **T03** | **PDF Extenso & Detecção de Sumário** | Documento com mais de 30 páginas ou 15 MB tem seu sumário lido no cliente; ao selecionar um capítulo, a numeração original de páginas (ex: 45 a 68) é preservada integralmente. |
| **T04** | **Anotações Manuais Estruturadas** | Anotações em texto geram evidências do tipo `note_section` com títulos de seções, sem gerar páginas fictícias. |
| **T05** | **Conceito Transversal Multirrreferência** | Um conceito citado em múltiplas partes possui todas as suas referências listadas no array `evidenceReferences`. |
| **T06** | **Relação com Lacuna Epistemológica** | Relação sugerida pelo modelo sem citação literal é obrigatoriamente rotulada como `isModelInference: true` e `epistemicStatus: 'model_inference'`, sem alucinar fontes. |
| **T07** | **Grafo de Pré-Requisitos e Diagnóstico** | O conceito avançado exibe suas dependências conceituais; o tutor propõe perguntas diagnósticas e só marca lacunas mediante resposta incorreta (`confirmed_gap`). |
| **T08** | **Isolamento de Materiais de Demonstração** | Os 2 materiais de demonstração são exploráveis a partir do catálogo, mas nunca gravados automaticamente no banco IndexedDB pessoal do usuário. |
| **T09** | **Exclusão Definitiva de Material** | Ao excluir um documento pessoal, todos os conceitos, grafos, histórico do tutor e anotações são removidos atomizadamente do IndexedDB. |
| **T10** | **Resiliência a Quota do IndexedDB** | Em caso de restrição de armazenamento local, o sistema ativa o modo otimizado (preserva o texto e os conceitos, liberando o Blob pesado com notificação clara). |
| **T11** | **Tolerância a Falhas de API (Circuit Breaker)** | Erros transitórios de rede/cota acionam retry com backoff e posterior abertura de circuito sem travar a interface; documento e notas continuam utilizáveis. |
| **T12** | **Isolamento de Contexto entre Documentos** | A alternância entre dois materiais de disciplinas distintas zera imediatamente o contexto do tutor e do quadro, sem contaminação mútua. |
| **T13** | **Recuperação Pós-Recarregamento (F5)** | Após recarregar o navegador, os materiais pessoais, conceitos, histórico e notas são restaurados com fidelidade a partir do IndexedDB. |

---

## 5. Declaração de Conformidade Técnica

- **Nenhum código implementado nesta interação**: O projeto permanece limpo e pronto para execução a partir do momento em que for dada a autorização.
- **Dependências Confirmadas**: `@google/genai`, `express`, `pdfjs-dist`, `idb`, `lucide-react`, `motion`, `dotenv`.
- **Prontidão Operacional**: Com a aprovação final desta Versão 2.2, a execução da Fase 1 seguirá os marcos estabelecidos com entrega e validação antes do avanço para a Fase 2.
