import React, { useState } from 'react';
import { Plus, Trash2, Bookmark, Save, Download } from 'lucide-react';
import type { StudyNote } from '../../types';

interface StudyNotebookProps {
  documentId: string;
  notes: StudyNote[];
  onSaveNote: (note: StudyNote) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExportNotesJson: () => void;
}

export const StudyNotebook: React.FC<StudyNotebookProps> = ({
  documentId,
  notes,
  onSaveNote,
  onDeleteNote,
  onExportNotesJson,
}) => {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(notes[0]?.id || null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedNote = notes.find(n => n.id === activeNoteId);

  const handleSelectNote = (note: StudyNote) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
  };

  const handleCreateNewNote = () => {
    const newNoteId = `note_${Date.now()}`;
    setActiveNoteId(newNoteId);
    setTitle('Nova Anotação de Estudo');
    setContent('');
  };

  const handleSaveCurrentNote = async () => {
    if (!title.trim() || !documentId) return;

    setIsSaving(true);
    try {
      const noteToSave: StudyNote = {
        id: activeNoteId || `note_${Date.now()}`,
        documentId,
        title: title.trim(),
        content: content.trim(),
        createdAt: selectedNote?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await onSaveNote(noteToSave);
      setActiveNoteId(noteToSave.id);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header do Caderno */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-white">Caderno de Estudos</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onExportNotesJson}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-[11px] flex items-center gap-1"
            title="Exportar dados locais em JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Backup</span>
          </button>
          <button
            onClick={handleCreateNewNote}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/80 hover:bg-cyan-600 text-white rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nota</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Lista Lateral de Notas */}
        <div className="w-full md:w-48 border-r border-slate-800/80 bg-slate-950/40 p-2 overflow-y-auto space-y-1">
          {notes.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-2 text-center">Nenhuma anotação criada.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                onClick={() => handleSelectNote(n)}
                className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between group ${
                  activeNoteId === n.id ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <span className="truncate flex-1">{n.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(n.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-coral-400 p-0.5 transition-opacity"
                  title="Excluir nota"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Editor da Nota Ativa */}
        <div className="flex-1 flex flex-col p-4 bg-slate-900/60 overflow-hidden">
          {activeNoteId ? (
            <div className="flex-1 flex flex-col space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da anotação..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSaveCurrentNote}
                  disabled={isSaving || !title.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </div>

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
    </div>
  );
};
