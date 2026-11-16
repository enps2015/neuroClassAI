/**
 * @file Corpus de Validação — Multimodal Core v1
 * Três cenários canônicos representativos para validação da compreensão documental avançada:
 *
 * Caso A — Documento Científico Multimodal (Texto, Figuras, Tabelas, Fórmulas, Gráficos)
 * Caso B — PDF Digitalizado (Páginas compostas por imagens, sem texto direto, legibilidade variável, incerteza)
 * Caso C — Documento Extenso (Múltiplos capítulos, TOC de 3 níveis, paginação original, segmentação e amostragem)
 */

import type { DocumentSource, LearningAnalysis } from '../../types';

/* ==========================================================================
   CASO A — DOCUMENTO CIENTÍFICO MULTIMODAL
   ========================================================================== */
export const CORPUS_SCENARIO_A: {
  document: DocumentSource;
  analysis: LearningAnalysis;
} = {
  document: {
    id: 'corpus_case_a_multimodal_science',
    title: 'Efeito Fotoelétrico e a Quantização da Radiação Eletromagnética',
    subject: 'Física Moderna e Fenômenos Quânticos',
    academicArea: 'Ciências Exatas e da Terra',
    bibliographicReferences: [
      'Einstein, A. (1905). Über einen die Erzeugung und Verwandlung des Lichtes betreffenden heuristischen Gesichtspunkt. Annalen der Physik, 17(6), 132-148.',
      'Millikan, R. A. (1916). A direct photoelectric determination of Planck\'s "h". Physical Review, 7(3), 355-388.',
    ],
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 512,
    mimeType: 'application/pdf',
    uploadedAt: 1731000000000,
    pageCount: 5,
    tableOfContents: [
      { title: '1. O Paradoxo da Radiação Clássica', pageNumber: 1, level: 0 },
      { title: '2. Postulado dos Fótons e Relação de Planck-Einstein', pageNumber: 2, level: 0 },
      { title: '3. Função Trabalho e Frequência Limiar', pageNumber: 3, level: 0 },
      { title: '4. Energia Cinética Máxima e Potencial de Frenagem', pageNumber: 4, level: 0 },
      { title: '5. Verificação Experimental e Determinação de h', pageNumber: 5, level: 0 },
    ],
    pages: [
      {
        pageNumber: 1,
        textContent: 'A eletrodinâmica clássica postulava que a energia da radiação luminosa distribuía-se continuamente na frente de onda. Experimentos demonstraram que a emissão de fotoelétrons ocorria instantaneamente (< 10^-9 s), contradizendo o tempo de acúmulo contínuo previsto teoricamente. A Figura 1 ilustra a câmara de vácuo com cátodo de quartzo.',
        hasVisualElements: true,
        legibility: 'hybrid',
        detectedElements: { hasFigures: true, hasTables: false, hasFormulas: false, hasCharts: false },
      },
      {
        pageNumber: 2,
        textContent: 'Einstein propôs que a energia da luz concentra-se em pacotes discretos (fótons): E = h·nu. A constante de Planck h possui valor experimental de 6,626 x 10^-34 J·s. Equação 2.1 expressa o quantum de energia.',
        hasVisualElements: true,
        legibility: 'hybrid',
        detectedElements: { hasFigures: false, hasTables: false, hasFormulas: true, hasCharts: false },
      },
      {
        pageNumber: 3,
        textContent: 'Para que ocorra a ejeção eletrônica, o fóton deve fornecer energia superior à Função Trabalho (Phi) do metal. A Tabela 1 lista as funções de trabalho para Sódio (2,28 eV), Potássio (2,25 eV) e Platina (5,65 eV). A frequência de corte é dada por nu_0 = Phi / h.',
        hasVisualElements: true,
        legibility: 'hybrid',
        detectedElements: { hasFigures: false, hasTables: true, hasFormulas: true, hasCharts: false },
      },
      {
        pageNumber: 4,
        textContent: 'A conservação de energia impõe que a energia cinética máxima dos fotoelétrons seja K_max = h·nu - Phi. Aplicando-se um potencial de frenagem V_0 tal que e·V_0 = K_max, obtém-se uma relação estritamente linear entre V_0 e a frequência nu. O Gráfico 1 ilustra esta reta, com inclinação dada por h/e e intercepto em nu_0.',
        hasVisualElements: true,
        legibility: 'hybrid',
        detectedElements: { hasFigures: false, hasTables: false, hasFormulas: true, hasCharts: true },
      },
      {
        pageNumber: 5,
        textContent: 'Medições sistemáticas de Millikan (1916) confirmaram a inclinação prevista h/e em múltiplos materiais condutores, estabelecendo a validade física irrevogável do quantum de ação h.',
        hasVisualElements: false,
        legibility: 'clean',
        detectedElements: { hasFigures: false, hasTables: false, hasFormulas: false, hasCharts: false },
      },
    ],
  },
  analysis: {
    id: 'analysis_case_a_multimodal',
    documentId: 'corpus_case_a_multimodal_science',
    domain: 'Física Quântica',
    centralTheme: 'Quantização da Luz e Evidência Experimental do Efeito Fotoelétrico',
    learningObjectives: [
      'Analisar a inconsistência da física clássica frente à emissão instantânea de fotoelétrons',
      'Dominar a equação de Einstein E = h·nu e a conservação K_max = h·nu - Phi',
      'Interpretar gráficos de potencial de frenagem vs frequência e identificar a inclinação h/e',
      'Consultar e correlacionar funções de trabalho de diferentes materiais metálicos',
    ],
    coverage: {
      mode: 'full',
      totalPages: 5,
      processedPages: [1, 2, 3, 4, 5],
      coveragePercentage: 100,
      legibilitySummary: {
        isFullyDigital: true,
        scannedPageCount: 0,
        degradedPageCount: 0,
        averageDensityCharsPerPage: 380,
        warnings: [],
      },
    },
    multimodalAssets: {
      figures: [
        {
          label: 'Figura 1',
          caption: 'Câmara de vácuo experimental com janela de quartzo e eletrodos fotossensíveis',
          pageNumber: 1,
          description: 'Esquema de tubo de quartzo com emissor de fotoelétrons e coletor polarizado',
        },
      ],
      tables: [
        {
          label: 'Tabela 1',
          caption: 'Funções de Trabalho (Phi) em Elétron-Volts para Metais Canônicos',
          pageNumber: 3,
          headers: ['Elemento', 'Símbolo', 'Função Trabalho (eV)'],
          summary: 'Sódio: 2,28 eV; Potássio: 2,25 eV; Platina: 5,65 eV',
        },
      ],
      formulas: [
        {
          label: 'Equação 2.1',
          expression: 'E = h\\nu',
          pageNumber: 2,
          meaning: 'Energia quantizada do fóton individual em função da frequência',
          isAmbiguous: false,
        },
        {
          label: 'Equação 4.1',
          expression: 'K_{max} = h\\nu - \\Phi',
          pageNumber: 4,
          meaning: 'Equação fotoelétrica de balanço energético de Einstein',
          isAmbiguous: false,
        },
        {
          label: 'Equação 4.2',
          expression: 'e V_0 = K_{max}',
          pageNumber: 4,
          meaning: 'Potencial de frenagem equivalente à energia cinética máxima',
          isAmbiguous: false,
        },
      ],
      charts: [
        {
          label: 'Gráfico 1',
          pageNumber: 4,
          chartType: 'line',
          axes: { x: 'Frequência da Radiação Incident nu (10^14 Hz)', y: 'Potencial de Frenagem V0 (Volts)' },
          trend: 'Relação linear estrita com inclinação angular equivalente à razão h/e e intercepto horizontal na frequência limiar nu0',
          isAmbiguous: false,
        },
      ],
    },
    fundamentalConcepts: [
      {
        id: 'c_foton_quanta',
        name: 'Fóton e Quantização de Energia',
        definition: 'Pacote elementar e localizado de radiação eletromagnética cuja energia é proporcional à frequência da onda (E = h·nu).',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_a_p2',
            type: 'pdf_page',
            pageNumber: 2,
            excerpt: 'Einstein propôs que a energia da luz concentra-se em pacotes discretos (fótons): E = h·nu.',
          },
          {
            id: 'ev_a_form_1',
            type: 'formula',
            formulaExpression: 'E = h\\nu',
            formulaLabel: 'Equação 2.1',
            pageNumber: 2,
            excerpt: 'E = h·nu onde h é a constante de Planck (6,626 x 10^-34 J·s).',
            isAmbiguous: false,
          },
        ],
        prerequisiteConceptIds: [],
        diagnosticState: 'understood',
      },
      {
        id: 'c_funcao_trabalho_phi',
        name: 'Função Trabalho (Phi)',
        definition: 'Energia eletrostática mínima necessária para remover um elétron do nível de Fermi de um condutor metálico.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_a_p3',
            type: 'pdf_page',
            pageNumber: 3,
            excerpt: 'Para que ocorra a ejeção eletrônica, o fóton deve fornecer energia superior à Função Trabalho (Phi) do metal.',
          },
          {
            id: 'ev_a_tab_1',
            type: 'table',
            tableLabel: 'Tabela 1',
            pageNumber: 3,
            rowHeader: 'Funções de Trabalho',
            columnHeader: 'eV',
            excerpt: 'Sódio (2,28 eV), Potássio (2,25 eV) e Platina (5,65 eV).',
          },
        ],
        prerequisiteConceptIds: ['c_foton_quanta'],
        diagnosticState: 'unassessed',
      },
      {
        id: 'c_potencial_frenagem_grafico',
        name: 'Potencial de Frenagem e Relação Linear',
        definition: 'Diferença de potencial reversa aplicada para extinguir a corrente de fotoelétrons, proporcional à energia cinética máxima.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_a_p4',
            type: 'pdf_page',
            pageNumber: 4,
            excerpt: 'Aplicando-se um potencial de frenagem V_0 tal que e·V_0 = K_max, obtém-se uma relação estritamente linear.',
          },
          {
            id: 'ev_a_chart_1',
            type: 'chart',
            chartLabel: 'Gráfico 1',
            pageNumber: 4,
            chartType: 'line',
            xAxisLabel: 'Frequência nu (Hz)',
            yAxisLabel: 'Potencial de Frenagem V0 (V)',
            observedTrend: 'Reta linear com inclinação h/e',
            excerpt: 'Gráfico linear de V0 vs frequência com inclinação h/e e frequência limiar nu0.',
            isAmbiguous: false,
          },
        ],
        prerequisiteConceptIds: ['c_funcao_trabalho_phi'],
        diagnosticState: 'unassessed',
      },
    ],
    complementaryConcepts: [],
    relationships: [
      {
        id: 'rel_a_1',
        sourceConceptId: 'c_foton_quanta',
        targetConceptId: 'c_funcao_trabalho_phi',
        relationType: 'causes',
        description: 'A energia individual do fóton determina se o limiar da função trabalho será superado.',
        internalModelConfidence: 0.98,
        isModelInference: false,
        epistemicStatus: 'explicitly_documented',
        evidences: [
          {
            id: 'ev_rel_a_1',
            type: 'pdf_page',
            pageNumber: 3,
            excerpt: 'Se a energia do fóton for menor que a função trabalho, nenhum fotoelétron é ejetado.',
          },
        ],
      },
    ],
    prerequisiteGraph: {
      nodes: [
        { id: 'c_foton_quanta', name: 'Fóton e Quantização de Energia', isPrerequisite: false },
        { id: 'c_funcao_trabalho_phi', name: 'Função Trabalho (Phi)', isPrerequisite: true },
        { id: 'c_potencial_frenagem_grafico', name: 'Potencial de Frenagem e Relação Linear', isPrerequisite: true },
      ],
      edges: [
        { from: 'c_foton_quanta', to: 'c_funcao_trabalho_phi', label: 'pré-requisito', relationType: 'precedes' },
        { from: 'c_funcao_trabalho_phi', to: 'c_potencial_frenagem_grafico', label: 'pré-requisito', relationType: 'precedes' },
      ],
    },
    identifiedGaps: [],
    suggestedDiagramType: 'process-flow',
    analyzedAt: 1731000000000,
  },
};

/* ==========================================================================
   CASO B — PDF DIGITALIZADO (SCANNED PDF COM PRESERVAÇÃO DE INCERTEZA)
   ========================================================================== */
export const CORPUS_SCENARIO_B: {
  document: DocumentSource;
  analysis: LearningAnalysis;
} = {
  document: {
    id: 'corpus_case_b_scanned_historical',
    title: 'Textura del Sistema Nervioso del Hombre y de los Vertebrados (Arquivo Histórico Digitalizado)',
    subject: 'Neuroanatomia Comparada e Doutrina Neuronal',
    academicArea: 'Ciências Biológicas e Saúde',
    bibliographicReferences: [
      'Ramón y Cajal, S. (1899). Textura del Sistema Nervioso del Hombre y de los Vertebrados. Imprenta y Librería de Nicolás Moya, Madrid.',
    ],
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 1024 * 2, // 2MB
    mimeType: 'application/pdf',
    uploadedAt: 1731000100000,
    pageCount: 3,
    tableOfContents: [
      { title: 'Lámina I: Neuronas piramidales de la corteza cerebral', pageNumber: 1, level: 0 },
      { title: 'Lámina II: Terminaciones perissomáticas y colaterales axonales', pageNumber: 2, level: 0 },
      { title: 'Lámina III: Fibras trepadoras del cerebelo y células de Purkinje', pageNumber: 3, level: 0 },
    ],
    pages: [
      {
        pageNumber: 1,
        textContent: '', // Página 100% digitalizada sem texto OCR
        hasVisualElements: true,
        isScanned: true,
        legibility: 'scanned_image',
      },
      {
        pageNumber: 2,
        textContent: 'Fig. 14. Corteza cerebral.', // OCR residual mínimo
        hasVisualElements: true,
        isScanned: true,
        legibility: 'scanned_image',
      },
      {
        pageNumber: 3,
        textContent: '', // Digitalização com oxidação e baixa legibilidade
        hasVisualElements: true,
        isScanned: true,
        legibility: 'degraded',
      },
    ],
  },
  analysis: {
    id: 'analysis_case_b_scanned',
    documentId: 'corpus_case_b_scanned_historical',
    domain: 'Neuroanatomia Histórica',
    centralTheme: 'Evidência Morfológica da Individualidade Celular dos Neurônios (Doutrina Neuronal)',
    learningObjectives: [
      'Identificar o princípio da individualidade neuronal em micrografias desenhadas à mão',
      'Distinguir prolongamentos protoplasmáticos (dendritos) de cilindros-eixo (axônios)',
      'Reconhecer limitações visuais de impregnação argêntica (método de Golgi) e preservar incertezas',
    ],
    coverage: {
      mode: 'scanned_multimodal',
      totalPages: 3,
      processedPages: [1, 2, 3],
      coveragePercentage: 100,
      legibilitySummary: {
        isFullyDigital: false,
        scannedPageCount: 3,
        degradedPageCount: 1,
        averageDensityCharsPerPage: 9,
        warnings: [
          'Documento digitalizado: 3 páginas sem camada textual nativa foram processadas por visão multimodal de IA.',
          'Página 3 apresenta degradação visual decorrente de granulação histórica no manuscrito.',
        ],
      },
    },
    multimodalAssets: {
      figures: [
        {
          label: 'Lámina I',
          caption: 'Desenho microscópico de neurônios piramidais impregnados por nitrato de prata',
          pageNumber: 1,
          description: 'Morfologia detalhada de corpos celulares piramidais com espinhos dendríticos visíveis',
        },
        {
          label: 'Lámina III',
          caption: 'Complexo dendrítico de célula de Purkinje no córtex cerebelar',
          pageNumber: 3,
          description: 'Arborização dendrítica com manchas de oxidação no canto inferior direito',
        },
      ],
      tables: [],
      formulas: [],
      charts: [],
    },
    fundamentalConcepts: [
      {
        id: 'c_individualidade_neuronal',
        name: 'Individualidade Neuronal (Doutrina Neuronal)',
        definition: 'Princípio neurobiológico de que o sistema nervoso é formado por unidades celulares morfologicamente e geneticamente independentes em contiguidade, refutando a teoria reticular contínua.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_b_fig_1',
            type: 'figure',
            figureLabel: 'Lámina I',
            pageNumber: 1,
            excerpt: 'Visualização nítida de terminações axônicas livres terminando sobre o pericário sem continuidade sincicial protoplasmática contínua.',
          },
        ],
        prerequisiteConceptIds: [],
        diagnosticState: 'understood',
      },
      {
        id: 'c_espinhos_dendriticos',
        name: 'Espinhos Dendríticos',
        definition: 'Pequenas protuberâncias membranosas que se projetam dos ramos dendríticos, identificadas como locais receptivos preferenciais para contatos sinápticos.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_b_fig_2',
            type: 'figure',
            figureLabel: 'Lámina II',
            pageNumber: 2,
            excerpt: 'Espículas laterais salientes ao longo de toda a haste dendrítica apical dos neurônios piramidais.',
          },
          {
            id: 'ev_b_ambiguous_note',
            type: 'pdf_page',
            pageNumber: 3,
            excerpt: 'Conexão exata entre fibras trepadoras e espinhos terminais na região inferior da lâmina.',
            isAmbiguous: true,
            ambiguityReason: 'Oxidação da emulsão fotográfica e sobreposição de cristais de prata impossibilitam determinar a trajetória contínua da fibra.',
          } as any,
        ],
        prerequisiteConceptIds: ['c_individualidade_neuronal'],
        diagnosticState: 'unassessed',
      },
    ],
    complementaryConcepts: [],
    relationships: [],
    prerequisiteGraph: {
      nodes: [
        { id: 'c_individualidade_neuronal', name: 'Individualidade Neuronal', isPrerequisite: false },
        { id: 'c_espinhos_dendriticos', name: 'Espinhos Dendríticos', isPrerequisite: true },
      ],
      edges: [
        { from: 'c_individualidade_neuronal', to: 'c_espinhos_dendriticos', label: 'pré-requisito', relationType: 'precedes' },
      ],
    },
    identifiedGaps: [
      'Trajetória contínua das fibras trepadoras na página 3 permanece inconclusiva devido à degradação material.',
    ],
    suggestedDiagramType: 'hierarchy',
    analyzedAt: 1731000100000,
  },
};

/* ==========================================================================
   CASO C — DOCUMENTO EXTENSO (MÚLTIPLOS CAPÍTULOS, TOC E AMOSTRAGEM TRANSPARENTE)
   ========================================================================== */
export const CORPUS_SCENARIO_C: {
  document: DocumentSource;
  analysis: LearningAnalysis;
} = {
  document: {
    id: 'corpus_case_c_extensive_treatise',
    title: 'Comportamento Administrativo: Um Estudo dos Processos Decisórios nas Organizações',
    subject: 'Teoria da Decisão e Ciência da Administração',
    academicArea: 'Administração e Economia',
    bibliographicReferences: [
      'Simon, H. A. (1947). Administrative Behavior: A Study of Decision-Making Processes in Administrative Organization. Macmillan.',
    ],
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 1024 * 1024 * 12, // 12MB
    mimeType: 'application/pdf',
    uploadedAt: 1731000200000,
    pageCount: 120,
    tableOfContents: [
      {
        title: 'PARTE I: TOMADA DE DECISÃO E ORGANIZAÇÃO ADMINISTRATIVA',
        pageNumber: 1,
        level: 0,
        subItems: [
          { title: 'Capítulo 1: Tomada de Decisão e Estrutura Administrativa', pageNumber: 5, level: 1 },
          { title: 'Capítulo 2: Alguns Provérbios da Administração e Crítica à Teoria Clássica', pageNumber: 26, level: 1 },
        ],
      },
      {
        title: 'PARTE II: LIMITES PSICOLÓGICOS DA RACIONALIDADE',
        pageNumber: 53,
        level: 0,
        subItems: [
          { title: 'Capítulo 3: Fato e Valor na Tomada de Decisão', pageNumber: 55, level: 1 },
          { title: 'Capítulo 4: Racionalidade no Comportamento Administrativo', pageNumber: 74, level: 1 },
          { title: 'Capítulo 5: A Psicologia das Decisões Administrativas e o Satisficing', pageNumber: 98, level: 1 },
        ],
      },
    ],
    pages: Array.from({ length: 120 }, (_, idx) => {
      const pageNum = idx + 1;
      return {
        pageNumber: pageNum,
        textContent: `Página ${pageNum}: Texto acadêmico do tratado de Herbert A. Simon sobre limites da decisão racional, divisão de trabalho e coordenação organizacional nas instituições.`,
        hasVisualElements: pageNum % 15 === 0,
        legibility: 'clean',
        detectedElements: {
          hasFigures: pageNum % 15 === 0,
          hasTables: pageNum % 20 === 0,
          hasFormulas: false,
          hasCharts: false,
        },
      };
    }),
  },
  analysis: {
    id: 'analysis_case_c_extensive',
    documentId: 'corpus_case_c_extensive_treatise',
    domain: 'Teoria da Decisão',
    centralTheme: 'Arquitetura Cognitiva das Decisões Organizacionais e Racionalidade Limitada',
    learningObjectives: [
      'Compreender a crítica metodológica de Simon aos provérbios da administração clássica',
      'Distinguir premissas de fato de premissas de valor no processo de escolha gerencial',
      'Analisar a transição da maximização neoclássica para o modelo heurístico do satisficing',
      'Mapear como a estrutura formal delimita a atenção e absorve a incerteza dos tomadores de decisão',
    ],
    coverage: {
      mode: 'sampled',
      totalPages: 120,
      processedPages: [1, 4, 8, 12, 16, 20, 26, 30, 40, 50, 55, 60, 74, 80, 98, 110, 120],
      sampledPages: [1, 4, 8, 12, 16, 20, 26, 30, 40, 50, 55, 60, 74, 80, 98, 110, 120],
      unprocessedPages: Array.from({ length: 120 }, (_, i) => i + 1).filter(
        p => ![1, 4, 8, 12, 16, 20, 26, 30, 40, 50, 55, 60, 74, 80, 98, 110, 120].includes(p)
      ),
      coveragePercentage: 14,
      legibilitySummary: {
        isFullyDigital: true,
        scannedPageCount: 0,
        degradedPageCount: 0,
        averageDensityCharsPerPage: 1100,
        warnings: [
          'Documento extenso (120 páginas): processado por amostragem distribuída homogênea cobrindo 17 páginas-chave (14% do tratado).',
          'Para análise aprofundada de seções específicas, utilize a seleção por capítulo no menu de importação.',
        ],
      },
    },
    multimodalAssets: {
      figures: [
        {
          label: 'Diagrama 2.1',
          caption: 'Canais de comunicação formal e pontos de absorção de incerteza',
          pageNumber: 30,
          description: 'Fluxo de transmissão hierárquica demonstrando filtro seletivo de informação',
        },
      ],
      tables: [
        {
          label: 'Tabela 5.1',
          caption: 'Comparação Axiomática: Maximização Neoclássica vs Satisficing Comportamental',
          pageNumber: 105,
          headers: ['Dimensão', 'Modelo Neoclássico', 'Modelo de Simon (Satisficing)'],
          summary: 'Informação: Completa vs Custo de busca; Critério: Ótimo global vs Limiar de aspiração',
        },
      ],
      formulas: [],
      charts: [],
    },
    fundamentalConcepts: [
      {
        id: 'c_racionalidade_limitada_simon',
        name: 'Racionalidade Limitada (Bounded Rationality)',
        definition: 'Postulado epistemológico de que a capacidade humana de formular e resolver problemas complexos é limitada pela capacidade neuropsicológica de processamento e pelo custo de obtenção de informação.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_c_p74',
            type: 'pdf_page',
            pageNumber: 74,
            excerpt: 'A capacidade da mente humana para formular e resolver problemas complexos é diminuta em comparação com o tamanho dos problemas cuja solução é requerida.',
          },
        ],
        prerequisiteConceptIds: [],
        diagnosticState: 'understood',
      },
      {
        id: 'c_principio_satisficing',
        name: 'Princípio do Satisficing',
        definition: 'Estratégia de tomada de decisão que substitui a busca pelo ótimo absoluto pela seleção da primeira alternativa que atinja ou supere um nível de aspiração aceitável.',
        importance: 'fundamental',
        epistemicStatus: 'explicitly_documented',
        evidenceReferences: [
          {
            id: 'ev_c_p98',
            type: 'pdf_page',
            pageNumber: 98,
            excerpt: 'Os agentes reais operam por satisfação (satisficing): buscam até encontrar uma alternativa suficientemente boa.',
          },
          {
            id: 'ev_c_tab_5_1',
            type: 'table',
            tableLabel: 'Tabela 5.1',
            pageNumber: 105,
            rowHeader: 'Critério Decisório',
            excerpt: 'Comparação de limiares de aspiração contra busca exaustiva impossível.',
          },
        ],
        prerequisiteConceptIds: ['c_racionalidade_limitada_simon'],
        diagnosticState: 'unassessed',
      },
    ],
    complementaryConcepts: [],
    relationships: [
      {
        id: 'rel_c_1',
        sourceConceptId: 'c_racionalidade_limitada_simon',
        targetConceptId: 'c_principio_satisficing',
        relationType: 'causes',
        description: 'Os limites cognitivos e o custo de informação forçam a adoção do satisficing como mecanismo adaptativo viável.',
        internalModelConfidence: 0.99,
        isModelInference: false,
        epistemicStatus: 'explicitly_documented',
        evidences: [
          {
            id: 'ev_rel_c_1',
            type: 'pdf_page',
            pageNumber: 99,
            excerpt: 'Porque a otimização exige computação infinita de probabilidades, o satisficing torna-se a única conduta executável.',
          },
        ],
      },
    ],
    prerequisiteGraph: {
      nodes: [
        { id: 'c_racionalidade_limitada_simon', name: 'Racionalidade Limitada', isPrerequisite: false },
        { id: 'c_principio_satisficing', name: 'Princípio do Satisficing', isPrerequisite: true },
      ],
      edges: [
        { from: 'c_racionalidade_limitada_simon', to: 'c_principio_satisficing', label: 'pré-requisito', relationType: 'precedes' },
      ],
    },
    identifiedGaps: [
      'Amostragem cobriu 14% das páginas. Análises de detalhe dos capítulos 1 e 3 devem ser realizadas sob demanda.',
    ],
    suggestedDiagramType: 'comparative',
    analyzedAt: 1731000200000,
  },
};

