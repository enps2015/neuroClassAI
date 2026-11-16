import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Bookmark,
  Save,
  Download,
  Palette,
  Eye,
  X,
  Link as LinkIcon,
  Unlink,
  Image as ImageIcon,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import type { StudyNote, VisualResource } from '../../types';
import { visualLearningService } from '../../services/visual/visualLearningService';
import { VisualSupportViewerModal } from '../visual/VisualSupportViewerModal';

interface StudyNotebookProps {
  documentId: string;
  documentTitle?: string;
  subjectName?: string;
  notes: StudyNote[];
  onSaveNote: (note: StudyNote) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExportNotesJson: () => void;
}

export const StudyNotebook: React.FC<StudyNotebookProps> = ({
  documentId,
  documentTitle,
  subjectName,
  notes,
  onSaveNote,
  onDeleteNote,
  onExportNotesJson,
}) => {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(notes[0]?.id || null);
  const [title, setTitle] = useState(notes[0]?.title || '');
  const [content, setContent] = useState(notes[0]?.content || '');
  const [associatedVisualId, setAssociatedVisualId] = useState<string | null>(
    notes[0]?.associatedVisualResourceId || null
  );
  const [hasChangedAssociatedVisual, setHasChangedAssociatedVisual] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availableVisuals, setAvailableVisuals] = useState<VisualResource[]>([]);
  const [isSelectingVisual, setIsSelectingVisual] = useState(false);
  const [viewerResource, setViewerResource] = useState<VisualResource | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [isExportingMd, setIsExportingMd] = useState(false);

  // Sincronizar estado inicial caso as notas sejam carregadas ou atualizadas assincronamente
  useEffect(() => {
    if (!activeNoteId && notes.length > 0) {
      const firstNote = notes[0];
      setActiveNoteId(firstNote.id);
      setTitle(firstNote.title);
      setContent(firstNote.content);
      setAssociatedVisualId(firstNote.associatedVisualResourceId || null);
      setHasChangedAssociatedVisual(false);
    }
  }, [notes, activeNoteId]);

  // Carregar recursos visuais salvos para o documento ativo
  useEffect(() => {
    let isMounted = true;
    if (documentId) {
      visualLearningService
        .getSavedResourcesByDocument(documentId)
        .then((items) => {
          if (isMounted) setAvailableVisuals(items);
        })
        .catch(() => {
          if (isMounted) setAvailableVisuals([]);
        });
    } else {
      setAvailableVisuals([]);
    }
    return () => {
      isMounted = false;
    };
  }, [documentId]);

  const selectedNote = notes.find((n) => n.id === activeNoteId);

  // Sincronizar estado local quando seleciona outra nota
  const handleSelectNote = (note: StudyNote) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setAssociatedVisualId(note.associatedVisualResourceId || null);
    setHasChangedAssociatedVisual(false);
    setIsSelectingVisual(false);
  };

  const handleCreateNewNote = () => {
    const newNoteId = `note_${Date.now()}`;
    setActiveNoteId(newNoteId);
    setTitle('Nova Anotação de Estudo');
    setContent('');
    setAssociatedVisualId(null);
    setHasChangedAssociatedVisual(false);
    setIsSelectingVisual(false);
  };

  const handleSaveCurrentNote = async () => {
    if (!title.trim() || !documentId) return;

    setIsSaving(true);
    try {
      // Resolução estrita do vínculo visual sem ambiguidade entre preservação, alteração e desvinculação
      const resolveAssociatedVisual = (): { associatedVisualResourceId?: string } => {
        if (hasChangedAssociatedVisual) {
          // Alteração explícita pelo usuário
          if (typeof associatedVisualId === 'string' && associatedVisualId.trim().length > 0) {
            return { associatedVisualResourceId: associatedVisualId.trim() };
          }
          // Desvinculação deliberada (associatedVisualId é null ou string vazia com alteração sinalizada)
          return {};
        }

        // Sem alteração pelo usuário: preserva estritamente o vínculo original da nota selecionada
        if (selectedNote?.associatedVisualResourceId) {
          return { associatedVisualResourceId: selectedNote.associatedVisualResourceId };
        }

        // Nota nova ou legada sem vínculo prévio e sem alteração do usuário
        return {};
      };

      const noteToSave: StudyNote = {
        id: selectedNote?.id || activeNoteId || `note_${Date.now()}`,
        documentId,
        title: title.trim(),
        content: content.trim(),
        createdAt: selectedNote?.createdAt || Date.now(),
        updatedAt: Date.now(),
        ...(selectedNote?.associatedConceptId !== undefined
          ? { associatedConceptId: selectedNote.associatedConceptId }
          : {}),
        ...(selectedNote?.citedExcerpt !== undefined
          ? { citedExcerpt: selectedNote.citedExcerpt }
          : {}),
        ...(typeof selectedNote?.pageSource === 'number'
          ? { pageSource: selectedNote.pageSource }
          : {}),
        ...(Array.isArray(selectedNote?.pageSources) && selectedNote.pageSources.length > 0
          ? { pageSources: selectedNote.pageSources }
          : {}),
        ...(Array.isArray(selectedNote?.verifiedCitations) && selectedNote.verifiedCitations.length > 0
          ? { verifiedCitations: selectedNote.verifiedCitations }
          : {}),
        ...resolveAssociatedVisual(),
      };

      await onSaveNote(noteToSave);
      setActiveNoteId(noteToSave.id);
      setHasChangedAssociatedVisual(false);
      setAssociatedVisualId(noteToSave.associatedVisualResourceId || null);
    } catch (err) {
      console.error('[StudyNotebook] Falha ao salvar nota; intenção do usuário preservada:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Exporta todas as notas do documento atual formatadas em Markdown legível (.md).
   */
  const handleExportNotesMarkdown = () => {
    if (notes.length === 0) {
      alert('Nenhuma anotação disponível para exportação.');
      return;
    }

    setIsExportingMd(true);
    try {
      const docName = documentTitle || 'Material de Estudo';
      const dateStr = new Date().toLocaleDateString('pt-BR');
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const lines: string[] = [
        `# Caderno de Estudos — ${docName}`,
        subjectName ? `**Disciplina / Área**: ${subjectName}` : '',
        `**Total de Anotações**: ${notes.length}`,
        `**Data de Exportação**: ${dateStr} às ${timeStr}`,
        '',
        '---',
        '',
      ].filter((l) => l !== undefined);

      notes.forEach((n, idx) => {
        lines.push(`## ${idx + 1}. ${n.title}`);
        lines.push(`*Criada em: ${new Date(n.createdAt).toLocaleString('pt-BR')}*`);
        if (n.pageSources && n.pageSources.length > 0) {
          lines.push(`*Páginas físicas de referência: Págs. ${n.pageSources.join(', ')}*`);
        } else if (n.pageSource) {
          lines.push(`*Página física de referência: Pág. ${n.pageSource}*`);
        }
        lines.push('');
        lines.push(n.content);
        if (n.citedExcerpt) {
          lines.push('');
          lines.push('> **Evidência Documental Citada:**');
          const quoted = n.citedExcerpt.split('\n').map((l) => `> ${l}`).join('\n');
          lines.push(quoted);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
      });

      const mdString = lines.join('\n');
      const blob = new Blob([mdString], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanDocName = docName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 30);
      a.download = `caderno_${cleanDocName}_${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingMd(false);
    }
  };

  /**
   * Copia a nota ativa formatada em Markdown para a área de transferência.
   */
  const handleCopyNoteMarkdown = async (note: StudyNote) => {
    const pageRef = (note.pageSources && note.pageSources.length > 0)
      ? ` (Págs. ${note.pageSources.join(', ')})`
      : note.pageSource
      ? ` (Pág. ${note.pageSource})`
      : '';
    const md = `### ${note.title}\n*Criada em: ${new Date(note.createdAt).toLocaleString('pt-BR')}*${pageRef}\n\n${note.content}${note.citedExcerpt ? `\n\n> **Evidência:**\n> ${note.citedExcerpt.replace(/\n/g, '\n> ')}` : ''}`;
    try {
      await navigator.clipboard.writeText(md);
      setCopiedNoteId(note.id);
      setTimeout(() => setCopiedNoteId(null), 2500);
    } catch {
      // Fallback silencioso
    }
  };

  // Encontrar o recurso visual associado ativo
  const linkedVisual = availableVisuals.find((v) => v.id === associatedVisualId);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header do Caderno */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-white">Caderno de Estudos</h4>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleExportNotesMarkdown}
            disabled={isExportingMd || notes.length === 0}
            className="px-2.5 py-1 text-cyan-300 hover:text-white bg-cyan-950/70 hover:bg-cyan-900/70 border border-cyan-800/60 rounded-md transition-colors text-[11px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Baixar todas as notas deste material em formato Markdown (.md) para ler no Bloco de Notas, Obsidian, Notion ou Word"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Baixar Notas (.md)</span>
          </button>
          <button
            onClick={onExportNotesJson}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-[11px] flex items-center gap-1 cursor-pointer"
            title="Exportar dados locais em JSON (Backup Técnico para Desenvolvedores)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Backup JSON</span>
          </button>
          <button
            onClick={handleCreateNewNote}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/80 hover:bg-cyan-600 text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nota</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Lista Lateral de Notas */}
        <div className="w-full md:w-52 border-r border-slate-800/80 bg-slate-950/40 p-2 overflow-y-auto space-y-1">
          {notes.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-2 text-center">Nenhuma anotação criada.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                onClick={() => handleSelectNote(n)}
                className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between group ${
                  activeNoteId === n.id
                    ? 'bg-slate-800 text-cyan-300 font-medium'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate flex-1 mr-1">
                  {n.associatedVisualResourceId && (
                    <span title="Possui recurso visual associado">
                      <Palette className="w-3 h-3 text-amber-400 shrink-0" />
                    </span>
                  )}
                  <span className="truncate">{n.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(n.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity cursor-pointer"
                  title="Excluir nota"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Editor da Nota Ativa */}
        <div className="flex-1 flex flex-col p-4 bg-slate-900/60 overflow-hidden space-y-3">
          {activeNoteId ? (
            <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da anotação..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedNote && (
                    <button
                      type="button"
                      onClick={() => handleCopyNoteMarkdown(selectedNote)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors border border-slate-700/60 cursor-pointer"
                      title="Copiar esta anotação em formato Markdown para a área de transferência"
                    >
                      {copiedNoteId === selectedNote.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copiar (.md)</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleSaveCurrentNote}
                    disabled={isSaving || !title.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar</span>
                  </button>
                </div>
              </div>

              {/* Seção de Associação Visual */}
              {linkedVisual ? (
                <div className="p-3 bg-slate-950/80 border border-amber-800/40 rounded-xl flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                      <img
                        src={linkedVisual.imageDataUrl}
                        alt={linkedVisual.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-400 uppercase font-semibold">
                          {linkedVisual.modality === 'visual_analogy'
                            ? 'Analogia Visual'
                            : linkedVisual.modality === 'process_mechanism'
                            ? 'Mecanismo'
                            : 'Ilustração'}
                        </span>
                        <span className="text-[10px] text-slate-500">Recurso Vinculado</span>
                      </div>
                      <h5 className="text-xs font-bold text-white truncate">{linkedVisual.title}</h5>
                      <p className="text-[11px] text-slate-400 truncate max-w-md">
                        {linkedVisual.caption}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewerResource(linkedVisual)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white rounded-lg text-xs font-semibold border border-amber-800/40 transition-colors cursor-pointer"
                      title="Abrir e ampliar ilustração"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ampliar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssociatedVisualId(null);
                        setHasChangedAssociatedVisual(true);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                      title="Desvincular recurso desta nota"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : availableVisuals.length > 0 ? (
                <div className="shrink-0">
                  {isSelectingVisual ? (
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-amber-400" />
                          Selecione um recurso visual do documento:
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsSelectingVisual(false)}
                          className="text-slate-400 hover:text-white text-xs cursor-pointer"
                        >
                          ✕ Cancelar
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                        {availableVisuals.map((res) => (
                          <div
                            key={res.id}
                            onClick={() => {
                              setAssociatedVisualId(res.id);
                              setHasChangedAssociatedVisual(true);
                              setIsSelectingVisual(false);
                            }}
                            className="p-2 bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-lg cursor-pointer flex items-center gap-2.5 transition-all text-xs"
                          >
                            <img
                              src={res.imageDataUrl}
                              alt={res.title}
                              className="w-8 h-8 rounded object-cover shrink-0"
                            />
                            <div className="truncate flex-1">
                              <span className="text-[10px] font-mono text-amber-400 block">
                                {res.conceptName}
                              </span>
                              <span className="text-xs font-semibold text-white truncate block">
                                {res.title}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSelectingVisual(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-950/30 hover:bg-amber-950/50 border border-amber-800/40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Associar Recurso Visual Existente ({availableVisuals.length} disponíveis)</span>
                    </button>
                  )}
                </div>
              ) : null}

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva seus insights, sínteses ou dúvidas fundamentadas..."
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none font-mono leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-500">
              Selecione uma nota ao lado ou clique em "+ Nota" para registrar seu aprendizado.
            </div>
          )}
        </div>
      </div>

      {/* Visualizador Dedicado de Recurso Associado à Nota */}
      {viewerResource && (
        <VisualSupportViewerModal
          isOpen={Boolean(viewerResource)}
          onClose={() => setViewerResource(null)}
          conceptName={viewerResource.conceptName}
          resources={[viewerResource]}
          stageName="Caderno de Estudos"
          stageNote="Recurso visual didático associado a esta anotação para reforço de síntese e modelo mental."
        />
      )}
    </div>
  );
};
