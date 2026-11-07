import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, BookOpen, Layers } from 'lucide-react';
import { extractPdfDocument, inspectPdfOverview, safeBufferToBase64 } from '../../services/documents/pdfService';
import type { DocumentSource, TableOfContentsItem } from '../../types';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentImported: (doc: DocumentSource, fileBlob?: Blob, base64Data?: string) => Promise<void>;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onDocumentImported,
}) => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'notes'>('pdf');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Anotações Manuais
  const [notesContent, setNotesContent] = useState('');

  // Arquivo PDF e Metadados Inspecionados
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfOverview, setPdfOverview] = useState<{
    pageCount: number;
    tableOfContents: TableOfContentsItem[];
    suggestedChunkRanges: Array<{ title: string; startPage: number; endPage: number }>;
  } | null>(null);

  // Intervalo selecionado para PDFs extensos (>30 páginas ou >300 páginas)
  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number>(-1); // -1 = Todas as páginas
  const [customStartPage, setCustomStartPage] = useState<number>(1);
  const [customEndPage, setCustomEndPage] = useState<number>(30);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setErrorMsg('Por favor, selecione um arquivo no formato PDF.');
        return;
      }
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMsg(null);
      setPdfOverview(null);

      // Inspeciona visão geral do PDF (páginas e sumário) com segurança
      try {
        setIsProcessing(true);
        setProgressMsg('Inspecionando estrutura de páginas e sumário do PDF...');
        const arrayBuf = await file.arrayBuffer();
        const overview = await inspectPdfOverview(arrayBuf);
        setPdfOverview(overview);
        setCustomStartPage(1);
        setCustomEndPage(Math.min(overview.pageCount, 30));

        // Padrão: processar documento completo (-1). O usuário pode selecionar blocos ou capítulos no dropdown
        setSelectedRangeIndex(-1);
      } catch (err: any) {
        console.warn('Erro ao inspecionar sumário prévio:', err);
        // Fallback resiliente: cria uma visão padrão de até 30 páginas para não bloquear o usuário
        setPdfOverview({
          pageCount: 30,
          tableOfContents: [],
          suggestedChunkRanges: [{ title: 'Bloco Inicial (Págs. 1 a 30)', startPage: 1, endPage: 30 }],
        });
        setSelectedRangeIndex(-1);
      } finally {
        setIsProcessing(false);
        setProgressMsg('');
      }
    }
  };

  const handleProcessSubmit = async () => {
    if (!title.trim()) {
      setErrorMsg('Informe o título do material de estudo.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      if (activeTab === 'pdf') {
        if (!selectedFile) {
          setErrorMsg('Selecione um arquivo PDF para prosseguir.');
          setIsProcessing(false);
          return;
        }

        // Determina intervalo de páginas
        let pageRange: { startPage: number; endPage: number } | undefined = undefined;
        let isChunked = false;

        if (pdfOverview && pdfOverview.pageCount > 0) {
          if (selectedRangeIndex === -1) {
            // Processar documento completo (todas as páginas do PDF)
            pageRange = undefined;
            isChunked = false;
          } else if (selectedRangeIndex === -2) {
            // Intervalo personalizado de páginas
            pageRange = {
              startPage: Math.max(1, customStartPage),
              endPage: Math.min(pdfOverview.pageCount, customEndPage),
            };
            isChunked = true;
          } else if (selectedRangeIndex >= 0 && pdfOverview.suggestedChunkRanges[selectedRangeIndex]) {
            // Capítulo ou bloco específico selecionado
            const range = pdfOverview.suggestedChunkRanges[selectedRangeIndex];
            pageRange = { startPage: range.startPage, endPage: range.endPage };
            isChunked = true;
          }
        }

        setProgressMsg(
          pageRange
            ? `Lendo páginas selecionadas (${pageRange.startPage} a ${pageRange.endPage})...`
            : 'Lendo páginas do PDF localmente...'
        );

        // Obter arrayBuffer do arquivo
        const arrayBuffer = await selectedFile.arrayBuffer();

        // Extrai texto e operadores visuais com cópia defensiva para não sofrer detachment
        const extracted = await extractPdfDocument(arrayBuffer, {
          pageRange,
          onProgress: (percent, current, total) => {
            setProgressMsg(`Processando página ${current} de ${total} (${percent}%)...`);
          },
        });

        // Para envio multimodal, se o arquivo for excessivamente grande (>15MB),
        // enviamos apenas os textos extraídos de alta fidelidade para não exceder limites de payload HTTP
        let base64Data: string | undefined = undefined;
        const isFileSizeSmall = selectedFile.size <= 15 * 1024 * 1024;

        if (isFileSizeSmall && !isChunked) {
          setProgressMsg('Codificando documento para visão multimodal...');
          base64Data = safeBufferToBase64(arrayBuffer);
        }

        const newDoc: DocumentSource = {
          id: `doc_${Date.now()}`,
          title: title.trim(),
          subject: subject.trim() || 'Geral',
          type: 'pdf',
          isDemoMaterial: false,
          sizeBytes: selectedFile.size,
          mimeType: 'application/pdf',
          uploadedAt: Date.now(),
          pageCount: extracted.pageCount,
          tableOfContents: extracted.tableOfContents,
          activeChunkRange: pageRange,
          pages: extracted.pages,
        };

        setProgressMsg('Salvando material e integrando análise científica de IA...');
        await onDocumentImported(newDoc, selectedFile, base64Data);
        onClose();
      } else {
        // Modo Anotações
        if (!notesContent.trim()) {
          setErrorMsg('Digite ou cole suas anotações.');
          setIsProcessing(false);
          return;
        }

        const sections: Array<{ title: string; content: string }> = [];
        const rawLines = notesContent.split('\n');
        let currentSectionTitle = 'Introdução Geral';
        let currentSectionBody: string[] = [];

        rawLines.forEach((line) => {
          if (line.startsWith('#') || line.startsWith('---')) {
            if (currentSectionBody.length > 0) {
              sections.push({
                title: currentSectionTitle,
                content: currentSectionBody.join('\n').trim(),
              });
              currentSectionBody = [];
            }
            currentSectionTitle = line.replace(/^[#\s\-]+/, '').trim() || 'Seção';
          } else {
            currentSectionBody.push(line);
          }
        });

        if (currentSectionBody.length > 0) {
          sections.push({
            title: currentSectionTitle,
            content: currentSectionBody.join('\n').trim(),
          });
        }

        const newDoc: DocumentSource = {
          id: `doc_note_${Date.now()}`,
          title: title.trim(),
          subject: subject.trim() || 'Anotações Pessoais',
          type: 'notes',
          isDemoMaterial: false,
          sizeBytes: new Blob([notesContent]).size,
          mimeType: 'text/markdown',
          uploadedAt: Date.now(),
          noteSections: sections,
        };

        await onDocumentImported(newDoc);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro na importação do material:', err);
      setErrorMsg(err.message || 'Falha ao processar o documento. Verifique o arquivo e tente novamente.');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <h3 className="text-base font-semibold text-white">Importar Material de Estudo</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              PDFs com visão multimodal, suporte a documentos extensos (&gt;300 págs.) e anotações.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white text-sm p-1 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs de Seleção de Tipo de Documento */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 p-1.5 gap-2 px-6">
          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'pdf'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Documento PDF (com Visão)</span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'notes'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Anotações Estruturadas</span>
          </button>
        </div>

        {/* Formulário */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-coral-500/10 border border-coral-500/20 text-coral-300 text-xs rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0 text-coral-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Título do Material
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Livro de Bioquímica / Artigo de Eletromagnetismo"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Disciplina / Área de Conhecimento
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex.: Fisiologia Celular, Mecânica Quântica, Direito"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {activeTab === 'pdf' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Arquivo PDF
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/80 rounded-xl p-5 text-center cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950"
                >
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-1 text-xs text-cyan-400">
                      <CheckCircle className="w-5 h-5 text-cyan-400" />
                      <span className="font-semibold text-slate-200">{selectedFile.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        {pdfOverview && ` · ${pdfOverview.pageCount} páginas`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-xs text-slate-400">
                      <Upload className="w-5 h-5 text-slate-500" />
                      <span>Clique para selecionar o PDF do seu computador</span>
                      <span className="text-[10px] text-slate-500">
                        Suporte completo para PDFs compactos ou livros com centenas de páginas
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Seção Inteligente de Segmentação para PDFs Extensos */}
              {pdfOverview && pdfOverview.pageCount > 30 && (
                <div className="p-3.5 bg-slate-950/80 border border-cyan-800/40 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <span>Documento Extenso Detectado ({pdfOverview.pageCount} páginas)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Para garantir alta fidelidade na análise pedagógica e respeitar os limites operacionais, selecione um capítulo ou intervalo para estudo. A paginação original é preservada rigorosamente.
                  </p>

                  {/* Seleção por Capítulo/Sumário ou Customizado */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Modo de Estudo para este Documento:
                    </label>
                    <select
                      value={selectedRangeIndex}
                      onChange={(e) => setSelectedRangeIndex(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-medium"
                    >
                      <option value={-1}>
                        ✓ Processar Livro Completo (Todas as {pdfOverview.pageCount} páginas)
                      </option>
                      <option disabled>────────── Ou Focar em Capítulo Específico ──────────</option>
                      {pdfOverview.suggestedChunkRanges.map((chunk, idx) => (
                        <option key={idx} value={idx}>
                          {chunk.title} (Págs. {chunk.startPage} a {chunk.endPage})
                        </option>
                      ))}
                      <option value={-2}>Personalizar Intervalo Específico de Páginas...</option>
                    </select>
                  </div>

                  {/* Campos para Intervalo Personalizado */}
                  {selectedRangeIndex === -2 && (
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Página Inicial</label>
                        <input
                          type="number"
                          min={1}
                          max={pdfOverview.pageCount}
                          value={customStartPage}
                          onChange={(e) => setCustomStartPage(parseInt(e.target.value, 10) || 1)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <span className="text-slate-500 pt-3">até</span>
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Página Final</label>
                        <input
                          type="number"
                          min={customStartPage}
                          max={pdfOverview.pageCount}
                          value={customEndPage}
                          onChange={(e) => setCustomEndPage(parseInt(e.target.value, 10) || customStartPage)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Conteúdo das Anotações (use # para títulos de seções)
              </label>
              <textarea
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                rows={6}
                placeholder="# Introdução&#10;Conceitos iniciais...&#10;&#10;# Mecanismo Principal&#10;Processos e regras..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center gap-3 p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-lg text-xs text-cyan-200">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
              <span>{progressMsg || 'Processando com confiabilidade...'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleProcessSubmit}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
          >
            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Processar e Analisar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
