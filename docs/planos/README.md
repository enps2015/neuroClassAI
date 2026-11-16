# NeuroClass AI — Especificações Arquiteturais e Planos de Implementação

Esta pasta reúne os planos de implementação, arquitetura de software e contratos epistemológicos formalizados durante o ciclo de desenvolvimento do NeuroClass AI.

---

## Documentos

| Arquivo | Versão | Descrição | Status no Repositório |
| :--- | :---: | :--- | :---: |
| [`fase1_implementation_plan_revisado2.md`](./fase1_implementation_plan_revisado2.md) | v2.2 | **Especificação canônica ativa:** Grafo conceitual concêntrico, contratos de tipagem, taxonomia de nós e rastreabilidade documental estrita. | **Vigente / Incluído** |
| `fase1_implementation_plan_revisado.md` | v2.0 | Revisão arquitetural introduzindo rigor epistemológico e prevenção de alucinação. | Histórico (Acervo local) |
| `fase1_implementation_plan.md` | v1.0 | Plano original de implementação da Fase 1 (extração, chunking, estruturação). | Histórico (Acervo local) |

---

## Relação com a Fase 2

Os planos acima serviram de alicerce conceitual para a Fase 2 (Aprendizagem Cognitiva e Avaliação):
- O grafo DAG e a classificação epistemológica (Fato Textual, Inferência, Extrapolação) foram estendidos para os motores cognitivos (`src/services/learning/masteryEngine.ts` e `src/services/learning/spacedRepetition.ts`).
- As homologações empíricas e auditorias estão documentadas em [`docs/relatorios/`](../relatorios/README.md).
