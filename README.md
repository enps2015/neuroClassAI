# NeuroClass AI

Plataforma educacional multimodal de alto rigor científico e tutoria cognitiva, fundamentada no método pedagógico **C.R.E.A.R.** (Contextualizar, Relacionar, Explicar, Aplicar e Recuperar) e em princípios de aprendizagem e neurociência.

O NeuroClass AI transcende a função de um leitor de PDFs ou chatbot convencional. Trata-se de um ambiente integrado para estudo profundo, mapeamento epistemológico de conceitos, visualização de redes conceituais e grafos acíclicos de pré-requisitos (DAG), caderno de estudos contextualizado e tutoria socrática.

---

## 1. Arquitetura do Sistema

A plataforma opera em arquitetura full-stack integrada (TypeScript):

- **Frontend:** React 19, Vite 8, Tailwind CSS 4, Motion, Lucide Icons, PDF.js (`pdfjs-dist@4.10.38`), IDB (`idb@8`).
  - **Quadro Didático (SVG):** Visualização concêntrica com alternância entre Rede Conceitual e DAG de Pré-requisitos.
  - **Tutor Cognitivo com Voz Multimodal:** Assistente socrático contextualizado com diálogo bidirecional por texto e voz (STT contínuo, fallback de gravação via MediaRecorder e transcrição Gemini, VU meter de headset, síntese TTS a 1.15x com seletor de velocidade e sanitização estrita de Markdown/LaTeX/emojis).
  - **Caderno de Estudos:** Anotações sincronizadas com trechos literais e páginas de documentos.
  - **Persistência Local (IndexedDB):** Stores dedicadas (`documents`, `analyses`, `notes`, `chat_sessions`, `file_blobs`) com cálculo pré-transacional de cota e exportação JSON.
  - **Resiliência de Cliente:** Padrão *Circuit Breaker* (`AIServiceHealth`) com backoff exponencial e proteção contra sobrecarga de cota.
- **Backend:** Node.js, Express 4, `@google/genai` (SDK oficial).
  - Intermediação segura de todas as chamadas de IA (BYOK-only em produção).
  - Proxy streaming de síntese de voz `/api/voice/tts` (Google Cloud Neural2 + fallback universal sem dependências externas) e endpoint multimodal `/api/voice/transcribe`.
  - Failover automático multi-modelo: `gemini-3.8-flash` (primário) ➔ `gemini-3.5-flash` ➔ `gemini-3.1-flash-lite`.
  - Servidor dedicado para o worker do PDF.js com cabeçalho estrito de JavaScript (`application/javascript`).
  - Suporte a payload multimodal ampliado para documentos extensos (300+ páginas).

---

## 2. Requisitos de Ambiente

- **Node.js:** Versão `>= 20.19.0` (homologado na `v24.19.0`).
- **npm:** Versão `>= 10.x` (homologado na `11.17.0`). **O `npm` é o único gerenciador de pacotes oficial do projeto.**
- **Navegador:** Suporte a IndexedDB, Web Workers e ES2022.

---

## 3. Instalação Local

1. Clone o repositório e acerte o diretório:
   ```bash
   git clone https://github.com/enps2015/neuroClassAI.git
   cd neuroClassAI
   ```

2. Instale as dependências exclusivamente via **npm**:
   ```bash
   npm install
   ```
   > [!NOTE]
   > O arquivo `package-lock.json` é a única fonte canônica de resolução determinística de dependências do repositório.

---

## 4. Configuração Segura da Gemini API

A chave de acesso à API do Gemini deve permanecer **exclusivamente no ambiente local do backend** e nunca ser exposta ao cliente web ou comitada no Git.

1. Crie o arquivo `.env` na raiz do projeto a partir do exemplo fornecido:
   ```bash
   cp .env.example .env
   ```

2. Defina sua chave no `.env`:
   ```env
   GEMINI_API_KEY="sua_chave_aqui"
   ```

> [!NOTE]
> O arquivo `.env` é estritamente ignorado pelo `.gitignore`. Caso a chave não esteja configurada, o servidor operará em modo de demonstração local, permitindo o uso completo do catálogo de materiais pré-carregados (`DEMO_MATERIALS`).

---

## 5. Comandos de Execução e Testes

- **Ambiente de Desenvolvimento:**
  ```bash
  npm run dev
  ```
  Inicia o backend Express com o Vite em modo middleware na porta `3000` (`http://localhost:3000`).

- **Checagem de Tipos TypeScript (Lint):**
  ```bash
  npm run lint
  ```
  Executa `tsc --noEmit` para validação estática estrita.

- **Build de Produção (Frontend SPA + Backend Node.js):**
  ```bash
  npm run build
  ```
  Compila o bundle frontend via Vite em `dist/` e transpila o servidor backend via esbuild em `server.js` (ESM / Node 22).

- **Inicialização em Produção:**
  ```bash
  npm start
  ```
  Inicia o servidor de produção compilado (`node server.js`), servindo os arquivos estáticos de `dist/` e os endpoints de API.

- **Suíte de Testes Automatizados:**
  ```bash
  npm test
  ```
  Executa a suíte de testes de integridade, regressão, BYOK e onboarding via runner nativo do Node.js (`src/tests/*.test.ts`).

- **Limpeza de Artefatos Compilados:**
  ```bash
  npm run clean
  ```
  Remove os diretórios e arquivos de compilação temporários (`dist/`, `server.js`).

---

## 6. Documentação Técnica Homologada

- **[Dossier Técnico Completo e Handoff do Projeto](docs/NEUROCLASS_AI_PROJECT_DOSSIER.md)** *(Documento canônico consolidado com arquitetura, auditoria, experimento real Tier 2 e roadmap técnico)*
- [Índice Geral de Documentação Técnica](docs/README.md)
- [Índice de Relatórios Técnicos e Homologações](docs/relatorios/README.md)
- [Relatório de Homologação da Fase 1 (06/11/2026)](docs/relatorios/Relatorio_Fase1_NeuroClass_AI_2026-11-06.md)
- [Relatório de Segurança e Homologação da Fase 2 (BYOK-Only)](docs/relatorios/relatorio_bloqueio_modo_administrado_producao.md)
- [Relatório de Homologação: Interação por Voz, Acessibilidade e Tutoria Ativa](docs/relatorios/relatorio_homologacao_interacao_voz_e_acessibilidade.md)
- [Especificação Arquitetural e Grafo Epistemológico (v2.2)](docs/planos/fase1_implementation_plan_revisado2.md)
- [Catálogo de Evidências Visuais da Jornada](docs/evidencias/README.md)

### Status do Projeto (Novembro/2026)
- **Fase 1 (Preservação e Grafo Epistemológico):** 100% homologada e estável em produção.
- **Fase 2 (Aprendizagem Cognitiva & Metacognição C.R.E.A.R.):** Funcional e integrada com BYOK em modo de desenvolvimento.
- **Tier 1 (Grounding Determinístico):** Em produção com verificação exata de citações e tolerância zero a fabricações.
- **Tier 2 (Avaliador Semântico com IA):** Protótipo experimental validado contra Golden Dataset com IA real (`gemini-3.5-flash-lite`), demonstrando 100% de segurança contra alucinações (zero falsos positivos). Detalhes no [Dossier Técnico](docs/NEUROCLASS_AI_PROJECT_DOSSIER.md).
