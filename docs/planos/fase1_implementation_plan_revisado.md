# NeuroClass AI — Revisão Técnica da Fase 1 (Núcleo Educacional)

**Versão:** 2.1 — Multimodal Vision, Epistemic Evidence & Robust Contracts
**Status:** Revisão arquitetural detalhada aguardando aprovação explícita (sem implementação de código nesta etapa).

---

## 1. Arquitetura Revisada do Sistema

O sistema mantém a premissa de confiabilidade (*Reliability First*), desacoplamento (*Separation of Concerns*) e estrita rastreabilidade, agora integrando a **capacidade de visão multimodal nativa do Gemini API** (`gemini-3.8-flash`) para leitura integral de PDFs (textos, diagramas, figuras, gráficos, fórmulas e tabelas), combinada com `pdfjs-dist` no cliente para renderização, inspeção de páginas e navegação visual imediata.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CAMADA DE INTERFACE & EXPERIÊNCIA (React 19)                    │
│  - TopBar: Seletor de Documento Ativo (Pessoal vs. Catálogo de Demonstração)           │
│  - Painel Documental: Upload de PDF / Editor de Anotações em Seções Estruturadas       │
│  - Visualizador Documental: Inspeção visual de páginas, figuras e trechos citados      │
│  - Quadro Didático (SVG/React): Mapas Conceituais, Fluxogramas Causais, Matrizes       │
│  - Tutor Textual Contextual: Diálogo C.R.E.A.R. com Rastreabilidade Epistemológica    │
│  - Caderno de Estudos: Notas, Destaques e Citações Verificáveis                        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                    CAMADA DE NEGÓCIO, SERVIÇOS & RESILIÊNCIA                           │
│  - DocumentProcessingService:                                                          │
│      * Client-side: Renderização visual de páginas, extração de texto estruturado.     │
│      * Server-side: Envio multimodal do PDF original (inline inlineData/File API).     │
│  - EpistemicValidationEngine:                                                          │
│      * Classificação: Explicitamente Documentado | Síntese Derivada | Inferência       │
│      * Validação cruzada de citações e rejeição de afirmações sem evidências.          │
│  - AIServiceHealth & CircuitBreaker:                                                   │
│      * Saúde observada (baseada nas respostas reais dos endpoints de negócio).         │
│      * Classificação de erros, retry com backoff exponencial + jitter, timeout seguro. │
│  - IndexedDBPersistenceAdapter:                                                        │
│      * Stores isoladas: documents (pessoais), analyses, notes, chat_sessions.          │
│      * Isolamento total: Materiais de Demonstração ficam em catálogo estático imutável.│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                  BACKEND SEGURO & ADAPTADORES DE IA (Node.js / Express)                │
│  - POST /api/gemini/analyze-document                                                   │
│      * Entrada: PDF original (base64/buffer) ou texto estruturado de anotações.        │
│      * Multimodal Vision: processamento simultâneo de texto, imagens, fórmulas, etc.   │
│      * Schema estrito de retorno com referências polimórficas e evidências citadas.    │
│  - POST /api/gemini/tutor-chat                                                         │
│      * Entrada: Documento ativo, conceito em foco, histórico e evidências.             │
│      * Prompt estruturado: Cita explicitamente página, seção ou figura de origem.      │
│  - Proteção de Segredos: `GEMINI_API_KEY` mantida exclusivamente no backend Node.js.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Contratos TypeScript Corrigidos

Eliminamos a dependência exclusiva de páginas numéricas e introduzimos referências polimórficas detalhadas, múltiplos pontos de evidência por conceito e discriminação clara do grau de comprovação/inferência das relações.

```typescript
/**
 * Tipos de referências documentais suportadas.
 * Não depende exclusivamente de número de página.
 */
export type EvidenceSourceType = 'pdf_page' | 'note_section' | 'figure' | 'table';

export interface BaseEvidenceReference {
  id: string;
  type: EvidenceSourceType;
  /** Trecho textual transcrito ou descrição literal do elemento */
  excerpt: string;
  /** Contexto visual ou textual circundante */
  context?: string;
}

export interface PdfPageEvidence extends BaseEvidenceReference {
  type: 'pdf_page';
  pageNumber: number;
}

export interface NoteSectionEvidence extends BaseEvidenceReference {
  type: 'note_section';
  sectionTitle: string;
  subheading?: string;
  lineRange?: { start: number; end: number };
}

export interface FigureEvidence extends BaseEvidenceReference {
  type: 'figure';
  figureLabel: string; // Ex: "Figura 2.1", "Diagrama da Sinapse"
  pageNumber?: number;
  captionExcerpt?: string;
}

export interface TableEvidence extends BaseEvidenceReference {
  type: 'table';
  tableLabel: string; // Ex: "Tabela 1 - Potenciais de Ação"
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
 * Classificação epistemológica do conteúdo extraído.
 * Separação rigorosa entre o que está no texto e o que o modelo inferiu.
 */
export type EpistemicStatus =
  | 'explicitly_documented' // Afirmação direta e inequívoca presente no material
  | 'synthesized'           // Síntese articulada a partir de múltiplos trechos explícitos
  | 'model_inference';      // Hipótese ou conexão lógica deduzida pelo modelo de IA

/**
 * Estrutura de Documentos suportados no sistema.
 */
export interface DocumentPage {
  pageNumber: number;
  textContent: string;
  hasVisualElements: boolean; // Indica presença de figuras, gráficos ou fórmulas
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
  pages?: DocumentPage[];
  noteSections?: Array<{ title: string; content: string }>;
  /** Armazenamento de arquivo binário para visualização e reprocessamento */
  storageRef?: string; // Chave IndexedDB para o Blob
}

/**
 * Conceito com suporte a múltiplas evidências polimórficas.
 */
export interface Concept {
  id: string;
  name: string;
  definition: string;
  importance: 'fundamental' | 'complementary';
  epistemicStatus: EpistemicStatus;
  /** Um conceito pode ter evidências em múltiplas páginas, figuras e tabelas */
  evidenceReferences: EvidenceReference[];
  prerequisites: string[]; // IDs de conceitos que precedem este
  visualContext?: {
    associatedFigureLabels: string[];
    hasFormulas: boolean;
  };
}

/**
 * Tipos de relacionamento entre conceitos no material.
 */
export type RelationshipType =
  | 'causes'       // Relação causal direta (A causa B)
  | 'composes'     // Composição estrutural (B é parte de A)
  | 'regulates'    // Modulação biológica/física (A regula taxa de B)
  | 'precedes'     // Ordenação temporal ou lógica (A ocorre antes de B)
  | 'contrasts'    // Distinção ou oposição (A diverge de B sob condição X)
  | 'correlates';  // Associação observada sem causalidade provada

export interface ConceptRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: RelationshipType;
  description: string;
  /** Evidências documentais reais que sustentam esta relação */
  evidences: EvidenceReference[];
  /**
   * Confiança estimada pelo modelo (0 a 1) sobre a pertinência textual.
   * NOTA: Representa a probabilidade algorítmica de adequação semântica,
   * NUNCA devendo ser apresentada ao usuário como comprovação científica.
   */
  modelConfidenceScore: number;
  /** Flag explícita indicando se a relação foi inferida ou se está escrita literalmente */
  isModelInference: boolean;
  epistemicStatus: EpistemicStatus;
}

/**
 * Análise pedagógica completa de um documento.
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
  unresolvedGaps: string[]; // Lacunas conceituais identificadas no material
  suggestedDiagramType: 'concept-map' | 'process-flow' | 'comparative' | 'hierarchy';
  analyzedAt: number;
}
```

---

## 3. Fluxo de Processamento Documental & Visão Multimodal

### A. Estratégia Híbrida: Cliente (pdfjs-dist) + Backend Gemini Multimodal
1. **No Navegador (pdfjs-dist)**:
   - Recebe o arquivo PDF do usuário.
   - Extrai texto por página para indexação local rápida e busca instantânea.
   - Detecta metadados essenciais: total de páginas, dimensões e densidade de elementos visuais.
   - Fornece visualização imediata da página e permite renderizar recortes de figuras citadas.
2. **No Backend Node.js (`/api/gemini/analyze-document`)**:
   - Envia o PDF como documento multimodal nativo via `@google/genai`:
     ```typescript
     const pdfPart = {
       inlineData: {
         mimeType: 'application/pdf',
         data: pdfBase64Buffer
       }
     };
     ```
   - O Gemini interpreta simultaneamente a diagramação visual, tabelas, diagramas de blocos, vetores, gráficos com eixos cartesianos e notações matemáticas que seriam completamente perdidos em uma extração puramente textual.
   - Cada extração mapeia explicitamente a fonte: `pageNumber`, `figureLabel`, `tableLabel` e o trecho literal.

### B. Gestão de Documentos Grandes e Limites de Tamanho
- **PDFs Pequenos a Médios ($\le 15 \text{ MB}$, até ~30 páginas)**:
  - Enviados integralmente via `inlineData` (base64) para análise unificada de contexto global.
- **PDFs Extensos ($> 15 \text{ MB}$ ou $> 30$ páginas)**:
  - O estudante escolhe o intervalo de estudo ou capítulo de interesse (ex: *Capítulo 4: Sinapses*, Págs. 45–62).
  - O `pdfjs-dist` no cliente extrai apenas as páginas selecionadas em um novo buffer PDF enxuto, preservando os números originais de página nos metadados.
- **PDFs Digitalizados (Scanned/Imagem Pura)**:
  - A capacidade de visão do Gemini processa nativamente as páginas como imagens rasterizadas sem depender de bibliotecas pesadas de OCR local (como Tesseract.js). O sistema sinaliza: *"Documento digitalizado detectado: análise realizada via reconhecimento visual multimodal"*.

---

## 4. Estratégia de Rastreabilidade e Validação Epistemológica

Para cumprir a diretriz fundamental de **não inventar informações**, implementamos um pipeline de validação estrito:

1. **Classificação Tripartida Obrigatória**:
   - `explicitly_documented`: Quando a frase ou proposição está literal no documento.
   - `synthesized`: Quando dois fatos explicitamente citados em páginas diferentes são correlacionados para gerar a explicação.
   - `model_inference`: Quando a relação lógica é sugerida pelo modelo para facilitar a compreensão didática, sem que o texto tenha afirmado a relação com todas as letras.
2. **Exibição na Interface**:
   - Nenhum conceito ou seta do diagrama é exibido sem um indicador clicável de sua evidência.
   - Quando o estudante clica em uma relação causal (ex: *"Influxo de Ca²⁺ $\to$ Fusão de Vesículas"*), o modal ou painel lateral exibe:
     - Origem: *Página 4, Figura 1.3 ("Mecanismo de Liberação de Neurotransmissores")*.
     - Trecho original: *"A despolarização pré-sináptica abre canais de Ca²⁺ dependentes de voltagem..."*.
     - Natureza: *Explicitamente documentado*.
3. **Tratamento de Informação Não Encontrada**:
   - Quando o estudante faz uma pergunta sobre um tópico não abordado no PDF, o tutor declara explicitamente:
     *"Este documento não contém informações sobre [Tópico]. Com base exclusivamente no material fornecido, não é possível confirmar esta hipótese. Gostaria de uma explicação geral baseada no conhecimento científico amplo, fora do documento?"*

---

## 5. Estratégia de Tratamento de Falhas e Disponibilidade (`AIServiceHealth`)

A camada de resiliência não executa chamadas vazias periódicas à API para evitar queima de cotas e custos. Em vez disso, opera com **Saúde Observada (Passive Health Tracking)**:

```
┌──────────────────────────────────────────────────────────────────┐
│                   AIServiceHealth & Circuit Breaker              │
│  - Monitora transações ativas reais (Analyze & Tutor)            │
│  - Estados: CLOSED (Operacional) -> OPEN (Protegido) -> HALF-OPEN │
└───────────────────────────────┬──────────────────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
   Falhas Transitórias                        Falhas Estruturais
   - Rate limit (429)                         - Autenticação / 401
   - Timeout de rede                          - Modelo inválido / 404
   - Erro interno temporário (503)            - Payload excessivo / 413
          │                                           │
          ▼                                           ▼
   Backoff Exponencial + Jitter               Interrupção Imediata
   (Retry máx: 3x, 1s -> 2s -> 4s)           Aviso claro ao usuário
```

### Classificação de Erros e Resposta ao Usuário:
1. **Erro de Cota / 429 (`RESOURCE_EXHAUSTED`)**:
   - O Circuit Breaker abre por 30 segundos. Informa ao usuário com clareza o limite atingido e sugere aguardar antes de reprocessar.
2. **Erro de Autenticação / 403 / 400 (`API_KEY_INVALID`)**:
   - Notifica que a chave configurada no projeto não tem permissão para a chamada.
3. **Timeout de Processamento**:
   - Definido timeout de 45 segundos para análises multimodais complexas. Em caso de estouro, oferece nova tentativa segmentada por páginas.
4. **Degradação Graciosa**:
   - Se o backend falhar durante uma pergunta ao tutor, o documento, os conceitos e o caderno de anotações permanecem 100% disponíveis para estudo e navegação no cliente.

---

## 6. Materiais de Demonstração (Catálogo Isolado)

Para atender à exigência de não misturar materiais pessoais com demonstrações:

- **Catálogo de Demonstração Imutável (`DemoMaterialsCatalogue`)**:
  - `demo_neurobiology`: *"Transmissão Sináptica e Plasticidade Neuronal"* (com diagramas de vesículas e receptores).
  - `demo_quantum_physics`: *"Efeito Fotoelétrico e Dualidade Onda-Partícula"* (com equações de Planck/Einstein e gráficos de frequência de corte).
- **Regra de Isolamento**:
  - Os materiais de demonstração são disponibilizados em uma seção separada ("Explorar Exemplos").
  - **NÃO são inseridos automaticamente no IndexedDB pessoal do estudante.**
  - O estudante pode experimentar um exemplo sem poluir sua biblioteca. Se desejar salvar notas sobre ele, uma cópia explícita é instanciada no banco local sob sua propriedade.

---

## 7. Compatibilidade do Ambiente e Dependências Técnicas

### Verificação do Ambiente (AI Studio Build / Web + Node.js):
- **Node.js + Express**: Totalmente suportado via script de dev full-stack configurável (`"dev": "tsx server.ts"`).
- **`@google/genai` (^2.4.0)**: Já instalado nas dependências do projeto.
- **`pdfjs-dist`**: Compatível para empacotamento com Vite. Utilizaremos worker estático/inline para evitar problemas de CORS de CDN.
- **`idb`**: Biblioteca pura TypeScript/JavaScript (~1.5 kB), sem dependências nativas, padrão ouro para IndexedDB.

### Resumo de Pacotes:
| Pacote | Função | Status |
| :--- | :--- | :--- |
| `@google/genai` | SDK oficial de IA no backend | **Instalado** (^2.4.0) |
| `express` | Servidor backend proxy de API | **Instalado** (^4.21.2) |
| `lucide-react` | Ícones de interface científica | **Instalado** (^0.546.0) |
| `motion` | Transições e microinterações | **Instalado** (^12.23.24) |
| `pdfjs-dist` | Extração local de texto e páginas | **A instalar** (Fase 1) |
| `idb` | Persistência IndexedDB tipada | **A instalar** (Fase 1) |

---

## 8. Critérios de Aceitação e Suite de Testes da Fase 1

Antes de concluir a Fase 1, validaremos obrigatoriamente os seguintes cenários de teste:

1. **PDF com Texto e Figuras**: Análise de documento contendo diagramas; verificação de que o Gemini capturou tanto as definições quanto a existência das figuras com suas legendas.
2. **PDF Digitalizado (Imagem)**: Teste com página rasterizada; comprovação de extração correta via visão multimodal sem OCR local.
3. **Anotações Manuais sem Paginação**: Inserção de anotações com títulos e subtítulos; verificação de que as evidências geradas apontam para `note_section` com os nomes das seções, sem inventar páginas.
4. **Conceito Referenciado em Múltiplas Páginas**: Teste com conceito transversal (ex: *"Dopamina"*); comprovação de que o array `evidenceReferences` lista todas as páginas e seções onde ele ocorre.
5. **Relação Conceitual sem Evidência Suficiente**: O modelo deve rejeitar ou marcar com `isModelInference: true` e `epistemicStatus: 'model_inference'`, sem fingir que o documento comprovou a causalidade.
6. **Alternância entre Documentos Distintos**: Troca entre Neurobiologia e Física Quântica; garantia absoluta de que o tutor, o quadro e os conceitos não misturam dados entre os materiais.
7. **Resiliência a Falhas de API**: Simulação de corte de rede ou erro 500 no backend; confirmação de que a interface não trava, exibe mensagem clara e mantém o material e caderno navegáveis.
8. **Persistência e Recarregamento (Reload)**: Recarregar a página (F5); confirmação de que todos os materiais pessoais, análises e anotações são restaurados integralmente do IndexedDB.

---

## 9. Próximos Passos Imediatos

Com a aprovação deste documento de revisão técnica:
1. Atualizaremos a configuração do `package.json` para adicionar `pdfjs-dist` e `idb`.
2. Criaremos a infraestrutura do backend `server.ts` com as rotas `/api/gemini/analyze-document` e `/api/gemini/tutor-chat`.
3. Implementaremos as interfaces tipadas de domínio e a persistência IndexedDB.
4. Construiremos a interface do estudante: upload/visualização de materiais, quadro dinâmico em SVG e tutor contextualizado.
5. Executaremos a bateria de testes de aceitação e apresentaremos o relatório formal da Fase 1.
