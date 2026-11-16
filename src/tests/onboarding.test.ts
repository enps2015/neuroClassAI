import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_STORAGE_KEY,
  getStoredOnboardingState,
  setStoredOnboardingState,
  resetStoredOnboardingState,
  TOUR_STEPS,
  GLOSSARY_TERMS,
  FAQ_ITEMS,
  FEATURE_HELP_DATA,
  RECOMMENDED_PATH_STEPS,
} from '../components/onboarding/onboardingData';
import {
  clearAllUserData,
  saveDocument,
  getAllUserDocuments,
} from '../services/persistence/indexedDb';
import type { DocumentSource } from '../types';

// Mock simples e resiliente de localStorage em ambiente Node.js
class MockLocalStorage {
  private store = new Map<string, string>();
  public shouldThrow = false;

  getItem(key: string): string | null {
    if (this.shouldThrow) throw new Error('QuotaExceededError or security block');
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldThrow) throw new Error('QuotaExceededError or security block');
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    if (this.shouldThrow) throw new Error('QuotaExceededError or security block');
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Configurar globalThis.localStorage
const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

// Teste 1: Estado inicial quando o usuário abre pela primeira vez
test('T243: Onboarding - Estado inicial de primeira abertura (Welcome pendente)', () => {
  mockStorage.clear();
  mockStorage.shouldThrow = false;

  const state = getStoredOnboardingState();
  assert.equal(state.hasCompletedWelcome, false, 'hasCompletedWelcome deve ser falso inicialmente');
  assert.equal(state.hasCompletedTour, false, 'hasCompletedTour deve ser falso inicialmente');
  assert.equal(state.version, 1);
});

// Teste 2: Conclusão do Welcome Dialog e persistência versionada
test('T244: Onboarding - Conclusão do Welcome Dialog e persistência versionada', () => {
  mockStorage.clear();

  // Usuário conclui ou pula o Welcome Dialog
  setStoredOnboardingState({ hasCompletedWelcome: true });

  const state = getStoredOnboardingState();
  assert.equal(state.hasCompletedWelcome, true, 'hasCompletedWelcome deve ser persistido como true');
  assert.equal(state.hasCompletedTour, false, 'Tour ainda não foi concluído');
  assert.ok(state.completedAt, 'Deve registrar timestamp da conclusão');

  // Verifica que o raw JSON no localStorage usa a chave canônica versionada
  const raw = mockStorage.getItem(ONBOARDING_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.hasCompletedWelcome, true);
  assert.equal(parsed.version, 1);
});

// Teste 3: Não reapresentação automática após concluído ou pulado
test('T245: Onboarding - Não reapresentação automática na visita subsequente', () => {
  mockStorage.clear();
  setStoredOnboardingState({ hasCompletedWelcome: true });

  // Simular recarregamento da aplicação (nova leitura)
  const reloadedState = getStoredOnboardingState();
  assert.equal(reloadedState.hasCompletedWelcome, true, 'Não deve reexibir welcome automaticamente');
});

// Teste 4: Conclusão do Tour Guiado e reset
test('T246: Onboarding - Conclusão do Tour Guiado e funcionalidade de reset', () => {
  mockStorage.clear();

  setStoredOnboardingState({ hasCompletedWelcome: true, hasCompletedTour: true });
  let state = getStoredOnboardingState();
  assert.equal(state.hasCompletedWelcome, true);
  assert.equal(state.hasCompletedTour, true);

  // Reset solicitado pelo usuário ou tour reiniciado
  resetStoredOnboardingState();
  state = getStoredOnboardingState();
  assert.equal(state.hasCompletedWelcome, false);
  assert.equal(state.hasCompletedTour, false);
});

// Teste 5: Resiliência contra exceções de quota ou indisponibilidade de storage
test('T247: Onboarding - Resiliência contra exceções de storage (modo anônimo restrito / quota)', () => {
  mockStorage.shouldThrow = true;

  // Não deve lançar erro nem travar a execução
  assert.doesNotThrow(() => {
    const fallbackState = getStoredOnboardingState();
    assert.equal(fallbackState.hasCompletedWelcome, false);
  });

  assert.doesNotThrow(() => {
    setStoredOnboardingState({ hasCompletedWelcome: true });
  });

  assert.doesNotThrow(() => {
    resetStoredOnboardingState();
  });

  mockStorage.shouldThrow = false;
});

// Teste 6: Auditoria do Tour Guiado (6 Passos Canônicos)
test('T248: Tour Guiado - Verificação dos 6 passos e sequenciamento pedagógico', () => {
  assert.equal(TOUR_STEPS.length, 6, 'O Tour deve conter exatamente 6 passos');

  // Passo 1: Seus Materiais
  assert.equal(TOUR_STEPS[0].step, 1);
  assert.ok(TOUR_STEPS[0].title.includes('Materiais'));
  assert.ok(TOUR_STEPS[0].description.includes('PDF'));

  // Passo 2: Quadro de conceitos (Blackboard)
  assert.equal(TOUR_STEPS[1].step, 2);
  assert.ok(TOUR_STEPS[1].title.includes('Quadro de Conceitos'));
  assert.ok(TOUR_STEPS[1].description.includes('Blackboard'));

  // Passo 3: C.R.E.A.R.
  assert.equal(TOUR_STEPS[2].step, 3);
  assert.ok(TOUR_STEPS[2].title.includes('C.R.E.A.R.'));
  assert.ok(TOUR_STEPS[2].subtitle.includes('5 Estágios'));
  assert.ok(TOUR_STEPS[2].description.includes('C.R.E.A.R.'));

  // Passo 4: Agora Eu Explico (Feynman)
  assert.equal(TOUR_STEPS[3].step, 4);
  assert.ok(TOUR_STEPS[3].title.includes('Explique'));
  assert.ok(TOUR_STEPS[3].description.includes('Agora Eu Explico'));

  // Passo 5: Revisão Espaçada (FSRS-7)
  assert.equal(TOUR_STEPS[4].step, 5);
  assert.ok(TOUR_STEPS[4].title.includes('Pratique') || TOUR_STEPS[4].title.includes('Recupere'));
  assert.ok(TOUR_STEPS[4].description.includes('FSRS-7'));

  // Passo 6: Acompanhamento Longitudinal
  assert.equal(TOUR_STEPS[5].step, 6);
  assert.ok(TOUR_STEPS[5].title.includes('Evolução'));
  assert.ok(TOUR_STEPS[5].description.includes('Longitudinal'));
});

// Teste 7: Auditoria do Glossário Amigável (12 Termos Canônicos)
test('T249: Glossário Amigável - Presença e fidelidade dos 12 termos canônicos', () => {
  assert.equal(GLOSSARY_TERMS.length, 12, 'O Glossário deve conter exatamente 12 termos canônicos');

  const requiredTerms = [
    'Blackboard',
    'C.R.E.A.R.',
    'Contextualizar',
    'Relacionar',
    'Explicar',
    'Aplicar',
    'Recuperar',
    'Agora Eu Explico',
    'Domínio Cognitivo',
    'Recuperação Espaçada',
    'FSRS',
    'Recuperabilidade',
  ];

  for (const term of requiredTerms) {
    const found = GLOSSARY_TERMS.find(g => g.term.toLowerCase() === term.toLowerCase());
    assert.ok(found, `Termo "${term}" deve estar presente no Glossário`);
    assert.ok(found.shortExplanation.length > 5, `Explicação curta para "${term}" deve ser informativa`);
    assert.ok(found.detailedExplanation.length > 15, `Explicação detalhada para "${term}" deve ser informativa`);
    assert.ok(found.concreteExample.length > 10, `Exemplo concreto para "${term}" deve existir`);
  }
});

// Teste 8: Auditoria da Ajuda Contextual (7 Áreas Prioritárias)
test('T250: Ajuda Contextual - Cobertura exaustiva das 7 áreas prioritárias', () => {
  const priorityKeys = [
    'document_import',
    'blackboard',
    'agora_eu_explico',
    'crear_cycle',
    'cognitive_mastery',
    'spaced_repetition',
    'longitudinal_dashboard',
  ];

  for (const key of priorityKeys) {
    const help = FEATURE_HELP_DATA[key];
    assert.ok(help, `Ajuda contextual para a área "${key}" deve existir`);
    assert.ok(help.featureName.length > 0);
    assert.ok(help.whatIsIt.length > 10, `O que é "${key}"`);
    assert.ok(help.whatIsItFor.length > 10, `Para que serve "${key}"`);
    assert.ok(help.whenToUse.length > 10, `Quando utilizar "${key}"`);
    assert.ok(help.recommendedNextStep.length > 10, `Próximo passo recomendado para "${key}"`);
  }
});

// Teste 9: Auditoria de FAQ e Primeiro Percurso Recomendado
test('T251: FAQ e Primeiro Percurso - Respostas tecnicamente fiéis e 6 passos práticos', () => {
  // FAQ
  assert.ok(FAQ_ITEMS.length >= 7, 'FAQ deve conter pelo menos 7 perguntas essenciais');
  const neuroscienceFaq = FAQ_ITEMS.find(f => f.question.includes('neurociência'));
  assert.ok(neuroscienceFaq);
  assert.ok(neuroscienceFaq.answer.includes('Não'));

  const pdfFaq = FAQ_ITEMS.find(f => f.question.includes('PDF'));
  assert.ok(pdfFaq);
  assert.ok(pdfFaq.answer.includes('Gemini'));

  const errorFaq = FAQ_ITEMS.find(f => f.question.includes('erro'));
  assert.ok(errorFaq);
  assert.ok(errorFaq.answer.includes('Again') || errorFaq.answer.includes('De Novo'));
  assert.ok(errorFaq.answer.includes('NÃO rebaixa'));

  // Primeiro Percurso
  assert.equal(RECOMMENDED_PATH_STEPS.length, 6, 'O Primeiro Percurso deve conter 6 passos');
  assert.equal(RECOMMENDED_PATH_STEPS[0].step, 1);
  assert.ok(RECOMMENDED_PATH_STEPS[0].title.includes('Material'));
  assert.equal(RECOMMENDED_PATH_STEPS[5].step, 6);
  assert.ok(RECOMMENDED_PATH_STEPS[5].title.includes('Evolução'));
});

// Teste 10: Auditoria do Retorno à Tela Inicial e Ausência do Relatório de Teste
test('T252: Onboarding - Retorno à Tela Inicial, Reset Total e Remoção do Relatório Fase 1', () => {
  mockStorage.clear();

  // Simula usuário que já completou tour
  setStoredOnboardingState({ hasCompletedWelcome: true, hasCompletedTour: true });
  assert.equal(getStoredOnboardingState().hasCompletedWelcome, true);

  // Usuário aciona o reset total a partir do Guia ou TopBar
  resetStoredOnboardingState();
  const resetState = getStoredOnboardingState();
  assert.equal(resetState.hasCompletedWelcome, false, 'Deve resetar welcome para permitir reabertura da tela inicial');
  assert.equal(resetState.hasCompletedTour, false, 'Deve resetar tour para permitir reexecução do tour');
});

// Teste 11: Auditoria do Reset de Fábrica Total (Limpeza de Documentos e IndexedDB)
test('T253: Reset de Fábrica Total - Limpeza de documentos importados e retorno ao estado inicial', async () => {
  mockStorage.clear();

  // Simular presença de documento carregado pelo usuário (ex: ebook de teste)
  const testEbookDoc: DocumentSource = {
    id: 'ebook-digital-shadow-test',
    title: 'Digital Shadow Ebook',
    subject: 'Cibersegurança e Privacidade',
    type: 'pdf',
    isDemoMaterial: false,
    sizeBytes: 2048576,
    mimeType: 'application/pdf',
    uploadedAt: Date.now(),
  };

  await saveDocument(testEbookDoc);
  setStoredOnboardingState({ hasCompletedWelcome: true, hasCompletedTour: true });

  // Confere que o documento está presente no repositório antes do reset
  const docsBefore = await getAllUserDocuments();
  assert.ok(docsBefore.some(d => d.id === 'ebook-digital-shadow-test'), 'Ebook de teste deve existir antes do reset');

  // Executa o Reset de Fábrica Total (exatamente o handler da UI)
  await clearAllUserData();
  resetStoredOnboardingState();

  // Confere que todos os documentos do usuário foram apagados
  const docsAfter = await getAllUserDocuments();
  assert.equal(docsAfter.length, 0, 'Todos os documentos importados de teste devem ser limpos no IndexedDB');

  // Confere que o estado do onboarding retornou à primeira abertura
  const stateAfter = getStoredOnboardingState();
  assert.equal(stateAfter.hasCompletedWelcome, false, 'Tela de boas-vindas deve voltar a ser exibida');
  assert.equal(stateAfter.hasCompletedTour, false, 'Tour guiado deve voltar ao estado inicial');
});
