# Checklist e Diretrizes de Preparação para Deploy em Produção — NeuroClass AI

**Documento:** `docs/checklist_preparacao_deploy.md`
**Projeto:** NeuroClass AI (`github.com/enps2015/neuroClassAI`)
**Data:** 08 de Novembro de 2026
**Status:** Homologado para Produção / Distribuição Acadêmica

---

## 1. Visão Geral da Arquitetura de Implantação

O NeuroClass AI é uma plataforma híbrida composta por:
1. **Frontend SPA (Single Page Application):** React 19 + TypeScript + Vite + Tailwind CSS.
2. **Backend de Orquestração e Proxy:** Node.js 22 + Express + Google GenAI SDK (`@google/genai`).
3. **Persistência Local do Estudante:** IndexedDB (`idb`) no navegador do cliente (Zero Telemetria externa).
4. **Camada de Inteligência Artificial:** Google Gemini 2.5/3.x com suporte duplo:
   - **BYOK (*Bring Your Own Key*):** Chave do estudante em memória volátil de sessão.
   - **Managed (*Chave Institucional*):** Chave corporativa injetada no backend via variáveis de ambiente seguras.

---

## 2. Checklist de Segurança e Infraestrutura para Produção

### 2.1. HTTPS Obrigatório e TLS 1.3
- [x] **Comunicação Criptografada Ponto a Ponto:** Nenhuma requisição contendo chaves de API (`x-gemini-api-key`) ou documentos acadêmicos pode trafegar em HTTP plano.
- [x] **HSTS (*HTTP Strict Transport Security*):** Cabeçalho `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` ativado no proxy reverso (Nginx/Cloudflare/Caddy).
- [x] **Redirecionamento Automático:** Todo tráfego da porta 80 redirecionado para a porta 443.

### 2.2. Variáveis de Ambiente e Configuração de Backend
O backend Node.js consome estritamente variáveis de ambiente padronizadas. Nenhuma chave ou segredo reside no código-fonte versionado.

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Sim | `production` | Modo de execução do Express/Node.js |
| `PORT` | Sim | `3000` | Porta TCP do serviço HTTP |
| `GEMINI_API_KEY` | Não | *(vazio)* | Chave Gemini administrada (caso não utilize BYOK) |
| `ALLOWED_ORIGINS` | Não | `*` | Origens autorizadas para CORS em produção |
| `RATE_LIMIT_MAX` | Não | `100` | Limite máximo de requisições por janela de IP |
| `RATE_LIMIT_WINDOW_MS`| Não | `60000` | Janela de rate limiting em milissegundos |

### 2.3. Segurança de Credenciais: BYOK vs Modo Administrado
- [x] **Isolamento de Memória BYOK:** No modelo BYOK, a chave pessoal do estudante (`AIza...`) reside exclusivamente em variável volátil de módulo JavaScript (`aiKeyManager.ts`). Jamais é gravada em `localStorage`, `IndexedDB`, `sessionStorage` ou `cookies`.
- [x] **Não Persistência no Backend:** O servidor Express recebe o cabeçalho `x-gemini-api-key`, instancia o cliente Gemini para aquela requisição individual e descarta a referência da memória. Nenhuma chave do usuário é salva em disco, cache Redis ou arquivos de log.
- [x] **Sanitização de Logs:** O middleware de logging do Express mascara qualquer ocorrência de chaves de API nos headers ou query parameters (`x-gemini-api-key: [REDACTED]`).

### 2.4. CORS e Content Security Policy (CSP)
- [x] **CORS Restrito:** Em produção, restringir `Access-Control-Allow-Origin` aos domínios institucionais autorizados da universidade ou plataforma.
- [x] **Cabeçalhos de Segurança (Helmet):**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` (ou `DENY`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy`:
    ```http
    default-src 'self';
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    connect-src 'self' https://generativelanguage.googleapis.com;
    font-src 'self' data:;
    object-src 'none';
    frame-ancestors 'self';
    ```

### 2.5. Rate Limiting e Prevenção contra Abuso
- [x] **Proxy Rate Limit:** Aplicação de rate limiting por IP para evitar esgotamento de quota ou ataques de negação de serviço (`express-rate-limit`).
- [x] **Limitação por Chave BYOK:** Se um estudante inserir uma chave com cota esgotada (`RESOURCE_EXHAUSTED` / HTTP 429), o sistema intercepta e exibe modal explicativo sem derrubar a aplicação.
- [x] **Circuit Breaker Passivo:** O serviço `aiHealth.ts` isola automaticamente chamadas repetitivas caso a API do Google apresente instabilidade transiente.

### 2.6. Privacidade dos Dados do Estudante e Conformidade LGPD/GDPR
- [x] **Armazenamento 100% Local:** Anotações pessoais, mapas conceituais, histórico de respostas e métricas de repetição espaçada (FSRS-7) ficam salvos exclusivamente no navegador do estudante (IndexedDB).
- [x] **Direito ao Esquecimento e Reset de Fábrica:** A interface disponibiliza a função "Resetar Tudo" que purga atomicamente os 9 bancos do IndexedDB e o estado de onboarding.
- [x] **Termos de IA e Zero Treinamento de Dados:** No plano Gemini pago / API Studio institucional, os dados submetidos não são utilizados para treinamento de modelos fundacionais da Google.

---

## 3. Instruções Passo a Passo para Deploy em Produção

### Opção A: Container Docker (Recomendado para Cloud Run, ECS ou VPS)

#### 1. Dockerfile Multi-Stage Otimizado
Criar na raiz do projeto o arquivo `Dockerfile`:

```dockerfile
# Estágio 1: Build da Aplicação
FROM node:22-alpine AS builder
WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm ci

# Copiar fontes e compilar
COPY . .
RUN npm run build

# Estágio 2: Imagem Final de Produção
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

# Copiar build do frontend e backend empacotado
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js

# Executar como usuário não-root por segurança
USER node

EXPOSE 3000

CMD ["node", "server.js"]
```

#### 2. Comandos de Build e Execução Local / Teste
```bash
# 1. Construir a imagem Docker
docker build -t neuroclass-ai:latest .

# 2. Executar o container na porta 3000
docker run -d --name neuroclass-app \
  -p 3000:3000 \
  -e GEMINI_API_KEY="" \
  neuroclass-ai:latest

# 3. Testar a integridade
curl http://localhost:3000/api/health
```

---

### Opção B: Deploy no Google Cloud Run (Serverless)

O Cloud Run é a plataforma nativa ideal por escalar até zero quando ocioso e integrar-se com o Google Cloud Secret Manager.

```bash
# 1. Autenticar no GCP
gcloud auth login
gcloud config set project SEU_PROJETO_GCP

# 2. Construir e enviar a imagem via Cloud Build
gcloud builds submit --tag gcr.io/SEU_PROJETO_GCP/neuroclass-ai

# 3. Fazer o deploy no Cloud Run
gcloud run deploy neuroclass-ai \
  --image gcr.io/SEU_PROJETO_GCP/neuroclass-ai \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=3000 \
  --memory 512Mi \
  --cpu 1
```

---

### Opção C: Deploy em PaaS (Railway ou Render)

1. **Repositório:** Vincular o repositório GitHub ao projeto no Railway/Render.
2. **Build Command:**
   ```bash
   npm ci && npm run build
   ```
3. **Start Command:**
   ```bash
   npm start
   ```
4. **Variáveis de Ambiente no Painel:**
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - *(Opcional)* `GEMINI_API_KEY`: sua chave de contingência institucional.
5. **Certificado:** Certificado SSL/TLS Let's Encrypt gerado automaticamente pelo Railway/Render com HTTPS forçado.

---

## 4. Plano de Verificação Pós-Deploy (*Smoke Tests*)

Após o deploy no ambiente de homologação ou produção, execute a seguinte sequência de validação:

1. **Health Check:** `curl -f https://seu-dominio.edu.br/api/health` deve retornar status HTTP 200 com JSON contendo versão e estado.
2. **Acesso Inicial:** Carregar a URL no navegador anônimo. O diálogo de Boas-Vindas e apresentação pedagógica deve surgir limpo.
3. **Biblioteca Multidisciplinar:** Acessar as Demonstrações Científicas e verificar a carga dos 6 materiais acadêmicos (Neurobiologia, Efeito Fotoelétrico, Redes Neurais, Epistemologia, Dominação Social, Carga Cognitiva).
4. **Validação BYOK:** Abrir o modal "Conectar Gemini", inserir uma chave temporária e clicar em "Validar e Conectar". Confirmar o retorno visual imediato.
5. **Ciclo C.R.E.A.R. e FSRS-7:** Iniciar o estudo de um conceito, testar a transição entre as etapas e agendar a primeira revisão espaçada.
6. **Reset e Privacidade:** Clicar em "Resetar Tudo / Restaurar Fábrica" e confirmar que o IndexedDB é completamente zerado.
