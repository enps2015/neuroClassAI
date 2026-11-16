# NeuroClass AI — Plano de Implementação (Fase 1: Núcleo Educacional)

Plataforma inteligente de aprendizagem multimodal baseada em evidências, rastreabilidade documental e tutoria cognitiva C.R.E.A.R. A Fase 1 estabelece o núcleo funcional da aplicação: importação de documentos (PDFs e anotações), extração pedagógica profunda sem alucinação de dados, quadro didático interativo SVG/React, tutor textual contextualizado e persistência local via IndexedDB.

---

## Decisões Críticas de Arquitetura & Diretrizes de Engenharia

> [!IMPORTANT]
> **Reliability First & Source Traceability**: Todas as explicações e conceitos do sistema são estritamente vinculados aos trechos e números de página reais dos documentos fornecidos. O sistema nunca inventa páginas, citações ou fatos ausentes.
>
> **Provider Independence & Segurança de Chaves**: Todas as chamadas ao Gemini API são intermediadas pelo servidor Express (`server.ts`), utilizando o modelo oficial `@google/genai` (`gemini-3.8-flash`), protegendo a chave `GEMINI_API_KEY` sem exposição no navegador.

- **Processamento de Documentos**: Extração de texto página a página via `pdfjs-dist` no navegador e suporte a anotações em texto com seções nomeadas.
- **Persistência Local**: IndexedDB tipado via `idb` para armazenar documentos, conceitos extraídos, anotações de estudo e histórico de sessões.
- **Quadro Didático**: Renderização SVG responsiva de grafos conceituais, diagramas de causa-efeito e fluxos de processos com nós clicáveis que atualizam o contexto do tutor em tempo real.
- **Tutor Pedagógico**: Tutor contextual que recebe o documento atual, o conceito selecionado no quadro e as dúvidas anteriores, com atalhos para Active Recall e explicações analógicas.

---

## 1. Visão Geral do Sistema e Fluxos do Usuário

O estudante poderá utilizar o NeuroClass AI para transformar qualquer material de estudo em um ambiente ativo de aprendizagem:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   INTERFACE DO ESTUDANTE (React 19)                    │
│  - TopBar: Seletor de Documento / Disciplina Ativa                     │
│  - Painel de Documentos: Upload PDF real, anotações e troca sem mistura│
│  - Quadro Didático Dinâmico (SVG/React: Grafos, Fluxos, Relações)      │
│  - Tutor Textual Contextualizado (Atalhos pedagógicos, citações reais) │
│  - Caderno de Estudos com Citações e Origem Real                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  CAMADA DE NEGÓCIO & SERVIÇOS                          │
│  - DocumentProcessingService (Extração de texto de PDF & anotações)    │
│  - PedagogicalAnalysisEngine (Extração de conceitos C.R.E.A.R.)        │
│  - BlackboardRenderEngine (Compilação de nós, relações e semântica)    │
│  - IndexedDBStorageAdapter (Persistência nativa client-side)           │
│  - AIServiceHealth & Circuit Breaker (Monitoramento e telemetria)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│               ADAPTADORES DE IA & BACKEND SEGURO (Node.js)             │
│  - /api/gemini/analyze (Análise documental profunda com fontes)        │
│  - /api/gemini/tutor   (Tutor contextual com documento + conceito)     │
│  - Modelo padrão para análise & tutoria textual: gemini-3.8-flash      │
└────────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Uso do Estudante:
1. **Adição de Material**: O estudante faz upload de um arquivo PDF real ou escreve/cola suas anotações no editor. Também fornecemos dois materiais de teste prontos para uso em 1 clique (*Neurobiologia: Transmissão Sináptica* e *Física Quântica: Efeito Fotoelétrico*).
2. **Análise Documental Estruturada**: O sistema extrai o texto com os números de página correspondentes e invoca o `/api/gemini/analyze`, identificando tema, objetivos de aprendizagem, conceitos fundamentais e complementares, além de relações causais.
3. **Exploração no Quadro Didático**: O grafo conceitual e fluxograma são desenhados no quadro interativo em SVG. Ao clicar em qualquer nó ou relação, o conceito é selecionado e destacado no texto original.
4. **Diálogo Pedagógico com o Tutor**: O estudante conversa com o tutor Gemini, que conhece o conceito ativo e o trecho de referência. O estudante pode clicar em atalhos rápidos como *"Explique com uma analogia"*, *"Dê um exemplo prático"* ou *"Faça uma pergunta para testar minha compreensão"*.
5. **Caderno de Estudos & Persistência**: O estudante guarda anotações e insights vinculados a páginas específicas. Ao recarregar a página, tudo permanece preservado via IndexedDB.

---

## 2. Identidade Visual e Experiência Científica

- **Paleta de Cores**: Fundo grafite/azul profundo (`#0b0f19` e `#111827`), superfícies estruturais em ardósia suave (`#1e293b`), com acentos semânticos de alta legibilidade:
  - Ciano elétrico (`#06b6d4`): Conexões ativas e nós selecionados.
  - Violeta orquídea (`#8b5cf6`): Relações conceituais e objetivos de aprendizagem.
  - Coral energético (`#f43f5e`): Lacunas de aprendizagem e pontos de alerta.
  - Esmeralda (`#10b981`): Evidências validadas e domínio confirmado.
- **Tipografia**: Família `Plus Jakarta Sans` para títulos e corpo, combinada com números tabulares (`font-mono tabular-nums`) para referências e contadores.
- **Disciplina de Design**: Zero pills decorativas estáticas (metadados exibidos com separadores tipográficos limpos `·`), layout otimizado para 1440px desktop e tablets, sem elementos de código ou comentários simulados na interface.

---

## 3. Estratégia de Dados e Contratos de API

### Modelos de Dados Principais (TypeScript):
```typescript
export interface DocumentSource {
  id: string;
  title: string;
  subject: string;
  type: 'pdf' | 'notes';
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
  uploadedAt: number;
}

export interface Concept {
  id: string;
  name: string;
  definition: string;
  importance: 'fundamental' | 'complementary';
  pageSource: number;
  sectionName?: string;
  sourceExcerpt: string;
  prerequisites: string[];
}

export interface ConceptRelationship {
  sourceId: string;
  targetId: string;
  relationType: 'causes' | 'composes' | 'regulates' | 'precedes' | 'contrasts';
  description: string;
}

export interface LearningAnalysis {
  documentId: string;
  domain: string;
  learningObjectives: string[];
  concepts: Concept[];
  relationships: ConceptRelationship[];
  diagramType: 'concept-map' | 'process-flow' | 'comparative';
}
```

---

## 4. Plano de Execução da Fase 1

1. **Infraestrutura Full-Stack & Persistência**:
   - Criação do `server.ts` com rotas Express `/api/gemini/analyze`, `/api/gemini/tutor` e `/api/health`.
   - Implementação do banco local `IndexedDB` (`src/services/persistence/db.ts`).
2. **Módulo de Documentos & Extração**:
   - Componente de upload de PDF e inserção de anotações.
   - Extração do conteúdo por página real com suporte a múltiplos documentos independentes (sem contaminação de contexto).
   - Inclusão de 2 materiais pré-carregados para teste imediato.
3. **Motor de Análise Pedagógica & Rastreabilidade**:
   - Rota de análise do Gemini com prompt instrucional rígido baseado em evidências documentais.
   - Tratamento de estados reais (Aguardando, Analisando, Concluído, Erro/Tentativa).
4. **Quadro Didático Dinâmico (SVG/React)**:
   - Visualizador de grafos conceituais e fluxos de processos responsivo em SVG, com zoom, seleção de nós e destaque visual de relações.
5. **Tutor Textual Contextualizado**:
   - Chat pedagógico conectado diretamente ao conceito e documento ativos, com atalhos cognitivos (*Active Recall*, analogias, exemplos).
   - Rastreamento da página original na resposta do tutor.
6. **Caderno de Estudos & Verificação**:
   - Bloco de anotações com salvamento automático e vinculação a citações.
   - Teste de troca de documentos comprovando isolamento de contexto e persistência.
