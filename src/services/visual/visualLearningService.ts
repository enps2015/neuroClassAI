import { AIKeyManager } from '../ai/aiKeyManager';
import { workspaceStorage } from '../storage/workspaceStorage';
import {
  saveVisualResource,
  getVisualResourcesByDocument,
  getVisualResourcesByConcept,
  getVisualResourceById,
  deleteVisualResource,
} from '../persistence/indexedDb';
import { generateCuratedDemoIllustration } from './demoIllustrations';
import type {
  VisualResource,
  VisualGenerationRequest,
  VisualGenerationResponse,
} from '../../types';

export class VisualLearningService {
  private isGenerating = false;

  /**
   * Solicita a geração de um recurso visual didático ao backend Gemini.
   * Exige estritamente consentimento explícito prévio e chave BYOK ativa.
   * Não salva automaticamente — a persistência depende de ação explícita posterior.
   * Previne requisições simultâneas duplicadas.
   */
  public async generateVisualResource(
    request: VisualGenerationRequest
  ): Promise<VisualGenerationResponse> {
    if (this.isGenerating) {
      throw new Error(
        'Uma requisição de geração visual já está em andamento. Aguarde a conclusão.'
      );
    }

    if (!request.confirmCostConsent) {
      throw new Error(
        'Consentimento explícito sobre os custos da API com chave BYOK é obrigatório antes de iniciar a geração.'
      );
    }

    const apiKey = (AIKeyManager.getApiKey() || '').trim();
    if (!apiKey) {
      throw new Error(
        'Chave de API Gemini necessária ou inválida. Por favor, conecte sua chave no menu de Configurações (BYOK).'
      );
    }

    this.isGenerating = true;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-gemini-api-key': apiKey,
      };

      const response = await fetch('/api/visual/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const code = errorData?.code || 'ERROR';
        const msg = errorData?.error || 'Falha ao gerar o recurso visual com Gemini.';

        if (response.status === 401) {
          throw new Error(
            'Chave de API Gemini necessária ou inválida. Por favor, conecte sua chave no menu de Configurações (BYOK).'
          );
        }
        if (response.status === 429 || code === 'QUOTA_EXCEEDED') {
          throw new Error(
            'Limite de cota de geração de imagens da sua chave Gemini excedido no Google AI Studio. A cota diária é renovada na próxima madrugada (~04h/05h BRT).'
          );
        }
        if (response.status === 504 || code === 'TIMEOUT') {
          throw new Error(
            'Tempo limite de 45 segundos excedido durante a síntese de imagem. Tente novamente.'
          );
        }

        throw new Error(msg);
      }

      const data: VisualGenerationResponse = await response.json();
      return data;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Salva o recurso visual explicitamente na biblioteca local do estudante (pasta física e IndexedDB).
   */
  public async saveResource(resource: VisualResource, subjectName = 'Geral'): Promise<void> {
    await workspaceStorage.saveVisualResourceBinary(resource, subjectName);
  }

  /**
   * Recupera todos os recursos visuais salvos para o documento.
   */
  public async getSavedResourcesByDocument(documentId: string): Promise<VisualResource[]> {
    return getVisualResourcesByDocument(documentId);
  }

  /**
   * Recupera todos os recursos visuais salvos para um conceito específico.
   */
  public async getSavedResourcesByConcept(conceptId: string): Promise<VisualResource[]> {
    return getVisualResourcesByConcept(conceptId);
  }

  /**
   * Recupera um recurso visual específico pelo seu ID.
   */
  public async getResourceById(id: string): Promise<VisualResource | undefined> {
    return getVisualResourceById(id);
  }

  /**
   * Obtém os recursos visuais de apoio para um conceito em estudo.
   * Se houver recursos gerados e salvos pelo estudante, retorna-os prioritariamente.
   * Se não houver e o documento for de demonstração, gera uma representação demonstrativa curada
   * identificada claramente sem consumir cota de API.
   */
  public async getVisualSupportForConcept(
    conceptId: string,
    conceptName: string,
    documentId?: string,
    documentTitle?: string,
    isDemoMaterial?: boolean
  ): Promise<VisualResource[]> {
    const saved = await this.getSavedResourcesByConcept(conceptId);
    if (saved.length > 0) {
      return saved;
    }

    const isDemo = Boolean(isDemoMaterial === true);
    if (isDemo) {
      const demo = generateCuratedDemoIllustration(
        conceptId,
        conceptName,
        'conceptual_illustration',
        documentTitle
      );
      const demoResource: VisualResource = {
        id: `demo_support_${conceptId}`,
        documentId: documentId || 'demo_document',
        conceptId,
        conceptName,
        modality: 'conceptual_illustration',
        title: demo.title,
        caption: demo.caption,
        promptUsed: 'Ilustração vetorial didática de referência pedagógica (modo de demonstração).',
        imageDataUrl: demo.dataUrl,
        mimeType: 'image/svg+xml',
        modelUsed: 'Exemplo Didático de Referência',
        createdAt: 1730000000000,
      };
      return [demoResource];
    }

    return [];
  }

  /**
   * Exclui um recurso visual específico da biblioteca local.
   */
  public async deleteResource(id: string): Promise<void> {
    await deleteVisualResource(id);
  }
}

export const visualLearningService = new VisualLearningService();

