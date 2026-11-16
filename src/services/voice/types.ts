/**
 * Tipos e contratos canônicos para interação por voz (Voice v1) no NeuroClass AI.
 */

export type VoiceRecognitionState = 'idle' | 'listening' | 'processing' | 'error';

export type VoiceRecognitionErrorCode =
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'not-supported'
  | 'aborted'
  | 'unknown';

export interface VoiceRecognitionError {
  code: VoiceRecognitionErrorCode;
  message: string;
}

export type VoiceSynthesisState = 'idle' | 'speaking' | 'paused';

export interface VoicePreferences {
  /** Se o tutor deve falar automaticamente as respostas textuais geradas */
  autoPlayTutorVoice: boolean;
}

/**
 * Declaração explícita de privacidade para o estudante.
 * Informa com transparência que alguns navegadores utilizam serviços remotos para conversão de fala em texto.
 */
export const VOICE_PRIVACY_DISCLOSURE =
  'O reconhecimento de fala utiliza os serviços do navegador. O NeuroClass AI não grava, não armazena e não mantém arquivos de áudio em seus servidores. Note, entretanto, que navegadores como Google Chrome ou Safari podem transmitir o áudio para serviços em nuvem de seus respectivos fornecedores para realizar a transcrição, conforme suas próprias políticas de privacidade.';

/**
 * Tradutor de códigos de erro da Web Speech API para mensagens claras em PT-BR.
 */
export function getVoiceErrorMessage(code: VoiceRecognitionErrorCode): string {
  switch (code) {
    case 'not-allowed':
      return 'Permissão de microfone negada. Conceda acesso ao microfone nas permissões do navegador para falar com o Tutor.';
    case 'no-speech':
      return 'Nenhuma fala foi detectada. Verifique se o microfone está próximo e tente novamente.';
    case 'audio-capture':
      return 'Nenhum dispositivo de microfone foi encontrado ou o áudio está em uso por outro aplicativo.';
    case 'network':
      return 'Falha de comunicação de rede no serviço de transcrição do navegador.';
    case 'not-supported':
      return 'Seu navegador não suporta reconhecimento de voz nativo (Web Speech API). Você pode continuar interagindo por texto normalmente.';
    case 'aborted':
      return 'Captura de voz cancelada.';
    case 'unknown':
    default:
      return 'Ocorreu um erro inesperado na captura de voz. Tente novamente ou use a digitação.';
  }
}

