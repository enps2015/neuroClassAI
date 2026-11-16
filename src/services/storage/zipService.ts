/**
 * NeuroClass AI — Zero-Dependency ZIP Engine (.neuroclass)
 * Criação e descompactação de arquivos ZIP padrão PKZip sem dependências npm.
 * Inclui proteção estrita contra ZIP Slip, caminhos maliciosos e ZIP bombs.
 */

import { calculateCrc32 } from './checksumService';
import { isSafeRelativePath } from './pathSanitizer';

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

const MAX_UNCOMPRESSED_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB limite defensivo
const MAX_ENTRY_COUNT = 5000;

/**
 * Cria um buffer ZIP com múltiplos arquivos (método Store 0 para máxima compatibilidade e rapidez sem CPU overhead).
 */
export async function createZipArchive(entries: Array<{ path: string; data: Uint8Array | string }>): Promise<Uint8Array> {
  const fileRecords: Array<{
    pathBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    localHeaderOffset: number;
  }> = [];

  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  // 1. Escreve Local File Headers e dados de cada arquivo
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path)) {
      throw new Error(`Caminho inválido ou inseguro para inclusão no arquivo ZIP: ${entry.path}`);
    }

    const pathBytes = new TextEncoder().encode(entry.path);
    const dataBytes =
      typeof entry.data === 'string' ? new TextEncoder().encode(entry.data) : entry.data;

    const crc = calculateCrc32(dataBytes);
    const localHeaderOffset = currentOffset;

    // Cabeçalho Local: 30 bytes fixos
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Assinatura 'PK\x03\x04'
    view.setUint16(4, 20, true);         // Versão mínima necessária (2.0)
    view.setUint16(6, 0, true);          // Flags
    view.setUint16(8, 0, true);          // Método de compressão (0 = Store)
    view.setUint16(10, dosTime, true);   // Hora DOS
    view.setUint16(12, dosDate, true);   // Data DOS
    view.setUint32(14, crc, true);       // CRC-32
    view.setUint32(18, dataBytes.length, true); // Tamanho comprimido
    view.setUint32(22, dataBytes.length, true); // Tamanho descomprimido
    view.setUint16(26, pathBytes.length, true); // Tamanho do nome do arquivo
    view.setUint16(28, 0, true);         // Tamanho do campo extra (0)

    localHeader.set(pathBytes, 30);

    chunks.push(localHeader);
    chunks.push(dataBytes);

    currentOffset += localHeader.length + dataBytes.length;

    fileRecords.push({
      pathBytes,
      dataBytes,
      crc,
      localHeaderOffset,
    });
  }

  // 2. Escreve Central Directory Records
  const centralDirStartOffset = currentOffset;
  let centralDirSize = 0;

  for (const record of fileRecords) {
    // Cabeçalho do Diretório Central: 46 bytes fixos + nome do arquivo
    const centralHeader = new Uint8Array(46 + record.pathBytes.length);
    const view = new DataView(centralHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Assinatura 'PK\x01\x02'
    view.setUint16(4, 20, true);         // Versão criada por
    view.setUint16(6, 20, true);         // Versão mínima necessária
    view.setUint16(8, 0, true);          // Flags
    view.setUint16(10, 0, true);         // Método de compressão (0 = Store)
    view.setUint16(12, dosTime, true);   // Hora DOS
    view.setUint16(14, dosDate, true);   // Data DOS
    view.setUint32(16, record.crc, true);// CRC-32
    view.setUint32(20, record.dataBytes.length, true); // Tamanho comprimido
    view.setUint32(24, record.dataBytes.length, true); // Tamanho descomprimido
    view.setUint16(28, record.pathBytes.length, true); // Tamanho do nome
    view.setUint16(30, 0, true);         // Campo extra
    view.setUint16(32, 0, true);         // Comentário
    view.setUint16(34, 0, true);         // Disco
    view.setUint16(36, 0, true);         // Atributos internos
    view.setUint32(38, 0, true);         // Atributos externos
    view.setUint32(42, record.localHeaderOffset, true); // Offset relativo do Local Header

    centralHeader.set(record.pathBytes, 46);

    chunks.push(centralHeader);
    centralDirSize += centralHeader.length;
    currentOffset += centralHeader.length;
  }

  // 3. Escreve End of Central Directory Record (EOCD): 22 bytes fixos
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true); // Assinatura 'PK\x05\x06'
  eocdView.setUint16(4, 0, true);          // Número deste disco
  eocdView.setUint16(6, 0, true);          // Disco com início do Diretório Central
  eocdView.setUint16(8, fileRecords.length, true);  // Entradas neste disco
  eocdView.setUint16(10, fileRecords.length, true); // Total de entradas
  eocdView.setUint32(12, centralDirSize, true);     // Tamanho do Diretório Central
  eocdView.setUint32(16, centralDirStartOffset, true); // Offset do início do Diretório Central
  eocdView.setUint16(20, 0, true);         // Comentário (0)

  chunks.push(eocd);

  // Concatena todos os pedaços em um único Uint8Array contíguo
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
}

/**
 * Lê e descompacta um arquivo ZIP binário validando todas as entradas contra ZIP Slip e ZIP Bomb.
 */
export async function extractZipArchive(zipBuffer: ArrayBuffer | Uint8Array): Promise<ZipEntry[]> {
  const bytes = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
  if (bytes.length < 22) {
    throw new Error('Arquivo corrompido ou formato inválido (tamanho inferior ao cabeçalho mínimo).');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 1. Localiza a assinatura do End of Central Directory Record (EOCD: 0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Assinatura EOCD não encontrada. O arquivo não é um pacote ZIP válido ou está corrompido.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > MAX_ENTRY_COUNT) {
    throw new Error(`Pacote rejeitado: excede o limite de segurança de ${MAX_ENTRY_COUNT} arquivos.`);
  }

  if (centralDirOffset + centralDirSize > bytes.length) {
    throw new Error('Estrutura de diretório central corrompida.');
  }

  const entries: ZipEntry[] = [];
  let currentCentralPos = centralDirOffset;
  let totalUncompressedBytes = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (currentCentralPos + 46 > bytes.length) {
      throw new Error('Estrutura de cabeçalho central truncada.');
    }

    if (view.getUint32(currentCentralPos, true) !== 0x02014b50) {
      throw new Error(`Assinatura de diretório central inválida no registro ${i}.`);
    }

    const compressionMethod = view.getUint16(currentCentralPos + 10, true);
    const expectedCrc = view.getUint32(currentCentralPos + 16, true);
    const compressedSize = view.getUint32(currentCentralPos + 20, true);
    const uncompressedSize = view.getUint32(currentCentralPos + 24, true);
    const nameLen = view.getUint16(currentCentralPos + 28, true);
    const extraLen = view.getUint16(currentCentralPos + 30, true);
    const commentLen = view.getUint16(currentCentralPos + 32, true);
    const localHeaderOffset = view.getUint32(currentCentralPos + 42, true);

    const nameBytes = bytes.subarray(currentCentralPos + 46, currentCentralPos + 46 + nameLen);
    const filePath = new TextDecoder().decode(nameBytes);

    currentCentralPos += 46 + nameLen + extraLen + commentLen;

    // Ignora entradas de diretório puras (terminadas com '/')
    if (filePath.endsWith('/') || filePath.endsWith('\\')) {
      continue;
    }

    // Proteção rigorosa contra ZIP Slip / Path Traversal
    if (!isSafeRelativePath(filePath)) {
      throw new Error(`Ataque de segurança detectado no pacote: caminho malicioso ou escape de diretório (${filePath}).`);
    }

    // Proteção contra ZIP Bomb
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_TOTAL_BYTES) {
      throw new Error('Pacote rejeitado por exceder o limite defensivo de 500 MB (possível ZIP bomb).');
    }

    // Lê do Local File Header
    if (localHeaderOffset + 30 > bytes.length) {
      throw new Error(`Local File Header truncado para ${filePath}.`);
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Assinatura de cabeçalho local inválida para ${filePath}.`);
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawCompressedData = bytes.subarray(dataStart, dataStart + compressedSize);

    let extractedData: Uint8Array;

    if (compressionMethod === 0) {
      // Método Store (sem compressão)
      extractedData = rawCompressedData;
    } else if (compressionMethod === 8) {
      // Método Deflate — descompactar via DecompressionStream nativa se disponível
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawCompressedData as any);
        writer.close();
        const reader = ds.readable.getReader();
        const parts: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const res = await reader.read();
          if (res.done) done = true;
          else if (res.value) parts.push(res.value);
        }
        const total = parts.reduce((s, p) => s + p.length, 0);
        extractedData = new Uint8Array(total);
        let p = 0;
        for (const part of parts) {
          extractedData.set(part, p);
          p += part.length;
        }
      } else {
        // Fallback em ambiente Node
        const zlib = await import('node:zlib');
        extractedData = new Uint8Array(zlib.inflateRawSync(rawCompressedData));
      }
    } else {
      throw new Error(`Método de compressão ${compressionMethod} não suportado no arquivo ${filePath}.`);
    }

    // Verificação de integridade CRC-32
    const actualCrc = calculateCrc32(extractedData);
    if (actualCrc !== expectedCrc) {
      throw new Error(`Integridade comprometida (falha de CRC-32) no arquivo ${filePath}.`);
    }

    entries.push({
      path: filePath,
      data: extractedData,
    });
  }

  return entries;
}

