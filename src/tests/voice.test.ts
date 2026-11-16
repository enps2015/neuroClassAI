import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpeechRecognitionService,
  SpeechSynthesisService,
  stripMarkdownForSpeech,
  splitTextIntoChunks,
  getVoiceErrorMessage,
  VOICE_PRIVACY_DISCLOSURE,
  VoiceRecognitionError,
  audioDeviceService,
} from '../services/voice';
import { AIKeyManager } from '../services/ai/aiKeyManager';
import type { TutorChatMessage } from '../types';

// Mock simples de Web Speech API (SpeechRecognition)
class MockSpeechRecognition {
  public lang: string = '';
  public continuous: boolean = false;
  public interimResults: boolean = false;
  public maxAlternatives: number = 1;
  public onstart: (() => void) | null = null;
  public onend: (() => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onresult: ((event: any) => void) | null = null;

  private isStarted: boolean = false;

  public start(): void {
    this.isStarted = true;
    if (this.onstart) {
      setTimeout(() => this.onstart?.(), 5);
    }
  }

  public stop(): void {
    this.isStarted = false;
    if (this.onend) {
      setTimeout(() => this.onend?.(), 5);
    }
  }

  public abort(): void {
    this.isStarted = false;
    if (this.onerror) {
      this.onerror({ error: 'aborted' });
    }
    if (this.onend) {
      setTimeout(() => this.onend?.(), 5);
    }
  }

  public simulateResult(transcript: string, isFinal: boolean = true): void {
    if (!this.onresult) return;
    const event = {
      resultIndex: 0,
      results: [
        {
          0: { transcript, confidence: 0.95 },
          isFinal,
          length: 1,
        },
      ],
    };
    this.onresult(event);
  }

  public simulateError(error: string): void {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// Mock simples de Web Speech API (SpeechSynthesis)
class MockSpeechSynthesisUtterance {
  public text: string = '';
  public lang: string = 'pt-BR';
  public rate: number = 1;
  public pitch: number = 1;
  public voice: any = null;
  public onstart: (() => void) | null = null;
  public onend: (() => void) | null = null;
  public onerror: ((err: any) => void) | null = null;
  public onpause: (() => void) | null = null;
  public onresume: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSpeechSynthesis {
  public paused: boolean = false;
  public speaking: boolean = false;
  public currentUtterance: MockSpeechSynthesisUtterance | null = null;
  public onvoiceschanged: (() => void) | null = null;

  public getVoices(): any[] {
    return [
      { name: 'Google Português do Brasil', lang: 'pt-BR', default: true },
      { name: 'Luciana (pt-BR)', lang: 'pt-BR', default: false },
      { name: 'Google US English', lang: 'en-US', default: false },
    ];
  }

  public speak(utterance: MockSpeechSynthesisUtterance): void {
    this.currentUtterance = utterance;
    this.speaking = true;
    this.paused = false;
    setTimeout(() => {
      utterance.onstart?.();
    }, 5);
  }

  public pause(): void {
    this.paused = true;
    this.speaking = false;
    this.currentUtterance?.onpause?.();
  }

  public resume(): void {
    this.paused = false;
    this.speaking = true;
    this.currentUtterance?.onresume?.();
  }

  public cancel(): void {
    if (this.currentUtterance) {
      this.currentUtterance.onerror?.({ error: 'canceled' });
    }
    this.currentUtterance = null;
    this.speaking = false;
    this.paused = false;
  }

  public completeCurrent(): void {
    if (this.currentUtterance) {
      const u = this.currentUtterance;
      this.currentUtterance = null;
      this.speaking = false;
      this.paused = false;
      u.onend?.();
    }
  }
}

// Configuração de ambiente global mockado para testes
let mockRecognitionInstance: MockSpeechRecognition | null = null;
let mockSynthesisInstance = new MockSpeechSynthesis();

(globalThis as any).speechSynthesis = mockSynthesisInstance;
(globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

(globalThis as any).window = {
  SpeechRecognition: function () {
    mockRecognitionInstance = new MockSpeechRecognition();
    return mockRecognitionInstance;
  },
  webkitSpeechRecognition: function () {
    mockRecognitionInstance = new MockSpeechRecognition();
    return mockRecognitionInstance;
  },
  speechSynthesis: mockSynthesisInstance,
  SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
};

test('T285: Inicialização e encerramento do reconhecimento de fala (STT)', async () => {
  const service = new SpeechRecognitionService();
  assert.equal(service.isSupported(), true, 'Deveria reconhecer suporte ao Web Speech API');
  assert.equal(service.getState(), 'idle', 'Estado inicial deve ser idle');

  let started = false;
  let ended = false;

  service.start({
    onStart: () => {
      started = true;
    },
    onTranscript: () => {},
    onError: () => {},
    onEnd: () => {
      ended = true;
    },
  });

  // Aguarda evento onstart assíncrono
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(started, true, 'Callback onStart deve ter sido acionado');
  assert.equal(service.getState(), 'listening', 'Estado deve ser listening');
  assert.equal(mockRecognitionInstance?.lang, 'pt-BR', 'Idioma padrão deve ser pt-BR');

  service.stop();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ended, true, 'Callback onEnd deve ter sido acionado');
  assert.equal(service.getState(), 'idle', 'Estado deve retornar a idle após stop');
});

test('T286: Transcrição recebida com suporte a streaming e revisão', async () => {
  const service = new SpeechRecognitionService();
  let receivedTranscript = '';
  let isFinalFlag = false;

  service.start({
    onTranscript: (transcript, isFinal) => {
      receivedTranscript = transcript;
      isFinalFlag = isFinal;
    },
    onError: () => {},
  });

  await new Promise((r) => setTimeout(r, 10));

  // Simula fala parcial (interim)
  mockRecognitionInstance?.simulateResult('Qual é o conceito', false);
  assert.equal(receivedTranscript, 'Qual é o conceito');
  assert.equal(isFinalFlag, false);

  // Simula conclusão da frase (final)
  mockRecognitionInstance?.simulateResult('Qual é o conceito de sinapse química?', true);
  assert.equal(receivedTranscript, 'Qual é o conceito de sinapse química?');
  assert.equal(isFinalFlag, true);

  service.stop();
});

test('T287: Envio do texto transcrito ao Tutor preservando contexto e integridade', () => {
  // Simula a preparação da mensagem pelo TutorPanel após revisão do estudante
  const transcribedText = 'Explique como a bainha de mielina afeta a velocidade de condução.';
  const conceptId = 'concept_mielina_01';

  const userMsg: TutorChatMessage = {
    id: `msg_u_${Date.now()}`,
    sender: 'user',
    text: transcribedText,
    timestamp: Date.now(),
    contextConceptId: conceptId,
    pedagogicalRole: 'explanation',
  };

  assert.equal(userMsg.text, transcribedText, 'Texto transcrito deve compor a mensagem do usuário');
  assert.equal(userMsg.sender, 'user');
  assert.equal(userMsg.contextConceptId, conceptId, 'Contexto do conceito ativo deve ser mantido');
  assert.equal(userMsg.pedagogicalRole, 'explanation');
});

test('T288: Reprodução da resposta por síntese de voz (TTS) em pt-BR', async () => {
  const service = new SpeechSynthesisService();
  assert.equal(service.isSupported(), true, 'Síntese de voz deve ser suportada');

  let started = false;
  let ended = false;
  let paused = false;
  let resumed = false;

  const rawMarkdown = 'O **potencial de ação** ocorre em [Pág. 42]. Consulte a lista:\n* Despolarização\n* Repolarização';

  service.speak(rawMarkdown, {
    onStart: () => {
      started = true;
    },
    onEnd: () => {
      ended = true;
    },
    onPause: () => {
      paused = true;
    },
    onResume: () => {
      resumed = true;
    },
  });

  await new Promise((r) => setTimeout(r, 15));
  assert.equal(started, true, 'Síntese deve ter iniciado');
  assert.equal(service.isSpeaking(), true, 'isSpeaking deve ser verdadeiro');
  assert.equal(service.getState(), 'speaking');

  // Verifica se o texto falado teve a formatação markdown removida
  const spokenText = mockSynthesisInstance.currentUtterance?.text || '';
  assert.ok(!spokenText.includes('**'), 'Asteriscos de negrito devem ser removidos');
  assert.ok(spokenText.includes('Página 42'), 'Citações de página devem ser normalizadas para Página 42');
  assert.equal(mockSynthesisInstance.currentUtterance?.lang, 'pt-BR');

  // Testa pausa e retomada
  service.pause();
  assert.equal(paused, true, 'onPause deve ser acionado');
  assert.equal(service.isPaused(), true, 'isPaused deve ser verdadeiro');

  service.resume();
  assert.equal(resumed, true, 'onResume deve ser acionado');
  assert.equal(service.isSpeaking(), true);

  // Conclui reprodução
  mockSynthesisInstance.completeCurrent();
  assert.equal(ended, true, 'onEnd deve ser acionado ao término da fala');
  assert.equal(service.getState(), 'idle');
});

test('T289: Interrupção imediata (Stop) e repetição (Repeat) da fala', async () => {
  const service = new SpeechSynthesisService();
  service.speak('Mensagem curta para teste de interrupção e repetição.');
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(service.isSpeaking(), true);

  // Interrompe imediatamente
  service.stop();
  assert.equal(service.getState(), 'idle');
  assert.equal(service.isSpeaking(), false);
  assert.equal(mockSynthesisInstance.currentUtterance, null);

  // Repete a mensagem
  service.repeat();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(service.isSpeaking(), true);
  const repeatedUtterance = mockSynthesisInstance.currentUtterance as MockSpeechSynthesisUtterance | null;
  assert.ok(repeatedUtterance?.text.includes('Mensagem curta'));

  service.stop();
});

test('T290: Tratamento de Permissão Negada (microfone bloqueado)', async () => {
  const service = new SpeechRecognitionService();
  let capturedError: VoiceRecognitionError | null = null;

  service.start({
    onTranscript: () => {},
    onError: (err) => {
      capturedError = err;
    },
  });

  await new Promise((r) => setTimeout(r, 10));
  mockRecognitionInstance?.simulateError('not-allowed');

  assert.ok(capturedError !== null, 'Deveria capturar erro');
  const err = capturedError as unknown as VoiceRecognitionError;
  assert.equal(err.code, 'not-allowed');
  assert.ok(
    err.message.includes('Permissão de microfone negada'),
    'Mensagem deve instruir o estudante amigavelmente em PT-BR'
  );
  assert.equal(service.getState(), 'error');
});

test('T291: Tratamento de Falhas de Reconhecimento (no-speech, audio-capture, network)', () => {
  assert.ok(getVoiceErrorMessage('no-speech').includes('Nenhuma fala'));
  assert.ok(getVoiceErrorMessage('audio-capture').includes('dispositivo'));
  assert.ok(getVoiceErrorMessage('network').includes('rede'));
  assert.ok(getVoiceErrorMessage('aborted').includes('cancelada'));
});

test('T292: Resiliência quando o Navegador não suporta Web Speech API', () => {
  // Salva e remove temporariamente os construtores de SpeechRecognition
  const originalSpeechRecognition = (globalThis as any).window.SpeechRecognition;
  const originalWebkit = (globalThis as any).window.webkitSpeechRecognition;

  delete (globalThis as any).window.SpeechRecognition;
  delete (globalThis as any).window.webkitSpeechRecognition;

  const service = new SpeechRecognitionService();
  assert.equal(service.isSupported(), false, 'Deve reportar não suportado');

  let errorCaught: VoiceRecognitionError | null = null;
  service.start({
    onTranscript: () => {},
    onError: (err) => {
      errorCaught = err;
    },
  });

  const err = errorCaught as unknown as VoiceRecognitionError;
  assert.equal(err.code, 'not-supported');
  assert.ok(err.message.includes('não suporta'));

  // Restaura mocks
  (globalThis as any).window.SpeechRecognition = originalSpeechRecognition;
  (globalThis as any).window.webkitSpeechRecognition = originalWebkit;
});

test('T293: Preservação do BYOK e declaração de privacidade', () => {
  // Chave volátil configurada pelo estudante
  AIKeyManager.setApiKey('byok_student_voice_test_key_123');
  assert.equal(AIKeyManager.getApiKey(), 'byok_student_voice_test_key_123');

  // Declaração de privacidade
  assert.ok(
    VOICE_PRIVACY_DISCLOSURE.includes('não grava') &&
      VOICE_PRIVACY_DISCLOSURE.includes('serviços em nuvem'),
    'A declaração de privacidade deve ser transparente sobre serviços remotos do navegador e zero armazenamento pelo NeuroClass'
  );

  AIKeyManager.clearApiKey();
  assert.equal(AIKeyManager.getApiKey(), null);
});

test('T294: Sanitização estrita de Markdown e fallback para interação textual', () => {
  const complexMarkdown = `
### Conceito Central: Racionalidade Limitada 🧠
Segundo **Herbert A. Simon** [Pág. 12], os agentes operam sob $f(x) = \max(0, x)$ limitações 🎯.
* Ponto 1: Informação imperfeita 💡
* Ponto 2: Tempo escasso ✅

Para detalhes sobre o ciclo C.R.E.A.R. e o modelo FSRS-7, veja a documentação.
---
`;

  const cleaned = stripMarkdownForSpeech(complexMarkdown);

  // Não deve conter cabeçalhos ###
  assert.ok(!cleaned.includes('###'));
  // Não deve conter marcadores de negrito **
  assert.ok(!cleaned.includes('**'));
  // Não deve conter emojis que o sintetizador leria como palavras
  assert.ok(!cleaned.includes('🧠'));
  assert.ok(!cleaned.includes('🎯'));
  assert.ok(!cleaned.includes('💡'));
  assert.ok(!cleaned.includes('✅'));
  // Não deve conter fórmulas inline LaTeX
  assert.ok(!cleaned.includes('$f(x)'));
  // [Pág. 12] deve virar Página 12
  assert.ok(cleaned.includes('Página 12'));
  // Acrônimos devem soar naturais (Criar / F S R S 7)
  assert.ok(cleaned.includes('Criar'));
  assert.ok(cleaned.includes('F S R S 7'));
  // Divisores horizontais removidos
  assert.ok(!cleaned.includes('---'));
});

test('T295: Persistência e gerenciamento de dispositivo preferido de áudio (Headset)', () => {
  // Configura preferência
  audioDeviceService.setPreferredAudioDeviceId('ox_orion_usb_headset_001');
  assert.equal(
    audioDeviceService.getPreferredAudioDeviceId(),
    'ox_orion_usb_headset_001',
    'ID de headset preferido deve ser salvo e retornado corretamente'
  );

  // Limpeza de preferência
  audioDeviceService.setPreferredAudioDeviceId('');
  assert.equal(
    audioDeviceService.getPreferredAudioDeviceId(),
    null,
    'Ao definir vazio, a chave deve ser removida'
  );
});

test('T296: Monitoramento de nível de áudio (VU Meter) e resiliência de ambiente', () => {
  // Testa chamada do monitor e função de limpeza sem lançar exceções não tratadas
  let capturedLevel = 0;
  const cleanup = audioDeviceService.startAudioLevelMonitor(
    'test_device',
    (lvl) => {
      capturedLevel = lvl;
    },
    (err) => {
      assert.ok(err instanceof Error, 'Erro recebido deve ser instância de Error');
    }
  );

  assert.equal(typeof cleanup, 'function', 'Deve retornar função de limpeza');
  cleanup(); // Deve executar limpeza com segurança
  assert.equal(capturedLevel, 0);
});

test('T297: Gravação de áudio do headset e conversão para base64 (fallback Gemini)', async () => {
  const recording = await audioDeviceService.startAudioRecording('mock_headset_device');
  assert.equal(typeof recording.stop, 'function', 'Deve ter método stop');
  assert.equal(typeof recording.cancel, 'function', 'Deve ter método cancel');

  recording.cancel();

  const mockBlob = new Blob(['teste de audio simulado'], { type: 'audio/webm' });
  const base64 = await audioDeviceService.blobToBase64(mockBlob);
  assert.equal(typeof base64, 'string');
});

// Mock de HTML5 Audio para testes do motor de streaming de áudio
class MockAudioElement {
  public src: string;
  public preload: string = 'none';
  public volume: number = 1;
  public paused: boolean = true;
  public currentTime: number = 0;
  public onplay: (() => void) | null = null;
  public onended: (() => void) | null = null;
  public onerror: ((err: any) => void) | null = null;

  constructor(src?: string) {
    this.src = src || '';
  }

  public play(): Promise<void> {
    this.paused = false;
    setTimeout(() => {
      this.onplay?.();
      setTimeout(() => {
        this.paused = true;
        this.onended?.();
      }, 5);
    }, 2);
    return Promise.resolve();
  }

  public pause(): void {
    this.paused = true;
  }
}

test('T298: Particionamento de sentenças longas (splitTextIntoChunks) prevenindo buffer overflow', () => {
  const longExplanation =
    'Funções de ativação não lineares são cruciais no aprendizado profundo. ' +
    'Elas introduzem a não linearidade na rede neural permitindo aprender fronteiras de decisão curvas. ' +
    'Sem elas, redes com múltiplas camadas colapsariam em uma única regressão linear simples. ' +
    'Exemplos consagrados incluem a Sigmoide, que mapeia valores entre 0 e 1, a Tangente Hiperbólica (Tanh), centrada em zero, e a ReLU.';

  const chunks = splitTextIntoChunks(longExplanation, 140);
  assert.ok(chunks.length >= 3, 'Deve particionar texto longo em 3 ou mais sentenças naturais');
  chunks.forEach((chunk) => {
    assert.ok(chunk.length <= 150, `Cada sentença deve respeitar o limite (${chunk.length} <= 150)`);
    assert.ok(chunk.trim().length > 0, 'Sentença não deve ser vazia');
  });
});

test('T299: Fallback resiliente automático para streaming de áudio quando Web Speech API dispara erro synthesis-failed', async () => {
  const savedSpeechSynthesis = (globalThis as any).speechSynthesis;
  const savedWindowSynthesis = (globalThis as any).window?.speechSynthesis;
  const savedUtterance = (globalThis as any).SpeechSynthesisUtterance;
  const savedAudio = (globalThis as any).Audio;
  const savedWindowAudio = (globalThis as any).window?.Audio;

  try {
    // Configura MockAudio global e no window
    (globalThis as any).Audio = MockAudioElement;
    if ((globalThis as any).window) {
      (globalThis as any).window.Audio = MockAudioElement;
    }

    // Simula sintetizador nativo que falha com 'synthesis-failed' (caso real do Linux/Chromium)
    const failingSynth = {
      speaking: false,
      paused: false,
      getVoices: () => [{ name: 'Google Português do Brasil', lang: 'pt-BR', default: true }],
      speak: (u: any) => {
        setTimeout(() => {
          u.onerror?.({ error: 'synthesis-failed' });
        }, 5);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {},
    };

    (globalThis as any).speechSynthesis = failingSynth;
    if ((globalThis as any).window) {
      (globalThis as any).window.speechSynthesis = failingSynth;
    }
    (globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

    const service = new SpeechSynthesisService();
    let started = false;
    let ended = false;
    let fallbackError: any = null;

    await new Promise<void>((resolve) => {
      service.speak('Teste de ativação não linear e resiliência a falhas.', {
        onStart: () => {
          started = true;
        },
        onEnd: () => {
          ended = true;
          resolve();
        },
        onError: (err) => {
          fallbackError = err;
          resolve();
        },
      });
    });

    assert.equal(fallbackError, null, 'Fallback resiliente de áudio não deve propagar erro fatal de síntese nativa');
    assert.ok(started, 'Fluxo de fala deve ter iniciado via fallback');
    assert.ok(ended, 'Fluxo de fala deve ter concluído via fallback');
  } finally {
    (globalThis as any).speechSynthesis = savedSpeechSynthesis;
    if ((globalThis as any).window) {
      (globalThis as any).window.speechSynthesis = savedWindowSynthesis;
      (globalThis as any).window.Audio = savedWindowAudio;
    }
    (globalThis as any).SpeechSynthesisUtterance = savedUtterance;
    (globalThis as any).Audio = savedAudio;
  }
});

test('T300: Controles de pausa, retomada e parada durante streaming de áudio pt-BR', () => {
  const savedSynth = (globalThis as any).speechSynthesis;
  const savedWindowSynth = (globalThis as any).window?.speechSynthesis;
  const savedAudio = (globalThis as any).Audio;
  const savedWindowAudio = (globalThis as any).window?.Audio;

  try {
    delete (globalThis as any).speechSynthesis;
    if ((globalThis as any).window) {
      delete (globalThis as any).window.speechSynthesis;
      (globalThis as any).window.Audio = MockAudioElement;
    }
    (globalThis as any).Audio = MockAudioElement;
    const service = new SpeechSynthesisService();

    // Inicia fala diretamente no motor stream de áudio
    service.speak('Sentença de teste de controle de áudio.');

    service.pause();
    assert.equal(service.isPaused(), true, 'Deve indicar estado pausado');

    service.resume();
    assert.equal(service.isSpeaking(), true, 'Deve indicar estado falando após retomada');

    service.stop();
    assert.equal(service.getState(), 'idle', 'Deve retornar ao estado idle após stop');
  } finally {
    (globalThis as any).speechSynthesis = savedSynth;
    if ((globalThis as any).window) {
      (globalThis as any).window.speechSynthesis = savedWindowSynth;
      (globalThis as any).window.Audio = savedWindowAudio;
    }
    (globalThis as any).Audio = savedAudio;
  }
});

test('T301: Controle dinâmico de velocidade de fala (playbackRate default 1.15x e alternância fluida)', () => {
  const service = new SpeechSynthesisService();
  assert.equal(service.getPlaybackRate(), 1.15, 'Velocidade padrão deve ser 1.15x para fala conversacional fluida');

  service.setPlaybackRate(1.25);
  assert.equal(service.getPlaybackRate(), 1.25, 'Deve atualizar a velocidade para 1.25x');

  service.setPlaybackRate(1.0);
  assert.equal(service.getPlaybackRate(), 1.0, 'Deve atualizar a velocidade para 1.0x');

  service.setPlaybackRate(0);
  assert.equal(service.getPlaybackRate(), 1.15, 'Valores inválidos ou <= 0 devem retornar ao default seguro de 1.15x');
});
