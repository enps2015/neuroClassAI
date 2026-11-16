/**
 * NeuroClass AI — Path Sanitizer & ZIP Slip Protection
 * Garante nomes seguros de pastas e arquivos no sistema de arquivos local
 * e impede ataques de Path Traversal / ZIP Slip.
 */

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * Sanitiza um nome amigável para uso seguro como componente de caminho (diretório ou arquivo).
 * Remove diacríticos, pontuação perigosa e garante compatibilidade multiplataforma (Linux, Mac, Windows).
 */
export function sanitizePathComponent(name: string, fallback = 'Geral'): string {
  if (!name || typeof name !== 'string') return fallback;

  // 1. Normalização Unicode para decompor caracteres acentuados (ex: 'á' -> 'a' + '\u0301')
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 2. Substituir caracteres inválidos/perigosos por hífen
  // Caracteres proibidos: / \ : * ? " < > | null bytes e controles ASCII
  let safe = normalized
    .replace(/[\x00-\x1f\x7f\/\\:\*\?"<>\|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');

  // 3. Verificar nomes de dispositivos reservados no Windows
  if (WINDOWS_RESERVED_NAMES.has(safe.toUpperCase())) {
    safe = `${safe}-disc`;
  }

  // 4. Limitar tamanho defensivamente
  if (safe.length > 40) {
    safe = safe.slice(0, 40).replace(/[-.]+$/, '');
  }

  return safe || fallback;
}

/**
 * Constrói o nome estável do diretório de um Assunto/Disciplina:
 * Ex: "Neurociência" + "subj_123" -> "Neurociencia__subj_123"
 */
export function buildSubjectFolderName(subjectName: string, subjectId: string): string {
  const safeName = sanitizePathComponent(subjectName, 'Assunto');
  const safeId = sanitizePathComponent(subjectId, 'id');
  return `${safeName}__${safeId}`;
}

/**
 * Extrai o ID do assunto a partir do nome de pasta sanitizado.
 */
export function parseSubjectIdFromFolderName(folderName: string): string | undefined {
  const parts = folderName.split('__');
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return undefined;
}

/**
 * Validação rigorosa contra ZIP Slip / Path Traversal:
 * Retorna true se o caminho relativo for 100% seguro, sem escapar da raiz.
 */
export function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath || typeof relativePath !== 'string') return false;

  // Rejeita caminhos absolutos no Linux (/etc/passwd) ou Windows (C:\...)
  if (relativePath.startsWith('/') || relativePath.startsWith('\\') || /^[a-zA-Z]:/.test(relativePath)) {
    return false;
  }

  // Rejeita null bytes
  if (relativePath.includes('\0')) {
    return false;
  }

  // Divide por separadores e verifica cada segmento
  const segments = relativePath.split(/[\/\\]+/);
  let depth = 0;

  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      depth--;
      if (depth < 0) return false; // Tentativa de escape do diretório raiz
    } else {
      depth++;
    }
  }

  return depth > 0;
}

