import React from 'react';
import {
  Brain,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  Layers,
  Award,
} from 'lucide-react';
import type { LongitudinalReviewSummary } from '../../types';
import { getMasteryLevelMeta, getDiagnosticStateMeta } from '../../utils/pedagogicalLabels';
import { formatFriendlyReviewDue } from '../../services/learning/spacedRepetitionService';

interface LongitudinalReviewDashboardProps {
  summary: LongitudinalReviewSummary;
  onSelectConceptToReview?: (conceptId: string) => void;
  onEnrollConcept?: (conceptId: string) => void;
}

export const LongitudinalReviewDashboard: React.FC<LongitudinalReviewDashboardProps> = ({
  summary,
  onSelectConceptToReview,
  onEnrollConcept,
}) => {
  const total = summary.totalReviewsDone || 0;
  const ratingDist = summary.ratingDistribution;

  const pctAgain = total > 0 ? Math.round((ratingDist.again / total) * 100) : 0;
  const pctHard = total > 0 ? Math.round((ratingDist.hard / total) * 100) : 0;
  const pctGood = total > 0 ? Math.round((ratingDist.good / total) * 100) : 0;
  const pctEasy = total > 0 ? Math.round((ratingDist.easy / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Acompanhados</span>
            <Brain className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{summary.totalTrackedConcepts}</span>
            <span className="text-[11px] text-slate-400">
              ({summary.untrackedConceptsCount} não agendados)
            </span>
          </div>
          <div className="text-[10.5px] text-slate-400">Modelo FSRS-7 ativo</div>
        </div>

        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Revisões Realizadas</span>
            <RotateCcw className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{summary.totalReviewsDone}</span>
            <span className="text-[11px] text-slate-400">sessões</span>
          </div>
          <div className="text-[10.5px] text-slate-400">Histórico longitudinal</div>
        </div>

        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Taxa de Recuperação</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {Math.round(summary.correctRetrievalRate * 100)}%
            </span>
            <span className="text-[11px] text-slate-400">acertos</span>
          </div>
          <div className="text-[10.5px] text-slate-400">Classificações Good + Easy</div>
        </div>

        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Retrievability Média</span>
            <TrendingUp className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-violet-300">
              {Math.round(summary.averageEstimatedRetrievability * 100)}%
            </span>
            <span className="text-[11px] text-slate-400">estimada</span>
          </div>
          <div className="text-[10.5px] text-slate-400">Curva de esquecimento FSRS</div>
        </div>
      </div>

      {/* Distribuição de Avaliações FSRS */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            Distribuição de Desempenho nas Evocações (FSRS-7)
          </h4>
          <span className="text-[11px] text-slate-400">Total: {total} revisões</span>
        </div>

        {total === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            Nenhuma revisão realizada ainda. As estatísticas serão calculadas após a primeira sessão de recuperação.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Barra empilhada */}
            <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex">
              {pctAgain > 0 && (
                <div
                  style={{ width: `${pctAgain}%` }}
                  className="bg-rose-500 h-full"
                  title={`Again: ${ratingDist.again} (${pctAgain}%)`}
                />
              )}
              {pctHard > 0 && (
                <div
                  style={{ width: `${pctHard}%` }}
                  className="bg-amber-500 h-full"
                  title={`Hard: ${ratingDist.hard} (${pctHard}%)`}
                />
              )}
              {pctGood > 0 && (
                <div
                  style={{ width: `${pctGood}%` }}
                  className="bg-emerald-500 h-full"
                  title={`Good: ${ratingDist.good} (${pctGood}%)`}
                />
              )}
              {pctEasy > 0 && (
                <div
                  style={{ width: `${pctEasy}%` }}
                  className="bg-cyan-500 h-full"
                  title={`Easy: ${ratingDist.easy} (${pctEasy}%)`}
                />
              )}
            </div>

            {/* Legenda de Distribuição */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="flex items-center gap-2 p-2 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <div>
                  <div className="font-semibold text-rose-300">Again: {ratingDist.again}</div>
                  <div className="text-[10px] text-slate-400">{pctAgain}% (Falha)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-300">Hard: {ratingDist.hard}</div>
                  <div className="text-[10px] text-slate-400">{pctHard}% (Difícil/Dica)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-300">Good: {ratingDist.good}</div>
                  <div className="text-[10px] text-slate-400">{pctGood}% (Correta)</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0" />
                <div>
                  <div className="font-semibold text-cyan-300">Easy: {ratingDist.easy}</div>
                  <div className="text-[10px] text-slate-400">{pctEasy}% (Fluida)</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alerta Epistemológico de Diferenciação */}
      <div className="p-3.5 bg-indigo-950/30 border border-indigo-800/40 rounded-xl flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-slate-300 leading-relaxed text-[11.5px]">
          <span className="font-semibold text-indigo-300">
            Diferenciação Epistemológica Estrita (Governança NeuroClass AI):
          </span>
          <p>
            1. <strong>Desempenho Real Observado:</strong> Registra os acertos, falhas e respostas literais do estudante.{' '}
            2. <strong>Recuperabilidade Estimada:</strong> Previsão estatística matemática da curva de retenção do modelo FSRS-7, que NÃO constitui medição biológica da memória.{' '}
            3. <strong>Domínio Cognitivo:</strong> Determinado com autonomia pelo <code>masteryEngine</code>. Um atraso de revisão ou baixa estimativa matemática NÃO degrada nem revoga o estado consolidado de <em>Dominado (Mastered)</em>.
          </p>
        </div>
      </div>

      {/* Tabela de Detalhamento por Conceito */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            Estado Longitudinal por Conceito ({summary.conceptsBreakdown.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="pb-2 font-semibold">Conceito</th>
                <th className="pb-2 font-semibold">Próxima Revisão</th>
                <th className="pb-2 font-semibold">Estabilidade (S)</th>
                <th className="pb-2 font-semibold">Dificuldade (D)</th>
                <th className="pb-2 font-semibold">Retenção Estimada</th>
                <th className="pb-2 font-semibold">Domínio Cognitivo</th>
                <th className="pb-2 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {summary.conceptsBreakdown.map(item => {
                const masteryMeta = getMasteryLevelMeta(item.masteryLevel);
                const diagMeta = getDiagnosticStateMeta(item.diagnosticState);
                const dueInfo = item.nextReviewDue
                  ? formatFriendlyReviewDue(item.nextReviewDue)
                  : null;

                return (
                  <tr key={item.conceptId} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-2.5 pr-2">
                      <div className="font-semibold text-slate-200">{item.conceptName}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.isFundamental ? 'Fundamental' : 'Complementar'} • {item.totalReviews} revisões
                      </div>
                    </td>
                    <td className="py-2.5 pr-2">
                      {dueInfo ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${dueInfo.colorClass}`}
                        >
                          {dueInfo.label}
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-slate-400 italic">Não agendado</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-slate-300">
                      {item.stabilityDays !== null ? `${item.stabilityDays} dias` : '—'}
                    </td>
                    <td className="py-2.5 pr-2 text-slate-300">
                      {item.difficulty !== null ? `${item.difficulty}/10` : '—'}
                    </td>
                    <td className="py-2.5 pr-2">
                      {item.estimatedRetrievability !== null ? (
                        <span
                          className={`font-semibold ${
                            item.estimatedRetrievability >= 0.9
                              ? 'text-emerald-400'
                              : item.estimatedRetrievability >= 0.7
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {Math.round(item.estimatedRetrievability * 100)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${diagMeta.badgeClass}`}
                        >
                          {diagMeta.label}
                        </span>
                        <span className="text-[10px] text-slate-400">({masteryMeta.label})</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      {item.status === 'untracked' ? (
                        <button
                          type="button"
                          onClick={() => onEnrollConcept && onEnrollConcept(item.conceptId)}
                          className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/80 text-cyan-300 rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer"
                        >
                          Agendar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectConceptToReview && onSelectConceptToReview(item.conceptId)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10.5px] font-semibold transition-all cursor-pointer"
                        >
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
