/**
 * NeuroClass AI — Resolvedor e Validador de Ativos Visuais do Tutor (Missão R2)
 * @module services/retrieval/tutorVisualResolverService
 *
 * Responsável por:
 * 1. Identificar intenções visuais (figuras, gráficos, diagramas, tabelas, fórmulas, páginas) na consulta;
 * 2. Recuperar o recurso visual correspondente estritamente dentro do documento ativo;
 * 3. Assegurar rastreabilidade de proveniência (documentId, página física, ID estável);
 * 4. Validar formato MIME, tamanho máximo e integridade de base64 contra corrupção;
 * 5. Impedir contaminação cruzada entre documentos (isolamento A/B);
 * 6. Preservar a declaração honesta de incerteza em imagens ambíguas ou cortadas.
 */

import type { DocumentSource, Concept, DocumentPage } from '../../types';
import type {
  TutorVisualAsset,
  TutorVisualAssetType,
  TutorVisualContextResult,
} from '../../types/rag';

export const MAX_TUTOR_VISUAL_ASSETS = 2;
export const MAX_VISUAL_ASSET_BYTES = 4 * 1024 * 1024; // 4 MB por imagem
export const ALLOWED_VISUAL_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Remove cabeçalho Data URL se presente e espaços em branco.
 */
export function sanitizeBase64(raw: string): { data: string; mimeType?: string } {
  if (!raw || typeof raw !== 'string') {
    return { data: '' };
  }
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return {
      mimeType: match[1].toLowerCase().trim(),
      data: match[2].replace(/\s+/g, ''),
    };
  }
  return {
    data: trimmed.replace(/\s+/g, ''),
  };
}

/**
 * Validação rigorosa do payload visual (MIME, integridade, limites).
 */
export function validateVisualAssetPayload(asset: TutorVisualAsset): {
  valid: boolean;
  error?: string;
  cleanBase64?: string;
} {
  if (!asset) {
    return { valid: false, error: 'Ativo visual nulo ou indefinido.' };
  }

  // 1. Validação de MIME
  const rawMime = (asset.mimeType || '').toLowerCase().trim();
  const sanitized = sanitizeBase64(asset.imageBase64 || '');
  const effectiveMime = sanitized.mimeType || rawMime;

  if (!ALLOWED_VISUAL_MIME_TYPES.has(effectiveMime)) {
    return {
      valid: false,
      error: `Formato MIME não suportado: "${effectiveMime || 'desconhecido'}". Apenas image/png, image/jpeg e image/webp são aceitos.`,
    };
  }

  // 2. Validação de integridade de base64
  const base64Data = sanitized.data;
  if (!base64Data || base64Data.length < 32) {
    return {
      valid: false,
      error: 'Dados de imagem vazios ou corrompidos (base64 insuficiente).',
    };
  }

  // Regex estrita de integridade base64
  const isBase64Valid = /^[A-Za-z0-9+/=]+$/.test(base64Data);
  if (!isBase64Valid) {
    return {
      valid: false,
      error: 'Payload visual corrompido: caracteres inválidos detectados na codificação base64.',
    };
  }

  // 3. Validação de tamanho (tamanho aproximado decodificado = (base64.length * 3) / 4)
  const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
  if (estimatedBytes > MAX_VISUAL_ASSET_BYTES) {
    const sizeMb = (estimatedBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Imagem excede o limite seguro de 4MB (tamanho aproximado: ${sizeMb}MB). Reduza a resolução antes de enviar.`,
    };
  }

  return {
    valid: true,
    cleanBase64: base64Data,
  };
}

/**
 * Identifica se uma consulta do estudante requer interpretação visual direta.
 */
export function isVisualIntentQuery(query: string, activeConcept?: Concept | null): boolean {
  if (!query) return false;
  const q = query.toLowerCase();

  const visualKeywords = [
    'gráfico',
    'grafico',
    'figura',
    'diagrama',
    'ilustração',
    'ilustracao',
    'tabela',
    'fórmula',
    'formula',
    'equação',
    'equacao',
    'curva',
    'eixo',
    'imagem',
    'esquema',
    'foto',
    'quadro',
    'desenho',
    'observando',
    'olhando',
    'veja',
  ];

  const hasKeyword = visualKeywords.some((kw) => q.includes(kw));
  if (hasKeyword) return true;

  // Se o conceito ativo possui evidências visuais diretas
  if (activeConcept?.evidenceReferences) {
    const hasVisualEvidence = activeConcept.evidenceReferences.some((ev) =>
      ['figure', 'table', 'formula', 'chart'].includes(ev.type)
    );
    if (hasVisualEvidence && (q.includes('como') || q.includes('mostra') || q.includes('representa'))) {
      return true;
    }
  }

  return false;
}

/**
 * Extrai número de página física mencionada na consulta (ex.: "na página 4", "pág 2", "p. 5").
 */
export function extractPageNumberFromQuery(query: string): number | null {
  if (!query) return null;
  const match = query.match(/(?:p[áa]gina|p[áa]g\.?|p\.)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  return null;
}

export interface ResolveVisualOptions {
  document: DocumentSource;
  query: string;
  activeConcept?: Concept | null;
  targetPageNumber?: number;
  targetElementType?: TutorVisualAssetType;
  maxAssets?: number;
  explicitAssets?: TutorVisualAsset[];
}

/**
 * Resolve e valida os ativos visuais a serem encaminhados ao Tutor.
 */
export function resolveTutorVisualAssets(options: ResolveVisualOptions): TutorVisualContextResult {
  const { document, query, activeConcept, targetPageNumber, maxAssets = MAX_TUTOR_VISUAL_ASSETS } = options;

  if (!document) {
    return {
      visualAssets: [],
      hasVisualContent: false,
      rejectionReason: 'Nenhum documento ativo fornecido para resolução visual.',
    };
  }

  // Se foram fornecidos ativos explícitos (ex: teste ou seleção direta do usuário)
  if (options.explicitAssets && options.explicitAssets.length > 0) {
    const validatedAssets: TutorVisualAsset[] = [];
    const descriptions: string[] = [];

    for (const rawAsset of options.explicitAssets) {
      // 1. ISOLAMENTO ESTRITO DOCUMENTAL (Documento A vs Documento B)
      if (rawAsset.documentId !== document.id) {
        return {
          visualAssets: [],
          hasVisualContent: false,
          rejectionReason: `Violação de isolamento documental: ativo "${rawAsset.id}" pertence ao documento "${rawAsset.documentId}", mas o documento ativo é "${document.id}".`,
        };
      }

      // 2. Validação do payload
      const validation = validateVisualAssetPayload(rawAsset);
      if (!validation.valid) {
        return {
          visualAssets: [],
          hasVisualContent: false,
          rejectionReason: validation.error,
        };
      }

      const cleanAsset: TutorVisualAsset = {
        ...rawAsset,
        imageBase64: validation.cleanBase64 || rawAsset.imageBase64,
        id: rawAsset.id || `${document.id}_p${rawAsset.pageNumber}_${rawAsset.type}`,
      };

      validatedAssets.push(cleanAsset);
      descriptions.push(
        `[Elemento Visual: ${cleanAsset.type.toUpperCase()} | Rótulo: "${cleanAsset.label || cleanAsset.id}" | Página: ${cleanAsset.pageNumber}]`
      );

      if (validatedAssets.length >= maxAssets) break;
    }

    return {
      visualAssets: validatedAssets,
      hasVisualContent: validatedAssets.length > 0,
      visualEvidenceDescriptions: descriptions,
    };
  }

  // Determinar página-alvo
  let pageNum: number | null = targetPageNumber || null;
  if (!pageNum) {
    pageNum = extractPageNumberFromQuery(query);
  }

  // Se não foi informada página explícita, verifica o conceito ativo
  if (!pageNum && activeConcept?.evidenceReferences) {
    const visualRef = activeConcept.evidenceReferences.find((ev) =>
      ['figure', 'table', 'formula', 'chart'].includes(ev.type) && (ev as any).pageNumber
    );
    if (visualRef && (visualRef as any).pageNumber) {
      pageNum = (visualRef as any).pageNumber;
    }
  }

  if (!pageNum || !document.pages || document.pages.length === 0) {
    return {
      visualAssets: [],
      hasVisualContent: false,
      warningNotice: 'Nenhuma página ou elemento visual específico foi indicado ou associado à consulta.',
    };
  }

  // Localiza a página física
  const page = document.pages.find((p) => p.pageNumber === pageNum);
  if (!page) {
    return {
      visualAssets: [],
      hasVisualContent: false,
      warningNotice: `Página ${pageNum} não encontrada no documento "${document.title}".`,
    };
  }

  // Verifica se a página possui imagem associada (pageImageBase64)
  if (!page.pageImageBase64) {
    return {
      visualAssets: [],
      hasVisualContent: false,
      warningNotice: `A Página ${pageNum} do documento "${document.title}" não possui renderização de imagem disponível para análise visual direta.`,
    };
  }

  // Determina o tipo de elemento
  let elemType: TutorVisualAssetType = options.targetElementType || 'page_crop';
  if (!options.targetElementType) {
    if (page.detectedElements?.hasFigures || /figura|diagrama/i.test(query)) {
      elemType = 'figure';
    } else if (page.detectedElements?.hasCharts || /gr[áa]fico|curva|eixo/i.test(query)) {
      elemType = 'chart';
    } else if (page.detectedElements?.hasTables || /tabela|quadro/i.test(query)) {
      elemType = 'table';
    } else if (page.detectedElements?.hasFormulas || /f[óo]rmula|equa[çc][ãa]o/i.test(query)) {
      elemType = 'formula';
    }
  }

  const asset: TutorVisualAsset = {
    id: `${document.id}_p${page.pageNumber}_${elemType}`,
    documentId: document.id,
    pageNumber: page.pageNumber,
    type: elemType,
    label: `${elemType.toUpperCase()} (Pág. ${page.pageNumber})`,
    imageBase64: page.pageImageBase64,
    mimeType: 'image/png',
    contextExcerpt: page.textContent ? page.textContent.slice(0, 300) : undefined,
  };

  const validation = validateVisualAssetPayload(asset);
  if (!validation.valid) {
    return {
      visualAssets: [],
      hasVisualContent: false,
      rejectionReason: validation.error,
    };
  }

  asset.imageBase64 = validation.cleanBase64 || asset.imageBase64;

  return {
    visualAssets: [asset],
    hasVisualContent: true,
    visualEvidenceDescriptions: [
      `[Evidência Visual: ${asset.type.toUpperCase()} | Rótulo: "${asset.label}" | Página Física: ${asset.pageNumber}]`,
    ],
  };
}

/**
 * Formata o cabeçalho de proveniência visual a ser injetado nas partes de texto do modelo.
 */
export function formatVisualProvenanceHeader(asset: TutorVisualAsset, documentTitle: string): string {
  return `[Evidência Visual Documental — Tipo: ${asset.type.toUpperCase()}, Rótulo: "${asset.label || asset.id}", Página Física: ${asset.pageNumber}, Documento: "${documentTitle}"]`;
}

