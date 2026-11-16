import { VoiceSynthesisState } from './types';
import { AIKeyManager } from '../ai/aiKeyManager';

/**
 * Remove sintaxe de Markdown e formatações para que o texto soe natural ao ser sintetizado por voz.
 */
export function stripMarkdownForSpeech(text: string): string {
  if (!text) return '';

  return text
    // Remove delimitadores de cabeçalho (###, ##, #)
    .replace(/^#+\s+/gm, '')
    // Remove marcadores técnicos de citação controlada [C1], [C2], [C99], [C1][C2]
    .replace(/\[C\s*\d+\]/gi, '')
    // Substitui [Pág. 42] por Página 42
    .replace(/\[Pág\.\s*(\d+)\]/gi, 'Página $1')
    // Substitui referências de seções [Seção "Título"] por Seção Título
    .replace(/\[Seção\s*"([^"]+)"\]/gi, 'Seção $1')
    // Substitui links markdown [Texto](url) por Texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove badges como [pdf_page]: ou [note_section]:
    .replace(/\[[a-zA-Z0-9_\-\s]+\]:\s*/g, '')
    // Remove negrito e itálico (**texto**, *texto*, __texto__, _texto_)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Remove código inline `código`
    .replace(/`([^`]+)`/g, '$1')
    // Remove divisores horizontais (--- ou ***)
    .replace(/^[-*]{3,}\s*$/gm, '')
    // Converte marcadores de lista (* item ou - item ou 1. item) para fala contínua
    .replace(/^\s*[\*\-]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Normaliza acrônimos comuns para pronúncia pedagógica fluida
    .replace(/C\.R\.E\.A\.R\./gi, 'Criar')
    .replace(/FSRS-7/gi, 'F S R S 7')
    .replace(/DAG/g, 'D A G')
    .replace(/BYOK/gi, 'B Y O K')
    // Remove fórmulas KaTeX / LaTeX ($...$ ou $$...$$)
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$\n]+\$/g, '')
    // Remove emojis e pictogramas para evitar que o sintetizador leia descrições literais (ex: "cérebro", "alvo")
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    // Normaliza quebras de linha múltiplas para pausas de pontuação
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    // Remove pontuações repetidas ou espaçamentos múltiplos
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Divide textos longos em sentenças curtas e naturais para síntese de voz fluida,
 * prevenindo estouro de buffer do navegador e erros como 'synthesis-failed'.
 */
export function splitTextIntoChunks(text: string, maxChunkLength: number = 160): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (clean.length <= maxChunkLength) return [clean];

  // Divide preferencialmente por pontuações de fim de frase
  const sentenceRegex = /[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g;
  const matches = clean.match(sentenceRegex) || [clean];
  const chunks: string[] = [];

  for (const raw of matches) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= maxChunkLength) {
      chunks.push(s);
    } else {
      // Divide por vírgulas ou ponto-e-vírgula se a sentença for muito longa
      const commaParts = s.split(/([,;:]\s+)/);
      let current = '';
      for (const part of commaParts) {
        if ((current + part).length <= maxChunkLength) {
          current += part;
        } else {
          if (current.trim()) chunks.push(current.trim());
          current = part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks.length > 0 ? chunks : [clean];
}

export interface SpeechSynthesisOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
  onPause?: () => void;
  onResume?: () => void;
  rate?: number;
  pitch?: number;
}

export class SpeechSynthesisService {
  private state: VoiceSynthesisState = 'idle';
  private currentUtterance: any = null;
  private lastSpokenText: string = '';
  private lastOptions: SpeechSynthesisOptions | undefined;
  private preferredVoice: any = null;
  private keepAliveInterval: any = null;

  // Motor Híbrido Resiliente (Native Web Speech + Audio Stream Fallback)
  private activeEngine: 'native' | 'stream' | 'none' = 'none';
  private audioPlayer: any = null;
  private currentChunks: string[] = [];
  private currentChunkIndex: number = 0;
  private forceAudioStreamFallback: boolean = false;
  private preloadedAudios: Map<number, any> = new Map();
  private playbackRate: number = 1.15;

  constructor() {
    this.initVoices();
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public setPlaybackRate(rate: number): void {
    const validRate = typeof rate === 'number' && rate > 0 ? rate : 1.15;
    this.playbackRate = validRate;
    if (this.audioPlayer) {
      try {
        this.audioPlayer.playbackRate = validRate;
      } catch {}
    }
  }

  private getSynthesis(): SpeechSynthesis | null {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      return window.speechSynthesis;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).speechSynthesis) {
      return (globalThis as any).speechSynthesis;
    }
    return null;
  }

  private getUtteranceConstructor(): any {
    if (typeof window !== 'undefined' && (window as any).SpeechSynthesisUtterance) {
      return (window as any).SpeechSynthesisUtterance;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).SpeechSynthesisUtterance) {
      return (globalThis as any).SpeechSynthesisUtterance;
    }
    return null;
  }

  private getAudioConstructor(): any {
    if (typeof window !== 'undefined' && (window as any).Audio) {
      return (window as any).Audio;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).Audio) {
      return (globalThis as any).Audio;
    }
    return null;
  }

  public isSupported(): boolean {
    const hasNative = this.getSynthesis() !== null && this.getUtteranceConstructor() !== null;
    const hasAudio = this.getAudioConstructor() !== null;
    return hasNative || hasAudio;
  }

  private initVoices(): void {
    const synth = this.getSynthesis();
    if (!synth) return;

    const loadVoices = () => {
      try {
        const voices = synth.getVoices?.() || [];
        const ptBrVoice = voices.find(
          (v: any) => v.lang === 'pt-BR' || v.lang === 'pt_BR'
        );
        const anyPtVoice = voices.find((v: any) => v.lang?.toLowerCase().startsWith('pt'));
        const namedVoice = voices.find((v: any) => v.name?.toLowerCase().includes('portug'));

        this.preferredVoice = ptBrVoice || anyPtVoice || namedVoice || null;
      } catch {
        this.preferredVoice = null;
      }
    };

    loadVoices();
    try {
      if (synth) {
        synth.onvoiceschanged = loadVoices;
      }
    } catch {
      // silencioso
    }
  }

  /**
   * Obtém dinamicamente a melhor voz em Português do Brasil disponível no momento,
   * priorizando vozes neurais / naturais modernas quando suportadas pelo navegador.
   */
  public getBestPortugueseVoice(): any {
    const synth = this.getSynthesis();
    if (!synth) return null;
    try {
      const voices = synth.getVoices?.() || [];
      const ptVoices = voices.filter(
        (v: any) => v.lang === 'pt-BR' || v.lang === 'pt_BR' || v.lang?.toLowerCase().startsWith('pt')
      );

      // 1ª prioridade: Vozes neurais / naturais de alta fidelidade
      const neuralVoice = ptVoices.find((v: any) =>
        /natural|neural|enhanced|online/i.test(v.name)
      );
      if (neuralVoice) return neuralVoice;

      // 2ª prioridade: Vozes oficiais do Brasil
      const ptBrVoice = ptVoices.find((v: any) => v.lang === 'pt-BR' || v.lang === 'pt_BR');
      if (ptBrVoice) return ptBrVoice;

      // 3ª prioridade: Qualquer voz em português
      return ptVoices[0] || this.preferredVoice || null;
    } catch {
      return this.preferredVoice || null;
    }
  }

  /**
   * Desbloqueia os motores de áudio/síntese durante uma ação direta do usuário (clique/envio),
   * permitindo que o navegador autorize a reprodução da resposta gerada posteriormente pela API.
   */
  public unlockAudioGesture(): void {
    // 1. Desbloqueia Web Speech API Utterance
    const synth = this.getSynthesis();
    const UtteranceClass = this.getUtteranceConstructor();
    if (synth && UtteranceClass) {
      try {
        synth.cancel();
        const primer = new UtteranceClass(' ');
        primer.volume = 0.01;
        primer.rate = 10;
        synth.speak(primer);
      } catch {}
    }

    // 2. Desbloqueia HTML5 Audio Context para o tab atual
    const AudioClass = this.getAudioConstructor();
    if (AudioClass) {
      try {
        const silent = new AudioClass('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silent.volume = 0.01;
        const p = silent.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            silent.pause();
          }).catch(() => {});
        }
      } catch {}
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    const synth = this.getSynthesis();
    if (!synth || typeof setInterval === 'undefined') return;

    this.keepAliveInterval = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        try {
          synth.pause();
          synth.resume();
        } catch {}
      }
    }, 10000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  public getVoices(): any[] {
    const synth = this.getSynthesis();
    if (!synth) return [];
    try {
      return synth.getVoices() || [];
    } catch {
      return [];
    }
  }

  public getState(): VoiceSynthesisState {
    return this.state;
  }

  public isSpeaking(): boolean {
    return this.state === 'speaking';
  }

  public isPaused(): boolean {
    return this.state === 'paused';
  }

  /**
   * Reproduz o texto utilizando síntese de voz nativa em pt-BR com fallback
   * automático para streaming de áudio caso o navegador dispare 'synthesis-failed'.
   */
  public speak(text: string, options?: SpeechSynthesisOptions): void {
    if (!this.isSupported()) {
      options?.onError?.(new Error('Síntese de voz e áudio não suportados pelo navegador.'));
      return;
    }

    const cleanText = stripMarkdownForSpeech(text);
    if (!cleanText) return;

    // Cancela fala anterior se em andamento
    this.stop();

    this.lastSpokenText = text;
    this.lastOptions = options;

    // Divide em sentenças de tamanho ideal para prevenir sobrecarga de buffers
    this.currentChunks = splitTextIntoChunks(cleanText, 160);
    this.currentChunkIndex = 0;

    // Se já sabemos que o navegador falhou anteriormente ou não tem síntese nativa, vai direto ao streaming
    if (this.forceAudioStreamFallback || !this.getSynthesis() || !this.getUtteranceConstructor()) {
      this.state = 'speaking';
      this.playAudioStreamChunks(options, 0);
      return;
    }

    const startSpeaking = () => {
      this.state = 'speaking';
      this.playNativeUtterance(options, 0);
    };

    const synth = this.getSynthesis();
    if (synth && (synth.speaking || synth.pending)) {
      try {
        synth.cancel();
      } catch {}
      setTimeout(startSpeaking, 10);
    } else {
      startSpeaking();
    }
  }

  /**
   * Executa a reprodução nativa sentença por sentença via Web Speech API.
   */
  private playNativeUtterance(options?: SpeechSynthesisOptions, chunkIndex: number = 0): void {
    if (chunkIndex >= this.currentChunks.length) {
      this.state = 'idle';
      this.activeEngine = 'none';
      this.stopKeepAlive();
      this.currentUtterance = null;
      options?.onEnd?.();
      return;
    }

    const synth = this.getSynthesis();
    const UtteranceClass = this.getUtteranceConstructor();

    if (!synth || !UtteranceClass) {
      this.playAudioStreamChunks(options, chunkIndex);
      return;
    }

    try {
      this.currentChunkIndex = chunkIndex;
      const chunk = this.currentChunks[chunkIndex];
      const utterance = new UtteranceClass(chunk);
      utterance.lang = 'pt-BR';
      utterance.rate = options?.rate ?? this.playbackRate;
      utterance.pitch = options?.pitch ?? 1.0;

      const bestVoice = this.getBestPortugueseVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
        if (bestVoice.lang) {
          utterance.lang = bestVoice.lang;
        }
      }

      utterance.onstart = () => {
        this.activeEngine = 'native';
        this.state = 'speaking';
        if (chunkIndex === 0) {
          this.startKeepAlive();
          options?.onStart?.();
        }
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        this.playNativeUtterance(options, chunkIndex + 1);
      };

      utterance.onerror = (err: any) => {
        this.stopKeepAlive();
        this.currentUtterance = null;

        // Se cancelado intencionalmente pelo usuário
        if (err?.error === 'canceled' || err?.error === 'interrupted') {
          this.state = 'idle';
          this.activeEngine = 'none';
          return;
        }

        // Falhas típicas de navegadores Linux/Chromium ('synthesis-failed', 'not-allowed', 'network')
        // Aciona imediatamente o fallback de áudio streaming para não interromper o aluno
        console.warn(`[SpeechSynthesis] Falha nativa (${err?.error || 'desconhecido'}). Ativando fallback resiliente de áudio...`);
        this.forceAudioStreamFallback = true;
        this.playAudioStreamChunks(options, chunkIndex);
      };

      utterance.onpause = () => {
        this.state = 'paused';
        options?.onPause?.();
      };

      utterance.onresume = () => {
        this.state = 'speaking';
        options?.onResume?.();
      };

      this.currentUtterance = utterance;
      synth.speak(utterance);
    } catch (err: any) {
      console.warn('[SpeechSynthesis] Exceção na chamada nativa:', err);
      this.forceAudioStreamFallback = true;
      this.playAudioStreamChunks(options, chunkIndex);
    }
  }

  /**
   * Reproduz sentenças encadeadas via streaming de áudio pt-BR (/api/voice/tts).
   */
  private playAudioStreamChunks(options?: SpeechSynthesisOptions, chunkIndex: number = 0): void {
    if (chunkIndex >= this.currentChunks.length) {
      this.state = 'idle';
      this.activeEngine = 'none';
      this.audioPlayer = null;
      this.preloadedAudios.clear();
      options?.onEnd?.();
      return;
    }

    const AudioClass = this.getAudioConstructor();
    if (!AudioClass) {
      this.state = 'idle';
      this.activeEngine = 'none';
      options?.onError?.(new Error('Nenhum mecanismo de áudio disponível no ambiente.'));
      return;
    }

    try {
      this.currentChunkIndex = chunkIndex;
      const chunk = this.currentChunks[chunkIndex];
      const apiKey = AIKeyManager.getApiKey() || '';
      const keyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
      const effectiveRate = options?.rate ?? this.playbackRate;
      const ttsUrl = `/api/voice/tts?text=${encodeURIComponent(chunk)}&lang=pt-BR&rate=${effectiveRate}${keyParam}`;

      const audio = this.preloadedAudios.get(chunkIndex) || new AudioClass(ttsUrl);
      this.audioPlayer = audio;
      this.activeEngine = 'stream';
      this.state = 'speaking';
      try {
        audio.playbackRate = effectiveRate;
        audio.defaultPlaybackRate = effectiveRate;
      } catch {}

      // Pré-carrega o próximo chunk para transição sem pausas
      if (chunkIndex + 1 < this.currentChunks.length && !this.preloadedAudios.has(chunkIndex + 1)) {
        try {
          const nextUrl = `/api/voice/tts?text=${encodeURIComponent(this.currentChunks[chunkIndex + 1])}&lang=pt-BR&rate=${effectiveRate}${keyParam}`;
          const nextAudio = new AudioClass(nextUrl);
          nextAudio.preload = 'auto';
          try {
            nextAudio.playbackRate = effectiveRate;
            nextAudio.defaultPlaybackRate = effectiveRate;
          } catch {}
          this.preloadedAudios.set(chunkIndex + 1, nextAudio);
        } catch {}
      }

      audio.onplay = () => {
        this.state = 'speaking';
        if (chunkIndex === 0) {
          options?.onStart?.();
        }
      };

      audio.onended = () => {
        this.preloadedAudios.delete(chunkIndex);
        this.playAudioStreamChunks(options, chunkIndex + 1);
      };

      audio.onerror = (e: any) => {
        console.warn(`[AudioStream] Erro no chunk ${chunkIndex}:`, e);
        // Tenta continuar com o próximo chunk se houver
        if (chunkIndex + 1 < this.currentChunks.length) {
          this.playAudioStreamChunks(options, chunkIndex + 1);
        } else {
          this.state = 'idle';
          this.activeEngine = 'none';
          this.audioPlayer = null;
          options?.onError?.(e);
        }
      };

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err: any) => {
          console.warn('[AudioStream] Play promise catch:', err);
          this.state = 'idle';
          this.activeEngine = 'none';
          options?.onError?.(err);
        });
      }
    } catch (err: any) {
      console.warn('[AudioStream] Exceção ao reproduzir streaming:', err);
      this.state = 'idle';
      this.activeEngine = 'none';
      options?.onError?.(err);
    }
  }

  /**
   * Pausa a reprodução atual (nativa ou streaming).
   */
  public pause(): void {
    if (this.state !== 'speaking') return;

    if (this.activeEngine === 'native') {
      const synth = this.getSynthesis();
      if (synth) {
        try {
          synth.pause();
        } catch {}
      }
    } else if (this.activeEngine === 'stream' && this.audioPlayer) {
      try {
        this.audioPlayer.pause();
      } catch {}
    }

    this.state = 'paused';
    this.lastOptions?.onPause?.();
  }

  /**
   * Continua a reprodução pausada.
   */
  public resume(): void {
    if (this.state !== 'paused') return;

    if (this.activeEngine === 'native') {
      const synth = this.getSynthesis();
      if (synth) {
        try {
          synth.resume();
        } catch {}
      }
    } else if (this.activeEngine === 'stream' && this.audioPlayer) {
      try {
        this.audioPlayer.play().catch(() => {});
      } catch {}
    }

    this.state = 'speaking';
    this.lastOptions?.onResume?.();
  }

  /**
   * Interrompe imediatamente a reprodução e limpa a fila de fala.
   */
  public stop(): void {
    this.stopKeepAlive();

    const synth = this.getSynthesis();
    if (synth) {
      try {
        synth.cancel();
      } catch {}
    }

    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
      } catch {}
      this.audioPlayer = null;
    }

    this.preloadedAudios.clear();
    this.currentChunks = [];
    this.currentChunkIndex = 0;
    this.activeEngine = 'none';
    this.state = 'idle';
    this.currentUtterance = null;
  }

  /**
   * Repete o último texto falado.
   */
  public repeat(): void {
    if (this.lastSpokenText) {
      this.speak(this.lastSpokenText, this.lastOptions);
    }
  }
}

// Instância singleton para uso na aplicação
export const speechSynthesisService = new SpeechSynthesisService();
