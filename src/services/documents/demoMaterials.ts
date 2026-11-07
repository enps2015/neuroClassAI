import type { DocumentSource, LearningAnalysis } from '../../types';

/**
 * Catálogo Imutável de Materiais de Demonstração Científica.
 * NOTA DE INTEGRIDADE EPISTEMOLÓGICA:
 * Estes materiais são demonstrações pedagógicas internas curadas para teste da plataforma,
 * NÃO devendo ser interpretados como artigos científicos externos avulsos.
 * Ficam 100% isolados do armazenamento IndexedDB pessoal do estudante.
 */
export const DEMO_MATERIALS: Array<{
  document: DocumentSource;
  analysis: LearningAnalysis;
}> = [
  {
    document: {
      id: 'demo_neurobiology_synapse',
      title: 'Transmissão Sináptica e Plasticidade Neuronal',
      subject: 'Neurociência e Fisiologia Celular',
      type: 'pdf',
      isDemoMaterial: true,
      sizeBytes: 1024 * 450,
      mimeType: 'application/pdf',
      uploadedAt: 1730000000000,
      pageCount: 6,
      tableOfContents: [
        { title: '1. O Potencial de Ação Pré-Sináptico', pageNumber: 1, level: 0 },
        { title: '2. Influxo de Íons Ca2+ e Fusão Vesicular', pageNumber: 2, level: 0 },
        { title: '3. Dinâmica na Fenda Sináptica e Receptores', pageNumber: 3, level: 0 },
        { title: '4. Potenciais Pós-Sinápticos (PEPS e PIPS)', pageNumber: 4, level: 0 },
        { title: '5. Mecanismos de Recaptação e Degradação', pageNumber: 5, level: 0 },
        { title: '6. Potenciação de Longa Duração (LTP)', pageNumber: 6, level: 0 },
      ],
      pages: [
        {
          pageNumber: 1,
          textContent: 'O impulso nervoso propaga-se ao longo do axônio até atingir o terminal pré-sináptico. A alteração na voltagem de membrana despolariza o botão terminal sináptico, ativando canais de cálcio dependentes de voltagem (Cav).',
          hasVisualElements: true,
        },
        {
          pageNumber: 2,
          textContent: 'A abertura dos canais de cálcio permite um rápido influxo de íons Ca2+ devido ao alto gradiente eletroquímico transmembrana. O cálcio citoplasmático interage com a sinaptotagmina, disparando o complexo SNARE (sintaxina, SNAP-25 e sinaptobrevina) para promover a fusão da membrana vesicular com a membrana plasmática e exocitose do neurotransmissor.',
          hasVisualElements: true,
        },
        {
          pageNumber: 3,
          textContent: 'Os neurotransmissores liberados difundem-se através da fenda sináptica (com largura média de 20 a 40 nm) e ligam-se a receptores específicos na membrana pós-sináptica. Receptores ionotrópicos promovem influxo iônico rápido e direto, enquanto receptores metabotrópicos acoplados à proteína G induzem cascatas de sinalização intracelular secundárias.',
          hasVisualElements: true,
        },
        {
          pageNumber: 4,
          textContent: 'A abertura de canais de sódio e cálcio induz despolarização local denominada Potencial Excitatório Pós-Sináptico (PEPS). Em contrapartida, a abertura de canais de cloreto ou potássio induz hiperpolarização denominada Potencial Inibitório Pós-Sináptico (PIPS).',
          hasVisualElements: true,
        },
        {
          pageNumber: 5,
          textContent: 'A ação do neurotransmissor é finalizada por recaptação através de transportadores de membrana (como DAT, NET e SERT), degradação enzimática na fenda (ex: acetilcolinesterase) ou difusão passiva glial.',
          hasVisualElements: false,
        },
        {
          pageNumber: 6,
          textContent: 'A estimulação repetida de alta frequência em sinapses glutamatérgicas induz o fenômeno de Potenciação de Longa Duração (LTP). Receptores NMDA, bloqueados por Mg2+ em repouso, são ativados com forte despolarização, permitindo influxo de Ca2+ e consequente inserção de novos receptores AMPA.',
          hasVisualElements: true,
        },
      ],
    },
    analysis: {
      id: 'analysis_demo_neurobiology',
      documentId: 'demo_neurobiology_synapse',
      domain: 'Neurofisiologia',
      centralTheme: 'Mecanismos Bioquímicos e Elétricos da Comunicação Sináptica Química',
      learningObjectives: [
        'Compreender o papel do gradiente de Ca2+ e das proteínas SNARE na exocitose',
        'Distinguir a sinalização pós-sináptica ionotrópica da metabotrópica',
        'Analisar a integração sináptica de potenciais excitatórios e inibitórios (PEPS vs PIPS)',
        'Mapear a transição da sinapse para plasticidade neuronal duradoura (LTP)',
      ],
      fundamentalConcepts: [
        {
          id: 'c_potencial_acao',
          name: 'Potencial de Ação Pré-Sináptico',
          definition: 'Onda transitória de despolarização de membrana axônica que atinge o botão terminal para deflagrar a sinalização.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c1_p1',
              type: 'pdf_page',
              pageNumber: 1,
              excerpt: 'O impulso nervoso propaga-se ao longo do axônio até atingir o terminal pré-sináptico. A alteração na voltagem de membrana despolariza o botão terminal sináptico.',
            },
          ],
          prerequisiteConceptIds: [],
          diagnosticState: 'understood',
        },
        {
          id: 'c_influxo_ca',
          name: 'Influxo de Ca2+ Dependentes de Voltagem',
          definition: 'Entrada eletroquímica massiva de cálcio induzida pela abertura dos canais Cav na zona ativa.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c2_p2',
              type: 'pdf_page',
              pageNumber: 2,
              excerpt: 'A abertura dos canais de cálcio permite um rápido influxo de íons Ca2+ devido ao alto gradiente eletroquímico transmembrana.',
            },
            {
              id: 'ev_c2_fig',
              type: 'figure',
              figureLabel: 'Figura 2.1 — Canais de Cálcio Dependentes de Voltagem',
              pageNumber: 2,
              excerpt: 'Representação da transição conformacional do poro do canal Cav após despolarização.',
            },
          ],
          prerequisiteConceptIds: ['c_potencial_acao'],
          diagnosticQuestions: [
            {
              id: 'diag_ca_1',
              question: 'Por que o cálcio entra tão rapidamente na célula quando os canais Cav se abrem?',
              targetedPrerequisiteId: 'c_potencial_acao',
              expectedEvidence: 'Menção à concentração extracelular de Ca2+ muito superior e interior celular negativo.',
            },
          ],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_complexo_snare',
          name: 'Complexo SNARE e Fusão Vesicular',
          definition: 'Maquinaria molecular proteica (sintaxina, SNAP-25 e sinaptobrevina) que catalisa a fusão de membranas guiada pela sinaptotagmina.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c3_p2',
              type: 'pdf_page',
              pageNumber: 2,
              excerpt: 'O cálcio citoplasmático interage com a sinaptotagmina, disparando o complexo SNARE para promover a fusão da membrana vesicular com a membrana plasmática.',
            },
          ],
          prerequisiteConceptIds: ['c_influxo_ca'],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_fenda_receptores',
          name: 'Receptores Ionotrópicos vs Metabotrópicos',
          definition: 'Proteínas de membrana pós-sinápticas que traduzem a ligação do ligante em alteração iônica direta ou cascatas metabólicas.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c4_p3',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Receptores ionotrópicos promovem influxo iônico rápido e direto, enquanto receptores metabotrópicos acoplados à proteína G induzem cascatas de sinalização.',
            },
          ],
          prerequisiteConceptIds: ['c_complexo_snare'],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_ltp',
          name: 'Potenciação de Longa Duração (LTP)',
          definition: 'Fortalecimento duradouro da transmissão sináptica dependente da ativação de receptores NMDA e recrutamento de AMPA.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c5_p6',
              type: 'pdf_page',
              pageNumber: 6,
              excerpt: 'A estimulação repetida de alta frequência em sinapses glutamatérgicas induz o fenômeno de Potenciação de Longa Duração (LTP).',
            },
          ],
          prerequisiteConceptIds: ['c_fenda_receptores'],
          diagnosticState: 'unassessed',
        },
      ],
      complementaryConcepts: [
        {
          id: 'c_peps_pips',
          name: 'Integração PEPS / PIPS',
          definition: 'Somação espacial e temporal de potenciais pós-sinápticos que determina a geração de novos disparos no axônio do neurônio pós-sináptico.',
          importance: 'complementary',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c6_p4',
              type: 'pdf_page',
              pageNumber: 4,
              excerpt: 'A abertura de canais de sódio induz PEPS; em contrapartida, canais de cloreto induzem hiperpolarização denominada PIPS.',
            },
          ],
          prerequisiteConceptIds: ['c_fenda_receptores'],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_recaptacao',
          name: 'Cessação e Recaptação de Neurotransmissores',
          definition: 'Mecanismos de remoção do transmissor da fenda por difusão, transportadores de recaptação ou enzimas catabólicas.',
          importance: 'complementary',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_c7_p5',
              type: 'pdf_page',
              pageNumber: 5,
              excerpt: 'A ação do neurotransmissor é finalizada por recaptação através de transportadores de membrana ou degradação enzimática na fenda.',
            },
          ],
          prerequisiteConceptIds: ['c_fenda_receptores'],
          diagnosticState: 'unassessed',
        },
      ],
      relationships: [
        {
          id: 'rel_1',
          sourceConceptId: 'c_potencial_acao',
          targetConceptId: 'c_influxo_ca',
          relationType: 'causes',
          description: 'A despolarização de membrana provoca abertura direta dos canais Cav dependentes de voltagem.',
          evidences: [
            {
              id: 'ev_rel1',
              type: 'pdf_page',
              pageNumber: 1,
              excerpt: 'A alteração na voltagem de membrana despolariza o botão terminal sináptico, ativando canais de cálcio dependentes de voltagem.',
            },
          ],
          internalModelConfidence: 0.98,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_2',
          sourceConceptId: 'c_influxo_ca',
          targetConceptId: 'c_complexo_snare',
          relationType: 'regulates',
          description: 'O Ca2+ citoplasmático liga-se à sinaptotagmina, desimpedindo o zíper molecular do complexo SNARE.',
          evidences: [
            {
              id: 'ev_rel2',
              type: 'pdf_page',
              pageNumber: 2,
              excerpt: 'O cálcio citoplasmático interage com a sinaptotagmina, disparando o complexo SNARE.',
            },
          ],
          internalModelConfidence: 0.96,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_3',
          sourceConceptId: 'c_complexo_snare',
          targetConceptId: 'c_fenda_receptores',
          relationType: 'causes',
          description: 'A fusão vesicular descarrega neurotransmissores na fenda sináptica para interagir com receptores pós-sinápticos.',
          evidences: [
            {
              id: 'ev_rel3',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Os neurotransmissores liberados difundem-se através da fenda sináptica e ligam-se a receptores específicos.',
            },
          ],
          internalModelConfidence: 0.95,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_4',
          sourceConceptId: 'c_fenda_receptores',
          targetConceptId: 'c_peps_pips',
          relationType: 'regulates',
          description: 'Receptores permeáveis a cátions geram PEPS excitatórios, enquanto permeáveis a ânions geram PIPS inibitórios.',
          evidences: [
            {
              id: 'ev_rel4',
              type: 'pdf_page',
              pageNumber: 4,
              excerpt: 'Abertura de canais de sódio induz PEPS; em contrapartida, cloreto ou potássio induzem hiperpolarização (PIPS).',
            },
          ],
          internalModelConfidence: 0.94,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_5',
          sourceConceptId: 'c_fenda_receptores',
          targetConceptId: 'c_ltp',
          relationType: 'precedes',
          description: 'A ativação continuada de receptores glutamatérgicos pós-sinápticos é condição necessária para a indução de LTP.',
          evidences: [
            {
              id: 'ev_rel5',
              type: 'pdf_page',
              pageNumber: 6,
              excerpt: 'Estimulação repetida de alta frequência em sinapses glutamatérgicas induz o fenômeno de Potenciação de Longa Duração (LTP).',
            },
          ],
          internalModelConfidence: 0.92,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
      ],
      prerequisiteGraph: {
        nodes: [
          { id: 'c_potencial_acao', name: 'Potencial de Ação', isPrerequisite: true },
          { id: 'c_influxo_ca', name: 'Influxo de Ca2+', isPrerequisite: true },
          { id: 'c_complexo_snare', name: 'Complexo SNARE', isPrerequisite: true },
          { id: 'c_fenda_receptores', name: 'Receptores Pós-Sinápticos', isPrerequisite: true },
          { id: 'c_ltp', name: 'Potenciação Longa Duração (LTP)', isPrerequisite: false },
          { id: 'c_peps_pips', name: 'Integração PEPS/PIPS', isPrerequisite: false },
        ],
        edges: [
          { from: 'c_potencial_acao', to: 'c_influxo_ca', label: 'despolariza', relationType: 'causes' },
          { from: 'c_influxo_ca', to: 'c_complexo_snare', label: 'ativa fusão', relationType: 'regulates' },
          { from: 'c_complexo_snare', to: 'c_fenda_receptores', label: 'libera ligantes', relationType: 'causes' },
          { from: 'c_fenda_receptores', to: 'c_ltp', label: 'estimulação repetida', relationType: 'precedes' },
          { from: 'c_fenda_receptores', to: 'c_peps_pips', label: 'determina voltagem', relationType: 'regulates' },
        ],
      },
      identifiedGaps: [
        'O documento não detalha as isoformas moleculares específicas dos receptores metabotrópicos mGluR.',
      ],
      suggestedDiagramType: 'process-flow',
      analyzedAt: 1730000010000,
    },
  },
  {
    document: {
      id: 'demo_quantum_photoelectric',
      title: 'Efeito Fotoelétrico e a Quantização da Radiação',
      subject: 'Física Moderna e Quântica',
      type: 'pdf',
      isDemoMaterial: true,
      sizeBytes: 1024 * 380,
      mimeType: 'application/pdf',
      uploadedAt: 1730000100000,
      pageCount: 5,
      tableOfContents: [
        { title: '1. O Paradoxo da Teoria Ondulatória Clássica', pageNumber: 1, level: 0 },
        { title: '2. Postulado dos Fótons de Einstein (1905)', pageNumber: 2, level: 0 },
        { title: '3. Frequência de Corte e Função Trabalho', pageNumber: 3, level: 0 },
        { title: '4. Energia Cinética Máxima e Potencial de Frenagem', pageNumber: 4, level: 0 },
        { title: '5. Implicações para a Teoria Quântica', pageNumber: 5, level: 0 },
      ],
      pages: [
        {
          pageNumber: 1,
          textContent: 'Experimentos no final do século XIX demonstraram que luz ultravioleta incidindo sobre placas metálicas provocava a emissão de elétrons (fotoelétrons). Contudo, a eletrodinâmica clássica de Maxwell previa que o aumento da intensidade da onda aumentaria a energia cinética dos elétrons e que haveria atraso temporal na emissão sob intensidades muito baixas, o que foi experimentalmente refutado.',
          hasVisualElements: true,
        },
        {
          pageNumber: 2,
          textContent: 'Albert Einstein propôs que a radiação eletromagnética é absorvida em pacotes discretos indivisíveis denominados fótons, cada um com energia quantizada proporcional à frequência da onda: E = h·f, onde h é a constante de Planck (6,626 x 10^-34 J·s).',
          hasVisualElements: true,
        },
        {
          pageNumber: 3,
          textContent: 'Cada elétron está ligado ao metal por uma barreira de potencial mínima denominada Função Trabalho (Phi ou W). Se a energia do fóton (h·f) for menor que a função trabalho, nenhum fotoelétron é ejetado, independentemente da intensidade luminosa. Isso define a frequência de corte: f0 = Phi / h.',
          hasVisualElements: true,
        },
        {
          pageNumber: 4,
          textContent: 'A equação de Einstein para o balanço de energia do efeito fotoelétrico é dada por: Kmax = h·f - Phi. A energia cinética máxima (Kmax) pode ser medida aplicando-se uma diferença de potencial inversa (potencial de corte ou frenagem, V0) tal que Kmax = e·V0.',
          hasVisualElements: true,
        },
        {
          pageNumber: 5,
          textContent: 'A linearidade estrita observada entre o potencial de corte V0 e a frequência da luz f confirmou experimentalmente a constante de Planck com alta precisão (trabalhos de Robert Millikan em 1916), consolidando a dualidade onda-partícula da radiação eletromagnética.',
          hasVisualElements: false,
        },
      ],
    },
    analysis: {
      id: 'analysis_demo_quantum',
      documentId: 'demo_quantum_photoelectric',
      domain: 'Física Quântica',
      centralTheme: 'Quantização da Luz e Evidência Experimental do Efeito Fotoelétrico',
      learningObjectives: [
        'Compreender o colapso da teoria clássica de ondas de luz diante do efeito fotoelétrico',
        'Dominar a equação de Einstein E = h·f e o conceito de fóton como quanta de energia',
        'Calcular a frequência de corte e função trabalho em diferentes metais condutores',
        'Relacionar o potencial de corte (V0) com a energia cinética máxima (Kmax)',
      ],
      fundamentalConcepts: [
        {
          id: 'c_foton',
          name: 'Fóton e Quantização de Energia',
          definition: 'Pacote elementar e localizado de radiação eletromagnética com energia proporcional à sua frequência (E = h·f).',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_q1_p2',
              type: 'pdf_page',
              pageNumber: 2,
              excerpt: 'Albert Einstein propôs que a radiação eletromagnética é absorvida em pacotes discretos indivisíveis denominados fótons, com energia E = h·f.',
            },
          ],
          prerequisiteConceptIds: [],
          diagnosticState: 'understood',
        },
        {
          id: 'c_funcao_trabalho',
          name: 'Função Trabalho (Phi)',
          definition: 'Energia mínima requerida para arrancar um elétron da superfície de determinado metal condutor.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_q2_p3',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Cada elétron está ligado ao metal por uma barreira de potencial mínima denominada Função Trabalho (Phi).',
            },
          ],
          prerequisiteConceptIds: ['c_foton'],
          diagnosticQuestions: [
            {
              id: 'diag_q_1',
              question: 'Se aumentarmos a intensidade de uma luz que está abaixo da frequência de corte, o que acontece com a emissão de fotoelétrons?',
              targetedPrerequisiteId: 'c_foton',
              expectedEvidence: 'Nenhum elétron é ejetado porque a emissão depende da energia por fóton individual, não da taxa total de fótons.',
            },
          ],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_frequencia_corte',
          name: 'Frequência de Corte (f0)',
          definition: 'Frequência mínima abaixo da qual nenhum elétron consegue superar a função trabalho do metal.',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_q3_p3',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Se a energia do fóton for menor que a função trabalho, nenhum fotoelétron é ejetado. Isso define a frequência de corte: f0 = Phi / h.',
            },
          ],
          prerequisiteConceptIds: ['c_funcao_trabalho'],
          diagnosticState: 'unassessed',
        },
        {
          id: 'c_energia_cinetica',
          name: 'Energia Cinética Máxima (Kmax)',
          definition: 'Excedente de energia do fóton convertido em movimento do elétron ejetado (Kmax = h·f - Phi).',
          importance: 'fundamental',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_q4_p4',
              type: 'pdf_page',
              pageNumber: 4,
              excerpt: 'A equação de Einstein para o balanço de energia do efeito fotoelétrico é dada por: Kmax = h·f - Phi.',
            },
          ],
          prerequisiteConceptIds: ['c_frequencia_corte'],
          diagnosticState: 'unassessed',
        },
      ],
      complementaryConcepts: [
        {
          id: 'c_potencial_corte',
          name: 'Potencial de Frenagem / Corte (V0)',
          definition: 'Diferença de potencial elétrico inversa exata para frear o fotoelétron mais rápido emitido.',
          importance: 'complementary',
          epistemicStatus: 'explicitly_documented',
          evidenceReferences: [
            {
              id: 'ev_q5_p4',
              type: 'pdf_page',
              pageNumber: 4,
              excerpt: 'A energia cinética máxima pode ser medida aplicando-se uma diferença de potencial inversa tal que Kmax = e·V0.',
            },
          ],
          prerequisiteConceptIds: ['c_energia_cinetica'],
          diagnosticState: 'unassessed',
        },
      ],
      relationships: [
        {
          id: 'rel_q1',
          sourceConceptId: 'c_foton',
          targetConceptId: 'c_funcao_trabalho',
          relationType: 'contrasts',
          description: 'A energia do fóton incidente deve superar o valor limite da função trabalho para que haja fotoemissão.',
          evidences: [
            {
              id: 'ev_rel_q1',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Se a energia do fóton for menor que a função trabalho, nenhum fotoelétron é ejetado.',
            },
          ],
          internalModelConfidence: 0.99,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_q2',
          sourceConceptId: 'c_funcao_trabalho',
          targetConceptId: 'c_frequencia_corte',
          relationType: 'causes',
          description: 'A função trabalho é a propriedade intrínseca do material que determina matematicamente a frequência de corte f0 = Phi / h.',
          evidences: [
            {
              id: 'ev_rel_q2',
              type: 'pdf_page',
              pageNumber: 3,
              excerpt: 'Isso define a frequência de corte: f0 = Phi / h.',
            },
          ],
          internalModelConfidence: 0.98,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
        {
          id: 'rel_q3',
          sourceConceptId: 'c_frequencia_corte',
          targetConceptId: 'c_energia_cinetica',
          relationType: 'regulates',
          description: 'Qualquer frequência além da frequência de corte aumenta linearmente a energia cinética do elétron emitido.',
          evidences: [
            {
              id: 'ev_rel_q3',
              type: 'pdf_page',
              pageNumber: 4,
              excerpt: 'Kmax = h·f - Phi.',
            },
          ],
          internalModelConfidence: 0.97,
          isModelInference: false,
          epistemicStatus: 'explicitly_documented',
        },
      ],
      prerequisiteGraph: {
        nodes: [
          { id: 'c_foton', name: 'Fóton (E=hf)', isPrerequisite: true },
          { id: 'c_funcao_trabalho', name: 'Função Trabalho (Phi)', isPrerequisite: true },
          { id: 'c_frequencia_corte', name: 'Frequência de Corte (f0)', isPrerequisite: true },
          { id: 'c_energia_cinetica', name: 'Energia Cinética (Kmax)', isPrerequisite: false },
          { id: 'c_potencial_corte', name: 'Potencial de Frenagem (V0)', isPrerequisite: false },
        ],
        edges: [
          { from: 'c_foton', to: 'c_funcao_trabalho', label: 'deve superar', relationType: 'contrasts' },
          { from: 'c_funcao_trabalho', to: 'c_frequencia_corte', label: 'determina limite', relationType: 'causes' },
          { from: 'c_frequencia_corte', to: 'c_energia_cinetica', label: 'linearidade Kmax', relationType: 'regulates' },
          { from: 'c_energia_cinetica', to: 'c_potencial_corte', label: 'medido por e*V0', relationType: 'regulates' },
        ],
      },
      identifiedGaps: [
        'O texto não aborda o rendimento quântico de emissão nem materiais semicondutores modernos.',
      ],
      suggestedDiagramType: 'concept-map',
      analyzedAt: 1730000110000,
    },
  },
];
