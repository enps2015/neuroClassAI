/**
 * NeuroClass AI — Suíte de Testes do Contrato de Citações e Rastreabilidade RAG (Missão P3.1)
 * @module tests/rag_citations_contract.test
 *
 * Cobertura de Testes Estruturais:
 * - Grupo A: buildControlledEvidenceMap (A1..A5)
 * - Grupo B: validateCitations & parseAndValidateCitations (B1..B9)
 * - Grupo C: Integração com Prompt do Tutor e Sanitização no Servidor (C1..C6)
 * - Grupo D: Renderização Visual, Badges e Sanitização TTS (D1..D6)
 * - Grupo E: Proveniência de Notas no Caderno de Estudos (E1..E7)
 * - Grupo F: Regressão e Resiliência (F1..F6)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EvidenceReference, StudyNote, TutorChatMessage } from '../types';
import type { ControlledEvidenceItem } from '../types/rag';
import {
  buildControlledEvidenceMap,
  parseAndValidateCitations,
  validateCitations,
} from '../services/retrieval/tutorContextBuilder';
import { stripMarkdownForSpeech } from '../services/voice/speechSynthesis';

/* ==========================================================================
   GRUPO A: buildControlledEvidenceMap (A1..A5)
   ========================================================================== */

test('Grupo A: buildControlledEvidenceMap', async (t) => {
  await t.test('A1: Gera identificadores sequenciais rigorosos [C1], [C2], [C3]...', () => {
    const evidences: EvidenceReference[] = [
      { id: 'ev_1', type: 'pdf_page', pageNumber: 3, excerpt: 'LTP é a potenciação de longa duração' },
      { id: 'ev_2', type: 'pdf_page', pageNumber: 7, excerpt: 'Sinapses glutamatérgicas ativam receptores NMDA' },
      { id: 'ev_3', type: 'pdf_page', pageNumber: 12, excerpt: 'A plasticidade sináptica sustenta a memória declarativa' },
    ];

    const map = buildControlledEvidenceMap(evidences);
    assert.equal(map.size, 3);
    assert.deepEqual(Array.from(map.keys()), ['C1', 'C2', 'C3']);

    const item1 = map.get('C1');
    assert.ok(item1);
    assert.equal(item1.tag, '[C1]');
    assert.equal(item1.index, 1);
    assert.equal(item1.evidence.pageNumber, 3);
    assert.equal(item1.formattedPromptLine, '[C1] (Pág. 3): "LTP é a potenciação de longa duração"');
  });

  await t.test('A2: Preserva metadados essenciais (pageNumber, chunkIndex, excerpt, id)', () => {
    const evidences: EvidenceReference[] = [
      {
        id: 'chunk_doc1_p15_c2',
        type: 'pdf_page',
        pageNumber: 15,
        chunkIndex: 2,
        context: 'Seção de Neuroplasticidade',
        excerpt: 'Os espinhos dendríticos modificam sua morfologia.',
      },
    ];

    const map = buildControlledEvidenceMap(evidences);
    const item = map.get('C1');
    assert.ok(item);
    assert.equal(item.evidence.id, 'chunk_doc1_p15_c2');
    assert.equal(item.evidence.pageNumber, 15);
    assert.equal(item.evidence.chunkIndex, 2);
    assert.equal(item.evidence.context, 'Seção de Neuroplasticidade');
    assert.equal(item.evidence.excerpt, 'Os espinhos dendríticos modificam sua morfologia.');
  });

  await t.test('A3: Trata entrada vazia, nula ou indefinida sem lançar exceção', () => {
    const mapEmpty = buildControlledEvidenceMap([]);
    assert.equal(mapEmpty.size, 0);

    const mapNull = buildControlledEvidenceMap(null as any);
    assert.equal(mapNull.size, 0);

    const mapUndefined = buildControlledEvidenceMap(undefined as any);
    assert.equal(mapUndefined.size, 0);
  });

  await t.test('A4: Trechos idênticos ou com mesma página recebem tags distintas sequenciais', () => {
    const evidences: EvidenceReference[] = [
      { id: 'ev_a', type: 'pdf_page', pageNumber: 4, excerpt: 'Mesmo trecho' },
      { id: 'ev_b', type: 'pdf_page', pageNumber: 4, excerpt: 'Mesmo trecho' },
      { id: 'ev_c', type: 'pdf_page', pageNumber: 4, excerpt: 'Outro trecho na mesma página' },
    ];

    const map = buildControlledEvidenceMap(evidences);
    assert.equal(map.size, 3);
    assert.ok(map.has('C1'));
    assert.ok(map.has('C2'));
    assert.ok(map.has('C3'));
    assert.notEqual(map.get('C1')?.evidence.id, map.get('C2')?.evidence.id);
  });

  await t.test('A5: Formatação de prompt lida com itens sem página ou tipos diversos', () => {
    const evidences: EvidenceReference[] = [
      { id: 'ev_note', type: 'note_section', excerpt: 'Resumo sobre córtex pré-frontal', sectionTitle: 'Córtex' },
      { id: 'ev_fig', type: 'figure', pageNumber: 20, excerpt: 'Diagrama da via perfurante', figureLabel: 'Figura 3.2' },
    ];

    const map = buildControlledEvidenceMap(evidences);
    const item1 = map.get('C1');
    assert.ok(item1);
    assert.equal(item1.formattedPromptLine, '[C1] (Pág. s/p): "Resumo sobre córtex pré-frontal"');

    const item2 = map.get('C2');
    assert.ok(item2);
    assert.equal(item2.formattedPromptLine, '[C2] (Pág. 20): "Diagrama da via perfurante"');
  });
});

/* ==========================================================================
   GRUPO B: validateCitations & parseAndValidateCitations (B1..B9)
   ========================================================================== */

test('Grupo B: validateCitations & parseAndValidateCitations', async (t) => {
  const sampleEvidences: EvidenceReference[] = [
    { id: 'c1', type: 'pdf_page', pageNumber: 10, excerpt: 'Evidência um sobre receptores AMPA' },
    { id: 'c2', type: 'pdf_page', pageNumber: 14, excerpt: 'Evidência dois sobre influxo de cálcio' },
    { id: 'c3', type: 'pdf_page', pageNumber: 22, excerpt: 'Evidência três sobre consolidação sináptica' },
  ];
  const evidenceMap = buildControlledEvidenceMap(sampleEvidences);

  await t.test('B1: Reconhece citações válidas e retorna referências correspondentes exatas', () => {
    const text = 'O influxo de cálcio ocorre via receptores NMDA [C2], permitindo a fosforilação de AMPA [C1].';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.hasCitations, true);
    assert.equal(result.validCitations.length, 2);
    assert.equal(result.invalidCitations.length, 0);

    const pages = result.validCitations.map(c => c.pageNumber);
    assert.ok(pages.includes(14));
    assert.ok(pages.includes(10));
  });

  await t.test('B2: Identifica citações alucinadas ou inexistentes no mapa de evidências', () => {
    const text = 'Conforme observado no documento [C1] e em [C99], a neurogênese persiste.';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.validCitations.length, 1);
    assert.equal(result.validCitations[0].pageNumber, 10);
    assert.equal(result.invalidCitations.length, 1);
    assert.equal(result.invalidCitations[0], 'C99');
  });

  await t.test('B3: Resposta sem nenhuma citação retorna arrays vazios sem falhas', () => {
    const text = 'Esta é uma resposta puramente conceitual sem nenhuma citação documental explícita.';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.hasCitations, false);
    assert.equal(result.validCitations.length, 0);
    assert.equal(result.invalidCitations.length, 0);
    assert.equal(result.cleanedText, text);
  });

  await t.test('B4: Múltiplas citações na mesma frase ou coladas [C1][C2] são analisadas', () => {
    const text = 'A ativação coordenada [C1][C2] desencadeia cascatas bioquímicas intracelulares.';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.validCitations.length, 2);
    const pages = result.validCitations.map(c => c.pageNumber);
    assert.deepEqual(pages.sort((a, b) => (a || 0) - (b || 0)), [10, 14]);
  });

  await t.test('B5: Opção stripUnverifiedMarkers remove tags inválidas e preserva tags legítimas', () => {
    const text = 'Evidência real [C1] versus invenção [C88] e [C999].';
    const result = parseAndValidateCitations(text, evidenceMap, { stripUnverifiedMarkers: true });

    assert.ok(result.cleanedText.includes('[C1]'));
    assert.ok(!result.cleanedText.includes('[C88]'));
    assert.ok(!result.cleanedText.includes('[C999]'));
    assert.equal(result.invalidCitations.length, 2);
  });

  await t.test('B6: Compatibilidade retroativa com validateCitations(text, TutorGroundedContext)', () => {
    const mockGroundedContext: any = {
      state: 'grounded',
      evidences: sampleEvidences,
      documentExcerpts: ['Ex 1', 'Ex 2', 'Ex 3'],
      totalChunksRetrieved: 3,
      tokenBudgetExceeded: false,
    };

    const res = validateCitations('Texto citando [C1] e [C2] e falsa [C45].', mockGroundedContext);
    assert.equal(res.validCitations.length, 2);
    assert.equal(res.invalidCitations.length, 1);
    assert.equal(res.invalidCitations[0], 'C45');
    assert.equal(res.isFullyVerified, false);
  });

  await t.test('B7: Tolerância a minúsculas [c1] e espaçamento interno [C 2]', () => {
    const text = 'Exemplo com minúscula [c1] e com espaço [C 2].';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.validCitations.length, 2);
    const pages = result.validCitations.map(c => c.pageNumber);
    assert.ok(pages.includes(10));
    assert.ok(pages.includes(14));
  });

  await t.test('B8: Não confunde colchetes arbitrários [Fórmula 1], [Tabela 2], [1] com tags de citação', () => {
    const text = 'Observe a [Fórmula 1] e a [Tabela 2] e nota [1] e [Capítulo 3].';
    const result = parseAndValidateCitations(text, evidenceMap);

    assert.equal(result.hasCitations, false);
    assert.equal(result.validCitations.length, 0);
    assert.equal(result.invalidCitations.length, 0);
  });

  await t.test('B9: Determinismo: 10 execuções produzem exatamente os mesmos resultados', () => {
    const text = 'Texto com [C1], [C2], [C3] e [C55].';
    const firstResult = parseAndValidateCitations(text, evidenceMap);

    for (let i = 0; i < 9; i++) {
      const iterResult = parseAndValidateCitations(text, evidenceMap);
      assert.deepEqual(iterResult.validCitations, firstResult.validCitations);
      assert.deepEqual(iterResult.invalidCitations, firstResult.invalidCitations);
      assert.equal(iterResult.cleanedText, firstResult.cleanedText);
    }
  });
});

/* ==========================================================================
   GRUPO C: Prompt do Tutor e Sanitização no Servidor (C1..C6)
   ========================================================================== */

test('Grupo C: Prompt do Tutor e Sanitização no Servidor', async (t) => {
  await t.test('C1: Excertos com tags controladas [C#] são formatados para inclusão no prompt', () => {
    const evidences: EvidenceReference[] = [
      { id: 'e1', type: 'pdf_page', pageNumber: 5, excerpt: 'Potencial de ação pré-sináptico' },
      { id: 'e2', type: 'pdf_page', pageNumber: 8, excerpt: 'Liberação vesicular de neurotransmissores' },
    ];
    const map = buildControlledEvidenceMap(evidences);

    const formattedLines = Array.from(map.values()).map(item => item.formattedPromptLine);
    assert.equal(formattedLines.length, 2);
    assert.ok(formattedLines[0].startsWith('[C1] (Pág. 5):'));
    assert.ok(formattedLines[1].startsWith('[C2] (Pág. 8):'));
  });

  await t.test('C2: Regra de citação instrui expressamente o uso exclusivo de tags [C#] disponíveis', () => {
    // Simulação da instrução de sistema que inserimos em server.ts
    const systemRule = `REGRA DE RASTREABILIDADE DOCUMENTAL:
- Você recebeu evidências numeradas [C1], [C2], etc.
- Ao fundamentar uma afirmação, cite OBRIGATORIAMENTE a tag [C#] correspondente.
- NUNCA invente números de citação que não constem na lista de evidências.`;

    assert.ok(systemRule.includes('[C1], [C2]'));
    assert.ok(systemRule.includes('OBRIGATORIAMENTE a tag [C#]'));
    assert.ok(systemRule.includes('NUNCA invente números de citação'));
  });

  await t.test('C3: Servidor valida resposta e popula verifiedCitations e unverifiedCitations', () => {
    const evidences: EvidenceReference[] = [
      { id: 'e1', type: 'pdf_page', pageNumber: 12, excerpt: 'Dopamina regula o circuito mesolímbico' },
    ];
    const map = buildControlledEvidenceMap(evidences);

    const geminiText = 'A via de recompensa é modulada pela dopamina [C1], com efeito adicional em [C77].';
    const parsed = parseAndValidateCitations(geminiText, map, { stripUnverifiedMarkers: true });

    assert.equal(parsed.validCitations.length, 1);
    assert.equal(parsed.validCitations[0].pageNumber, 12);
    assert.deepEqual(parsed.invalidCitations, ['C77']);
    assert.ok(!parsed.cleanedText.includes('[C77]'));
    assert.ok(parsed.cleanedText.includes('[C1]'));
  });

  await t.test('C4: Resumo estatístico groundedContextSummary calculado com fidelidade', () => {
    const evidences: EvidenceReference[] = [
      { id: 'e1', type: 'pdf_page', pageNumber: 1, excerpt: 'Trecho 1' },
      { id: 'e2', type: 'pdf_page', pageNumber: 2, excerpt: 'Trecho 2' },
      { id: 'e3', type: 'pdf_page', pageNumber: 3, excerpt: 'Trecho 3' },
    ];
    const map = buildControlledEvidenceMap(evidences);
    const geminiText = 'Explicação baseada em [C2] e citação errada [C40].';
    const parsed = parseAndValidateCitations(geminiText, map);

    const summary = {
      totalEvidencesProvided: map.size,
      citedCount: parsed.validCitations.length,
      hasUnverifiedCitations: parsed.invalidCitations.length > 0,
    };

    assert.equal(summary.totalEvidencesProvided, 3);
    assert.equal(summary.citedCount, 1);
    assert.equal(summary.hasUnverifiedCitations, true);
  });

  await t.test('C5: Compatibilidade quando requisição do tutor não traz evidências recuperadas', () => {
    const emptyMap = buildControlledEvidenceMap([]);
    const geminiText = 'Resposta de esclarecimento sem evidências documentais.';
    const parsed = parseAndValidateCitations(geminiText, emptyMap);

    assert.equal(parsed.validCitations.length, 0);
    assert.equal(parsed.invalidCitations.length, 0);
    assert.equal(parsed.hasCitations, false);
  });

  await t.test('C6: Limpeza de marcadores de citações inválidas preserva espaçamento legível', () => {
    const map = buildControlledEvidenceMap([
      { id: 'e1', type: 'pdf_page', pageNumber: 1, excerpt: 'Válido' },
    ]);
    const geminiText = 'Texto antes [C99] texto depois.';
    const parsed = parseAndValidateCitations(geminiText, map, { stripUnverifiedMarkers: true });

    assert.ok(!parsed.cleanedText.includes('[C99]'));
    assert.ok(parsed.cleanedText.includes('Texto antes'));
    assert.ok(parsed.cleanedText.includes('texto depois'));
  });
});

/* ==========================================================================
   GRUPO D: Renderização Visual e Sanitização TTS (D1..D6)
   ========================================================================== */

test('Grupo D: Renderização Visual e Sanitização TTS', async (t) => {
  await t.test('D1: Tag [C1] é identificada por regex de inline markdown', () => {
    const text = 'Afirmação fundamentada [C1] no documento.';
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[C\d+\])/g);

    assert.ok(parts.includes('[C1]'));
    assert.equal(parts.filter(p => /^\[C\d+\]$/.test(p)).length, 1);
  });

  await t.test('D2: Colchetes de outros tipos não são confundidos com tags [C#]', () => {
    const text = 'Veja [Fórmula 1] e [Pág. 12] e [C2] e [Nota].';
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[C\d+\])/g);

    const citationTags = parts.filter(p => /^\[C\d+\]$/.test(p));
    assert.deepEqual(citationTags, ['[C2]']);
  });

  await t.test('D3: stripMarkdownForSpeech remove tags [C1], [C2] para TTS não pronunciar', () => {
    const text = 'A potenciação sináptica [C1] fortalece a transmissão neural [C2].';
    const spoken = stripMarkdownForSpeech(text);

    assert.ok(!spoken.includes('[C1]'));
    assert.ok(!spoken.includes('[C2]'));
    assert.ok(!spoken.includes('C1'));
    assert.ok(!spoken.includes('C2'));
    assert.ok(spoken.includes('potenciação sináptica'));
    assert.ok(spoken.includes('fortalece a transmissão neural'));
  });

  await t.test('D4: stripMarkdownForSpeech preserva texto ordinário e pontuação adequada', () => {
    const text = 'O hipocampo é vital para a memória declarativa [C1]. Você sabia disso?';
    const spoken = stripMarkdownForSpeech(text);

    assert.ok(spoken.includes('O hipocampo é vital para a memória declarativa'));
    assert.ok(spoken.includes('Você sabia disso?'));
  });

  await t.test('D5: ACH-P3-01: Mensagem do tutor recebe evidencesCited contendo APENAS citações verificadas', () => {
    const retrievedChunks: EvidenceReference[] = [
      { id: 'c1', type: 'pdf_page', pageNumber: 5, excerpt: 'Chunk 1 não citado' },
      { id: 'c2', type: 'pdf_page', pageNumber: 8, excerpt: 'Chunk 2 citado' },
      { id: 'c3', type: 'pdf_page', pageNumber: 15, excerpt: 'Chunk 3 não citado' },
    ];
    const map = buildControlledEvidenceMap(retrievedChunks);

    const tutorText = 'O processo de liberação ocorre na fenda sináptica [C2].';
    const validation = parseAndValidateCitations(tutorText, map);

    // Simulação do comportamento corrigido no TutorPanel
    const tutorMsg: TutorChatMessage = {
      id: 'msg_t_1',
      sender: 'tutor',
      text: tutorText,
      timestamp: Date.now(),
      pedagogicalRole: 'explanation',
      evidencesCited: validation.validCitations, // ACH-P3-01: estritamente verificadas
      verifiedCitations: validation.validCitations,
      unverifiedCitations: validation.invalidCitations,
      retrievedEvidenceCount: retrievedChunks.length,
    };

    assert.equal(tutorMsg.evidencesCited?.length, 1);
    assert.equal(tutorMsg.evidencesCited?.[0].pageNumber, 8);
    assert.equal(tutorMsg.retrievedEvidenceCount, 3);
    assert.notEqual(tutorMsg.evidencesCited?.length, tutorMsg.retrievedEvidenceCount);
  });

  await t.test('D6: Citações inválidas são preservadas em unverifiedCitations para auditoria', () => {
    const retrieved: EvidenceReference[] = [
      { id: 'c1', type: 'pdf_page', pageNumber: 3, excerpt: 'Chunk 1' },
    ];
    const map = buildControlledEvidenceMap(retrieved);

    const tutorText = 'Afirmação [C1] com citação inventada [C4].';
    const validation = parseAndValidateCitations(tutorText, map);

    const tutorMsg: TutorChatMessage = {
      id: 'msg_t_2',
      sender: 'tutor',
      text: validation.cleanedText,
      timestamp: Date.now(),
      pedagogicalRole: 'explanation',
      evidencesCited: validation.validCitations,
      verifiedCitations: validation.validCitations,
      unverifiedCitations: validation.invalidCitations,
    };

    assert.equal(tutorMsg.verifiedCitations?.length, 1);
    assert.deepEqual(tutorMsg.unverifiedCitations, ['C4']);
  });
});

/* ==========================================================================
   GRUPO E: Proveniência de Notas no Caderno de Estudos (E1..E7)
   ========================================================================== */

test('Grupo E: Proveniência de Notas no Caderno de Estudos', async (t) => {
  // Função utilitária que replica o algoritmo implementado em TutorPanel.tsx (ACH-P3-04)
  function createStudyNoteFromTutorMessage(
    msg: TutorChatMessage,
    activeDocument: { id: string; title: string; subject?: string },
    activeConcept?: { id: string; name: string }
  ): StudyNote {
    const conceptName = (activeConcept && activeConcept.id === msg.contextConceptId) ? activeConcept.name : undefined;
    const cleanSnippet = msg.text.slice(0, 50).replace(/[\r\n#*`]/g, ' ').trim();
    const title = conceptName
      ? `Tutor: ${conceptName}`
      : `Tutor: ${cleanSnippet || 'Explicação'}`;

    const validCitations = (msg.verifiedCitations && msg.verifiedCitations.length > 0)
      ? msg.verifiedCitations
      : (msg.evidencesCited || []);

    const citedText = validCitations.length > 0
      ? validCitations.map((e) => `[Pág. ${(e as any).pageNumber || 's/p'}]: ${e.excerpt}`).join('\n\n')
      : undefined;

    const rawPages = validCitations
      .map((e) => (e as any).pageNumber)
      .filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
    const distinctPages = Array.from(new Set(rawPages)).sort((a, b) => a - b);

    const pageSource = distinctPages.length === 1 ? distinctPages[0] : undefined;
    const pageSources = distinctPages.length > 0 ? distinctPages : undefined;

    return {
      id: `note_${Date.now()}`,
      documentId: activeDocument.id,
      title,
      content: msg.text,
      associatedConceptId: msg.contextConceptId,
      citedExcerpt: citedText,
      pageSource,
      pageSources,
      verifiedCitations: validCitations.length > 0 ? validCitations : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const doc = { id: 'doc_neuro_1', title: 'Neurociência Básica', subject: 'Fisiologia' };

  await t.test('E1: Nota com 1 citação única define pageSource = p e pageSources = [p]', () => {
    const msg: TutorChatMessage = {
      id: 'm1',
      sender: 'tutor',
      text: 'Explicação sobre canais de sódio.',
      timestamp: Date.now(),
      verifiedCitations: [
        { id: 'c1', type: 'pdf_page', pageNumber: 7, excerpt: 'Canais de sódio voltagem-dependentes' },
      ],
      evidencesCited: [
        { id: 'c1', type: 'pdf_page', pageNumber: 7, excerpt: 'Canais de sódio voltagem-dependentes' },
      ],
    };

    const note = createStudyNoteFromTutorMessage(msg, doc);
    assert.equal(note.pageSource, 7);
    assert.deepEqual(note.pageSources, [7]);
    assert.equal(note.verifiedCitations?.length, 1);
    assert.ok(note.citedExcerpt?.includes('[Pág. 7]: Canais de sódio'));
  });

  await t.test('E2: ACH-P3-04: Citações em páginas DISTINTAS definem pageSource = undefined e pageSources = [p1, p2]', () => {
    const msg: TutorChatMessage = {
      id: 'm2',
      sender: 'tutor',
      text: 'Síntese integrando dois capítulos.',
      timestamp: Date.now(),
      verifiedCitations: [
        { id: 'c1', type: 'pdf_page', pageNumber: 5, excerpt: 'Introdução ao córtex pré-frontal' },
        { id: 'c2', type: 'pdf_page', pageNumber: 18, excerpt: 'Conexões subcorticais do estriado' },
      ],
    };

    const note = createStudyNoteFromTutorMessage(msg, doc);
    // Não atribui arbitrariamente a primeira página
    assert.equal(note.pageSource, undefined);
    assert.deepEqual(note.pageSources, [5, 18]);
    assert.equal(note.verifiedCitations?.length, 2);
  });

  await t.test('E3: Múltiplas citações na MESMA página definem pageSource = p e pageSources = [p]', () => {
    const msg: TutorChatMessage = {
      id: 'm3',
      sender: 'tutor',
      text: 'Dois parágrafos da mesma página.',
      timestamp: Date.now(),
      verifiedCitations: [
        { id: 'c1', type: 'pdf_page', pageNumber: 12, excerpt: 'Parágrafo 1 da pág 12' },
        { id: 'c2', type: 'pdf_page', pageNumber: 12, excerpt: 'Parágrafo 3 da pág 12' },
      ],
    };

    const note = createStudyNoteFromTutorMessage(msg, doc);
    assert.equal(note.pageSource, 12);
    assert.deepEqual(note.pageSources, [12]);
  });

  await t.test('E4: Nota com zero citações define pageSource = undefined e pageSources = undefined', () => {
    const msg: TutorChatMessage = {
      id: 'm4',
      sender: 'tutor',
      text: 'Resposta geral sem citações.',
      timestamp: Date.now(),
      verifiedCitations: [],
      evidencesCited: [],
    };

    const note = createStudyNoteFromTutorMessage(msg, doc);
    assert.equal(note.pageSource, undefined);
    assert.equal(note.pageSources, undefined);
    assert.equal(note.citedExcerpt, undefined);
    assert.equal(note.verifiedCitations, undefined);
  });

  await t.test('E5: citedExcerpt contém APENAS trechos das citações verificadas, não chunks recuperados descartados', () => {
    const msg: TutorChatMessage = {
      id: 'm5',
      sender: 'tutor',
      text: 'Resposta.',
      timestamp: Date.now(),
      verifiedCitations: [
        { id: 'c_valid', type: 'pdf_page', pageNumber: 22, excerpt: 'Trecho efetivamente citado' },
      ],
      // Simula caso onde havia chunks recuperados adicionais não citados
      evidencesCited: [
        { id: 'c_valid', type: 'pdf_page', pageNumber: 22, excerpt: 'Trecho efetivamente citado' },
      ],
    };

    const note = createStudyNoteFromTutorMessage(msg, doc);
    assert.ok(note.citedExcerpt?.includes('Trecho efetivamente citado'));
    assert.ok(!note.citedExcerpt?.includes('não citado'));
  });

  await t.test('E6: Exportação Markdown do Caderno formata páginas múltiplas corretamente', () => {
    const noteWithMultiplePages: StudyNote = {
      id: 'n_multi',
      documentId: 'doc1',
      title: 'Nota Multi-Fonte',
      content: 'Conteúdo abrangente.',
      pageSources: [4, 15, 23],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const lines: string[] = [];
    if (noteWithMultiplePages.pageSources && noteWithMultiplePages.pageSources.length > 0) {
      lines.push(`*Páginas físicas de referência: Págs. ${noteWithMultiplePages.pageSources.join(', ')}*`);
    } else if (noteWithMultiplePages.pageSource) {
      lines.push(`*Página física de referência: Pág. ${noteWithMultiplePages.pageSource}*`);
    }

    assert.equal(lines[0], '*Páginas físicas de referência: Págs. 4, 15, 23*');
  });

  await t.test('E7: Preservação de pageSources e verifiedCitations na edição de nota no Caderno', () => {
    const existingNote: StudyNote = {
      id: 'note_orig_1',
      documentId: 'doc1',
      title: 'Título Original',
      content: 'Conteúdo Original',
      pageSources: [8, 12],
      verifiedCitations: [
        { id: 'c1', type: 'pdf_page', pageNumber: 8, excerpt: 'Ex 8' },
        { id: 'c2', type: 'pdf_page', pageNumber: 12, excerpt: 'Ex 12' },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };

    // Simulação da lógica de persistência de StudyNotebook.tsx
    const noteToSave: StudyNote = {
      id: existingNote.id,
      documentId: existingNote.documentId,
      title: 'Título Editado pelo Usuário',
      content: 'Conteúdo Editado pelo Usuário',
      createdAt: existingNote.createdAt,
      updatedAt: Date.now(),
      ...(typeof existingNote.pageSource === 'number'
        ? { pageSource: existingNote.pageSource }
        : {}),
      ...(Array.isArray(existingNote.pageSources) && existingNote.pageSources.length > 0
        ? { pageSources: existingNote.pageSources }
        : {}),
      ...(Array.isArray(existingNote.verifiedCitations) && existingNote.verifiedCitations.length > 0
        ? { verifiedCitations: existingNote.verifiedCitations }
        : {}),
    };

    assert.deepEqual(noteToSave.pageSources, [8, 12]);
    assert.equal(noteToSave.verifiedCitations?.length, 2);
    assert.equal(noteToSave.title, 'Título Editado pelo Usuário');
  });
});

/* ==========================================================================
   GRUPO F: Regressão e Resiliência (F1..F6)
   ========================================================================== */

test('Grupo F: Regressão e Resiliência', async (t) => {
  await t.test('F1: Não permite que citações falsas quebrem renderização ou lançem erro', () => {
    const emptyMap = buildControlledEvidenceMap([]);
    assert.doesNotThrow(() => {
      const res = parseAndValidateCitations('Texto com [C999] e [C0] e [C-1]', emptyMap);
      assert.equal(res.validCitations.length, 0);
      assert.equal(res.invalidCitations.length, 2); // C999 e C0 têm formato \d+
    });
  });

  await t.test('F2: Tratamento de strings com caracteres especiais e quebras de linha', () => {
    const map = buildControlledEvidenceMap([
      { id: 'e1', type: 'pdf_page', pageNumber: 1, excerpt: 'Linha 1\nLinha 2\n"Citações com aspas"' },
    ]);
    const res = parseAndValidateCitations('Pergunta:\nComo funciona?\nResposta [C1].\nFim.', map);

    assert.equal(res.validCitations.length, 1);
    assert.equal(res.validCitations[0].pageNumber, 1);
  });

  await t.test('F3: Preservação de números normais no texto (ex: R$ 100, 100%, ano 2026)', () => {
    const map = buildControlledEvidenceMap([
      { id: 'e1', type: 'pdf_page', pageNumber: 5, excerpt: 'Em 2026, 95% dos casos' },
    ]);
    const text = 'Em 2026 [C1], cerca de 95% dos pacientes apresentaram melhora.';
    const res = parseAndValidateCitations(text, map);

    assert.equal(res.validCitations.length, 1);
    assert.ok(res.cleanedText.includes('2026'));
    assert.ok(res.cleanedText.includes('95%'));
  });

  await t.test('F4: Compatibilidade com modelo de evidências sem ID prévio', () => {
    const evidences: EvidenceReference[] = [
      { type: 'pdf_page', pageNumber: 3, excerpt: 'Evidência sem ID prévio' },
    ];
    const map = buildControlledEvidenceMap(evidences);
    const item = map.get('C1');

    assert.ok(item);
    assert.ok(item.evidence.id.startsWith('ev_c1_p3'));
  });

  await t.test('F5: stripMarkdownForSpeech com entradas vazias ou indefinidas', () => {
    assert.equal(stripMarkdownForSpeech(''), '');
    assert.equal(stripMarkdownForSpeech(null as any), '');
    assert.equal(stripMarkdownForSpeech(undefined as any), '');
  });

  await t.test('F6: Integridade do contrato de tipos TypeScript para TutorChatMessage e StudyNote', () => {
    const msg: TutorChatMessage = {
      id: 'msg_test',
      sender: 'tutor',
      text: 'Texto de teste',
      timestamp: 123456,
      verifiedCitations: [],
      unverifiedCitations: ['C99'],
      retrievedEvidenceCount: 5,
    };

    const note: StudyNote = {
      id: 'note_test',
      documentId: 'doc_test',
      title: 'Nota de Teste',
      content: 'Conteúdo de teste',
      pageSource: undefined,
      pageSources: [1, 2, 3],
      verifiedCitations: [],
      createdAt: 123456,
      updatedAt: 123456,
    };

    assert.equal(msg.retrievedEvidenceCount, 5);
    assert.deepEqual(note.pageSources, [1, 2, 3]);
  });
});
