# RELATÓRIO TÉCNICO E PEDAGÓGICO — MISSÃO 2D
## MOTOR DE RECUPERAÇÃO ESPAÇADA & MEMÓRIA LONGITUDINAL (FSRS-7)

**Projeto:** NeuroClass AI
**Workspace:** `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI-work`
**Branch:** `feature/fase2-aprendizagem-cognitiva`
**Data:** 08 de Novembro de 2026
**Status:** IMPLEMENTADO, TESTADO (43/43 PASSANDO), BUILD CONCLUÍDO E HOMOLOGADO VISUALMENTE

---

## 1. RESUMO EXECUTIVO E DECISÃO ARQUITETURAL

A **Missão 2D** implementou o subsistema de **Recuperação Espaçada e Memória Longitudinal** do NeuroClass AI, integrando o algoritmo estado-da-arte **FSRS-7** (*Free Spaced Repetition Scheduler*, versão 7) ao ecossistema pedagógico C.R.E.A.R. e ao Quadro Didático Interativo (Blackboard).

Diferente de aplicativos utilitários genéricos de repetição espaçada baseados em cartões rasos (*flashcards*), o NeuroClass AI ancora a prática de recuperação na **evocação ativa sem consulta** de modelos causais profundos, calibrando os intervalos de revisão através de avaliações pedagógicas multidimensionais geradas por inteligência artificial e validadas por heurísticas estritas em Português do Brasil.

### Decisões Arquiteturais Fundamentais:
1. **Adoção da biblioteca oficial `ts-fsrs@6.0.0`:**
   - Implementação canônica do algoritmo FSRS-7 mantendo os parâmetros padrão recomendados cientificamente.
   - Retenção desejada inicial (*desired retention*) fixada em **0.90 (90%)**, sem calibrações empíricas prematuras baseadas em dados esparsos.
2. **Governança dos Três Níveis Epistemológicos:**
   - **Desempenho Real Observado:** Respostas do estudante registradas de forma literal no histórico de tentativas (`learning_attempts`).
   - **Recuperabilidade Estimada ($R$):** Previsão estatística matemática da probabilidade de recordação no instante $t$ pelo FSRS-7. Não constitui medição biológica real.
   - **Domínio Cognitivo (Mastery):** Nível qualitativo governado exclusivamente pelo `masteryEngine.ts`. Uma baixa recuperabilidade estimada ou um atraso na revisão de calendário **nunca** rebaixa um conceito de `mastered` para `confirmed_gap`.
3. **Mapeamento Pedagógico Determinístico:**
   - Eliminação da dependência de autoavaliações subjetivas do estudante. A rubrica avaliativa do "Agora Eu Explico" e C.R.E.A.R. traduz automaticamente os resultados formativos em notas FSRS (Again = 1, Hard = 2, Good = 3, Easy = 4).
4. **Residência Local Estrita (Zero Lock-in):**
   - Evolução transparente do esquema IndexedDB de `v2` para `v3`, persistindo agendamentos e históricos completos na store `review_schedules`.

---

## 2. INTEGRAÇÃO FSRS-7 E GOVERNANÇA DE PARÂMETROS

O serviço foi estruturado em `src/services/learning/spacedRepetitionService.ts`:

- **Motor Central:** `DefaultScheduler` (`fsrs`) instanciado com `generatorParameters({ request_retention: 0.90 })`.
- **Compatibilidade Node.js e Navegador:** Criação de adapters tipados entre os tipos de serialização do IndexedDB (`FsrsMemoryState`, `ConceptReviewSchedule`) e as classes nativas do FSRS-7 (`Card`, `RecordLogItem`).
- **Resiliência a Anomalias Temporais:**
   - *Revisões Antecipadas:* O FSRS-7 processa a avaliação considerando o tempo decorrido reduzido (`elapsed_days`), recalculando a nova estabilidade sem saltos desproporcionais de intervalo.
   - *Revisões Atrasadas:* O FSRS-7 leva em conta o período estendido de retenção bem-sucedida, ajustando a estabilidade de acordo com a robustez demonstrada da memória.
   - *Reconstrução Histórica Determinística:* Função `reconstructScheduleFromLogs` capaz de reproduzir fielmente o estado do modelo a partir do log imutável de revisões anteriores.

---

## 3. MAPEAMENTO FORMATIVO PEDAGÓGICO $\to$ FSRS RATING

O mapeamento entre a rubrica multidimensional e as notas do FSRS-7 segue regras pedagógicas estritas (`mapPedagogicalEvaluationToFsrsRating`):

| Nota FSRS | Rótulo Pedagógico | Critérios da Avaliação Formativa | Ação no FSRS-7 |
| :--- | :--- | :--- | :--- |
| **Again (1)** | Falha Grave / Equívoco | Ruptura causal severa, contradição factual relevante ou identificação de concepção alternativa equivocada material. | Reseta estabilidade do conceito, incrementa contador de lapsos (`totalLapses`) e reinicia o ciclo de consolidação. |
| **Hard (2)** | Recuperação Trabalhosa / Com Dica | Recuperação lenta, incompleta ou com imprecisões parciais; **OU** utilização de dica pedagógica durante a tentativa de evocação. | Incrementa estabilidade com taxa reduzida; reconhece o esforço cognitivo sem premiar assistência externa. |
| **Good (3)** | Recuperação Autônoma Adequada | Explicação autônoma (sem dica), precisa e coerente do mecanismo causal principal, atingindo nível Compreender ou Aplicar. | Expande o intervalo de acordo com a curva de esquecimento padrão ($R = 0.90$). |
| **Easy (4)** | Recuperação Espontânea & Fluida | Recuperação fluida, articulada e sem esforço perceptível, com conexão a múltiplos contextos ou demonstração de nível Transferir. | Concede expansão acelerada de intervalo de revisão. |

---

## 4. PERSISTÊNCIA E EVOLUÇÃO DO ESQUEMA (INDEXEDDB V3)

A persistência foi estendida de forma segura em `src/services/persistence/indexedDb.ts`:

- **Migração Transparente `DB_VERSION = 3`:**
  - Preservação integral das 8 stores preexistentes (`documents`, `document_files`, `analyses`, `study_notes`, `chat_sessions`, `learning_attempts`, `concept_mastery`, `crear_sessions`).
  - Criação da store `review_schedules` com chave primária composta `${documentId}#${conceptId}`.
  - Índices secundários: `'by-document'`, `'by-concept'`, `'by-due'`.
- **Funções Exportadas:**
  - `saveReviewSchedule(schedule: ConceptReviewSchedule): Promise<void>`
  - `getReviewSchedule(documentId: string, conceptId: string): Promise<ConceptReviewSchedule | undefined>`
  - `getReviewSchedulesByDocument(documentId: string): Promise<ConceptReviewSchedule[]>`
  - `deleteReviewSchedule(documentId: string, conceptId: string): Promise<void>`
- **Exportação e Limpeza:** Integração garantida em `deleteDocumentData` e `exportUserDataAsJson`.

---

## 5. INTERFACE DO USUÁRIO E INTEGRAÇÃO SISTÊMICA

### 1. Fila de Revisão e Modal Central (`SpacedReviewModal.tsx`)
- Acessível diretamente pelo TopBar ("Revisão Espaçada") e pelo Quadro Didático ("Revisar (FSRS)").
- Exibição de contador dinâmico de revisões pendentes (vencidas + para hoje).
- Abas com filtros contextuais: *Todas*, *Atrasadas*, *Para Hoje*, *Próximas* e *Sem Agendamento*.
- Formulário de revisão com evocação ativa: desafio gerado por IA em PT-BR, opção de dica pedagógica monitorada, seletor de confiança prévia e submissão formativa.
- Card pós-revisão exibindo a nota FSRS calibrada, próximo intervalo em dias, estabilidade, nível cognitivo e diagnóstico detalhado dos elos causais recuperados.

### 2. Painel Longitudinal de Memória (`LongitudinalReviewDashboard.tsx`)
- Cartões com métricas sintéticas: Conceitos Acompanhados, Total de Sessões Realizadas, Taxa de Acertos e Recuperabilidade Média Estimada ($R$).
- Barra de distribuição visual de notas FSRS (Again, Hard, Good, Easy) com proporções percentuais.
- Banner explicativo de governança epistemológica enfatizando a separação entre estimativa estatística e domínio cognitivo consolidado.
- Tabela detalhada de acompanhamento conceito a conceito, com próxima data, estabilidade em dias ($S$), dificuldade ($D$), retenção estimada ($R$) e estado de domínio.

### 3. Integração com o Ciclo C.R.E.A.R. (`CrearRecoverView.tsx`)
- No Estágio 5 (Recuperar), ao concluir a evocação ativa, a celebração oferece o botão *"Agendar no Plano de Revisão Espaçada (FSRS-7)"*, integrando organicamente o aprendizado inicial ao acompanhamento longitudinal.

---

## 6. SUÍTE DE TESTES E HOMOLOGAÇÃO TÉCNICA

A nova suíte de testes `src/tests/phase2_spaced_repetition.test.ts` implementou **13 cenários exaustivos** (T225 a T237), elevando o total de testes automatizados do projeto de 30 para **43 testes**, todos aprovados com 100% de sucesso.

### Resumo da Execução dos Testes (`npm test`):
```text
✔ T01 & T05: Catálogo de demonstração possui evidências estritas e multirrreferências reais (0.95ms)
✔ T06: Relações conceituais mantêm integridade epistemológica sem alucinação de dados (0.19ms)
✔ T07: Grafo de dependências conceituais e pré-requisitos (DAG) (0.14ms)
✔ T08: Isolamento estrito dos materiais de demonstração (0.13ms)
✔ T11: Resiliência passiva e Circuit Breaker do AIServiceHealth (0.79ms)
✔ Regressão P0: Buffer nunca fica destacado após conversão Base64 e cópias defensivas (0.23ms)
✔ T201 a T208: Rubrica Multidimensional, IndexedDB v2, Circuit Breaker, Governança PT-BR (3.9ms)
✔ T209 a T218: Motor de Domínio Cognitivo, Diagnósticos e Auditorias de Lacunas/Mastered (6.2ms)
✔ T219 a T224: Ciclo Pedagógico C.R.E.A.R., Persistência de Estágios e Transições (1.8ms)
✔ T225: Primeiro agendamento de um conceito no FSRS-7 com retenção 90% (6.29ms)
✔ T226: Avaliação Again — falha de recuperação gera rating 1 e reseta estabilidade (5.97ms)
✔ T227: Avaliação Hard — recuperação trabalhosa ou com dica pedagógica (0.83ms)
✔ T228: Avaliação Good — recuperação autônoma e precisa com expansão de intervalo (1.06ms)
✔ T229: Avaliação Easy — recuperação espontânea com transferência e maior intervalo (1.52ms)
✔ T230: Progressão de intervalos ao longo de múltiplas revisões espaçadas (1.98ms)
✔ T231: Revisão antecipada — FSRS-7 processa sem erros e ajusta com elapsedDays reduzido (1.19ms)
✔ T232: Revisão atrasada — modelo recalcula estabilidade considerando retenção prolongada (0.95ms)
✔ T233: Reconstrução determinística do estado FSRS-7 a partir dos logs de revisão (1.71ms)
✔ T234: Isolamento absoluto entre documentos e conceitos nos agendamentos FSRS (0.52ms)
✔ T235: Separação epistemológica — baixa retrievability ou atraso NÃO alteram estado mastered (1.03ms)
✔ T236: Cálculo do resumo longitudinal e formatação contextual de prazos em PT-BR (0.89ms)
✔ T237: Auditoria da Migração IndexedDB v2 -> v3 (Preservação das 8 Stores e Criação de review_schedules) (0.27ms)

Total: 43 testes executados | 43 aprovados | 0 falhas | Duração: 314ms
```

### Validações de Tipagem e Compilação:
- **`npm run lint` (`tsc --noEmit`):** 0 erros de tipagem estrita TypeScript.
- **`npm run build`:** Sucesso total. Bundle de produção gerado com otimização em 502ms.

---

## 7. CATÁLOGO DE EVIDÊNCIAS VISUAIS HOMOLOGADAS

As evidências visuais foram capturadas em navegador real (Google Chrome Headless via Chrome DevTools Protocol) executando a aplicação conectada aos serviços locais:

1. **`docs/evidencias/evidencia_fsrs_fila_revisao.png`**
   *Descrição:* Visualização da Fila de Recuperação Espaçada exibindo os conceitos acadêmicos com seus respectivos estados pedagógicos, níveis de importância, filtros de agendamento e identificador FSRS-7.
2. **`docs/evidencias/evidencia_fsrs_sessao_revisao.png`**
   *Descrição:* Sessão de evocação ativa do estudante concluída com avaliação do Gemini. Exibe a classificação calibrada `GOOD`, o próximo intervalo agendado de `4.8 dias`, a estabilidade recalculada de `3.92 dias`, o nível cognitivo e a discriminação dos 6 elos causais recuperados com sucesso.
3. **`docs/evidencias/evidencia_fsrs_painel_longitudinal.png`**
   *Descrição:* Painel Longitudinal de Memória exibindo as métricas consolidadas após a realização da revisão (100% de taxa de recuperação), barra de distribuição de ratings do FSRS-7, aviso de diferenciação epistemológica estrita e tabela detalhada de acompanhamento por conceito.

---

## 8. DIRETRIZES DE GOVERNANÇA GIT E PRÓXIMOS PASSOS

- **Status do Repositório:** Apenas alterações do Marco 2D no diretório de trabalho da branch `feature/fase2-aprendizagem-cognitiva`.
- **Integridade da Workspace Original:** O repositório em `/home/anunnaki/Downloads/Pos_Neurociencias_Comportamento/neuroClassAI` permanece **100% intocado e íntegro**.
- **Isolamento de Branches:** **Nenhum** commit, push ou mesclagem na branch `main` foi executado sem a autorização prévia e expressa do usuário.
- **Próximo Passo:** Solicitação de autorização formal para execução do commit de homologação do Marco 2D.
