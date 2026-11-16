import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Mic,
  Volume2,
  Check,
  AlertCircle,
  X,
  RefreshCw,
  Info,
  ShieldCheck,
} from 'lucide-react';
import {
  audioDeviceService,
  AudioDeviceOption,
} from '../../services/voice/audioDeviceService';

interface AudioDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelected?: (deviceId: string) => void;
}

export const AudioDeviceModal: React.FC<AudioDeviceModalProps> = ({
  isOpen,
  onClose,
  onDeviceSelected,
}) => {
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carrega dispositivos disponíveis e preferência atual
  const loadDevices = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await audioDeviceService.getAudioInputDevices();
      setDevices(list);

      const savedPref = audioDeviceService.getPreferredAudioDeviceId();
      if (savedPref && list.some((d) => d.deviceId === savedPref)) {
        setSelectedDeviceId(savedPref);
      } else if (list.length > 0) {
        // Prefere dispositivo que pareça headset/USB ou o primeiro disponível
        const headsetDev = list.find((d) => d.isHeadset);
        const chosen = headsetDev ? headsetDev.deviceId : list[0].deviceId;
        setSelectedDeviceId(chosen);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao buscar dispositivos de áudio.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDevices();
    } else {
      setAudioLevel(0);
    }
  }, [isOpen]);

  // Monitora o nível de áudio em tempo real com base no dispositivo selecionado
  useEffect(() => {
    if (!isOpen) return;

    const stopMonitor = audioDeviceService.startAudioLevelMonitor(
      selectedDeviceId,
      (level) => setAudioLevel(level),
      (err) => {
        console.warn('[AudioDeviceModal] Erro no monitor de áudio:', err);
      }
    );

    return () => {
      stopMonitor();
    };
  }, [isOpen, selectedDeviceId]);

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    audioDeviceService.setPreferredAudioDeviceId(deviceId);
    onDeviceSelected?.(deviceId);
  };

  if (!isOpen) return null;

  const currentDevice = devices.find((d) => d.deviceId === selectedDeviceId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-device-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-cyan-600/20">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h3 id="audio-device-modal-title" className="text-base font-bold text-white flex items-center gap-2">
                Configuração de Áudio & Headset
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/40">
                  Voz v1
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Selecione seu microfone ou headset e teste a captação em tempo real.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Alerta de Erro, se houver */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Medidor de Áudio em Tempo Real (VU Meter) */}
          <div className="bg-slate-950/80 border border-cyan-800/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                Teste em Tempo Real do Microfone:
              </span>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                audioLevel > 10
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {audioLevel > 10 ? `Captação: ${audioLevel}%` : 'Aguardando fala...'}
              </span>
            </div>

            {/* Barra do Medidor */}
            <div className="w-full bg-slate-800/80 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  audioLevel > 20
                    ? 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500'
                    : 'bg-emerald-500/70'
                }`}
                style={{ width: `${Math.min(100, Math.max(audioLevel, 2))}%` }}
              />
            </div>

            {/* Feedback Dinâmico do Teste */}
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>
                {audioLevel > 10 ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Som captado com sucesso! O microfone está funcionando.
                  </span>
                ) : (
                  'Fale no seu headset agora para verificar se a barra responde...'
                )}
              </span>
              <button
                type="button"
                onClick={loadDevices}
                disabled={isLoading}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                title="Recarregar lista de dispositivos"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar dispositivos
              </button>
            </div>
          </div>

          {/* Seleção de Dispositivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Selecione o Dispositivo de Entrada de Áudio:
            </label>

            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                Detectando microfones conectados...
              </div>
            ) : devices.length === 0 ? (
              <div className="p-4 bg-amber-950/40 border border-amber-800/50 rounded-xl text-xs text-amber-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  Nenhum microfone identificado
                </p>
                <p className="text-[11px] text-slate-300">
                  Verifique se o seu headset está devidamente conectado ao computador e se o navegador possui permissão de acesso ao microfone.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map((device) => {
                  const isSelected = device.deviceId === selectedDeviceId;
                  return (
                    <div
                      key={device.deviceId}
                      onClick={() => handleSelectDevice(device.deviceId)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-cyan-950/50 border-cyan-500/80 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-500/30'
                          : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {device.isHeadset ? <Headphones className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {device.label || 'Microfone Padrão do Sistema'}
                            </span>
                            {device.isHeadset && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 bg-violet-950/80 text-violet-300 border border-violet-800/50 rounded">
                                Headset
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate font-mono">
                            ID: {device.deviceId ? device.deviceId.slice(0, 20) + '...' : 'padrão'}
                          </span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500 text-white'
                          : 'border-slate-700 bg-slate-900'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dica Prática de Configuração do Google Chrome */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Como garantir que o Chrome utilize seu headset no reconhecimento de voz:</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              O Google Chrome direciona o reconhecimento de voz nativo (Web Speech API) para o microfone definido nas configurações de permissão do site. Para ter certeza de que o headset está ativo:
            </p>
            <ol className="list-decimal list-inside text-[11px] text-slate-300 space-y-1 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
              <li>Clique no ícone de ajustes/permissões à esquerda do endereço <strong>http://localhost:3000</strong>.</li>
              <li>Na opção <strong>Microfone</strong>, confirme que o seu headset ({currentDevice?.label || 'OX Orion'}) está selecionado.</li>
              <li>Fale no microfone e observe a barra de teste acima se movimentar.</li>
            </ol>
          </div>

          {/* Garantia de Privacidade e Segurança */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>O NeuroClass AI processa o teste de áudio localmente em seu navegador sem armazenar gravações.</span>
          </div>
        </div>

        {/* Rodapé com botão de confirmação */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {currentDevice ? `Dispositivo ativo: ${currentDevice.label}` : 'Nenhum dispositivo selecionado'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-cyan-600/20 transition-colors"
          >
            Concluir & Salvar Ajustes
          </button>
        </div>
      </div>
    </div>
  );
};

