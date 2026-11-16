/**
 * @file Testes Unitários Abrangentes — Missão A: Contratos RAG & Chunking Estruturado Determinístico
 * @module tests/rag_chunking.test
 *
 * COBERTURA EXIGIDA:
 * 1. Texto simples com parágrafos longos e curtos.
 * 2. Títulos, subtítulos e listas ordenadas/marcadores.
 * 3. Tabelas Markdown preservadas como blocos atômicos.
 * 4. Fórmulas LaTeX inline ($...$) e display ($$...$$).
 * 5. Notações científicas, subscritos, expoentes e símbolos matemáticos.
 * 6. Siglas técnicas (NMDA, SNARE, LTP, V_0, FSRS-7).
 * 7. Segmentação conservadora: decimais (3.14, 6.626), abreviações (Dr., pág., i.e.) e citações.
 * 8. Português do Brasil com acentuação integral preservada.
 * 9. Múltiplas páginas e páginas sem texto (vazias ou scan).
 * 10. Bloco atômico maior que o alvo preservado sem truncamento silencioso.
 * 11. Texto duplicado em páginas distintas gerando IDs únicos sem colisão lógica.
 * 12. Rastreabilidade exata de offsets (charOffsetStart e charOffsetEnd).
 * 13. Determinismo e idempotência matemática.
 * 14. Prova matemática de ausência de perda (100% de cobertura de caracteres não-espaço).
 * 15. Overlap configurável e continuidade de sentenças.
 * 16. Ingestão do CORPUS_SCENARIO_A (Artigo Científico Multimodal).
 * 17. Ingestão do CORPUS_SCENARIO_C (Tratado Extenso Herbert Simon de 120 páginas).
 * 18. Documento sintético extenso de 300 páginas.
 * 19. Mapeamento hierárquico fiel do sumário (TOC) sem fabricar seções inexistentes.
 * 20. Detecção de referências multimodais embutidas nos chunks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkDocument,
  splitSentencesConservatively,
  extractStructuralBlocks,
  estimateTokenCount,
  sha256Sync,
  verifyTextCoverage,
  PIPELINE_VERSION,
} from '../services/documents/chunkingService';
import {
  CORPUS_SCENARIO_A,
  CORPUS_SCENARIO_C,
} from '../services/documents/multimodalCorpus';
import type { DocumentSource, DocumentPage } from '../types';

/* ==========================================================================
   BLOCO 1: SEGMENTAÇÃO CONSERVADORA E TIPOGRAFIA CIENTÍFICA
   ========================================================================== */

test('T400: Segmentação de texto simples com parágrafos curtos e longos', () => {
  const doc: DocumentSource = {
    id: 'doc_simple_paragraphs',
    title: 'Texto Simples de Teste',
    subject: 'Neurociências',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      {
        pageNumber: 1,
        textContent: 'Primeiro parágrafo curto sobre sinapses.\n\nSegundo parágrafo mais elaborado discutindo a transmissão química no terminal pré-sináptico, com liberação de neurotransmissores na fenda e ligação aos receptores pós-sinápticos específicos.',
        hasVisualElements: false,
      },
    ],
  };

  const result = chunkDocument(doc);
  assert.equal(result.totalChunks >= 1, true, 'Deve gerar ao menos 1 chunk');
  assert.equal(result.documentId, 'doc_simple_paragraphs');
  assert.equal(result.coverage.extraction.extractedPagesCount, 1);
  assert.match(result.chunks[0].chunkId, /^doc_simple_paragraphs_p1_c\d+$/);
});

test('T401: Preservação de títulos (# Heading), subtítulos e listas ordenadas/marcadores', () => {
  const pageText = [
    '# Capítulo 1: Potencial de Ação',
    'Introdução ao gradiente eletroquímico neuronal.',
    '## 1.1 Fases do Potencial',
    'As fases são descritas a seguir:',
    '- Despolarização inicial',
    '- Pico do potencial e fechamento de canais Na+',
    '- Repolarização e influxo de K+',
    '1. Fase de repouso: -70 mV',
    '2. Limiar de disparo: -55 mV',
  ].join('\n\n');

  const blocks = extractStructuralBlocks(pageText);
  const headings = blocks.filter(b => b.kind === 'heading');
  const lists = blocks.filter(b => b.kind === 'list');

  assert.equal(headings.length, 2, 'Deve identificar 2 títulos');
  assert.equal(headings[0].text, '# Capítulo 1: Potencial de Ação');
  assert.equal(headings[1].text, '## 1.1 Fases do Potencial');
  assert.equal(lists.length >= 2, true, 'Deve identificar itens de lista');
});

test('T402: Preservação atômica de Tabelas Markdown (cabeçalho, separador e linhas indivisíveis)', () => {
  const pageWithTable = [
    'Texto anterior à tabela de neurotransmissores.',
    '',
    '| Neurotransmissor | Tipo | Ação Principal |',
    '| :--- | :--- | :--- |',
    '| Glutamato | Aminoácido | Excitatória rápida via AMPA/NMDA |',
    '| GABA | Aminoácido | Inibitória principal do SNC |',
    '| Dopamina | Monoamina | Modulação motora e recompensa |',
    '',
    'Texto posterior que analisa a tabela apresentada.',
  ].join('\n');

  const doc: DocumentSource = {
    id: 'doc_table_atomic',
    title: 'Tabela de Neurotransmissores',
    subject: 'Farmacologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: pageWithTable, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  const tableChunk = result.chunks.find(c => c.contentKind === 'table_markdown');
  assert.ok(tableChunk, 'Deve existir um chunk classificado como table_markdown');
  assert.equal(tableChunk!.text.includes('| Glutamato |'), true, 'Deve conter as linhas da tabela');
  assert.equal(tableChunk!.text.includes('| Dopamina |'), true, 'Deve conter a última linha da tabela');
  assert.equal(tableChunk!.text.includes('| :--- |'), true, 'Deve conter a linha divisória');
});

test('T403: Preservação de fórmulas LaTeX inline e display', () => {
  const mathText = [
    'A relação clássica da física quântica é dada por:',
    '$$E = h \\nu$$',
    'Onde $h = 6.626 \\times 10^{-34}\\text{ J}\\cdot\\text{s}$ é a constante fundamental de Planck e $\\nu$ é a frequência da onda.',
    'A equação fotoelétrica de balanço é:',
    '\\[K_{\\max} = h\\nu - \\Phi\\]',
  ].join('\n\n');

  const blocks = extractStructuralBlocks(mathText);
  const formulaBlocks = blocks.filter(b => b.kind === 'formula_latex');
  assert.equal(formulaBlocks.length >= 2, true, 'Deve identificar as duas fórmulas display');
  assert.equal(formulaBlocks[0].text, '$$E = h \\nu$$');
  assert.equal(formulaBlocks[1].text, '\\[K_{\\max} = h\\nu - \\Phi\\]');
});

test('T404: Preservação de notações científicas, subscritos, expoentes e símbolos matemáticos', () => {
  const scientificText = 'A energia cinética K_max varia linearmente com a frequência nu_0. A constante de Planck é h = 6,626 x 10^-34 J·s e a carga elementar é e = 1,602 x 10^-19 C. Operadores: [= ≈ ≠ ≤ ≥ ∑ ∫ √ π ∆ λ ^].';
  
  const sentences = splitSentencesConservatively(scientificText);
  assert.equal(sentences.length, 3, 'Deve segmentar em 3 sentenças sem quebrar nos expoentes ou decimais');
  assert.equal(sentences[0].text.includes('nu_0'), true);
  assert.equal(sentences[1].text.includes('6,626 x 10^-34 J·s'), true);
  assert.equal(sentences[1].text.includes('1,602 x 10^-19 C.'), true);
  assert.equal(sentences[2].text.includes('∑ ∫ √ π ∆ λ ^'), true);
});

test('T405: Preservação estrita de siglas técnicas (NMDA, SNARE, LTP, V_0, FSRS-7)', () => {
  const acronymsText = 'Os receptores NMDA e AMPA são cruciais para o fenômeno de LTP (Potenciação de Longo Prazo). O complexo SNARE medeia a exocitose vesicular. O potencial de corte V_0 foi calibrado com o algoritmo FSRS-7.';
  
  const sentences = splitSentencesConservatively(acronymsText);
  assert.equal(sentences.length, 3, 'Deve segmentar em 3 sentenças');
  assert.equal(sentences[0].text.includes('NMDA e AMPA'), true);
  assert.equal(sentences[0].text.includes('LTP'), true);
  assert.equal(sentences[1].text.includes('SNARE'), true);
  assert.equal(sentences[2].text.includes('V_0'), true);
  assert.equal(sentences[2].text.includes('FSRS-7'), true);
});

test('T406: Segmentação conservadora anti-falhas: decimais, abreviações (Dr., pág., i.e.) e citações', () => {
  const adversarialText = 'O Prof. Dr. Silva publicou na pág. 42 da revista Nature (Smith et al., 2020) que o valor médio foi de 3.14159 rad/s, i.e., correspondente ao esperado. O Dr. Santos confirmou a medição. A margem foi de 0.05 eV.';
  
  const sentences = splitSentencesConservatively(adversarialText);
  
  // Deve segmentar somente nas 3 sentenças reais, sem quebrar em "Prof.", "Dr.", "pág.", "3.14159", "i.e.", "0.05"
  assert.equal(sentences.length, 3, 'Deve encontrar exatamente 3 sentenças');
  assert.equal(sentences[0].text.startsWith('O Prof. Dr. Silva'), true);
  assert.equal(sentences[0].text.includes('pág. 42'), true);
  assert.equal(sentences[0].text.includes('3.14159 rad/s, i.e., correspondente'), true);
  assert.equal(sentences[1].text.startsWith('O Dr. Santos confirmou'), true);
  assert.equal(sentences[2].text.startsWith('A margem foi de 0.05 eV.'), true);
});

test('T407: Preservação integral do Português do Brasil com acentuação integral preservada', () => {
  const ptBrText = 'A quantização da radiação eletromagnética e a função trabalho determinam a emissão fotoelétrica instantânea. A correlação entre cognição, atenção e retenção mnemônica é fundamental.';
  
  const doc: DocumentSource = {
    id: 'doc_ptbr_accents',
    title: 'Português Acentuado',
    subject: 'Física e Cognição',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 512,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: ptBrText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0].text, ptBrText, 'O texto deve conter todos os acentos e cedilhas idênticos');
  assert.equal(result.chunks[0].text.includes('quantização'), true);
  assert.equal(result.chunks[0].text.includes('função'), true);
  assert.equal(result.chunks[0].text.includes('eletromagnética'), true);
  assert.equal(result.chunks[0].text.includes('mnemônica'), true);
});

/* ==========================================================================
   BLOCO 2: PÁGINAS MÚLTIPLAS, VAZIAS, SCAN E DETERMINISMO
   ========================================================================== */

test('T408: Processamento de múltiplas páginas físicas e tratamento de páginas vazias/escaneadas', () => {
  const docMulti: DocumentSource = {
    id: 'doc_multi_pages',
    title: 'Documento Multi-Páginas Misto',
    subject: 'Biologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 4096,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      { pageNumber: 1, textContent: 'Conteúdo textual da primeira página.', hasVisualElements: false },
      { pageNumber: 2, textContent: '', hasVisualElements: true, isScanned: true, legibility: 'scanned_image' },
      { pageNumber: 3, textContent: 'Conteúdo textual da terceira página com detalhe anatômico.', hasVisualElements: false },
    ],
  };

  const result = chunkDocument(docMulti);
  assert.equal(result.totalPagesProcessed, 3);
  assert.equal(result.emptyPages.includes(2), true, 'Página 2 deve ser registrada em emptyPages');
  
  // Página escaneada gera chunk de fallback estrutural
  const p2Chunk = result.chunks.find(c => c.pageNumber === 2);
  assert.ok(p2Chunk, 'Deve gerar chunk estrutural de fallback para a página escaneada');
  assert.equal(p2Chunk!.contentKind, 'scanned_fallback');
  assert.equal(p2Chunk!.chunkId, 'doc_multi_pages_p2_c0');
  
  // Chunks das páginas 1 e 3
  const p1Chunk = result.chunks.find(c => c.pageNumber === 1);
  const p3Chunk = result.chunks.find(c => c.pageNumber === 3);
  assert.ok(p1Chunk);
  assert.ok(p3Chunk);
  assert.equal(p1Chunk!.chunkId, 'doc_multi_pages_p1_c0');
  assert.equal(p3Chunk!.chunkId, 'doc_multi_pages_p3_c0');
});

test('T409: Bloco atômico maior que o alvo: preservação sem truncamento silencioso', () => {
  // Gera uma tabela Markdown extensa de 30 linhas (> 700 tokens)
  const rows = Array.from({ length: 30 }, (_, i) => `| Parâmetro_${i} | Valor_${i * 1.5} eV | Status_${i} | Descrição detalhada do ensaio ${i} |`).join('\n');
  const hugeTable = `| Parâmetro | Valor | Status | Descrição |\n| :--- | :--- | :--- | :--- |\n${rows}`;

  const doc: DocumentSource = {
    id: 'doc_huge_atomic',
    title: 'Tabela Extensa',
    subject: 'Metrologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 8192,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: hugeTable, hasVisualElements: false }],
  };

  const result = chunkDocument(doc, { maxTokens: 400 });
  assert.equal(result.chunks.length, 1, 'Tabela atômica deve ser preservada como um único chunk');
  assert.equal(result.chunks[0].contentKind, 'table_markdown');
  assert.equal(result.chunks[0].text.length, hugeTable.length, 'Não pode haver truncamento silencioso');
  assert.equal(result.chunks[0].text.includes('Parâmetro_29'), true, 'Última linha deve estar intacta');
});

test('T410: Texto idêntico em páginas distintas: garantia de IDs únicos e ausência de colisão lógica', () => {
  const identicalText = 'Introdução ao estudo da neurociência comportamental.';
  const doc: DocumentSource = {
    id: 'doc_duplicate_text',
    title: 'Textos Repetidos',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [
      { pageNumber: 1, textContent: identicalText, hasVisualElements: false },
      { pageNumber: 5, textContent: identicalText, hasVisualElements: false },
    ],
  };

  const result = chunkDocument(doc);
  assert.equal(result.chunks.length, 2);
  
  const chunk1 = result.chunks[0];
  const chunk2 = result.chunks[1];

  // Textos e hashes de conteúdo são idênticos
  assert.equal(chunk1.text, chunk2.text);
  assert.equal(chunk1.contentHash, chunk2.contentHash);
  
  // Mas as identidades estruturais são estritamente distintas (sem colisão)
  assert.notEqual(chunk1.chunkId, chunk2.chunkId);
  assert.equal(chunk1.chunkId, 'doc_duplicate_text_p1_c0');
  assert.equal(chunk2.chunkId, 'doc_duplicate_text_p5_c0');
  assert.equal(chunk1.pageNumber, 1);
  assert.equal(chunk2.pageNumber, 5);
});

test('T411: Rastreabilidade exata de offsets: page.textContent.slice(start, end) coincide com o chunk', () => {
  const originalPageText = 'A sinapse química utiliza neurotransmissores armazenados em vesículas. Quando o potencial de ação atinge o terminal, canais de Ca2+ voltagem-dependentes abrem-se, permitindo o influxo de íons cálcio. Esse influxo deflagra a fusão vesicular via proteínas SNARE.';

  const doc: DocumentSource = {
    id: 'doc_offsets_trace',
    title: 'Offsets Test',
    subject: 'Fisiologia',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: originalPageText, hasVisualElements: false }],
  };

  const result = chunkDocument(doc);
  assert.equal(result.chunks.length >= 1, true);

  for (const chunk of result.chunks) {
    const sliced = originalPageText.slice(chunk.sourceRef.charOffsetStart, chunk.sourceRef.charOffsetEnd);
    assert.equal(
      sliced,
      chunk.text,
      `O slice da página [${chunk.sourceRef.charOffsetStart}, ${chunk.sourceRef.charOffsetEnd}] deve ser idêntico ao chunk.text`
    );
  }
});

test('T412: Determinismo e idempotência matemática: mesma entrada gera chunks, IDs e hashes idênticos', () => {
  const doc: DocumentSource = {
    id: 'doc_idempotence',
    title: 'Determinismo Teste',
    subject: 'Física',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: 1730000000000,
    pages: [
      {
        pageNumber: 1,
        textContent: 'Texto constante para validar determinismo estrito em múltiplas invocações do fatiador.',
        hasVisualElements: false,
      },
    ],
  };

  const run1 = chunkDocument(doc);
  const run2 = chunkDocument(doc);

  assert.equal(run1.chunks.length, run2.chunks.length);
  for (let i = 0; i < run1.chunks.length; i++) {
    const c1 = run1.chunks[i];
    const c2 = run2.chunks[i];
    assert.equal(c1.chunkId, c2.chunkId);
    assert.equal(c1.text, c2.text);
    assert.equal(c1.contentHash, c2.contentHash);
    assert.equal(c1.sourceRef.charOffsetStart, c2.sourceRef.charOffsetStart);
    assert.equal(c1.sourceRef.charOffsetEnd, c2.sourceRef.charOffsetEnd);
    assert.equal(c1.estimatedTokens, c2.estimatedTokens);
  }
});

test('T413: Prova matemática de ausência de perda (100% de cobertura de caracteres não-espaço)', () => {
  const densePage = [
    'A eletrodinâmica clássica de Maxwell postulava a continuidade do campo.',
    'Experimentos do final do século XIX revelaram discrepâncias fundamentais.',
    'O tempo de emissão fotoelétrica medido experimentalmente foi inferior a 10^-9 segundos.',
    'A teoria ondulatória previa um atraso de vários minutos ou horas para acúmulo de energia.',
    'Einstein propôs que a energia da radiação luminosa é quantizada em pacotes discretos (fótons).',
    'Cada fóton possui energia dada por E = h * nu, onde h é a constante de Planck.',
  ].join('\n\n');

  const doc: DocumentSource = {
    id: 'doc_zero_loss',
    title: 'Prova de Ausência de Perda',
    subject: 'Física',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: densePage, hasVisualElements: false }],
  };

  const result = chunkDocument(doc, { targetTokens: 50, maxTokens: 80, overlapTokens: 0 });
  assert.equal(result.chunks.length >= 2, true, 'Deve particionar em múltiplos chunks');

  const coverageCheck = verifyTextCoverage(densePage, result.chunks);
  assert.equal(coverageCheck.covered, true, 'Todos os caracteres devem estar cobertos');
  assert.equal(coverageCheck.missingCharsCount, 0, 'Zero caracteres ausentes');
  assert.equal(coverageCheck.coverageRatio, 1.0, 'Taxa de cobertura deve ser exatamente 100%');
});

test('T414: Overlap configurável: continuidade contextual e impacto transparente nos offsets', () => {
  const multiSentencePage = [
    'Sentença número um contextualizando o tema inicial.',
    'Sentença número dois aprofundando o mecanismo de ação.',
    'Sentença número três trazendo a evidência empírica.',
    'Sentença número quatro concluindo a dedução teórica.',
  ].join(' ');

  const doc: DocumentSource = {
    id: 'doc_overlap_test',
    title: 'Overlap Test',
    subject: 'Didática',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: multiSentencePage, hasVisualElements: false }],
  };

  // Força quebra em 2 chunks com overlap
  const resultWithOverlap = chunkDocument(doc, { targetTokens: 15, maxTokens: 25, overlapTokens: 10 });
  assert.equal(resultWithOverlap.chunks.length >= 2, true);

  const c0 = resultWithOverlap.chunks[0];
  const c1 = resultWithOverlap.chunks[1];

  // Com overlap > 0, o início do chunk 1 deve ser menor que o fim do chunk 0
  assert.equal(
    c1.sourceRef.charOffsetStart < c0.sourceRef.charOffsetEnd,
    true,
    'Deve haver sobreposição física de caracteres entre chunks adjacentes'
  );
});

/* ==========================================================================
   BLOCO 3: CORPUS MULTIDISCIPLINAR REALISTA E ESCALA
   ========================================================================== */

test('T415: Documento canônico CORPUS_SCENARIO_A (Artigo Científico Multimodal)', () => {
  const result = chunkDocument(CORPUS_SCENARIO_A.document);
  assert.equal(result.documentId, CORPUS_SCENARIO_A.document.id);
  assert.equal(result.totalPagesProcessed, 5);
  assert.equal(result.emptyPages.length, 0);
  assert.equal(result.totalChunks >= 5, true, 'Deve gerar ao menos 1 chunk por página');

  // Verifica presença de termos científicos essenciais
  const allChunkText = result.chunks.map(c => c.text).join(' ');
  assert.equal(allChunkText.includes('E = h·nu'), true);
  assert.equal(allChunkText.includes('6,626 x 10^-34 J·s'), true);
  assert.equal(allChunkText.includes('Tabela 1'), true);
  assert.equal(allChunkText.includes('Gráfico 1'), true);
  assert.equal(allChunkText.includes('K_max = h·nu - Phi'), true);

  // Verifica que os chunks mapeiam as seções do TOC nativo do Caso A
  const p3Chunk = result.chunks.find(c => c.pageNumber === 3);
  assert.ok(p3Chunk);
  assert.equal(p3Chunk!.sourceRef.sectionTitle, '3. Função Trabalho e Frequência Limiar');
});

test('T416: Documento extenso CORPUS_SCENARIO_C (Tratado Herbert Simon de 120 páginas)', () => {
  const result = chunkDocument(CORPUS_SCENARIO_C.document);
  assert.equal(result.documentId, CORPUS_SCENARIO_C.document.id);
  assert.equal(result.totalPagesProcessed, 120);
  assert.equal(result.coverage.chunking.coveredPagesCount, 120, '100% das 120 páginas devem estar cobertas');
  assert.equal(result.totalChunks >= 120, true, 'Deve gerar chunks para todas as 120 páginas');

  // Verifica chunks do início (pág. 1-5), meio (pág. 55) e fim (pág. 110-120)
  const chunkStart = result.chunks.find(c => c.pageNumber === 5);
  const chunkMiddle = result.chunks.find(c => c.pageNumber === 55);
  const chunkEnd = result.chunks.find(c => c.pageNumber === 118);

  assert.ok(chunkStart, 'Deve existir chunk da página 5');
  assert.ok(chunkMiddle, 'Deve existir chunk da página 55');
  assert.ok(chunkEnd, 'Deve existir chunk da página 118');

  // Verifica que o chunk da pág. 98 mapeia a Seção de Satisficing
  const chunkSatisficing = result.chunks.find(c => c.pageNumber === 98);
  assert.ok(chunkSatisficing);
  assert.equal(chunkSatisficing!.sourceRef.sectionTitle?.includes('Satisficing'), true);
});

test('T417: Documento sintético extenso de 300 páginas (estabilidade e integridade)', () => {
  const synthetic300Pages: DocumentPage[] = Array.from({ length: 300 }, (_, idx) => {
    const pageNum = idx + 1;
    return {
      pageNumber: pageNum,
      textContent: `Capítulo ${(pageNum % 10) + 1}, Página ${pageNum}. Discussão acadêmica aprofundada sobre neurobiologia celular e comportamento com equação E_${pageNum} = m * c^2 e coeficiente beta_${pageNum} = 0.${pageNum}.`,
      hasVisualElements: pageNum % 5 === 0,
    };
  });

  const doc300: DocumentSource = {
    id: 'doc_synthetic_300_pages',
    title: 'Tratado Sintético de 300 Páginas',
    subject: 'Neurociência Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 1024 * 2,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: synthetic300Pages,
  };

  const startTime = performance.now();
  const result = chunkDocument(doc300);
  const duration = performance.now() - startTime;

  assert.equal(result.totalPagesProcessed, 300);
  assert.equal(result.coverage.chunking.coveredPagesCount, 300);
  assert.equal(result.totalChunks >= 300, true);
  assert.equal(duration < 1000, true, 'O fatiamento de 300 páginas puramente em memória deve executar em menos de 1 segundo');

  // Checa integridade da página 1 e página 300
  const firstChunk = result.chunks[0];
  const lastChunk = result.chunks[result.chunks.length - 1];
  assert.equal(firstChunk.pageNumber, 1);
  assert.equal(lastChunk.pageNumber, 300);
  assert.match(lastChunk.chunkId, /^doc_synthetic_300_pages_p300_c\d+$/);
});

test('T418: Associação de sumário TOC sem fabricar seções inexistentes', () => {
  const docNoToc: DocumentSource = {
    id: 'doc_no_toc',
    title: 'Artigo sem Sumário',
    subject: 'Geral',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: 'Artigo científico publicado sem sumário formal anexo.', hasVisualElements: false }],
  };

  const result = chunkDocument(docNoToc);
  assert.equal(result.chunks.length, 1);
  // Não pode inventar fake title
  assert.equal(result.chunks[0].sourceRef.sectionTitle, undefined);
  assert.equal(result.chunks[0].sourceRef.sectionHierarchy, undefined);
});

test('T419: Multimodalidade: extração automática de referências a figuras, tabelas e equações nos chunks', () => {
  const pageWithRefs = 'A Tabela 2 descreve os grupos de controle. Conforme visto na Figura 3 e na Equação 1.2, a taxa foi normalizada.';
  const doc: DocumentSource = {
    id: 'doc_multimodal_refs',
    title: 'Referências Multimodais',
    subject: 'Estatística',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
    pages: [{ pageNumber: 1, textContent: pageWithRefs, hasVisualElements: true }],
  };

  const result = chunkDocument(doc);
  assert.equal(result.chunks.length, 1);
  const chunk = result.chunks[0];
  assert.ok(chunk.multimodalReferences);
  assert.equal(chunk.multimodalReferences.tableLabels?.includes('Tabela 2'), true);
  assert.equal(chunk.multimodalReferences.figureLabels?.includes('Figura 3'), true);
  assert.equal(chunk.multimodalReferences.formulaExpressions?.includes('Equação 1.2'), true);
});
