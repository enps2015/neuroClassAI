import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Sparkles,
  Lock,
  X,
  Info,
  FlaskConical,
} from 'lucide-react';
import { AIKeyManager } from '../../services/ai/aiKeyManager';
import { validateApiKey } from '../../services/ai/aiClient';

export interface ApiKeyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenGoldenDataset?: () => void;
}

export const ApiKeyConfigModal: React.FC<ApiKeyConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenGoldenDataset,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<{
    status: 'idle' | 'valid' | 'invalid' | 'quota' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  const [hasSessionKey, setHasSessionKey] = useState<boolean>(AIKeyManager.hasApiKey());

  useEffect(() => {
    if (!isOpen) return;

    // Sincroniza estado inicial da memória
    const currentKey = AIKeyManager.getApiKey();
    if (currentKey) {
      setApiKeyInput(currentKey);
      setHasSessionKey(true);
      setValidationResult({
        status: 'valid',
        message: 'Chave ativa conectada na memória da sessão.',
      });
    } else {
      setApiKeyInput('');
      setHasSessionKey(false);
      setValidationResult({ status: 'idle', message: '' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleValidateAndSave = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setValidationResult({
        status: 'invalid',
        message: 'Por favor, insira uma chave de API antes de validar.',
      });
      return;
    }

    setIsValidating(true);
    setValidationResult({ status: 'idle', message: 'Validando conexão com Google AI Studio...' });

    try {
      const result = await validateApiKey(trimmed);
      if (result.valid) {
        AIKeyManager.setApiKey(trimmed, true, result.message);
        setHasSessionKey(true);
        setValidationResult({
          status: 'valid',
          message: result.message || 'Conexão validada com sucesso! Recursos de IA prontos para uso.',
        });
        if (onSuccess) {
          setTimeout(() => onSuccess(), 1000);
        } else {
          setTimeout(() => onClose(), 1200);
        }
      } else {
        const isQuota = result.code === 'QUOTA_EXCEEDED';
        setValidationResult({
          status: isQuota ? 'quota' : 'invalid',
          message: result.message || 'Não foi possível validar esta chave de API.',
        });
      }
    } catch (err: any) {
      setValidationResult({
        status: 'error',
        message: err.message || 'Erro ao conectar aos servidores.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveKey = () => {
    AIKeyManager.clearApiKey();
    setApiKeyInput('');
    setHasSessionKey(false);
    setValidationResult({
      status: 'idle',
      message: 'Chave removida da memória da sessão.',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 id="api-key-config-title" className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Conectar Chave da API Google Gemini</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
                  BYOK · Gratuito
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Utilize sua própria credencial pessoal para habilitar a visão multimodal e o tutor pedagógico.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-base p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fechar configuração"
          >
            ✕
          </button>
        </div>

        {/* Corpo da Configuração */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs text-slate-300 leading-relaxed">
          {/* Card Explicativo: O que é e Como Obter */}
          <div className="bg-slate-950/70 border border-cyan-500/20 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>O que é uma Chave de API e Como Obter Gratuitamente?</span>
              </h4>
              <a
                href="https://aistudio.google.com/api-keys"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold underline"
              >
                <span>Abrir Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-slate-300">
              A chave de API é uma senha técnica individual que permite ao NeuroClass AI consultar os modelos oficiais do Google Gemini para analisar PDFs e avaliar suas explicações. O Google AI Studio oferece um plano gratuito generoso para estudantes e desenvolvedores.
            </p>

            {/* Passo a Passo em 6 etapas claras */}
            <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-800 space-y-1.5 text-[11px] text-slate-300">
              <span className="font-bold text-slate-200 block mb-1">Passo a passo rápido:</span>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                <span>Acesse o endereço oficial: <strong className="text-cyan-300">https://aistudio.google.com/api-keys</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                <span>Faça login com qualquer <strong>Conta Google</strong> pessoal ou universitária.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                <span>Clique no botão azul <strong>"Create API key"</strong> (Criar chave de API).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                <span>Selecione um projeto sugerido e clique em <strong>"Create key in existing project"</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">5</span>
                <span>Copie a chave gerada (iniciada com <code>AQ...</code> ou <code>AIzaSy...</code>).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">6</span>
                <span>Cole no campo abaixo e clique em <strong>Validar Conexão</strong>.</span>
              </div>
            </div>
          </div>

          {/* Campo de Inserção da Chave */}
          <div className="space-y-2">
            <label htmlFor="gemini-key-input" className="block text-xs font-semibold text-slate-200">
              Sua Chave da API Gemini (BYOK):
            </label>
            <div className="relative flex items-center">
              <input
                id="gemini-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Cole aqui sua chave: AIzaSy..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 pr-20 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 text-slate-400 hover:text-slate-200 p-1.5 rounded transition-colors cursor-pointer"
                title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Feedback de Validação */}
          {validationResult.message && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs transition-all ${
                validationResult.status === 'valid'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : validationResult.status === 'quota'
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                  : validationResult.status === 'invalid' || validationResult.status === 'error'
                  ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              {validationResult.status === 'valid' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {validationResult.status === 'quota' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              {(validationResult.status === 'invalid' || validationResult.status === 'error') && (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              {validationResult.status === 'idle' && <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 animate-spin" />}
              <span className="leading-snug">{validationResult.message}</span>
            </div>
          )}

          {/* Garantias de Segurança & Privacidade */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 space-y-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Privacidade Estrita & Segurança de Memória Volátil</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>
                <strong>Somente em Memória:</strong> Sua chave <strong>nunca é salva em disco</strong>, nem no <code>localStorage</code>, nem no <code>IndexedDB</code> nem em cookies.
              </li>
              <li>
                <strong>Encerramento Automático:</strong> Ao fechar a aba ou clicar em "Remover Chave", a credencial desaparece imediatamente da memória.
              </li>
              <li>
                <strong>Trânsito Seguro:</strong> A comunicação com o servidor é protegida e a chave nunca é exposta em logs ou respostas.
              </li>
              <li>
                <strong>Cotas do Google AI Studio:</strong> O Tutor e as análises cognitivas utilizam cotas gratuitas generosas (~1.500 requisições/dia). A geração de imagens possui cota diária separada (15 a 50 imagens/dia no plano gratuito), que renova toda madrugada (~04h/05h BRT).
              </li>
            </ul>
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/90 gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {hasSessionKey && (
              <button
                type="button"
                onClick={handleRemoveKey}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                title="Desconectar e apagar a chave da memória da sessão"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover Chave</span>
              </button>
            )}

            {onOpenGoldenDataset && hasSessionKey && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGoldenDataset();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                title="Abrir o painel experimental do Golden Dataset (Tier 2)"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Testar Golden Dataset</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleValidateAndSave}
              disabled={isValidating || !apiKeyInput.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all shadow-md shadow-cyan-600/20 cursor-pointer"
            >
              {isValidating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validando Conexão...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{hasSessionKey ? 'Atualizar & Validar' : 'Validar & Conectar'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
