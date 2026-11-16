import type {
  LearningAnalysis,
  EvaluateExplanationRequest,
  EvaluateExplanationResponse,
  GenerateConceptQuestionRequest,
  GenerateConceptQuestionResponse,
  TableOfContentsItem,
  GroundingSegment,
  SemanticEvaluationRequest,
  SemanticEvaluationResponse,
} from '../../types';
import type { TutorVisualAsset } from '../../types/rag';
import { AIServiceHealth } from './aiHealth';
import { AIKeyManager } from './aiKeyManager';

/**
 * Constrói os cabeçalhos HTTP injetando a chave BYOK temporária da sessão caso exista em memória.
 */
export function buildRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const sessionKey = AIKeyManager.getApiKey();
  if (sessionKey) {
    headers['x-gemini-api-key'] = sessionKey;
  }
  return headers;
}

export interface AnalyzeDocumentRequest {
  documentId: string;
  title: string;
  subject?: string;
  fileBase64?: string;
  mimeType?: string;
  textPages?: Array<{
    pageNumber: number;
    textContent: string;
    hasVisualElements?: boolean;
    isScanned?: boolean;
    legibility?: string;
    detectedElements?: {
      hasFormulas?: boolean;
      hasTables?: boolean;
      hasFigures?: boolean;
      hasCharts?: boolean;
    };
    pageImageBase64?: string;
  }>;
  noteSections?: Array<{ title: string; content: string }>;
  activeChunkRange?: { startPage: number; endPage: number };
  pageCount?: number;
  tableOfContents?: any[];
}

export interface TutorChatRequest {
  userMessage: string;
  documentTitle: string;
  documentId?: string;
  subject?: string;
  activeConcept?: { id: string; name: string; definition: string };
  documentExcerpts?: string[];
  retrievedEvidences?: EvidenceReference[];
  conversationHistory?: Array<{ sender: 'user' | 'tutor'; text: string }>;
  pedagogicalIntent?: 'explanation' | 'analogy' | 'practical_example' | 'diagnostic_question';
  visualAssets?: TutorVisualAsset[];
  textOnlyModel?: boolean;
  tableOfContents?: TableOfContentsItem[];
}

export interface TutorChatResponse {
  text: string;
  timestamp: number;
  pedagogicalRole: string;
  modelUsed?: string;
  visualAnalysisConducted?: boolean;
  visualAssetsEvaluated?: Array<{ id: string; pageNumber: number; type: string }>;
  verifiedCitations?: EvidenceReference[];
  unverifiedCitations?: string[];
  groundedContextSummary?: {
    totalEvidencesProvided: number;
    citedCount: number;
    hasUnverifiedCitations: boolean;
  };
  groundingSegments?: GroundingSegment[];
  evaluationHandle?: string;
}

export async function requestDocumentAnalysis(req: AnalyzeDocumentRequest): Promise<LearningAnalysis> {
  return AIServiceHealth.executeWithResilience(
    'gemini_multimodal',
    async () => {
      const response = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Erro HTTP ${response.status} ao analisar documento.`);
      }

      return (await response.json()) as LearningAnalysis;
    },
    90000 // 90s timeout para leitura e raciocínio multimodal em documentos
  );
}

export async function requestTutorResponse(req: TutorChatRequest): Promise<TutorChatResponse> {
  return AIServiceHealth.executeWithResilience(
    'gemini_tutor',
    async () => {
      const response = await fetch('/api/gemini/tutor-chat', {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || `Erro HTTP ${response.status} ao consultar o tutor.`);
      }

      return await response.json();
    },
    45000 // 45s timeout para respostas do tutor (permite fallback transparente no backend)
  );
}

/**
 * Envia uma solicitação sob demanda (opt-in) para avaliação semântica de fundamentação (Tier 2).
 * Utiliza o identificador opaco temporário (evaluationHandle) emitido pelo backend.
 */
export async function requestSemanticGroundingEvaluation(
  req: SemanticEvaluationRequest
): Promise<SemanticEvaluationResponse> {
  return AIServiceHealth.executeWithResilience(
    'gemini_semantic_evaluation',
    async () => {
      const response = await fetch('/api/gemini/evaluate-semantic-grounding', {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(
          errorData.error || `Erro HTTP ${response.status} ao avaliar fundamentação semântica.`
        );
        (err as any).status = response.status;
        (err as any).code = errorData.code;
        throw err;
      }

      return await response.json();
    },
    30000 // 30s timeout
  );
}

/* ==========================================================================
   SERVIÇOS DE IA DA FASE 2: MÓDULO AGORA EU EXPLICO
   ========================================================================== */

/**
 * Envia a explicação do estudante para avaliação multidimensional com rigor pedagógico C.R.E.A.R.
 */
export async function requestExplanationEvaluation(
  req: EvaluateExplanationRequest
): Promise<EvaluateExplanationResponse> {
  return AIServiceHealth.executeWithResilience(
    'gemini_evaluation',
    async () => {
      const response = await fetch('/api/gemini/evaluate-explanation', {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.details || errorData.error || `Erro HTTP ${response.status} ao avaliar a explicação do estudante.`
        );
      }

      return (await response.json()) as EvaluateExplanationResponse;
    },
    60000 // 60s timeout para avaliação cognitiva detalhada e verificação de evidências
  );
}

/**
 * Gera uma pergunta reflexiva e contextualizada que estimula o estudante a explicar o mecanismo do conceito.
 */
export async function requestConceptQuestion(
  req: GenerateConceptQuestionRequest
): Promise<GenerateConceptQuestionResponse> {
  return AIServiceHealth.executeWithResilience(
    'gemini_evaluation',
    async () => {
      const response = await fetch('/api/gemini/generate-concept-question', {
        method: 'POST',
        headers: buildRequestHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.details || errorData.error || `Erro HTTP ${response.status} ao formular pergunta do conceito.`
        );
      }

      return (await response.json()) as GenerateConceptQuestionResponse;
    },
    30000
  );
}

/**
 * Validação de conexão e cota da chave Gemini (BYOK ou gerenciada).
 * Utiliza requisição mínima compatível sem consumir cota relevante.
 */
export async function validateApiKey(apiKeyToTest?: string): Promise<{
  valid: boolean;
  message: string;
  code?: string;
  model?: string;
  mode?: string;
}> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = apiKeyToTest || AIKeyManager.getApiKey();
    if (key) {
      headers['x-gemini-api-key'] = key;
    }

    const response = await fetch('/api/gemini/validate-key', {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKey: key }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        valid: false,
        code: data.code || `HTTP_${response.status}`,
        message: data.error || data.message || `Erro ${response.status} ao validar chave.`,
      };
    }

    return {
      valid: Boolean(data.valid),
      message: data.message || 'Conexão com Gemini validada com sucesso!',
      code: data.code || 'VALID',
      model: data.model,
      mode: data.mode,
    };
  } catch (err: any) {
    return {
      valid: false,
      code: 'NETWORK_ERROR',
      message: err.message || 'Falha de comunicação com o servidor local.',
    };
  }
}

/**
 * Transcrição Multimodal de Áudio com Gemini.
 * Envia o áudio gravado diretamente do microfone/headset em base64.
 */
export async function requestAudioTranscription(
  audioBase64: string,
  mimeType: string = 'audio/webm'
): Promise<string> {
  const headers = buildRequestHeaders();
  const response = await fetch('/api/gemini/transcribe-audio', {
    method: 'POST',
    headers,
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro ${response.status} ao transcrever áudio com Gemini.`);
  }

  const data = await response.json();
  return data.transcript || '';
}

/* ==========================================================================
   EXPERIMENTO CONTROLADO: GOLDEN DATASET (TIER 2 - MISSÃO P3.2.2.2)
   ========================================================================== */

export interface GoldenDatasetMetaResponse {
  totalCases: number;
  version: string;
  description: string;
  cases: Array<{
    caseId: string;
    documentId: string;
    description: string;
    claimText: string;
    citationTags: string[];
    evidenceCount: number;
  }>;
}

export interface GoldenDatasetRunCaseResponse {
  caseId: string;
  documentId: string;
  description: string;
  httpStatus: number;
  modelUsed: string;
  latencyMs: number;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  result: any;
  overallStatus: string;
  goldComparison?: {
    expectedStatus: string;
    expectedRelationship: string;
    goldRationale: string;
    criticalAspects: string;
    isStatusMatch: boolean;
    isRelationshipMatch: boolean;
  };
  error?: string;
}

/**
 * Consulta os metadados dos 21 cenários do Golden Dataset.
 */
export async function fetchGoldenDatasetMetadata(): Promise<GoldenDatasetMetaResponse> {
  const response = await fetch('/api/experimental/golden-dataset/info', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao obter metadados do Golden Dataset.`);
  }

  return await response.json();
}

/**
 * Executa um cenário individual do Golden Dataset transmitindo a chave BYOK do estudante.
 */
export async function runGoldenDatasetCase(caseId: string): Promise<GoldenDatasetRunCaseResponse> {
  const headers = buildRequestHeaders();
  const response = await fetch('/api/experimental/golden-dataset/run-case', {
    method: 'POST',
    headers,
    body: JSON.stringify({ caseId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `Erro HTTP ${response.status} ao executar cenário ${caseId}.`);
    (error as any).status = response.status;
    (error as any).code = errorData.code;
    throw error;
  }

  return await response.json();
}

/**
 * Persiste os resultados consolidados no servidor (experiments/p3-2-2-2/) sem expor credenciais.
 */
export async function saveGoldenDatasetResults(results: any[]): Promise<{
  success: boolean;
  savedPath: string;
  totalRecorded: number;
}> {
  const headers = buildRequestHeaders();
  const response = await fetch('/api/experimental/golden-dataset/save-results', {
    method: 'POST',
    headers,
    body: JSON.stringify({ results }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao salvar artefatos do experimento.`);
  }

  return await response.json();
}
