import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRightLeft,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Bot,
  UserCheck,
  Check,
  X,
} from "lucide-react";
import { fetchModelAudit, fetchPairwiseAudit } from "../services/api";
import { ModelAuditResponse, PairwiseAuditResponse } from "../types";

export type AuditModalConfig =
  | {
      type: "model";
      experimentId: string;
      modelId: string;
      modelName?: string;
      defaultTab?: "verbatim" | "disjointness" | "rules";
    }
  | {
      type: "pairwise";
      experimentId: string;
      modelA: string;
      modelB: string;
      modelAName?: string;
      modelBName?: string;
      metricKey?: "kappa" | "alpha" | "raw_agreement" | "baseline_ratio";
      metricName?: string;
      metricValue?: number;
      metricDisplayValue?: string;
      metricExplanation?: string;
      baselineKappa?: number;
    }
  | null;

interface AuditInspectionModalProps {
  config: AuditModalConfig;
  isOpen: boolean;
  onClose: () => void;
}

export const AuditInspectionModal: React.FC<AuditInspectionModalProps> = ({
  config,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Model audit state
  const [modelAudit, setModelAudit] = useState<ModelAuditResponse | null>(null);
  const [modelTab, setModelTab] = useState<"verbatim" | "typos" | "disjointness" | "rules">("verbatim");

  // Pairwise audit state
  const [pairwiseAudit, setPairwiseAudit] = useState<PairwiseAuditResponse | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Expanded items state
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatSampleIdLabel = (item: { sample_index: number; sample_id?: string; id_column?: string }) => {
    const col = item.id_column || modelAudit?.id_column || pairwiseAudit?.id_column || "ID";
    const val = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
    return `${col}: ${val}`;
  };

  // Highlight/underline discrepancy quotes inside source text
  const renderHighlightedSourceText = (text: string, quotes: string[]) => {
    const cleanQuotes = Array.from(
      new Set(
        quotes
          .map((q) => q.trim())
          .filter((q) => q.length >= 3 && !["blank", "none"].includes(q.toLowerCase()))
      )
    ).toSorted((a, b) => b.length - a.length);

    if (!text || cleanQuotes.length === 0) return text;

    const escaped = cleanQuotes.map((q) =>
      q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")
    );
    try {
      const regex = new RegExp(`(${escaped.join("|")})`, "gi");
      const parts = text.split(regex);
      return parts.map((part, idx) => {
        const isMatch = cleanQuotes.some(
          (q) => q.replace(/\s+/g, " ").toLowerCase() === part.replace(/\s+/g, " ").toLowerCase()
        );
        if (isMatch) {
          return (
            <mark
              key={idx}
              className="bg-primary/10 text-foreground underline decoration-2 underline-offset-2 decoration-primary px-0.5 rounded-xs font-semibold"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      });
    } catch {
      return text;
    }
  };

  const escapeCsvCell = (val: unknown): string => {
    const str = val === null || val === undefined ? "" : String(val);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportCsv = () => {
    if (!config) return;
    const rows: string[][] = [];
    let filename = `auditoria_${config.experimentId}.csv`;

    if (config.type === "model" && modelAudit) {
      const modelLabel = config.modelName || config.modelId.split("/")[1] || config.modelId;
      const safeModelSlug = modelLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
      const defaultIdCol = modelAudit.id_column || "ID";

      if (modelTab === "verbatim") {
        filename = `auditoria_verbatim_${safeModelSlug}.csv`;
        rows.push(["modelo", "columna_id", "id_muestra", "tipo_error", "cita_no_encontrada", "texto_original"]);
        for (const item of modelAudit.verbatim_failures) {
          const idCol = item.id_column || defaultIdCol;
          const idVal = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
          for (const q of item.hallucinated_quotes) {
            rows.push([modelLabel, idCol, idVal, "Alucinación / Parafraseo", q, item.source_text]);
          }
        }
      } else if (modelTab === "typos") {
        filename = `auditoria_typos_${safeModelSlug}.csv`;
        rows.push([
          "modelo",
          "columna_id",
          "id_muestra",
          "tipo_error",
          "cita_corregida_llm",
          "fragmento_literal_corpus",
          "similitud_pct",
          "texto_original",
        ]);
        for (const item of modelAudit.typo_corrections || []) {
          const idCol = item.id_column || defaultIdCol;
          const idVal = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
          for (const cq of item.corrected_quotes) {
            rows.push([
              modelLabel,
              idCol,
              idVal,
              "Corrección Ortográfica (Typo)",
              cq.quote,
              cq.matched_span || "",
              String(cq.similarity),
              item.source_text,
            ]);
          }
        }
      } else if (modelTab === "disjointness") {
        filename = `auditoria_disyuncion_${safeModelSlug}.csv`;
        rows.push([
          "modelo",
          "columna_id",
          "id_muestra",
          "tipo_error",
          "cita_duplicada",
          "categorias_contradictorias",
          "texto_original",
        ]);
        for (const item of modelAudit.disjointness_failures) {
          const idCol = item.id_column || defaultIdCol;
          const idVal = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
          for (const oq of item.overlapping_quotes) {
            rows.push([
              modelLabel,
              idCol,
              idVal,
              "Disyunción de Citas (Pos ∩ Neg ≠ ∅)",
              oq.quote,
              oq.types.join(" | "),
              item.source_text,
            ]);
          }
        }
      } else if (modelTab === "rules") {
        filename = `auditoria_reglas_${safeModelSlug}.csv`;
        rows.push(["modelo", "columna_id", "id_muestra", "tipo_error", "regla_incumplida", "detalle", "texto_original"]);
        for (const item of modelAudit.rule_failures) {
          const idCol = item.id_column || defaultIdCol;
          const idVal = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
          rows.push([
            modelLabel,
            idCol,
            idVal,
            "Consistencia de Reglas",
            item.rule_broken,
            item.details,
            item.source_text,
          ]);
        }
      }
    } else if (config.type === "pairwise" && pairwiseAudit) {
      const modelALabel = config.modelAName || config.modelA.split("/")[1] || config.modelA;
      const modelBLabel = config.modelBName || config.modelB.split("/")[1] || config.modelB;
      const safeASlug = modelALabel.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeBSlug = modelBLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
      const defaultIdCol = pairwiseAudit.id_column || "ID";
      filename = `discrepancias_${safeASlug}_vs_${safeBSlug}.csv`;

      rows.push([
        "columna_id",
        "id_muestra",
        "dimension",
        `polaridad_${modelALabel}`,
        `citas_${modelALabel}`,
        `polaridad_${modelBLabel}`,
        `citas_${modelBLabel}`,
        "texto_original",
      ]);

      const filteredDiscrepancies = pairwiseAudit.discrepancies.filter((d) =>
        selectedDimension === "all"
          ? true
          : d.differences.some((diff) => diff.dimension === selectedDimension)
      );

      for (const item of filteredDiscrepancies) {
        const idCol = item.id_column || defaultIdCol;
        const idVal = item.sample_id !== undefined && item.sample_id !== "" ? item.sample_id : String(item.sample_index + 1);
        const diffs =
          selectedDimension === "all"
            ? item.differences
            : item.differences.filter((diff) => diff.dimension === selectedDimension);
        for (const diff of diffs) {
          rows.push([
            idCol,
            idVal,
            diff.dimension,
            diff.model_a_val,
            (diff.quotes_a || []).join(" || "),
            diff.model_b_val,
            (diff.quotes_b || []).join(" || "),
            item.source_text,
          ]);
        }
      }
    }

    if (rows.length === 0) return;

    const csvContent = "\uFEFF" + rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!isOpen || !config) {
      setModelAudit(null);
      setPairwiseAudit(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setExpandedIndices({});
    setSearchQuery("");

    if (config.type === "model") {
      if (config.defaultTab) setModelTab(config.defaultTab);
      fetchModelAudit(config.experimentId, config.modelId)
        .then((data) => setModelAudit(data))
        .catch((err) => setError(err.message || "Error al cargar auditoría del modelo"))
        .finally(() => setLoading(false));
    } else {
      setSelectedDimension("all");
      fetchPairwiseAudit(config.experimentId, config.modelA, config.modelB)
        .then((data) => setPairwiseAudit(data))
        .catch((err) => setError(err.message || "Error al cargar discrepancias inter-juez"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, config]);

  if (!config) return null;

  const isModelMode = config.type === "model";
  const pairwiseDimensions = pairwiseAudit
    ? Array.from(new Set(pairwiseAudit.discrepancies.flatMap((d) => d.differences.map((diff) => diff.dimension))))
    : [];
  const visibleDiscrepancySamples = pairwiseAudit
    ? selectedDimension === "all"
      ? pairwiseAudit.discrepancies.length
      : pairwiseAudit.discrepancies.filter((d) => d.differences.some((diff) => diff.dimension === selectedDimension)).length
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-background border border-border shadow-2xl">
        {/* Header */}
        <div className="p-5 pr-12 border-b border-border bg-card/60 shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {isModelMode
                    ? `Auditoría de Errores: ${config.modelName || config.modelId.split("/")[1] || config.modelId}`
                    : `Discrepancias: ${config.modelAName || config.modelA.split("/")[1] || config.modelA} vs ${config.modelBName || config.modelB.split("/")[1] || config.modelB}`}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {isModelMode
                    ? "Inspección fila a fila de citas alucinadas, contradicciones lógicas y fallos de extracción."
                    : "Inspección detallada de filas donde los anotadores discreparon en polaridad o asignación."}
                </DialogDescription>
              </div>
            </div>

            {/* Target Fields Transparency Badge (shown only in Model Audit mode; Pairwise has it in Variable filter) */}
            {isModelMode && (
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase font-mono font-semibold">
                  Campos Analizados:
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-end max-w-xs mt-0.5">
                  {modelAudit?.evaluated_fields?.map((f) => (
                    <Badge
                      key={f}
                      variant="outline"
                      className="text-[9px] font-mono py-0 bg-muted/30 border-border text-foreground"
                    >
                      {f}
                    </Badge>
                  )) || (
                    <span className="text-[10px] text-muted-foreground font-mono">Cargando...</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Subheader Toolbar */}
          {isModelMode && modelAudit && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/60 flex-wrap">
              <Button
                type="button"
                variant={modelTab === "verbatim" ? "default" : "outline"}
                size="sm"
                onClick={() => setModelTab("verbatim")}
                className="h-7 text-xs gap-1.5 rounded-md cursor-pointer"
              >
                <span>Alucinaciones / Parafraseos</span>
                <Badge
                  variant={modelTab === "verbatim" ? "secondary" : "outline"}
                  className="text-[10px] px-1 py-0 font-mono"
                >
                  {modelAudit.verbatim_failures.length} fallos
                </Badge>
              </Button>

              <Button
                type="button"
                variant={modelTab === "typos" ? "default" : "outline"}
                size="sm"
                onClick={() => setModelTab("typos")}
                className="h-7 text-xs gap-1.5 rounded-md cursor-pointer"
              >
                <span>Correcciones Ortográficas (Typos)</span>
                <Badge
                  variant={modelTab === "typos" ? "secondary" : "outline"}
                  className="text-[10px] px-1 py-0 font-mono"
                >
                  {(modelAudit.typo_corrections || []).length} filas
                </Badge>
              </Button>

              <Button
                type="button"
                variant={modelTab === "disjointness" ? "default" : "outline"}
                size="sm"
                onClick={() => setModelTab("disjointness")}
                className="h-7 text-xs gap-1.5 rounded-md cursor-pointer"
              >
                <span>Disyunción de Citas</span>
                <Badge
                  variant={modelTab === "disjointness" ? "secondary" : "outline"}
                  className="text-[10px] px-1 py-0 font-mono"
                >
                  {modelAudit.disjointness_failures.length} fallos
                </Badge>
              </Button>

              <Button
                type="button"
                variant={modelTab === "rules" ? "default" : "outline"}
                size="sm"
                onClick={() => setModelTab("rules")}
                className="h-7 text-xs gap-1.5 rounded-md cursor-pointer"
              >
                <span>Consistencia de Reglas</span>
                <Badge
                  variant={modelTab === "rules" ? "secondary" : "outline"}
                  className="text-[10px] px-1 py-0 font-mono"
                >
                  {modelAudit.rule_failures.length} fallos
                </Badge>
              </Button>
            </div>
          )}

          {!isModelMode && config.metricName && (
            <div className="px-3 py-2.5 rounded-md bg-primary/5 border border-primary/20 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-mono text-[11px] bg-primary/10 text-primary border-primary/30 font-semibold">
                    {config.metricName}: {config.metricDisplayValue ?? (config.metricValue !== undefined ? config.metricValue.toFixed(4) : "N/D")}
                  </Badge>
                  {config.metricExplanation && (
                    <span className="text-[11px] text-muted-foreground">{config.metricExplanation}</span>
                  )}
                </div>
                {pairwiseAudit && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {pairwiseAudit.agreements_count} acuerdos / {pairwiseAudit.total_aspect_evaluations} evals ({pairwiseAudit.total_compared} muestras)
                  </span>
                )}
              </div>

              {pairwiseAudit?.calculation_breakdown && (() => {
                const bd = pairwiseAudit.calculation_breakdown;
                const key = config.metricKey || "kappa";
                return (
                  <div className="pt-2 border-t border-primary/15 space-y-2">
                    {/* Exact formula with real numbers for the selected metric */}
                    <div className="p-2 rounded bg-background/80 border border-border/70 font-mono text-[11px] text-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      {key === "kappa" && (
                        <>
                          <span>
                            <strong className="text-primary">Po</strong> (obs.) = {pairwiseAudit.agreements_count}/{pairwiseAudit.total_aspect_evaluations} = <strong>{bd.po.toFixed(4)}</strong>
                          </span>
                          <span>
                            <strong className="text-amber-500">Pe</strong> (azar) = <strong>{bd.pe.toFixed(4)}</strong>
                          </span>
                          <span>
                            <strong>κ</strong> = ({bd.po.toFixed(4)} − {bd.pe.toFixed(4)}) / (1 − {bd.pe.toFixed(4)}) = <strong className="text-primary">{bd.kappa.toFixed(4)}</strong>
                          </span>
                        </>
                      )}
                      {key === "alpha" && (
                        <>
                          <span>
                            <strong className="text-destructive">Do</strong> (desacuerdo obs.) = {pairwiseAudit.disagreements_count}/{pairwiseAudit.total_aspect_evaluations} = <strong>{bd.do.toFixed(4)}</strong>
                          </span>
                          <span>
                            <strong className="text-amber-500">De</strong> (desacuerdo esp.) = <strong>{bd.de.toFixed(4)}</strong>
                          </span>
                          <span>
                            <strong>α</strong> = 1 − ({bd.do.toFixed(4)} / {bd.de.toFixed(4)}) = <strong className="text-blue-400">{bd.alpha.toFixed(4)}</strong>
                          </span>
                        </>
                      )}
                      {key === "raw_agreement" && (
                        <span>
                          <strong>Po</strong> = {pairwiseAudit.agreements_count} acuerdos / {pairwiseAudit.total_aspect_evaluations} evaluaciones × 100% = <strong className="text-emerald-500">{bd.raw_agreement_rate.toFixed(1)}%</strong>
                        </span>
                      )}
                      {key === "baseline_ratio" && (
                        <>
                          <span>
                            <strong>κ(modelo)</strong> = {bd.kappa.toFixed(4)}
                          </span>
                          {config.baselineKappa !== undefined && (
                            <span>
                              <strong>κ(línea base humana)</strong> = {config.baselineKappa.toFixed(4)}
                            </span>
                          )}
                          <span>
                            <strong>Ratio</strong> = <strong className="text-purple-400">{config.metricDisplayValue}</strong>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Per-dimension agreement + top confusion patterns */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {bd.dimension_breakdown.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Por variable:</span>
                          {bd.dimension_breakdown.map((dim) => {
                            const isSelected = selectedDimension === dim.dimension;
                            const pctColor =
                              dim.agreement_pct >= 80
                                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                : dim.agreement_pct >= 60
                                ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                : "border-destructive/30 text-destructive bg-destructive/10";
                            return (
                              <button
                                key={dim.dimension}
                                type="button"
                                onClick={() => setSelectedDimension(isSelected ? "all" : dim.dimension)}
                                title="Clic para filtrar discrepancias de esta variable"
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all cursor-pointer ${pctColor} ${
                                  isSelected ? "ring-1 ring-primary font-bold" : "opacity-90 hover:opacity-100"
                                }`}
                              >
                                {dim.dimension.replace(/_/g, " ")}: {dim.agreements}/{dim.total} ({dim.agreement_pct.toFixed(0)}%)
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {bd.top_confusions.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Confusiones frecuentes:</span>
                          {bd.top_confusions.slice(0, 3).map((c, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-muted/50 border border-border text-[10px] font-mono text-foreground"
                            >
                              {c.model_a_val} vs {c.model_b_val} (×{c.count})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {!isModelMode && pairwiseAudit && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Filtrar por Variable:</span>
                <select
                  value={selectedDimension}
                  onChange={(e) => setSelectedDimension(e.target.value)}
                  className="h-7 text-xs rounded-md border border-border bg-card px-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">Todas las variables ({pairwiseDimensions.length})</option>
                  {pairwiseDimensions.map((dim) => (
                    <option key={dim} value={dim}>
                      {dim.replace(/_/g, " ").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col items-end gap-0.5 text-xs font-mono">
                <span className="text-[11px] text-muted-foreground">
                  Total muestras: {visibleDiscrepancySamples}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    Acuerdos: {pairwiseAudit.agreements_count}
                  </span>
                  <span className="text-destructive font-semibold">
                    Desacuerdos: {pairwiseAudit.disagreements_count}
                  </span>
                  <span className="text-muted-foreground">
                    ({((pairwiseAudit.agreements_count / (pairwiseAudit.total_aspect_evaluations || 1)) * 100).toFixed(1)}% consenso)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-16 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground font-mono">Cargando registros de auditoría...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Error de consulta</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* MODEL AUDIT VIEW */}
          {/* ══════════════════════════════════════════════════════════ */}
          {isModelMode && modelAudit && !loading && (
            <>
              {modelTab === "verbatim" && (
                <div className="space-y-3">
                  {modelAudit.verbatim_failures.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-emerald-500/30 rounded-xl bg-emerald-500/5">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-xs font-bold text-foreground">100% Fidelidad Verbatim</p>
                      <p className="text-[11px] text-muted-foreground">
                        Todas las citas extraídas por el modelo coinciden exactamente con el texto original.
                      </p>
                    </div>
                  ) : (
                    modelAudit.verbatim_failures.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-sm border border-destructive/40 bg-destructive/5 space-y-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px] bg-destructive/10 text-destructive border-destructive/40 font-semibold">
                            {formatSampleIdLabel(item)}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {item.hallucinated_quotes.length} cita(s) no coincidente(s)
                          </span>
                        </div>

                        {/* Hallucinated Quotes */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-destructive uppercase font-mono block">
                            Citas Extraídas no encontradas textualmente (Alucinación o Parafraseo):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.hallucinated_quotes.map((q, qIdx) => (
                              <div
                                key={qIdx}
                                className="px-2.5 py-1 rounded-sm bg-destructive/15 border border-destructive/40 text-xs font-mono text-destructive font-medium"
                              >
                                &ldquo;{q}&rdquo;
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Source Text Context */}
                        <div className="pt-2 border-t border-border/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                              Texto Original del Corpus:
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.sample_index)}
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <span>{expandedIndices[item.sample_index] ? "Ver menos" : "Ver texto completo"}</span>
                              {expandedIndices[item.sample_index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                          <p className="text-xs text-foreground/80 font-mono mt-1 leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border">
                            {expandedIndices[item.sample_index]
                              ? item.source_text
                              : item.source_text.slice(0, 220) + (item.source_text.length > 220 ? "..." : "")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {modelTab === "typos" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-sm bg-sky-500/10 border border-sky-600/40 text-xs flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground block">
                        Sesgo de Autocorrección Ortográfica del LLM ({modelAudit.verbatim_mode === "strict" ? "Modo Estricto: Penalizado" : "Modo Tolerante: Aceptado como Evidencia Válida"})
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Estas citas están ancladas en una frase real del texto original (similitud &ge; 88%), pero el modelo corrigió una errata del usuario (ej. <code>quailty</code> &rarr; <code>quality</code>) o variante regional (<code>flavour</code> &rarr; <code>flavor</code>).
                      </p>
                    </div>
                  </div>

                  {(!modelAudit.typo_corrections || modelAudit.typo_corrections.length === 0) ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-border rounded-sm bg-muted/10">
                      <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto" />
                      <p className="text-xs font-bold text-foreground">Sin correcciones ortográficas detectadas</p>
                      <p className="text-[11px] text-muted-foreground">
                        Ninguna cita presentó variaciones ortográficas menores respecto al corpus.
                      </p>
                    </div>
                  ) : (
                    modelAudit.typo_corrections.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-sm border border-sky-600/40 bg-sky-500/5 space-y-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px] bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-600/40 font-semibold">
                            {formatSampleIdLabel(item)}
                          </Badge>
                          <span className="text-[10px] font-mono text-sky-800 dark:text-sky-300 font-semibold">
                            {item.corrected_quotes.length} corrección(es) ortográfica(s) menor(es)
                          </span>
                        </div>

                        <div className="space-y-2">
                          {item.corrected_quotes.map((cq, qIdx) => (
                            <div
                              key={qIdx}
                              className="p-2.5 rounded-sm bg-background border border-sky-600/35 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono uppercase font-semibold text-sky-800 dark:text-sky-300">
                                  Cita extraída por el modelo (corregida):
                                </span>
                                <Badge variant="secondary" className="text-[10px] font-mono py-0 bg-sky-500/15 text-sky-900 dark:text-sky-200 border border-sky-600/40 font-semibold">
                                  Similitud: {cq.similarity}%
                                </Badge>
                              </div>
                              <div className="font-mono text-foreground font-medium">&ldquo;{cq.quote}&rdquo;</div>
                              {cq.matched_span && (
                                <div className="pt-1 border-t border-border/50">
                                  <span className="text-[10px] font-mono uppercase text-muted-foreground block">
                                    Fragmento literal en el corpus ([sic]):
                                  </span>
                                  <div className="font-mono text-primary font-semibold">&ldquo;{cq.matched_span}&rdquo;</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono">
                              Texto Original del Corpus:
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.sample_index)}
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <span>{expandedIndices[item.sample_index] ? "Ver menos" : "Ver texto completo"}</span>
                              {expandedIndices[item.sample_index] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                          <p className="text-xs text-foreground/80 font-mono mt-1 leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border">
                            {expandedIndices[item.sample_index]
                              ? item.source_text
                              : item.source_text.slice(0, 220) + (item.source_text.length > 220 ? "..." : "")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {modelTab === "disjointness" && (
                <div className="space-y-3">
                  {modelAudit.disjointness_failures.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-emerald-600/30 rounded-sm bg-emerald-500/5">
                      <CheckCircle2 className="w-8 h-8 text-emerald-700 dark:text-emerald-400 mx-auto" />
                      <p className="text-xs font-bold text-foreground">100% Citas Disjuntas</p>
                      <p className="text-[11px] text-muted-foreground">
                        No se detectó ninguna cita compartida simultáneamente entre polaridades opuestas.
                      </p>
                    </div>
                  ) : (
                    modelAudit.disjointness_failures.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-sm border border-amber-700/45 bg-amber-500/[0.07] space-y-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-700/50 font-bold"
                          >
                            {formatSampleIdLabel(item)}
                          </Badge>
                          <span className="text-[11px] font-mono font-bold text-amber-900 dark:text-amber-300">
                            Auto-contradicción detectada (Pos ∩ Neg ≠ ∅)
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] font-semibold text-foreground/80 uppercase font-mono block">
                            Cita duplicada asignada a categorías contradictorias:
                          </span>
                          {item.overlapping_quotes.map((oq, oIdx) => (
                            <div
                              key={oIdx}
                              className="p-2.5 rounded-sm bg-background border border-amber-700/40 flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="font-mono text-foreground font-medium leading-relaxed">
                                &ldquo;{oq.quote}&rdquo;
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {oq.types.map((t) => {
                                  const tl = t.toLowerCase();
                                  const isPos = tl.includes("pos");
                                  const isNeg = tl.includes("neg");
                                  const badgeStyle = isPos
                                    ? "bg-emerald-500/15 border-emerald-600/50 text-emerald-800 dark:text-emerald-300 font-bold"
                                    : isNeg
                                    ? "bg-destructive/15 border-destructive/50 text-destructive font-bold"
                                    : "bg-muted border-border text-muted-foreground font-bold";

                                  return (
                                    <Badge
                                      key={t}
                                      variant="outline"
                                      className={`text-[10px] font-mono py-0.5 px-2 w-[72px] justify-center text-center ${badgeStyle}`}
                                    >
                                      {t}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-amber-700/25">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono block">
                            Texto Original:
                          </span>
                          <p className="text-xs text-foreground font-mono mt-1 bg-background/80 p-2.5 rounded-sm border border-border leading-relaxed">
                            {item.source_text}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {modelTab === "rules" && (
                <div className="space-y-3">
                  {modelAudit.rule_failures.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-emerald-600/30 rounded-sm bg-emerald-500/5">
                      <CheckCircle2 className="w-8 h-8 text-emerald-700 dark:text-emerald-400 mx-auto" />
                      <p className="text-xs font-bold text-foreground">100% Cumplimiento de Reglas</p>
                      <p className="text-[11px] text-muted-foreground">
                        Todas las salidas cumplen rigurosamente el esquema canónico y las restricciones lógicas.
                      </p>
                    </div>
                  ) : (
                    modelAudit.rule_failures.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-sm border border-violet-700/45 bg-violet-500/[0.06] space-y-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] bg-violet-500/15 text-violet-900 dark:text-violet-200 border-violet-700/50 font-bold"
                          >
                            {formatSampleIdLabel(item)}
                          </Badge>
                          <span className="text-xs font-bold text-violet-900 dark:text-violet-300 font-mono">
                            {item.rule_broken}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/85 font-medium">{item.details}</p>
                        <div className="pt-2 border-t border-violet-700/20">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase font-mono block">
                            Texto Original:
                          </span>
                          <p className="text-xs text-foreground font-mono mt-1 bg-background/85 p-2.5 rounded-sm border border-border leading-relaxed">
                            {item.source_text}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* PAIRWISE DISCREPANCY AUDIT VIEW */}
          {/* ══════════════════════════════════════════════════════════ */}
          {!isModelMode && pairwiseAudit && !loading && (
            <div className="space-y-3">
              {pairwiseAudit.discrepancies
                .filter((d) =>
                  selectedDimension === "all"
                    ? true
                    : d.differences.some((diff) => diff.dimension === selectedDimension)
                )
                .map((item) => {
                  const filteredDiffs =
                    selectedDimension === "all"
                      ? item.differences
                      : item.differences.filter((diff) => diff.dimension === selectedDimension);

                  const allRowQuotes = filteredDiffs.flatMap((d) => [...(d.quotes_a || []), ...(d.quotes_b || [])]);
                  const isExpanded = Boolean(expandedIndices[item.sample_index]);
                  const displayText = isExpanded
                    ? item.source_text
                    : item.source_text.slice(0, 220) + (item.source_text.length > 220 ? "..." : "");
                  const isHumanA = config.modelA === "human_expert" || config.modelA.startsWith("human_expert");
                  const isHumanB = config.modelB === "human_expert" || config.modelB.startsWith("human_expert");

                  return (
                    <div
                      key={item.sample_index}
                      className="p-4 rounded-sm border border-border bg-card/80 hover:border-primary/40 space-y-3 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] bg-muted/40 border-border">
                            {formatSampleIdLabel(item)}
                          </Badge>
                          <span className="text-xs font-semibold text-foreground">
                            {filteredDiffs.length} discrepancia(s) en esta muestra
                          </span>
                        </div>
                      </div>

                      {/* Assigned Context & Spec Variables (or fallback Source Text) */}
                      {(() => {
                        const assignedFields = [
                          ...(item.context_fields || []),
                          ...(item.spec_fields || []),
                        ];
                        if (assignedFields.length > 0) {
                          return (
                            <div className="space-y-2">
                              {assignedFields.map((field) => {
                                const fieldVal = field.value ?? "";
                                const isLong = fieldVal.length > 220;
                                const fieldDisplay =
                                  isExpanded || !isLong ? fieldVal : fieldVal.slice(0, 220) + "...";
                                const isSpecRole = field.role === "spec";
                                return (
                                  <div key={field.name} className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[11px] font-semibold text-foreground">
                                        {field.name}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] font-mono px-1.5 py-0 uppercase ${
                                          isSpecRole
                                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                            : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                                        }`}
                                      >
                                        {isSpecRole ? "SPEC" : "CONTEXTO"}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-foreground/85 font-mono leading-relaxed bg-muted/20 p-2.5 rounded-sm border border-border/80">
                                      {renderHighlightedSourceText(fieldDisplay, allRowQuotes)}
                                    </p>
                                    {isLong && (
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => toggleExpand(item.sample_index)}
                                          className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-mono font-semibold"
                                        >
                                          <span>{isExpanded ? "Menos texto" : "Ver texto completo"}</span>
                                          {isExpanded ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                          ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-1.5">
                            <p className="text-xs text-foreground/85 font-mono leading-relaxed bg-muted/20 p-3 rounded-sm border border-border/80">
                              {renderHighlightedSourceText(displayText, allRowQuotes)}
                            </p>
                            {item.source_text.length > 220 && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.sample_index)}
                                  className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-mono font-semibold"
                                >
                                  <span>{isExpanded ? "Menos texto" : "Ver texto completo"}</span>
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Side-by-side Differences (Structured like Capture 2, keeping current visual style) */}
                      <div className="space-y-3 pt-1">
                        {filteredDiffs.map((diff, dIdx) => {
                          const typedA =
                            diff.typed_quotes_a && diff.typed_quotes_a.length > 0
                              ? diff.typed_quotes_a
                              : (diff.quotes_a || []).map((q) => ({ quote: q, polarity: "neutral" as const, is_verbatim: true }));
                          const typedB =
                            diff.typed_quotes_b && diff.typed_quotes_b.length > 0
                              ? diff.typed_quotes_b
                              : (diff.quotes_b || []).map((q) => ({ quote: q, polarity: "neutral" as const, is_verbatim: true }));

                          const renderRaterBox = (
                            raterName: string,
                            isHumanRater: boolean,
                            val: string,
                            quotes: { quote: string; polarity: "positive" | "negative" | "neutral"; is_verbatim: boolean }[]
                          ) => (
                            <div className="p-3 rounded-sm bg-card border border-border space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground border-b border-border/50 pb-1.5">
                                {isHumanRater ? (
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                                ) : (
                                  <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                                )}
                                <span className="truncate font-mono">{raterName}</span>
                              </div>

                              <div className="space-y-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Menciones:</span>
                                  <span className="font-mono font-bold text-foreground">{quotes.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Valor / Sentimiento:</span>
                                  <span
                                    className={`font-mono font-bold capitalize underline underline-offset-2 ${
                                      val === "positive"
                                        ? "text-emerald-800 dark:text-emerald-300"
                                        : val === "negative"
                                        ? "text-destructive"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {val}
                                  </span>
                                </div>
                              </div>

                              {quotes.length > 0 && (
                                <div className="flex flex-col gap-1.5 pt-1">
                                  {quotes.map((tq, qIdx) => {
                                    const pillClass =
                                      tq.polarity === "positive"
                                        ? "bg-emerald-500/10 border-emerald-600/45 text-emerald-900 dark:text-emerald-200"
                                        : tq.polarity === "negative"
                                        ? "bg-destructive/10 border-destructive/45 text-destructive"
                                        : "bg-amber-500/10 border-amber-700/45 text-amber-900 dark:text-amber-200";
                                    return (
                                      <div
                                        key={qIdx}
                                        className={`px-2 py-1 rounded-sm border text-[11px] font-mono flex items-center justify-between gap-1.5 ${pillClass}`}
                                      >
                                        <span className="italic break-words leading-snug">&ldquo;{tq.quote}&rdquo;</span>
                                        {tq.is_verbatim ? (
                                          <Check className="w-3 h-3 shrink-0 opacity-85" />
                                        ) : (
                                          <X className="w-3 h-3 shrink-0 opacity-85" />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );

                          return (
                            <div
                              key={dIdx}
                              className="p-3 rounded-sm bg-muted/15 border border-border space-y-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono text-muted-foreground uppercase font-bold">
                                  Variable:{" "}
                                  <span className="text-foreground capitalize ml-1">
                                    {diff.dimension.replace(/_/g, " ")}
                                  </span>
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {renderRaterBox(
                                  config.modelAName || config.modelA.split("/")[1] || config.modelA,
                                  isHumanA,
                                  diff.model_a_val,
                                  typedA
                                )}
                                {renderRaterBox(
                                  config.modelBName || config.modelB.split("/")[1] || config.modelB,
                                  isHumanB,
                                  diff.model_b_val,
                                  typedB
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-card/60 flex items-center justify-between text-xs text-muted-foreground px-5 shrink-0">
          <span>
            {isModelMode
              ? `Total analizado: ${modelAudit?.total_samples ?? 0} muestras`
              : `Total comparado: ${pairwiseAudit?.total_compared ?? 0} muestras`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || (!modelAudit && !pairwiseAudit)}
              className="h-8 px-3.5 text-xs font-semibold gap-1.5 rounded-sm border-border bg-background hover:bg-muted text-foreground cursor-pointer"
              title="Exportar registros de auditoría en formato CSV"
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>Exportar CSV</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose} className="h-8 px-4 text-xs font-semibold cursor-pointer">
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
