/**
 * NeuroClass AI — Dados e Textos Canônicos do Onboarding, Guia e Ajuda Contextual
 * Camada independente e estática para suporte a novos estudantes.
 *
 * Persistência: localStorage versionado ('neuroclass_onboarding_v1')
 * com proteção estrita contra falhas de quota ou ambientes com storage desabilitado.
 */

export const ONBOARDING_STORAGE_KEY = 'neuroclass_onboarding_v1';

export interface OnboardingState {
  hasCompletedWelcome: boolean;
  hasCompletedTour: boolean;
  completedAt?: string;
  version: number;
}

/**
 * Lê o estado de conclusão do onboarding de forma segura
 */
export function getStoredOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return { hasCompletedWelcome: false, hasCompletedTour: false, version: 1 };
    }
    const parsed = JSON.parse(raw);
    return {
      hasCompletedWelcome: Boolean(parsed.hasCompletedWelcome),
      hasCompletedTour: Boolean(parsed.hasCompletedTour),
      completedAt: parsed.completedAt,
      version: parsed.version || 1,
    };
  } catch (err) {
    console.warn('[Onboarding] Falha ao ler localStorage, usando padrão:', err);
    return { hasCompletedWelcome: false, hasCompletedTour: false, version: 1 };
  }
}

/**
 * Persiste o estado do onboarding com tratamento contra exceções de quota
 */
export function setStoredOnboardingState(state: Partial<OnboardingState>): void {
  try {
    const current = getStoredOnboardingState();
    const updated: OnboardingState = {
      ...current,
      ...state,
      version: 1,
      completedAt: new Date().toISOString(),
    };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Onboarding] Falha ao gravar localStorage:', err);
  }
}

/**
 * Reseta o onboarding para fins de demonstração ou solicitação do usuário
 */
export function resetStoredOnboardingState(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch (err) {
    console.warn('[Onboarding] Falha ao resetar localStorage:', err);
  }
}

// -----------------------------------------------------------------------------
// CONTEÚDO DO TOUR GUIADO (6 PASSOS)
// -----------------------------------------------------------------------------
export interface TourStep {
  step: number;
  title: string;
  subtitle: string;
  description: string;
  targetAreaId?: string;
  highlightText: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    title: 'Seus Materiais de Estudo',
    subtitle: 'Importação e Análise Multimodal',
    description:
      'Tudo começa com seus documentos. Você pode importar PDFs acadêmicos, livros e anotações. A inteligência artificial realiza uma leitura estruturada, identificando páginas, citações reais e evidências documentais sem alucinações.',
    highlightText: 'Dica: Você também pode explorar nossos Exemplos Científicos pré-carregados a qualquer momento!',
  },
  {
    step: 2,
    title: 'Quadro de Conceitos',
    subtitle: 'Blackboard e Grafo de Conexões',
    description:
      'O Quadro de Conceitos (tecnicamente conhecido como Blackboard) organiza visualmente o conhecimento em conceitos fundamentais (o núcleo teórico) e complementares. As linhas indicam causas, pré-requisitos essenciais e relações lógicas documentadas.',
    highlightText: 'Explore o grafo navegando pelos nós ou alternando para o modo de Pré-Requisitos (DAG).',
  },
  {
    step: 3,
    title: 'Aprenda Ativamente com o C.R.E.A.R.',
    subtitle: 'O Método Pedagógico em 5 Estágios',
    description:
      'Para transformar leitura passiva em aprendizagem duradoura, o NeuroClass AI integra o percurso C.R.E.A.R.: 1. Contextualizar (entender a relevância) → 2. Relacionar (conectar ao mapa mental) → 3. Explicar (reconstruir com suas palavras) → 4. Aplicar (resolver cenários práticos) → 5. Recuperar (evocar sem consulta).',
    highlightText: 'Você pode iniciar o ciclo completo clicando no botão "Ciclo C.R.E.A.R." em qualquer conceito!',
  },
  {
    step: 4,
    title: 'Explique com Suas Palavras',
    subtitle: 'Agora Eu Explico e Feedback Multidimensional',
    description:
      'Inspirado no Método Feynman, o módulo "Agora Eu Explico" convida você a ensinar o conceito em linguagem própria. A IA avalia sua resposta em 5 dimensões rigorosas: precisão conceitual, completude, relações, coerência e aplicação prática.',
    highlightText: 'O sistema aponta com clareza o que você compreendeu, o que omitiu e se houve equívocos materiais.',
  },
  {
    step: 5,
    title: 'Pratique e Recupere no Tempo Certo',
    subtitle: 'Revisão Espaçada com Modelo FSRS-7',
    description:
      'Esquecer é natural, mas a recuperação espaçada fortalece a memória. O algoritmo FSRS-7 calcula o momento exato em que sua retenção está diminuindo para agendar revisões eficientes (classificadas em De Novo, Difícil, Bom e Fácil).',
    highlightText: 'Apenas alguns minutos diários na fila de revisão impedem que o conteúdo estudado se perca no esquecimento.',
  },
  {
    step: 6,
    title: 'Acompanhe Sua Evolução Longitudinal',
    subtitle: 'Diagnóstico Epistêmico e Painel de Memória',
    description:
      'Veja o status de cada conceito evoluir de "Não avaliado" até "Dominado" com base em evidências reais de domínio independente. O Painel Longitudinal mostra sua taxa de retenção observada, histórico de revisões e estabilidade mnemônica.',
    highlightText: 'Parabéns! Você está pronto para estudar ativamente e dominar qualquer assunto acadêmico.',
  },
];

// -----------------------------------------------------------------------------
// GLOSSÁRIO AMIGÁVEL (12 TERMOS CANÔNICOS)
// -----------------------------------------------------------------------------
export interface GlossaryTerm {
  term: string;
  category: 'arquitetura' | 'metodo' | 'memoria' | 'avaliacao';
  shortExplanation: string;
  detailedExplanation: string;
  concreteExample: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: 'Blackboard',
    category: 'arquitetura',
    shortExplanation: 'Quadro interativo de conceitos e conexões.',
    detailedExplanation:
      'Painel visual principal do NeuroClass AI onde os conceitos extraídos do material são representados como nós interligados por relações causais, estruturais e de pré-requisitos.',
    concreteExample:
      'No estudo de neurobiologia, o Blackboard exibe "Potencial de Ação" no centro, conectado a "Canais de Sódio" e "Gradiente Eletroquímico".',
  },
  {
    term: 'C.R.E.A.R.',
    category: 'metodo',
    shortExplanation: 'Ciclo de cinco etapas de aprendizagem ativa.',
    detailedExplanation:
      'Metodologia pedagógica estruturada que guia o estudante através de cinco fases progressivas: Contextualizar, Relacionar, Explicar, Aplicar e Recuperar.',
    concreteExample:
      'Em vez de apenas reler um capítulo, o estudante segue o ciclo C.R.E.A.R. para contextualizar a importância do tema, relacioná-lo ao que já sabe, explicá-lo, resolver um problema e testar a memória.',
  },
  {
    term: 'Contextualizar',
    category: 'metodo',
    shortExplanation: 'Compreender o conceito em seu contexto original.',
    detailedExplanation:
      'Primeiro estágio do C.R.E.A.R. Tem como objetivo situar o tema dentro do documento, mostrando sua importância científica, problemas que ele resolve e referências documentadas.',
    concreteExample:
      'Entender por que a sinapse química é fundamental para a transmissão direcional de sinais antes de memorizar suas partes moleculares.',
  },
  {
    term: 'Relacionar',
    category: 'metodo',
    shortExplanation: 'Conectar conceitos e integrar o conhecimento.',
    detailedExplanation:
      'Segundo estágio do C.R.E.A.R. Ajuda o estudante a visualizar como o conceito atual depende de pré-requisitos anteriores e como se articula com outros temas.',
    concreteExample:
      'Identificar que para compreender a despolarização é indispensável dominar a bomba de sódio-potássio.',
  },
  {
    term: 'Explicar',
    category: 'metodo',
    shortExplanation: 'Reconstruir o conhecimento com palavras próprias.',
    detailedExplanation:
      'Terceiro estágio do C.R.E.A.R. e essência do módulo "Agora Eu Explico". Exige formulação ativa sem cópia literal, revelando o real nível de compreensão.',
    concreteExample:
      'Descrever em linguagem própria como se estivesse ensinando a um colega o que acontece na fenda sináptica.',
  },
  {
    term: 'Aplicar',
    category: 'metodo',
    shortExplanation: 'Utilizar o conhecimento em uma situação prática.',
    detailedExplanation:
      'Quarto estágio do C.R.E.A.R. Avalia a transferência do conhecimento por meio de estudos de caso, resolução de problemas clínicos ou análises de experimentos reais.',
    concreteExample:
      'Prever o que acontece com a transmissão sináptica se um fármaco bloquear seletivamente os canais de cálcio voltagem-dependentes.',
  },
  {
    term: 'Recuperar',
    category: 'metodo',
    shortExplanation: 'Tentar lembrar ativamente sem consultar o material.',
    detailedExplanation:
      'Quinto estágio do C.R.E.A.R. Prática de evocação deliberada (retrieval practice) logo após o estudo, que consolida trilhas de memória no cérebro.',
    concreteExample:
      'Fechar as anotações e responder espontaneamente: "Quais são as três etapas sequenciais de uma sinapse química?".',
  },
  {
    term: 'Agora Eu Explico',
    category: 'avaliacao',
    shortExplanation: 'Ferramenta de explicação e avaliação formativa.',
    detailedExplanation:
      'Módulo interativo de avaliação cognitiva baseado no Método Feynman. Recebe a resposta do aluno e gera feedback analítico com rubrica em 5 dimensões.',
    concreteExample:
      'O estudante redige sua explicação e recebe análise identificando elementos compreendidos, pontos incompletos e orientações para melhoria.',
  },
  {
    term: 'Domínio Cognitivo',
    category: 'avaliacao',
    shortExplanation: 'Estado de aprendizagem fundamentado em evidências.',
    detailedExplanation:
      'Classificação rigorosa do nível de aprendizagem de um conceito: Não avaliado (unassessed), Lacuna confirmada (confirmed_gap), Compreendido (understood) ou Dominado (mastered).',
    concreteExample:
      'Para atingir o estado "Dominado", o estudante precisa demonstrar compreensão profunda e aplicação autônoma sem dicas em momentos independentes.',
  },
  {
    term: 'Recuperação Espaçada',
    category: 'memoria',
    shortExplanation: 'Revisões distribuídas e organizadas ao longo do tempo.',
    detailedExplanation:
      'Técnica que aproveita o efeito de espaçamento (spacing effect) da neurociência para revisar conceitos nos momentos ideais da curva de esquecimento.',
    concreteExample:
      'Revisar um conceito 1 dia após a primeira aprendizagem, depois em 3 dias, em 10 dias e em 30 dias, fixando o conteúdo permanentemente.',
  },
  {
    term: 'FSRS',
    category: 'memoria',
    shortExplanation: 'Algoritmo moderno para calcular intervalos de revisão.',
    detailedExplanation:
      'Free Spaced Repetition Scheduler (versão FSRS-7). Modelo matemático de ponta baseado em estabilidade e dificuldade que supera o clássico SM-2 do Anki.',
    concreteExample:
      'Com base em 34 parâmetros calibrados e na meta de 90% de retenção, o FSRS calcula dinamicamente se a próxima revisão deve ocorrer em 2 ou 14 dias.',
  },
  {
    term: 'Recuperabilidade',
    category: 'memoria',
    shortExplanation: 'Estimativa matemática da chance de lembrar.',
    detailedExplanation:
      'Probabilidade teórica (entre 0% e 100%) de o estudante conseguir recuperar com sucesso uma informação da memória na data atual.',
    concreteExample:
      'Se um conceito foi agendado para hoje e sua estabilidade é alta, a recuperabilidade estimada está em aproximadamente 90%. Se passar semanas sem revisar, ela decai gradativamente.',
  },
];

// -----------------------------------------------------------------------------
// PERGUNTAS FREQUENTES (FAQ)
// -----------------------------------------------------------------------------
export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    category: 'Uso Geral',
    question: 'Preciso entender neurociência para usar a plataforma?',
    answer:
      'Não! Os princípios de neurociência e psicologia cognitiva (como efeito de espaçamento, evocação ativa e carga cognitiva) formam o alicerce pedagógico do sistema, mas você pode utilizá-lo para estudar QUALQUER matéria ou disciplina: medicina, engenharia, direito, história, programação, psicologia, concursos ou negócios.',
  },
  {
    category: 'Processamento & IA',
    question: 'O que acontece quando importo um arquivo PDF?',
    answer:
      'O documento é processado localmente no seu navegador para extrair o texto e a paginação original. Em seguida, os dados estruturados são enviados ao modelo Gemini para mapear os conceitos centrais, pré-requisitos lógicos e evidências citadas no livro ou artigo.',
  },
  {
    category: 'Processamento & IA',
    question: 'A inteligência artificial lê todo o documento?',
    answer:
      'Sim. O sistema realiza extração das páginas e amostragens representativas estruturadas que cobrem o documento do início ao fim (mesmo em livros de mais de 300 páginas), garantindo uma representação conceitual abrangente e conectada.',
  },
  {
    category: 'Uso Geral',
    question: 'Posso estudar materiais de qualquer área do conhecimento?',
    answer:
      'Com certeza. O NeuroClass AI analisa com eficiência materiais de exatas, biológicas, humanas e sociais aplicadas, desde que possuam densidade conceitual e estrutura textual.',
  },
  {
    category: 'Domínio Cognitivo',
    question: 'O que significa um conceito estar no estado "Dominado"?',
    answer:
      'Significa que você demonstrou domínio consolidado acumulado: realizou pelo menos duas tentativas de avaliação qualificadoras independentes, atingiu nível cognitivo avançado, aplicou o conhecimento na prática e não precisou de dicas pedagógicas de apoio.',
  },
  {
    category: 'Memória & FSRS',
    question: 'O que acontece quando erro uma revisão espaçada?',
    answer:
      'O FSRS classifica a revisão como "De Novo" (Again), incrementa o contador de lapsos e recalcula o próximo agendamento para o dia seguinte, permitindo que você reconsolide a memória. Importante: um esquecimento ou atraso na revisão NÃO rebaixa um domínio cognitivo previamente conquistado!',
  },
  {
    category: 'Metodologia',
    question: 'Qual é a diferença entre "Recuperar" (no C.R.E.A.R.) e a "Revisão Espaçada"?',
    answer:
      '"Recuperar" é o 5º estágio imediato do C.R.E.A.R., realizado logo após explicar e aplicar, com o objetivo de testar a evocação sem consulta enquanto o tema ainda está recente. A "Revisão Espaçada", por sua vez, ocorre dias, semanas ou meses depois, distribuída no tempo para combater a curva de esquecimento a longo prazo.',
  },
];

// -----------------------------------------------------------------------------
// AJUDA CONTEXTUAL PARA ÁREAS PRINCIPAIS (FEATURE HELP)
// -----------------------------------------------------------------------------
export interface FeatureHelpInfo {
  id: string;
  featureName: string;
  technicalName?: string;
  whatIsIt: string;
  whatIsItFor: string;
  whenToUse: string;
  recommendedNextStep: string;
}

export const FEATURE_HELP_DATA: Record<string, FeatureHelpInfo> = {
  document_import: {
    id: 'document_import',
    featureName: 'Importação de Documentos',
    technicalName: 'Document Source & Multimodal Parser',
    whatIsIt: 'Mecanismo de entrada para envio de arquivos PDF acadêmicos ou criação de notas de estudo estruturadas.',
    whatIsItFor: 'Extrair o conteúdo original, indexar páginas e enviar à inteligência artificial para extração da rede conceitual.',
    whenToUse: 'Sempre que você quiser iniciar o estudo de um novo livro, artigo científico, apostila ou anotação de aula.',
    recommendedNextStep: 'Aguarde a conclusão da análise e explore os conceitos gerados no Quadro de Conceitos.',
  },
  blackboard: {
    id: 'blackboard',
    featureName: 'Quadro de Conceitos',
    technicalName: 'Blackboard Interativo',
    whatIsIt: 'Mapa mental e grafo interativo que conecta os conceitos fundamentais e complementares do material.',
    whatIsItFor: 'Visualizar como as ideias se interconectam (causas, regulações, contrastes e pré-requisitos essenciais).',
    whenToUse: 'Para explorar a visão panorâmica do tema, localizar gargalos de compreensão e selecionar conceitos para estudo ativo.',
    recommendedNextStep: 'Clique em qualquer nó conceitual para ver seus detalhes e iniciar o Ciclo C.R.E.A.R. ou o Agora Eu Explico.',
  },
  agora_eu_explico: {
    id: 'agora_eu_explico',
    featureName: 'Agora Eu Explico',
    technicalName: 'Feynman Explanation Engine',
    whatIsIt: 'Ferramenta de avaliação formativa onde você explica conceitos científicos com suas próprias palavras.',
    whatIsItFor: 'Testar se você realmente entendeu a matéria ou apenas decorou termos. Avalia sua precisão, coerência e raciocínio.',
    whenToUse: 'Após ler uma seção e querer validar se você é capaz de articular o conteúdo com clareza.',
    recommendedNextStep: 'Leia o feedback detalhado, corrija lacunas apontadas e avance para a aplicação prática.',
  },
  crear_cycle: {
    id: 'crear_cycle',
    featureName: 'Ciclo C.R.E.A.R.',
    technicalName: 'Integrated Pedagogical Workflow',
    whatIsIt: 'Percurso pedagógico guiado em 5 etapas: Contextualizar, Relacionar, Explicar, Aplicar e Recuperar.',
    whatIsItFor: 'Garantir que a aprendizagem cumpra todo o arco cognitivo, da fundamentação teórica à retenção mnemônica.',
    whenToUse: 'Ao estudar conceitos prioritários ou temas complexos que exigem alta retenção e capacidade de transferência.',
    recommendedNextStep: 'Complete todas as etapas sequencialmente e conclua com a recuperação ativa sem consulta.',
  },
  cognitive_mastery: {
    id: 'cognitive_mastery',
    featureName: 'Domínio Cognitivo',
    technicalName: 'Mastery Progression Engine',
    whatIsIt: 'Indicador diagnóstico de maturidade de aprendizagem baseado em evidências objetivas e autônomas.',
    whatIsItFor: 'Identificar com precisão o que está Não Avaliado, com Lacuna Confirmada, Compreendido ou Dominado.',
    whenToUse: 'Para monitorar seu progresso real no documento e priorizar onde focar seu tempo de estudo.',
    recommendedNextStep: 'Dedique tempo extra a conceitos com Lacuna Confirmada antes de avançar para temas derivados.',
  },
  spaced_repetition: {
    id: 'spaced_repetition',
    featureName: 'Revisão Espaçada',
    technicalName: 'FSRS-7 Memory Scheduler',
    whatIsIt: 'Agendador de recuperação baseado no algoritmo FSRS-7 com retenção calibrada para 90%.',
    whatIsItFor: 'Programar sessões de revisão no momento ideal antes que o conceito seja esquecido pelo cérebro.',
    whenToUse: 'Diariamente ou sempre que o contador na barra superior indicar revisões pendentes para hoje.',
    recommendedNextStep: 'Abra a fila de revisão, responda à pergunta de evocação e confira seu novo intervalo agendado.',
  },
  longitudinal_dashboard: {
    id: 'longitudinal_dashboard',
    featureName: 'Painel Longitudinal',
    technicalName: 'Longitudinal Memory Analytics',
    whatIsIt: 'Painel de métricas analíticas sobre seu histórico de estudos, taxa de retenção e estabilidade mnemônica.',
    whatIsItFor: 'Diferenciar o desempenho observado em testes, a recuperabilidade matemática estimada e o domínio cognitivo real.',
    whenToUse: 'Para analisar a evolução temporal de sua memória e planejar metas de revisão de longo prazo.',
    recommendedNextStep: 'Mantenha a regularidade para ver a estabilidade média de seus conceitos crescer continuamente.',
  },
};

// -----------------------------------------------------------------------------
// ROTEIRO VISUAL: PRIMEIRO PERCURSO RECOMENDADO (6 PASSOS)
// -----------------------------------------------------------------------------
export interface RecommendedPathStep {
  step: number;
  title: string;
  actionText: string;
  tip: string;
}

export const RECOMMENDED_PATH_STEPS: RecommendedPathStep[] = [
  {
    step: 1,
    title: 'Escolha seu Material',
    actionText: 'Clique em "Exemplos Científicos" para carregar a demonstração pronta ou em "Importar Material" para enviar seu PDF.',
    tip: 'Se for sua primeira vez, o exemplo de Neurobiologia já vem pré-configurado!',
  },
  {
    step: 2,
    title: 'Examine o Quadro de Conceitos',
    actionText: 'Navegue pelos conceitos fundamentais no centro e pelos complementares na órbita externa.',
    tip: 'Alterne para a visão de "Pré-Requisitos" para entender a ordem lógica de estudo.',
  },
  {
    step: 3,
    title: 'Selecione um Conceito Central',
    actionText: 'Clique em um conceito (como "Potencial de Ação") para abrir seus detalhes no painel lateral.',
    tip: 'Veja as evidências com as páginas exatas onde o conceito aparece no material.',
  },
  {
    step: 4,
    title: 'Experimente o Ciclo C.R.E.A.R.',
    actionText: 'Clique em "Ciclo C.R.E.A.R." e percorra as 5 etapas guiadas, finalizando com a aplicação prática.',
    tip: 'Você consolidará o entendimento de maneira ativa e dinâmica.',
  },
  {
    step: 5,
    title: 'Consulte Suas Revisões',
    actionText: 'Clique em "Revisão Espaçada" na barra superior para ver os conceitos programados para reforço.',
    tip: 'O FSRS calcula intervalos matemáticos otimizados para gastar menos tempo com maior retenção.',
  },
  {
    step: 6,
    title: 'Acompanhe Sua Evolução',
    actionText: 'Consulte os indicadores de domínio cognitivo e o Painel Longitudinal de Memória.',
    tip: 'Veja seus conceitos evoluírem com consistência de "Não Avaliado" para "Dominado"!',
  },
];
