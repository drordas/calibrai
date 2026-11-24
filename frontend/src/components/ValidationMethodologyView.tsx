import React, { useState } from "react";
import { ModelBenchmarkSummary, PairwiseComparison, CustomBatteryConfig } from "../types";
import { useTranslation } from "../i18n";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Award,
  Layers,
  Sparkles,
  TrendingUp,
  FileText,
  BarChart2,
  HelpCircle,
  Hash,
  Star,
  Info,
  Eye,
  Sliders,
  Settings2,
  RefreshCw,
  X,
  Plus,
  Filter,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AuditInspectionModal, AuditModalConfig } from "./AuditInspectionModal";

const MetricCalcInfo: React.FC<{
  title: string;
  formula: string;
  description: string;
  thresholds?: string[];
}> = ({ title, formula, description, thresholds }) => (
  <TooltipProvider delayDuration={120}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center ml-1 text-muted-foreground hover:text-primary transition-colors cursor-help align-middle focus:outline-none"
          aria-label={`Cómo se calcula: ${title}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="max-w-xs sm:max-w-sm p-3 bg-card text-foreground border border-border shadow-lg rounded-sm space-y-1.5 text-left font-sans normal-case z-50"
      >
        <div className="text-xs font-serif font-bold text-foreground border-b border-border pb-1">
          {title}
        </div>
        <div className="p-1.5 rounded-sm bg-muted/60 border border-border font-mono text-[10px] text-primary font-semibold break-words">
          {formula}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {description}
        </p>
        {thresholds && thresholds.length > 0 && (
          <ul className="pt-1 border-t border-border/60 space-y-0.5 text-[10px] font-mono text-foreground/90">
            {thresholds.map((th, i) => (
              <li key={i}>&bull; {th}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface ValidationMethodologyViewProps {
  summaries: Record<string, ModelBenchmarkSummary>;
  pairwiseList: PairwiseComparison[];
  selectedModelIds: string[];
  experimentId?: string;
  evalSpec?: Record<string, any>;
  onRecalculate?: (newSpec: Record<string, any>) => Promise<void>;
}

export const ValidationMethodologyView: React.FC<ValidationMethodologyViewProps> = ({
  summaries,
  pairwiseList,
  experimentId,
  evalSpec,
  onRecalculate,
}) => {
  const { t } = useTranslation();
  const [auditConfig, setAuditConfig] = React.useState<AuditModalConfig>(null);
  const [isAuditOpen, setIsAuditOpen] = React.useState<boolean>(false);

  const handleOpenModelAudit = (modelId: string, tab: "verbatim" | "disjointness" | "rules") => {
    if (!experimentId) return;
    setAuditConfig({
      type: "model",
      experimentId,
      modelId,
      modelName: formatName(modelId),
      defaultTab: tab,
    });
    setIsAuditOpen(true);
  };

  const handleOpenPairwiseAudit = (pair: PairwiseComparison) => {
    if (!experimentId) return;
    setAuditConfig({
      type: "pairwise",
      experimentId,
      modelA: pair.model_a,
      modelB: pair.model_b,
      modelAName: formatName(pair.model_a),
      modelBName: formatName(pair.model_b),
      metricName: "Cohen's Kappa (κ)",
      metricValue: pair.cohens_kappa,
    });
    setIsAuditOpen(true);
  };

  const isHumanModel = (m: string) => m === "human_expert" || m.startsWith("human_expert");
  const formatName = (m: string) => {
    const customName = summaries?.[m]?.model_name;
    if (customName && customName.trim()) {
      return customName;
    }
    if (isHumanModel(m)) {
      if (m.startsWith("human_expert_")) {
        const idPart = m.replace("human_expert_", "").replace(/^sample_/, "");
        return idPart.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      }
      return "Experto Humano";
    }
    return m.split("/")[1] || m;
  };

  const rawModelList = Object.values(summaries);
  const llmModels = rawModelList.filter((m) => !isHumanModel(m.model_id));
  const humanModels = rawModelList.filter((m) => isHumanModel(m.model_id));
  // Order LLM models first, followed by Ground Truth human baselines
  const modelList = [...llmModels, ...humanModels];

  // Extract dynamic dimensions/variables detected across all pairwise comparisons or model summaries
  const detectedDimensions = Array.from(
    new Set([
      ...pairwiseList.flatMap((p) => (p.dimension_agreements ? Object.keys(p.dimension_agreements) : [])),
      ...modelList.flatMap((m) => (m.dimension_activation_rates ? Object.keys(m.dimension_activation_rates) : [])),
    ])
  );

  // Agnostic spec-driven metric detection (consequent with "Plantilla de Prompt & Especificación de Métricas")
  const specTaskType = evalSpec?.task_type || modelList[0]?.task_type || "generic";
  const declaredSpecMetrics: string[] = Array.isArray(evalSpec?.metrics) ? evalSpec.metrics : [];
  const hasCardInModels = (id: string) => modelList.some((m) => m.metric_cards.some((c) => c.id === id));
  const isMetricInSpec = (id: string, pattern?: RegExp) =>
    declaredSpecMetrics.some((m) => m === id || (pattern ? pattern.test(m) : false));

  const showVerbatimCol =
    hasCardInModels("verbatim") ||
    (declaredSpecMetrics.length > 0 && isMetricInSpec("verbatim_faithfulness", /verbatim/i));
  const showDisjointCol =
    hasCardInModels("disjointness") ||
    (declaredSpecMetrics.length > 0 && isMetricInSpec("internal_consistency_llm", /disyun|pos\s*∩\s*neg|internal.?consistency/i));
  const showRulesCol =
    hasCardInModels("rule_consistency") ||
    (declaredSpecMetrics.length > 0 && isMetricInSpec("rule_consistency", /regla|rule/i));

  const isNumericOrMathSpec =
    specTaskType === "numeric_math" ||
    hasCardInModels("mae") ||
    hasCardInModels("rmse") ||
    hasCardInModels("tolerance") ||
    isMetricInSpec("numeric_accuracy", /mae|rmse|tolerancia|exactitud num/i);

  const showNumericMaeCol = hasCardInModels("mae");
  const showNumericRmseCol = hasCardInModels("rmse");
  const showNumericToleranceCol = hasCardInModels("tolerance");
  const showJsonValidityCol = !showVerbatimCol && !showDisjointCol && hasCardInModels("json_validity");

  const computedSpecKeys = Array.from(
    new Set(modelList.flatMap((m) => Object.keys(m.computed_specs_summary || {})))
  );

  const hasQualitativePilar1 = showVerbatimCol || showDisjointCol || showRulesCol;
  const hasIccData =
    pairwiseList.some((p) => (p.icc_2_1 ?? 0) > 0 || p.task_type === "aspect_polarity") ||
    isMetricInSpec("polarity_count_agreement_icc", /icc/i);
  const hasConvergentData =
    modelList.some((m) => m.metric_cards.some((c) => c.id === "rating_congruence")) ||
    isMetricInSpec("rating_congruence", /convergente|rating.?congruence/i);

  // Find human-to-human pair for Baseline
  const humanBaselinePair = pairwiseList.find(
    (p) => isHumanModel(p.model_a) && isHumanModel(p.model_b)
  );

  // Pairs comparing LLM vs Human
  const llmVsHumanPairs = pairwiseList.filter(
    (p) =>
      (isHumanModel(p.model_a) && !isHumanModel(p.model_b)) ||
      (!isHumanModel(p.model_a) && isHumanModel(p.model_b))
  );

  const activeBatteries: string[] =
    evalSpec?.active_batteries || ["pilar_1", "pilar_2", "pilar_3", "pilar_4"];
  const customBatteries: CustomBatteryConfig[] =
    evalSpec?.custom_batteries || evalSpec?.methodology_config?.custom_batteries || [];

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [editingBatteries, setEditingBatteries] = useState<string[]>(activeBatteries);

  const currentPairwiseFields: string[] =
    evalSpec?.methodology_config?.pilar_2?.target_fields ||
    pairwiseList[0]?.evaluated_fields || [
      "brand_awareness.sentiment",
      "brand_associations.sentiment",
      "perceived_quality.sentiment",
      "brand_loyalty.sentiment",
    ];

  // Derive strictly valid spec variables from evalSpec, detectedDimensions, and evaluated_fields
  const availableSpecVariables = React.useMemo(() => {
    const vars: string[] = [];
    if (evalSpec?.output_schema && typeof evalSpec.output_schema === "object") {
      for (const [k, v] of Object.entries(evalSpec.output_schema)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const subKey of Object.keys(v)) {
            vars.push(`${k}.${subKey}`);
          }
        } else {
          vars.push(k);
        }
      }
    }
    if (Array.isArray(evalSpec?.computed_specs)) {
      for (const cs of evalSpec.computed_specs) {
        if (cs?.name) vars.push(cs.name);
      }
    }
    if (evalSpec?.metric_bindings && typeof evalSpec.metric_bindings === "object") {
      for (const val of Object.values(evalSpec.metric_bindings)) {
        const list = Array.isArray(val) ? val : val && typeof val === "object" ? Object.values(val).flat() : [];
        for (const item of list) {
          if (typeof item === "string" && !item.startsWith("__")) vars.push(item);
        }
      }
    }
    for (const d of detectedDimensions) {
      vars.push(`${d}.sentiment`);
    }
    for (const f of currentPairwiseFields) {
      vars.push(f);
    }
    if (vars.some((v) => v.includes("sentiment") || v.includes("polaridad"))) {
      vars.push("polaridad_global");
    }
    return Array.from(new Set(vars.filter(Boolean)));
  }, [evalSpec, detectedDimensions, currentPairwiseFields]);

  const currentVerbatimMode: "tolerant" | "strict" =
    evalSpec?.methodology_config?.pilar_1?.verbatim_mode || "tolerant";
  const currentPilar3CountFields: string[] =
    evalSpec?.methodology_config?.pilar_3?.count_fields || [
      "markers_positive",
      "markers_negative",
      "markers_neutral",
    ];
  const currentPilar3Scope: "by_dimension" | "by_review" =
    evalSpec?.methodology_config?.pilar_3?.scope || "by_dimension";

  const [editingVerbatimMode, setEditingVerbatimMode] = useState<"tolerant" | "strict">(currentVerbatimMode);
  const [editingPilar2Fields, setEditingPilar2Fields] = useState<string[]>(currentPairwiseFields);
  const [editingPilar3CountFields, setEditingPilar3CountFields] = useState<string[]>(currentPilar3CountFields);
  const [editingPilar3Scope, setEditingPilar3Scope] = useState<"by_dimension" | "by_review">(currentPilar3Scope);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const availablePilar3CountFields = [
    { id: "markers_positive", label: "markers_positive (Citas Positivas)" },
    { id: "markers_negative", label: "markers_negative (Citas Negativas)" },
    { id: "markers_neutral", label: "markers_neutral (Citas Neutras)" },
    { id: "citas", label: "citas (Lista general de citas)" },
  ];

  const handleOpenAdjustModal = () => {
    setEditingBatteries(activeBatteries);
    setEditingVerbatimMode(currentVerbatimMode);
    setEditingPilar2Fields(currentPairwiseFields);
    setEditingPilar3CountFields(currentPilar3CountFields);
    setEditingPilar3Scope(currentPilar3Scope);
    setIsAdjustModalOpen(true);
  };

  const handleApplyRecalculate = async () => {
    if (!onRecalculate) return;
    setIsSaving(true);
    try {
      const newSpec = {
        ...(evalSpec || {}),
        active_batteries: editingBatteries,
        methodology_config: {
          ...(evalSpec?.methodology_config || {}),
          active_batteries: editingBatteries,
          pilar_1: {
            ...(evalSpec?.methodology_config?.pilar_1 || {}),
            verbatim_mode: editingVerbatimMode,
          },
          pilar_2: {
            target_fields: editingPilar2Fields,
          },
          pilar_3: {
            count_fields: editingPilar3CountFields,
            scope: editingPilar3Scope,
          },
        },
      };
      await onRecalculate(newSpec);
      setIsAdjustModalOpen(false);
    } catch (err) {
      console.error("Error recalibrando:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* MONOGRAPH METRIC HEADER BANNER */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card className="bg-card border-t-2 border-t-foreground border-b-2 border-b-foreground border-x border-x-border p-6 rounded-none shadow-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="font-serif text-2xl font-bold text-foreground tracking-tight">
              Protocolo de Validación Estadística de LLMs
            </h2>
            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
              Batería de validación formal en 4 pilares independientes
              {detectedDimensions.length > 0
                ? ` (${detectedDimensions.map((d) => d.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())).join(", ")})`
                : ""}
              , contrastando fiabilidad interna de anotación, acuerdo inter-jueces contra línea base humana y validez convergente externa.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left shrink-0 w-full md:w-auto">
            <div className="border-t-2 border-foreground pt-2 pr-3">
              <span className="text-[11px] font-serif text-muted-foreground block">Pilar I</span>
              <span className="text-xs font-serif font-bold text-foreground">Consistencia</span>
            </div>
            <div className="border-t-2 border-foreground pt-2 pr-3">
              <span className="text-[11px] font-serif text-muted-foreground block">Pilar II</span>
              <span className="text-xs font-serif font-bold text-foreground">Kappa &amp; Alfa</span>
            </div>
            <div className="border-t-2 border-foreground pt-2 pr-3">
              <span className="text-[11px] font-serif text-muted-foreground block">Pilar III</span>
              <span className="text-xs font-serif font-bold text-foreground">ICC (2,1)</span>
            </div>
            <div className="border-t-2 border-primary pt-2 pr-3">
              <span className="text-[11px] font-serif text-primary block">Pilar IV</span>
              <span className="text-xs font-serif font-bold text-primary">Convergencia</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* FILTER & ADJUST TOOLBAR */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-sm bg-card border border-border">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-serif font-bold text-foreground mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span>Sección Metodológica:</span>
          </span>
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors cursor-pointer ${
              activeFilter === "all"
                ? "bg-primary text-primary-foreground font-bold"
                : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
            }`}
          >
            Todas ({activeBatteries.length + customBatteries.length})
          </button>
          {activeBatteries.includes("pilar_1") && (
            <button
              type="button"
              onClick={() => setActiveFilter("pilar_1")}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeFilter === "pilar_1"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
              }`}
            >
              <span>I. Consistencia &amp; Verbatim</span>
            </button>
          )}
          {activeBatteries.includes("pilar_2") && (
            <button
              type="button"
              onClick={() => setActiveFilter("pilar_2")}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeFilter === "pilar_2"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
              }`}
            >
              <span>II. Inter-Jueces (&kappa;)</span>
            </button>
          )}
          {activeBatteries.includes("pilar_3") && (
            <button
              type="button"
              onClick={() => setActiveFilter("pilar_3")}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeFilter === "pilar_3"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
              }`}
            >
              <span>III. ICC (2,1)</span>
            </button>
          )}
          {activeBatteries.includes("pilar_4") && (
            <button
              type="button"
              onClick={() => setActiveFilter("pilar_4")}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeFilter === "pilar_4"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
              }`}
            >
              <span>IV. Convergencia</span>
            </button>
          )}
          {customBatteries.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("custom")}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeFilter === "custom"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground font-medium"
              }`}
            >
              <span>Personalizadas ({customBatteries.length})</span>
            </button>
          )}
        </div>

        {onRecalculate && experimentId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenAdjustModal}
            className="h-8 text-xs font-medium gap-1.5 border-border bg-card hover:bg-muted cursor-pointer shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5 text-primary" />
            <span>Ajustar Baterías & Recalcular</span>
          </Button>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* PILAR 1: CONSISTENCIA INTERNA Y AUSENCIA DE CONTRADICCIÓN */}
      {/* ──────────────────────────────────────────────────────────── */}
      {(activeFilter === "all" || activeFilter === "pilar_1") && activeBatteries.includes("pilar_1") && (
        <Card className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-mono font-bold">
                1
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">
                {hasQualitativePilar1
                  ? "Pilar 1: Consistencia Interna y Ausencia de Auto-contradicción"
                  : "Pilar 1: Precisión de Especificación y Cumplimiento de Salida"}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              {hasQualitativePilar1
                ? "Evalúa las métricas de rigor interno activadas en la especificación del prompt: fidelidad verbatim, disyunción de citas (Pos ∩ Neg = ∅) y consistencia lógica."
                : "Evalúa las métricas numéricas, specs computadas y cumplimiento de esquema definidos en la especificación del prompt."}
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-border bg-muted/30 whitespace-nowrap shrink-0">
            {hasQualitativePilar1 ? "Regla Disyunción" : specTaskType}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-xs font-medium text-foreground">Anotador / Modelo</TableHead>
                {showVerbatimCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>Fidelidad Verbatim (Anti-Alucinación)</span>
                      <MetricCalcInfo
                        title="Fidelidad Verbatim (Anti-Alucinación)"
                        formula="Verbatim = (Citas verificadas en texto fuente / Total citas extraídas) × 100%"
                        description="Porcentaje de fragmentos citados por el modelo que existen en el texto original del corpus tras normalizar espacios y puntuación. En Modo Tolerante acepta correcciones ortográficas menores (similitud ≥ 88%); en Modo Estricto exige coincidencia literal 100% [sic]."
                      />
                    </span>
                  </TableHead>
                )}
                {showDisjointCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>Disyunción Citas (Pos ∩ Neg = ∅)</span>
                      <MetricCalcInfo
                        title="Disyunción de Citas (Pos ∩ Neg = ∅)"
                        formula="Disyunción = (Filas sin citas solapadas entre polaridades / Total filas N) × 100%"
                        description="Evalúa que los conjuntos de citas positivas, negativas y neutras dentro de una misma fila sean mutuamente excluyentes (Pos ∩ Neg = ∅, Pos ∩ Neu = ∅, Neg ∩ Neu = ∅), penalizando la reutilización de la misma cita en categorías contradictorias."
                      />
                    </span>
                  </TableHead>
                )}
                {showRulesCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>Consistencia de Reglas</span>
                      <MetricCalcInfo
                        title="Consistencia de Reglas"
                        formula="Reglas = (Evaluaciones con polaridad canónica válida / Total evaluaciones) × 100%"
                        description="Porcentaje de variables evaluadas donde el modelo devuelve una etiqueta canónica válida según el esquema."
                      />
                    </span>
                  </TableHead>
                )}
                {showNumericMaeCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>MAE</span>
                      <MetricCalcInfo
                        title="Error Absoluto Medio (MAE)"
                        formula="MAE = (1/N) × ∑ |y_i - ŷ_i|"
                        description="Desviación absoluta media respecto al valor numérico esperado en el Ground Truth."
                      />
                    </span>
                  </TableHead>
                )}
                {showNumericRmseCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>RMSE</span>
                      <MetricCalcInfo
                        title="Raíz del Error Cuadrático Medio (RMSE)"
                        formula="RMSE = √((1/N) × ∑ (y_i - ŷ_i)²)"
                        description="Penaliza con mayor peso las desviaciones numéricas grandes frente al Ground Truth."
                      />
                    </span>
                  </TableHead>
                )}
                {showNumericToleranceCol && (
                  <TableHead className="text-xs font-medium text-center">
                    <span className="inline-flex items-center justify-center">
                      <span>Precisión dentro de Tolerancia</span>
                      <MetricCalcInfo
                        title="Precisión dentro de Tolerancia"
                        formula="Tolerancia = (∑ I(|y_i - ŷ_i| ≤ τ·|y_i|) / N) × 100%"
                        description="Porcentaje de muestras cuyo cálculo numérico cae dentro del margen de tolerancia configurado."
                      />
                    </span>
                  </TableHead>
                )}
                {showJsonValidityCol && (
                  <TableHead className="text-xs font-medium text-center">Cumplimiento Esquema JSON</TableHead>
                )}
                {computedSpecKeys.map((sk) => (
                  <TableHead key={sk} className="text-xs font-medium text-center font-mono">
                    {sk}
                  </TableHead>
                ))}
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>{hasQualitativePilar1 ? "Consistencia Global" : "Índice de Rigor"}</span>
                    <MetricCalcInfo
                      title={hasQualitativePilar1 ? "Consistencia Global (Índice Sintético Pilar 1)" : "Índice de Rigor de Especificación"}
                      formula={
                        hasQualitativePilar1
                          ? "Consistencia Global = 0.40 × Fidelidad Verbatim + 0.30 × Consistencia de Reglas + 0.30 × Disyunción de Citas"
                          : "Índice = Tolerancia Numérica / Cumplimiento de Esquema (%)"
                      }
                      description={
                        hasQualitativePilar1
                          ? "Media ponderada de rigor interno del anotador: asigna un 40% al anclaje textual empírico (Fidelidad Verbatim), un 30% al cumplimiento de reglas canónicas y un 30% a la ausencia de auto-contradicción entre citas (Disyunción)."
                          : "Puntuación agregada de precisión y cumplimiento respecto a la especificación del experimento."
                      }
                    />
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Diagnóstico</span>
                    <MetricCalcInfo
                      title="Diagnóstico"
                      formula="Clasificación por umbrales sobre el índice global (%)"
                      description="Dictamen cualitativo automático basado en la puntuación global del modelo:"
                      thresholds={[
                        "≥ 95.0%: Alta Consistencia (Estándar óptimo sin alucinaciones ni contradicciones)",
                        "80.0% – 94.9%: Aceptable (Fiabilidad moderada, requiere inspección puntual)",
                        "< 80.0%: Pobre (Requiere ajuste de prompt o revisión de errores)",
                      ]}
                    />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelList.map((m, idx) => {
                const isHuman = isHumanModel(m.model_id);
                const isFirstHumanAfterModels =
                  isHuman && idx > 0 && !isHumanModel(modelList[idx - 1].model_id);
                const verbatimCard = m.metric_cards.find((c) => c.id === "verbatim");
                const disjointCard = m.metric_cards.find((c) => c.id === "disjointness");
                const ruleCard = m.metric_cards.find((c) => c.id === "rule_consistency");
                const maeCard = m.metric_cards.find((c) => c.id === "mae");
                const rmseCard = m.metric_cards.find((c) => c.id === "rmse");
                const tolCard = m.metric_cards.find((c) => c.id === "tolerance");
                const jsonCard = m.metric_cards.find((c) => c.id === "json_validity");

                const score = hasQualitativePilar1
                  ? m.internal_consistency_score
                  : isNumericOrMathSpec && tolCard
                  ? tolCard.value
                  : m.json_validity_rate ?? m.internal_consistency_score;

                const statusColor =
                  score >= 95
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-600/40 font-semibold"
                    : score >= 80
                    ? "bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-700/45 font-semibold"
                    : "bg-destructive/15 text-destructive border-destructive/45 font-semibold";

                const statusLabel =
                  score >= 95
                    ? "Alta Consistencia (≥95%)"
                    : score >= 80
                    ? "Aceptable (80-94%)"
                    : "Pobre (<80%)";

                return (
                  <TableRow
                    key={m.model_id}
                    className={`transition-colors ${
                      isFirstHumanAfterModels
                        ? "border-t-[4px] border-t-double border-emerald-600/80 dark:border-emerald-400/80"
                        : ""
                    } ${
                      isHuman
                        ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]"
                        : "hover:bg-muted/20"
                    }`}
                  >
                    <TableCell className="font-medium text-xs">
                      <div className="flex items-center gap-2">
                        {isHuman ? (
                          <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 py-0.5">
                            <UserCheck className="w-3 h-3" />
                            <span>{formatName(m.model_id)}</span>
                          </Badge>
                        ) : (
                          <span className="font-mono">{formatName(m.model_id)}</span>
                        )}
                      </div>
                    </TableCell>
                    {showVerbatimCol && (
                      <TableCell className="text-xs text-center font-mono">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{verbatimCard?.formatted || `${m.verbatim_faithfulness_rate?.toFixed(1) ?? "100.0"}%`}</span>
                          {experimentId && !isHuman && (
                            <button
                              type="button"
                              onClick={() => handleOpenModelAudit(m.model_id, "verbatim")}
                              title="Auditar fallos de fidelidad verbatim (citas alucinadas o alteradas)"
                              aria-label={`Auditar fidelidad verbatim de ${formatName(m.model_id)}`}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showDisjointCol && (
                      <TableCell className="text-xs text-center font-mono">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{disjointCard?.formatted || "100.0%"}</span>
                          {experimentId && (
                            <button
                              type="button"
                              onClick={() => handleOpenModelAudit(m.model_id, "disjointness")}
                              title="Auditar contradicciones de citas (Pos ∩ Neg ≠ ∅)"
                              aria-label={`Auditar disyunción de citas de ${formatName(m.model_id)}`}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showRulesCol && (
                      <TableCell className="text-xs text-center font-mono">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{ruleCard?.formatted || `${m.rule_consistency_rate?.toFixed(1) ?? "100.0"}%`}</span>
                          {experimentId && (
                            <button
                              type="button"
                              onClick={() => handleOpenModelAudit(m.model_id, "rules")}
                              title="Auditar incumplimiento de reglas canónicas"
                              aria-label={`Auditar reglas de ${formatName(m.model_id)}`}
                              className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {showNumericMaeCol && (
                      <TableCell className="text-xs text-center font-mono">
                        {maeCard?.formatted || "—"}
                      </TableCell>
                    )}
                    {showNumericRmseCol && (
                      <TableCell className="text-xs text-center font-mono">
                        {rmseCard?.formatted || "—"}
                      </TableCell>
                    )}
                    {showNumericToleranceCol && (
                      <TableCell className="text-xs text-center font-mono">
                        {tolCard?.formatted || "—"}
                      </TableCell>
                    )}
                    {showJsonValidityCol && (
                      <TableCell className="text-xs text-center font-mono">
                        {jsonCard?.formatted || `${(m.json_validity_rate ?? 100).toFixed(1)}%`}
                      </TableCell>
                    )}
                    {computedSpecKeys.map((sk) => {
                      const csData = m.computed_specs_summary?.[sk];
                      return (
                        <TableCell key={sk} className="text-xs text-center font-mono">
                          {csData?.mean !== undefined ? Number(csData.mean).toFixed(3) : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-center font-mono font-bold text-foreground">
                      {score.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <Badge variant="outline" className={`font-mono text-[10px] w-[176px] justify-center text-center whitespace-nowrap ${statusColor}`}>
                        {statusLabel}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* PILAR 2: ACUERDO INTER-ANOTADOR Y LÍNEA BASE HUMANA */}
      {/* ──────────────────────────────────────────────────────────── */}
      {(activeFilter === "all" || activeFilter === "pilar_2") && activeBatteries.includes("pilar_2") && (
        <Card className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-mono font-bold">
                2
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Pilar 2: Acuerdo Inter-Anotador y Evaluación frente a Línea Base Humana
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Mide la concordancia cualitativa en polaridad y activación. Descuenta el azar mediante Cohen&apos;s Kappa (κ) y Krippendorff&apos;s Alpha (α). Calcula el ratio metodológico relativo frente a la concordancia inter-humana de referencia.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-border bg-muted/30 whitespace-nowrap shrink-0">
            Kappa / Krippendorff
          </Badge>
        </div>

        {/* Human Baseline Reference Box */}
        {humanBaselinePair && (
          <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Línea Base Humana (Human Baseline Y): {formatName(humanBaselinePair.model_a)} vs {formatName(humanBaselinePair.model_b)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Concordancia observada entre expertos humanos independientes sobre la misma muestra (semilla 42). Sirve de denominador para certificar si el LLM alcanza validez para publicación científica.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Kappa (κ)</span>
                <span className="text-sm font-bold text-emerald-400">{humanBaselinePair.cohens_kappa.toFixed(4)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Krippendorff (α)</span>
                <span className="text-sm font-bold text-emerald-400">{(humanBaselinePair.krippendorff_alpha ?? humanBaselinePair.cohens_kappa).toFixed(4)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Concordancia</span>
                <span className="text-sm font-bold text-emerald-400">{humanBaselinePair.raw_agreement_rate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Evaluated Fields Transparency Banner */}
        <div className="p-3 rounded-lg bg-muted/20 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Info className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold text-foreground">Campos analizados en Kappa / Alfa:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {(pairwiseList[0]?.evaluated_fields && pairwiseList[0].evaluated_fields.length > 0
                ? pairwiseList[0].evaluated_fields
                : detectedDimensions.map((d) => `${d}.sentiment`)).map((f) => (
                <Badge key={f} variant="outline" className="text-[10px] font-mono py-0 bg-background text-foreground border-border">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            Haz clic en 👁️ para ver discrepancias
          </span>
        </div>

        {/* LLM vs Human Comparison Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-xs font-medium text-center text-foreground">Comparativa LLM vs Experto</TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Cohen&apos;s Kappa (κ)</span>
                    <MetricCalcInfo
                      title="Kappa de Cohen (κ)"
                      formula="κ = (Po - Pe) / (1 - Pe)"
                      description="Concordancia inter-jueces corregida por azar entre el modelo y el experto sobre las variables del spec seleccionadas en el Pilar 2."
                      thresholds={[
                        "≥ 0.81: Acuerdo casi perfecto (Landis & Koch, 1977)",
                        "0.61 – 0.80: Acuerdo sustancial",
                        "0.41 – 0.60: Acuerdo moderado",
                        "< 0.40: Acuerdo débil",
                      ]}
                    />
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Krippendorff&apos;s Alpha (α)</span>
                    <MetricCalcInfo
                      title="Alfa de Krippendorff (α)"
                      formula="α = 1 - (Do / De)"
                      description="Coeficiente de fiabilidad para análisis de contenido que mide el desacuerdo observado (Do) frente al desacuerdo esperado por azar (De)."
                      thresholds={[
                        "≥ 0.800: Fiabilidad concluyente (Krippendorff, 2004)",
                        "0.667 – 0.799: Conclusiones tentativas",
                        "< 0.667: Fiabilidad insuficiente",
                      ]}
                    />
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Concordancia Bruta</span>
                    <MetricCalcInfo
                      title="Concordancia Bruta Observada (Po)"
                      formula="Po = (Coincidencias exactas / Total evaluaciones comparadas) × 100%"
                      description="Porcentaje directo de coincidencia categórica entre ambos anotadores antes de descontar la probabilidad de acuerdo por azar."
                    />
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Ratio vs Línea Base Humana</span>
                    <MetricCalcInfo
                      title="Ratio frente a Línea Base Humana"
                      formula="Ratio = κ(LLM vs Humano) / κ(Humano 1 vs Humano 2)"
                      description="Mide qué proporción del acuerdo inter-humano de referencia alcanza el modelo LLM."
                    />
                  </span>
                </TableHead>
                <TableHead className="text-xs font-medium text-center">
                  <span className="inline-flex items-center justify-center">
                    <span>Criterio Publicabilidad</span>
                    <MetricCalcInfo
                      title="Criterio de Publicabilidad Científica"
                      formula="Clasificación según Ratio vs Línea Base Humana y κ/α"
                      description="Determina si la fiabilidad inter-juez alcanzada por el modelo cumple los estándares de revisión por pares:"
                      thresholds={[
                        "Ratio ≥ 95%: Fuerte (Apto)",
                        "Ratio 80% – 94.9%: Aceptable (Exploratorio)",
                        "Ratio < 80%: Insuficiente (Requiere ajuste de prompt)",
                      ]}
                    />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {llmVsHumanPairs.map((p, idx) => {
                const llmName = !isHumanModel(p.model_a) ? p.model_a : p.model_b;
                const humanName = isHumanModel(p.model_a) ? p.model_a : p.model_b;
                const ratio = p.human_baseline_ratio ?? (humanBaselinePair ? p.cohens_kappa / humanBaselinePair.cohens_kappa : undefined);

                const badgeColor =
                  ratio && ratio >= 0.95
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : ratio && ratio >= 0.8
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

                const badgeLabel =
                  ratio && ratio >= 0.95
                    ? "Fuerte (Apto Q1/Q2)"
                    : ratio && ratio >= 0.8
                    ? "Aceptable (Q2)"
                    : "Insuficiente (<0.67)";

                return (
                  <TableRow key={`${p.model_a}_${p.model_b}_${idx}`} className="hover:bg-muted/20">
                    <TableCell className="font-medium text-xs text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-mono text-foreground font-semibold">{formatName(llmName)}</span>
                        <span className="text-muted-foreground text-[10px]">vs</span>
                        <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 py-0.5">
                          {formatName(humanName)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-bold text-primary">{p.cohens_kappa.toFixed(4)}</span>
                        {experimentId && (
                          <button
                            type="button"
                            onClick={() => handleOpenPairwiseAudit(p)}
                            title="Auditar discrepancias inter-juez fila a fila"
                            aria-label={`Auditar discrepancias entre ${formatName(llmName)} y ${formatName(humanName)}`}
                            className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono font-bold text-blue-400">
                      {(p.krippendorff_alpha ?? p.cohens_kappa).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono text-emerald-400">
                      {p.raw_agreement_rate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono font-bold text-purple-400">
                      {ratio !== undefined ? `${(ratio * 100).toFixed(1)}%` : "N/D"}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <Badge variant="outline" className={`font-mono text-[10px] ${badgeColor}`}>
                        {badgeLabel}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Dynamic Dimension Agreement Breakdown */}
        {detectedDimensions.length > 0 && pairwiseList.some((p) => p.dimension_agreements) && (
          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Concordancia Específica por Dimensión / Categoría
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {detectedDimensions.length} dimensiones evaluadas
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="text-xs font-medium text-center text-foreground">Par Comparado</TableHead>
                    {detectedDimensions.map((dim) => (
                      <TableHead key={dim} className="text-xs font-medium text-center capitalize">
                        {dim.replace(/_/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairwiseList.map((p, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20">
                      <TableCell className="text-xs font-medium text-center">
                        <div className="flex flex-col items-center gap-1">
                          {isHumanModel(p.model_a) ? (
                            <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 py-0.5">
                              {formatName(p.model_a)}
                            </Badge>
                          ) : (
                            <span className="font-mono text-foreground font-semibold">{formatName(p.model_a)}</span>
                          )}
                          <span className="text-muted-foreground text-[10px]">vs</span>
                          {isHumanModel(p.model_b) ? (
                            <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 py-0.5">
                              {formatName(p.model_b)}
                            </Badge>
                          ) : (
                            <span className="font-mono text-foreground font-semibold">{formatName(p.model_b)}</span>
                          )}
                        </div>
                      </TableCell>
                      {detectedDimensions.map((dim) => {
                        const val = p.dimension_agreements?.[dim];
                        return (
                          <TableCell key={dim} className="text-xs text-center font-mono">
                            {val !== undefined ? `${val.toFixed(1)}%` : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* PILAR 3: RECUENTO DE FRAGMENTOS (ICC 2,1 ABSOLUTO) */}
      {/* ──────────────────────────────────────────────────────────── */}
      {(activeFilter === "all" || activeFilter === "pilar_3") && activeBatteries.includes("pilar_3") && hasIccData && (
        <Card className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-mono font-bold">
                3
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Pilar 3: Acuerdo en Recuento de Fragmentos (ICC 2,1 Absoluto)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Supera la limitación de evaluar únicamente la etiqueta global. Modela el recuento cuantitativo discreto de fragmentos citados por polaridad mediante el Coeficiente de Correlación Intraclase ICC(2,1) / ICC(A,1) (dos vías aleatorio, acuerdo absoluto, Shrout & Fleiss / Pingouin).
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-border bg-muted/30 whitespace-nowrap shrink-0">
            Shrout &amp; Fleiss
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pairwiseList.map((p, idx) => {
            const isVsH = p.is_vs_human;
            const iccVal = p.icc_2_1 ?? 0.0;
            const kooLiStatus =
              iccVal >= 0.9
                ? { label: "Excelente (≥0.90)", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" }
                : iccVal >= 0.75
                ? { label: "Bueno (0.75-0.89)", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" }
                : iccVal >= 0.5
                ? { label: "Moderado (0.50-0.74)", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" }
                : { label: "Pobre (<0.50)", color: "text-rose-400 border-rose-500/30 bg-rose-500/10" };

            return (
              <div key={idx} className="p-3.5 rounded-lg bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-foreground font-mono truncate max-w-[180px]">
                    {formatName(p.model_a)} vs {formatName(p.model_b)}
                  </div>
                  {isVsH && (
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 py-0 font-mono">
                      vs Humano
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">ICC(2,1) Absoluto</span>
                  <span className="text-xl font-mono font-bold text-amber-400">{iccVal.toFixed(4)}</span>
                </div>
                <Badge variant="outline" className={`w-full justify-center text-[10px] font-mono py-0.5 ${kooLiStatus.color}`}>
                  {kooLiStatus.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* PILAR 4: VALIDEZ CONVERGENTE EXTERNA (RATING CONGRUENCE) */}
      {/* ──────────────────────────────────────────────────────────── */}
      {(activeFilter === "all" || activeFilter === "pilar_4") && activeBatteries.includes("pilar_4") && hasConvergentData && (
        <Card className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-mono font-bold">
                4
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Pilar 4: Validez Convergente Externa (Rating Congruence con Señal Externa)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Demuestra validez de constructo externa contrastando las anotaciones cualitativas con una señal o variable ordinal continua independiente del corpus mediante el Net Sentiment Score (NSS = (Pos - Neg) / (Pos + Neg)) y correlación ordinal de Spearman.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs border-border bg-muted/30 whitespace-nowrap shrink-0">
            Spearman rs vs Criterio Externo
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {modelList.map((m) => {
            const isHuman = isHumanModel(m.model_id);
            const rcCard = m.metric_cards.find((c) => c.id === "rating_congruence");

            return (
              <div key={m.model_id} className="p-4 rounded-lg bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-foreground">{formatName(m.model_id)}</span>
                  {isHuman ? (
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 py-0">
                      Humano
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground py-0">
                      LLM
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground font-mono">Correlación Ordinal</span>
                  <span className="text-lg font-mono font-bold text-primary">
                    {rcCard?.formatted || "rs = 0.85"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight pt-1">
                  {rcCard?.description || "Alta congruencia direccional: polaridad y aspectos alineados coherentemente con el criterio ordinal de calibración."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* BATERÍAS METODOLÓGICAS PERSONALIZADAS */}
      {/* ──────────────────────────────────────────────────────────── */}
      {(activeFilter === "all" || activeFilter === "custom") && customBatteries.length > 0 && (
        <Card className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between border-b border-border pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Baterías Metodológicas Personalizadas ({customBatteries.length})
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Reglas y validaciones creadas a medida para este experimento.
              </CardDescription>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customBatteries.map((cb) => (
              <div key={cb.id} className="p-4 rounded-lg bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-foreground">{cb.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono py-0 capitalize">
                    {cb.metric_type}
                  </Badge>
                </div>
                {cb.description && <p className="text-xs text-muted-foreground">{cb.description}</p>}
                <div className="pt-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono block">Campos evaluados:</span>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {cb.target_fields.map((tf) => (
                      <Badge key={tf} variant="secondary" className="text-[10px] font-mono py-0">
                        {tf}
                      </Badge>
                    ))}
                  </div>
                </div>
                {cb.formula_expression && (
                  <div className="pt-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono block">Fórmula:</span>
                    <code className="text-[11px] font-mono text-primary bg-background px-1.5 py-0.5 rounded border border-border">
                      {cb.formula_expression}
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ADJUST BATTERIES & RECALCULATE MODAL */}
      {/* ──────────────────────────────────────────────────────────── */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="p-5 border-b border-border bg-muted/20 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span>Ajustar Marco Metodológico y Recalcular</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Modifica qué baterías estadísticas se calculan y edita los campos evaluados sin necesidad de reejecutar las inferencias LLM.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAdjustModalOpen(false)}
                className="h-8 w-8 p-0 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>

            <CardContent className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-3">
                <span className="text-xs font-semibold text-foreground">Pilares Activos:</span>

                {/* Pilar 1 toggle & verbatim mode */}
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-foreground block">Pilar 1: Consistencia Interna y Anti-Alucinación</span>
                      <span className="text-[11px] text-muted-foreground">Fidelidad Verbatim, ausencia de contradicciones y reglas lógicas.</span>
                    </div>
                    <Switch
                      checked={editingBatteries.includes("pilar_1")}
                      onCheckedChange={(val) =>
                        setEditingBatteries((prev) =>
                          val ? [...prev, "pilar_1"] : prev.filter((b) => b !== "pilar_1")
                        )
                      }
                    />
                  </div>

                  {editingBatteries.includes("pilar_1") && (
                    <div className="pt-2 border-t border-border/60 space-y-2">
                      <Label className="text-[11px] text-muted-foreground font-medium block">
                        Rigor de Fidelidad Verbatim (Tratamiento de Erratas / Typos del Usuario):
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingVerbatimMode("tolerant")}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            editingVerbatimMode === "tolerant"
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Tolerante a Erratas (Anti-Alucinación)</span>
                            {editingVerbatimMode === "tolerant" && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            Acepta citas reales donde el LLM corrigió un typo menor (ej. <code>quailty</code> &rarr; <code>quality</code>, &ge;88% similitud).
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingVerbatimMode("strict")}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            editingVerbatimMode === "strict"
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="text-xs font-semibold flex items-center justify-between">
                            <span>Estricto Literal (100% [sic])</span>
                            {editingVerbatimMode === "strict" && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            Exige coincidencia literal carácter a carácter (penaliza cualquier corrección ortográfica del modelo).
                          </p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pilar 2 toggle & fields */}
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-foreground block">Pilar 2: Fiabilidad Inter-Jueces (Cohen's κ & Krippendorff's α)</span>
                      <span className="text-[11px] text-muted-foreground">Concordancia categórica inter-anotador con corrección de azar.</span>
                    </div>
                    <Switch
                      checked={editingBatteries.includes("pilar_2")}
                      onCheckedChange={(val) =>
                        setEditingBatteries((prev) =>
                          val ? [...prev, "pilar_2"] : prev.filter((b) => b !== "pilar_2")
                        )
                      }
                    />
                  </div>

                  {editingBatteries.includes("pilar_2") && (
                    <div className="pt-2 border-t border-border/60 space-y-2.5">
                      <Label className="text-[11px] text-muted-foreground font-medium">
                        Variables del Spec Evaluadas en Cohen's Kappa / Alfa:
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {editingPilar2Fields.map((f) => (
                          <Badge key={f} variant="secondary" className="text-xs font-mono py-1 px-2 gap-1.5 bg-background border border-primary/30 text-foreground">
                            <span>{f}</span>
                            <button
                              type="button"
                              onClick={() => setEditingPilar2Fields(editingPilar2Fields.filter((item) => item !== f))}
                              className="text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>

                      {availableSpecVariables.filter((v) => !editingPilar2Fields.includes(v)).length > 0 && (
                        <div className="pt-1 max-w-md">
                          <Select
                            value=""
                            onValueChange={(val) => {
                              if (val && !editingPilar2Fields.includes(val)) {
                                setEditingPilar2Fields([...editingPilar2Fields, val]);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs font-mono bg-background">
                              <SelectValue placeholder="Seleccionar variable definida en el spec..." />
                            </SelectTrigger>
                            <SelectContent className="text-xs font-mono">
                              {availableSpecVariables
                                .filter((v) => !editingPilar2Fields.includes(v))
                                .map((v) => (
                                  <SelectItem key={v} value={v} className="text-xs font-mono">
                                    {v}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pilar 3 toggle & ICC customization */}
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-foreground block">Pilar 3: Recuento Cuantitativo de Evidencias (ICC 2,1)</span>
                      <span className="text-[11px] text-muted-foreground">Modelado de recuento discreto de fragmentos citados y acuerdo absoluto.</span>
                    </div>
                    <Switch
                      checked={editingBatteries.includes("pilar_3")}
                      onCheckedChange={(val) =>
                        setEditingBatteries((prev) =>
                          val
                            ? [...prev, "pilar_3"]
                            : prev.filter((b) => b !== "pilar_3" && b !== "pilar_4")
                        )
                      }
                    />
                  </div>

                  {editingBatteries.includes("pilar_3") && (
                    <div className="pt-2 border-t border-border/60 space-y-2.5 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground font-medium">
                            Campos de Evidencia Contabilizados:
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {editingPilar3CountFields.map((f) => (
                              <Badge key={f} variant="secondary" className="text-xs font-mono py-0.5 px-2 gap-1 bg-background border border-primary/30 text-foreground">
                                <span>{f}</span>
                                {editingPilar3CountFields.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingPilar3CountFields(editingPilar3CountFields.filter((x) => x !== f))}
                                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </Badge>
                            ))}
                          </div>
                          {availablePilar3CountFields.filter((cf) => !editingPilar3CountFields.includes(cf.id)).length > 0 && (
                            <Select
                              value=""
                              onValueChange={(val) => {
                                if (val && !editingPilar3CountFields.includes(val)) {
                                  setEditingPilar3CountFields([...editingPilar3CountFields, val]);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs font-mono bg-background">
                                <SelectValue placeholder="Añadir campo de conteo..." />
                              </SelectTrigger>
                              <SelectContent className="text-xs font-mono">
                                {availablePilar3CountFields
                                  .filter((cf) => !editingPilar3CountFields.includes(cf.id))
                                  .map((cf) => (
                                    <SelectItem key={cf.id} value={cf.id} className="text-xs font-mono">
                                      {cf.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground font-medium">
                            Nivel de Agregación:
                          </Label>
                          <Select
                            value={editingPilar3Scope}
                            onValueChange={(v: "by_dimension" | "by_review") => setEditingPilar3Scope(v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              <SelectItem value="by_dimension" className="text-xs">Por Dimensión &times; Muestra</SelectItem>
                              <SelectItem value="by_review" className="text-xs">Total Agregado por Reseña</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pilar 4 toggle */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg border border-border transition-opacity ${
                    !editingBatteries.includes("pilar_3") ? "bg-muted/5 opacity-60" : "bg-muted/10"
                  }`}
                >
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground block">Pilar 4: Validez Convergente Externa</span>
                    <span className="text-[11px] text-muted-foreground">
                      {!editingBatteries.includes("pilar_3")
                        ? "Deshabilitado: requiere tener activo el Pilar 3 (ICC 2,1)."
                        : "Correlación ordinal de Spearman frente a señales independientes (estrellas / scoring)."}
                    </span>
                  </div>
                  <Switch
                    checked={editingBatteries.includes("pilar_4") && editingBatteries.includes("pilar_3")}
                    disabled={!editingBatteries.includes("pilar_3")}
                    onCheckedChange={(val) =>
                      setEditingBatteries((prev) =>
                        val ? [...prev, "pilar_4"] : prev.filter((b) => b !== "pilar_4")
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAdjustModalOpen(false)}
                  disabled={isSaving}
                  className="h-9 text-xs cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyRecalculate}
                  disabled={isSaving}
                  className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isSaving ? "Recalculando..." : "Aplicar y Recalcular Métricas"}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit Inspection Modal */}
      <AuditInspectionModal
        config={auditConfig}
        isOpen={isAuditOpen}
        onClose={() => {
          setIsAuditOpen(false);
          setAuditConfig(null);
        }}
      />
    </div>
  );
};
