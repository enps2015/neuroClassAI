/**
 * NeuroClass AI — Checksum & Cryptographic Hash Service
 * Cálculo resiliente de SHA-256 e CRC-32 para integridade de arquivos binários,
 * manifestos e validação de pacotes ZIP sem dependências externas.
 */

// Tabela de consulta estática para cálculo rápido de CRC-32 (padrão IEEE 802.3)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c;
}

/**
 * Calcula o CRC-32 de um buffer de bytes (utilizado no cabeçalho ZIP).
 */
export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Calcula o hash SHA-256 de um buffer em formato hexadecimal (64 caracteres minúsculos).
 * Suporta Web Crypto API (navegador) e Node.js crypto (testes / backend).
 */
export async function calculateSha256(
  input: ArrayBuffer | Uint8Array | string
): Promise<string> {
  let buffer: ArrayBuffer;

  if (typeof input === 'string') {
    buffer = new TextEncoder().encode(input).buffer;
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  } else {
    buffer = input;
  }

  // 1. Tentar Web Crypto API nativa (disponível em browsers modernos e Node.js 19+)
  const subtleCrypto =
    (typeof crypto !== 'undefined' && crypto.subtle) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle);

  if (subtleCrypto) {
    try {
      const digest = await subtleCrypto.digest('SHA-256', buffer);
      return bufferToHex(digest);
    } catch {
      // Fallback para Node.js puro se subtle falhar
    }
  }

  // 2. Fallback para Node.js crypto module
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto
      .createHash('sha256')
      .update(Buffer.from(buffer))
      .digest('hex');
  } catch (err) {
    throw new Error('Ambiente sem suporte a algoritmo SHA-256 de integridade criptográfica.');
  }
}

/**
 * Converte ArrayBuffer para string hexadecimal.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

