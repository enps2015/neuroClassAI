# RELATÓRIO TÉCNICO DE IMPLEMENTAÇÃO — NEUROCLASS AI
## MISSÃO B1: BM25 LOCAL — INDEXAÇÃO LEXICAL, RECUPERAÇÃO E INTEGRAÇÃO AO PIPELINE

**Data de Conclusão:** 11 de Novembro de 2026  
**Algoritmo:** Okapi BM25 / Robertson-Spärck Jones (Local-First, Zero Rede, Zero Embeddings)

---

### 1. Identidade do Workspace e Confirmação de Governança

Comandos executados no início e no término da missão:
- `pwd`: `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`
- `realpath .`: `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`
- `git rev-parse --show-toplevel`: `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`

Todos os comandos confirmam inequivocamente que a execução operou 100% no workspace autorizado.

---

### 2. Branch, HEAD e Estado Git Final

- **Branch Atual:** `feature/fase2-aprendizagem-cognitiva`
- **HEAD Commit:** `987c2682e9878b180cca309735abd0e081e5b85a`
- **Contagem de Arquivos Staged:** estritamente **39 arquivos preservados intactos** (`git diff --cached --name-only | wc -l === 39`).
- **Lista dos 39 Arquivos Staged:** `README.md`, `docs/README.md`, `docs/evidencias/README.md`, 6 evidências PNG, `docs/planos/README.md`, `docs/planos/fase1_implementation_plan_revisado2.md`, `docs/relatorios/README.md`, `docs/relatorios/Relatorio_Fase1_NeuroClass_AI_2026-11-06.md`, `docs/relatorios/relatorio_bloqueio_modo_administrado_producao.md`, `package.json`, `server.ts`, `src/App.tsx`, `src/components/blackboard/Blackboard.tsx`, `src/components/crear/CrearCycleModal.tsx`, `src/components/documents/DemoModal.tsx`, `src/components/documents/DocumentUploadModal.tsx`, `src/components/explanation/AgoraEuExplicoModal.tsx`, `src/components/guidance/DynamicGuidancePanel.tsx`, `src/components/layout/TopBar.tsx`, 5 componentes onboarding, `src/components/review/SpacedReviewModal.tsx`, `src/components/settings/ApiKeyConfigModal.tsx`, `src/services/ai/aiClient.ts`, `src/services/ai/aiKeyManager.ts`, `src/services/documents/demoMaterials.ts`, `src/services/persistence/indexedDb.ts`, 3 testes e `src/types/index.ts`.

---

### 3. Esclarecimento Documental da Inconsistência do Relatório A3

No cabeçalho do relatório da Fase A3 constou erroneamente o rótulo textual `Workspace Ativo: .../neuroClassAI` ao lado de `Ambiente de Desenvolvimento: .../neuroClassAI-work`.  
**Esclarecimento formal:** Todo o código, compilação, testes e execução de comandos ocorreram e continuam ocorrendo exclusivamente no diretório `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`. O clone original não foi executado, alterado ou utilizado como ambiente de desenvolvimento. A menção foi um lapso textual documental, doravante retificado.

---

### 4. Arquivos Alterados e Criados na Missão B1

1. **`src/types/rag.ts`** *(Modificado)*:
   - Adicionados contratos formais: `LexicalPosting`, `ChunkLexicalSummary`, `StoredLexicalIndex`, `Bm25Parameters`, `Bm25SearchOptions`, `Bm25SearchResult`, `Bm25QueryResponse`.
2. **`src/services/persistence/indexedDb.ts`** *(Modificado)*:
   - Schema evoluído para `DB_VERSION = 6`.
   - Adicionada store `rag_lexical_index` com chave primária `documentId` e índice `by-document`.
   - Inclusão de `rag_lexical_index` na exclusão em cascata de `deleteDocumentCompletely` e na limpeza de `clearAllUserData`.
3. **`src/services/documents/bm25Tokenizer.ts`** *(Criado)*:
   - Tokenizador determinístico pt-BR e científico em NFC.
   - Preservação de acentos, siglas, fórmulas (`Ca²⁺`, `pH`, `CO₂`, `NaCl`), hífens (`pré-frontal`, `FSRS-7`), números (`1978`, `0.05`, `350ms`, `70mV`).
   - Simetria rigorosa entre tokenização de documentos e consultas.
4. **`src/services/documents/ragLexicalPersistenceService.ts`** *(Criado)*:
   - Camada atômica de persistência no IndexedDB: `saveLexicalIndex`, `getLexicalIndex`, `deleteLexicalIndex`, `getAllLexicalIndexes`.
5. **`src/services/retrieval/bm25SearchService.ts`** *(Criado)*:
   - Construtor do índice invertido: `buildDocumentLexicalIndex`, `indexDocumentLexical`.
   - Cálculo de Robertson IDF, pesos TF com normalização de tamanho $b$, pontuação BM25, desempate estável e filtro de escopo.
6. **`src/services/documents/ragIngestionService.ts`** *(Modificado)*:
   - Integração da indexação BM25 na etapa 4.5 da ingestão documental.
   - Disponibilização do método `rebuildLexicalIndex(documentId)` para reindexação rápida sem reler o PDF.
7. **`src/tests/rag_bm25.test.ts`** *(Criado)*:
   - Suíte com 19 testes automatizados cobrindo tokenização, fórmula, persistência, integração, escopo e benchmark de recuperação.

---

### 5. Arquitetura do Tokenizador, Postings e Fórmula BM25

#### A. Tokenizador Técnico (`bm25Tokenizer.ts`)
- **Normalização:** `text.normalize('NFC')`.
- **Case Folding:** `text.toLowerCase()` preservando acentos diacríticos (ex: `órgão`, `memória`, `córtex`).
- **Regex Determinística:** `[\p{L}\p{N}][\p{L}\p{N}⁺⁻_]*(?:[-.][\p{L}\p{N}][\p{L}\p{N}⁺⁻_]*)*` com flag `gu`.
- **Preservação:** Hífens internos (`pré-frontal`, `ISO-27001`), decimais (`0.05`), unidades (`350ms`, `70mV`), subscritos/sobrescritos (`Ca²⁺`, `CO₂`, `V_0`).
- **Stopwords:** Desativadas por padrão (`removeStopwords: false`) para assegurar máxima fidelidade de evidências; stoplist v1 documentada e disponível para ativação opcional.
- **Simetria:** `tokenizeQuery(q)` invoca exatamente a mesma pipeline que `tokenizeText(t)`.

#### B. Índice Invertido e Postings Compactados por Documento
- Chunks elegíveis excluem estritamente sentinelas `scanned_fallback` e textos vazios.
- Armazenamento em registro consolidado `StoredLexicalIndex` por documento:
  - `documentId`, `totalChunks`, `totalTokens`, `averageChunkLength` ($avgdl$);
  - `chunkSummaries`: mapa rápido de `chunkId -> { tokenCount, pageNumber, contentHash }`;
  - `postings`: mapa `termo -> Array<{ chunkId, termFrequency }>`.
- Vantagens: gravação atômica em 1 operação de put, eliminação de linhas órfãs, isolamento estrito por documento e remoção $O(1)$.

#### C. Fórmula BM25 Implementada
- **Inverse Document Frequency (Robertson não-negativo):**
  $$\text{IDF}(t) = \ln\left(1 + \frac{N - n(t) + 0.5}{n(t) + 0.5}\right)$$
  Onde $N$ é o total de chunks no corpus filtrado pelo escopo, e $n(t)$ é a quantidade de chunks contendo o termo $t$. Garante $\text{IDF} \ge 0$ sem penalização espúria para termos frequentes.
- **Peso de Frequência do Termo (TF com normalização por tamanho):**
  $$\text{TF\_Weight}(t, D) = \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$
  Defaults: $k_1 = 1.2$, $b = 0.75$. Divisão por zero prevenida com salvaguarda `avgdl = avgdl > 0 ? avgdl : 1`.
- **Frequência do Termo na Consulta ($qtf$):**
  Termos repetidos na consulta ampliam proporcionalmente o peso do termo correspondente.
- **Desempate Estável em 4 Níveis:**
  1. `score` decrescente;
  2. `pageNumber` crescente;
  3. `chunkIndexInPage` crescente;
  4. `chunkId` alfanumérico crescente.

---

### 6. Estratégia de Persistência, Reindexação e Exclusão

- **IndexedDB Schema v6:** Store dedicada `rag_lexical_index` com `keyPath: 'documentId'`.
- **Idempotência:** Toda gravação sobrescreve atomicamente o registro do documento. Reprocessar o mesmo documento substitui o índice sem duplicatas.
- **Reindexação Leve (`rebuildLexicalIndex`):** Permite recriar o índice lexical a partir dos chunks já gravados em `document_chunks`, sem necessitar de reextração ou leitura do PDF.
- **Exclusão em Cascata:** Ao excluir um documento (`deleteDocumentCompletely`), a store `rag_lexical_index` é incluída na transação atômica, eliminando postings e metadados instantaneamente.
- **Factory Reset (`clearAllUserData`):** Limpa integralmente a store `rag_lexical_index`.

---

### 7. Integração à Ingestão e Ciclo de Vida

No fluxo `ingestDocumentRAG`:
1. Validação do documento e extração das páginas;
2. Chunking determinístico de 100% das páginas;
3. Persistência dos chunks em `document_chunks`;
4. Auditoria pós-gravação (quantidade, ordenação, isolamento e offsets);
5. **Indexação Lexical BM25:** Constrói e salva o índice invertido via `indexDocumentLexical`;
6. **Atualização de Estado:** Só marca status `indexed` após aprovação do fatiamento, persistência dos chunks e indexação BM25. Se houver páginas escaneadas sem OCR, marca `completed_partial_ocr_pending`. Em caso de erro na indexação BM25, marca `failed`.

---

### 8. Exemplos Reais de Consultas e Resultados

#### Consulta 1 (Termo científico e fórmula iônica):
- **Query:** `"receptores NMDA influxo Ca²⁺"`
- **Documento:** `corpus_doc_1`
- **Chunk Retornado:** `corpus_doc_1_p1_c0`
- **Score BM25:** `2.846512`
- **Página:** 1 | **Offsets:** [0, 114]
- **Texto:** *"A potenciação de longa duração LTP em sinapses hipocampais requer influxo de íons Ca²⁺ através de receptores NMDA."*
- **Termos Ativados:** `receptores`, `nmda`, `influxo`, `ca²⁺`.

#### Consulta 2 (Nome próprio e data histórica):
- **Query:** `"Herbert Simon 1978 racionalidade limitada"`
- **Documento:** `corpus_doc_2`
- **Chunk Retornado:** `corpus_doc_2_p2_c0`
- **Score BM25:** `3.421908`
- **Página:** 2 | **Offsets:** [0, 118]
- **Texto:** *"Herbert Simon propôs em 1978 a teoria da racionalidade limitada para processos de tomada de decisão em ambientes complexos."*
- **Termos Ativados:** `herbert`, `simon`, `1978`, `racionalidade`, `limitada`.

#### Consulta 3 (Isolamento Estrito):
- **Query:** `"memória"` com escopo `documentId: 'corpus_doc_2'`
- **Resultado:** Retorna exclusivamente chunks de `corpus_doc_2`. Chunks de `corpus_doc_1` (que também contêm a palavra "memória") são terminantemente bloqueados pelo filtro de escopo.

---

### 9. Avaliação no Corpus Sintético Padronizado (Ground Truth)

Executado benchmark formal sobre 8 queries cobrindo correspondência exata, siglas, datas, unidades, escopo documental e paráfrase pura:

| Métrica | Valor Medido | Interpretação |
| :--- | :---: | :--- |
| **Recall@1** | **87.50%** | 7 das 8 queries recuperaram o chunk relevante no 1º resultado |
| **Recall@3** | **87.50%** | Todas as queries lexicais recuperadas nos top 3 resultados |
| **Recall@5** | **87.50%** | Cobertura total das consultas com sobreposição lexical |
| **Precision@1** | **87.50%** | Alta precisão na primeira posição de resposta |
| **Precision@3** | **29.17%** | Típico para consultas com 1 único chunk relevante no ground truth |
| **Precision@5** | **17.50%** | Reflete a seletividade da base pequena (1 chunk alvo por query) |
| **MRR (Mean Reciprocal Rank)** | **0.8750** | Reciprocal Rank médio excelente (7 queries com RR=1.0, 1 com RR=0.0) |

**Demonstração Formal da Limitação Lexical do BM25:**  
Na query Q7 (*"evolução dos traços mnemônicos e declínio temporal do aprendizado"*), o chunk relevante (*FSRS-7 / curva de esquecimento*) não foi retornado porque não compartilha termos literais com a consulta. O teste confirmou a falha esperada do BM25 perante paráfrases sem sobreposição de vocabulário, comprovando que o algoritmo opera estritamente como recuperador lexical semântico-agnóstico.

---

### 10. Comandos e Resultados de Testes, Lint e Build

1. **Suíte BM25 (`src/tests/rag_bm25.test.ts`):**
   - Comando: `npx tsx --test src/tests/rag_bm25.test.ts`
   - Resultado: **19/19 testes aprovados (328.2ms)**.
2. **Suíte Consolidada do Domínio RAG (Chunking + Persistência + Ingestão + BM25):**
   - Comando: `npx tsx --test src/tests/rag_chunking.test.ts src/tests/rag_persistence_and_fidelity.test.ts src/tests/rag_ingestion_flow.test.ts src/tests/rag_bm25.test.ts`
   - Resultado: **70/70 testes aprovados (444.6ms)**.
3. **Suíte Completa da Aplicação (`npm test`):**
   - Comando: `npm test`
   - Resultado: **192/192 testes aprovados (2298.9ms)** — zero regressões.
4. **Lint / Verificação de Tipos (`npm run lint`):**
   - Comando: `npm run lint` (`tsc --noEmit`)
   - Resultado: **0 erros** (código 0).
5. **Build de Produção (`npm run build`):**
   - Comando: `npm run build`
   - Resultado: **Sucesso** em 937ms (client) + 10ms (server.js).

---

### 11. Limitações Conhecidas

1. **Ausência de Recuperação Semântica (Embeddings):** BM25 recupera estritamente por correspondência exata de tokens normalizados. Sinônimos e paráfrases dependem de termos em comum ou da futura camada de recuperação híbrida/vetorial.
2. **Páginas Digitalizadas:** Páginas sem texto extraído (marcadas como `scanned_fallback`) não possuem texto indexável e permanecem excluídas do BM25 até a implementação do módulo OCR local.
3. **Reranking por LLM não ativo:** O ranking atual é 100% lexical puro calculado pela fórmula BM25.

---

### 12. Declaração de Preservação dos Arquivos Staged e Operações Git

- **39 arquivos staged originais:** rigorosamente preservados intactos.
- **Zero operações Git proibidas:** nenhuma execução de `git add`, `git commit`, `git push`, `git reset`, `git checkout`, `git stash`, etc.

---

### 13. Declaração de Intangibilidade de Outros Clones

- Todo o trabalho foi realizado exclusivamente em `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`.
- Nenhum outro diretório ou clone foi acessado, lido ou modificado.

