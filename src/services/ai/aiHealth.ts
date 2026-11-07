import type { ServiceHealthStatus } from '../../types';

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuito de serviço temporariamente aberto para proteção contra sobrecarga.') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Falhas consecutivas antes de abrir
  resetTimeoutMs: number;    // Tempo até testar transição para half-open
  maxRetryAttempts: number;  // Tentativas de retry com backoff
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  maxRetryAttempts: 3,
};

export class AIServiceHealth {
  private static status: Record<string, ServiceHealthStatus> = {
    gemini_multimodal: {
      service: 'gemini_multimodal',
      state: 'healthy',
      consecutiveFailures: 0,
    },
    gemini_tutor: {
      service: 'gemini_tutor',
      state: 'healthy',
      consecutiveFailures: 0,
    },
  };

  private static listeners: Array<(status: Record<string, ServiceHealthStatus>) => void> = [];

  public static subscribe(listener: (status: Record<string, ServiceHealthStatus>) => void) {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notify() {
    this.listeners.forEach(l => l({ ...this.status }));
  }

  public static getStatus(service: 'gemini_multimodal' | 'gemini_tutor'): ServiceHealthStatus {
    return this.status[service] || {
      service,
      state: 'healthy',
      consecutiveFailures: 0,
    };
  }

  public static recordSuccess(service: 'gemini_multimodal' | 'gemini_tutor') {
    const current = this.status[service];
    if (current && (current.consecutiveFailures > 0 || current.state !== 'healthy')) {
      this.status[service] = {
        service,
        state: 'healthy',
        consecutiveFailures: 0,
      };
      this.notify();
    }
  }

  public static recordFailure(service: 'gemini_multimodal' | 'gemini_tutor', errorMsg: string) {
    const current = this.status[service] || {
      service,
      state: 'healthy',
      consecutiveFailures: 0,
    };

    const newFailures = current.consecutiveFailures + 1;
    const isCircuitOpen = newFailures >= DEFAULT_CONFIG.failureThreshold;

    this.status[service] = {
      service,
      state: isCircuitOpen ? 'circuit_open' : 'degraded',
      consecutiveFailures: newFailures,
      lastFailureTime: Date.now(),
      lastErrorMessage: errorMsg,
    };
    this.notify();
  }

  /**
   * Executa operação com tolerância a falhas, backoff exponencial com jitter e verificação de circuit breaker.
   */
  public static async executeWithResilience<T>(
    service: 'gemini_multimodal' | 'gemini_tutor',
    operation: () => Promise<T>,
    customTimeoutMs = 50000
  ): Promise<T> {
    const health = this.getStatus(service);

    // Se circuito aberto, checa se já expirou o tempo de repouso
    if (health.state === 'circuit_open') {
      const now = Date.now();
      const elapsed = now - (health.lastFailureTime || 0);
      if (elapsed < DEFAULT_CONFIG.resetTimeoutMs) {
        const remainingSec = Math.ceil((DEFAULT_CONFIG.resetTimeoutMs - elapsed) / 1000);
        throw new CircuitBreakerOpenError(
          `O serviço de IA está em pausa temporária para proteção de cota. Tente novamente em ${remainingSec}s.`
        );
      }
      // Transição para half-open
    }

    let attempt = 0;
    while (attempt < DEFAULT_CONFIG.maxRetryAttempts) {
      try {
        attempt++;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tempo limite de processamento de IA excedido (timeout).')), customTimeoutMs)
        );

        const result = await Promise.race([operation(), timeoutPromise]);
        this.recordSuccess(service);
        return result;
      } catch (err: any) {
        const isLastAttempt = attempt >= DEFAULT_CONFIG.maxRetryAttempts;
        const errMsg = err?.message || 'Falha de comunicação';

        // Erros estruturais de autenticação ou cliente (4xx) não devem fazer retry
        const isClientError = errMsg.includes('400') || errMsg.includes('403') || errMsg.includes('API_KEY');
        if (isLastAttempt || isClientError) {
          this.recordFailure(service, errMsg);
          throw err;
        }

        // Backoff exponencial com jitter (1s, 2s, 4s...)
        const baseDelay = Math.pow(2, attempt - 1) * 1000;
        const jitter = Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }

    throw new Error('Falha após tentativas controladas com retry.');
  }
}
