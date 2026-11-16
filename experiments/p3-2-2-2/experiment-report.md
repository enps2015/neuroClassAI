# RELATÓRIO DO EXPERIMENTO CONTROLADO P3.2.2.2
## AVALIAÇÃO DE FUNDAMENTAÇÃO SEMÂNTICA COM MODELO REAL (TIER 2)

**Identificador do Experimento:** `EXP-P3-2-2-2-GEMINI-REAL`  
**Data:** 16 de novembro de 2026 (13:59 UTC / 10:59 BRT)  
**Modelo Alvo:** `gemini-3.5-flash-lite`  
**SDK:** `@google/genai@2.4.0`  
**Modalidade:** Chamada real sequencial independente via credencial BYOK local  
**Veredito Pré-Definido:** **INCONCLUSIVO**  

---

## 1. Origem e Versão do Golden Dataset

O Golden Dataset foi extraído integralmente do catálogo de calibração canônica projetado na Missão **P3.2.2.0** (documentado no relatório arquitetural `relatorio_arquitetura_p3_2_2_0_avaliacao_semantica_tier2.md`, Seção 8).

- **Versão do Dataset:** `1.0.0`
- **Total de Cenários:** 21 casos canônicos
- **Distribuição de Classes no Gabarito:**
  - `SUPPORTED`: 3 casos (GD-01, GD-09, GD-16)
  - `PARTIALLY_SUPPORTED`: 2 casos (GD-02, GD-14)
  - `NOT_SUPPORTED`: 7 casos (GD-03, GD-04, GD-05, GD-06, GD-13, GD-15, GD-17)
  - `CONTRADICTED`: 6 casos (GD-07, GD-08, GD-10, GD-18, GD-19, GD-20)
  - `INSUFFICIENT_EVIDENCE`: 3 casos (GD-11, GD-12, GD-21)
- **Separação Rígida de Dados e Gabarito:**
  - `dataset.json` (SHA-256: `4620ef00e7e052c53f982aebc718ff5a8afba5f5cef003fc955000f12be83762`): Contém exclusivamente as afirmações, evidências e tags citadas. Zero gabarito ou rótulos esperados presentes.
  - `gold-labels.json` (SHA-256: `03e69a0d896e08b3e1bfd51b5141921c4fa2422c62e242bceb59396ae65f7124`): Gabarito congelado e independente mantido isolado do harness de avaliação até a fase de cálculo de métricas.

---

## 2. Configuração de Execução e Preflight

- **Arquivo de Configuração:** `experiments/p3-2-2-2/experiment-config.json`
- **Estratégia de Chamadas:** Execução sequencial de chamada única por cenário, sem agrupamento, sem histórico de chat e sem retries automáticos.
- **Prompt:** Função de produção `buildSemanticAuditPrompt` de `src/services/ai/semanticGroundingEvaluator.ts` com dados estruturados delimitados em `<untrusted_document_data>` via serialização segura JSON.
- **Saída Estruturada:** `responseMimeType: 'application/json'` com schema estrito obtido por `getSemanticEvaluationSchema()`.
- **Preflight da Credencial:** Detectada variável `GEMINI_API_KEY` configurada no ambiente local com comprimento de 53 caracteres.

---

## 3. Execução e Interrupção de Segurança (Fail-Fast)

Na execução do primeiro cenário (`GD-01-PARAPHRASE-OK`), a API do Google Generative Language retornou uma falha de autenticação:

- **Chamada:** `[1/21] GD-01-PARAPHRASE-OK`
- **Latência:** 411 ms
- **Status HTTP:** `401 UNAUTHENTICATED`
- **Código de Erro:** `UNAUTHENTICATED` / `ACCESS_TOKEN_TYPE_UNSUPPORTED`
- **Mensagem da API:** `"API key not valid. Please pass a valid API key."`
- **Detalhes Técnicos:** `reason: ACCESS_TOKEN_TYPE_UNSUPPORTED`, `method: google.ai.generativelanguage.v1beta.GenerativeService.GenerateContent`.

### Aplicação Estrita da Regra de Governança
Em estrito cumprimento à diretriz da Seção 4 do mandato:
> *"Se ocorrer HTTP 401 ou 403, interromper o experimento."*

O harness interrompeu o lote de execução imediatamente após a primeira chamada, prevenindo tentativas espúrias, desperdício de tempo e vazamento de requisições mal-sucedidas.

---

## 4. Análise da Causa Raiz da Falha de Autenticação

A credencial presente no arquivo `.env` do workspace possui o prefixo `AQ.A...` (comprimento 53 caracteres).  
O endpoint `generativelanguage.googleapis.com` da biblioteca `@google/genai` espera uma chave de API pública do Google AI Studio (formato `AIzaSy...`). Chaves iniciadas por `AQ.` são identificadas pelo serviço como tokens de outro tipo/escopo e rejeitadas com `ACCESS_TOKEN_TYPE_UNSUPPORTED`.

Conforme a Regra 7 de Governança:
> *"Não alterar `.env`, configurações existentes ou credenciais. Nunca modificar `.env`."*

O agente não alterou nem substituiu o arquivo `.env`.

---

## 5. Métricas e Resultados do Experimento

- **Total de Chamadas Executadas:** 1 (dentro do limite máximo de 21)
- **Chamadas com Sucesso:** 0
- **Falhas Técnicas:** 1 (HTTP 401)
- **Taxa de Resposta JSON Válida:** 0.0%
- **Tokens de Entrada:** 0
- **Tokens de Saída:** 0
- **Custo Efetivo:** $0.00000 USD
- **Acurácia Factual:** Não mensurável nesta sessão
- **Macro-F1:** 0.000

---

## 6. Veredito e Interpretação

Conforme os critérios de decisão pré-definidos na Seção 10 e registrados no `experiment-config.json`:
- Critério para **INCONCLUSIVO:** *"Falhas Técnicas >= 4 OU Ambiguidade Crítica em >= 5 cenários OU Amostra Inadequada (< 18 casos concluídos)"*.

Como apenas 1 caso foi executado devido à interrupção obrigatória por HTTP 401, o resultado oficial do experimento é:

### **VEREDITO: INCONCLUSIVO**

---

## 7. Próximos Passos Recomendados

1. O estudante/usuário deverá inserir uma chave de API válida do Google AI Studio (iniciada por `AIzaSy...`) através da interface gráfica de configurações BYOK do NeuroClass AI ou no arquivo `.env` local.
2. Com a chave válida inserida, o harness experimental `experiments/p3-2-2-2/run_experiment.ts` poderá ser reexecutado com 1 único comando para avaliar os 21 cenários canônicos de ponta a ponta.

