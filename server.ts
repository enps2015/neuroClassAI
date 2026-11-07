import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Configuração segura do limite de payload para tráfego de PDF multimodal
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir o worker do PDF.js com cabeçalho estrito de JavaScript antes de qualquer middleware
app.get('/pdf.worker.min.mjs', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(path.resolve(__dirname, 'public', 'pdf.worker.min.mjs'));
});
app.use(express.static(path.resolve(__dirname, 'public')));

// Inicialização segura do cliente Gemini com User-Agent para telemetria oficial
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('[AVISO] GEMINI_API_KEY não configurada no ambiente. As chamadas de IA dependerão da chave injetada pelo AI Studio.');
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Modelos suportados com ordem de resiliência
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

/**
 * Executa generateContent com tentativa no modelo primário e fallback automático em 503/429/timeout.
 */
async function generateContentWithResilience(params: {
  contents: any;
  config?: any;
}): Promise<{ text: string | undefined; modelUsed: string }> {
  const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return { text: response.text, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const msg = err?.message || '';
      console.warn(`[Gemini Warning] Chamada falhou no modelo "${model}" (Status ${status}): ${msg.slice(0, 120)}...`);

      // Se for erro estrutural de permissão / autenticação (401/403), não adianta tentar outros modelos
      if (status === 401 || status === 403 || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        throw err;
      }
      // Se for 503 (UNAVAILABLE), 429 (RESOURCE_EXHAUSTED) ou 404 (NOT_FOUND), tenta o próximo modelo da lista
      continue;
    }
  }

  throw lastError || new Error('Todos os modelos de IA falharam após tentativas de fallback.');
}

/**
 * Health check passivo da API
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    version: '2.2',
    timestamp: Date.now(),
    primaryModel: PRIMARY_MODEL,
    fallbackModels: FALLBACK_MODELS,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

/**
 * Endpoint de Análise Multimodal de Documentos
 * Recebe o documento (PDF original em base64 ou texto estruturado)
 * Retorna análise estruturada rigorosamente vinculada às páginas e figuras reais.
 */
app.post('/api/gemini/analyze-document', async (req, res) => {
  try {
    const { documentId, title, subject, fileBase64, mimeType, textPages, noteSections } = req.body;

    if (!documentId || !title) {
      res.status(400).json({ error: 'Parâmetros obrigatórios ausentes: documentId ou title.' });
      return;
    }

    // Preparar conteúdo multimodal
    const contentParts: any[] = [];

    const systemPrompt = `Você é o motor pedagógico e científico de alta densidade cognitiva do NeuroClass AI.
Sua missão é analisar exaustivamente o documento científico/educacional fornecido e extrair uma REDE CONCEITUAL RICA, PROFUNDA E DIDATICAMENTE PODEROSA.

DIRETRIZES DE PROFUNDIDADE E COBERTURA ACADÊMICA:
1. DENSIDADE CONCEITUAL EXIGIDA:
   - Extraia entre 8 a 15 CONCEITOS FUNDAMENTAIS essenciais para a compreensão do livro/artigo.
   - Extraia entre 4 a 10 CONCEITOS COMPLEMENTARES (mecanismos, mediadores, termos técnicos secundários, estruturas de suporte).
   - Extraia entre 10 a 25 RELAÇÕES CONCEITUAIS DIRECIONADAS com rótulos semânticos claros ('causes', 'regulates', 'precedes', 'composes', 'contrasts', 'correlates') e descrições explicativas densas.
   - NUNCA retorne apenas 2 ou 3 conceitos para um material acadêmico ou livro. A representação deve ser um mapa mental/grafo rico e informativo!
2. GRAFO DE DEPENDÊNCIAS E PRÉ-REQUISITOS (DAG):
   - Mapeie rigorosamente as dependências cognitivas (o que o estudante precisa entender antes de avançar para conceitos complexos).
   - Para cada conceito avançado, liste seus 'prerequisiteConceptIds' e formule uma 'diagnosticQuestion' objetiva para verificar lacunas formativas.
3. RASTREABILIDADE ESTREITA:
   - Cada conceito e evidência DEVE conter a referência exata da página original do PDF onde o termo ou mecanismo é discutido, com a citação literal em 'excerpt'.
   - Identifique diagramas, figuras e tabelas citadas nas páginas (ex.: "Figura 1", "Tabela 2") no campo 'figureLabel' ou 'tableLabel'.
4. RIGOR EPISTEMOLÓGICO:
   - Diferencie fatos textuais ('explicitly_documented'), sínteses integradoras ('synthesized') e inferências didáticas do modelo ('model_inference').
   - Não confunda estimativa estatística algorítmica (internalModelConfidence) com prova científica comprovada.`;

    contentParts.push({ text: systemPrompt });
    contentParts.push({
      text: `Analise detalhadamente o material acadêmico anexado intitulado: "${title}" (Disciplina/Área: "${subject || 'Geral'}").
Gere uma malha de conceitos densa, interconectada e de alto valor educacional, cobrindo os principais núcleos teóricos e práticos do documento.`,
    });

    if (fileBase64 && mimeType === 'application/pdf') {
      contentParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: fileBase64,
        },
      });
    }

    if (textPages && Array.isArray(textPages) && textPages.length > 0) {
      // Se tiver muitas páginas (>40), selecionamos fatias representativas de todo o livro (início, meio e fim de capítulos)
      // garantindo que o modelo cubra todo o arco do livro de 300+ páginas
      let pagesToSend = textPages;
      if (textPages.length > 50) {
        // Amostragem distribuída homogênea cobrindo o livro do início (pág 1) até o fim (pág 319+)
        const step = Math.ceil(textPages.length / 50);
        pagesToSend = textPages.filter((_, idx) => idx % step === 0 || idx === 0 || idx === textPages.length - 1);
      }

      const formattedPages = pagesToSend
        .map((p: { pageNumber: number; textContent: string }) => {
          const cleanText = (p.textContent || '').slice(0, 1200);
          return `--- PÁGINA ${p.pageNumber} ---\n${cleanText}`;
        })
        .join('\n\n');
      contentParts.push({
        text: `Conteúdo textual indexado por página cobrindo o documento completo (total: ${textPages.length} páginas):\n${formattedPages}`,
      });
    } else if (noteSections && Array.isArray(noteSections)) {
      const formattedNotes = noteSections
        .map((s: { title: string; content: string }) => `### SEÇÃO: ${s.title}\n${s.content}`)
        .join('\n\n');
      contentParts.push({ text: `Anotações do estudante:\n${formattedNotes}` });
    }

    if (contentParts.length <= 2) {
      res.status(400).json({ error: 'Nenhum conteúdo documental válido fornecido para análise.' });
      return;
    }

    const response = await generateContentWithResilience({
      contents: { parts: contentParts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            domain: { type: Type.STRING },
            centralTheme: { type: Type.STRING },
            learningObjectives: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            fundamentalConcepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  importance: { type: Type.STRING },
                  epistemicStatus: { type: Type.STRING },
                  evidenceReferences: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING },
                        pageNumber: { type: Type.INTEGER },
                        sectionTitle: { type: Type.STRING },
                        figureLabel: { type: Type.STRING },
                        tableLabel: { type: Type.STRING },
                        excerpt: { type: Type.STRING },
                      },
                    },
                  },
                  prerequisiteConceptIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  diagnosticQuestions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        question: { type: Type.STRING },
                        targetedPrerequisiteId: { type: Type.STRING },
                        expectedEvidence: { type: Type.STRING },
                      },
                    },
                  },
                },
                required: ['id', 'name', 'definition', 'epistemicStatus', 'evidenceReferences', 'prerequisiteConceptIds'],
              },
            },
            complementaryConcepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  importance: { type: Type.STRING },
                  epistemicStatus: { type: Type.STRING },
                  evidenceReferences: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING },
                        pageNumber: { type: Type.INTEGER },
                        sectionTitle: { type: Type.STRING },
                        excerpt: { type: Type.STRING },
                      },
                    },
                  },
                  prerequisiteConceptIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['id', 'name', 'definition', 'epistemicStatus', 'evidenceReferences'],
              },
            },
            relationships: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  sourceConceptId: { type: Type.STRING },
                  targetConceptId: { type: Type.STRING },
                  relationType: { type: Type.STRING },
                  description: { type: Type.STRING },
                  internalModelConfidence: { type: Type.NUMBER },
                  isModelInference: { type: Type.BOOLEAN },
                  epistemicStatus: { type: Type.STRING },
                  evidences: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING },
                        pageNumber: { type: Type.INTEGER },
                        excerpt: { type: Type.STRING },
                      },
                    },
                  },
                },
                required: ['id', 'sourceConceptId', 'targetConceptId', 'relationType', 'description', 'isModelInference'],
              },
            },
            unresolvedGaps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedDiagramType: { type: Type.STRING },
          },
          required: [
            'domain',
            'centralTheme',
            'learningObjectives',
            'fundamentalConcepts',
            'relationships',
            'suggestedDiagramType',
          ],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');

    // Constrói o DAG de pré-requisitos para o Quadro Didático
    const nodes: Array<{ id: string; name: string; isPrerequisite: boolean }> = [];
    const edges: Array<{ from: string; to: string; label: string; relationType?: any }> = [];

    const allConcepts = [
      ...(parsedJson.fundamentalConcepts || []),
      ...(parsedJson.complementaryConcepts || []),
    ];

    allConcepts.forEach((c: any) => {
      nodes.push({
        id: c.id,
        name: c.name,
        isPrerequisite: (c.prerequisiteConceptIds && c.prerequisiteConceptIds.length > 0) || false,
      });
      if (c.prerequisiteConceptIds) {
        c.prerequisiteConceptIds.forEach((preId: string) => {
          edges.push({
            from: preId,
            to: c.id,
            label: 'pré-requisito',
            relationType: 'precedes',
          });
        });
      }
    });

    if (parsedJson.relationships) {
      parsedJson.relationships.forEach((rel: any) => {
        edges.push({
          from: rel.sourceConceptId,
          to: rel.targetConceptId,
          label: rel.relationType,
          relationType: rel.relationType,
        });
      });
    }

    const result = {
      id: `analysis_${documentId}_${Date.now()}`,
      documentId,
      domain: parsedJson.domain || 'Ciências',
      centralTheme: parsedJson.centralTheme || title,
      learningObjectives: parsedJson.learningObjectives || [],
      fundamentalConcepts: (parsedJson.fundamentalConcepts || []).map((c: any) => ({
        ...c,
        diagnosticState: 'unassessed',
      })),
      complementaryConcepts: (parsedJson.complementaryConcepts || []).map((c: any) => ({
        ...c,
        diagnosticState: 'unassessed',
      })),
      relationships: parsedJson.relationships || [],
      prerequisiteGraph: { nodes, edges },
      identifiedGaps: parsedJson.unresolvedGaps || [],
      suggestedDiagramType: parsedJson.suggestedDiagramType || 'concept-map',
      analyzedAt: Date.now(),
    };

    res.json(result);
  } catch (error: any) {
    console.error('[ERRO] /api/gemini/analyze-document falhou:', error);
    res.status(500).json({
      error: 'Falha durante análise multimodal do documento.',
      details: error.message || 'Erro desconhecido',
    });
  }
});

/**
 * Endpoint do Tutor Textual Contextualizado
 * Recebe o documento ativo, conceito em foco e histórico da sessão.
 */
app.post('/api/gemini/tutor-chat', async (req, res) => {
  try {
    const {
      userMessage,
      documentTitle,
      subject,
      activeConcept,
      documentExcerpts,
      conversationHistory,
      pedagogicalIntent,
    } = req.body;

    if (!userMessage) {
      res.status(400).json({ error: 'userMessage é obrigatório.' });
      return;
    }

    const systemInstruction = `Você é o Tutor NeuroClass AI, um orientador acadêmico e científico caloroso, empático, didático e apaixonado pelo conhecimento.
Você interage ativamente com o estudante utilizando o método socrático e o ciclo pedagógico C.R.E.A.R. (Contextualizar, Relacionar, Explicar, Aplicar, Recuperar).

PERSONALIDADE E TOM DE VOZ:
- Seja natural, envolvente, humano e motivador (NUNCA frio, robótico ou burocrático).
- Demonstre genuíno interesse na compreensão do estudante: celebre o raciocínio dele, faça analogias visuais marcantes e incentive perguntas.
- Formate suas respostas de maneira limpa e atraente com parágrafos bem espaçados, negrito em conceitos-chave e listas quando apropriado.

DOCUMENTO EM ESTUDO:
- Título: "${documentTitle}" (${subject || 'Geral'}).
${activeConcept ? `- Conceito Selecionado no Quadro Didático: "${activeConcept.name}". Definição oficial: "${activeConcept.definition}".` : ''}

REGRAS DE CONDUTA CIENTÍFICA:
1. RASTREABILIDADE ESTREITA: Baseie suas explicações nos trechos e páginas reais do documento fornecidos. Cite sempre onde o estudante pode conferir (ex: "Conforme vimos na Página 2..." ou "No diagrama da Seção 3...").
2. LIMITAÇÃO DE ESCOPO: Se a pergunta for sobre algo não contido no documento, responda com cordialidade: "Este ponto específico não é tratado no documento atual. Posso explicar o princípio científico geral, mas saiba que não consta no seu material de referência."
3. ATENÇÃO AOS MODOS PEDAGÓGICOS:
   - 'analogy': Construa uma analogia viva e visual do cotidiano que clareie o mecanismo físico/biológico/lógico.
   - 'practical_example': Demonstre um caso concreto de aplicação prática, experimento real ou impacto palpável no mundo.
   - 'diagnostic_question': Proponha uma pergunta reflexiva e instigante para checar se o estudante compreendeu a essência do conceito, sem dar spoiler imediato.
   - 'clarification' ou geral: Explique com clareza cristalina, relacionando o conceito com os seus pré-requisitos.`;

    const chatParts: any[] = [];
    chatParts.push({ text: systemInstruction });

    if (documentExcerpts && Array.isArray(documentExcerpts) && documentExcerpts.length > 0) {
      chatParts.push({
        text: `Trechos de referência do documento:\n${documentExcerpts.join('\n---\n')}`,
      });
    }

    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recent = conversationHistory.slice(-8);
      recent.forEach((msg: any) => {
        chatParts.push({
          text: `${msg.sender === 'user' ? 'Estudante' : 'Tutor'}: ${msg.text}`,
        });
      });
    }

    let promptAugmentation = userMessage;
    if (pedagogicalIntent === 'analogy') {
      promptAugmentation = `Explique o conceito ativo utilizando uma analogia simples e rigorosa: ${userMessage}`;
    } else if (pedagogicalIntent === 'practical_example') {
      promptAugmentation = `Apresente uma aplicação ou exemplo prático do conceito: ${userMessage}`;
    } else if (pedagogicalIntent === 'diagnostic_question') {
      promptAugmentation = `Faça uma pergunta formativa para avaliar se compreendi o conceito ativo: ${userMessage}`;
    }

    chatParts.push({ text: `Estudante: ${promptAugmentation}` });

    const response = await generateContentWithResilience({
      contents: { parts: chatParts },
    });

    const replyText = response.text || 'Não consegui formular uma explicação para esta solicitação.';

    res.json({
      text: replyText,
      timestamp: Date.now(),
      pedagogicalRole: pedagogicalIntent || 'explanation',
      modelUsed: response.modelUsed,
    });
  } catch (error: any) {
    console.error('[ERRO] /api/gemini/tutor-chat falhou:', error);
    res.status(500).json({
      error: 'Falha na comunicação com o Tutor Inteligente.',
      details: error.message || 'Erro desconhecido',
    });
  }
});

// Servir arquivos públicos estáticos (incluindo o worker de PDF) diretamente
const publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/pdf.worker.min.mjs', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'pdf.worker.min.mjs'), {
    headers: { 'Content-Type': 'application/javascript; charset=UTF-8' },
  });
});

// Integração do Vite em modo de desenvolvimento ou arquivos estáticos em produção
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NeuroClass AI] Servidor iniciado com sucesso na porta ${PORT}`);
  });
}

setupServer().catch(err => {
  console.error('[FATAL] Falha na inicialização do servidor:', err);
  process.exit(1);
});
