import type { VisualModality } from '../../types';

/**
 * Motor de Ilustrações Didáticas Curadas para Bibliotecas de Demonstração (Visual Learning v1).
 *
 * DIRETRIZES FUNDAMENTAIS:
 * 1. Estrita observância à Diretriz Anti-Texto: ZERO tags <text> ou <tspan> nas ilustrações SVG.
 * 2. Purismo iconográfico, geométrico e visual: alto contraste, paleta escura harmonizada com a UI (#060913),
 *    gradientes de energia (#38bdf8 cyan, #f59e0b amber, #8b5cf6 violet, #10b981 emerald).
 * 3. Adaptação pedagógica às 3 modalidades:
 *    - Ilustração Conceitual (estrutura anatômica/física do conceito).
 *    - Analogia Visual (metáfora relacional e intuitiva).
 *    - Mecanismo & Processo (fluxo causal, etapas e transformações dinâmicas).
 */

export interface DemoIllustrationResult {
  svg: string;
  dataUrl: string;
  title: string;
  caption: string;
}

export function generateCuratedDemoIllustration(
  conceptId: string,
  conceptName: string,
  modality: VisualModality = 'conceptual_illustration',
  documentTitle?: string
): DemoIllustrationResult {
  const cId = (conceptId || '').toLowerCase();
  const cName = (conceptName || '').toLowerCase();

  let svgContent = '';
  let titlePrefix = 'Ilustração Conceitual';
  let defaultCaption = `Representação visual didática do conceito "${conceptName}". Ilustração vetorial em conformidade com o rigor epistemológico do estudo, gerada sem rótulos de texto internos.`;

  // 1. EFEITO FOTOELÉTRICO E QUANTIZAÇÃO (Fóton, Função Trabalho, Frequência de Corte, Energia Cinética)
  if (
    cId.includes('foton') ||
    cId.includes('photoelectric') ||
    cName.includes('fóton') ||
    cName.includes('foton') ||
    cName.includes('quantização') ||
    cName.includes('fotoelétrico') ||
    cName.includes('função trabalho')
  ) {
    if (modality === 'visual_analogy') {
      titlePrefix = 'Analogia Visual';
      defaultCaption = `Analogia do Efeito Fotoelétrico: Uma barreira de potencial que requer um único pacote de energia concentrada (quantum) para liberar o elemento. Pacotes com energia abaixo do limiar colidem sem provocar transição, demonstrando o caráter discreto da absorção quântica.`;
      svgContent = `
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#060913" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="barrierGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#334155" />
            <stop offset="50%" stop-color="#e11d48" />
            <stop offset="100%" stop-color="#334155" />
          </linearGradient>
          <radialGradient id="highEnergyQuantum" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#67e8f9" />
            <stop offset="60%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#083344" />
          </radialGradient>
          <radialGradient id="lowEnergyQuantum" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fca5a5" />
            <stop offset="70%" stop-color="#ef4444" />
            <stop offset="100%" stop-color="#450a0a" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />

        <!-- Poço de Potencial e Barreira Limiar -->
        <path d="M 60 480 L 260 480 Q 340 480 370 300 L 390 180 Q 400 150 410 180 L 430 300 Q 460 480 540 480 L 740 480" fill="none" stroke="url(#barrierGrad)" stroke-width="6" stroke-linecap="round" />
        <line x1="400" y1="120" x2="400" y2="480" stroke="#f43f5e" stroke-width="2" stroke-dasharray="6,6" opacity="0.6" />

        <!-- Fóton de Baixa Energia (Refletido / Sem Ejeção) -->
        <g transform="translate(180, 280)">
          <path d="M 0 0 Q 20 -25 40 0 T 80 0 T 120 0" fill="none" stroke="#ef4444" stroke-width="4" filter="url(#glow)" />
          <polygon points="120,0 105,-8 105,8" fill="#ef4444" />
          <circle cx="60" cy="0" r="14" fill="url(#lowEnergyQuantum)" filter="url(#glow)" />
          <!-- Seta de ricochete -->
          <path d="M 130 -10 Q 150 -60 110 -100" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="4,4" />
          <polygon points="110,-100 120,-85 105,-88" fill="#ef4444" />
        </g>

        <!-- Fóton de Alta Energia (Supera Barreira e Ejeta) -->
        <g transform="translate(140, 160)">
          <path d="M 0 0 Q 15 -35 30 0 T 60 0 T 90 0 T 120 0 T 150 0 T 180 0" fill="none" stroke="#22d3ee" stroke-width="5" filter="url(#glow)" />
          <polygon points="180,0 165,-10 165,10" fill="#22d3ee" />
          <circle cx="90" cy="0" r="20" fill="url(#highEnergyQuantum)" filter="url(#glow)" />
        </g>

        <!-- Partícula Ejetada com Vetor de Velocidade -->
        <g transform="translate(560, 200)" filter="url(#glow)">
          <circle cx="0" cy="0" r="18" fill="#38bdf8" />
          <circle cx="0" cy="0" r="8" fill="#ffffff" />
          <!-- Vetores de Momento -->
          <line x1="20" y1="-5" x2="160" y2="-70" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
          <polygon points="160,-70 140,-60 148,-46" fill="#38bdf8" />
          <!-- Ondas de choque de aceleração -->
          <path d="M -25 -25 Q -40 0 -25 25" fill="none" stroke="#38bdf8" stroke-width="3" opacity="0.7" />
          <path d="M -35 -35 Q -55 0 -35 35" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.4" />
        </g>
      `;
    } else if (modality === 'process_mechanism') {
      titlePrefix = 'Mecanismo & Processo';
      defaultCaption = `Mecanismo Dinâmico do Efeito Fotoelétrico: (1) O quantum de luz incide sobre a rede metálica; (2) A energia E = h·f é absorvida integralmente por um único elétron; (3) Se a energia exceder a Função Trabalho do material, o elétron escapa da superfície com energia cinética máxima Kmax.`;
      svgContent = `
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#050814" />
            <stop offset="100%" stop-color="#0c1322" />
          </linearGradient>
          <linearGradient id="stepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />

        <!-- Estágio 1: Incidência do Pacote de Fóton -->
        <g transform="translate(140, 300)">
          <rect x="-90" y="-140" width="180" height="280" rx="16" fill="url(#stepGrad)" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.4" />
          <circle cx="0" cy="-90" r="24" fill="#0284c7" fill-opacity="0.2" stroke="#38bdf8" stroke-width="2" />
          <path d="M -60 10 Q -40 -30 -20 10 T 20 10 T 60 10" fill="none" stroke="#38bdf8" stroke-width="4" filter="url(#glow)" />
          <polygon points="60,10 45,2 45,18" fill="#38bdf8" />
          <circle cx="0" cy="90" r="14" fill="#38bdf8" filter="url(#glow)" />
        </g>

        <!-- Seta Conectora 1 -> 2 -->
        <g transform="translate(265, 300)">
          <line x1="0" y1="0" x2="40" y2="0" stroke="#f59e0b" stroke-width="4" stroke-dasharray="6,4" />
          <polygon points="45,0 35,-6 35,6" fill="#f59e0b" />
        </g>

        <!-- Estágio 2: Interação e Absorção Unilateral Discreta -->
        <g transform="translate(400, 300)">
          <rect x="-90" y="-140" width="180" height="280" rx="16" fill="url(#stepGrad)" stroke="#f59e0b" stroke-width="2" stroke-opacity="0.5" />
          <circle cx="0" cy="-90" r="24" fill="#d97706" fill-opacity="0.2" stroke="#f59e0b" stroke-width="2" />
          <!-- Pulso de absorção concêntrico -->
          <circle cx="0" cy="10" r="50" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,4" filter="url(#glow)" />
          <circle cx="0" cy="10" r="32" fill="none" stroke="#fbbf24" stroke-width="3" />
          <circle cx="0" cy="10" r="16" fill="#f59e0b" filter="url(#glow)" />
          <circle cx="0" cy="10" r="6" fill="#ffffff" />
        </g>

        <!-- Seta Conectora 2 -> 3 -->
        <g transform="translate(525, 300)">
          <line x1="0" y1="0" x2="40" y2="0" stroke="#10b981" stroke-width="4" stroke-dasharray="6,4" />
          <polygon points="45,0 35,-6 35,6" fill="#10b981" />
        </g>

        <!-- Estágio 3: Superação da Barreira e Ejeção Cinética -->
        <g transform="translate(660, 300)">
          <rect x="-90" y="-140" width="180" height="280" rx="16" fill="url(#stepGrad)" stroke="#10b981" stroke-width="2" stroke-opacity="0.5" />
          <circle cx="0" cy="-90" r="24" fill="#059669" fill-opacity="0.2" stroke="#10b981" stroke-width="2" />
          <!-- Trajetória de ejeção ascendente -->
          <line x1="0" y1="80" x2="0" y2="-40" stroke="#10b981" stroke-width="5" stroke-linecap="round" filter="url(#glow)" />
          <polygon points="0,-45 -8,-30 8,-30" fill="#10b981" />
          <circle cx="0" cy="-45" r="14" fill="#34d399" filter="url(#glow)" />
          <circle cx="0" cy="-45" r="5" fill="#ffffff" />
        </g>
      `;
    } else {
      titlePrefix = 'Ilustração Conceitual';
      defaultCaption = `Representação Iconográfica do Fóton e da Estrutura Eletrônica: O fóton como onda eletromagnética localizada incidente sobre a rede cristalina do condutor metálico, transferindo integralmente seu quantum de ação eletrodinâmica.`;
      svgContent = `
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#030712" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="metalLattice" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#334155" />
            <stop offset="100%" stop-color="#1e293b" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />

        <!-- Superfície Metálica (Rede Cristalina) -->
        <rect x="60" y="380" width="680" height="170" rx="12" fill="url(#metalLattice)" stroke="#475569" stroke-width="2" />

        <!-- Íons positivos da rede metálica -->
        <g fill="#64748b" opacity="0.6">
          <circle cx="120" cy="440" r="16" />
          <circle cx="200" cy="440" r="16" />
          <circle cx="280" cy="440" r="16" />
          <circle cx="360" cy="440" r="16" />
          <circle cx="440" cy="440" r="16" />
          <circle cx="520" cy="440" r="16" />
          <circle cx="600" cy="440" r="16" />
          <circle cx="680" cy="440" r="16" />

          <circle cx="160" cy="500" r="16" />
          <circle cx="240" cy="500" r="16" />
          <circle cx="320" cy="500" r="16" />
          <circle cx="400" cy="500" r="16" />
          <circle cx="480" cy="500" r="16" />
          <circle cx="560" cy="500" r="16" />
          <circle cx="640" cy="500" r="16" />
        </g>

        <!-- Elétrons Livres Ligados na Superfície -->
        <g filter="url(#glow)">
          <circle cx="240" cy="380" r="12" fill="#38bdf8" />
          <circle cx="360" cy="380" r="12" fill="#38bdf8" />
          <circle cx="480" cy="380" r="12" fill="#38bdf8" />
        </g>

        <!-- Trem de Ondas Localizadas (Fóton Incidente) -->
        <g transform="translate(120, 100) rotate(35)" filter="url(#glow)">
          <path d="M 0 0 Q 30 -45 60 0 T 120 0 T 180 0 T 240 0 T 300 0" fill="none" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
          <polygon points="310,0 290,-12 290,12" fill="#f59e0b" />
          <!-- Envelope Gaussiano de onda -->
          <circle cx="150" cy="0" r="36" fill="#f59e0b" fill-opacity="0.25" />
          <circle cx="150" cy="0" r="14" fill="#fbbf24" />
        </g>

        <!-- Fotoelétron Ejetado Ascendente -->
        <g transform="translate(480, 240)" filter="url(#glow)">
          <line x1="0" y1="120" x2="80" y2="-80" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
          <polygon points="80,-80 58,-72 68,-60" fill="#38bdf8" />
          <circle cx="40" cy="20" r="14" fill="#0284c7" />
          <circle cx="80" cy="-80" r="18" fill="#38bdf8" />
          <circle cx="80" cy="-80" r="7" fill="#ffffff" />
        </g>
      `;
    }
  }

  // 2. TRANSMISSÃO SINÁPTICA E NEUROCIÊNCIA (Sinapse, Vesícula, Receptores, LTP)
  else if (
    cId.includes('sinap') ||
    cId.includes('neuro') ||
    cName.includes('sináp') ||
    cName.includes('sinap') ||
    cName.includes('neurônio') ||
    cName.includes('plasticidade')
  ) {
    if (modality === 'process_mechanism') {
      titlePrefix = 'Mecanismo & Processo';
      defaultCaption = `Mecanismo Dinâmico da Transmissão Sináptica Química: (1) Despolarização axonal e influxo de cálcio no terminal pré-sináptico; (2) Ancoragem e fusão de vesículas sinápticas (exocitose); (3) Difusão direcional de neurotransmissores através da fenda sináptica; (4) Acoplamento a receptores da densidade pós-sináptica gerando potenciais pós-sinápticos unidirecionais.`;
      svgContent = `
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#020617" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="axonTerminalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b" />
            <stop offset="70%" stop-color="#312e81" />
            <stop offset="100%" stop-color="#4338ca" />
          </linearGradient>
          <linearGradient id="postMembraneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#1e293b" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />

        <!-- 1. TERMINAL AXÔNICO PRÉ-SINÁPTICO (SUPERIOR) -->
        <path d="M 280 20 L 520 20 L 520 120 C 660 160 690 310 560 340 L 240 340 C 110 310 140 160 280 120 Z" fill="url(#axonTerminalGrad)" stroke="#6366f1" stroke-width="3" />

        <!-- Vetor Direcional do Potencial de Ação Descendente (Pré -> Pós) -->
        <g transform="translate(400, 50)" filter="url(#glow)">
          <line x1="0" y1="0" x2="0" y2="70" stroke="#f59e0b" stroke-width="4" stroke-dasharray="6,4" />
          <polygon points="0,80 -8,65 8,65" fill="#f59e0b" />
          <!-- Ondas de despolarização -->
          <circle cx="0" cy="40" r="18" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.6" />
        </g>

        <!-- Canais de Cálcio Dependentes de Voltagem (Cav) Laterais -->
        <g stroke="#10b981" stroke-width="3" fill="#065f46" filter="url(#glow)">
          <!-- Canal Esquerdo -->
          <rect x="180" y="270" width="22" height="36" rx="4" />
          <path d="M 140 288 L 175 288" stroke="#34d399" stroke-width="3" stroke-dasharray="3,3" />
          <polygon points="178,288 168,283 168,293" fill="#34d399" />
          <!-- Íons Ca2+ entrando -->
          <circle cx="150" cy="288" r="5" fill="#34d399" />
          <circle cx="165" cy="288" r="4" fill="#6ee7b7" />

          <!-- Canal Direito -->
          <rect x="598" y="270" width="22" height="36" rx="4" />
          <path d="M 660 288 L 625 288" stroke="#34d399" stroke-width="3" stroke-dasharray="3,3" />
          <polygon points="622,288 632,283 632,293" fill="#34d399" />
          <!-- Íons Ca2+ entrando -->
          <circle cx="650" cy="288" r="5" fill="#34d399" />
          <circle cx="635" cy="288" r="4" fill="#6ee7b7" />
        </g>

        <!-- 2. VESÍCULAS PRÉ-SINÁPTICAS (POOL DE RESERVA E ZONA ATIVA) -->
        <g filter="url(#glow)">
          <!-- Vesícula Pool 1 -->
          <circle cx="310" cy="180" r="24" fill="#1e3a8a" fill-opacity="0.5" stroke="#3b82f6" stroke-width="2.5" />
          <circle cx="305" cy="175" r="4" fill="#93c5fd" />
          <circle cx="318" cy="185" r="4" fill="#93c5fd" />
          <circle cx="310" cy="190" r="3.5" fill="#93c5fd" />

          <!-- Vesícula Pool 2 -->
          <circle cx="480" cy="180" r="24" fill="#1e3a8a" fill-opacity="0.5" stroke="#3b82f6" stroke-width="2.5" />
          <circle cx="475" cy="175" r="4" fill="#93c5fd" />
          <circle cx="488" cy="185" r="4" fill="#93c5fd" />
          <circle cx="480" cy="190" r="3.5" fill="#93c5fd" />

          <!-- Vesícula Ancorada (Docking na Zona Ativa) -->
          <circle cx="290" cy="310" r="20" fill="#2563eb" fill-opacity="0.6" stroke="#60a5fa" stroke-width="3" />
          <circle cx="286" cy="306" r="3.5" fill="#bfdbfe" />
          <circle cx="295" cy="314" r="3.5" fill="#bfdbfe" />

          <!-- Vesícula em Fusão e Exocitose (Complexo SNARE Aberto) -->
          <path d="M 380 330 C 375 350 425 350 420 330 C 418 310 382 310 380 330 Z" fill="#7c3aed" stroke="#a78bfa" stroke-width="3" />
          <circle cx="395" cy="328" r="4" fill="#ffffff" />
          <circle cx="405" cy="332" r="4" fill="#ffffff" />

          <!-- Outra vesícula em docking à direita -->
          <circle cx="510" cy="310" r="20" fill="#2563eb" fill-opacity="0.6" stroke="#60a5fa" stroke-width="3" />
          <circle cx="506" cy="306" r="3.5" fill="#bfdbfe" />
          <circle cx="515" cy="314" r="3.5" fill="#bfdbfe" />
        </g>

        <!-- 3. FENDA SINÁPTICA (ESPAÇO INTERCELULAR COM DIFUSÃO DIRECIONAL) -->
        <rect x="100" y="348" width="600" height="92" rx="10" fill="#a855f7" fill-opacity="0.06" stroke="#475569" stroke-width="1" stroke-dasharray="4,4" />

        <!-- Vetores Verticais de Migração dos Neurotransmissores -->
        <g stroke="#38bdf8" stroke-width="2" stroke-dasharray="4,3" opacity="0.6">
          <line x1="330" y1="355" x2="330" y2="425" />
          <line x1="400" y1="355" x2="400" y2="425" />
          <line x1="470" y1="355" x2="470" y2="425" />
        </g>

        <!-- Neurotransmissores Difundindo na Fenda -->
        <g fill="#38bdf8" filter="url(#glow)">
          <circle cx="390" cy="365" r="5" />
          <circle cx="410" cy="368" r="5.5" />
          <circle cx="370" cy="385" r="5" />
          <circle cx="400" cy="392" r="6" />
          <circle cx="430" cy="382" r="5.5" />
          <circle cx="350" cy="410" r="5" />
          <circle cx="400" cy="415" r="6" />
          <circle cx="450" cy="410" r="5" />
          <circle cx="480" cy="395" r="5.5" />
          <circle cx="320" cy="400" r="5" />
        </g>

        <!-- 4. MEMBRANA PÓS-SINÁPTICA E RECEPTORES ESPECÍFICOS -->
        <path d="M 60 445 C 240 435 560 435 740 445 L 740 570 L 60 570 Z" fill="url(#postMembraneGrad)" stroke="#8b5cf6" stroke-width="4" />

        <!-- Densidade Pós-Sináptica (PSD) -->
        <path d="M 120 452 C 280 445 520 445 680 452" stroke="#c084fc" stroke-width="4" stroke-opacity="0.5" />

        <!-- Receptores Pós-Sinápticos (Canais com Sítio de Ligação) -->
        <!-- Receptor 1: Ionotrópico em Repouso -->
        <g transform="translate(260, 435)" filter="url(#glow)">
          <path d="M 0 0 L 0 25 L 34 25 L 34 0" fill="#4c0519" stroke="#f43f5e" stroke-width="3" />
          <path d="M 7 0 L 7 12 L 27 12 L 27 0" fill="#020617" stroke="#f43f5e" stroke-width="2" />
        </g>

        <!-- Receptor 2: Ativado com Ligante Acoplado e Poro Iônico Aberto -->
        <g transform="translate(383, 435)" filter="url(#glow)">
          <path d="M -5 0 L -5 32 L 39 32 L 39 0" fill="#831843" stroke="#ec4899" stroke-width="3.5" />
          <circle cx="17" cy="0" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
          <!-- Efluxo/Influxo de Íons pelo Poro Central Aberto -->
          <line x1="17" y1="12" x2="17" y2="60" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-dasharray="4,3" />
          <polygon points="17,65 12,52 22,52" fill="#38bdf8" />
          <circle cx="17" cy="45" r="4" fill="#67e8f9" />
        </g>

        <!-- Receptor 3: Ativado com Ligante -->
        <g transform="translate(506, 435)" filter="url(#glow)">
          <path d="M -5 0 L -5 32 L 39 32 L 39 0" fill="#831843" stroke="#ec4899" stroke-width="3.5" />
          <circle cx="17" cy="0" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />
          <line x1="17" y1="12" x2="17" y2="60" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-dasharray="4,3" />
          <polygon points="17,65 12,52 22,52" fill="#38bdf8" />
          <circle cx="17" cy="45" r="4" fill="#67e8f9" />
        </g>

        <!-- Indicador Geral de Unidirecionalidade (Vetor Macro Lateral) -->
        <g transform="translate(730, 260)" filter="url(#glow)">
          <line x1="0" y1="0" x2="0" y2="100" stroke="#a855f7" stroke-width="4" stroke-dasharray="8,6" />
          <polygon points="0,110 -7,95 7,95" fill="#a855f7" />
          <circle cx="0" cy="0" r="6" fill="#c084fc" />
        </g>
      `;
    } else {
      titlePrefix = modality === 'visual_analogy' ? 'Analogia Visual' : 'Ilustração Conceitual';
      defaultCaption = `Representação da Transmissão Sináptica e Comunicação Eletroquímica: Terminal axônico pré-sináptico, vesículas de neurotransmissores e fenda sináptica acoplada a receptores pós-sinápticos específicos.`;
      svgContent = `
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#020617" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
          <linearGradient id="axonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b" />
            <stop offset="100%" stop-color="#4338ca" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="800" height="600" fill="url(#bg)" />

        <!-- Botão Terminal Pré-Sináptico -->
        <path d="M 250 40 L 550 40 L 550 160 C 650 200 680 320 560 360 L 240 360 C 120 320 150 200 250 160 Z" fill="url(#axonGrad)" stroke="#6366f1" stroke-width="4" />

        <!-- Membrana Pós-Sináptica -->
        <path d="M 80 470 C 240 450 560 450 720 470 L 720 560 L 80 560 Z" fill="#0f172a" stroke="#8b5cf6" stroke-width="4" />

        <!-- Fenda Sináptica (Gradiente Luminescente) -->
        <rect x="180" y="375" width="440" height="75" rx="8" fill="#a855f7" fill-opacity="0.08" />

        <!-- Vesículas Sinápticas -->
        <g filter="url(#glow)">
          <circle cx="320" cy="220" r="26" fill="#3b82f6" fill-opacity="0.3" stroke="#60a5fa" stroke-width="3" />
          <circle cx="315" cy="215" r="5" fill="#93c5fd" />
          <circle cx="328" cy="225" r="5" fill="#93c5fd" />

          <circle cx="440" cy="240" r="28" fill="#3b82f6" fill-opacity="0.3" stroke="#60a5fa" stroke-width="3" />
          <circle cx="435" cy="235" r="5" fill="#93c5fd" />
          <circle cx="448" cy="245" r="5" fill="#93c5fd" />

          <!-- Vesícula em Exocitose / Fusão na Membrana -->
          <circle cx="380" cy="355" r="18" fill="#a855f7" stroke="#c084fc" stroke-width="3" />
        </g>

        <!-- Neurotransmissores na Fenda -->
        <g fill="#38bdf8" filter="url(#glow)">
          <circle cx="340" cy="395" r="6" />
          <circle cx="370" cy="410" r="7" />
          <circle cx="400" cy="390" r="6" />
          <circle cx="430" cy="415" r="7" />
          <circle cx="470" cy="400" r="6" />
        </g>

        <!-- Receptores Pós-Sinápticos (Canais Iônicos) -->
        <g stroke="#ec4899" stroke-width="4" fill="#831843" filter="url(#glow)">
          <path d="M 280 460 L 280 485 L 320 485 L 320 460" />
          <path d="M 380 460 L 380 485 L 420 485 L 420 460" />
          <path d="M 480 460 L 480 485 L 520 485 L 520 460" />
        </g>
      `;
    }
  }

  // 3. ADMINISTRAÇÃO E TOMADA DE DECISÃO (Herbert Simon, Racionalidade Limitada)
  else if (
    cId.includes('simon') ||
    cId.includes('racional') ||
    cName.includes('racionalidade') ||
    cName.includes('decisão') ||
    cName.includes('heuríst')
  ) {
    titlePrefix = modality === 'visual_analogy' ? 'Analogia Visual' : modality === 'process_mechanism' ? 'Mecanismo & Processo' : 'Ilustração Conceitual';
    defaultCaption = `Modelo da Racionalidade Limitada (Herbert A. Simon): Busca heurística sequencial restrita por horizontes de informação finitos, delimitada por um limiar de satisfação ("satisficing") em oposição à otimização irrealista.`;
    svgContent = `
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="800" height="600" fill="url(#bg)" />

      <!-- Espaço Global Infinito (Nuvem de Incerteza) -->
      <circle cx="400" cy="300" r="260" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="8,6" opacity="0.4" />
      <circle cx="400" cy="300" r="210" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="6,4" opacity="0.6" />

      <!-- Fronteira da Capacidade Cognitiva (Racionalidade Limitada) -->
      <rect x="220" y="160" width="360" height="300" rx="28" fill="#1e1b4b" fill-opacity="0.4" stroke="#6366f1" stroke-width="4" filter="url(#glow)" />

      <!-- Árvore de Decisão Heurística Confinada -->
      <g stroke="#38bdf8" stroke-width="4" stroke-linecap="round" filter="url(#glow)">
        <line x1="400" y1="410" x2="400" y2="330" />
        <line x1="400" y1="330" x2="320" y2="260" />
        <line x1="400" y1="330" x2="480" y2="260" />
        <line x1="320" y1="260" x2="280" y2="200" />
        <line x1="320" y1="260" x2="350" y2="200" />
      </g>

      <!-- Limiar de Satisfação (Satisficing Boundary) -->
      <line x1="200" y1="230" x2="600" y2="230" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8,6" filter="url(#glow)" />

      <!-- Nós de Avaliação -->
      <g filter="url(#glow)">
        <circle cx="400" cy="410" r="14" fill="#6366f1" />
        <circle cx="400" cy="330" r="12" fill="#38bdf8" />
        <circle cx="320" cy="260" r="12" fill="#38bdf8" />
        <circle cx="480" cy="260" r="12" fill="#64748b" opacity="0.5" />

        <!-- Solução Satisfatória Selecionada -->
        <circle cx="280" cy="200" r="18" fill="#10b981" />
        <circle cx="280" cy="200" r="7" fill="#ffffff" />
      </g>
    `;
  }

  // 4. MODELO CANÔNICO GERAL PARA QUALQUER CONCEITO (Sem texto interno, pura geometria cognitiva)
  else {
    titlePrefix = modality === 'visual_analogy' ? 'Analogia Visual' : modality === 'process_mechanism' ? 'Mecanismo & Processo' : 'Ilustração Conceitual';
    defaultCaption = `Representação Didática Estruturada para "${conceptName}". Modelo iconográfico que articula componentes essenciais, dinâmicas de fluxo e relações causais em conformidade visual.`;
    svgContent = `
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="100%" stop-color="#0b1329" />
        </linearGradient>
        <radialGradient id="centerCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#67e8f9" />
          <stop offset="60%" stop-color="#0284c7" />
          <stop offset="100%" stop-color="#0369a1" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="800" height="600" fill="url(#bg)" />

      <!-- Órbitas e Linhas de Conexão -->
      <circle cx="400" cy="300" r="170" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="6,6" opacity="0.6" />
      <circle cx="400" cy="300" r="230" fill="none" stroke="#1e293b" stroke-width="2" opacity="0.5" />

      <!-- Vetores Radiais de Relação -->
      <g stroke="#38bdf8" stroke-width="3" stroke-linecap="round" opacity="0.7" filter="url(#glow)">
        <line x1="400" y1="300" x2="270" y2="170" />
        <line x1="400" y1="300" x2="530" y2="170" />
        <line x1="400" y1="300" x2="530" y2="430" />
        <line x1="400" y1="300" x2="270" y2="430" />
      </g>

      <!-- Núcleo Conceitual Central -->
      <g filter="url(#glow)">
        <circle cx="400" cy="300" r="60" fill="url(#centerCore)" />
        <circle cx="400" cy="300" r="75" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="8,4" />
        <circle cx="400" cy="300" r="22" fill="#ffffff" />
      </g>

      <!-- Componentes Satélites Periféricos -->
      <g filter="url(#glow)">
        <circle cx="270" cy="170" r="32" fill="#a855f7" />
        <circle cx="270" cy="170" r="14" fill="#ffffff" />

        <circle cx="530" cy="170" r="32" fill="#f59e0b" />
        <circle cx="530" cy="170" r="14" fill="#ffffff" />

        <circle cx="530" cy="430" r="32" fill="#10b981" />
        <circle cx="530" cy="430" r="14" fill="#ffffff" />

        <circle cx="270" cy="430" r="32" fill="#ec4899" />
        <circle cx="270" cy="430" r="14" fill="#ffffff" />
      </g>
    `;
  }

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">${svgContent}</svg>`;
  const base64Data = typeof Buffer !== 'undefined'
    ? Buffer.from(fullSvg).toString('base64')
    : btoa(unescape(encodeURIComponent(fullSvg)));
  const dataUrl = `data:image/svg+xml;base64,${base64Data}`;
  const title = `${titlePrefix}: ${conceptName}`;

  return {
    svg: fullSvg,
    dataUrl,
    title,
    caption: defaultCaption,
  };
}

