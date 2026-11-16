import {
  VoiceRecognitionState,
  VoiceRecognitionError,
  VoiceRecognitionErrorCode,
  getVoiceErrorMessage,
} from './types';

// Declaração de compatibilidade para navegadores com prefixo WebKit
type SpeechRecognitionInstance = any;

export interface SpeechRecognitionCallbacks {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (error: VoiceRecognitionError) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export class SpeechRecognitionService {
  private recognition: SpeechRecognitionInstance | null = null;
  private state: VoiceRecognitionState = 'idle';
  private callbacks: SpeechRecognitionCallbacks | null = null;
  private accumulatedFinalTranscript: string = '';

  constructor() {
    this.initRecognition();
  }

  private getRecognitionConstructor(): any {
    if (typeof window === 'undefined') return null;
    return (
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      null
    );
  }

  /**
   * Verifica se o navegador atual oferece suporte à Web Speech API (reconhecimento de fala).
   */
  public isSupported(): boolean {
    return this.getRecognitionConstructor() !== null;
  }

  private initRecognition(): void {
    const RecognitionConstructor = this.getRecognitionConstructor();
    if (!RecognitionConstructor) return;

    try {
      this.recognition = new RecognitionConstructor();
      this.recognition.lang = 'pt-BR';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.state = 'listening';
        this.callbacks?.onStart?.();
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let newlyFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            newlyFinal += text;
          } else {
            interim += text;
          }
        }

        if (newlyFinal) {
          this.accumulatedFinalTranscript += (this.accumulatedFinalTranscript ? ' ' : '') + newlyFinal.trim();
        }

        const fullCurrentTranscript = (
          this.accumulatedFinalTranscript + (interim ? ' ' + interim.trim() : '')
        ).trim();

        this.callbacks?.onTranscript(fullCurrentTranscript, newlyFinal.length > 0 && !interim);
      };

      this.recognition.onerror = (event: any) => {
        const rawError = event.error || 'unknown';
        let code: VoiceRecognitionErrorCode = 'unknown';

        if (rawError === 'not-allowed' || rawError === 'service-not-allowed') {
          code = 'not-allowed';
        } else if (rawError === 'no-speech') {
          code = 'no-speech';
        } else if (rawError === 'audio-capture') {
          code = 'audio-capture';
        } else if (rawError === 'network') {
          code = 'network';
        } else if (rawError === 'aborted') {
          code = 'aborted';
        }

        // Em escuta contínua, uma pausa breve dispara no-speech no Chrome;
        // não encerramos a escuta abruptamente se o usuário ainda estiver no modo de escuta ativa.
        if (code === 'no-speech' && this.state === 'listening') {
          return;
        }

        this.state = code === 'aborted' ? 'idle' : 'error';
        const error: VoiceRecognitionError = {
          code,
          message: getVoiceErrorMessage(code),
        };
        this.callbacks?.onError(error);
      };

      this.recognition.onend = () => {
        // Se o usuário ainda estiver em escuta ativa (ex: timeout transitório do Chrome por silêncio momentâneo),
        // retoma a escuta suavemente para que a fala não seja cortada.
        if (this.state === 'listening') {
          try {
            this.recognition.start();
            return;
          } catch {
            // Se não puder reiniciar, finaliza graciosamente
          }
        }
        this.state = 'idle';
        this.callbacks?.onEnd?.();
      };
    } catch {
      this.recognition = null;
    }
  }

  /**
   * Inicia a captura e transcrição de fala em pt-BR.
   */
  public start(callbacks: SpeechRecognitionCallbacks): void {
    if (!this.isSupported()) {
      callbacks.onError({
        code: 'not-supported',
        message: getVoiceErrorMessage('not-supported'),
      });
      return;
    }

    if (this.state === 'listening') {
      this.stop();
    }

    this.callbacks = callbacks;
    this.accumulatedFinalTranscript = '';

    try {
      this.recognition.start();
    } catch (err: any) {
      // Caso o recognition já esteja ativo ou inicializando
      if (err?.name === 'InvalidStateError') {
        try {
          this.recognition.stop();
          setTimeout(() => {
            try {
              this.recognition.start();
            } catch {
              // silencioso
            }
          }, 100);
        } catch {
          // silencioso
        }
      } else {
        callbacks.onError({
          code: 'unknown',
          message: err?.message || getVoiceErrorMessage('unknown'),
        });
      }
    }
  }

  /**
   * Encerra a escuta normalmente, permitindo que a última transcrição seja processada.
   */
  public stop(): void {
    if (this.recognition && this.state === 'listening') {
      try {
        this.recognition.stop();
      } catch {
        // silencioso
      }
    }
    this.state = 'idle';
  }

  /**
   * Interrompe imediatamente a escuta e descarta buffers pendentes.
   */
  public abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // silencioso
      }
    }
    this.state = 'idle';
    this.accumulatedFinalTranscript = '';
  }

  public getState(): VoiceRecognitionState {
    return this.state;
  }
}

// Instância singleton para uso na aplicação
export const speechRecognitionService = new SpeechRecognitionService();

