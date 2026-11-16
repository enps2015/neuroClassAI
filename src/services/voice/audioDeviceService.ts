/**
 * Serviço de Gerenciamento e Monitoramento de Dispositivos de Áudio (Microfones e Headsets).
 * Permite listar dispositivos, salvar preferência do usuário e monitorar nível de áudio (VU meter) em tempo real.
 */

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  groupId?: string;
  isHeadset?: boolean;
}

const STORAGE_KEY_PREFERRED_MIC = 'neuroclass_preferred_mic_id';
const inMemoryFallback = new Map<string, string>();

function getStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return {
    getItem: (k: string) => inMemoryFallback.get(k) || null,
    setItem: (k: string, v: string) => inMemoryFallback.set(k, v),
    removeItem: (k: string) => inMemoryFallback.delete(k),
  };
}

export class AudioDeviceService {
  /**
   * Verifica se o navegador possui suporte à API de Mídia (getUserMedia e enumerateDevices).
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' &&
      Boolean(navigator?.mediaDevices && navigator?.mediaDevices?.enumerateDevices);
  }

  /**
   * Obtém o ID do dispositivo de áudio preferido salvo pelo usuário.
   */
  public getPreferredAudioDeviceId(): string | null {
    try {
      const storage = getStorage();
      return storage.getItem(STORAGE_KEY_PREFERRED_MIC);
    } catch {
      return inMemoryFallback.get(STORAGE_KEY_PREFERRED_MIC) || null;
    }
  }

  /**
   * Salva a preferência de microfone no armazenamento local.
   */
  public setPreferredAudioDeviceId(deviceId: string): void {
    try {
      const storage = getStorage();
      if (deviceId) {
        storage.setItem(STORAGE_KEY_PREFERRED_MIC, deviceId);
      } else {
        storage.removeItem(STORAGE_KEY_PREFERRED_MIC);
      }
    } catch {
      if (deviceId) {
        inMemoryFallback.set(STORAGE_KEY_PREFERRED_MIC, deviceId);
      } else {
        inMemoryFallback.delete(STORAGE_KEY_PREFERRED_MIC);
      }
    }
  }

  /**
   * Lista todos os dispositivos de entrada de áudio (microfones/headsets) detectados.
   * Se os nomes estiverem vazios (sem permissão concedida ainda), solicita uma permissão rápida para obter os rótulos.
   */
  public async getAudioInputDevices(): Promise<AudioDeviceOption[]> {
    if (!this.isSupported()) return [];

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter((d) => d.kind === 'audioinput');

      // Se nenhum tiver rótulo visível, tenta pedir permissão para desbloquear os nomes dos dispositivos
      const allEmptyLabels = audioInputs.length > 0 && audioInputs.every((d) => !d.label);
      if (allEmptyLabels) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter((d) => d.kind === 'audioinput');
        } catch {
          // Mantém os que tiver mesmo sem rótulo detalhado
        }
      }

      return audioInputs.map((device, idx) => {
        const rawLabel = device.label || `Microfone ${idx + 1}`;
        const isHeadset = /headset|fone|orion|usb|bluetooth|wireless|airpod|buds/i.test(rawLabel);

        return {
          deviceId: device.deviceId,
          label: rawLabel,
          groupId: device.groupId,
          isHeadset,
        };
      });
    } catch (err) {
      console.warn('[AudioDeviceService] Falha ao enumerar dispositivos de áudio:', err);
      return [];
    }
  }

  /**
   * Inicia o monitoramento contínuo de volume (VU meter) em tempo real via Web Audio API.
   * Retorna uma função de limpeza para interromper o fluxo e liberar os recursos.
   *
   * @param deviceId ID do dispositivo específico ou null/undefined para o padrão.
   * @param onLevel Callback acionado a cada quadro com o nível normalizado de 0 a 100.
   * @param onError Callback acionado caso ocorra falha de captura de áudio.
   */
  public startAudioLevelMonitor(
    deviceId: string | null | undefined,
    onLevel: (level: number) => void,
    onError?: (err: Error) => void
  ): () => void {
    let isCancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationFrameId: number | null = null;

    const cleanup = () => {
      isCancelled = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    };

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      onError?.(new Error('API de mídia não suportada'));
      return cleanup;
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((mediaStream) => {
        if (isCancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        stream = mediaStream;

        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          onError?.(new Error('AudioContext não disponível'));
          return;
        }

        audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (isCancelled) return;

          analyser.getByteFrequencyData(dataArray);

          // Calcula volume médio das frequências captadas
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;

          // Normaliza valor para escala 0 - 100 com sensibilidade otimizada para fala
          const normalized = Math.min(100, Math.round((average / 128) * 100 * 1.5));
          onLevel(normalized);

          animationFrameId = requestAnimationFrame(updateLevel);
        };

        animationFrameId = requestAnimationFrame(updateLevel);
      })
      .catch((err) => {
        if (!isCancelled) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });

    return cleanup;
  }

  /**
   * Converte um Blob de áudio em string base64 pura (sem prefixo data:...).
   */
  public async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64Data = result ? (result.split(',')[1] || '') : '';
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Inicia a gravação direta de áudio do dispositivo selecionado via MediaRecorder.
   * Utilizado como motor de alta fidelidade e fallback resiliente caso o Web Speech API falhe.
   */
  public async startAudioRecording(
    deviceId: string | null | undefined
  ): Promise<{
    stop: () => Promise<{ blob: Blob; mimeType: string }>;
    cancel: () => void;
  }> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      return {
        stop: async () => ({ blob: new Blob([], { type: 'audio/webm' }), mimeType: 'audio/webm' }),
        cancel: () => {},
      };
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      ? 'audio/webm;codecs=opus'
      : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
      ? 'audio/webm'
      : 'audio/ogg';

    let mediaRecorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];

    if (typeof MediaRecorder !== 'undefined') {
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        mediaRecorder.start(100);
      } catch (err) {
        console.warn('[AudioDeviceService] MediaRecorder não pôde ser iniciado com mimeType:', mimeType, err);
      }
    }

    const cancel = () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {}
      }
      stream.getTracks().forEach((track) => track.stop());
    };

    const stop = (): Promise<{ blob: Blob; mimeType: string }> => {
      return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          stream.getTracks().forEach((track) => track.stop());
          resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
          return;
        }

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const finalBlob = new Blob(chunks, { type: mimeType });
          resolve({ blob: finalBlob, mimeType });
        };

        try {
          mediaRecorder.stop();
        } catch {
          stream.getTracks().forEach((track) => track.stop());
          resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
        }
      });
    };

    return { stop, cancel };
  }
}

export const audioDeviceService = new AudioDeviceService();
