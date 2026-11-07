# Diretrizes Permanentes de Engenharia — NeuroClass AI

Este documento estabelece as regras obrigatórias de engenharia, governança e conduta técnica para agentes de IA e desenvolvedores que atuam no repositório NeuroClass AI.

---

## 1. Preservação da Fase 1 (Núcleo Educacional)
- A Fase 1 encontra-se 100% homologada e estável.
- Nenhuma funcionalidade existente (extração de PDF, proteção contra *detached ArrayBuffer*, persistência IndexedDB, SVG concêntrico do Quadro Didático, telemetria e fallback multi-modelo Gemini) deve ser refatorada ou reescrita sem identificação e justificativa expressa de necessidade real.
- O catálogo de demonstração (`DEMO_MATERIALS`) deve permanecer estritamente isolado da camada de armazenamento do usuário.

## 2. Desenvolvimento Incremental
- O desenvolvimento da Fase 2 (Aprendizagem Cognitiva e Avaliação) e etapas subsequentes deve ocorrer de forma modular, incremental e rastreável.
- Cada nova funcionalidade deve ser precedida de especificação técnica e de contratos de dados em TypeScript antes da codificação.
- Não introduza dependências externas sem avaliar rigorosamente a compatibilidade com a árvore atual do `npm`.

## 3. Segurança e Proteção de Segredos
- A chave da aplicação (`GEMINI_API_KEY`) reside **exclusivamente no ambiente local do backend** e jamais deve ser transmitida para o navegador do cliente.
- Nunca solicite que o usuário cole a chave de API em canais de chat.
- Nunca registre credenciais, tokens ou dados pessoais em arquivos de código, logs, relatórios, commits ou issues do Git.
- Mantenha `.env` e arquivos sensíveis permanentemente protegidos pelo `.gitignore`.

## 4. Testes e Rigor Epistemológico
- Toda alteração deve ser validada por testes automatizados antes de ser considerada concluída.
- A suíte de regressão (`npm test`) e a checagem de tipos estáticos (`npm run lint`) devem ser mantidas com 100% de aprovação (zero falhas e zero erros de compilação).
- Rigor epistemológico: em nenhuma hipótese apresente métricas algorítmicas de confiança de modelos (`internalModelConfidence`) como se fossem prova científica ou verdade documental comprovada. Mantenha a distinção tripartite de evidências (`explicitly_documented`, `synthesized`, `model_inference`).

## 5. Governança do Git
- A branch `main` deve permanecer estável em todos os momentos.
- Novos desenvolvimentos devem ocorrer em branches temáticas específicas (`feat/*`, `chore/*`, `fix/*`).
- Não faça commits ou pushes sem autorização explícita do proprietário do repositório.
- Mantenha commits atômicos, descritivos e com mensagens padronizadas.

## 6. Proibição Estrita de Ações Destrutivas
- É terminantemente proibido executar comandos destrutivos sem aprovação expressa:
  - `git reset --hard`
  - `git clean -fd`
  - `git push --force`
  - Descarte não rastreado de alterações locais ou remoção arbitrária de dependências.
- Diante de incertezas ou divergências entre ambientes, pare, diagnostique e consulte o proprietário.
