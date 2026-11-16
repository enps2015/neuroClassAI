# AUDITORIA DE CONFORMIDADE COM O PLANO ORIGINAL
## NEUROCLASS AI — REVISÃO E MATRIZ DE RASTREABILIDADE TÉCNICA

**Data de Realização:** 08 de Novembro de 2026
**Ambiente:** Google Antigravity IDE | Workspace: `neuroClassAI-work`
**Branch de Trabalho:** `feature/fase2-aprendizagem-cognitiva`
**Objetivo:** Confrontar o planejamento técnico original (Fase 1 v1, v2, v2.2 e Fase 2 Marcos 2A–2D) com a implementação real do repositório, identificando o grau de conformidade de cada requisito, as lacunas técnicas existentes e o plano de priorização.

---

## 1. Sumário Executivo da Auditoria

O NeuroClass AI teve suas bases definidas em novembro de 2026, com foco em estudo ativo, rigor documental epistemológico e tutoria cognitiva fundamentada no método C.R.E.A.R. e na psicologia cognitiva da aprendizagem.

Ao longo do desenvolvimento, a arquitetura evoluiu através de 4 grandes marcos da Fase 2:
- **Marco 2A:** Módulo *Agora Eu Explico* (Método Feynman estruturado com rubrica multidimensional de 5 eixos).
- **Marco 2B:** Motor de Domínio Cognitivo (*Mastery Engine* com governança rigorosa de evidências acumuladas, sessões espaçadas e resolução de lacunas).
- **Marco 2C:** Ciclo de Aprendizagem C.R.E.A.R. integrado (*Contextualizar, Relacionar, Explicar, Aplicar, Recuperar*).
- **Marco 2D:** Motor de Recuperação Espaçada FSRS-7 e Memória Longitudinal.
- **Camada de Onboarding e Ajuda:** Telas de boas-vindas, tour guiado, glossário de 12 termos, transparência de IA e Factory Reset local.

A presente auditoria inspecionou exaustivamente todos os contratos de dados (`src/types/index.ts`), serviços de aprendizagem (`src/services/learning/`), persistência (`src/services/persistence/indexedDb.ts`), adaptadores de IA (`server.ts`, `src/services/ai/`), componentes de interface e 59 testes automatizados aprovados.

---

## 2. Matriz Geral de Conformidade (22 Áreas do Planejamento Original)

A tabela abaixo classifica cada requisito canônico em um dos quatro estados formais:
1. **IMPLEMENTADO E VALIDADO**: Funcionalidade em operação com contratos de dados, interface e testes automatizados.
2. **IMPLEMENTADO PARCIALMENTE**: Funcionalidade em operação, com escopo restrito ou dependência de expansão identificada.
3. **PLANEJADO, MAS NÃO IMPLEMENTADO**: Previsto no planejamento conceitual ou postergado para fases futuras.
4. **NÃO APLICÁVEL OU SUBSTITUÍDO POR DECISÃO APROVADA**: Requisito modificado formalmente por diretriz de arquitetura.

| # | Área Requisitada | Classificação | Evidência Técnica no Repositório |
|---|---|---|---|
| 1 | **Processamento Documental Multimodal** | IMPLEMENTADO E VALIDADO | Envio de PDF em Base64 para Gemini API (`server.ts:155`), extração textual com `pdfjs-dist@4.10.38`. Teste T001–T006. |
| 2 | **PDFs Digitalizados (OCR)** | IMPLEMENTADO PARCIALMENTE | O Gemini Vision multimodal lê PDFs escaneados via Base64 nativamente. Não há motor local de OCR (ex: Tesseract.js) no navegador. |
| 3 | **Figuras, Tabelas, Fórmulas e Gráficos** | IMPLEMENTADO E VALIDADO | Contratos polimórficos (`FigureEvidence`, `TableEvidence`), KaTeX para fórmulas, detecção de elementos visuais no parser. |
| 4 | **Documentos Extensos e Segmentação** | IMPLEMENTADO E VALIDADO | Suporte a 300+ páginas com amostragem representativa distribuída ao longo da obra, outline/TOC inteligente, cópias defensivas contra *detached buffer*. |
| 5 | **Rastreabilidade Epistemológica** | IMPLEMENTADO E VALIDADO | Classificação tripartite (`explicitly_documented`, `synthesized`, `model_inference`), referências à página original e isolamento da confiança algorítmica. |
| 6 | **Grafo de Conceitos e Pré-Requisitos** | IMPLEMENTADO E VALIDADO | Quadro Didático SVG com alternância dual: Rede Conceitual semântica e DAG de Pré-Requisitos em camadas concêntricas. |
| 7 | **Tutor Contextualizado** | IMPLEMENTADO E VALIDADO | Chat socrático contextualizado com o documento e conceito ativo, atalhos pedagógicos (analogias, exemplos práticos, active recall). |
| 8 | **Caderno de Estudos** | IMPLEMENTADO E VALIDADO | Editor de anotações sincronizado com citações literais e armazenado no IndexedDB (`notes` store). |
| 9 | **Backup e Restauração** | IMPLEMENTADO E VALIDADO | Funções `exportUserDataAsJson` e `restoreUserDataFromJson` em `indexedDb.ts` com cobertura de todos os 9 stores v3. |
| 10 | **Isolamento de Demonstrações** | IMPLEMENTADO E VALIDADO | Catálogo estático em `demoMaterials.ts` isolado do IndexedDB pessoal do usuário. Flag `isDemoMaterial: true`. |
| 11 | **Diagnóstico de Pré-Requisitos** | IMPLEMENTADO E VALIDADO | Estados `unassessed`, `confirmed_gap`, `understood`, `mastered`. Perguntas diagnósticas formativas sem falso diagnóstico de desconhecimento. |
| 12 | **Agora Eu Explico (Feynman)** | IMPLEMENTADO E VALIDADO | Rubrica cognitiva com 5 eixos (`conceptualPrecision`, `completeness`, `conceptualRelationships`, `reasoningCoherence`, `knowledgeApplication`). |
| 13 | **Motor de Domínio Cognitivo** | IMPLEMENTADO E VALIDADO | `masteryEngine.ts` com consolidação cumulativa (2 tentativas qualificadoras independentes, sem dicas, espaçamento temporal válido e aplicação prática). |
| 14 | **Ciclo C.R.E.A.R. Completo** | IMPLEMENTADO E VALIDADO | Fluxo integrado de 5 etapas (`crearCycleService.ts`, `CrearCycleModal.tsx`): Contextualizar, Relacionar, Explicar, Aplicar, Recuperar. |
| 15 | **FSRS-7 (Free Spaced Repetition)** | IMPLEMENTADO E VALIDADO | Biblioteca oficial `ts-fsrs@6.0.0`, `DefaultScheduler`, pesos padrão canônicos, retenção alvo 0.90, ratings 1 a 4 mapeados pedagogicamente. |
| 16 | **Memória Longitudinal** | IMPLEMENTADO E VALIDADO | Rastreamento de $S$ (estabilidade), $D$ (dificuldade) e $R(t)$ (retrievability), histórico revlog com todos os campos e dashboard analítico. |
| 17 | **Onboarding e Ajuda Contextual** | IMPLEMENTADO E VALIDADO | Modal de boas-vindas, tour em 6 passos, guia completo com 6 abas, glossário de 12 termos, botões `FeatureHelp` e Factory Reset. |
| 18 | **Biblioteca Multidisciplinar** | IMPLEMENTADO PARCIALMENTE | O repositório possui 2 materiais de teste (*Neurobiologia* e *Física Quântica*). Necessita expansão para 6 grandes áreas do conhecimento. |
| 19 | **Orientação Dinâmica ("Seu Próximo Passo")** | PLANEJADO, MAS NÃO IMPLEMENTADO | O tour atual é estático. Falta o painel sensível ao estado em tempo real da sessão do estudante. |
| 20 | **Interação por Voz (STT / TTS)** | PLANEJADO, MAS NÃO IMPLEMENTADO | Mencionada como visão de Fase 3. Escopo bloqueado nesta missão por diretriz explícita. |
| 21 | **Geração de Recursos Visuais por IA** | PLANEJADO, MAS NÃO IMPLEMENTADO | Mencionada como visão de Fase 3 (diagramas gerados dinamicamente por IA). Escopo bloqueado nesta missão por diretriz explícita. |
| 22 | **Segurança, Privacidade e BYOK** | IMPLEMENTADO PARCIALMENTE | Atualmente depende de `.env` estático no backend. Usuários comuns não possuem interface gráfica para configurar sua própria chave Gemini. |

---

## 3. Análise Detalhada das Lacunas e Priorização

### Lacuna 1: Biblioteca Multidisciplinar (Prioridade: ALTA / Escopo da Missão Atual)
- **O que foi planejado:** Catálogo representativo de diferentes campos científicos para estudantes de graduação e pós-graduação, sem viés exclusivo em neurociências ou tecnologia.
- **O que existe atualmente:** Apenas 2 demonstrações em `src/services/documents/demoMaterials.ts` (Neurobiologia da Sinapse e Física Quântica).
- **O que falta:** Expandir para 6 áreas fundamentais com fontes e referências bibliográficas reais:
  1. *Ciências Biológicas e Saúde* (Fisiologia e Memória)
  2. *Engenharias e Tecnologia* (Redes Neurais e Aprendizado Profundo)
  3. *Ciências Humanas e Filosofia* (Epistemologia e Filosofia da Ciência - Popper & Kuhn)
  4. *Ciências Sociais* (Teoria Sociológica e Ação Social - Weber & Durkheim)
  5. *Administração e Economia* (Tomada de Decisão sob Racionalidade Limitada - Herbert Simon)
  6. *Educação e Psicologia* (Teoria da Carga Cognitiva e Aprendizagem Significativa - Sweller & Ausubel)
- **Dependências técnicas:** `src/types/index.ts`, `demoMaterials.ts`, `DemoModal.tsx`.
- **Esforço estimado:** Médio.
- **Critério de aceitação:** Todas as 6 áreas selecionáveis, com objetivos, conceitos fundamentais e complementares, evidências textuais, DAG de pré-requisitos e total isolamento do IndexedDB.

### Lacuna 2: Orientação Dinâmica e Painel "Seu Próximo Passo" (Prioridade: ALTA / Escopo da Missão Atual)
- **O que foi planejado:** Interface proativa que indica ao estudante qual a melhor ação pedagógica com base no momento exato de seu estudo.
- **O que existe atualmente:** Tour estático de 6 passos no primeiro acesso e botões de ajuda fixos.
- **O que falta:** Componente dinâmico (`DynamicGuidancePanel.tsx` / "Seu Próximo Passo") que avalia em tempo real:
  - Documento não carregado $\to$ Recomendar selecionar da biblioteca ou importar.
  - Documento carregado sem análise $\to$ Recomendar processar o conteúdo.
  - Análise concluída sem conceito focado $\to$ Recomendar explorar o Quadro de Conceitos (Blackboard).
  - Conceito selecionado com estado `unassessed` $\to$ Recomendar iniciar C.R.E.A.R. ou Agora Eu Explico.
  - Ciclo C.R.E.A.R. em andamento $\to$ Recomendar continuar no estágio pendente (Explicar, Aplicar, Recuperar).
  - Ciclo concluído $\to$ Recomendar conferir o nível de domínio e a evolução.
  - Conceito com revisão FSRS-7 vencida hoje $\to$ Recomendar iniciar sessão de recuperação ativa imediata.
- **Dependências técnicas:** Estados de `App.tsx`, `activeDocument`, `analysis`, `selectedConcept`, `masteryMap`, `reviewDueCount`.
- **Esforço estimado:** Médio.
- **Critério de aceitação:** O painel atualiza automaticamente suas recomendações conforme o estudante avança, sem bloqueios de tela e com opção de dispensar/minimizar.

### Lacuna 3: Configuração Amigável da Gemini API (BYOK) (Prioridade: ALTA / Escopo da Missão Atual)
- **O que foi planejado:** Eliminar a necessidade de usuários comuns editarem arquivos `.env`, abrirem terminais ou instalarem ferramentas de linha de comando.
- **O que existe atualmente:** O backend Node.js (`server.ts`) lê exclusivamente `process.env.GEMINI_API_KEY`. Se a variável não estiver preenchida, o sistema opera apenas com materiais de demonstração.
- **O que falta:**
  - Interface gráfica amigável: **Configurações → Inteligência Artificial → Conectar Gemini**.
  - Campo protegido com toggle de visibilidade e botão "Validar Conexão".
  - Endpoint de validação de baixa latência e consumo mínimo (`/api/gemini/validate-key`).
  - Intermediação segura: a chave informada pelo usuário reside **EXCLUSIVAMENTE NA MEMÓRIA DA SESSÃO DO NAVEGADOR** e é encaminhada via HTTPS no cabeçalho seguro `x-gemini-api-key` para o Express.
  - Zero persistência no navegador: **NUNCA** gravar em `localStorage`, `IndexedDB` ou cookies.
  - Zero exposição em logs do backend e mensagens de erro sanitizadas.
  - Tutorial passo a passo atualizado para a interface oficial do Google AI Studio (`https://aistudio.google.com/api-keys`).
- **Dependências técnicas:** `server.ts`, `aiClient.ts`, `TopBar.tsx`, novo modal `ApiKeyConfigModal.tsx`, gerenciador em memória `aiKeyManager.ts`.
- **Esforço estimado:** Alto.
- **Critério de aceitação:** O estudante consegue inserir a chave na interface, validá-la em 1 clique, executar análises e tutorias normalmente, e removê-la a qualquer momento, sem que a chave seja salva em disco ou vazada em logs.

### Lacuna 4: Interação por Voz e Recursos Multimodais Gerativos (Prioridade: BAIXA / Fase 3)
- **O que foi planejado:** Entrada de explicação via áudio (Whisper/Web Speech API) e sintetização de voz do tutor, além de diagramas dinâmicos gerados por IA.
- **O que existe atualmente:** Entrada e tutoria textuais completas; renderização de grafos vetoriais determinísticos em SVG.
- **Diretriz de Governança:** Expressamente suspensa nesta missão por determinação da especificação ("Não iniciar implementação de voz ou geração de imagens nesta missão"). Agendada para a Fase 3.

---

## 4. Plano de Execução Imediata

1. **Etapa 2 — Biblioteca Multidisciplinar:** Modelar e incorporar os 6 materiais em `src/services/documents/demoMaterials.ts` e refinar o `DemoModal.tsx`.
2. **Etapa 3 — Onboarding Inteligente & Orientação Dinâmica:** Implementar o painel "Seu Próximo Passo" e a régua de jornada `Documento → Conceitos → C.R.E.A.R. → Revisões → Evolução`.
3. **Etapa 4 — Configuração BYOK & Backend Seguro:** Implementar o gerenciador de chaves em memória, a rota de validação do Express e a modal de conexão da Gemini API.
4. **Etapa 5 — Verificação Rigorosa & Testes:** Suíte de testes automatizados, `npm test`, `npm run lint`, `npm run build` e capturas visuais.
