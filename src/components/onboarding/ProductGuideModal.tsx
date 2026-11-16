import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  Compass,
  Layers,
  Brain,
  HelpCircle,
  ShieldCheck,
  ArrowRight,
  Clock,
  Award,
  CheckCircle2,
  FileText,
  Search,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  GLOSSARY_TERMS,
  FAQ_ITEMS,
  RECOMMENDED_PATH_STEPS,
  type GlossaryTerm,
  type FAQItem,
} from './onboardingData';

interface ProductGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onLoadDemoMaterial: () => void;
  onOpenWelcome?: () => void;
  onResetOnboarding?: () => void;
  onFactoryReset?: () => void;
}

type GuideTab = 'overview' | 'path' | 'features' | 'glossary' | 'faq' | 'transparency';

export const ProductGuideModal: React.FC<ProductGuideModalProps> = ({
  isOpen,
  onClose,
  onStartTour,
  onLoadDemoMaterial,
  onOpenWelcome,
  onResetOnboarding,
  onFactoryReset,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('overview');
  const [glossarySearch, setGlossarySearch] = useState('');
  const [faqCategoryFilter, setFaqCategoryFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredGlossary = GLOSSARY_TERMS.filter(
    t =>
      t.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      t.shortExplanation.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      t.detailedExplanation.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  const faqCategories = ['all', ...Array.from(new Set(FAQ_ITEMS.map(f => f.category)))];
  const filteredFaq =
    faqCategoryFilter === 'all'
      ? FAQ_ITEMS
      : FAQ_ITEMS.filter(f => f.category === faqCategoryFilter);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="guide-title" className="text-base font-bold text-white tracking-tight">
                  Guia do NeuroClass AI
                </h2>
                <span className="text-[10px] font-mono uppercase bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/60">
                  Manual do Estudante
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Aprenda a transformar leitura passiva em compreensão profunda e retenção duradoura.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenWelcome && (
              <button
                onClick={() => {
                  onClose();
                  onOpenWelcome();
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:text-white bg-violet-950/60 hover:bg-violet-900/60 border border-violet-500/40 rounded-lg transition-colors cursor-pointer"
                title="Voltar para a tela inicial de apresentação e opções de início"
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>Tela Inicial</span>
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 rounded-lg transition-colors cursor-pointer"
              title="Iniciar tour guiado pela interface"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ver Tour Guiado</span>
            </button>

            {onResetOnboarding && (
              <button
                onClick={() => {
                  onClose();
                  onResetOnboarding();
                }}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-amber-300 bg-slate-900 hover:bg-amber-950/30 border border-slate-750 hover:border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                title="Resetar preferências de tour e reabrir a tela inicial"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Resetar Onboarding</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fechar guia"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-1 px-6 py-2 bg-slate-950/50 border-b border-slate-800/80 overflow-x-auto text-xs shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Visão Geral & Jornada</span>
          </button>

          <button
            onClick={() => setActiveTab('path')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'path'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Primeiro Percurso</span>
          </button>

          <button
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'features'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Recursos & Ferramentas</span>
          </button>

          <button
            onClick={() => setActiveTab('glossary')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'glossary'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Glossário ({GLOSSARY_TERMS.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('faq')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'faq'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Perguntas Frequentes</span>
          </button>

          <button
            onClick={() => setActiveTab('transparency')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'transparency'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Transparência & Limites da IA</span>
          </button>
        </div>

        {/* Corpo do Guia */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-300 leading-relaxed">
          {/* ABA 1: VISÃO GERAL & JORNADA */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-slate-950/70 border border-cyan-500/20 rounded-xl p-5">
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-cyan-400" />
                  O que é o NeuroClass AI?
                </h3>
                <p className="text-xs md:text-sm text-slate-300">
                  O <strong>NeuroClass AI</strong> é uma plataforma de estudo ativo fundamentada na psicologia cognitiva e na neurociência do aprendizado. Ela foi criada para solucionar um dos maiores problemas de quem estuda: a <em>ilusão de competência</em> provocada pela leitura passiva e pelo mero sublinhado de textos.
                </p>
                <p className="text-xs md:text-sm text-slate-400 mt-2">
                  Em vez de apenas re-ler, o sistema organiza seu material em uma rede conceitual transparente, convida você a explicar o conteúdo com suas próprias palavras, testa a aplicação prática em cenários reais e agenda revisões espaçadas no tempo exato para você nunca mais esquecer.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
                  Como funciona? A Jornada Integrada do Estudante
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-cyan-950 text-cyan-400 font-mono text-xs flex items-center justify-center font-bold">
                      1
                    </div>
                    <h5 className="font-semibold text-white text-xs">Documento & Análise</h5>
                    <p className="text-[11px] text-slate-400">
                      Envie um PDF ou crie notas. A IA indexa páginas e mapeia conceitos essenciais e relações com citações fiéis.
                    </p>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-violet-950 text-violet-400 font-mono text-xs flex items-center justify-center font-bold">
                      2
                    </div>
                    <h5 className="font-semibold text-white text-xs">Quadro de Conceitos</h5>
                    <p className="text-[11px] text-slate-400">
                      O Blackboard exibe os nós centrais e orbitais, suas conexões de causa/efeito e a ordem de pré-requisitos lógicos.
                    </p>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-indigo-950 text-indigo-400 font-mono text-xs flex items-center justify-center font-bold">
                      3
                    </div>
                    <h5 className="font-semibold text-white text-xs">Ciclo C.R.E.A.R.</h5>
                    <p className="text-[11px] text-slate-400">
                      Percorra as 5 etapas ativas: Contextualizar, Relacionar, Explicar (Feynman), Aplicar e Recuperar.
                    </p>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-amber-950 text-amber-400 font-mono text-xs flex items-center justify-center font-bold">
                      4
                    </div>
                    <h5 className="font-semibold text-white text-xs">Domínio Epistêmico</h5>
                    <p className="text-[11px] text-slate-400">
                      Acompanhe o estado de domínio: de não avaliado a compreendido ou dominado com base em evidências independentes.
                    </p>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-emerald-950 text-emerald-400 font-mono text-xs flex items-center justify-center font-bold">
                      5
                    </div>
                    <h5 className="font-semibold text-white text-xs">Revisão Espaçada (FSRS)</h5>
                    <p className="text-[11px] text-slate-400">
                      O algoritmo FSRS-7 agenda revisões dinâmicas conforme sua facilidade ou dificuldade para consolidar a memória.
                    </p>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                    <div className="w-6 h-6 rounded-md bg-sky-950 text-sky-400 font-mono text-xs flex items-center justify-center font-bold">
                      6
                    </div>
                    <h5 className="font-semibold text-white text-xs">Painel Longitudinal</h5>
                    <p className="text-[11px] text-slate-400">
                      Visualize a evolução da sua estabilidade mnemônica e o índice de retenção real ao longo das semanas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: PRIMEIRO PERCURSO RECOMENDADO */}
          {activeTab === 'path' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-cyan-950/60 to-slate-900 border border-cyan-500/30 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                    Como Começar seu Primeiro Estudo
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Você pode começar imediatamente sem precisar importar nada agora. Nós pré-carregamos um artigo científico completo com todas as relações e evidências estruturadas.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onLoadDemoMaterial();
                  }}
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-cyan-600/30 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Carregar Demonstração Pronta</span>
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Roteiro Prático em 6 Passos
                </h4>
                <div className="space-y-2.5">
                  {RECOMMENDED_PATH_STEPS.map(item => (
                    <div
                      key={item.step}
                      className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-start gap-3.5"
                    >
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                        {item.step}
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-semibold text-white text-xs">{item.title}</h5>
                        <p className="text-xs text-slate-300">{item.actionText}</p>
                        <span className="text-[11px] text-cyan-300/80 font-mono block">
                          💡 {item.tip}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: RECURSOS & FERRAMENTAS */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                O NeuroClass AI integra ferramentas complementares projetadas para atuar em sinergia pedagógica.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                    <Layers className="w-4 h-4" />
                    <span>Quadro de Conceitos (Blackboard)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Apresenta a malha de conhecimentos em forma de grafo. Diferencia conceitos fundamentais (o núcleo teórico indispensável) de conceitos complementares (termos e mediadores secundários). Permite alternar para a visualização de Pré-Requisitos (DAG), expondo o que deve ser estudado primeiro.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>Agora Eu Explico (Método Feynman)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Módulo de avaliação formativa. Ao redigir uma explicação com suas palavras, o estudante é avaliado em uma rubrica multidimensional de 5 eixos (Precisão, Completude, Relações, Coerência e Aplicação), com destaque de evidências reais citadas no documento.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-violet-400 font-bold text-xs">
                    <Brain className="w-4 h-4" />
                    <span>Ciclo C.R.E.A.R. Integrado</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    O percurso de 5 etapas (Contextualizar, Relacionar, Explicar, Aplicar, Recuperar) transforma uma leitura passiva em maestria duradoura. Cada etapa constrói um tijolo cognitivo diferente, integrando o estudo de caso prático e a evocação ativa imediata.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                    <Award className="w-4 h-4" />
                    <span>Motor de Domínio Cognitivo</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Motor determinístico que classifica cada conceito nos estados: <em>unassessed</em> (não avaliado), <em>confirmed_gap</em> (lacuna comprovada por equívoco substantivo), <em>understood</em> (compreendido) e <em>mastered</em> (domínio autônomo cumulativo).
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <Clock className="w-4 h-4" />
                    <span>Revisão Espaçada FSRS-7</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Utiliza o algoritmo de repetição espaçada FSRS-7 com retenção calibrada em 90%. Cada conceito revisado recebe uma classificação (De Novo, Difícil, Bom, Fácil) que recalcula matematicamente os dias até a próxima revisão ideal.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Painel Longitudinal de Memória</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Acompanha a retenção média acumulada, o número de revisões efetuadas, a taxa de sucesso e o histórico completo de revlogs (registros de revisão) persistidos no navegador.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: GLOSSÁRIO AMIGÁVEL */}
          {activeTab === 'glossary' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Dicionário conceitual com termos técnicos traduzidos para linguagem simples e exemplos práticos.
                </p>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={glossarySearch}
                    onChange={e => setGlossarySearch(e.target.value)}
                    placeholder="Buscar no glossário..."
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-medium"
                  >
                  </input>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGlossary.map(item => (
                  <div
                    key={item.term}
                    className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-white text-sm text-cyan-300">{item.term}</h5>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-200">{item.shortExplanation}</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {item.detailedExplanation}
                    </p>
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2 mt-1">
                      <span className="text-[10px] text-violet-300 font-semibold block">
                        Exemplo concreto:
                      </span>
                      <p className="text-[11px] text-slate-300 italic">{item.concreteExample}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 5: PERGUNTAS FREQUENTES (FAQ) */}
          {activeTab === 'faq' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {faqCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFaqCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      faqCategoryFilter === cat
                        ? 'bg-cyan-600 text-white font-semibold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat === 'all' ? 'Todas' : cat}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {filteredFaq.map((faq, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-bold text-white text-xs text-cyan-300">{faq.question}</h5>
                      <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">
                        {faq.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 6: TRANSPARÊNCIA & LIMITES DA IA */}
          {activeTab === 'transparency' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Arquitetura de Privacidade e Armazenamento Local</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Todo o banco de dados das suas sessões de estudo, histórico de tentativas de explicação, anotações, agendamentos do FSRS e logs de revisão é armazenado <strong>exclusivamente no seu próprio navegador</strong> via <em>IndexedDB</em> (versão 3 com 9 tabelas locais). Nenhuma informação sua é gravada em bancos de dados remotos centralizados.
                </p>
              </div>

              <div className="bg-slate-950/70 border border-rose-500/30 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Gerenciamento de Dados Locais e Reset de Fábrica</span>
                  </div>
                  {onFactoryReset && (
                    <button
                      type="button"
                      onClick={() => {
                        const confirmed = window.confirm(
                          'ATENÇÃO: Deseja apagar todos os documentos locais (incluindo PDFs importados, notas, histórico de estudo e revisões) e restaurar o NeuroClass AI ao estado inicial de fábrica?\n\nEsta ação é irreversível.'
                        );
                        if (confirmed) {
                          onClose();
                          onFactoryReset();
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 rounded-lg transition-colors cursor-pointer"
                    >
                      Restaurar Estado Inicial
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Caso queira limpar arquivos de teste carregados anteriormente (como e-books ou PDFs de estudo) e reiniciar suas métricas com o material de demonstração padrão, use a restauração de fábrica. Todos os 9 repositórios locais do IndexedDB serão limpos imediatamente.
                </p>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                  <h5 className="font-semibold text-white">Quando a Inteligência Artificial é acionada?</h5>
                  <p className="text-slate-400">
                    A IA (Google Gemini API via servidor de backend local) é consultada apenas em momentos específicos:
                  </p>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 mt-1 pl-1">
                    <li>
                      <strong>Análise inicial do documento:</strong> O arquivo PDF (ou trechos do texto extraído) é enviado para que a IA identifique a rede conceitual, as relações causais e as citações literais.
                    </li>
                    <li>
                      <strong>Avaliação no Agora Eu Explico e C.R.E.A.R.:</strong> O conceito e o texto digitado pelo estudante são enviados para gerar o feedback pedagógico com a rubrica multidimensional.
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                  <h5 className="font-semibold text-white">Rigor Epistemológico e Rastreabilidade</h5>
                  <p className="text-slate-400">
                    O NeuroClass AI possui um compromisso estrito com a verdade documental:
                  </p>
                  <ul className="list-disc list-inside text-slate-300 space-y-1 mt-1 pl-1">
                    <li>
                      <strong>Distinção clara:</strong> O sistema rotula expressamente o que é citação textual direta (<em>explicitly_documented</em>), síntese integradora da fonte (<em>synthesized</em>) e inferência didática da IA (<em>model_inference</em>).
                    </li>
                    <li>
                      <strong>Conferência de Evidências:</strong> Cada conceito extraído apresenta o número exato da página original do documento onde a evidência se encontra. Recomendamos que o estudante sempre confira as citações no visualizador de páginas.
                    </li>
                    <li>
                      <strong>Resiliência Local:</strong> Se a conexão com a API de IA falhar ou estiver indisponível, o sistema ativa mecanismos locais e determinísticos de contingência para formular perguntas e avaliar explicações sem travar a navegação.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé da Modal */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 shrink-0 text-xs text-slate-400 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>NeuroClass AI v2.2 · Aprendizagem Ativa</span>
            </div>
            {onResetOnboarding && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onResetOnboarding();
                }}
                className="text-[11px] text-slate-400 hover:text-amber-300 underline hover:no-underline cursor-pointer flex items-center gap-1"
                title="Resetar preferências de tour e reabrir a tela inicial de boas-vindas sem apagar seus documentos"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Resetar Tutorial</span>
              </button>
            )}
            {onFactoryReset && (
              <button
                type="button"
                onClick={() => {
                  const confirmed = window.confirm(
                    'ATENÇÃO: Deseja apagar todos os documentos locais (incluindo PDFs importados, notas, histórico de estudo e revisões) e restaurar o NeuroClass AI ao estado inicial de fábrica?\n\nEsta ação é irreversível.'
                  );
                  if (confirmed) {
                    onClose();
                    onFactoryReset();
                  }
                }}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-2 py-1 border border-rose-500/20 hover:border-rose-500/40 rounded transition-colors cursor-pointer flex items-center gap-1"
                title="Apagar todos os documentos e dados locais e restaurar padrões iniciais"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Resetar Tudo (Limpar Dados e Reiniciar)</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Fechar Guia
          </button>
        </div>
      </div>
    </div>
  );
};
