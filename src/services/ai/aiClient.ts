import type { LearningAnalysis } from '../../types';
import { AIServiceHealth } from './aiHealth';

export interface AnalyzeDocumentRequest {
  documentId: string;
  title: string;
  subject?: string;
  fileBase64?: string;
  mimeType?: string;
  textPages?: Array<{ pageNumber: number; textContent: string }>;
  noteSections?: Array<{ title: string; content: string }>;
}

export interface TutorChatRequest {
  userMessage: string;
  documentTitle: string;
  subject?: string;
  activeConcept?: { id: string; name: string; definition: string };
  documentExcerpts?: string[];
  conversationHistory?: Array<{ sender: 'user' | 'tutor'; text: string }>;
  pedagogicalIntent?: 'explanation' | 'analogy' | 'practical_example' | 'diagnostic_question';
}

export async function requestDocumentAnalysis(req: AnalyzeDocumentRequest): Promise<LearningAnalysis> {
  return AIServiceHealth.executeWithResilience(
    'gemini_multimodal',
    async () => {
      const response = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

export async function requestTutorResponse(req: TutorChatRequest): Promise<{
  text: string;
  timestamp: number;
  pedagogicalRole: string;
}> {
  return AIServiceHealth.executeWithResilience(
    'gemini_tutor',
    async () => {
      const response = await fetch('/api/gemini/tutor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
