# NeuroClass AI

Plataforma educacional multimodal de alto rigor científico e tutoria cognitiva, fundamentada no método pedagógico **C.R.E.A.R.** (Contextualizar, Relacionar, Explicar, Aplicar e Recuperar) e em princípios de aprendizagem e neurociência.

O NeuroClass AI transcende a função de um leitor de PDFs ou chatbot convencional. Trata-se de um ambiente integrado para estudo profundo, mapeamento epistemológico de conceitos, visualização de redes conceituais e grafos acíclicos de pré-requisitos (DAG), caderno de estudos contextualizado e tutoria socrática.

---

## 1. Arquitetura do Sistema

A plataforma opera em arquitetura full-stack integrada (TypeScript):

- **Frontend:** React 19, Vite 8, Tailwind CSS 4, Motion, Lucide Icons, PDF.js (`pdfjs-dist@4.10.38`), IDB (`idb@8`).
  - **Quadro Didático (SVG):** Visualização concêntrica com alternância entre Rede Conceitual e DAG de Pré-requisitos.
  - **Tutor Cognitivo:** Assistente socrático contextualizado com enriquecimento pedagógico (analogias, exemplos aplicados, perguntas formativas).
  - **Caderno de Estudos:** Anotações sincronizadas com trechos literais e páginas de documentos.
  - **Persistência Local (IndexedDB):** Stores dedicadas (`documents`, `analyses`, `notes`, `chat_sessions`, `file_blobs`) com cálculo pré-transacional de cota e exportação JSON.
  - **Resiliência de Cliente:** Padrão *Circuit Breaker* (`AIServiceHealth`) com backoff exponencial e proteção contra sobrecarga de cota.
- **Backend:** Node.js, Express 4, `@google/genai` (SDK oficial).
  - Intermediação segura de todas as chamadas de IA.
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

- **Suíte de Testes Unitários:**
  ```bash
  npm test
  ```
  Executa a suíte de testes de integridade e regressão via runner nativo do Node.js (`src/tests/phase1.test.ts`).

- **Limpeza de Artefatos Compilados:**
  ```bash
  npm run clean
  ```
  Remove os diretórios e arquivos de compilação temporários (`dist/`, `server.js`).

---

## 6. Documentação Técnica Homologada

- [Relatório de Homologação da Fase 1 (06/11/2026)](docs/Relatorio_Fase1_NeuroClass_AI_2026-11-06.md)
- [Especificação Arquitetural e Grafo Epistemológico (v2.2)](docs/fase1_implementation_plan_revisado2.md)
