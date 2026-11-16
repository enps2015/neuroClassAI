import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Palette,
  Lightbulb,
  Workflow,
  AlertTriangle,
  Loader2,
  Check,
  BookmarkPlus,
  RotateCcw,
  Trash2,
  Images,
  ExternalLink,
  Info,
  Maximize2,
  Clock,
  Key,
} from 'lucide-react';
import type {
  Concept,
  DocumentSource,
  VisualModality,
  VisualResource,
  VisualGenerationResponse,
} from '../../types';
import { AIKeyManager } from '../../services/ai/aiKeyManager';
import { visualLearningService } from '../../services/visual/visualLearningService';
import { generateCuratedDemoIllustration } from '../../services/visual/demoIllustrations';

interface VisualResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: Concept | null;
  document: DocumentSource | null;
  relatedConcepts?: string[];
  onSaved?: (resource: VisualResource) => void;
  onOpenApiKeyModal?: () => void;
}

export const VisualResourceModal: React.FC<VisualResourceModalProps> = ({
  isOpen,
  onClose,
  concept,
  document: doc,
  relatedConcepts = [],
  onSaved,
  onOpenApiKeyModal,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'library'>('generate');
  const [modality, setModality] = useState<VisualModality>('conceptual_illustration');
  const [hasCostConsent, setHasCostConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<VisualGenerationResponse | null>(null);
  const [isStaticDemoExample, setIsStaticDemoExample] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [libraryResources, setLibraryResources] = useState<VisualResource[]>([]);
  const [selectedEnlargedImage, setSelectedEnlargedImage] = useState<string | null>(null);

  // Carregar biblioteca visual do conceito ao abrir
  useEffect(() => {
    if (isOpen && concept) {
      loadLibrary();
    } else {
      setPreview(null);
      setIsStaticDemoExample(false);
      setSavedSuccess(false);
      setErrorMessage(null);
      setHasCostConsent(false);
      setActiveTab('generate');
      setSelectedEnlargedImage(null);
    }
  }, [isOpen, concept?.id]);

  // Fechar ampliação com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEnlargedImage) {
          setSelectedEnlargedImage(null);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEnlargedImage, isOpen, onClose]);

  const loadLibrary = async () => {
    if (!concept) return;
    try {
      const items = await visualLearningService.getSavedResourcesByConcept(concept.id);
      setLibraryResources(items);
    } catch (err) {
      console.warn('[VisualModal] Falha ao carregar biblioteca:', err);
    }
  };

  if (!isOpen || !concept) return null;

  const evidenceExcerpts = concept.evidenceReferences
    ? concept.evidenceReferences.map((ev) => {
        if (ev.type === 'pdf_page') return `Pág. ${(ev as any).pageNumber}: ${ev.excerpt || ''}`;
        return ev.excerpt || '';
      }).filter(Boolean)
    : [];

  const isDemo = Boolean(doc?.isDemoMaterial || doc?.id?.startsWith('demo_'));
  const hasApiKey = AIKeyManager.hasApiKey();

  const handleGenerate = async () => {
    if (!hasApiKey) {
      setErrorMessage(
        'Chave de API Gemini necessária. Conecte sua chave no menu de Configurações (BYOK) para gerar recursos visuais com IA.'
      );
      return;
    }

    if (!hasCostConsent) {
      setErrorMessage('É obrigatório marcar o consentimento de custos antes de gerar.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSavedSuccess(false);

    try {
      const response = await visualLearningService.generateVisualResource({
        documentId: doc?.id || 'doc_unknown',
        conceptId: concept.id,
        conceptName: concept.name,
        conceptDefinition: concept.definition,
        documentTitle: doc?.title || 'Material de Estudo',
        subject: doc?.subject,
        modality,
        evidenceExcerpts,
        relatedConcepts,
        confirmCostConsent: true,
      });

      setIsStaticDemoExample(false);
      setPreview(response);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha na comunicação com o serviço de geração visual.');
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadStaticDemoExample = () => {
    if (!isDemo || !concept) return;
    const demo = generateCuratedDemoIllustration(
      concept.id,
      concept.name,
      modality,
      doc?.title
    );
    setIsStaticDemoExample(true);
    setSavedSuccess(false);
    setErrorMessage(null);
    setPreview({
      imageDataUrl: demo.dataUrl,
      title: demo.title,
      caption: demo.caption,
      modality,
      conceptName: concept.name,
      modelUsed: 'Exemplo Estático Demonstrativo',
      promptUsed: 'Ilustração vetorial pedagógica de referência (sem consumo de API)',
      referenceExcerpts: evidenceExcerpts,
    });
  };

  const handleSaveToLibrary = async () => {
    if (!preview || !concept) return;

    try {
      const resource: VisualResource = {
        id: `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        documentId: doc?.id || 'doc_unknown',
        conceptId: concept.id,
        conceptName: concept.name,
        modality: preview.modality,
        title: preview.title,
        caption: preview.caption,
        promptUsed: preview.promptUsed,
        imageDataUrl: preview.imageDataUrl,
        mimeType: preview.imageDataUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/jpeg',
        referenceExcerpts: preview.referenceExcerpts,
        modelUsed: isStaticDemoExample ? 'Exemplo Estático Demonstrativo' : preview.modelUsed,
        createdAt: Date.now(),
      };

      await visualLearningService.saveResource(resource, doc?.subject || 'Geral');
      setSavedSuccess(true);
      await loadLibrary();
      onSaved?.(resource);
    } catch (err: any) {
      setErrorMessage('Falha ao salvar o recurso na biblioteca local: ' + err.message);
    }
  };

  const handleDiscard = () => {
    setPreview(null);
    setIsStaticDemoExample(false);
    setSavedSuccess(false);
    setErrorMessage(null);
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await visualLearningService.deleteResource(id);
      await loadLibrary();
    } catch (err: any) {
      console.warn('[VisualModal] Falha ao excluir:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Recursos Visuais Didáticos</h3>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40 font-semibold">
                  Visual Learning v1
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Conceito em Foco: <strong className="text-slate-200">{concept.name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Abas */}
            <div className="flex bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60 text-xs mr-2">
              <button
                type="button"
                onClick={() => setActiveTab('generate')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'generate'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gerar</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'library'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Images className="w-3.5 h-3.5" />
                <span>Biblioteca ({libraryResources.length})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mensagem de Erro Geral ou Card Educativo de Cota */}
        {errorMessage && (
          errorMessage.toLowerCase().includes('cota') ? (
            <div className="mx-6 mt-4 p-4 bg-amber-950/75 border border-amber-600/70 rounded-xl text-xs text-amber-200 space-y-2.5 shadow-xl animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-amber-100 text-xs flex items-center gap-2">
                      <span>Cota da Chave Gemini Atingida (Google AI Studio)</span>
                      <span className="px-2 py-0.5 bg-amber-900/80 border border-amber-700/60 rounded text-[10px] text-amber-300 font-mono">
                        HTTP 429
                      </span>
                    </h5>
                    <p className="text-[11px] text-amber-200/90 mt-1 leading-relaxed">
                      As chaves gratuitas do Google AI Studio possuem cota restrita para síntese de imagens (geralmente entre 15 e 50 imagens/dia). Essa restrição é da conta Google e não da nossa aplicação.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-amber-400 hover:text-white p-1 rounded-md hover:bg-amber-900/50 transition-colors"
                  title="Fechar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-950/70 p-2.5 rounded-lg border border-amber-900/40">
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-amber-300 font-semibold block">Por Minuto (RPM):</span>
                    <span className="text-slate-300">Se fez requisições rápidas seguidas, aguarde 60 a 120s.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-cyan-300 font-semibold block">Diária (RPD):</span>
                    <span className="text-slate-300">Renova à meia-noite do Pacífico (~04h/05h BRT).</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-900/40">
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenApiKeyModal && (
                    <button
                      type="button"
                      onClick={onOpenApiKeyModal}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Trocar / Usar Outra Chave BYOK</span>
                    </button>
                  )}
                  {isDemo && (
                    <button
                      type="button"
                      onClick={handleLoadStaticDemoExample}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-800/60 font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ver Exemplo de Demonstração (Sem Cota)</span>
                    </button>
                  )}
                </div>
                <a
                  href="https://aistudio.google.com/rate-limit"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1 font-semibold"
                >
                  <span>Ver cotas no Google AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="mx-6 mt-4 p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <div className="flex items-center gap-2">
                {(errorMessage.includes('Chave') || errorMessage.includes('BYOK') || errorMessage.includes('API')) && onOpenApiKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenApiKeyModal}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shrink-0 transition-colors"
                  >
                    Configurar Chave
                  </button>
                )}
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-400 hover:text-white text-xs ml-2 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        )}

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'generate' ? (
            <>
              {/* Alerta de Chave BYOK Não Configurada */}
              {!hasApiKey && (
                <div className="p-3.5 bg-amber-950/50 border border-amber-800/80 rounded-xl flex items-center justify-between text-xs text-amber-200 shadow-md">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-100 block">Chave Gemini (BYOK) não configurada</span>
                      <span className="text-[11px] text-amber-300/90">
                        A geração de novas ilustrações por IA requer sua chave individual do Google AI Studio.
                      </span>
                    </div>
                  </div>
                  {onOpenApiKeyModal && (
                    <button
                      type="button"
                      onClick={onOpenApiKeyModal}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shrink-0 ml-3 transition-colors cursor-pointer text-xs shadow-sm"
                    >
                      Configurar Chave
                    </button>
                  )}
                </div>
              )}
              {/* Contexto do Conceito */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    Definição Epistemológica
                  </span>
                  {doc?.title && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[280px]">
                      Doc: {doc.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{concept.definition}</p>
                {evidenceExcerpts.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                    <span className="text-slate-500 font-mono">Evidências:</span>
                    {evidenceExcerpts.map((excerpt, idx) => (
                      <span
                        key={idx}
                        className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-cyan-300 font-mono"
                      >
                        {excerpt.slice(0, 80)}...
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Seletor das 3 Modalidades */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  <span>Escolha a Modalidade Didática:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Modalidade 1 */}
                  <button
                    type="button"
                    onClick={() => setModality('conceptual_illustration')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modality === 'conceptual_illustration'
                        ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/50 shadow-md shadow-amber-950/50'
                        : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <strong className="text-xs">Ilustração Conceitual</strong>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Representação didática da estrutura e elementos essenciais do conceito.
                    </p>
                  </button>

                  {/* Modalidade 2 */}
                  <button
                    type="button"
                    onClick={() => setModality('visual_analogy')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modality === 'visual_analogy'
                        ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/50 shadow-md shadow-amber-950/50'
                        : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lightbulb className="w-4 h-4 text-cyan-400" />
                      <strong className="text-xs">Analogia Visual</strong>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Metáfora intuitiva do cotidiano para ancorar o princípio de funcionamento.
                    </p>
                  </button>

                  {/* Modalidade 3 */}
                  <button
                    type="button"
                    onClick={() => setModality('process_mechanism')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modality === 'process_mechanism'
                        ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/50 shadow-md shadow-amber-950/50'
                        : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Workflow className="w-4 h-4 text-violet-400" />
                      <strong className="text-xs">Processo / Mecanismo</strong>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Diagrama de fluxo causal e etapas do mecanismo sem sobrecarga textual.
                    </p>
                  </button>
                </div>
              </div>

              {/* Card de Custo e Consentimento Explícito */}
              <div className="bg-gradient-to-r from-amber-950/40 to-slate-950/80 border border-amber-700/50 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-amber-200">
                      Aviso de Custo e Consentimento de Cota (BYOK)
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Esta operação invoca os modelos de geração de imagem do Google Gemini com a sua chave pessoal (BYOK). A geração de imagens consome cota individual e pode incorrer em cobranças na sua conta Google caso a cota gratuita seja excedida. Não prometemos geração gratuita ou ilimitada.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 pt-2 border-t border-amber-800/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasCostConsent}
                    onChange={(e) => setHasCostConsent(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-600 bg-slate-900 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-xs font-medium text-amber-100">
                    Estou ciente dos custos de API e autorizo a chamada de geração para este conceito.
                  </span>
                </label>
              </div>

              {/* Botão de Disparo */}
              {!preview && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  {isDemo && (
                    <button
                      type="button"
                      onClick={handleLoadStaticDemoExample}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
                      title="Visualizar exemplo estático de referência pedagógica para este conceito de demonstração"
                    >
                      <Palette className="w-4 h-4 text-cyan-400" />
                      <span>Ver Exemplo Demonstrativo Estático</span>
                    </button>
                  )}

                  <div className="flex justify-end ml-auto">
                    {!hasApiKey ? (
                      <button
                        type="button"
                        onClick={onOpenApiKeyModal}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-amber-600 text-amber-300 hover:text-white text-xs font-bold rounded-xl border border-amber-700/60 transition-all cursor-pointer"
                        title="Conectar chave de API Gemini no menu de Configurações para habilitar a geração por IA"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Conectar Chave BYOK para Gerar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!hasCostConsent || isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Gerando Recurso Visual com Gemini...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-white" />
                            <span>Gerar Recurso Visual com IA</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Preview e Ações Pós-Geração */}
              {preview && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4 animate-fade-in shadow-xl">
                  {/* Rótulo Explícito para Exemplo Demonstrativo Estático */}
                  {isStaticDemoExample && (
                    <div className="bg-cyan-950/60 border border-cyan-800/80 rounded-xl p-3 flex items-center justify-between text-xs text-cyan-200">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="font-semibold">
                          Exemplo demonstrativo — imagem estática, não gerada nesta sessão.
                        </span>
                      </div>
                      {onOpenApiKeyModal && !hasApiKey && (
                        <button
                          type="button"
                          onClick={onOpenApiKeyModal}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-[11px] shrink-0 ml-2 cursor-pointer"
                        >
                          Conectar BYOK para Gerar
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold">
                        {isStaticDemoExample
                          ? 'Exemplo de Referência Pedagógica'
                          : 'Preview da Ilustração Gerada por IA'}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{preview.title}</h4>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {isStaticDemoExample ? 'Exemplo Estático' : `Modelo: ${preview.modelUsed}`}
                    </span>
                  </div>

                  {/* Quadro da Imagem */}
                  <div className="relative group bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[300px] max-h-[460px]">
                    <img
                      src={preview.imageDataUrl}
                      alt={preview.title}
                      className="w-full h-full object-contain max-h-[450px] transition-transform duration-300 group-hover:scale-[1.01]"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedEnlargedImage(preview.imageDataUrl)}
                      className="absolute bottom-3 right-3 p-2 bg-slate-950/80 hover:bg-slate-900 text-slate-200 hover:text-white rounded-lg border border-slate-700/80 transition-colors shadow-lg opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Expandir imagem"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Legenda Textual Separada da Imagem (Prevenção de Erros Tipográficos) */}
                  <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Info className="w-3.5 h-3.5" />
                      <span>Legenda Pedagógica Contextualizada</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{preview.caption}</p>
                    <p className="text-[10px] text-slate-500 italic">
                      * Imagem gerada estritamente sem textos internos para garantir conformidade epistemológica e evitar ruídos gráficos.
                    </p>
                  </div>

                  {/* Barra de Ações: Salvar / Regenerar / Descartar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDiscard}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        title="Descartar este preview sem salvar"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Descartar</span>
                      </button>

                      {/* Botão Gerar Novamente (exibido APENAS para geração real por IA, nunca para exemplo estático) */}
                      {!isStaticDemoExample && (
                        <button
                          type="button"
                          onClick={handleGenerate}
                          disabled={isLoading || !hasCostConsent || !hasApiKey}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-300 hover:text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          title="Gerar nova imagem com a API Gemini"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                              <span>Gerando...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Gerar Novamente</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveToLibrary}
                      disabled={isLoading || savedSuccess}
                      className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-md ${
                        savedSuccess
                          ? 'bg-emerald-600 text-white cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-600/20'
                      }`}
                    >
                      {savedSuccess ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Salvo na Biblioteca!</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-4 h-4 text-white" />
                          <span>Salvar na Biblioteca Visual</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Aba da Biblioteca Visual */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Biblioteca Visual do Conceito</h4>
                  <p className="text-xs text-slate-400">
                    Ilustrações salvas localmente para "{concept.name}".
                  </p>
                </div>
                <span className="text-xs font-mono text-cyan-400">
                  {libraryResources.length} recurso(s)
                </span>
              </div>

              {libraryResources.length === 0 ? (
                <div className="text-center py-12 space-y-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <Images className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">
                    Nenhum recurso visual salvo ainda para este conceito.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('generate')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    Gerar Primeira Ilustração
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {libraryResources.map((res) => (
                    <div
                      key={res.id}
                      className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-lg"
                    >
                      <div className="relative group bg-slate-900 h-48 flex items-center justify-center overflow-hidden border-b border-slate-800">
                        <img
                          src={res.imageDataUrl}
                          alt={res.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedEnlargedImage(res.imageDataUrl)}
                          className="absolute bottom-2 right-2 p-1.5 bg-slate-950/80 hover:bg-slate-900 text-white rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Ampliar"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-semibold text-amber-400 uppercase">
                              {res.modality === 'visual_analogy'
                                ? 'Analogia Visual'
                                : res.modality === 'process_mechanism'
                                ? 'Processo'
                                : 'Ilustração'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(res.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h5 className="text-xs font-bold text-white">{res.title}</h5>
                          <p className="text-[11px] text-slate-300 line-clamp-3 mt-1 leading-relaxed">
                            {res.caption}
                          </p>
                        </div>

                        <div className="flex items-center justify-end pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => handleDeleteSaved(res.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors text-xs flex items-center gap-1"
                            title="Excluir da biblioteca"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Imagem Ampliada (Lightbox com dimensões explícitas) */}
      {selectedEnlargedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in"
          onClick={() => setSelectedEnlargedImage(null)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[92vh] flex flex-col items-center justify-center bg-slate-950/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header da Imagem Ampliada */}
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 px-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Visualização Ampliada</span>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                  {concept.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEnlargedImage(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Fechar ampliação (ESC ou clique fora)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Imagem Ampliada com Contêiner de Dimensão Concreta */}
            <div className="relative w-full flex items-center justify-center overflow-hidden max-h-[80vh] min-h-[300px]">
              <img
                src={selectedEnlargedImage}
                alt={`Recurso Visual: ${concept.name}`}
                className="w-full h-auto max-h-[78vh] object-contain rounded-xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

