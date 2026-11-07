import { useState, useEffect, useCallback, useRef } from 'react';
import type { Concept, DocumentSource, LearningAnalysis, StudyNote, TutorChatMessage } from './types';
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
} from './services/persistence/indexedDb';
import { DEMO_MATERIALS } from './services/documents/demoMaterials';
import { requestDocumentAnalysis } from './services/ai/aiClient';
import { AIServiceHealth } from './services/ai/aiHealth';
import { TopBar } from './components/layout/TopBar';
import { Blackboard } from './components/blackboard/Blackboard';
import { TutorPanel } from './components/tutor/TutorPanel';
import { StudyNotebook } from './components/notebook/StudyNotebook';
import { DocumentUploadModal } from './components/documents/DocumentUploadModal';
import { DemoModal } from './components/documents/DemoModal';
import { Phase1ReportModal } from './components/documents/Phase1ReportModal';
import { AgoraEuExplicoModal } from './components/explanation/AgoraEuExplicoModal';
import { BookOpen, AlertCircle, FileCheck, Brain, ArrowRight } from 'lucide-react';

export default function App() {
  // Lista de documentos (pessoais persistidos + demos se ativadas)
  const [documents, setDocuments] = useState<DocumentSource[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentSource | null>(null);
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [chatHistory, setChatHistory] = useState<TutorChatMessage[]>([]);

  // Modais e UI de controle
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'blackboard' | 'notebook' | 'document_preview'>('blackboard');

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

  // Carregar documentos salvos na inicialização
  useEffect(() => {
    const initApp = async () => {
      try {
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
        }
      } catch (err) {
        console.error('Falha ao inicializar o banco IndexedDB:', err);
      }
    };
    initApp();
  }, [refreshStorage]);

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
      // 1. Salvar no IndexedDB local
      await saveDocument(doc, fileBlob);
      await refreshStorage();

      // 2. Executar análise com visão multimodal do Gemini API
      const analysisResult = await requestDocumentAnalysis({
        documentId: doc.id,
        title: doc.title,
        subject: doc.subject,
        fileBase64: base64Data,
        mimeType: doc.mimeType,
        textPages: doc.pages?.map(p => ({ pageNumber: p.pageNumber, textContent: p.textContent })),
        noteSections: doc.noteSections,
      });

      // 3. Salvar análise no banco
      await saveAnalysis(analysisResult);

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
        textPages: activeDocument.pages?.map(p => ({ pageNumber: p.pageNumber, textContent: p.textContent })),
        noteSections: activeDocument.noteSections,
      });

      // Salvar nova análise no IndexedDB
      await saveAnalysis(analysisResult);

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

  // Salvar nota no caderno
  const handleSaveNote = async (note: StudyNote) => {
    await saveStudyNote(note);
    if (activeDocument) {
      const updatedNotes = await getNotesByDocumentId(activeDocument.id);
      setNotes(updatedNotes);
    }
    await refreshStorage();
  };

  // Deletar nota
  const handleDeleteNote = async (noteId: string) => {
    await deleteStudyNote(noteId);
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
        saveChatSession(activeDocument.id, updated).catch(err =>
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
        onOpenReport={() => setIsReportModalOpen(true)}
        onOpenExplain={() => setIsExplainModalOpen(true)}
        healthStatus={{ gemini_multimodal: healthStatus }}
        storageUsage={storageUsage}
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
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setActiveTab('blackboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'blackboard'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Quadro Didático Interativo</span>
            </button>

            <button
              onClick={() => setActiveTab('notebook')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'notebook'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Caderno & Citações ({notes.length})</span>
            </button>

            {activeDocument?.pages && (
              <button
                onClick={() => setActiveTab('document_preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === 'document_preview'
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Páginas Originais ({activeDocument.pages.length})</span>
              </button>
            )}

            {isAnalyzing && (
              <span className="text-xs font-mono text-cyan-400 ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                Analisando multimodalmente...
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
                onRegenerateGraph={!activeDocument?.isDemoMaterial ? handleRegenerateGraph : undefined}
                isRegenerating={isAnalyzing}
              />
            )}

            {activeTab === 'notebook' && (
              <StudyNotebook
                documentId={activeDocument?.id || ''}
                notes={notes}
                onSaveNote={handleSaveNote}
                onDeleteNote={handleDeleteNote}
                onExportNotesJson={handleExportBackup}
              />
            )}

            {activeTab === 'document_preview' && activeDocument?.pages && (
              <div className="h-full bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto space-y-4">
                <div className="border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    {activeDocument.title} — Transcrição e Evidências por Página
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Todas as citações do Quadro Didático e do Tutor são vinculadas a estas páginas reais.
                  </p>
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

      <Phase1ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
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
        onConceptStateChanged={(conceptId, newState) => {
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
    </div>
  );
}
