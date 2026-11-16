# Relatório de Homologação Técnica: Interação por Voz, Acessibilidade e Tutoria Multimodal Ativa

**Projeto:** NeuroClass AI — Plataforma Cognitiva de Aprendizagem Baseada em Evidências  
**Data:** 09 de Novembro de 2026  
**Contexto Acadêmico:** Especialização em Neurociências e Comportamento / Divulgação Comunidades Acadêmicas & Embaixadores Estudantis Google Brasil 2026  
**Status:** HOMOLOGADO E CONCLUÍDO (100% de conformidade com os requisitos de acessibilidade e testes automatizados)

---

## 1. Sumário Executivo

A implementação do módulo de **Interação por Voz e Acessibilidade Multimodal** do NeuroClass AI representa um avanço na experiência pedagógica entre o estudante e o Tutor Socrático. Mais do que uma simples conveniência de interface, o diálogo por áudio mobiliza circuitos neurocognitivos distintos da leitura e escrita convencionais:
1. **Ativação da Alça Fonológica:** Permite ao estudante ensaiar a explicitação verbal dos conceitos estudados (*Self-Explanation Effect* e Técnica Feynman falada), reforçando a consolidação mnêmica.
2. **Acessibilidade Universal:** Democratiza o acesso a estudantes com fadiga visual, dislexia, dificuldades motoras ou que preferem o estudo hands-free com headset.
3. **Multiplataforma Linux First-Class:** Desenvolvido e homologado integralmente em ambiente Linux (openSUSE / navegador Vivaldi), assegurando que nenhum estudante ou pesquisador necessite instalar codecs proprietários ou pacotes de sistema adicionais.

---

## 2. Arquitetura do Sistema de Voz (Híbrido e Resiliente)

```
┌────────────────────────────────────────────────────────────────────────┐
│                       ESTUDANTE (Headset / Microfone)                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   [Web Speech Recognition]                 [MediaRecorder Headset]
   (pt-BR nativo do navegador)              (Gravação de áudio real)
              │                                         │
              │ (sucesso)              (fallback falha) │
              ▼                                         ▼
   Texto no Input do Tutor                 Base64 -> /api/voice/transcribe
              │                                         │ (Gemini Multimodal)
              │                                         ▼
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
                   [TUTOR NEUROCLASS AI (C.R.E.A.R.)]
                                   │
                                   ▼
                     Resposta Pedagógica do Tutor
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
    [Sanitização Rigorosa]                   [Chunking de Sentenças]
    - Purga Markdown/LaTeX                   - Sentenças <= 150 chars
    - Purga Emojis Unicode                   - Respeito a pausas pontuais
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   [Web Speech Synthesis]                  [Audio Streaming Fallback]
   - utterance.rate = 1.15                 - /api/voice/tts?rate=1.15
   - pitch preservado                      - BYOK Neural2-A / gtx stream
   (se synthesis-failed no Linux)          (100% uptime sem codecs extras)
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
                  ESTUDANTE OUVE EM RITMO NATURAL (1.15x)
```

### 2.1. Entrada de Voz (Speech-to-Text - STT)
- **Web Speech API (`SpeechRecognition`):** Suporte nativo com reconhecimento contínuo em `pt-BR`. O texto falado é exibido em tempo real no campo de entrada do chat, permitindo revisão ou complemento antes do envio.
- **Motor Híbrido com Fallback Gemini Multimodal:** Em navegadores ou distribuições Linux onde o reconhecimento de fala nativo do Chromium não conecta aos servidores de voz do navegador, o sistema grava automaticamente o áudio do microfone via `MediaRecorder` e envia o buffer base64 para `/api/voice/transcribe`, transcrevendo com os modelos oficiais do Google Gemini (`gemini-3.5-flash-lite` / `gemini-3.5-flash`).
- **Gerenciador de Dispositivos e VU Meter:**
  - O estudante pode abrir a qualquer momento o modal de **Configuração de Headset & Áudio**.
  - Permite escolher explicitamente o microfone/headset preferido entre todos os dispositivos do sistema operacional.
  - Possui monitor visual de volume em tempo real (VU Meter animado com `AudioContext` e `AnalyserNode`), permitindo testar o microfone antes da aula.

### 2.2. Saída de Voz (Text-to-Speech - TTS)
- **Sanitização Pedagógica Estrita (`stripMarkdownForSpeech`):**
  - Remove formatações Markdown (`**negrito**`, `*itálico*`, links, títulos).
  - Purga fórmulas matemáticas KaTeX e LaTeX (`$...$`, `$$...$$`).
  - Purga símbolos Unicode e emojis (`\p{Extended_Pictographic}`), garantindo que a síntese não soletre descrições robóticas de ícones.
- **Divisão em Sentenças Respiratórias (`splitTextIntoChunks`):**
  - Fragmenta respostas longas do tutor em sentenças naturais (≤ 150 caracteres).
  - Previne estouro de buffer de áudio em sintetizadores locais e proporciona transições fluidas.
- **Fallback Automático contra Erros de Navegador (`synthesis-failed`):**
  - Navegadores baseados em Chromium no Linux frequentemente disparam o evento de erro `synthesis-failed` devido à ausência do serviço de voz proprietário do Google Chrome.
  - O NeuroClass AI intercepta esse erro de forma transparente e aciona imediatamente o canal de streaming de áudio `/api/voice/tts`, sem interromper a experiência do estudante.
- **Motor de Áudio Streaming de Alta Fidelidade:**
  - Se o estudante possui sua chave do Google AI Studio configurada (BYOK), o servidor pode sintetizar vozes neurais de última geração (`pt-BR-Neural2-A`).
  - Caso contrário, utiliza o canal universal multiplataforma com compressão MP3 limpa, sem depender de codecs externos ou softwares instalados.

### 2.3. Ritmo Conversacional e Velocidade Dinâmica
- **Velocidade Padrão Acelerada (`1.15x` ~ 160 WPM):** O ritmo padrão foi recalibrado para 1.15x, corrigindo a sensação de lentidão dos sintetizadores convencionais e proporcionando uma fala atenta, focada e humana.
- **Controle Dinâmico de Velocidade (`[1.15x]`):**
  - Botão de acesso rápido no cabeçalho do Tutor e na barra de reprodução ativa.
  - Alternância com 1 clique: `1.0x` ➔ `1.15x (Padrão)` ➔ `1.25x` ➔ `1.5x`.
  - Preservação estrita de pitch (`preservesPitch = true`), mantendo a voz feminina natural em qualquer velocidade sem distorções agudas.

---

## 3. Segurança, Governança e BYOK (Bring Your Own Key)

1. **Memória Volátil Exclusiva:** Nenhuma chave de API, gravação de voz ou transcrição pessoal é persistida em disco, IndexedDB, cookies ou localStorage.
2. **Sanitização de Logs e Respostas:** O servidor jamais ecoa chaves ou trechos de áudio sensíveis em mensagens de erro ou logs de terminal.
3. **Controle Estrito de Origens (CORS):** Proteção fail-closed contra origens não autorizadas.
4. **Isolamento de Concorrência:** Múltiplas requisições simultâneas de voz utilizam instâncias isoladas, garantindo que a credencial de um estudante não se comunique com a de outro.

---

## 4. Matriz de Testes Automatizados da Interação por Voz

A integridade do módulo foi validada através de **17 testes de unidade e integração** dedicados em `src/tests/voice.test.ts`, integrando a suíte global de 106 testes do NeuroClass AI:

| Teste | Descrição e Comportamento Validado | Status |
| :--- | :--- | :---: |
| **T285** | Inicialização, controle de estado e encerramento seguro do reconhecimento de voz (STT). | **PASS** |
| **T286** | Recepção de transcrição com suporte a eventos parciais e revisão textual. | **PASS** |
| **T287** | Envio do texto falado ao Tutor preservando o conceito ativo e o contexto pedagógico. | **PASS** |
| **T288** | Reprodução de resposta com síntese de voz (TTS) em português do Brasil (`pt-BR`). | **PASS** |
| **T289** | Interrupção imediata (*Stop*) e repetição (*Repeat*) da fala do tutor. | **PASS** |
| **T290** | Tratamento gracioso de permissão negada de microfone com mensagem amigável. | **PASS** |
| **T291** | Tratamento de falhas de reconhecimento (`no-speech`, `audio-capture`, `network`). | **PASS** |
| **T292** | Resiliência e degradação suave quando o navegador não possui Web Speech API nativa. | **PASS** |
| **T293** | Preservação de privacidade BYOK e verificação do texto de transparência ao usuário. | **PASS** |
| **T294** | Sanitização rigorosa de Markdown, fórmulas LaTeX KaTeX e emojis (`\p{Extended_Pictographic}`). | **PASS** |
| **T295** | Enumeração, seleção e persistência em memória do dispositivo de áudio preferido (headset). | **PASS** |
| **T296** | Monitoramento de nível de áudio em tempo real (VU Meter) e resiliência de ambiente. | **PASS** |
| **T297** | Gravação de áudio do headset via MediaRecorder e conversão base64 para fallback Gemini. | **PASS** |
| **T298** | Particionamento de sentenças longas (`splitTextIntoChunks`) para prevenção de buffer overflow. | **PASS** |
| **T299** | Fallback automático para streaming de áudio quando a síntese nativa falha (`synthesis-failed`). | **PASS** |
| **T300** | Controles de pausa, retomada e cancelamento durante o streaming de áudio. | **PASS** |
| **T301** | Controle dinâmico de velocidade de fala (`1.15x` padrão, ciclo 1.0x a 1.5x e fallback para valores inválidos). | **PASS** |

**Resultado Geral da Suíte:** `106 passed / 0 failed / 0 skipped` (Tempo de execução: ~720ms).

---

## 5. Relevância para Comunidades Acadêmicas e Embaixadores Google 2026

1. **Demonstração Prática de Inteligência Artificial Multimodal com Impacto Real:**
   - Evidencia a aplicação dos modelos Google Gemini para além do paradigma de texto, integrando voz, audição e leitura de documentos científicos complexos.
2. **Compromisso com o Código Aberto e Acessibilidade:**
   - Demonstra como construir aplicações web ricas que funcionam perfeitamente em estações de trabalho de código aberto (Linux openSUSE / Ubuntu / Fedora), sem aprisionamento a ecossistemas proprietários.
3. **Pedagogia Ativa aliada à Neurociência:**
   - O módulo de voz coloca o estudante no papel de expositor ativo de suas ideias através do ciclo C.R.E.A.R., fomentando a retenção duradoura do conhecimento.

---

**Homologação Concluída com Sucesso.**  
O módulo de Interação por Voz está pronto para demonstração e apresentação acadêmica.

