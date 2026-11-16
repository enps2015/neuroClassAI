import React, { useState, useEffect, useRef } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  StopCircle,
  Download,
  RefreshCw,
  Lock,
  ShieldCheck,
  Save,
  FileText,
  X,
  ChevronRight,
  Info,
  Sparkles,
  Database,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { AIKeyManager } from '../../services/ai/aiKeyManager';
import {
  fetchGoldenDatasetMetadata,
  runGoldenDatasetCase,
  saveGoldenDatasetResults,
  type GoldenDatasetMetaResponse,
  type GoldenDatasetRunCaseResponse,
} from '../../services/ai/aiClient';

export interface GoldenDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeyConfig?: () => void;
}

export const GoldenDatasetModal: React.FC<GoldenDatasetModalProps> = ({
  isOpen,
  onClose,
  onOpenApiKeyConfig,
}) => {
  const [hasApiKey, setHasApiKey] = useState<boolean>(AIKeyManager.hasApiKey());
  const [keySource, setKeySource] = useState<string>(AIKeyManager.getSource());
  const [datasetMeta, setDatasetMeta] = useState<GoldenDatasetMetaResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Estados de execução
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState<number>(-1);
  const [gd01Result, setGd01Result] = useState<GoldenDatasetRunCaseResponse | null>(null);
  const [runResults, setRunResults] = useState<Record<string, GoldenDatasetRunCaseResponse>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const abortRequestedRef = useRef<boolean>(false);

  // Sincroniza estado da chave em memória
  useEffect(() => {
    const unsub = AIKeyManager.subscribe((st) => {
      setHasApiKey(st.hasKey);
      setKeySource(st.source);
    });
    return unsub;
  }, []);

  // Carrega metadados do Golden Dataset quando aberto
  useEffect(() => {
    if (!isOpen) return;
    setLoadingMeta(true);
    setMetaError(null);
    fetchGoldenDatasetMetadata()
      .then((meta) => {
        setDatasetMeta(meta);
        setLoadingMeta(false);
      })
      .catch((err) => {
        setMetaError(err.message || 'Falha ao carregar metadados do Golden Dataset.');
        setLoadingMeta(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const cases = datasetMeta?.cases || [];

  /**
   * Executa a primeira validação obrigatória (Apenas o Cenário GD-01).
   */
  const handleRunSingleValidation = async () => {
    if (!cases.length) return;
    const firstCase = cases[0];
    setIsRunning(true);
    setErrorMessage(null);
    setCurrentRunningIndex(0);

    try {
      const result = await runGoldenDatasetCase(firstCase.caseId);
      setGd01Result(result);
      setRunResults((prev) => ({
        ...prev,
        [firstCase.caseId]: result,
      }));
    } catch (err: any) {
      setErrorMessage(
        err.message || `Erro HTTP ${err.status || 500} durante execução do cenário ${firstCase.caseId}.`
      );
    } finally {
      setIsRunning(false);
      setCurrentRunningIndex(-1);
    }
  };

  /**
   * Executa sequencialmente os 20 cenários restantes (GD-02 a GD-21),
   * sob autorização explícita do estudante, com interrupção em erros críticos.
   */
  const handleRunRemaining20Cases = async () => {
    if (cases.length <= 1) return;
    setIsRunning(true);
    setErrorMessage(null);
    abortRequestedRef.current = false;

    for (let i = 1; i < cases.length; i++) {
      if (abortRequestedRef.current) {
        setErrorMessage('Execução experimental interrompida manualmente pelo usuário.');
        break;
      }

      const c = cases[i];
      setCurrentRunningIndex(i);

      try {
        const result = await runGoldenDatasetCase(c.caseId);
        setRunResults((prev) => ({
          ...prev,
          [c.caseId]: result,
        }));

        // Pequena pausa respiratória (1 segundo) para evitar rajadas e rate limit
        await new Promise((res) => setTimeout(res, 1000));
      } catch (err: any) {
        const status = err.status || 500;
        setErrorMessage(
          `Interrupção de segurança no cenário [${i + 1}/21] ${c.caseId}: HTTP ${status} — ${
            err.message || 'Falha no modelo'
          }`
        );
        // Interrupção obrigatória em HTTP 401, 403 ou 429
        if (status === 401 || status === 403 || status === 429) {
          break;
        }
      }
    }

    setIsRunning(false);
    setCurrentRunningIndex(-1);
  };

  const handleStopExecution = () => {
    abortRequestedRef.current = true;
  };

  const handleSaveToDisk = async () => {
    const list = Object.values(runResults);
    if (list.length === 0) return;
    try {
      setSaveStatus('Salvando artefatos em experiments/p3-2-2-2/...');
      const res = await saveGoldenDatasetResults(list);
      setSaveStatus(`Artefatos consolidados com sucesso em ${res.savedPath} (${res.totalRecorded} cenários)!`);
    } catch (err: any) {
      setSaveStatus(`Erro ao salvar: ${err.message}`);
    }
  };

  const handleExportJson = () => {
    const list = Object.values(runResults);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(list, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `golden_dataset_run_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Métricas acumuladas
  const completedCount = Object.keys(runResults).length;
  const matchCount = Object.values(runResults).filter((r) => r.goldComparison?.isStatusMatch).length;
  const accuracyPercent = completedCount > 0 ? ((matchCount / completedCount) * 100).toFixed(1) : '0.0';
  const totalTokens = Object.values(runResults).reduce((acc, r) => acc + (r.tokens?.totalTokens || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md shadow-cyan-500/10">
              <FlaskConical className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Experimento Golden Dataset (Tier 2)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  gemini-3.5-flash-lite
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Missão P3.2.2.2
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Avaliação semântica controlada de 21 cenários canônicos utilizando a credencial BYOK ativa da sessão.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Banner de Estado da Credencial BYOK */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              hasApiKey
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {hasApiKey ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-xs font-semibold flex items-center gap-2">
                  <span>{hasApiKey ? 'Credencial BYOK Disponível em Memória' : 'Credencial BYOK Não Configurada'}</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-900/60 border border-slate-800 text-slate-300">
                    Origem: {keySource === 'byok' ? 'Chave do Estudante' : keySource === 'managed' ? 'Servidor Local' : 'Nenhuma'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {hasApiKey
                    ? 'A chave será transmitida via cabeçalho x-gemini-api-key exclusivamente durante as requisições ativas. Nenhuma gravação em disco.'
                    : 'Para executar o experimento com o modelo real, conecte sua chave no menu de Configurações da IA.'}
                </p>
              </div>
            </div>

            {!hasApiKey && onOpenApiKeyConfig && (
              <button
                onClick={onOpenApiKeyConfig}
                className="px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition-colors cursor-pointer shrink-0"
              >
                Conectar Chave Gemini
              </button>
            )}
          </div>

          {/* Erro global se houver */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Falha durante o experimento:</span>
                <p className="mt-0.5 text-rose-300 font-mono text-[11px]">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* FASE 1: VALIDAÇÃO INICIAL OBRIGATÓRIA (GD-01) */}
          <div className="p-5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-xs flex items-center justify-center border border-cyan-500/40">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Validação Inicial de Conectividade (Cenário GD-01)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Executa 1 única chamada controlada ao primeiro cenário para certificar o fluxo BYOK antes de liberar os demais.
                  </p>
                </div>
              </div>

              {!gd01Result && (
                <button
                  onClick={handleRunSingleValidation}
                  disabled={!hasApiKey || isRunning}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow transition-all cursor-pointer ${
                    !hasApiKey || isRunning
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20 border border-cyan-400/30'
                  }`}
                >
                  {isRunning && currentRunningIndex === 0 ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executando GD-01...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Testar Cenário GD-01</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Resultado do GD-01 */}
            {gd01Result && (
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">{gd01Result.caseId}</span>
                    <span className="text-[11px] text-slate-400">— {gd01Result.description}</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    HTTP {gd01Result.httpStatus} OK
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-slate-950/60 rounded border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">Classificação Obtida</span>
                    <span className="font-semibold text-cyan-300">{gd01Result.result?.status || 'N/A'}</span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">Gabarito Esperado</span>
                    <span className="font-semibold text-slate-200">
                      {gd01Result.goldComparison?.expectedStatus || 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">Concordância</span>
                    <span
                      className={`font-semibold ${
                        gd01Result.goldComparison?.isStatusMatch ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {gd01Result.goldComparison?.isStatusMatch ? '✔ MATCH' : '✖ MISMATCH'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-950/60 rounded border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">Latência & Tokens</span>
                    <span className="font-mono text-[11px] text-slate-300">
                      {gd01Result.latencyMs}ms ({gd01Result.tokens.totalTokens} tok)
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 italic bg-slate-950/40 p-2.5 rounded border border-slate-800/60">
                  <span className="font-semibold text-slate-300 not-italic">Justificativa do Modelo: </span>
                  {gd01Result.result?.rationale || 'Sem justificativa'}
                </div>
              </div>
            )}
          </div>

          {/* FASE 2: EXECUÇÃO DOS 20 CASOS RESTANTES */}
          {gd01Result && (
            <div className="p-5 bg-slate-950/40 border border-slate-800 rounded-xl space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 font-bold text-xs flex items-center justify-center border border-violet-500/40">
                    2
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Execução Autorizada dos 20 Casos Restantes (GD-02 a GD-21)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Processamento estritamente sequencial, 1 chamada por cenário, sem retries, parada automática em 401/403/429.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <button
                      onClick={handleStopExecution}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow transition-colors cursor-pointer"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>Interromper</span>
                    </button>
                  ) : (
                    completedCount < cases.length && (
                      <button
                        onClick={handleRunRemaining20Cases}
                        disabled={!hasApiKey || isRunning}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/20 transition-all cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Autorizar e Executar 20 Casos</span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Barra de Progresso e Métricas Globais */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Progresso: <strong className="text-white">{completedCount}</strong> de {cases.length} cenários concluídos
                  </span>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-400">
                      Acurácia: <strong className="text-emerald-400">{accuracyPercent}%</strong> ({matchCount}/{completedCount})
                    </span>
                    <span className="text-slate-400">
                      Tokens: <strong className="text-cyan-300">{totalTokens}</strong>
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-violet-500 h-2 transition-all duration-300"
                    style={{ width: `${(completedCount / cases.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Tabela de Casos */}
              <div className="border border-slate-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Cenário</th>
                      <th className="px-3 py-2">Predição</th>
                      <th className="px-3 py-2">Gabarito</th>
                      <th className="px-3 py-2">Match</th>
                      <th className="px-3 py-2">Latência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {cases.map((c, idx) => {
                      const res = runResults[c.caseId];
                      const isCurrent = currentRunningIndex === idx;

                      return (
                        <tr
                          key={c.caseId}
                          className={`hover:bg-slate-850/50 transition-colors ${
                            isCurrent ? 'bg-cyan-950/30' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2 font-sans font-medium text-slate-200">
                            <div className="flex items-center gap-1.5">
                              {isCurrent && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
                              <span>{c.caseId}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-cyan-300">
                            {res?.result?.status || (isCurrent ? 'Avaliando...' : '—')}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            {res?.goldComparison?.expectedStatus || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {res?.goldComparison ? (
                              res.goldComparison.isStatusMatch ? (
                                <span className="text-emerald-400 font-bold">✔</span>
                              ) : (
                                <span className="text-rose-400 font-bold">✖</span>
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {res ? `${res.latencyMs}ms` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botões de Ação Final */}
              {completedCount > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-400">
                    {saveStatus && <span className="text-emerald-400">{saveStatus}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportJson}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar JSON</span>
                    </button>
                    <button
                      onClick={handleSaveToDisk}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Salvar em experiments/p3-2-2-2</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Chave mantida estritamente em memória volátil da sessão. Zero persistência no navegador.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
};

