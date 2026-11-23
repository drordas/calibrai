import React, { useState } from "react";
import { PairwiseComparison, ModelBenchmarkSummary } from "../types";
import { useTranslation } from "../i18n";
import {
  Grid,
  Layers,
  ArrowRightLeft,
  X,
  Sparkles,
  TrendingUp,
  UserCheck,
  Eye,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuditInspectionModal, AuditModalConfig } from "./AuditInspectionModal";

interface PairwiseMatrixProps {
  pairwiseList: PairwiseComparison[];
  modelIds: string[];
  summaries?: Record<string, ModelBenchmarkSummary>;
  experimentId?: string;
}

export const PairwiseMatrix: React.FC<PairwiseMatrixProps> = ({
  pairwiseList,
  modelIds,
  summaries,
  experimentId,
}) => {
  const { t } = useTranslation();
  const [selectedPair, setSelectedPair] = useState<PairwiseComparison | null>(null);
  const [auditModalConfig, setAuditModalConfig] = useState<AuditModalConfig>(null);
  const [isAuditOpen, setIsAuditOpen] = useState<boolean>(false);

  // Derive all distinct models present in pairwise list (including human_expert baseline)
  const allModels = Array.from(
    new Set([
      ...modelIds,
      ...pairwiseList.map((p) => p.model_a),
      ...pairwiseList.map((p) => p.model_b),
    ])
  );

  if (pairwiseList.length === 0 || allModels.length < 2) {
    return (
      <Card className="bg-card border border-border rounded-sm shadow-none p-12 text-center space-y-3">
        <ArrowRightLeft className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
        <CardTitle className="font-serif font-bold text-foreground text-base">{t("results.matrixUnavailableTitle")}</CardTitle>
        <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto">
          {t("results.matrixUnavailableDesc")}
        </CardDescription>
      </Card>
    );
  }

  const isNumericTask = pairwiseList[0]?.task_type === "numeric_math";

  const isHumanModel = (m: string) => m === "human_expert" || m.startsWith("human_expert");
  const formatModelDisplayName = (m: string) => {
    const customName = summaries?.[m]?.model_name;
    if (customName && customName.trim()) {
      return customName;
    }
    if (isHumanModel(m)) {
      if (m.startsWith("human_expert_")) {
        const idPart = m.replace("human_expert_", "").replace(/^sample_/, "");
        return idPart.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      }
      return t("results.humanExpert");
    }
    return m.split("/")[1] || m;
  };

  const getPair = (m1: string, m2: string): PairwiseComparison | undefined => {
    return pairwiseList.find(
      (p) =>
        (p.model_a === m1 && p.model_b === m2) ||
        (p.model_a === m2 && p.model_b === m1)
    );
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.75) return "bg-primary text-primary-foreground border-primary hover:bg-primary/90 font-bold";
    if (score >= 0.5) return "bg-muted text-foreground border-border hover:bg-muted/80 font-semibold";
    if (score >= 0.3) return "bg-muted/50 text-muted-foreground border-border/80 hover:bg-muted/70";
    return "bg-muted/20 text-muted-foreground/80 border-border/50 hover:bg-muted/40";
  };

  return (
    <div className="space-y-6">
      {/* Informative Header */}
      <Card className="bg-card border-t-2 border-t-foreground border-b-2 border-b-foreground border-x border-x-border rounded-none shadow-none">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="font-serif font-bold text-lg flex items-center gap-2 text-foreground">
            <Grid className="w-4 h-4 text-primary" />
            <span>
              {isNumericTask
                ? t("results.matrixNumericTitle")
                : t("results.matrixConsensusTitle")}
            </span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            {isNumericTask
              ? t("results.matrixNumericDesc")
              : t("results.matrixConsensusDesc")}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-3">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="font-medium text-foreground text-xs font-sans">
              {isNumericTask ? t("results.legendCorrelation") : t("results.legendKappa")}
            </span>
            <Badge variant="outline" className="border-border text-foreground text-[10px] gap-1.5 py-0.5 bg-muted/60">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              <span>{t("results.legendVeryHigh")}</span>
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground text-[10px] gap-1.5 py-0.5 bg-muted/40">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>{t("results.legendSubstantial")}</span>
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground text-[10px] gap-1.5 py-0.5 bg-muted/20">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <span>{t("results.legendModerate")}</span>
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground/70 text-[10px] gap-1.5 py-0.5 bg-transparent">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              <span>{t("results.legendDiscrepancy")}</span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap Matrix Table */}
      <Card
        tabIndex={0}
        role="region"
        aria-label={isNumericTask ? t("results.matrixNumericTitle") : t("results.matrixConsensusTitle")}
        className="bg-card border border-border rounded-lg shadow-none p-5 overflow-x-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <table className="border-collapse mx-auto">
          <thead>
            <tr>
              <th scope="col" className="p-2.5 text-xs font-mono font-medium text-muted-foreground text-right pr-4">
                {t("results.pairwiseModelsHeader")}
              </th>
              {allModels.map((m) => (
                <th scope="col" key={m} className="p-2.5 text-xs font-medium text-foreground text-center min-w-[120px]">
                  {isHumanModel(m) ? (
                    <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1">
                      <UserCheck className="w-3 h-3" />
                      <span>{formatModelDisplayName(m)}</span>
                    </Badge>
                  ) : (
                    <span className="block truncate max-w-[110px] mx-auto font-mono text-xs">
                      {m.split("/")[1] || m}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allModels.map((rowModel) => (
              <tr key={rowModel}>
                <th scope="row" className="p-2.5 text-xs font-medium text-foreground text-right pr-4 whitespace-nowrap font-normal">
                  {isHumanModel(rowModel) ? (
                    <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1">
                      <UserCheck className="w-3 h-3" />
                      <span>{formatModelDisplayName(rowModel)}</span>
                    </Badge>
                  ) : (
                    <span className="font-mono text-xs">{rowModel.split("/")[1] || rowModel}</span>
                  )}
                </th>
                {allModels.map((colModel) => {
                  if (rowModel === colModel) {
                    return (
                      <td key={colModel} className="p-1.5 text-center">
                        <div className="h-14 rounded-md bg-muted/15 border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground text-xs font-mono">
                          <span className="font-semibold text-foreground/80">1.000</span>
                          <span className="text-[10px] text-muted-foreground">{t("results.selfComparison")}</span>
                        </div>
                      </td>
                    );
                  }

                  const pair = getPair(rowModel, colModel);
                  if (!pair) {
                    return (
                      <td key={colModel} className="p-1.5 text-center text-muted-foreground text-xs">
                        -
                      </td>
                    );
                  }

                  const primaryScore = isNumericTask
                    ? (pair.pearson_correlation ?? pair.cohens_kappa)
                    : pair.cohens_kappa;
                  const bgClass = getScoreBg(primaryScore);

                  return (
                    <td key={colModel} className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedPair(pair)}
                        aria-label={`${formatModelDisplayName(rowModel)} vs ${formatModelDisplayName(colModel)}: ${isNumericTask ? `r=${primaryScore.toFixed(3)}` : `κ=${primaryScore.toFixed(3)}`}`}
                        className={`w-full h-14 rounded-md border p-2 flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${bgClass}`}
                        title={t("results.clickForBreakdown")}
                      >
                        <span className="text-xs font-semibold font-mono">
                          {isNumericTask ? `r = ${primaryScore.toFixed(3)}` : `κ = ${primaryScore.toFixed(3)}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {isNumericTask
                            ? `Δ: ${pair.mean_absolute_difference?.toFixed(2) ?? "0.0"}`
                            : `${t("results.rawAgreement")}: ${pair.raw_agreement_rate.toFixed(0)}%`}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Selected Pair Deep Dive Card */}
      {selectedPair && (
        <Card className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="font-semibold text-sm text-foreground">
                {t("results.breakdownTitle", {
                  modelA: formatModelDisplayName(selectedPair.model_a),
                  modelB: formatModelDisplayName(selectedPair.model_b),
                })}
              </CardTitle>
              {selectedPair.is_vs_human && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 font-mono">
                  <UserCheck className="w-3 h-3" />
                  <span>{t("results.humanValidationBadge")}</span>
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPair(null)}
              className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                {isNumericTask ? t("results.pearsonCorrelation") : t("results.cohensKappa")}
              </span>
              <span className="text-lg font-bold font-mono text-primary">
                {isNumericTask
                  ? (selectedPair.pearson_correlation ?? selectedPair.cohens_kappa).toFixed(4)
                  : selectedPair.cohens_kappa.toFixed(4)}
              </span>
            </div>

            {!isNumericTask && (
              <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {t("results.krippendorffAlpha")}
                </span>
                <span className="text-lg font-bold font-mono text-blue-400">
                  {(selectedPair.krippendorff_alpha ?? selectedPair.cohens_kappa).toFixed(4)}
                </span>
              </div>
            )}

            {!isNumericTask && (
              <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {t("results.iccQuoteCount")}
                </span>
                <span className="text-lg font-bold font-mono text-amber-400">
                  {selectedPair.icc_2_1 !== undefined ? selectedPair.icc_2_1.toFixed(3) : "1.000"}
                </span>
              </div>
            )}

            {!isNumericTask && selectedPair.human_baseline_ratio !== undefined && (
              <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Ratio vs Humano
                </span>
                <span className="text-lg font-bold font-mono text-purple-400">
                  {(selectedPair.human_baseline_ratio * 100).toFixed(1)}%
                </span>
                <span className="text-[9px] text-muted-foreground block">
                  {selectedPair.human_baseline_ratio >= 0.95
                    ? "Fuerte (Q1)"
                    : selectedPair.human_baseline_ratio >= 0.8
                    ? "Aceptable (Q2)"
                    : "Insuficiente"}
                </span>
              </div>
            )}

            <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                {isNumericTask ? t("results.meanDeviation") : t("results.rawAgreement")}
              </span>
              <span className="text-lg font-bold font-mono text-emerald-500">
                {isNumericTask
                  ? `${selectedPair.mean_absolute_difference?.toFixed(3) ?? "0.000"}`
                  : `${selectedPair.raw_agreement_rate.toFixed(1)}%`}
              </span>
            </div>

            <div className="glass-panel-subtle p-3 rounded-xl border border-border/60">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("results.samplesCompared")}</span>
              <span className="text-lg font-bold font-mono text-foreground">{selectedPair.samples_compared}</span>
            </div>
          </div>

          {selectedPair.dimension_agreements && Object.keys(selectedPair.dimension_agreements).length > 0 && (
            <div className="pt-2 border-t border-border/60">
              <span className="text-xs font-semibold text-foreground block mb-2">
                Concordancia por Dimensión:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(selectedPair.dimension_agreements).map(([dim, rate]) => (
                  <div key={dim} className="p-2.5 rounded-lg bg-muted/30 border border-border flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground capitalize">
                      {dim.replace(/_/g, " ")}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs border-border bg-card">
                      {rate.toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evaluated Fields & Audit Action Button */}
          <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase font-mono font-semibold">
                Campos Analizados:
              </span>
              {selectedPair.evaluated_fields && selectedPair.evaluated_fields.length > 0 ? (
                selectedPair.evaluated_fields.map((f) => (
                  <Badge key={f} variant="outline" className="text-[9px] font-mono py-0 bg-muted/30 text-foreground">
                    {f}
                  </Badge>
                ))
              ) : (
                <span className="text-[10px] text-muted-foreground font-mono">aspects[*].sentiment</span>
              )}
            </div>

            {experimentId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAuditModalConfig({
                    type: "pairwise",
                    experimentId,
                    modelA: selectedPair.model_a,
                    modelB: selectedPair.model_b,
                    modelAName: formatModelDisplayName(selectedPair.model_a),
                    modelBName: formatModelDisplayName(selectedPair.model_b),
                    metricName: isNumericTask ? "Correlación Pearson (r)" : "Cohen's Kappa (κ)",
                    metricValue: selectedPair.cohens_kappa,
                  });
                  setIsAuditOpen(true);
                }}
                className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10 font-semibold shadow-none cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>Auditar Discrepancias Fila a Fila</span>
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Audit Inspection Modal */}
      <AuditInspectionModal
        config={auditModalConfig}
        isOpen={isAuditOpen}
        onClose={() => {
          setIsAuditOpen(false);
          setAuditModalConfig(null);
        }}
      />
    </div>
  );
};
