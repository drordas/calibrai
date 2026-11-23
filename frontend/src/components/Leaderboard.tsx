import React from "react";
import { ModelBenchmarkSummary, MetricCard } from "../types";
import { useTranslation } from "../i18n";
import {
  Trophy,
  Sparkles,
  BarChart3,
  Award,
  Zap,
  Calculator,
  FunctionSquare,
  FileCode,
  Bot,
  Layers,
  ChevronDown,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface LeaderboardProps {
  summaries: Record<string, ModelBenchmarkSummary>;
  bestPerformers: Record<string, string>; // metric_id -> model_id
  experimentName?: string;
  datasetName?: string;
  template?: string;
  systemPrompt?: string;
  inputColumns?: string[];
  contextColumns?: string[];
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  summaries,
  bestPerformers,
  experimentName,
  datasetName,
  template,
  systemPrompt,
  inputColumns = [],
  contextColumns = [],
}) => {
  const { t, language } = useTranslation();
  const rawModelList = Object.values(summaries);
  const isHumanSummary = (m: ModelBenchmarkSummary) =>
    Boolean(m.is_human_baseline || m.model_id === "human_expert" || m.model_id.startsWith("human_expert"));

  // Order LLM models first, followed by Ground Truth human baselines
  const modelList = [
    ...rawModelList.filter((m) => !isHumanSummary(m)),
    ...rawModelList.filter((m) => isHumanSummary(m)),
  ];

  if (modelList.length === 0) {
    return (
      <Card className="bg-card border border-border rounded-sm shadow-none p-12 text-center space-y-3">
        <Trophy className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
        <CardTitle className="font-serif font-bold text-foreground text-base">{t("results.noResultsTitle")}</CardTitle>
        <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto">
          {t("results.noResultsDesc")}
        </CardDescription>
      </Card>
    );
  }

  // Determine active task type
  const activeTaskType = modelList[0]?.task_type || "generic";

  // Collect dynamic columns from the metric cards of the first model (excluding Validez JSON)
  const dynamicCards: MetricCard[] = (modelList[0]?.metric_cards || []).filter(
    (c) => c.id !== "json_validity"
  );

  // Compute optimal value per metric column (operational metrics compare LLMs; quality metrics compare all)
  const isOperationalMetric = (cardId: string) =>
    cardId === "latency" || cardId === "throughput" || cardId === "cost";

  const bestValueByCardId: Record<string, { bestVal: number; higherIsBetter: boolean }> = {};
  for (const card of dynamicCards) {
    const candidates = modelList
      .filter((m) => !(isOperationalMetric(card.id) && isHumanSummary(m)))
      .map((m) => m.metric_cards.find((c) => c.id === card.id))
      .filter((c): c is MetricCard => c !== undefined && typeof c.value === "number" && !Number.isNaN(c.value));

    if (candidates.length > 0) {
      const higher = card.higher_is_better !== false;
      const vals = candidates.map((c) => c.value);
      const bestVal = higher ? Math.max(...vals) : Math.min(...vals);
      bestValueByCardId[card.id] = { bestVal, higherIsBetter: higher };
    }
  }

  const formatCurrency = (val: number): string => {
    const num = (val ?? 0).toFixed(4);
    if (language === "es") return `${num} €`;
    if (language === "uk") return `£${num}`;
    return `$${num}`;
  };

  const formatMetricDelta = (cardId: string, diff: number, higherIsBetter: boolean): string => {
    const arrow = higherIsBetter ? "▲" : "▼";
    if (cardId === "rating_congruence") {
      return `${arrow} +${diff.toFixed(2)}`;
    }
    if (cardId === "latency") {
      return `${arrow} +${Math.round(diff)} ms`;
    }
    if (cardId === "throughput") {
      return `${arrow} +${diff.toFixed(1)} tok/s`;
    }
    if (cardId === "cost") {
      return `${arrow} +${formatCurrency(diff)}`;
    }
    if (cardId === "mae" || cardId === "rmse") {
      return `${arrow} +${diff.toFixed(3)}`;
    }
    return `${arrow} +${diff.toFixed(1)}%`;
  };

  // Determine top model
  let winner = modelList[0];
  if (activeTaskType === "numeric_math") {
    // Top model is the one with highest exact_match or lowest mae
    winner = modelList.toSorted((a, b) => {
      const maeA = a.metric_cards.find((c) => c.id === "mae")?.value ?? 999;
      const maeB = b.metric_cards.find((c) => c.id === "mae")?.value ?? 999;
      return maeA - maeB;
    })[0];
  } else {
    winner = modelList.toSorted(
      (a, b) => b.internal_consistency_score - a.internal_consistency_score
    )[0];
  }

  const getWinnerDescription = () => {
    if (activeTaskType === "numeric_math") {
      const maeVal = winner?.metric_cards.find((c) => c.id === "mae")?.formatted || "0";
      const tolVal = winner?.metric_cards.find((c) => c.id === "tolerance")?.formatted || "100%";
      return t("results.winnerNumericDesc", { mae: maeVal, tolerance: tolVal });
    } else if (activeTaskType === "aspect_polarity") {
      return t("results.winnerAspectDesc", { score: winner?.internal_consistency_score.toFixed(1) });
    } else {
      return t("results.winnerGenericDesc", { score: winner?.json_validity_rate.toFixed(0) });
    }
  };

  const getCardLabel = (card: MetricCard) => {
    const key = `metricCards.${card.id}.label`;
    const translated = t(key);
    return translated !== key ? translated : card.label;
  };

  const getCardDescription = (card: MetricCard) => {
    const key = `metricCards.${card.id}.desc`;
    const translated = t(key);
    return translated !== key ? translated : card.description;
  };

  const getCardFormula = (cardId: string): string => {
    switch (cardId) {
      case "verbatim":
        return "Verbatim = (Citas verificadas en texto fuente / Total citas extraídas) × 100%";
      case "rule_consistency":
        return "Reglas = (Evaluaciones con polaridad canónica válida / Total evaluaciones) × 100%";
      case "disjointness":
        return "Disyunción = (Filas con Pos ∩ Neg = ∅ / Total filas N) × 100%";
      case "consistency":
        return "Consistencia Global = 0.40 × Verbatim + 0.30 × Reglas + 0.30 × Disyunción";
      case "rating_congruence":
        return "Spearman rs entre NSS = (Pos - Neg)/(Pos + Neg) y Calificación Externa";
      case "json_validity":
        return "Validez JSON = (Salidas JSON válidas con claves requeridas / N) × 100%";
      case "latency":
        return "Latencia Media = (∑ Tiempo de inferencia en ms) / N";
      case "throughput":
        return "Throughput = Total tokens generados / Tiempo total (s)";
      case "cost":
        return "Coste = ∑ (Tokens Entrada × Tarifa In + Tokens Salida × Tarifa Out)";
      case "mae":
        return "MAE = (1/N) × ∑ |y_i - ŷ_i|";
      case "rmse":
        return "RMSE = √((1/N) × ∑ (y_i - ŷ_i)²)";
      case "tolerance":
        return "Tolerancia = (∑ I(|y_i - ŷ_i| ≤ τ·|y_i|) / N) × 100%";
      default:
        return "Métrica agregada sobre las N muestras evaluadas del experimento";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Monograph Synthesis Banner: Winner & Evaluated Models */}
      <Card className="bg-card border-t-2 border-t-foreground border-b-2 border-b-foreground border-x border-x-border p-6 rounded-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-sm bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl font-bold text-foreground">
                  {winner?.model_id.split("/")[1] || winner?.model_id}
                </h2>
                <Badge variant="outline" className="border-primary/40 text-primary text-[10px] font-mono font-bold py-0 px-1.5 bg-primary/10 rounded-sm">
                  RANK #1 &middot; {activeTaskType === "numeric_math"
                    ? t("results.leaderMath")
                    : activeTaskType === "aspect_polarity"
                    ? t("results.leaderQuality")
                    : t("results.leaderGlobal")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                {getWinnerDescription()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs border-t md:border-t-0 pt-3 md:pt-0 border-border w-full md:w-auto">
            <div className="border-t-2 border-foreground pt-1.5 pr-4">
              <span className="text-muted-foreground block text-[11px] font-serif">{t("common.models")}</span>
              <span className="font-bold text-foreground text-base font-serif tabular-nums">{modelList.length}</span>
            </div>
            <div className="border-t-2 border-foreground pt-1.5 pr-4">
              <span className="text-muted-foreground block text-[11px] font-serif">{t("common.samples")}</span>
              <span className="font-bold text-foreground text-base font-serif tabular-nums">N = {winner?.total_samples}</span>
            </div>
            <div className="border-t-2 border-primary pt-1.5">
              <span className="text-primary block text-[11px] font-serif">{t("common.task")}</span>
              <span className="font-bold text-primary text-xs font-mono uppercase">{activeTaskType}</span>
            </div>
          </div>
        </div>

        {/* Evaluated Models & Metadata Summary */}
        <div className="mt-4 pt-3.5 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-serif font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-primary" />
              <span>Modelos / Jueces:</span>
            </span>
            {modelList.map((m) => {
              const isHuman = Boolean(m.is_human_baseline || m.model_id === "human_expert" || m.model_id.startsWith("human_expert"));
              const label = isHuman ? (m.model_name || t("results.humanExpert")) : (m.model_id.split("/")[1] || m.model_id);
              return (
                <Badge
                  key={m.model_id}
                  variant="outline"
                  className={`text-[11px] font-mono py-0.5 px-2 rounded-sm ${
                    isHuman
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30 font-semibold"
                      : "bg-muted/50 text-foreground border-border"
                  }`}
                >
                  {label}
                </Badge>
              );
            })}
          </div>

          {(experimentName || datasetName) && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              {experimentName && <span className="text-foreground font-semibold">{experimentName}</span>}
              {experimentName && datasetName && <span>&bull;</span>}
              {datasetName && (
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-primary" />
                  <span>{datasetName}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Collapsible Prompt & Input Variables Disclosure */}
      {template && (
        <details className="group bg-card border border-border rounded-sm overflow-hidden">
          <summary className="list-none cursor-pointer p-3.5 px-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors select-none">
            <div className="flex items-center gap-2 text-xs font-serif font-bold text-foreground">
              <ChevronDown className="w-4 h-4 text-primary transition-transform duration-200 -rotate-90 group-open:rotate-0 shrink-0" />
              <FileCode className="w-4 h-4 text-primary shrink-0" />
              <span>Anexo Metodológico: Prompt del Experimento y Configuración de Variables</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {inputColumns.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono bg-muted text-foreground border-border">
                  Input: {inputColumns.join(", ")}
                </Badge>
              )}
              {contextColumns.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono bg-muted text-foreground border-border">
                  Context: {contextColumns.join(", ")}
                </Badge>
              )}
              <span className="text-[11px] font-mono text-primary font-semibold group-open:hidden">
                Mostrar prompt
              </span>
              <span className="text-[11px] font-mono text-primary font-semibold hidden group-open:inline">
                Ocultar prompt
              </span>
            </div>
          </summary>

          <div className="p-4 pt-3 border-t border-border bg-muted/20 space-y-3">
            {systemPrompt && (
              <div className="space-y-1">
                <span className="text-xs font-serif font-semibold text-foreground block">
                  System Prompt:
                </span>
                <pre className="p-2.5 rounded-sm bg-background border border-border text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {systemPrompt}
                </pre>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-xs font-serif font-semibold text-foreground block">
                Plantilla de Prompt ({template.length.toLocaleString()} caracteres):
              </span>
              <pre className="p-3 rounded-sm bg-background border border-border text-xs font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed text-foreground">
                {template}
              </pre>
            </div>
          </div>
        </details>
      )}

      {/* Main Leaderboard Booktabs Table */}
      <div className="space-y-2.5">
        <div className="px-1">
          <h3 className="font-serif text-base font-bold text-foreground">
            <span className="text-primary mr-1.5">Tabla 1.</span>
            <span>{t("results.comparativeTableTitle")}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("results.comparativeTableDesc")}
          </p>
        </div>

        <div className="bg-card border-x border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-3 px-4 text-xs font-serif font-bold text-foreground w-14">{t("results.colPos")}</TableHead>
                <TableHead className="py-3 px-4 text-xs font-serif font-bold text-foreground">{t("results.colModel")}</TableHead>
                {dynamicCards.map((card) => (
                  <TableHead
                    key={card.id}
                    className="py-3 px-4 text-xs font-serif font-bold text-foreground whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{getCardLabel(card)}</span>
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-help focus:outline-none"
                              aria-label={`Cómo se calcula: ${getCardLabel(card)}`}
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="center"
                            className="max-w-xs sm:max-w-sm p-3 bg-card text-foreground border border-border shadow-lg rounded-sm space-y-1.5 text-left font-sans normal-case whitespace-normal z-50"
                          >
                            <div className="text-xs font-serif font-bold text-foreground border-b border-border pb-1">
                              {getCardLabel(card)}
                            </div>
                            <div className="p-1.5 rounded-sm bg-muted/60 border border-border font-mono text-[10px] text-primary font-semibold break-words">
                              {getCardFormula(card.id)}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {getCardDescription(card)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelList.map((m, idx) => {
                const isHuman = isHumanSummary(m);
                const isFirstHumanAfterModels =
                  isHuman && idx > 0 && !isHumanSummary(modelList[idx - 1]);
                const llmRank = modelList.slice(0, idx + 1).filter((item) => !isHumanSummary(item)).length;

                return (
                  <TableRow
                    key={m.model_id}
                    className={`transition-colors border-b border-border/70 ${
                      isFirstHumanAfterModels
                        ? "border-t-[4px] border-t-double border-emerald-600/80 dark:border-emerald-400/80"
                        : ""
                    } ${
                      isHuman ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] font-medium" : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Rank Badge */}
                    <TableCell className="py-3 px-4 font-mono font-semibold text-xs text-muted-foreground">
                      {isHuman ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">Ref.</span>
                      ) : llmRank === 1 ? (
                        <span className="text-primary font-bold">#1</span>
                      ) : (
                        `#${llmRank}`
                      )}
                    </TableCell>

                    {/* Model Name */}
                    <TableCell className="py-3 px-4 text-xs whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {isHuman ? (m.model_name || t("results.humanExpert")) : (m.model_id.split("/")[1] || m.model_id)}
                        </span>
                        {isHuman ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase font-bold px-1.5 py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30 font-mono rounded-sm"
                          >
                            Ground Truth
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase font-medium px-1.5 py-0 bg-muted text-muted-foreground font-mono border-border rounded-sm"
                          >
                            {m.model_id.split("/")[0]}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Dynamic Metric Columns */}
                    {dynamicCards.map((card) => {
                      const modelCard = m.metric_cards.find((c) => c.id === card.id) || card;
                      const bestInfo = bestValueByCardId[card.id];
                      const skipHumanOpComparison =
                        isHuman && (card.id === "latency" || card.id === "throughput" || card.id === "cost");

                      if (skipHumanOpComparison) {
                        return (
                          <TableCell key={card.id} className="py-3 px-4 text-xs whitespace-nowrap text-center">
                            <span className="font-mono text-xs text-muted-foreground">&mdash;</span>
                          </TableCell>
                        );
                      }

                      const hasValidNumeric =
                        bestInfo && typeof modelCard.value === "number" && !Number.isNaN(modelCard.value);
                      const rawDiff = hasValidNumeric ? Math.abs(bestInfo.bestVal - modelCard.value) : 0;
                      const isBestOrTie = hasValidNumeric && rawDiff < 1e-5;
                      const displayValue =
                        card.id === "cost" && typeof modelCard.value === "number"
                          ? formatCurrency(modelCard.value)
                          : modelCard.formatted;

                      return (
                        <TableCell key={card.id} className="py-3 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`flex w-full items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-sm font-mono text-xs tabular-nums border ${
                              isBestOrTie
                                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-bold border-emerald-600/40"
                                : hasValidNumeric
                                ? "bg-destructive/10 text-destructive font-medium border-destructive/30"
                                : "text-foreground/85 border-transparent"
                            }`}
                            title={getCardDescription(modelCard)}
                          >
                            <span>{displayValue}</span>
                            {hasValidNumeric && !isBestOrTie && (
                              <span className="text-[10px] font-semibold opacity-90">
                                {formatMetricDelta(card.id, rawDiff, bestInfo.higherIsBetter)}
                              </span>
                            )}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Row-Level Computed Evaluation Specs Breakdown Table */}
      {(() => {
        const modelsWithSpecs = modelList.filter(
          (m) => m.computed_specs_summary && Object.keys(m.computed_specs_summary).length > 0
        );
        if (modelsWithSpecs.length === 0) return null;

        const allSpecKeys = Array.from(
          new Set(
            modelsWithSpecs.flatMap((m) =>
              Object.keys(m.computed_specs_summary || {})
            )
          )
        );

        return (
          <Card className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
            <CardHeader className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Calculator className="w-4 h-4 text-primary" />
                  <span>{t("results.computedSpecsTitle")}</span>
                  <Badge variant="outline" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/20">
                    Row-Level Specs
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {t("results.computedSpecsDesc")}
                </CardDescription>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/10 hover:bg-transparent">
                    <TableHead className="py-2.5 px-4 text-xs font-semibold text-foreground whitespace-nowrap">
                      {t("results.specNameCol")}
                    </TableHead>
                    <TableHead className="py-2.5 px-4 text-xs font-semibold text-foreground whitespace-nowrap">
                      {t("results.specFormulaCol")}
                    </TableHead>
                    {modelsWithSpecs.map((m) => {
                      const modelLabel = m.is_human_baseline
                        ? (m.model_name || t("results.humanExpert"))
                        : (m.model_id.split("/")[1] || m.model_id);
                      return (
                        <TableHead key={m.model_id} className="py-2.5 px-4 text-xs font-semibold text-foreground whitespace-nowrap">
                          {modelLabel}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSpecKeys.map((sKey) => {
                    const firstMeta = modelsWithSpecs
                      .map((m) => m.computed_specs_summary?.[sKey])
                      .find(Boolean);

                    const formulaLabel = firstMeta?.expression || firstMeta?.function || sKey;

                    return (
                      <TableRow key={sKey} className="border-b border-border/50 hover:bg-muted/20">
                        <TableCell className="py-2.5 px-4 text-xs font-mono font-semibold text-foreground">
                          <div className="flex items-center gap-1.5">
                            <FunctionSquare className="w-3.5 h-3.5 text-primary" />
                            <span>{sKey}</span>
                          </div>
                          {firstMeta?.description && (
                            <p className="text-[10px] text-muted-foreground font-sans font-normal mt-0.5 opacity-80">
                              {firstMeta.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-xs font-mono text-muted-foreground">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-primary text-[11px] font-semibold">
                            {formulaLabel}
                          </span>
                        </TableCell>
                        {modelsWithSpecs.map((m) => {
                          const stat = m.computed_specs_summary?.[sKey];
                          if (!stat) {
                            return (
                              <TableCell key={m.model_id} className="py-2.5 px-4 text-xs font-mono text-muted-foreground italic">
                                —
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={m.model_id} className="py-2.5 px-4 text-xs font-mono whitespace-nowrap">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-foreground">
                                    {stat.mean.toFixed(3)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-sans">
                                    (μ)
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  [{stat.min.toFixed(2)}, {stat.max.toFixed(2)}] · σ={stat.std.toFixed(2)}
                                </div>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        );
      })()}
    </div>
  );
};

