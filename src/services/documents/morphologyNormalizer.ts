/**
 * NeuroClass AI — Normalizador Morfológico Determinístico para Português (pt-BR)
 * @module services/documents/morphologyNormalizer
 *
 * Implementação pura, determinística, síncrona e local do algoritmo RSLP
 * (Removedor de Sufixos da Língua Portuguesa — Orengo & Huyck, 2001 / Apache Lucene pt).
 *
 * DIRETRIZES FUNDAMENTAIS (MISSÃO E1):
 * 1. SIMETRIA TOTAL: A exata mesma transformação é aplicada na indexação e na consulta.
 * 2. PROTEÇÃO DE TERMOS TÉCNICOS:
 *    - Siglas e identificadores científicos (NMDA, SNARE, LTP, GABA, FSRS-7, ISO-27001, etc.);
 *    - Fórmulas químicas, subscritos e estados iônicos (Ca²⁺, Mg²⁺, Na⁺, CO₂, H₂O, pH, V_0);
 *    - Números, medidas, datas e decimais (1978, 0.05, 350ms, 70mV, 10mg, 5G);
 *    - Identificadores sintéticos compostos com hífen/underscore (NEUROSYNAPSE_GAMMA_789, etc.);
 *    - Nomes próprios canônicos e autores (Herbert, Simon, Ebbinghaus, Stroop, etc.);
 *    - Palavras ultracurtas (<= 3 caracteres) para evitar colapso de siglas e preposições.
 * 3. PRESERVAÇÃO INTEGRAL DE METADADOS:
 *    - O texto original e offsets dos chunks NUNCA são alterados ou truncados.
 *    - A representação normalizada é usada EXCLUSIVAMENTE para casamento lexical (BM25).
 * 4. VERSIONAMENTO RASTREÁVEL:
 *    - NORMALIZER_VERSION = 'rslp-pt-1.0.0'.
 */

export const NORMALIZER_VERSION = 'rslp-pt-1.0.0';

interface RslpRule {
  suffix: string;
  minStemLength: number;
  replacement?: string;
  exceptions?: Set<string>;
}

/**
 * Remove acentuação gráfica diacrítica de uma raiz já radicalizada,
 * mantendo o caractere base em minúsculas (ex: 'neuroni' -> 'neuroni', 'memór' -> 'memor').
 */
export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
}

/* ==========================================================================
   CONJUNTOS DE PROTEÇÃO (TERMOS TÉCNICOS, SIGLAS E NOMES PRÓPRIOS)
   ========================================================================== */

export const PROTECTED_ACRONYMS: ReadonlySet<string> = new Set([
  'nmda', 'snare', 'ltp', 'ltd', 'gaba', 'sv2a', 'fsrs', 'ampa', 'creb', 'bdnf',
  'camkii', 'apaf', 'dopa', 'apv', 'ttx', 'tea', 'epsps', 'ipsps', 'atp', 'dna',
  'rna', 'api', 'rag', 'iot', 'vamp', 'snap', 'lewy'
]);

export const PROTECTED_PROPER_NAMES: ReadonlySet<string> = new Set([
  'herbert', 'simon', 'ebbinghaus', 'stroop', 'goldman', 'hodgkin', 'katz',
  'lewy', 'alzheimer', 'parkinson', 'schaffer', 'duchenne', 'shor', 'claude', 'turing'
]);

/**
 * Verifica se um token é protegido contra normalização morfológica.
 * Termos protegidos mantêm sua forma literal exata no vocabulário.
 */
export function isProtectedToken(token: string): boolean {
  if (!token || typeof token !== 'string') return true;

  // 1. Palavras ultracurtas (<= 3 caracteres) como siglas, íons, elementos (ph, na, k, ltp, ttx)
  if (token.length <= 3) return true;

  // 2. Dígitos, subscritos, sobrescritos e cargas iônicas (1978, 0.05, 350ms, 70mV, Ca²⁺, CO₂)
  if (/[\d⁺⁻_²³₄]/.test(token)) return true;

  // 3. Compostos com hífen conectando partes (pré-frontal, ISO-27001, FSRS-7)
  if (token.includes('-')) return true;

  // 4. Identificadores com underscore (NEUROSYNAPSE_GAMMA_789, V_0)
  if (token.includes('_')) return true;

  // 5. Siglas e acrônimos científicos canônicos
  const lower = token.toLowerCase();
  if (PROTECTED_ACRONYMS.has(lower)) return true;

  // 6. Nomes próprios e autores
  if (PROTECTED_PROPER_NAMES.has(lower)) return true;

  return false;
}

/* ==========================================================================
   TABELAS DE REGRAS RSLP (ORENGO & HUYCK / APACHE LUCENE PORTUGUESE)
   ========================================================================== */

// Passo 1: Redução de Plural (se a palavra terminar com 's')
const STEP_PLURAL: RslpRule[] = [
  { suffix: 'ns', minStemLength: 1, replacement: 'm' },
  { suffix: 'ões', minStemLength: 2, replacement: 'ão' },
  { suffix: 'oes', minStemLength: 2, replacement: 'ao' },
  { suffix: 'ães', minStemLength: 1, replacement: 'ão', exceptions: new Set(['mães']) },
  { suffix: 'aes', minStemLength: 1, replacement: 'ao', exceptions: new Set(['maes']) },
  { suffix: 'ais', minStemLength: 1, replacement: 'al', exceptions: new Set(['cais', 'mais']) },
  { suffix: 'éis', minStemLength: 2, replacement: 'el' },
  { suffix: 'eis', minStemLength: 2, replacement: 'el' },
  { suffix: 'óis', minStemLength: 2, replacement: 'ol' },
  { suffix: 'ois', minStemLength: 2, replacement: 'ol' },
  { suffix: 'is', minStemLength: 2, replacement: 'il', exceptions: new Set(['lápis', 'cais', 'mais', 'crúcis', 'biquínis', 'pois', 'depois', 'dois', 'leis']) },
  { suffix: 'les', minStemLength: 3, replacement: 'l' },
  { suffix: 'res', minStemLength: 3, replacement: 'r', exceptions: new Set(['árvores']) },
  { suffix: 's', minStemLength: 2, replacement: '', exceptions: new Set([
    'aliás', 'pires', 'lápis', 'cais', 'mais', 'mas', 'menos', 'férias', 'fezes',
    'pêsames', 'crúcis', 'gás', 'atrás', 'moisés', 'através', 'convés', 'ês',
    'país', 'após', 'ambas', 'ambos', 'messias', 'depois', 'vírus', 'íris', 'córtex'
  ]) },
];

// Passo 2: Redução de Advérbios (se a palavra terminar com 'mente')
const STEP_ADVERB: RslpRule[] = [
  { suffix: 'mente', minStemLength: 4, replacement: '', exceptions: new Set(['experimente', 'veemente']) },
];

// Passo 3: Redução de Feminino (se a palavra terminar com 'a' ou 'ã')
const STEP_FEMININE: RslpRule[] = [
  { suffix: 'ona', minStemLength: 3, replacement: 'ão', exceptions: new Set(['abandona', 'lona', 'iona', 'cortisona', 'monótona', 'maratona', 'acetona', 'detona', 'carona']) },
  { suffix: 'ã', minStemLength: 2, replacement: 'ão', exceptions: new Set(['amanhã', 'arapuã', 'fã', 'divã']) },
  { suffix: 'ora', minStemLength: 3, replacement: 'or' },
  { suffix: 'na', minStemLength: 4, replacement: 'no', exceptions: new Set(['carona', 'abandona', 'lona', 'iona', 'cortisona', 'monótona', 'maratona', 'acetona', 'detona', 'guiana', 'campana', 'grana', 'caravana', 'banana', 'paisana']) },
  { suffix: 'inha', minStemLength: 3, replacement: 'inho', exceptions: new Set(['rainha', 'linha', 'minha']) },
  { suffix: 'esa', minStemLength: 3, replacement: 'ês', exceptions: new Set(['mesa', 'obesa', 'princesa', 'turquesa', 'ilesa', 'pesa', 'presa']) },
  { suffix: 'osa', minStemLength: 3, replacement: 'oso', exceptions: new Set(['mucosa', 'prosa']) },
  { suffix: 'íaca', minStemLength: 3, replacement: 'íaco' },
  { suffix: 'ica', minStemLength: 3, replacement: 'ico', exceptions: new Set(['dica']) },
  { suffix: 'ada', minStemLength: 2, replacement: 'ado', exceptions: new Set(['pitada']) },
  { suffix: 'ida', minStemLength: 3, replacement: 'ido', exceptions: new Set(['vida', 'dúvida']) },
  { suffix: 'ída', minStemLength: 3, replacement: 'ido', exceptions: new Set(['recaída', 'saída']) },
  { suffix: 'ima', minStemLength: 3, replacement: 'imo', exceptions: new Set(['vítima']) },
  { suffix: 'iva', minStemLength: 3, replacement: 'ivo', exceptions: new Set(['saliva', 'oliva']) },
  { suffix: 'eira', minStemLength: 3, replacement: 'eiro', exceptions: new Set(['beira', 'cadeira', 'frigideira', 'bandeira', 'feira', 'capoeira', 'barreira', 'fronteira', 'besteira', 'poeira']) },
];

// Passo 4: Redução de Aumentativo / Diminutivo
const STEP_AUGMENTATIVE: RslpRule[] = [
  { suffix: 'díssimo', minStemLength: 5, replacement: '' },
  { suffix: 'abilíssimo', minStemLength: 5, replacement: '' },
  { suffix: 'íssimo', minStemLength: 3, replacement: '' },
  { suffix: 'ésimo', minStemLength: 3, replacement: '' },
  { suffix: 'érrimo', minStemLength: 4, replacement: '' },
  { suffix: 'zinho', minStemLength: 2, replacement: '' },
  { suffix: 'quinho', minStemLength: 4, replacement: 'c' },
  { suffix: 'uinho', minStemLength: 4, replacement: '' },
  { suffix: 'adinho', minStemLength: 3, replacement: '' },
  { suffix: 'inho', minStemLength: 3, replacement: '', exceptions: new Set(['caminho', 'cominho']) },
  { suffix: 'alhão', minStemLength: 4, replacement: '' },
  { suffix: 'uça', minStemLength: 4, replacement: '' },
  { suffix: 'aço', minStemLength: 4, replacement: '', exceptions: new Set(['antebraço']) },
  { suffix: 'aça', minStemLength: 4, replacement: '' },
  { suffix: 'adão', minStemLength: 4, replacement: '' },
  { suffix: 'idão', minStemLength: 4, replacement: '' },
  { suffix: 'ázio', minStemLength: 3, replacement: '', exceptions: new Set(['topázio']) },
  { suffix: 'arraz', minStemLength: 4, replacement: '' },
  { suffix: 'zarrão', minStemLength: 3, replacement: '' },
  { suffix: 'arrão', minStemLength: 4, replacement: '' },
  { suffix: 'arra', minStemLength: 3, replacement: '' },
  { suffix: 'zão', minStemLength: 2, replacement: '', exceptions: new Set(['coalizão']) },
  { suffix: 'ão', minStemLength: 2, replacement: '', exceptions: new Set([
    'camarão', 'chimarrão', 'canção', 'coração', 'embrião', 'grotão', 'glutão', 'ficção',
    'fogão', 'feição', 'furacão', 'gamão', 'lampião', 'leão', 'macacão', 'nação', 'órfão',
    'orgão', 'patrão', 'portão', 'quinhão', 'rincão', 'tração', 'falcão', 'espião', 'mamão',
    'folião', 'cordão', 'aptidão', 'campeão', 'colchão', 'limão', 'leilão', 'melão', 'barão',
    'milhão', 'bilhão', 'fusão', 'cristão', 'ilusão', 'capitão', 'estação', 'senão'
  ]) },
];

// Passo 5: Redução de Sufixos Nominais / Adjetivais
const STEP_NOUN: RslpRule[] = [
  { suffix: 'encialista', minStemLength: 4, replacement: '' },
  { suffix: 'alista', minStemLength: 5, replacement: '' },
  { suffix: 'agem', minStemLength: 3, replacement: '', exceptions: new Set(['coragem', 'chantagem', 'vantagem', 'carruagem']) },
  { suffix: 'iamento', minStemLength: 4, replacement: '' },
  { suffix: 'amento', minStemLength: 3, replacement: '', exceptions: new Set(['firmamento', 'fundamento', 'departamento']) },
  { suffix: 'imento', minStemLength: 3, replacement: '' },
  { suffix: 'mento', minStemLength: 6, replacement: '', exceptions: new Set(['firmamento', 'elemento', 'complemento', 'instrumento', 'departamento']) },
  { suffix: 'alizado', minStemLength: 4, replacement: '' },
  { suffix: 'atizado', minStemLength: 4, replacement: '' },
  { suffix: 'tizado', minStemLength: 4, replacement: '', exceptions: new Set(['alfabetizado']) },
  { suffix: 'izado', minStemLength: 5, replacement: '', exceptions: new Set(['organizado', 'pulverizado']) },
  { suffix: 'ativo', minStemLength: 4, replacement: '', exceptions: new Set(['pejorativo', 'relativo']) },
  { suffix: 'tivo', minStemLength: 4, replacement: '', exceptions: new Set(['relativo']) },
  { suffix: 'ivo', minStemLength: 4, replacement: '', exceptions: new Set(['passivo', 'possessivo', 'pejorativo', 'positivo']) },
  { suffix: 'iado', minStemLength: 3, replacement: '' },
  { suffix: 'ado', minStemLength: 2, replacement: '', exceptions: new Set(['grado']) },
  { suffix: 'ido', minStemLength: 3, replacement: '', exceptions: new Set(['cândido', 'consolido', 'rápido', 'decido', 'tímido', 'duvido', 'marido']) },
  { suffix: 'ador', minStemLength: 3, replacement: '' },
  { suffix: 'edor', minStemLength: 3, replacement: '' },
  { suffix: 'idor', minStemLength: 4, replacement: '', exceptions: new Set(['ouvidor']) },
  { suffix: 'dor', minStemLength: 4, replacement: '', exceptions: new Set(['ouvidor']) },
  { suffix: 'sor', minStemLength: 4, replacement: '', exceptions: new Set(['assessor']) },
  { suffix: 'atoria', minStemLength: 5, replacement: '' },
  { suffix: 'atória', minStemLength: 5, replacement: '' },
  { suffix: 'tor', minStemLength: 3, replacement: '', exceptions: new Set(['benfeitor', 'leitor', 'editor', 'pastor', 'produtor', 'promotor', 'consultor']) },
  { suffix: 'or', minStemLength: 2, replacement: '', exceptions: new Set(['motor', 'melhor', 'redor', 'rigor', 'sensor', 'tambor', 'tumor', 'assessor', 'benfeitor', 'pastor', 'terior', 'favor', 'autor']) },
  { suffix: 'abilidade', minStemLength: 5, replacement: '' },
  { suffix: 'icionista', minStemLength: 4, replacement: '' },
  { suffix: 'cionista', minStemLength: 5, replacement: '' },
  { suffix: 'ionista', minStemLength: 5, replacement: '' },
  { suffix: 'ionar', minStemLength: 5, replacement: '' },
  { suffix: 'ional', minStemLength: 4, replacement: '' },
  { suffix: 'ência', minStemLength: 3, replacement: '' },
  { suffix: 'ancia', minStemLength: 4, replacement: '', exceptions: new Set(['ambulância']) },
  { suffix: 'ância', minStemLength: 4, replacement: '', exceptions: new Set(['ambulância']) },
  { suffix: 'edouro', minStemLength: 3, replacement: '' },
  { suffix: 'queiro', minStemLength: 3, replacement: 'c' },
  { suffix: 'adeiro', minStemLength: 4, replacement: '', exceptions: new Set(['desfiladeiro']) },
  { suffix: 'eiro', minStemLength: 3, replacement: '', exceptions: new Set(['desfiladeiro', 'pioneiro', 'mosteiro']) },
  { suffix: 'uoso', minStemLength: 3, replacement: '' },
  { suffix: 'oso', minStemLength: 3, replacement: '', exceptions: new Set(['precioso']) },
  { suffix: 'alizaç', minStemLength: 5, replacement: '' },
  { suffix: 'atizaç', minStemLength: 5, replacement: '' },
  { suffix: 'tizaç', minStemLength: 5, replacement: '' },
  { suffix: 'izaç', minStemLength: 5, replacement: '', exceptions: new Set(['organizaç']) },
  { suffix: 'aç', minStemLength: 3, replacement: '', exceptions: new Set(['equaç', 'relaç']) },
  { suffix: 'iç', minStemLength: 3, replacement: '', exceptions: new Set(['eleiç']) },
  { suffix: 'ário', minStemLength: 3, replacement: '', exceptions: new Set(['voluntário', 'salário', 'aniversário', 'diário', 'lionário', 'armário']) },
  { suffix: 'atório', minStemLength: 3, replacement: '' },
  { suffix: 'rio', minStemLength: 5, replacement: '', exceptions: new Set(['voluntário', 'salário', 'aniversário', 'diário', 'compulsório', 'lionário', 'próprio', 'stério', 'armário']) },
  { suffix: 'ério', minStemLength: 6, replacement: '' },
  { suffix: 'ês', minStemLength: 4, replacement: '' },
  { suffix: 'eza', minStemLength: 3, replacement: '' },
  { suffix: 'ez', minStemLength: 4, replacement: '' },
  { suffix: 'esco', minStemLength: 4, replacement: '' },
  { suffix: 'ante', minStemLength: 2, replacement: '', exceptions: new Set(['gigante', 'elefante', 'adiante', 'possante', 'instante', 'restaurante']) },
  { suffix: 'ástico', minStemLength: 4, replacement: '', exceptions: new Set(['eclesiástico']) },
  { suffix: 'alístico', minStemLength: 3, replacement: '' },
  { suffix: 'áutico', minStemLength: 4, replacement: '' },
  { suffix: 'êutico', minStemLength: 4, replacement: '' },
  { suffix: 'ético', minStemLength: 3, replacement: '' },
  { suffix: 'ética', minStemLength: 3, replacement: '' },
  { suffix: 'tico', minStemLength: 3, replacement: '', exceptions: new Set(['político', 'eclesiástico', 'diagnostico', 'prático', 'doméstico', 'diagnóstico', 'idêntico', 'alopático', 'artístico', 'autêntico', 'eclético', 'crítico', 'critico']) },
  { suffix: 'ico', minStemLength: 4, replacement: '', exceptions: new Set(['tico', 'público', 'explico']) },
  { suffix: 'ividade', minStemLength: 5, replacement: '' },
  { suffix: 'idade', minStemLength: 4, replacement: '', exceptions: new Set(['autoridade', 'comunidade']) },
  { suffix: 'oria', minStemLength: 4, replacement: '', exceptions: new Set(['categoria']) },
  { suffix: 'encial', minStemLength: 5, replacement: '' },
  { suffix: 'ista', minStemLength: 4, replacement: '' },
  { suffix: 'auta', minStemLength: 5, replacement: '' },
  { suffix: 'quice', minStemLength: 4, replacement: 'c' },
  { suffix: 'ice', minStemLength: 4, replacement: '', exceptions: new Set(['cúmplice']) },
  { suffix: 'íaco', minStemLength: 3, replacement: '' },
  { suffix: 'ente', minStemLength: 4, replacement: '', exceptions: new Set(['freqüente', 'alimente', 'acrescente', 'permanente', 'oriente', 'aparente']) },
  { suffix: 'ense', minStemLength: 5, replacement: '' },
  { suffix: 'inal', minStemLength: 3, replacement: '' },
  { suffix: 'ano', minStemLength: 4, replacement: '' },
  { suffix: 'ável', minStemLength: 2, replacement: '', exceptions: new Set(['afável', 'razoável', 'potável', 'vulnerável']) },
  { suffix: 'ível', minStemLength: 3, replacement: '', exceptions: new Set(['possível']) },
  { suffix: 'vel', minStemLength: 5, replacement: '', exceptions: new Set(['possível', 'vulnerável', 'solúvel']) },
  { suffix: 'bil', minStemLength: 3, replacement: 'vel' },
  { suffix: 'ura', minStemLength: 4, replacement: '', exceptions: new Set(['imatura', 'acupuntura', 'costura']) },
  { suffix: 'ural', minStemLength: 4, replacement: '' },
  { suffix: 'ual', minStemLength: 3, replacement: '', exceptions: new Set(['bissexual', 'virtual', 'visual', 'pontual']) },
  { suffix: 'ial', minStemLength: 3, replacement: '' },
  { suffix: 'al', minStemLength: 4, replacement: '', exceptions: new Set(['afinal', 'animal', 'estatal', 'bissexual', 'desleal', 'fiscal', 'formal', 'pessoal', 'liberal', 'postal', 'virtual', 'visual', 'pontual', 'sideral', 'sucursal']) },
  { suffix: 'alismo', minStemLength: 4, replacement: '' },
  { suffix: 'ivismo', minStemLength: 4, replacement: '' },
  { suffix: 'ismo', minStemLength: 3, replacement: '', exceptions: new Set(['cinismo']) },
];

// Passo 6: Redução de Sufixos Verbais (executado se Passo 5 não alterou a palavra)
const STEP_VERB: RslpRule[] = [
  { suffix: 'aríamo', minStemLength: 2, replacement: '' },
  { suffix: 'ássemo', minStemLength: 2, replacement: '' },
  { suffix: 'eríamo', minStemLength: 2, replacement: '' },
  { suffix: 'êssemo', minStemLength: 2, replacement: '' },
  { suffix: 'iríamo', minStemLength: 3, replacement: '' },
  { suffix: 'íssemo', minStemLength: 3, replacement: '' },
  { suffix: 'áramo', minStemLength: 2, replacement: '' },
  { suffix: 'árei', minStemLength: 2, replacement: '' },
  { suffix: 'aremo', minStemLength: 2, replacement: '' },
  { suffix: 'ariam', minStemLength: 2, replacement: '' },
  { suffix: 'aríei', minStemLength: 2, replacement: '' },
  { suffix: 'ássei', minStemLength: 2, replacement: '' },
  { suffix: 'assem', minStemLength: 2, replacement: '' },
  { suffix: 'ávamo', minStemLength: 2, replacement: '' },
  { suffix: 'êramo', minStemLength: 3, replacement: '' },
  { suffix: 'eremo', minStemLength: 3, replacement: '' },
  { suffix: 'eriam', minStemLength: 3, replacement: '' },
  { suffix: 'eríei', minStemLength: 3, replacement: '' },
  { suffix: 'êssei', minStemLength: 3, replacement: '' },
  { suffix: 'essem', minStemLength: 3, replacement: '' },
  { suffix: 'íramo', minStemLength: 3, replacement: '' },
  { suffix: 'iremo', minStemLength: 3, replacement: '' },
  { suffix: 'iriam', minStemLength: 3, replacement: '' },
  { suffix: 'iríei', minStemLength: 3, replacement: '' },
  { suffix: 'íssei', minStemLength: 3, replacement: '' },
  { suffix: 'issem', minStemLength: 3, replacement: '' },
  { suffix: 'iando', minStemLength: 3, replacement: '' },
  { suffix: 'izando', minStemLength: 5, replacement: '' },
  { suffix: 'ando', minStemLength: 2, replacement: '' },
  { suffix: 'endo', minStemLength: 3, replacement: '' },
  { suffix: 'indo', minStemLength: 3, replacement: '' },
  { suffix: 'ondo', minStemLength: 3, replacement: '' },
  { suffix: 'aram', minStemLength: 2, replacement: '' },
  { suffix: 'arão', minStemLength: 2, replacement: '' },
  { suffix: 'arde', minStemLength: 2, replacement: '' },
  { suffix: 'arei', minStemLength: 2, replacement: '' },
  { suffix: 'arem', minStemLength: 2, replacement: '' },
  { suffix: 'aria', minStemLength: 2, replacement: '' },
  { suffix: 'armo', minStemLength: 2, replacement: '' },
  { suffix: 'asse', minStemLength: 2, replacement: '' },
  { suffix: 'aste', minStemLength: 2, replacement: '' },
  { suffix: 'izavam', minStemLength: 5, replacement: '' },
  { suffix: 'avam', minStemLength: 2, replacement: '', exceptions: new Set(['agravam']) },
  { suffix: 'ávei', minStemLength: 2, replacement: '' },
  { suffix: 'eram', minStemLength: 3, replacement: '' },
  { suffix: 'erão', minStemLength: 3, replacement: '' },
  { suffix: 'erde', minStemLength: 3, replacement: '' },
  { suffix: 'erei', minStemLength: 3, replacement: '' },
  { suffix: 'êrei', minStemLength: 3, replacement: '' },
  { suffix: 'erem', minStemLength: 3, replacement: '' },
  { suffix: 'eria', minStemLength: 3, replacement: '' },
  { suffix: 'ermo', minStemLength: 3, replacement: '' },
  { suffix: 'esse', minStemLength: 3, replacement: '' },
  { suffix: 'este', minStemLength: 3, replacement: '', exceptions: new Set(['faroeste', 'agreste']) },
  { suffix: 'íamo', minStemLength: 3, replacement: '' },
  { suffix: 'iram', minStemLength: 3, replacement: '' },
  { suffix: 'íram', minStemLength: 3, replacement: '' },
  { suffix: 'irão', minStemLength: 2, replacement: '' },
  { suffix: 'irde', minStemLength: 2, replacement: '' },
  { suffix: 'irei', minStemLength: 3, replacement: '', exceptions: new Set(['admirei']) },
  { suffix: 'irem', minStemLength: 3, replacement: '', exceptions: new Set(['adquirem']) },
  { suffix: 'iria', minStemLength: 3, replacement: '' },
  { suffix: 'irmo', minStemLength: 3, replacement: '' },
  { suffix: 'isse', minStemLength: 3, replacement: '' },
  { suffix: 'iste', minStemLength: 4, replacement: '' },
  { suffix: 'iava', minStemLength: 4, replacement: '', exceptions: new Set(['ampliava']) },
  { suffix: 'amo', minStemLength: 2, replacement: '' },
  { suffix: 'iona', minStemLength: 3, replacement: '' },
  { suffix: 'ara', minStemLength: 2, replacement: '', exceptions: new Set(['arara', 'prepara']) },
  { suffix: 'ará', minStemLength: 2, replacement: '', exceptions: new Set(['alvará']) },
  { suffix: 'are', minStemLength: 2, replacement: '', exceptions: new Set(['prepare']) },
  { suffix: 'izava', minStemLength: 5, replacement: '' },
  { suffix: 'ava', minStemLength: 2, replacement: '', exceptions: new Set(['agrava']) },
  { suffix: 'emo', minStemLength: 2, replacement: '' },
  { suffix: 'era', minStemLength: 3, replacement: '', exceptions: new Set(['acelera', 'espera']) },
  { suffix: 'erá', minStemLength: 3, replacement: '' },
  { suffix: 'ere', minStemLength: 3, replacement: '', exceptions: new Set(['espere']) },
  { suffix: 'iam', minStemLength: 3, replacement: '', exceptions: new Set(['enfiam', 'ampliam', 'elogiam', 'ensaiam']) },
  { suffix: 'íei', minStemLength: 3, replacement: '' },
  { suffix: 'imo', minStemLength: 3, replacement: '', exceptions: new Set(['reprimo', 'intimo', 'íntimo', 'nimo', 'queimo', 'ximo']) },
  { suffix: 'ira', minStemLength: 3, replacement: '', exceptions: new Set(['fronteira', 'sátira']) },
  { suffix: 'ído', minStemLength: 3, replacement: '' },
  { suffix: 'irá', minStemLength: 3, replacement: '' },
  { suffix: 'tizar', minStemLength: 4, replacement: '', exceptions: new Set(['alfabetizar']) },
  { suffix: 'izar', minStemLength: 5, replacement: '', exceptions: new Set(['organizar']) },
  { suffix: 'itar', minStemLength: 5, replacement: '', exceptions: new Set(['acreditar', 'explicitar', 'estreitar']) },
  { suffix: 'ire', minStemLength: 3, replacement: '', exceptions: new Set(['adquire']) },
  { suffix: 'omo', minStemLength: 3, replacement: '' },
  { suffix: 'ai', minStemLength: 2, replacement: '' },
  { suffix: 'izam', minStemLength: 5, replacement: '' },
  { suffix: 'am', minStemLength: 2, replacement: '' },
  { suffix: 'ear', minStemLength: 4, replacement: '', exceptions: new Set(['alardear', 'nuclear']) },
  { suffix: 'iar', minStemLength: 3, replacement: '', exceptions: new Set(['criar', 'guiar']) },
  { suffix: 'iza', minStemLength: 5, replacement: '' },
  { suffix: 'ar', minStemLength: 2, replacement: '', exceptions: new Set(['azar', 'bazaar', 'patamar']) },
  { suffix: 'uei', minStemLength: 3, replacement: '' },
  { suffix: 'uía', minStemLength: 5, replacement: 'u' },
  { suffix: 'ei', minStemLength: 3, replacement: '' },
  { suffix: 'guem', minStemLength: 3, replacement: 'g' },
  { suffix: 'em', minStemLength: 2, replacement: '', exceptions: new Set(['alem', 'virgem']) },
  { suffix: 'er', minStemLength: 2, replacement: '', exceptions: new Set(['éter', 'pier']) },
  { suffix: 'eu', minStemLength: 3, replacement: '', exceptions: new Set(['chapeu']) },
  { suffix: 'ia', minStemLength: 3, replacement: '', exceptions: new Set([
    'estória', 'fatia', 'acia', 'praia', 'elogia', 'mania', 'lábia', 'aprecia',
    'polícia', 'arredia', 'cheia', 'ásia'
  ]) },
  { suffix: 'ir', minStemLength: 3, replacement: '', exceptions: new Set(['freir']) },
  { suffix: 'iu', minStemLength: 3, replacement: '' },
  { suffix: 'eou', minStemLength: 5, replacement: '' },
  { suffix: 'iou', minStemLength: 3, replacement: '' },
  { suffix: 'ou', minStemLength: 3, replacement: '' },
  { suffix: 'i', minStemLength: 3, replacement: '' },
];

// Passo 7: Remoção de Vogais Temáticas (executado se Passo 5 e Passo 6 não alteraram)
const STEP_VOWEL: RslpRule[] = [
  { suffix: 'bil', minStemLength: 2, replacement: 'vel' },
  { suffix: 'gue', minStemLength: 2, replacement: 'g', exceptions: new Set(['gangue', 'jegue']) },
  { suffix: 'á', minStemLength: 3, replacement: '' },
  { suffix: 'ê', minStemLength: 3, replacement: '', exceptions: new Set(['bebê']) },
  { suffix: 'a', minStemLength: 3, replacement: '', exceptions: new Set(['ásia']) },
  { suffix: 'e', minStemLength: 3, replacement: '' },
  { suffix: 'o', minStemLength: 3, replacement: '', exceptions: new Set(['ão']) },
];

function applyStepRules(word: string, rules: RslpRule[]): { result: string; modified: boolean } {
  for (const rule of rules) {
    if (word.endsWith(rule.suffix)) {
      if (rule.suffix === 'o' && (word.endsWith('ão') || word.endsWith('ao'))) {
        continue;
      }
      const stemLength = word.length - rule.suffix.length;
      if (stemLength >= rule.minStemLength) {
        if (rule.exceptions && rule.exceptions.has(word)) {
          continue;
        }
        const repl = rule.replacement ?? '';
        return {
          result: word.slice(0, stemLength) + repl,
          modified: true,
        };
      }
    }
  }
  return { result: word, modified: false };
}

/**
 * Radicalizador morfológico RSLP canônico para língua portuguesa.
 * Reduz palavras flexionadas à sua forma base em português.
 */
export function rslpStem(rawWord: string): string {
  if (!rawWord || typeof rawWord !== 'string') return '';
  if (rawWord.length < 3) return rawWord.toLowerCase();

  let word = rawWord.toLowerCase();

  // 1. Redução de Plural (somente se terminar com 's')
  if (word.endsWith('s')) {
    const res = applyStepRules(word, STEP_PLURAL);
    if (res.modified) word = res.result;
  }

  // 2. Redução de Advérbios (somente se terminar com 'mente')
  if (word.endsWith('mente')) {
    const res = applyStepRules(word, STEP_ADVERB);
    if (res.modified) word = res.result;
  }

  // 3. Redução de Feminino (somente se terminar com 'a' ou 'ã')
  if (word.endsWith('a') || word.endsWith('ã')) {
    const res = applyStepRules(word, STEP_FEMININE);
    if (res.modified) word = res.result;
  }

  // 4. Redução de Aumentativo / Diminutivo
  const augRes = applyStepRules(word, STEP_AUGMENTATIVE);
  if (augRes.modified) word = augRes.result;

  // 5. Redução de Sufixos Nominais / Adjetivais
  const nounRes = applyStepRules(word, STEP_NOUN);
  if (nounRes.modified) {
    word = nounRes.result;
  } else {
    // 6. Redução de Sufixos Verbais (somente se Passo 5 não alterou)
    const verbRes = applyStepRules(word, STEP_VERB);
    if (verbRes.modified) {
      word = verbRes.result;
    } else {
      // 7. Remoção de Vogais Temáticas (somente se 5 e 6 não alteraram)
      const vowRes = applyStepRules(word, STEP_VOWEL);
      if (vowRes.modified) word = vowRes.result;
    }
  }

  // 8. Normalização final de diacríticos para equivalência canônica
  return stripDiacritics(word);
}

/**
 * Normaliza um token individual para indexação e recuperação lexical BM25:
 * - Se for termo protegido (fórmula, sigla técnica, número, código com hífen, nome próprio),
 *   retorna o token em minúsculas sem alteração morfológica.
 * - Se for palavra comum da língua portuguesa, aplica o algoritmo RSLP com stripping diacrítico.
 */
export function normalizeMorphologyPtBr(token: string): string {
  if (!token || typeof token !== 'string') return '';

  if (isProtectedToken(token)) {
    return token.toLowerCase();
  }

  return rslpStem(token);
}
