# AUDITORIA ARQUITETURAL PARA PREPARAÇÃO DE RAG
**Projeto:** NeuroClass AI  
**Data da Auditoria:** 11 de Novembro de 2026  
**Tipo de Missão:** Somente Leitura / Diagnóstico Técnico Aprofundado (Zero Implementação)  
**Ambiente Autorizado Inspecionado:** `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`  
**Branch:** `feature/fase2-aprendizagem-cognitiva`  
**HEAD de Referência:** `987c2682e9878b180cca309735abd0e081e5b85a`  
**Estado Staged do Git:** 39 arquivos staged (referência de árvore: `e276e7711108075dcf560defb2835b62373de4fe`)  
**Clone Original:** `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI` (Intocado)  
**Consumo Externo / Quota Gemini nesta Missão:** ZERO (Nenhuma chamada externa realizada)  

---

## 1. RESUMO EXECUTIVO: ESTADO REAL DA ARQUITETURA E PRONTIDÃO PARA RAG

A arquitetura do NeuroClass AI possui uma base técnica moderna, com contratos epistemológicos maduros e persistência local-first sólida. Contudo, **o sistema NÃO possui atualmente nenhum mecanismo de RAG (Retrieval-Augmented Generation) nem motor de busca/recuperação documental**.

### Conclusão de Prontidão: PRONTO PARA EVOLUÇÃO, COM GARGALOS CRÍTICOS IDENTIFICADOS
1. **O que está pronto e pode ser reaproveitado integralmente**:
   - Extração página a página e enumeração de páginas via PDF.js ([`pdfService.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/documents/pdfService.ts#L172-L273)).
   - Persistência Local-First do PDF original binário e dos objetos de página no IndexedDB (stores `documents` e `file_blobs` em [`indexedDb.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/persistence/indexedDb.ts#L190-L208)).
   - Contratos polimórficos de evidência (`PdfPageEvidence`, `TableEvidence`, `FormulaEvidence`, `ChartEvidence`, `FigureEvidence` em [`types/index.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/types/index.ts#L8-L60)).
   - Grafo DAG de conceitos e pré-requisitos no Blackboard, que pode servir como prior semântico para expansão de consultas.
2. **Os gargalos que tornam o RAG indispensável (Gargalos Reais Comprovados)**:
   - **Cegueira Crítica do Tutor**: No chat com o estudante, o Tutor recebe **apenas os primeiros 350 caracteres das primeiras 4 páginas do documento** ([`TutorPanel.tsx:508-512`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/tutor/TutorPanel.tsx#L508-L512)). As páginas 5 em diante são 100% invisíveis ao Tutor durante as perguntas!
   - **Cegueira nos Módulos Formativos**: O modal do *Agora Eu Explico* ([`App.tsx:759-763`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/App.tsx#L759-L763)) e do ciclo *C.R.E.A.R.* ([`App.tsx:796-800`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/App.tsx#L796-L800)) recebem apenas os primeiros 300 caracteres das primeiras 5 páginas.
   - **Amostragem Silenciosa em Documentos Extensos**: No endpoint de análise ([`server.ts:1011-1018`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1011-L1018)), qualquer PDF com mais de 50 páginas é submetido a *step sampling* (em um livro de 300 páginas, 5 de cada 6 páginas são sumariamente descartadas do payload).
   - **Truncamento Rígido por Página**: O texto de cada página enviada ao LLM é truncado em 1.500 caracteres ([`server.ts:1157`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1157)).
   - **Inexistência de OCR Real**: Páginas digitalizadas são renderizadas como JPEG no canvas, mas não há OCR para extrair texto pesquisável localmente.

---

## 2. MAPA DO FLUXO ATUAL DE DOCUMENTOS E COMPONENTES ENVOLVIDOS

O ciclo de vida atual de um material segue o fluxo linear abaixo:

```
[Upload do Arquivo PDF] (DocumentUploadModal.tsx)
          │
          ▼
[Inspeção e Extração PDF.js] (pdfService.ts: extractPdfDocument)
          │── Encontra totalPages, outline TOC e texto por página
          │── Renderiza canvas JPEG se isScanned (renderPdfPageToImageBase64)
          ▼
[Persistência Local-First do Binário] (App.tsx -> workspaceStorage.saveOriginalPdf)
          │── Salva original.pdf e documento.json no disco/pasta (se conectada)
          │── Salva documento e Blob em 'documents' e 'file_blobs' no IndexedDB
          ▼
[Chamada Única de Análise Conceitual] (aiClient.ts -> server.ts: /api/gemini/analyze-document)
          │── Aplica amostragem se > 50 páginas (server.ts:1011)
          │── Trunca cada página em 1500 caracteres (server.ts:1157)
          │── Limita imagens visuais a 12 (server.ts:1136)
          │── Modelo gera LearningAnalysis (8-15 conceitos fundamentais)
          ▼
[Persistência da Análise] (workspaceStorage.saveAnalysis -> 'analyses' no IndexedDB)
          │
          ├──► [Blackboard]: Renderiza Grafo DAG (Blackboard.tsx)
          │
          ├──► [Tutor Socrático]: Chat com LLM (TutorPanel.tsx)
          │         ▲
          │         └── Envia APENAS: activeDocument.pages.slice(0, 4) com 350 chars cada!
          │
          ├──► [C.R.E.A.R. / Agora Eu Explico]: (CrearCycleModal.tsx / AgoraEuExplicoModal.tsx)
          │         ▲
          │         └── Envia APENAS: activeDocument.pages.slice(0, 5) com 300 chars cada!
          │
          └──► [FSRS-7 / Caderno]: (SpacedReviewModal.tsx / StudyNotebook.tsx)
                    ▲
                    └── Envia zero trechos adicionais (apenas definição e pergunta)
```

---

## 3. INVENTÁRIO DO QUE JÁ EXISTE

| Componente / Funcionalidade | Arquivo / Símbolo Principal | Classificação Atual | Comprovação / Evidência no Código |
| :--- | :--- | :--- | :--- |
| **Enumeração Completa de Páginas** | [`pdfService.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/documents/pdfService.ts#L188-L197) (`extractPdfDocument`) | **Implementado e Comprovado** | Itera de `startPage` até `endPage` via `pdfDoc.getPage()`. |
| **Sumário Nativo (TOC / Outline)** | [`pdfService.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/documents/pdfService.ts#L69-L108) (`extractOutline`) | **Implementado e Comprovado** | Extrai hierarquia recursiva de tópicos e mapeia página física. |
| **Persistência do PDF Original** | [`workspaceStorage.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/storage/workspaceStorage.ts#L344-L395) (`saveOriginalPdf`) | **Implementado e Comprovado** | Grava `original.pdf` e hash SHA-256 no disco e store `file_blobs`. |
| **Grafo DAG de Pré-Requisitos** | [`Blackboard.tsx`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/blackboard/Blackboard.tsx) / `types/index.ts` | **Implementado e Comprovado** | Nós, arestas, relações causais e detecção de ciclos acíclicos. |
| **Rótulos Epistemológicos** | [`types/index.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/types/index.ts#L67-L72) (`EpistemicStatus`) | **Implementado e Comprovado** | Separação formal: `explicitly_documented`, `synthesized`, `model_inference`. |
| **Detecção de Páginas Escaneadas** | [`pdfService.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/documents/pdfService.ts#L228-L240) | **Implementado Parcialmente** | Heurística baseada em `textContent.length < 50 && hasVisualElements`. |
| **Renderização Visual de Scan** | [`pdfService.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/documents/pdfService.ts#L36-L63) (`renderPdfPageToImageBase64`) | **Implementado Parcialmente** | Renderiza canvas JPEG (funciona no browser, indisponível em Node). |
| **OCR Local para Scans** | - | **Inexistente** | Não há Tesseract ou engine de OCR local. Scans dependem de visão LLM. |
| **Chunking de Documento para RAG** | - | **Inexistente** | Chunks existem apenas como "sugestão de blocos de 30 páginas" na UI. |
| **Índice Lexical / Invertido** | - | **Inexistente** | Não há BM25, MiniSearch, FlexSearch ou inverted index em IndexedDB. |
| **Índice Vetorial / Embeddings** | - | **Inexistente** | Não há embeddings locais (Transformers.js) nem remotos armazenados. |
| **Mecanismo de Busca Textual** | - | **Inexistente** | Zero funções de busca/filtro em texto integral de páginas. |
| **Recuperação Contextual no Tutor** | [`TutorPanel.tsx`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/tutor/TutorPanel.tsx#L508-L512) | **Deficiente (Hardcoded)** | Fornece fixo: `pages.slice(0, 4)` com 350 caracteres cada. |
| **Transmissão Visual no Tutor Chat** | [`server.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1467-L1520) (`/api/gemini/tutor-chat`) | **Apenas Textual** | O endpoint do Tutor recebe apenas strings (`documentExcerpts`, `caption`). |
| **Proteção de Quota e Sigilo BYOK** | [`aiKeyManager.ts`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/services/ai/aiKeyManager.ts) | **Implementado e Comprovado** | Chave volátil em memória; zero vazamento em disco ou backups. |

---

## 4. GARGALOS E CAUSAS CONCRETAS DA COBERTURA PARCIAL

A auditoria identificou com precisão cirúrgica os pontos de perda de dados:

### Gargalo 1: Amostragem Forçada em Documentos > 50 Páginas
- **Onde ocorre**: [`server.ts:1011-1018`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1011-L1018)
- **Código real**:
  ```typescript
  } else if (pagesList.length > 50) {
    mode = 'sampled';
    const step = Math.ceil(pagesList.length / 50);
    pagesToSend = pagesList.filter((_, idx) => idx % step === 0 || idx === 0 || idx === pagesList.length - 1);
    processedPagesNums = pagesToSend.map((p: any) => p.pageNumber);
    sampledPagesNums = processedPagesNums;
    unprocessedPagesNums = pagesList.map((p: any) => p.pageNumber).filter((n: number) => !processedPagesNums.includes(n));
  }
  ```
- **Impacto**: Em um material de 150 páginas, o `step` é 3. Apenas 51 páginas são enviadas; **99 páginas são descartadas da análise conceitual inicial**. Embora o sistema registre transparentemente em `unprocessedPages`, ele não indexa essas páginas para recuperação posterior.

### Gargalo 2: Truncamento Rígido por Página
- **Onde ocorre**: [`server.ts:1157`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1157)
- **Código real**:
  ```typescript
  const cleanText = (p.textContent || '').slice(0, 1500);
  ```
- **Impacto**: Páginas acadêmicas densas (com 3.000 a 4.500 caracteres de texto) perdem entre 50% e 66% de seu conteúdo semântico antes mesmo de chegar ao modelo.

### Gargalo 3: Limitação de 12 Imagens por Requisição
- **Onde ocorre**: [`server.ts:1136`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/server.ts#L1136)
- **Código real**:
  ```typescript
  const imagesToInclude = pagesWithImages.slice(0, 12);
  ```
- **Impacto**: PDFs digitalizados (scanned) com mais de 12 páginas têm todas as páginas subsequentes (da 13 em diante) omitidas da inspeção visual.

### Gargalo 4: "Janela Cega" de 4 Páginas no Tutor
- **Onde ocorre**: [`TutorPanel.tsx:508-512`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/tutor/TutorPanel.tsx#L508-L512)
- **Código real**:
  ```typescript
  if (activeDocument.pages) {
    activeDocument.pages.slice(0, 4).forEach((p) => {
      documentExcerpts.push(`[Página ${p.pageNumber}]: ${p.textContent.slice(0, 350)}`);
    });
  }
  ```
- **Impacto**: O estudante pergunta ao Tutor sobre o Teorema de Nyquist na página 18 ou o Gráfico de Frenagem na página 42, mas o Tutor recebe unicamente fragmentos das páginas 1, 2, 3 e 4. Como resultado, o Tutor ou responde por conhecimento genérico pré-treinado ou admite que a informação não consta no material recebido.

### Gargalo 5: Limitação de 5 Páginas em Agora Eu Explico e C.R.E.A.R.
- **Onde ocorre**: [`App.tsx:759-763`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/App.tsx#L759-L763) e [`App.tsx:796-800`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/App.tsx#L796-L800)
- **Código real**:
  ```typescript
  documentExcerpts={
    activeDocument?.pages
      ? activeDocument.pages.slice(0, 5).map(p => `Pág. ${p.pageNumber}: ${p.textContent.slice(0, 300)}...`)
      : []
  }
  ```
- **Impacto**: O avaliador da autoexplicação não tem acesso aos trechos originais além da página 5, impossibilitando a verificação de fidelidade de conceitos avançados situados na segunda metade do documento.

---

## 5. MATRIZ DE LACUNAS (GAPS) PARA RAG

| Requisito do Produto | Situação Atual no Código | Evidência Direta | Risco Arquitetural | Trabalho de Engenharia Necessário |
| :--- | :--- | :--- | :--- | :--- |
| **1. Ingestão Integral de Páginas** | Extrai todas as páginas se não houver seleção de bloco, mas bloqueia scans > 15MB. | [`DocumentUploadModal.tsx:148-156`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/documents/DocumentUploadModal.tsx#L148-L156) | Rejeição de apostilas escaneadas legítimas do estudante. | Permitir ingestão local integral em background sem envio direto de 15MB via HTTP. |
| **2. Chunking e Segmentação** | Inexistente. A unidade mínima é a página inteira em string única. | [`types/index.ts:150-163`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/types/index.ts#L150-L163) | Impossível recuperar parágrafos específicos com precisão cirúrgica. | Implementar fatiamento em chunks de 400-800 tokens com overlap de 100 tokens, preservando `pageNumber` e `chunkIndex`. |
| **3. Indexação e Busca Lexical** | Inexistente. Não há índice invertido ou busca de termos. | `src/services/` (zero arquivos de busca) | Dependência exclusiva de 15 conceitos extraídos em lote. | Criar motor BM25 / MiniSearch local no browser persistido no IndexedDB. |
| **4. Recuperação Dinâmica no Tutor** | Fixo nas primeiras 4 páginas (`slice(0, 4)`). | [`TutorPanel.tsx:509`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/tutor/TutorPanel.tsx#L509) | Alucinação ou cegueira total para 90%+ do documento. | Substituir `pages.slice(0, 4)` por chamada `retrieveTopChunks(query, docId, topK=5)`. |
| **5. Cobertura de Indexação Transparente** | Relata apenas cobertura de análise conceitual, não de indexação. | [`types/index.ts:165-180`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/types/index.ts#L165-L180) | Confusão entre extração e indexação. | Expandir `ProcessingCoverage` para relatar: páginas extraídas, chunks indexados e falhas de OCR. |
| **6. Citações Auditáveis por Página** | Citações amarradas unicamente ao conceito pré-analisado. | [`TutorPanel.tsx:536`](file:///home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work/src/components/tutor/TutorPanel.tsx#L536) | Tutor não consegue citar parágrafos que não viraram conceito canônico. | Injetar chunks recuperados com `{ chunkId, pageNumber, text }` e exigir citação do `chunkId`/página na resposta. |

---

## 6. ARQUITETURA-ALVO PROPOSTA: FULL DOCUMENT INTELLIGENCE (LOCAL-FIRST RAG)

A arquitetura recomendada reaproveita **100% da persistência e contratos existentes**, introduzindo a camada de recuperação de forma desacoplada:

```
                          ┌───────────────────────────┐
                          │   PDF Original do Aluno   │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                     ┌─────────────────────────────────────┐
                     │     PDF.js Page Text Extraction     │
                     │  (Enfileiramento em background)     │
                     └──────────────────┬──────────────────┘
                                        │
                      ┌─────────────────┴─────────────────┐
                      │                                   │
                      ▼                                   ▼
          ┌──────────────────────┐             ┌─────────────────────┐
          │  Chunking Engine     │             │ Initial Concept DAG │
          │  400-600 tokens/pág  │             │ (Batch Analysis LLM)│
          │  + Overlap 100       │             │ (Continua existindo)│
          └───────────┬──────────┘             └──────────┬──────────┘
                      │                                   │
                      ▼                                   │
          ┌──────────────────────┐                        │
          │ In-Browser BM25      │                        │
          │ Lexical Index Engine │                        │
          │ (IndexedDB Store:    │                        │
          │  'document_chunks')  │                        │
          └───────────┬──────────┘                        │
                      │                                   │
                      │ (Top-K Chunks Recuperados)        │
                      └─────────────────┬─────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   Context Assembler / RAG   │
                         │  - Top-5 Chunks Relevantes  │
                         │  - Conceito do DAG (Prior)  │
                         │  - Metadados de Página      │
                         └──────────────┬──────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼                      ▼                      ▼
        ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
        │  Tutor Socrático│    │ Agora Eu Explico│    │ Ciclo C.R.E.A.R.│
        │  (Pergunta do  │     │ (Avaliação de  │     │ (Contextualizar│
        │   Estudante)   │     │  Autoexplicação│     │   e Aplicar)   │
        └────────────────┘     └────────────────┘     └────────────────┘
```

### O que muda nos contratos existentes:
- NENHUM contrato da Fase 1 ou Fase 2 é quebrado.
- Adiciona-se uma store no IndexedDB: `document_chunks` (com chave `id: `${docId}_chk_${chunkIndex}`` e índice `by-document`).
- O pipeline de upload passa a salvar os chunks e construir o índice de busca localmente sem gastar 1 token de API.

---

## 7. EXPLICAÇÃO DIDÁTICA E OBJETIVA: O QUE É RAG E POR QUE NÃO É RESUMO

> [!NOTE]
> ### O que é RAG (Retrieval-Augmented Generation)?
> RAG é uma arquitetura em duas etapas:
> 1. **Recuperação (Retrieval)**: Quando o estudante faz uma pergunta (ex: *"Qual a diferença entre o receptor AMPA e o receptor NMDA quanto ao bloqueio por magnésio?"*), um algoritmo de busca pesquisa em **todas as 300 páginas do livro** e encontra os 3 a 5 parágrafos mais relevantes, estejam eles na página 12 ou na página 284.
> 2. **Geração Aumentada (Augmentation & Generation)**: Esses 3 a 5 parágrafos selecionados são enviados ao modelo de linguagem como "texto de consulta", instruindo-o: *"Responda à pergunta do estudante usando estritamente as evidências destes trechos e cite a página exata."*

### Por que isso NÃO é um gerador de resumos?
- **O Resumo descarta detalhes**: Um resumo de uma apostila de 100 páginas comprime o texto e apaga 95% das fórmulas, números, tabelas e pormenores técnicos.
- **O RAG preserva o texto original íntegro**: Todas as palavras de todas as páginas continuam indexadas. O estudante pode perguntar sobre um detalhe minúsculo na nota de rodapé da página 87, e o RAG trará o parágrafo exato, sem perda de resolução científica.
- **Rastreabilidade Real**: O resumo gera generalizações; o RAG fornece citações literais com número da página física verificável.

---

## 8. ALTERNATIVAS TÉCNICAS COMPARADAS PARA O NEUROCLASS AI

| Critério | Alternativa 1: Local Lexical BM25 (Recomendada Fase 1) | Alternativa 2: Embeddings Locais (Transformers.js / WASM) | Alternativa 3: Embeddings Remotos via BYOK (Gemini API) |
| :--- | :--- | :--- | :--- |
| **Dependências Externas** | **Zero ou mínima (MiniSearch ~8KB ou BM25 puro TS ~150 linhas)** | Alta (`@xenova/transformers` ~90MB download de modelo) | Média (chamadas HTTP `/v1beta/models/text-embedding-004`) |
| **Custo / Quota de API** | **ZERO absoluto (100% gratuito e offline)** | **ZERO absoluto (offline)** | Consome quota do usuário a cada página indexada |
| **Latência de Busca** | **Instantânea (< 5 ms no navegador)** | Média (50–150 ms para inferência vetorial local) | Alta (300–800 ms por roundtrip HTTP de embedding) |
| **Consumo de Memória / CPU** | **Mínimo (< 15MB de RAM para 300 páginas)** | Alto (spike de 300MB a 600MB de RAM na inicialização WASM) | Baixo no cliente, alto tráfego de rede |
| **Suporte a Termos Técnicos Exatos** | **Excelente (Fórmulas, genes, siglas, números, dosagens)** | Regular (frequentemente confunde siglas semelhantes sem fine-tuning) | Bom, mas dependente de vocabulário de embedding |
| **Capacidade Semântica (Sinônimos)** | Regular (requer expansão via conceitos do DAG) | Excelente (vetores densos de significado) | Excelente |
| **Persistência Local-First** | **Perfeita (Índice serializável em JSON / IndexedDB)** | Complexa (requer indexador vetorial em JS, ex: HNSW) | Média (armazena vetores float32 no IndexedDB) |

### Recomendação Fundamentada
**Adotar a Alternativa 1 (Local BM25 Lexical + Expansão por Conceitos do DAG) como primeiro degrau seguro**:
1. Não introduz dependências pesadas nem downloads de modelos de 90MB que travam em máquinas modestas.
2. Funciona 100% offline, sem gastar quota da chave BYOK do estudante.
3. Para textos científicos e acadêmicos, a busca por termos exatos, siglas (ex: *LTP, NMDA, SNARE, Cav, Nyquist*), nomes de autores e fórmulas é mais confiável do que embeddings vetoriais aproximados.
4. O grafo DAG do Blackboard existente pode enriquecer as buscas com sinônimos sem custo adicional.

---

## 9. PLANO INCREMENTAL DE IMPLANTAÇÃO EM 3 FASES PEQUENAS

### Fase 1: Chunking Local e Store `document_chunks` (Sem alterar LLM)
- **Escopo**: Fatiador determinístico de páginas em chunks de 400-600 tokens com overlap de 100 tokens. Criação da store `document_chunks` no IndexedDB.
- **Critério de Aceite**: 100% das páginas de um PDF de 120 páginas fatiadas e salvas no IndexedDB com `pageNumber` e `chunkIndex`.
- **Estratégia de Rollback**: A store é nova; os fluxos existentes continuam lendo de `documents.pages`.

### Fase 2: Motor de Busca Lexical BM25 Local e API de Recuperação
- **Escopo**: Indexador BM25 em TypeScript em memória / IndexedDB. Função `retrieveContextForQuery(query, docId, topK=5)`.
- **Critério de Aceite**: Busca por termos como "Nyquist" ou "SNARE" retorna os 5 parágrafos com maior score e respectivas páginas em menos de 10ms.
- **Estratégia de Rollback**: A função de busca é pura e não interfere na renderização da UI se não for invocada.

### Fase 3: Conexão com o Tutor, Agora Eu Explico e C.R.E.A.R.
- **Escopo**: No `TutorPanel.tsx`, substituir `activeDocument.pages.slice(0, 4)` pelo resultado de `retrieveContextForQuery(userMessage, activeDocument.id, 5)`. Mesma substituição em `AgoraEuExplicoModal` e `CrearCycleModal`.
- **Critério de Aceite**: Perguntas sobre a página 45 de uma apostila de 60 páginas são respondidas pelo Tutor com citação da página 45.
- **Estratégia de Rollback**: Se a busca retornar vazia, faz fallback transparente para os trechos do conceito ativo (`activeConcept.evidenceReferences`).

---

## 10. PLANO DE TESTES COM CORPUS MULTIDISCIPLINAR REALISTA

1. **Documento Curto (15–20 páginas)**: Artigo científico de Neurociência com fórmulas e figuras. Validar extração 100% e indexação de 100% dos chunks.
2. **Documento Médio (60 páginas)**: Apostila universitária de Estatística / Ciência de Dados. Validar perguntas sobre a página 5 (início), página 30 (meio) e página 58 (fim).
3. **Documento Extenso (120–300+ páginas)**: Livro acadêmico de Engenharia/Física com múltiplos capítulos.
   - Validar que 100% das páginas foram contabilizadas na ingestão.
   - Validar que a indexação não trava a thread da UI (execução particionada com `requestIdleCallback` ou Web Worker).
   - Validar que o Tutor responde com evidências da página 250 sem ter enviado as 300 páginas ao LLM.
4. **Documentos Digitalizados (Scans)**: PDF com páginas puramente gráficas sem camada OCR.
   - Declarar explicitamente estado `scanned_image_no_ocr`.
   - Não falsear 100% de indexação textual quando não há texto extraível.

---

## 11. RISCOS DE REGRESSÃO E PLANO DE PRESERVAÇÃO

| Risco de Regressão | Impacto Potencial | Medida Preventiva no Design |
| :--- | :--- | :--- |
| **Quebra do Grafo DAG do Blackboard** | Perda da visualização de conceitos e pré-requisitos | O DAG continua sendo alimentado pelo `LearningAnalysis`; o RAG alimenta apenas as consultas e trechos de suporte. |
| **Incompatibilidade com Backups `.neuroclass`** | Falha ao restaurar backups existentes | Os chunks podem ser regenerados deterministicamente a partir de `original.pdf` no momento da importação. Não é mandatório inchar o ZIP com índices temporários. |
| **Estouro de Memória no Navegador em PDFs de 500 páginas** | Aba do Chrome crasha por OOM | Chunking streaming em lotes de 10 páginas, liberando strings brutas de memória após salvar no IndexedDB. |
| **Vazamento de Chave BYOK em Chunks** | Quebra das diretrizes de privacidade | O indexador é 100% local no browser do estudante. Chaves de API nunca entram em contato com o índice. |

---

## 12. LISTA EXPLÍCITA DO QUE NÃO DEVE SER ALTERADO NA PRIMEIRA FASE

Para garantir segurança cirúrgica e menor caminho de evolução:
1. **NÃO alterar o fluxo de geração inicial do Blackboard**: O endpoint `/api/gemini/analyze-document` continua gerando o grafo conceitual estruturado como hoje.
2. **NÃO alterar o algoritmo de repetição espaçada FSRS-7**: A lógica matemática em `ts-fsrs` e os estados de memória permanecem intocados.
3. **NÃO alterar o formato do arquivo `.neuroclass`**: O schema de backup e restauração deve ser mantido compatível com versões anteriores.
4. **NÃO introduzir banco de dados vetorial externo (Pinecone, Weaviate, Qdrant, Chroma)**: O NeuroClass AI é uma aplicação Local-First sem backend persistente central.
5. **NÃO instalar modelos pesados de embeddings de 100MB**: A primeira fase deve focar em BM25 local eficiente e determinístico.

---

## 13. INVENTÁRIO DOS TESTES EXISTENTES E COBERTURA ATUAL

O projeto possui atualmente uma suíte de testes robusta com **192 testes aprovados** (executados via `npm test`):
- `src/tests/multimodal_core.test.ts` (T350–T369): Valida ativos multimodais, fórmulas, tabelas, gráficos e simulação de amostragem em documentos longos (`CORPUS_SCENARIO_C`).
  *Lacuna comprovada*: O teste valida que o backend *relata* amostragem quando o PDF tem mais de 50 páginas, mas **não testa a recuperação de parágrafos não amostrados**, pois essa recuperação inexiste hoje.
- `src/tests/local_first_workspace.test.ts` (T370–T399): Valida persistência de binários originais, encerramento abrupto com `SIGTERM`, roundtrip de backup `.neuroclass`, integridade SHA-256 e resolução de conflitos.
- `src/tests/voice.test.ts` (T285–T301): Valida interação por voz, Web Speech API e fallbacks.
- `src/tests/byok_and_multidisciplinary.test.ts` (T255–T284): Valida isolamento de chaves BYOK e proteção em produção.

---

## 14. CONFIRMAÇÃO FINAL DO ESTADO GIT E INTEGRIDADE

A auditoria foi realizada em conformidade estrita com o princípio de **SOMENTE LEITURA**:
- **Caminho Inspecionado**: `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`
- **Branch Ativa**: `feature/fase2-aprendizagem-cognitiva`
- **HEAD**: `987c2682e9878b180cca309735abd0e081e5b85a`
- **Arquivos Staged**: Exatamente 39 arquivos (verificados via `git diff --cached --name-only | wc -l`).
- **Nenhum comando destrutivo ou de escrita Git foi executado** (zero `git write-tree`, zero `git commit`, zero `git add`).
- **Clone Original `/neuroClassAI`**: Permanece 100% intocado.
- **Consumo de Quota Externa / Gemini**: ZERO chamadas realizadas.

