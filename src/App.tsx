import { useState, useEffect, useCallback, useRef } from 'react';
import type { Concept, DocumentSource, LearningAnalysis, StudyNote, TutorChatMessage, ConceptMastery } from './types';
import {
  getAllUserDocuments,
  saveDocument,
  getAnalysisByDocumentId,
  saveAnalysis,
  getNotesByDocumentId,
  saveStudyNote,
  deleteStudyNote,
  getChatSession,
  saveChatSession,
  checkStorageQuota,
  exportUserDataAsJson,
  getAllMasteryByDocument,
  getReviewSchedulesByDocument,
  deleteDocumentCompletely,
  clearAllUserData,
  getVisualResourcesByDocument,
  getConceptMastery,
  getReviewSchedule,
  getSessionsByDocument,
  getAttemptsByDocument,
} from './services/persistence/indexedDb';
import { BackupService } from './services/storage/backupService';
import { ingestDocumentRAG } from './services/documents/ragIngestionService';
import { DEMO_MATERIALS } from './services/documents/demoMaterials';
import { requestDocumentAnalysis } from './services/ai/aiClient';
import { AIServiceHealth } from './services/ai/aiHealth';
import { TopBar } from './components/layout/TopBar';
import { Blackboard } from './components/blackboard/Blackboard';
import { TutorPanel } from './components/tutor/TutorPanel';
import { StudyNotebook } from './components/notebook/StudyNotebook';
import { DocumentUploadModal } from './components/documents/DocumentUploadModal';
import { DemoModal } from './components/documents/DemoModal';
import { AgoraEuExplicoModal } from './components/explanation/AgoraEuExplicoModal';
import { CrearCycleModal } from './components/crear/CrearCycleModal';
import { SpacedReviewModal } from './components/review/SpacedReviewModal';
import { VisualResourceModal } from './components/visual/VisualResourceModal';
import { WelcomeModal } from './components/onboarding/WelcomeModal';
import { ProductTour } from './components/onboarding/ProductTour';
import { ProductGuideModal } from './components/onboarding/ProductGuideModal';
import { DynamicGuidancePanel } from './components/guidance/DynamicGuidancePanel';
import { ApiKeyConfigModal } from './components/settings/ApiKeyConfigModal';
import { GoldenDatasetModal } from './components/experimental/GoldenDatasetModal';
import { SemanticRetrievalModal } from './components/settings/SemanticRetrievalModal';
import { hasConsent } from './services/retrieval/semanticConsentService';
import { WorkspaceStorageModal } from './components/storage/WorkspaceStorageModal';
import { OcrProcessingModal } from './components/documents/OcrProcessingModal';
import { workspaceStorage } from './services/storage/workspaceStorage';
import { AIKeyManager } from './services/ai/aiKeyManager';
import {
  getStoredOnboardingState,
  setStoredOnboardingState,
  resetStoredOnboardingState,
} from './components/onboarding/onboardingData';
import { BookOpen, AlertCircle, FileCheck, Brain, ArrowRight, ScanText } from 'lucide-react';

export default function App() {
  // Lista de documentos (pessoais persistidos + demos se ativadas)
  const [documents, setDocuments] = useState<DocumentSource[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentSource | null>(null);
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [chatHistory, setChatHistory] = useState<TutorChatMessage[]>([]);
  const [masteryMap, setMasteryMap] = useState<Record<string, ConceptMastery>>({});

  // Modais e UI de controle
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);
  const [isCrearModalOpen, setIsCrearModalOpen] = useState(false);
  const [isSpacedReviewOpen, setIsSpacedReviewOpen] = useState(false);
  const [spacedReviewConceptId, setSpacedReviewConceptId] = useState<string | null>(null);
  const [isVisualModalOpen, setIsVisualModalOpen] = useState(false);
  const [reviewDueCount, setReviewDueCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'blackboard' | 'notebook' | 'document_preview'>('blackboard');

  // Modais de Onboarding, Tour, Guia e Configurações BYOK
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(() => {
    const st = getStoredOnboardingState();
    return !st.hasCompletedWelcome;
  });
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isGoldenDatasetModalOpen, setIsGoldenDatasetModalOpen] = useState<boolean>(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState<boolean>(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState<boolean>(false);
  const [isSemanticModalOpen, setIsSemanticModalOpen] = useState<boolean>(false);
  const [isSemanticConsentActive, setIsSemanticConsentActive] = useState<boolean>(() => hasConsent());
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => AIKeyManager.hasApiKey());

  // Monitorar saúde do serviço e credencial Gemini
  useEffect(() => {
    const unsubKey = AIKeyManager.subscribe(st => {
      setHasApiKey(st.hasKey || st.source === 'managed');
    });
    // Verifica se o backend possui chave administrada no .env
    fetch('/api/health')
      .then(r => r.json())
      .then(d => {
        if (d.hasApiKey && d.keyMode === 'managed') {
          AIKeyManager.setManagedMode();
        }
      })
      .catch(() => {});

    return () => unsubKey();
  }, []);

  // Estado de Saúde e Armazenamento
  const [healthStatus, setHealthStatus] = useState(AIServiceHealth.getStatus('gemini_multimodal'));
  const [storageUsage, setStorageUsage] = useState({ usagePercent: 0, isCritical: false });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  // Monitorar saúde do serviço
  useEffect(() => {
    const unsubscribe = AIServiceHealth.subscribe(() => {
      setHealthStatus(AIServiceHealth.getStatus('gemini_multimodal'));
    });
    return () => unsubscribe();
  }, []);

  // Monitorar cota de armazenamento
  const refreshStorage = useCallback(async () => {
    const quota = await checkStorageQuota();
    setStorageUsage({
      usagePercent: quota.usagePercent,
      isCritical: quota.isCritical,
    });
  }, []);

  // Recarregar registros de domínio cognitivo C.R.E.A.R. do documento ativo
  const reloadMastery = useCallback(async (docId: string) => {
    if (!docId) return;
    try {
      const list = await getAllMasteryByDocument(docId);
      const map: Record<string, ConceptMastery> = {};
      for (const m of list) {
        map[m.conceptId] = m;
      }
      setMasteryMap(map);
    } catch (err) {
      console.error('Erro ao carregar dados de domínio cognitivo:', err);
    }
  }, []);

  // Recarregar contador de revisões pendentes (vencidas ou para hoje)
  const refreshReviewCount = useCallback(async (docId?: string) => {
    if (!docId) {
      setReviewDueCount(0);
      return;
    }
    try {
      const schedules = await getReviewSchedulesByDocument(docId);
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const dueCount = schedules.filter(s => new Date(s.nextReviewDue) <= todayMidnight).length;
      setReviewDueCount(dueCount);
    } catch (err) {
      console.error('Erro ao verificar agendamentos FSRS:', err);
    }
  }, []);

  // Carregar documentos salvos na inicialização
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__workspaceStorage = workspaceStorage;
      (window as any).__BackupService = BackupService;
      (window as any).__idb = {
        getAllUserDocuments,
        getAnalysisByDocumentId,
        getNotesByDocumentId,
        getVisualResourcesByDocument,
        getChatSession,
        getConceptMastery,
        getReviewSchedule,
        getSessionsByDocument,
        getAttemptsByDocument,
        clearAllUserData,
      };
    }

    const initApp = async () => {
      try {
        await workspaceStorage.init();
        const userDocs = await getAllUserDocuments();
        setDocuments(userDocs);
        await refreshStorage();

        // Se o usuário não tiver documentos, carrega a demo de Neurobiologia como exemplo inicial em memória
        if (userDocs.length > 0) {
          handleSelectDocument(userDocs[0]);
        } else {
          const firstDemo = DEMO_MATERIALS[0];
          setActiveDocument(firstDemo.document);
          setAnalysis(firstDemo.analysis);
          setSelectedConcept(firstDemo.analysis.fundamentalConcepts[0] || null);
          setDocuments([firstDemo.document]);
          await reloadMastery(firstDemo.document.id);
          await refreshReviewCount(firstDemo.document.id);
        }
      } catch (err) {
        console.error('Falha ao inicializar o banco IndexedDB:', err);
      }
    };
    initApp();
  }, [refreshStorage, reloadMastery, refreshReviewCount]);

  // Troca de Documento Ativo com isolamento completo de contexto
  const handleSelectDocument = async (doc: DocumentSource) => {
    setActiveDocument(doc);
    setSelectedConcept(null);
    setAnalysis(null);

    // Se for material de demonstração, recupera do catálogo estático imutável
    if (doc.isDemoMaterial) {
      const demo = DEMO_MATERIALS.find(d => d.document.id === doc.id);
      if (demo) {
        setAnalysis(demo.analysis);
        setSelectedConcept(demo.analysis.fundamentalConcepts[0] || null);
      }
      setNotes([]);
      setChatHistory([]);
      await reloadMastery(doc.id);
      await refreshReviewCount(doc.id);
      return;
    }

    // Carrega dados persistidos do IndexedDB
    try {
      const savedAnalysis = await getAnalysisByDocumentId(doc.id);
      if (savedAnalysis) {
        setAnalysis(savedAnalysis);
        setSelectedConcept(savedAnalysis.fundamentalConcepts[0] || null);
      }

      const savedNotes = await getNotesByDocumentId(doc.id);
      setNotes(savedNotes);

      const savedChat = await getChatSession(doc.id);
      setChatHistory(savedChat);

      await reloadMastery(doc.id);
      await refreshReviewCount(doc.id);
    } catch (err) {
      console.error('Erro ao alternar de documento:', err);
    }
  };

  // Importar novo documento PDF ou Anotações
  const handleDocumentImported = async (
    doc: DocumentSource,
    fileBlob?: Blob,
    base64Data?: string
  ) => {
    setIsAnalyzing(true);
    setNotification({ type: 'info', message: 'Processando documento e extraindo relações conceituais...' });

    try {
      // 1. Salvar no repositório Local-First (persistência do binário original antes da análise)
      if (fileBlob) {
        await workspaceStorage.saveOriginalPdf(doc, fileBlob);
      } else {
        await saveDocument(doc);
      }
      await refreshStorage();

      // 2. Ingestão RAG Local-First (Fase A3: Chunking -> Persistência -> Validação Pós-Gravação)
      try {
        const ragResult = await ingestDocumentRAG(doc);
        if (ragResult.status === 'completed_partial_ocr_pending') {
          console.info(`[RAG] Documento "${doc.title}" indexado com OCR pendente (${ragResult.chunksCount} chunks).`);
        } else if (ragResult.status === 'indexed') {
          console.info(`[RAG] Documento "${doc.title}" indexado com sucesso (${ragResult.chunksCount} chunks salvos e verificados).`);
        }
      } catch (ragErr) {
        console.error('[RAG] Falha na ingestão documental RAG:', ragErr);
      }

      // 3. Executar análise com visão multimodal do Gemini API
      const analysisResult = await requestDocumentAnalysis({
        documentId: doc.id,
        title: doc.title,
        subject: doc.subject,
        fileBase64: base64Data,
        mimeType: doc.mimeType,
        textPages: doc.pages?.map(p => ({
          pageNumber: p.pageNumber,
          textContent: p.textContent,
          hasVisualElements: p.hasVisualElements,
          isScanned: p.isScanned,
          legibility: p.legibility,
          detectedElements: p.detectedElements,
          pageImageBase64: p.pageImageBase64,
        })),
        noteSections: doc.noteSections,
        activeChunkRange: doc.activeChunkRange,
        pageCount: doc.pageCount,
        tableOfContents: doc.tableOfContents,
      });

      // 3. Salvar análise no banco e pasta local
      await workspaceStorage.saveAnalysis(analysisResult, doc.subject || 'Geral');

      // 4. Atualizar estado da aplicação
      const updatedDocs = await getAllUserDocuments();
      setDocuments(updatedDocs);
      setActiveDocument(doc);
      setAnalysis(analysisResult);
      setSelectedConcept(analysisResult.fundamentalConcepts[0] || null);
      setNotes([]);
      setChatHistory([]);

      setNotification({
        type: 'success',
        message: `Análise concluída: ${analysisResult.fundamentalConcepts.length} conceitos extraídos com evidências.`,
      });
    } catch (err: any) {
      console.error('Erro na análise multimodal:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Falha na análise do material. O arquivo foi preservado localmente.',
      });
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setNotification(null), 6000);
    }
  };

  // Regenerar Grafo Conceitual com Máxima Densidade sem precisar reenviar o PDF
  const handleRegenerateGraph = async () => {
    if (!activeDocument) return;

    setIsAnalyzing(true);
    setNotification({
      type: 'info',
      message: `Reanalisando "${activeDocument.title}" com algoritmo de alta densidade cognitiva...`,
    });

    try {
      const analysisResult = await requestDocumentAnalysis({
        documentId: activeDocument.id,
        title: activeDocument.title,
        subject: activeDocument.subject,
        mimeType: activeDocument.mimeType,
        textPages: activeDocument.pages?.map(p => ({
          pageNumber: p.pageNumber,
          textContent: p.textContent,
          hasVisualElements: p.hasVisualElements,
          isScanned: p.isScanned,
          legibility: p.legibility,
          detectedElements: p.detectedElements,
          pageImageBase64: p.pageImageBase64,
        })),
        noteSections: activeDocument.noteSections,
        activeChunkRange: activeDocument.activeChunkRange,
        pageCount: activeDocument.pageCount,
        tableOfContents: activeDocument.tableOfContents,
      });

      // Salvar nova análise na pasta local e IndexedDB
      await workspaceStorage.saveAnalysis(analysisResult, activeDocument.subject || 'Geral');

      // Atualizar o estado da aplicação
      setAnalysis(analysisResult);
      if (analysisResult.fundamentalConcepts.length > 0) {
        setSelectedConcept(analysisResult.fundamentalConcepts[0]);
      }

      setNotification({
        type: 'success',
        message: `Grafo atualizado com sucesso! ${analysisResult.fundamentalConcepts.length} conceitos fundamentais e ${analysisResult.relationships.length} conexões estruturadas.`,
      });
    } catch (err: any) {
      console.error('Erro ao regenerar grafo:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Falha ao reanalisar o documento. Tente novamente em instantes.',
      });
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setNotification(null), 6000);
    }
  };

  // Carregar Exemplo do Catálogo de Demonstração
  const handleLoadDemo = (demoDoc: DocumentSource) => {
    const demo = DEMO_MATERIALS.find(d => d.document.id === demoDoc.id);
    if (!demo) return;

    // Garante que o documento apareça na lista de seleção sem poluir o IndexedDB
    setDocuments(prev => {
      if (prev.some(d => d.id === demoDoc.id)) return prev;
      return [demoDoc, ...prev];
    });

    setActiveDocument(demo.document);
    setAnalysis(demo.analysis);
    setSelectedConcept(demo.analysis.fundamentalConcepts[0] || null);
    setNotes([]);
    setChatHistory([]);
    setNotification({
      type: 'info',
      message: `Modo de Demonstração ativado: "${demoDoc.title}"`,
    });
    setTimeout(() => setNotification(null), 4000);
  };

  // Exclusão individual de documento do usuário e dados associados (Right to be Forgotten)
  const handleDeleteDocument = async (documentId: string) => {
    const docToDelete = documents.find(d => d.id === documentId);
    if (!docToDelete || docToDelete.isDemoMaterial) return;

    try {
      await workspaceStorage.deleteDocument(documentId, docToDelete.subject || 'Geral');
      const remainingDocs = await getAllUserDocuments();
      await refreshStorage();

      if (remainingDocs.length > 0) {
        setDocuments(remainingDocs);
        handleSelectDocument(remainingDocs[0]);
      } else {
        const firstDemo = DEMO_MATERIALS[0];
        setDocuments([firstDemo.document]);
        setActiveDocument(firstDemo.document);
        setAnalysis(firstDemo.analysis);
        setSelectedConcept(firstDemo.analysis.fundamentalConcepts[0] || null);
        setNotes([]);
        setChatHistory([]);
        await reloadMastery(firstDemo.document.id);
        await refreshReviewCount(firstDemo.document.id);
      }

      setNotification({
        type: 'info',
        message: `Documento "${docToDelete.title}" e todos os seus dados foram excluídos com sucesso.`,
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err) {
      console.error('Falha ao excluir documento:', err);
      setNotification({
        type: 'error',
        message: 'Erro ao excluir o documento local.',
      });
      setTimeout(() => setNotification(null), 3500);
    }
  };

  // Reset total de fábrica: apaga todos os 9 stores do IndexedDB, zera preferências de onboarding e volta à tela inicial
  const handleFactoryReset = async () => {
    try {
      await clearAllUserData();
      resetStoredOnboardingState();

      const firstDemo = DEMO_MATERIALS[0];
      setDocuments([firstDemo.document]);
      setActiveDocument(firstDemo.document);
      setAnalysis(firstDemo.analysis);
      setSelectedConcept(firstDemo.analysis.fundamentalConcepts[0] || null);
      setNotes([]);
      setChatHistory([]);
      setMasteryMap({});
      setReviewDueCount(0);

      await refreshStorage();

      // Fechar todos os modais em aberto e exibir a tela inicial de boas-vindas
      setIsTourOpen(false);
      setIsGuideOpen(false);
      setIsExplainModalOpen(false);
      setIsCrearModalOpen(false);
      setIsSpacedReviewOpen(false);
      setIsDemoModalOpen(false);
      setIsUploadModalOpen(false);
      setIsWelcomeModalOpen(true);

      setNotification({
        type: 'success',
        message: 'Todos os documentos e dados locais foram removidos. O NeuroClass AI foi restaurado ao estado inicial!',
      });
      setTimeout(() => setNotification(null), 4500);
    } catch (err) {
      console.error('Falha ao executar reset de fábrica:', err);
      setNotification({
        type: 'error',
        message: 'Erro ao limpar dados locais do navegador.',
      });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Salvar nota no caderno
  const handleSaveNote = async (note: StudyNote) => {
    try {
      await workspaceStorage.saveStudyNote(note, activeDocument?.subject || 'Geral');

      if (activeDocument) {
        try {
          const updatedNotes = await getNotesByDocumentId(activeDocument.id);
          setNotes(updatedNotes);
        } catch (queryErr: any) {
          console.error('[App] Falha ao recarregar coleção após salvar:', queryErr);
          // Atualização de contingência em memória para prevenir divergência/perda de dados
          setNotes((prev) => {
            const idx = prev.findIndex((n) => n.id === note.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = note;
              return next;
            }
            return [...prev, note];
          });
          throw new Error(
            `Nota gravada, mas a confirmação da lista falhou: ${queryErr.message || 'Erro de leitura'}`
          );
        }
      }

      await refreshStorage();
      setNotification({
        type: 'success',
        message: `Nota "${note.title}" salva no Caderno de Estudos com sucesso!`,
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      console.error('[App] Erro ao salvar nota:', err);
      setNotification({
        type: 'error',
        message: `Não foi possível salvar a nota: ${err.message || 'Erro de armazenamento local'}`,
      });
      setTimeout(() => setNotification(null), 4000);
      throw err;
    }
  };

  // Deletar nota
  const handleDeleteNote = async (noteId: string) => {
    await workspaceStorage.deleteStudyNote(noteId, activeDocument?.subject || 'Geral');
    if (activeDocument) {
      const updatedNotes = await getNotesByDocumentId(activeDocument.id);
      setNotes(updatedNotes);
    }
    await refreshStorage();
  };

  // Adicionar mensagem ao chat do tutor com atualização funcional segura
  const handleAddChatMessage = useCallback((msg: TutorChatMessage) => {
    setChatHistory(prev => {
      const updated = [...prev, msg];
      if (activeDocument && !activeDocument.isDemoMaterial) {
        workspaceStorage.saveChatSession(activeDocument.id, updated, activeDocument.subject || 'Geral').catch(err =>
          console.error('Falha ao salvar sessão do chat:', err)
        );
      }
      return updated;
    });
  }, [activeDocument]);

  // Exportar dados do estudante
  const handleExportBackup = async () => {
    try {
      const jsonStr = await exportUserDataAsJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neuroclass_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Falha ao exportar backup:', err);
    }
  };

  const tutorPanelRef = useRef<{ askAboutConcept: (concept: Concept) => void }>(null);

  return (
    <div className="flex flex-col h-screen bg-[#070b14] text-slate-100 font-sans antialiased overflow-hidden">
      {/* Barra Superior Conforme Contrato de 3 Zonas */}
      <TopBar
        documents={documents}
        activeDocument={activeDocument}
        onSelectDocument={handleSelectDocument}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenDemos={() => setIsDemoModalOpen(true)}
        onOpenExplain={() => setIsExplainModalOpen(true)}
        onOpenCrearCycle={() => setIsCrearModalOpen(true)}
        onOpenSpacedReview={() => {
          setSpacedReviewConceptId(null);
          setIsSpacedReviewOpen(true);
        }}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenWelcome={() => setIsWelcomeModalOpen(true)}
        onOpenApiKeyConfig={() => setIsApiKeyModalOpen(true)}
        onOpenStorageModal={() => setIsStorageModalOpen(true)}
        onOpenSemanticModal={() => setIsSemanticModalOpen(true)}
        onOpenGoldenDataset={() => setIsGoldenDatasetModalOpen(true)}
        hasSemanticConsent={isSemanticConsentActive}
        hasApiKey={hasApiKey}
        onDeleteDocument={handleDeleteDocument}
        onFactoryReset={handleFactoryReset}
        reviewDueCount={reviewDueCount}
        healthStatus={{ gemini_multimodal: healthStatus }}
        storageUsage={storageUsage}
      />

      {/* Painel de Orientação Dinâmica e Trilha do Estudante */}
      <DynamicGuidancePanel
        activeDocument={activeDocument}
        analysis={analysis}
        selectedConcept={selectedConcept}
        conceptMastery={selectedConcept ? masteryMap[selectedConcept.id] : undefined}
        reviewDueCount={reviewDueCount}
        isAnalyzing={isAnalyzing}
        onOpenDemos={() => setIsDemoModalOpen(true)}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenCrearCycle={() => setIsCrearModalOpen(true)}
        onOpenExplain={() => setIsExplainModalOpen(true)}
        onOpenSpacedReview={() => {
          setSpacedReviewConceptId(null);
          setIsSpacedReviewOpen(true);
        }}
        onSelectTab={setActiveTab}
      />

      {/* Notificações Funcionais */}
      {notification && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between border-b transition-colors ${
            notification.type === 'error'
              ? 'bg-coral-950/80 text-coral-200 border-coral-800'
              : notification.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-200 border-emerald-800'
              : 'bg-cyan-950/80 text-cyan-200 border-cyan-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs hover:text-white p-1">
            ✕
          </button>
        </div>
      )}

      {/* Área Central de Estudo com Espaço Otimizado */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Painel Esquerdo: Quadro Didático ou Caderno / Visualizador */}
        <div className="flex-[3] flex flex-col min-w-0">
          {/* Abas Superiores de Alternância de Área de Estudo */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="inline-flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shadow-sm">
              <button
                onClick={() => setActiveTab('blackboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  activeTab === 'blackboard'
                    ? 'bg-slate-800 text-cyan-300 border border-slate-700/70 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Brain className="w-3.5 h-3.5 text-cyan-400" />
                <span>Quadro de Conceitos</span>
              </button>

              <button
                onClick={() => setActiveTab('notebook')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  activeTab === 'notebook'
                    ? 'bg-slate-800 text-cyan-300 border border-slate-700/70 shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Caderno & Notas ({notes.length})</span>
              </button>

              {activeDocument?.pages && (
                <button
                  onClick={() => setActiveTab('document_preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                    activeTab === 'document_preview'
                      ? 'bg-slate-800 text-cyan-300 border border-slate-700/70 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Documento Original ({activeDocument.pages.length} pág.)</span>
                </button>
              )}
            </div>

            {isAnalyzing && (
              <span className="text-xs font-mono text-cyan-400 flex items-center gap-1.5 bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-800/40">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                Análise Multimodal em andamento...
              </span>
            )}
          </div>

          {/* Conteúdo da Aba Ativa */}
          <div className="flex-1 min-h-0">
            {activeTab === 'blackboard' && (
              <Blackboard
                analysis={analysis}
                selectedConcept={selectedConcept}
                onSelectConcept={(c) => setSelectedConcept(c)}
                onAskTutorAboutConcept={(c) => {
                  setSelectedConcept(c);
                  tutorPanelRef.current?.askAboutConcept(c);
                }}
                onExplainConcept={(c) => {
                  setSelectedConcept(c);
                  setIsExplainModalOpen(true);
                }}
                onStartCrearCycle={(c) => {
                  setSelectedConcept(c);
                  setIsCrearModalOpen(true);
                }}
                onOpenSpacedReview={(conceptId) => {
                  setSpacedReviewConceptId(conceptId || null);
                  setIsSpacedReviewOpen(true);
                }}
                onGenerateVisualResource={(c) => {
                  setSelectedConcept(c);
                  setIsVisualModalOpen(true);
                }}
                onRegenerateGraph={!activeDocument?.isDemoMaterial ? handleRegenerateGraph : undefined}
                isRegenerating={isAnalyzing}
                masteryMap={masteryMap}
                onOpenGuide={() => setIsGuideOpen(true)}
              />
            )}

            {activeTab === 'notebook' && (
              <StudyNotebook
                documentId={activeDocument?.id || ''}
                documentTitle={activeDocument?.title}
                subjectName={activeDocument?.subject}
                notes={notes}
                onSaveNote={handleSaveNote}
                onDeleteNote={handleDeleteNote}
                onExportNotesJson={handleExportBackup}
              />
            )}

            {activeTab === 'document_preview' && activeDocument?.pages && (
              <div className="h-full bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto space-y-4">
                <div className="border-b border-slate-800 pb-2 flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      {activeDocument.title} — Transcrição e Evidências por Página
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Todas as citações do Quadro Didático e do Tutor são vinculadas a estas páginas reais.
                    </p>
                  </div>
                  {activeDocument.ragStatus && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
                          activeDocument.ragStatus === 'indexed'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                            : activeDocument.ragStatus === 'completed_partial_ocr_pending'
                            ? 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                            : activeDocument.ragStatus === 'failed'
                            ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                            : 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50'
                        }`}
                      >
                        {activeDocument.ragStatus === 'indexed' &&
                          `RAG Indexado (${activeDocument.ragIndexedChunksCount ?? 0} chunks)`}
                        {activeDocument.ragStatus === 'completed_partial_ocr_pending' &&
                          `RAG Parcial (${activeDocument.ragIndexedChunksCount ?? 0} chunks, OCR pendente)`}
                        {activeDocument.ragStatus === 'failed' && 'RAG: Falha na Indexação'}
                        {activeDocument.ragStatus === 'processing' && 'RAG: Indexando...'}
                      </span>
                      {activeDocument.ragStatus === 'completed_partial_ocr_pending' && (
                        <button
                          type="button"
                          onClick={() => setIsOcrModalOpen(true)}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                          title="Processar páginas digitalizadas via OCR local no navegador"
                        >
                          <ScanText className="w-3 h-3 text-cyan-400" />
                          <span>Executar OCR Local</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {activeDocument.pages.map((p) => (
                  <div key={p.pageNumber} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono text-cyan-400">
                      <span>PÁGINA {p.pageNumber}</span>
                      {p.hasVisualElements && (
                        <span className="text-[10px] text-violet-400 bg-violet-950/60 px-1.5 py-0.5 rounded border border-violet-800/40">
                          Elementos Visuais / Fórmulas
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{p.textContent}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Painel Direito: Tutor Textual Contextualizado */}
        <div className="flex-[2] flex flex-col min-w-[320px] max-w-[460px]">
          <TutorPanel
            ref={tutorPanelRef}
            activeDocument={activeDocument}
            activeConcept={selectedConcept}
            chatHistory={chatHistory}
            onAddMessage={handleAddChatMessage}
            onOpenVisualGenerator={(c) => {
              setSelectedConcept(c);
              setIsVisualModalOpen(true);
            }}
            onSaveNote={handleSaveNote}
          />
        </div>
      </div>

      {/* Modais da Aplicação */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onDocumentImported={handleDocumentImported}
      />

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        activeDocumentId={activeDocument?.id || null}
        onLoadDemoMaterial={handleLoadDemo}
      />

      <AgoraEuExplicoModal
        isOpen={isExplainModalOpen}
        onClose={() => setIsExplainModalOpen(false)}
        document={activeDocument}
        activeConcept={selectedConcept}
        allConcepts={
          analysis
            ? [...analysis.fundamentalConcepts, ...analysis.complementaryConcepts]
            : []
        }
        documentExcerpts={
          activeDocument?.pages
            ? activeDocument.pages.slice(0, 5).map(p => `Pág. ${p.pageNumber}: ${p.textContent.slice(0, 300)}...`)
            : []
        }
        onOpenGuide={() => setIsGuideOpen(true)}
        onConceptStateChanged={(conceptId, newState) => {
          if (activeDocument) {
            reloadMastery(activeDocument.id);
          }
          if (!analysis) return;
          setAnalysis(prev => {
            if (!prev) return null;
            return {
              ...prev,
              fundamentalConcepts: prev.fundamentalConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: newState } : c
              ),
              complementaryConcepts: prev.complementaryConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: newState } : c
              ),
            };
          });
        }}
      />

      <CrearCycleModal
        isOpen={isCrearModalOpen}
        onClose={() => setIsCrearModalOpen(false)}
        document={activeDocument}
        concept={selectedConcept}
        allConcepts={
          analysis
            ? [...analysis.fundamentalConcepts, ...analysis.complementaryConcepts]
            : []
        }
        analysis={analysis}
        documentExcerpts={
          activeDocument?.pages
            ? activeDocument.pages.slice(0, 5).map(p => `Pág. ${p.pageNumber}: ${p.textContent.slice(0, 300)}...`)
            : []
        }
        onOpenGuide={() => setIsGuideOpen(true)}
        onConceptMasteryChanged={(conceptId, updatedMastery) => {
          if (activeDocument) {
            reloadMastery(activeDocument.id);
            refreshReviewCount(activeDocument.id);
          }
          if (!analysis) return;
          setAnalysis(prev => {
            if (!prev) return null;
            return {
              ...prev,
              fundamentalConcepts: prev.fundamentalConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: updatedMastery.diagnosticState } : c
              ),
              complementaryConcepts: prev.complementaryConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: updatedMastery.diagnosticState } : c
              ),
            };
          });
        }}
      />

      <SpacedReviewModal
        isOpen={isSpacedReviewOpen}
        onClose={() => {
          setIsSpacedReviewOpen(false);
          setSpacedReviewConceptId(null);
          if (activeDocument) refreshReviewCount(activeDocument.id);
        }}
        document={activeDocument}
        concepts={
          analysis
            ? [...analysis.fundamentalConcepts, ...analysis.complementaryConcepts]
            : []
        }
        initialConceptId={spacedReviewConceptId}
        onOpenGuide={() => setIsGuideOpen(true)}
        onConceptMasteryChanged={(conceptId, updatedMastery) => {
          if (activeDocument) {
            reloadMastery(activeDocument.id);
            refreshReviewCount(activeDocument.id);
          }
          if (!analysis) return;
          setAnalysis(prev => {
            if (!prev) return null;
            return {
              ...prev,
              fundamentalConcepts: prev.fundamentalConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: updatedMastery.diagnosticState } : c
              ),
              complementaryConcepts: prev.complementaryConcepts.map(c =>
                c.id === conceptId ? { ...c, diagnosticState: updatedMastery.diagnosticState } : c
              ),
            };
          });
        }}
      />

      <VisualResourceModal
        isOpen={isVisualModalOpen}
        onClose={() => setIsVisualModalOpen(false)}
        concept={selectedConcept}
        document={activeDocument}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        relatedConcepts={
          analysis && selectedConcept
            ? analysis.relationships
                .filter(r => r.sourceConceptId === selectedConcept.id || r.targetConceptId === selectedConcept.id)
                .map(r => r.sourceConceptId === selectedConcept.id ? r.targetConceptId : r.sourceConceptId)
            : []
        }
      />

      {/* Camada de Onboarding, Tour e Guia Permanente */}
      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={() => {
          setStoredOnboardingState({ hasCompletedWelcome: true });
          setIsWelcomeModalOpen(false);
        }}
        onStartTour={() => {
          setStoredOnboardingState({ hasCompletedWelcome: true });
          setIsWelcomeModalOpen(false);
          setIsTourOpen(true);
        }}
        onStartWithDemo={() => {
          setStoredOnboardingState({ hasCompletedWelcome: true });
          setIsWelcomeModalOpen(false);
          setIsDemoModalOpen(true);
        }}
        onStartWithImport={() => {
          setStoredOnboardingState({ hasCompletedWelcome: true });
          setIsWelcomeModalOpen(false);
          setIsUploadModalOpen(true);
        }}
        onFactoryReset={handleFactoryReset}
      />

      <ProductTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onFinishTour={() => {
          setStoredOnboardingState({ hasCompletedTour: true });
          setIsTourOpen(false);
        }}
        onOpenGuide={() => {
          setIsTourOpen(false);
          setIsGuideOpen(true);
        }}
        onReturnToWelcome={() => {
          setIsTourOpen(false);
          setIsWelcomeModalOpen(true);
        }}
      />

      <ProductGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onStartTour={() => {
          setIsGuideOpen(false);
          setIsTourOpen(true);
        }}
        onOpenWelcome={() => {
          setIsGuideOpen(false);
          setIsWelcomeModalOpen(true);
        }}
        onResetOnboarding={() => {
          resetStoredOnboardingState();
          setIsTourOpen(false);
          setIsGuideOpen(false);
          setIsWelcomeModalOpen(true);
          setNotification({
            type: 'info',
            message: 'Onboarding reiniciado! Bem-vindo de volta à tela inicial.',
          });
          setTimeout(() => setNotification(null), 3500);
        }}
        onFactoryReset={handleFactoryReset}
        onLoadDemoMaterial={() => {
          setIsGuideOpen(false);
          setIsDemoModalOpen(true);
        }}
      />

      {/* Modal de Configuração BYOK (Chave de API Gemini) */}
      <ApiKeyConfigModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSuccess={() => setIsApiKeyModalOpen(false)}
        onOpenGoldenDataset={() => setIsGoldenDatasetModalOpen(true)}
      />

      {/* Modal Experimental do Golden Dataset (Tier 2 - Missão P3.2.2.2) */}
      <GoldenDatasetModal
        isOpen={isGoldenDatasetModalOpen}
        onClose={() => setIsGoldenDatasetModalOpen(false)}
        onOpenApiKeyConfig={() => {
          setIsGoldenDatasetModalOpen(false);
          setIsApiKeyModalOpen(true);
        }}
      />

      {/* Modal de Recuperação Híbrida & IA Semântica Local (multilingual-e5-small + RRF) */}
      <SemanticRetrievalModal
        isOpen={isSemanticModalOpen}
        onClose={() => setIsSemanticModalOpen(false)}
        onStatusChange={(active) => setIsSemanticConsentActive(active)}
      />

      {/* Modal Local-First de Gestão de Armazenamento, Pasta Local e Backups */}
      <WorkspaceStorageModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        onRefreshData={async () => {
          const userDocs = await getAllUserDocuments();
          setDocuments(userDocs);
          if (activeDocument) {
            const currentDoc = userDocs.find(d => d.id === activeDocument.id) || userDocs[0] || null;
            setActiveDocument(currentDoc);
            if (currentDoc) {
              const currentAnalysis = await getAnalysisByDocumentId(currentDoc.id);
              setAnalysis(currentAnalysis || null);
              const currentNotes = await getNotesByDocumentId(currentDoc.id);
              setNotes(currentNotes);
            }
          }
          await refreshStorage();
        }}
      />
      {/* Modal de OCR Local para Páginas Digitalizadas */}
      <OcrProcessingModal
        isOpen={isOcrModalOpen}
        document={activeDocument}
        onClose={() => setIsOcrModalOpen(false)}
        onOcrCompleted={async () => {
          if (activeDocument) {
            const updated = await getAllUserDocuments();
            setDocuments(updated);
            const currentDoc = updated.find(d => d.id === activeDocument.id) || null;
            if (currentDoc) {
              setActiveDocument(currentDoc);
            }
          }
        }}
      />
    </div>
  );
}
