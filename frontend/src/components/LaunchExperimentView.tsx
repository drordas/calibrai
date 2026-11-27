import React, { useState, useEffect, useMemo } from "react";
import { DatasetSummary, ModelCatalogItem, CustomBatteryConfig } from "../types";
import { createExperiment, fetchCompatibleGroundTruths } from "../services/api";
import { useTranslation } from "../i18n";
import {
  Rocket,
  Layers,
  Bot,
  FileCode,
  ListOrdered,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Tag,
  Key,
  UserCheck,
  Users,
  CheckSquare,
  Thermometer,
  Calculator,
  ChevronDown,
  ChevronUp,
  Settings2,
  Plus,
  Trash2,
  BarChart3,
  Star,
  Sliders,
  Info,
  X,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LaunchExperimentViewProps {
  dataset: DatasetSummary | null;
  inputColumns: string[];
  contextColumns: string[];
  specColumns?: string[];
  idColumn: string;
  selectedModelIds: string[];
  availableModels: ModelCatalogItem[];
  template: string;
  systemPrompt: string;
  taskType: string;
  sampleSize: number;
  setSampleSize?: (size: number) => void;
  availableDatasets?: DatasetSummary[];
  groundTruthDatasetId?: string | null;
  groundTruthDatasetIds?: string[];
  groundTruthName?: string;
  modelTemperatures?: Record<string, number>;
  initialConfig?: {
    name?: string;
    description?: string;
    executionMode?: "sequential" | "parallel";
    evalSpec?: Record<string, any>;
  } | null;
  onLaunchSuccess: () => void;
  onBackToModels?: () => void;
  onBackToPrompt?: () => void;
}

export const LaunchExperimentView: React.FC<LaunchExperimentViewProps> = ({
  dataset,
  inputColumns,
  contextColumns,
  specColumns = [],
  idColumn,
  selectedModelIds,
  modelTemperatures,
  availableModels,
  template,
  systemPrompt,
  taskType,
  sampleSize,
  setSampleSize,
  availableDatasets = [],
  groundTruthDatasetId: initialGroundTruthDatasetId,
  groundTruthDatasetIds: initialGroundTruthDatasetIds = [],
  groundTruthName: initialGroundTruthName,
  initialConfig,
  onLaunchSuccess,
  onBackToModels,
  onBackToPrompt,
}) => {
  const { t } = useTranslation();
  const initialMeth = initialConfig?.evalSpec?.methodology_config as Record<string, any> | undefined;
  const [name, setName] = useState<string>(
    initialConfig?.name?.trim() ||
      (dataset ? `Exp: ${dataset.name.replace(/\.[^/.]+$/, "")} — ${taskType}` : "Nuevo Experimento")
  );
  const [description, setDescription] = useState<string>(initialConfig?.description || "");
  const [executionMode, setExecutionMode] = useState<"sequential" | "parallel">(
    initialConfig?.executionMode || "sequential"
  );
  
  const initialGtList = initialGroundTruthDatasetIds.length > 0
    ? initialGroundTruthDatasetIds
    : (initialGroundTruthDatasetId && initialGroundTruthDatasetId !== "none" ? [initialGroundTruthDatasetId] : []);

  const [enableGroundTruth, setEnableGroundTruth] = useState<boolean>(initialGtList.length > 0);
  const [selectedGroundTruthDatasetIds, setSelectedGroundTruthDatasetIds] = useState<string[]>(initialGtList);
  const [groundTruthName, setGroundTruthName] = useState<string>(initialGroundTruthName || t("results.humanExpert"));
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibleGtIds, setCompatibleGtIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dataset?.id) {
      setCompatibleGtIds(new Set());
      return;
    }
    let cancelled = false;
    fetchCompatibleGroundTruths(dataset.id)
      .then((res) => {
        if (!cancelled) {
          setCompatibleGtIds(new Set(res.map((r) => r.dataset_id)));
        }
      })
      .catch(() => {
        if (!cancelled) setCompatibleGtIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [dataset?.id, availableDatasets]);

  const compatibleGroundTruthDatasets = useMemo(
    () =>
      availableDatasets.filter(
        (d) => d.is_ground_truth && (!dataset || compatibleGtIds.has(d.id))
      ),
    [availableDatasets, dataset, compatibleGtIds]
  );

  // -------------------------------------------------------------
  // Validation Batteries Configuration State
  // -------------------------------------------------------------
  const [activeBatteries, setActiveBatteries] = useState<string[]>(
    Array.isArray(initialMeth?.active_batteries)
      ? initialMeth.active_batteries
      : ["pilar_1", "pilar_2", "pilar_3", "pilar_4"]
  );
  const [expandedPilar, setExpandedPilar] = useState<string | null>(null);

  // Pilar 1 Config: Corpus Source Text Column (strictly textual columns selected in Step 1: TEXTO, CONTEXTO, SPEC)
  const isTextColumnType = (dataType?: string): boolean => {
    const dt = (dataType || "").toLowerCase();
    return !/(int|float|double|decimal|numeric|number|bool)/i.test(dt);
  };

  const pilar1TextColumns = useMemo(() => {
    const roleMap = new Map<string, "MUESTRA" | "CONTEXTO" | "SPEC">();
    for (const c of inputColumns || []) if (c) roleMap.set(c, "MUESTRA");
    for (const c of contextColumns || []) if (c && !roleMap.has(c)) roleMap.set(c, "CONTEXTO");
    for (const c of specColumns || []) if (c && !roleMap.has(c)) roleMap.set(c, "SPEC");

    const cols = (dataset?.columns || [])
      .filter((col) => roleMap.has(col.name) && isTextColumnType(col.data_type))
      .map((col) => ({
        name: col.name,
        role: roleMap.get(col.name)!,
        dataType: col.data_type,
      }));

    if (cols.length === 0) {
      return (inputColumns || []).map((c) => ({ name: c, role: "MUESTRA" as const, dataType: "string" }));
    }
    return cols;
  }, [dataset?.columns, inputColumns, contextColumns, specColumns]);

  const defaultPilar1Col = useMemo(() => {
    const muestraRole = pilar1TextColumns.find((c) => c.role === "MUESTRA");
    if (muestraRole) return muestraRole.name;
    const bodyMatch = pilar1TextColumns.find((c) =>
      /^(review_comment|review_text|comment|text|review|texto|contenido|body)$/i.test(c.name)
    );
    if (bodyMatch) return bodyMatch.name;
    return pilar1TextColumns[0]?.name || inputColumns[0] || "";
  }, [pilar1TextColumns, inputColumns]);

  const [pilar1SourceCol, setPilar1SourceCol] = useState<string>(
    () => initialMeth?.pilar_1?.source_text_col || defaultPilar1Col
  );
  useEffect(() => {
    if (pilar1TextColumns.length > 0 && !pilar1TextColumns.some((c) => c.name === pilar1SourceCol)) {
      setPilar1SourceCol(defaultPilar1Col);
    }
  }, [pilar1TextColumns, pilar1SourceCol, defaultPilar1Col]);
  const [pilar1VerbatimMode, setPilar1VerbatimMode] = useState<"tolerant" | "strict">(
    initialMeth?.pilar_1?.verbatim_mode === "strict" ? "strict" : "tolerant"
  );

  // Extract all variables defined in the spec (JSON schema keys, nested keys, computed_specs, specColumns)
  // and any metric_bindings configured in Step 2 (Catálogo de Métricas)
  const {
    availableSpecVariables,
    defaultSpecPilar2Fields,
    availablePilar1QuoteFields,
    defaultPilar1QuoteFields,
    parsedMetricBindings,
  } = useMemo(() => {
    const vars: string[] = [];
    const jsonLeafVars: string[] = [];
    const bindings: Record<string, string[] | Record<string, string[]>> = {};
    const text = template || "";

    // 1. Parse ```json output schema block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              for (const subKey of Object.keys(v)) {
                vars.push(`${k}.${subKey}`);
                jsonLeafVars.push(`${k}.${subKey}`);
              }
            } else {
              vars.push(k);
              jsonLeafVars.push(k);
            }
          }
        }
      } catch {
        // Fallback regex extraction if JSON has placeholders
      }
    }

    // 2. Parse ```evaluation-spec block for computed_specs and metric_bindings
    const evalMatch = text.match(/```(?:evaluation-spec|eval-spec)\s*([\s\S]*?)\s*```/i);
    if (evalMatch && evalMatch[1]) {
      const specBlock = evalMatch[1];
      const csMatches = specBlock.matchAll(/^[ \t]*-\s*name:\s*([a-zA-Z0-9_.]+)/gm);
      for (const m of csMatches) {
        if (m[1]) vars.push(m[1].trim());
      }

      const mbMatch = specBlock.match(/metric_bindings:\s*\n((?:[ \t]+[^\n]+\n?)*)/);
      if (mbMatch) {
        const mbLines = mbMatch[1].split("\n");
        let currentKey: string | null = null;
        let currentSlot: string | null = null;
        for (const line of mbLines) {
          const keyMatch = line.match(/^[ \t]{2}([a-zA-Z0-9_]+):\s*$/);
          if (keyMatch) {
            currentKey = keyMatch[1];
            currentSlot = null;
            bindings[currentKey] = [];
            continue;
          }
          const slotMatch = line.match(/^[ \t]{4}([a-zA-Z0-9_]+):\s*$/);
          if (slotMatch && currentKey) {
            currentSlot = slotMatch[1];
            const cur = bindings[currentKey];
            if (Array.isArray(cur)) {
              bindings[currentKey] = { [currentSlot]: [] };
            } else {
              cur[currentSlot] = [];
            }
            continue;
          }
          const slotItemMatch = line.match(/^[ \t]{6}-\s*(.+)$/);
          if (slotItemMatch && currentKey && currentSlot) {
            const val = slotItemMatch[1].trim();
            const cur = bindings[currentKey];
            if (cur && !Array.isArray(cur)) {
              cur[currentSlot] = cur[currentSlot] || [];
              cur[currentSlot].push(val);
            }
            if (!val.startsWith("__")) vars.push(val);
            continue;
          }
          const itemMatch = line.match(/^[ \t]{4}-\s*(.+)$/);
          if (itemMatch && currentKey) {
            const val = itemMatch[1].trim();
            const cur = bindings[currentKey];
            if (Array.isArray(cur)) {
              cur.push(val);
            }
            if (!val.startsWith("__")) vars.push(val);
          }
        }
      }
    }

    // 3. Include specColumns and contextColumns defined in Step 1
    for (const sc of specColumns || []) {
      vars.push(sc);
    }
    for (const cc of contextColumns || []) {
      vars.push(cc);
    }

    // If sentiment fields exist, also allow polaridad_global as derived spec variable
    if (vars.some((v) => v.includes("sentiment") || v.includes("polaridad"))) {
      vars.push("polaridad_global");
    }

    const uniqueVars = Array.from(new Set(vars.filter(Boolean)));
    const fallbackAaker = [
      "brand_awareness.sentiment",
      "brand_associations.sentiment",
      "perceived_quality.sentiment",
      "brand_loyalty.sentiment",
    ];
    const finalVars = uniqueVars.length > 0 ? uniqueVars : fallbackAaker;

    // Determine initial Pilar 2 fields from metric_bindings or spec sentiment fields
    const rawP2Bindings = bindings["inter_rater_agreement"] || bindings["krippendorff_alpha"];
    const fromBindings = Array.isArray(rawP2Bindings) ? rawP2Bindings : undefined;
    const sentimentVars = finalVars.filter((v) => /sentiment|polar|categ|label|class/i.test(v) && v !== "polaridad_global");
    const defaultP2 =
      fromBindings && fromBindings.length > 0
        ? fromBindings.filter((v) => finalVars.includes(v))
        : sentimentVars.length > 0
        ? sentimentVars
        : finalVars.slice(0, 4);

    const uniqueJsonLeaves = Array.from(new Set(jsonLeafVars.filter(Boolean)));
    const p1Available =
      uniqueJsonLeaves.length > 0
        ? uniqueJsonLeaves
        : ["markers_positive", "markers_negative", "markers_neutral", "citas"];
    const p1Matched = p1Available.filter((v) =>
      /marker|cita|quote|evidenc|extract|frase|snip|fragment/i.test(v)
    );
    const p1Default = p1Matched.length > 0 ? p1Matched : p1Available;

    return {
      availableSpecVariables: finalVars,
      defaultSpecPilar2Fields: defaultP2.length > 0 ? defaultP2 : finalVars,
      availablePilar1QuoteFields: p1Available,
      defaultPilar1QuoteFields: p1Default,
      parsedMetricBindings: bindings,
    };
  }, [template, specColumns, contextColumns]);

  const [pilar1QuoteFields, setPilar1QuoteFields] = useState<string[]>(
    Array.isArray(initialMeth?.pilar_1?.quote_fields) && initialMeth.pilar_1.quote_fields.length > 0
      ? initialMeth.pilar_1.quote_fields
      : defaultPilar1QuoteFields
  );

  useEffect(() => {
    setPilar1QuoteFields((prev) => {
      const validPrev = prev.filter((f) => availablePilar1QuoteFields.includes(f));
      return validPrev.length > 0 ? validPrev : defaultPilar1QuoteFields;
    });
  }, [availablePilar1QuoteFields, defaultPilar1QuoteFields]);

  // Pilar 2 Config: Target Fields for Cohen's Kappa & Krippendorff's Alpha (strictly from spec)
  const [pilar2Fields, setPilar2Fields] = useState<string[]>(
    Array.isArray(initialMeth?.pilar_2?.target_fields) && initialMeth.pilar_2.target_fields.length > 0
      ? initialMeth.pilar_2.target_fields
      : defaultSpecPilar2Fields
  );

  useEffect(() => {
    // Keep pilar2Fields synchronized with valid spec variables
    setPilar2Fields((prev) => {
      const validPrev = prev.filter((f) => availableSpecVariables.includes(f));
      return validPrev.length > 0 ? validPrev : defaultSpecPilar2Fields;
    });
  }, [availableSpecVariables, defaultSpecPilar2Fields]);

  // Pilar 3 Config: Evidence Count Fields & Aggregation Scope for ICC(2,1)
  const availablePilar3CountFields = [
    { id: "markers_positive", label: "markers_positive (Citas Positivas)" },
    { id: "markers_negative", label: "markers_negative (Citas Negativas)" },
    { id: "markers_neutral", label: "markers_neutral (Citas Neutras)" },
    { id: "citas", label: "citas (Lista general de citas)" },
  ];
  const [pilar3CountFields, setPilar3CountFields] = useState<string[]>(
    Array.isArray(initialMeth?.pilar_3?.count_fields) && initialMeth.pilar_3.count_fields.length > 0
      ? initialMeth.pilar_3.count_fields
      : ["markers_positive", "markers_negative", "markers_neutral"]
  );
  const [pilar3Scope, setPilar3Scope] = useState<"by_dimension" | "by_review">(
    initialMeth?.pilar_3?.scope === "by_review" ? "by_review" : "by_dimension"
  );

  // Pilar 4 Config: External Criterion Column
  const autoCriterionCol = dataset?.columns.find((c) => {
    const cl = c.name.toLowerCase();
    return cl.includes("rating") || cl.includes("star") || cl.includes("score") || cl.includes("nota") || cl.includes("val");
  })?.name || "";
  const rcCriterionFromCatalog =
    parsedMetricBindings["rating_congruence"] && !Array.isArray(parsedMetricBindings["rating_congruence"])
      ? parsedMetricBindings["rating_congruence"]["criterion_var"]?.[0]
      : undefined;
  const [pilar4RatingCol, setPilar4RatingCol] = useState<string>(
    initialMeth?.pilar_4?.rating_col || rcCriterionFromCatalog || autoCriterionCol
  );

  // Custom Batteries State
  const [customBatteries, setCustomBatteries] = useState<CustomBatteryConfig[]>(
    Array.isArray(initialMeth?.custom_batteries) ? initialMeth.custom_batteries : []
  );
  const [isAddingCustomBattery, setIsAddingCustomBattery] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customDesc, setCustomDesc] = useState<string>("");
  const [customType, setCustomType] = useState<"agreement" | "correlation" | "rule_check" | "custom_formula">("agreement");
  const [customTargetFieldsList, setCustomTargetFieldsList] = useState<string[]>([]);
  const [customFormula, setCustomFormula] = useState<string>("");

  const toggleBattery = (id: string) => {
    setActiveBatteries((prev) => {
      const isRemoving = prev.includes(id);
      if (id === "pilar_3" && isRemoving) {
        // Pilar 4 depends on Pilar 3: disabling Pilar 3 also disables Pilar 4
        if (expandedPilar === "pilar_4") setExpandedPilar(null);
        return prev.filter((b) => b !== "pilar_3" && b !== "pilar_4");
      }
      if (id === "pilar_4" && !isRemoving && !prev.includes("pilar_3")) {
        return prev;
      }
      return isRemoving ? prev.filter((b) => b !== id) : [...prev, id];
    });
  };

  const handleAddCustomBattery = () => {
    if (!customName.trim()) return;
    const newBat: CustomBatteryConfig = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      description: customDesc.trim() || undefined,
      metric_type: customType,
      target_fields: customTargetFieldsList.length > 0 ? customTargetFieldsList : availableSpecVariables.slice(0, 1),
      formula_expression: customFormula.trim() || undefined,
    };
    setCustomBatteries([...customBatteries, newBat]);
    setActiveBatteries([...activeBatteries, newBat.id]);
    setCustomName("");
    setCustomDesc("");
    setCustomTargetFieldsList([]);
    setCustomFormula("");
    setIsAddingCustomBattery(false);
  };

  const handleRemoveCustomBattery = (id: string) => {
    setCustomBatteries(customBatteries.filter((b) => b.id !== id));
    setActiveBatteries(activeBatteries.filter((b) => b !== id));
  };

  useEffect(() => {
    const list = initialGroundTruthDatasetIds.length > 0
      ? initialGroundTruthDatasetIds
      : (initialGroundTruthDatasetId && initialGroundTruthDatasetId !== "none" ? [initialGroundTruthDatasetId] : []);
    if (list.length > 0) {
      setEnableGroundTruth(true);
      setSelectedGroundTruthDatasetIds(list);
    }
    if (initialGroundTruthName) {
      setGroundTruthName(initialGroundTruthName);
    }
  }, [initialGroundTruthDatasetId, initialGroundTruthDatasetIds, initialGroundTruthName]);

  const handleLaunch = async (autoStart: boolean = true) => {
    if (!dataset) {
      setError(t("launch.errorDatasetRequired"));
      return;
    }
    if (selectedModelIds.length === 0) {
      setError(t("launch.errorModelRequired"));
      return;
    }
    if (!template.trim()) {
      setError(t("launch.errorTemplateRequired"));
      return;
    }

    setIsLaunching(true);
    setError(null);

    const finalGtIds = enableGroundTruth ? selectedGroundTruthDatasetIds : [];

    const evalSpecPayload = {
      task_type: taskType,
      active_batteries: activeBatteries,
      source_text_col: pilar1SourceCol || undefined,
      rating_col: pilar4RatingCol || undefined,
      metric_bindings: parsedMetricBindings,
      methodology_config: {
        active_batteries: activeBatteries,
        pilar_1: {
          source_text_col: pilar1SourceCol,
          verbatim_mode: pilar1VerbatimMode,
          quote_fields: pilar1QuoteFields,
        },
        pilar_2: {
          target_fields: pilar2Fields,
        },
        pilar_3: {
          count_fields: pilar3CountFields,
          scope: pilar3Scope,
        },
        pilar_4: {
          rating_col: pilar4RatingCol,
        },
        custom_batteries: customBatteries,
      },
      custom_batteries: customBatteries,
    };

    try {
      await createExperiment(
        {
          name: name.trim() || `Experimento ${new Date().toLocaleDateString()}`,
          description,
          dataset_id: dataset.id,
          dataset_name: dataset.name,
          input_columns: inputColumns,
          context_columns: contextColumns,
          spec_columns: specColumns,
          id_column: idColumn || undefined,
          model_ids: selectedModelIds,
          ground_truth_dataset_id: finalGtIds.length > 0 ? finalGtIds[0] : undefined,
          ground_truth_dataset_ids: finalGtIds,
          ground_truth_name: groundTruthName.trim() || t("results.humanExpert"),
          template,
          system_prompt: systemPrompt,
          task_type: taskType,
          eval_spec: evalSpecPayload,
          sample_size: sampleSize,
          execution_mode: executionMode,
          model_temperatures: modelTemperatures || {},
        },
        autoStart
      );
      onLaunchSuccess();
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card className="bg-card border border-border p-5 rounded-lg shadow-none">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {t("launch.title")}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("launch.subtitle")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToModels || onBackToPrompt}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-md"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("launch.backToModels")}</span>
          </Button>
        </div>
      </Card>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
          {error}
        </div>
      )}

      {/* Experiment Metadata Inputs */}
      <Card className="bg-card border border-border p-5 space-y-4 rounded-lg shadow-none">
        <div className="space-y-1">
          <Label htmlFor="exp-name" className="text-xs font-medium text-foreground">
            {t("launch.expNameLabel")}
          </Label>
          <Input
            id="exp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("launch.expNamePlaceholder")}
            className="bg-muted/30 border-border font-medium text-xs h-9 rounded-md"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="exp-desc" className="text-xs font-medium text-muted-foreground">
            {t("launch.expDescLabel")}
          </Label>
          <Input
            id="exp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("launch.expDescPlaceholder")}
            className="bg-muted/30 border-border text-xs h-9 rounded-md"
          />
        </div>

        {/* Execution Mode Selector */}
        <div className="space-y-2 pt-2 border-t border-border">
          <Label className="text-xs font-medium text-foreground block">
            {t("launch.queueStrategyTitle")}
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setExecutionMode("sequential")}
              className={`p-3.5 rounded-md border cursor-pointer transition-all duration-150 ${
                executionMode === "sequential"
                  ? "bg-muted/60 border-zinc-600 font-medium"
                  : "bg-card border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-xs text-foreground mb-1">
                <ListOrdered className="w-4 h-4 text-muted-foreground" />
                <span>{t("launch.sequentialTitle")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("launch.sequentialDesc")}
              </p>
            </div>

            <div
              onClick={() => setExecutionMode("parallel")}
              className={`p-3.5 rounded-md border cursor-pointer transition-all duration-150 ${
                executionMode === "parallel"
                  ? "bg-muted/60 border-zinc-600 font-medium"
                  : "bg-card border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-xs text-foreground mb-1">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span>{t("launch.parallelTitle")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("launch.parallelDesc")}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Ground Truth / Human Expert Baseline Card */}
      <Card className="bg-card border border-border p-5 space-y-4 rounded-lg shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-foreground">
                {t("launch.gtBaselineTitle")}
              </h3>
              <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                {t("launch.gtBaselineBadge")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("launch.gtBaselineDesc")}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="toggle-gt" className="text-xs font-semibold text-foreground cursor-pointer">
              {enableGroundTruth ? t("launch.active") : t("launch.inactive")}
            </Label>
            <Switch
              id="toggle-gt"
              checked={enableGroundTruth}
              onCheckedChange={setEnableGroundTruth}
            />
          </div>
        </div>

        {enableGroundTruth && (
          <div className="pt-3 border-t border-border/60 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">
                {t("launch.selectedGtEvaluators", { count: selectedGroundTruthDatasetIds.length })}
              </Label>
              <div className="flex flex-wrap gap-2">
                {compatibleGroundTruthDatasets
                  .map((gt) => {
                    const isSelected = selectedGroundTruthDatasetIds.includes(gt.id);
                    return (
                      <button
                        key={gt.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedGroundTruthDatasetIds(selectedGroundTruthDatasetIds.filter((id) => id !== gt.id));
                          } else {
                            setSelectedGroundTruthDatasetIds([...selectedGroundTruthDatasetIds, gt.id]);
                          }
                        }}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 border-emerald-500"
                            : "bg-secondary/70 hover:bg-secondary text-secondary-foreground border-border/60"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                            isSelected ? "bg-white text-emerald-700 border-white" : "border-muted-foreground/40 bg-background/50"
                          }`}
                        >
                          {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                        </div>
                        <span className="font-semibold">{gt.name}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono px-1.5 py-0 ${
                            isSelected ? "bg-white/20 text-white" : "bg-background/60"
                          }`}
                        >
                          {t("dataset.rowsCount", { count: gt.total_rows.toLocaleString() })}
                        </Badge>
                      </button>
                    );
                  })}
              </div>

              {selectedGroundTruthDatasetIds.length === 0 && (
                <p className="text-xs text-amber-500 font-medium">
                  {t("launch.gtWarningNoneSelected")}
                </p>
              )}
            </div>

            {selectedGroundTruthDatasetIds.length === 1 && (
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-xs font-medium text-foreground">
                  {t("launch.gtNameLabel")}
                </Label>
                <Input
                  value={groundTruthName}
                  onChange={(e) => setGroundTruthName(e.target.value)}
                  placeholder={t("launch.gtNamePlaceholder")}
                  className="h-9 text-xs bg-background/80 font-medium"
                />
              </div>
            )}

            {selectedGroundTruthDatasetIds.length > 1 && (
              <p className="text-[11px] text-muted-foreground bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                {t("launch.multiGtNote", { count: selectedGroundTruthDatasetIds.length })}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Marco Metodológico y Baterías de Validación */}
      <Card className="bg-card border border-border p-5 space-y-4 rounded-lg shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">
                Baterías Metodológicas de Validación
              </h3>
              <Badge variant="outline" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/30">
                {activeBatteries.length} Baterías Activas
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Define qué pilares metodológicos y auditorías estadísticas se calcularán para este experimento. Personaliza sobre qué campos se evalúan las fórmulas.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAddingCustomBattery(!isAddingCustomBattery)}
            className="text-xs h-8 px-3 gap-1.5 border-border bg-card hover:bg-muted text-foreground"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Añadir Batería Personalizada</span>
          </Button>
        </div>

        {/* Pillars List */}
        <div className="space-y-3 pt-2">
          {/* Pilar 1 */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="toggle-pilar-1"
                  checked={activeBatteries.includes("pilar_1")}
                  onCheckedChange={() => toggleBattery("pilar_1")}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <Label htmlFor="toggle-pilar-1" className="text-xs font-semibold text-foreground cursor-pointer">
                      Pilar 1: Consistencia Interna y Anti-Alucinación
                    </Label>
                    <Badge variant="secondary" className="text-[10px] font-mono py-0">
                      Verbatim & Disyunción
                    </Badge>
                    {pilar1SourceCol && (
                      <Badge variant="outline" className="text-[10px] font-mono py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                        Corpus: {pilar1SourceCol}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Fidelidad Verbatim literal vs. corpus original, disyunción estricta (Pos ∩ Neg = ∅) y consistencia lógica de reglas.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpandedPilar(expandedPilar === "pilar_1" ? null : "pilar_1")}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
              >
                <Settings2 className="w-3 h-3" />
                <span>{expandedPilar === "pilar_1" ? "Ocultar" : "Personalizar"}</span>
                {expandedPilar === "pilar_1" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {expandedPilar === "pilar_1" && (
              <div className="pt-2.5 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-medium">Columna de Texto Original del Corpus</Label>
                  <Select value={pilar1SourceCol} onValueChange={setPilar1SourceCol}>
                    <SelectTrigger className="h-8 text-xs bg-background/80 font-mono">
                      <SelectValue placeholder="Seleccionar columna textual asignada" />
                    </SelectTrigger>
                    <SelectContent>
                      {pilar1TextColumns.map((col) => (
                        <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                          {col.name} ({col.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-medium">Rigor de Fidelidad Verbatim</Label>
                  <Select value={pilar1VerbatimMode} onValueChange={(v: "tolerant" | "strict") => setPilar1VerbatimMode(v)}>
                    <SelectTrigger className="h-8 text-xs bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tolerant" className="text-xs">
                        Tolerante a Erratas / Typos (&ge;88% sim.)
                      </SelectItem>
                      <SelectItem value="strict" className="text-xs">
                        Estricto Literal (100% caracteres [sic])
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-medium">Campos de Citas / Evidencias a Auditar</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {availablePilar1QuoteFields.map((f) => {
                      const active = pilar1QuoteFields.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() =>
                            setPilar1QuoteFields((prev) =>
                              prev.includes(f)
                                ? prev.length > 1
                                  ? prev.filter((x) => x !== f)
                                  : prev
                                : [...prev, f]
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            active
                              ? "bg-primary/15 border-primary text-primary font-semibold"
                              : "bg-background/60 border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {f}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pilar 2 */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="toggle-pilar-2"
                  checked={activeBatteries.includes("pilar_2")}
                  onCheckedChange={() => toggleBattery("pilar_2")}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <Label htmlFor="toggle-pilar-2" className="text-xs font-semibold text-foreground cursor-pointer">
                      Pilar 2: Fiabilidad Inter-Jueces (Cohen's κ & Krippendorff's α)
                    </Label>
                    <Badge variant="secondary" className="text-[10px] font-mono py-0">
                      {pilar2Fields.length} campos
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Convergencia categórica inter-anotador (LLM vs Experto / LLM vs LLM) con corrección por acuerdo azaroso.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpandedPilar(expandedPilar === "pilar_2" ? null : "pilar_2")}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
              >
                <Settings2 className="w-3 h-3" />
                <span>{expandedPilar === "pilar_2" ? "Ocultar" : "Personalizar"}</span>
                {expandedPilar === "pilar_2" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {expandedPilar === "pilar_2" && (
              <div className="pt-2.5 border-t border-border/60 space-y-3 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-[11px] text-muted-foreground font-medium">
                    Variables del Spec Evaluadas en Cohen's Kappa y Alfa:
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPilar2Fields(defaultSpecPilar2Fields)}
                      className="h-6 px-2 text-[10px] text-primary"
                    >
                      Restablecer Variables del Spec
                    </Button>
                    {availableSpecVariables.includes("polaridad_global") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPilar2Fields(["polaridad_global"])}
                        className="h-6 px-2 text-[10px] text-muted-foreground"
                      >
                        Solo Polaridad Global
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {pilar2Fields.map((f) => (
                    <Badge
                      key={f}
                      variant="secondary"
                      className="text-xs font-mono py-1 px-2.5 gap-1.5 bg-background border border-primary/30 text-foreground"
                    >
                      <span>{f}</span>
                      <button
                        type="button"
                        onClick={() => setPilar2Fields(pilar2Fields.filter((item) => item !== f))}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                        title={`Quitar ${f}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                {availableSpecVariables.filter((v) => !pilar2Fields.includes(v)).length > 0 && (
                  <div className="pt-1 max-w-md">
                    <Select
                      value=""
                      onValueChange={(val) => {
                        if (val && !pilar2Fields.includes(val)) {
                          setPilar2Fields([...pilar2Fields, val]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs font-mono bg-background/80">
                        <SelectValue placeholder="Seleccionar variable definida en el spec..." />
                      </SelectTrigger>
                      <SelectContent className="text-xs font-mono">
                        {availableSpecVariables
                          .filter((v) => !pilar2Fields.includes(v))
                          .map((v) => (
                            <SelectItem key={v} value={v} className="text-xs font-mono">
                              {v}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Restringido estrictamente a variables definidas en el spec. Los cálculos de concordancia inter-anotador y las matrices de confusión contrastarán exclusivamente estas variables.
                </p>
              </div>
            )}
          </div>

          {/* Pilar 3 */}
          <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="toggle-pilar-3"
                  checked={activeBatteries.includes("pilar_3")}
                  onCheckedChange={() => toggleBattery("pilar_3")}
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <BarChart3 className="w-4 h-4 text-purple-400" />
                    <Label htmlFor="toggle-pilar-3" className="text-xs font-semibold text-foreground cursor-pointer">
                      Pilar 3: Recuento Cuantitativo de Evidencias (ICC 2,1 Absoluto)
                    </Label>
                    <Badge variant="secondary" className="text-[10px] font-mono py-0">
                      Shrout & Fleiss (1979)
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono py-0 bg-background/60">
                      {pilar3CountFields.length} campo(s) &middot; {pilar3Scope === "by_dimension" ? "Por dimensión" : "Por reseña"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Modela el recuento cuantitativo discreto de fragmentos y evidencias por polaridad mediante el Coeficiente de Correlación Intraclase ICC(2,1).
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpandedPilar(expandedPilar === "pilar_3" ? null : "pilar_3")}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 shrink-0 cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
                <span>{expandedPilar === "pilar_3" ? "Ocultar" : "Personalizar"}</span>
                {expandedPilar === "pilar_3" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {expandedPilar === "pilar_3" && (
              <div className="pt-2.5 border-t border-border/60 space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground font-medium">
                      Campos de Evidencia Contabilizados en el ICC(2,1):
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {pilar3CountFields.map((f) => (
                        <Badge
                          key={f}
                          variant="secondary"
                          className="text-xs font-mono py-1 px-2 gap-1.5 bg-background border border-primary/30 text-foreground"
                        >
                          <span>{f}</span>
                          {pilar3CountFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPilar3CountFields(pilar3CountFields.filter((x) => x !== f))}
                              className="text-muted-foreground hover:text-destructive cursor-pointer"
                              title={`Quitar ${f}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                    {availablePilar3CountFields.filter((cf) => !pilar3CountFields.includes(cf.id)).length > 0 && (
                      <Select
                        value=""
                        onValueChange={(val) => {
                          if (val && !pilar3CountFields.includes(val)) {
                            setPilar3CountFields([...pilar3CountFields, val]);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-mono bg-background/80">
                          <SelectValue placeholder="Añadir campo de conteo..." />
                        </SelectTrigger>
                        <SelectContent className="text-xs font-mono">
                          {availablePilar3CountFields
                            .filter((cf) => !pilar3CountFields.includes(cf.id))
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
                      Nivel de Agregación del Conteo:
                    </Label>
                    <Select
                      value={pilar3Scope}
                      onValueChange={(v: "by_dimension" | "by_review") => setPilar3Scope(v)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        <SelectItem value="by_dimension" className="text-xs">
                          Por Dimensión &times; Muestra (n = muestras &times; dimensiones)
                        </SelectItem>
                        <SelectItem value="by_review" className="text-xs">
                          Total Agregado por Reseña (n = muestras)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-2.5 rounded-sm bg-background/70 border border-border/80 space-y-1 font-mono text-[10px] text-muted-foreground">
                  <div className="text-foreground font-semibold">
                    Cálculo transparente: ICC(2,1) = (MS_R &minus; MS_E) / (MS_R + (k &minus; 1)MS_E + (k/n)(MS_C &minus; MS_E))
                  </div>
                  <div>
                    Para cada par de evaluadores se compara el vector de conteos:{" "}
                    <span className="text-primary font-semibold">
                      count = {pilar3CountFields.map((f) => `len(${f})`).join(" + ")}
                    </span>{" "}
                    ({pilar3Scope === "by_dimension" ? "evaluado por cada dimensión del Pilar 2" : "sumado en toda la reseña"}).
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pilar 4 */}
          <div
            className={`p-3.5 rounded-lg border border-border space-y-3 transition-opacity ${
              !activeBatteries.includes("pilar_3") ? "bg-muted/10 opacity-60" : "bg-muted/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Switch
                  id="toggle-pilar-4"
                  checked={activeBatteries.includes("pilar_4") && activeBatteries.includes("pilar_3")}
                  disabled={!activeBatteries.includes("pilar_3")}
                  onCheckedChange={() => toggleBattery("pilar_4")}
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Star className="w-4 h-4 text-amber-400" />
                    <Label
                      htmlFor="toggle-pilar-4"
                      className={`text-xs font-semibold text-foreground ${
                        activeBatteries.includes("pilar_3") ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      Pilar 4: Validez Convergente Externa (Rating Congruence con Señal Externa)
                    </Label>
                    <Badge variant="secondary" className="text-[10px] font-mono py-0">
                      Spearman rs
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    {!activeBatteries.includes("pilar_3")
                      ? "Deshabilitado: requiere activar el Pilar 3 (Recuento Cuantitativo / ICC 2,1) para calcular la convergencia."
                      : "Demuestra validez de constructo externa contrastando el Net Sentiment Score (NSS) cualitativo con una señal ordinal continua del corpus."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!activeBatteries.includes("pilar_3")}
                onClick={() => setExpandedPilar(expandedPilar === "pilar_4" ? null : "pilar_4")}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 shrink-0"
              >
                <Settings2 className="w-3 h-3" />
                <span>{expandedPilar === "pilar_4" ? "Ocultar" : "Personalizar"}</span>
                {expandedPilar === "pilar_4" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {expandedPilar === "pilar_4" && (
              <div className="pt-2.5 border-t border-border/60 max-w-sm space-y-1 text-xs">
                <Label className="text-[11px] text-muted-foreground font-medium">Variable Criterio del Dataset (Valoración Ordinal / Estrellas / Score):</Label>
                <Select value={pilar4RatingCol} onValueChange={setPilar4RatingCol}>
                  <SelectTrigger className="h-8 text-xs bg-background/80">
                    <SelectValue placeholder="Seleccionar columna criterio (rating, stars...)" />
                  </SelectTrigger>
                  <SelectContent>
                    {dataset?.columns.map((col) => (
                      <SelectItem key={col.name} value={col.name} className="text-xs">
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Custom Batteries Section */}
          {customBatteries.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-foreground block">Baterías Personalizadas Creadas:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {customBatteries.map((cb) => (
                  <div key={cb.id} className="p-3 rounded-lg border border-border bg-card space-y-1.5 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground font-mono">{cb.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomBattery(cb.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {cb.description && <p className="text-[11px] text-muted-foreground">{cb.description}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <Badge variant="outline" className="text-[10px] font-mono py-0 capitalize">
                        {cb.metric_type}
                      </Badge>
                      {cb.target_fields.map((tf) => (
                        <Badge key={tf} variant="secondary" className="text-[10px] font-mono py-0">
                          {tf}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inline Form to Add Custom Battery */}
          {isAddingCustomBattery && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  Nueva Batería Metodológica Personalizada
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingCustomBattery(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-foreground">Nombre de la Batería</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="ej: Acuerdo de Intención de Compra"
                    className="h-8 text-xs bg-background/80"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-foreground">Tipo de Métrica</Label>
                  <Select value={customType} onValueChange={(val: any) => setCustomType(val)}>
                    <SelectTrigger className="h-8 text-xs bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agreement">Acuerdo Categórico (Kappa / Exactitud)</SelectItem>
                      <SelectItem value="correlation">Correlación Numérica (Pearson / Spearman)</SelectItem>
                      <SelectItem value="rule_check">Chequeo de Regla Lógica (Booleano)</SelectItem>
                      <SelectItem value="custom_formula">Fórmula Matemática / Expresión</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <Label className="text-[11px] font-medium text-foreground">Variables del Spec Evaluadas</Label>
                <div className="flex flex-wrap gap-1.5">
                  {customTargetFieldsList.map((tf) => (
                    <Badge key={tf} variant="secondary" className="text-xs font-mono py-0.5 px-2 gap-1.5 bg-background border border-border">
                      <span>{tf}</span>
                      <button
                        type="button"
                        onClick={() => setCustomTargetFieldsList(customTargetFieldsList.filter((item) => item !== tf))}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {availableSpecVariables.filter((v) => !customTargetFieldsList.includes(v)).length > 0 && (
                  <Select
                    value=""
                    onValueChange={(val) => {
                      if (val && !customTargetFieldsList.includes(val)) {
                        setCustomTargetFieldsList([...customTargetFieldsList, val]);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs font-mono bg-background/80">
                      <SelectValue placeholder="Seleccionar variable definida en el spec..." />
                    </SelectTrigger>
                    <SelectContent className="text-xs font-mono">
                      {availableSpecVariables
                        .filter((v) => !customTargetFieldsList.includes(v))
                        .map((v) => (
                          <SelectItem key={v} value={v} className="text-xs font-mono">
                            {v}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1 text-xs">
                <Label className="text-[11px] font-medium text-foreground">Descripción o Criterio de Aceptación (Opcional)</Label>
                <Input
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="ej: Evalúa la coherencia en la intención de recompra entre modelos"
                  className="h-8 text-xs bg-background/80"
                />
              </div>

              {customType === "custom_formula" && (
                <div className="space-y-1 text-xs">
                  <Label className="text-[11px] font-medium text-foreground">Expresión Matemática / Regla de Cálculo</Label>
                  <Input
                    value={customFormula}
                    onChange={(e) => setCustomFormula(e.target.value)}
                    placeholder="ej: (output_1 + output_2) / 2"
                    className="h-8 text-xs bg-background/80 font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingCustomBattery(false)}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCustomBattery}
                  disabled={!customName.trim()}
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Guardar Batería
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Summary of what will be evaluated */}
      <Card className="bg-card border border-border p-5 space-y-4 rounded-lg shadow-none">
        <h3 className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
          {t("launch.summaryTitle")}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1.5">
            <span className="text-[10px] text-muted-foreground font-mono font-medium uppercase">{t("launch.sampleToEvaluate")}</span>
            <div className="font-semibold text-foreground font-mono truncate">
              {sampleSize} / {dataset?.total_rows || 0} {t("common.rows")}
            </div>
            {setSampleSize && dataset && (
              <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                <Button
                  size="sm"
                  type="button"
                  variant={sampleSize === dataset.total_rows ? "default" : "secondary"}
                  onClick={() => setSampleSize(dataset.total_rows)}
                  className="h-6 px-1.5 text-[10px] font-semibold"
                >
                  {t("launch.allRows", { count: dataset.total_rows })}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={sampleSize === 10 ? "default" : "outline"}
                  onClick={() => setSampleSize(Math.min(10, dataset.total_rows))}
                  className="h-6 px-1.5 text-[10px] font-mono"
                >
                  10
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={sampleSize === 25 ? "default" : "outline"}
                  onClick={() => setSampleSize(Math.min(25, dataset.total_rows))}
                  className="h-6 px-1.5 text-[10px] font-mono"
                >
                  25
                </Button>
              </div>
            )}
          </div>

          <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
            <span className="text-[10px] text-muted-foreground font-mono font-medium uppercase">{t("launch.rowId")}</span>
            <div className="font-mono text-amber-400 font-medium truncate">{idColumn || t("launch.unassigned")}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{t("launch.primaryKey")}</div>
          </div>

          <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
            <span className="text-[10px] text-muted-foreground font-mono font-medium uppercase">{t("launch.context")}</span>
            <div className="font-mono text-purple-400 font-medium truncate">
              {contextColumns.length === 0 ? t("launch.none") : contextColumns.join(", ")}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">{t("launch.auxiliaryVariables")}</div>
          </div>

          <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
            <span className="text-[10px] text-muted-foreground font-mono font-medium uppercase flex items-center gap-1">
              <Calculator className="w-3 h-3 text-blue-400" />
              <span>{t("dataset.specLabel")}</span>
            </span>
            <div className="font-mono text-blue-400 font-medium truncate">
              {specColumns.length === 0 ? t("launch.none") : specColumns.join(", ")}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">{t("dataset.specRoleTitle")}</div>
          </div>
        </div>

        {/* Models list */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <span className="text-[11px] font-medium text-muted-foreground">{t("launch.modelsToCompare", { count: selectedModelIds.length })}</span>
          <div className="flex flex-wrap gap-1.5">
            {selectedModelIds.map((m) => {
              const isOllama = m.startsWith("ollama/") || m.includes("ollama");
              const temp = modelTemperatures?.[m] ?? 0.8;
              return (
                <Badge key={m} variant="secondary" className="font-mono text-[11px] px-2 py-0.5 bg-muted border border-border text-foreground rounded-md flex items-center gap-1.5">
                  <Bot className="w-3 h-3 text-muted-foreground" />
                  <span>{m}</span>
                  {isOllama && (
                    <span className="text-[10px] text-amber-500 font-bold ml-1 flex items-center gap-0.5 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                      <Thermometer className="w-2.5 h-2.5" />
                      {temp === 0.8 ? "0.8 (def)" : temp.toFixed(2)}
                    </span>
                  )}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Security & Checkpoint callout */}
        <div className="p-3 rounded-md bg-muted/20 border border-border text-xs text-foreground flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="space-y-0.5">
            <span className="font-medium text-foreground">{t("launch.persistenceTitle")}</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("launch.persistenceDesc")}
            </p>
          </div>
        </div>
      </Card>

      {/* Bottom Launch Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleLaunch(false)}
          disabled={isLaunching}
          className="h-9 px-4 text-xs font-medium rounded-md border-border bg-card hover:bg-muted transition-all duration-150 gap-1.5"
        >
          <FileCode className="w-3.5 h-3.5 text-primary" />
          <span>{t("templates.saveAsTemplate")}</span>
        </Button>

        <Button
          type="button"
          onClick={() => handleLaunch(true)}
          disabled={isLaunching}
          className="h-9 px-5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md gap-2 cursor-pointer transition-all duration-150"
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>{isLaunching ? t("launch.launching") : t("launch.startButton")}</span>
        </Button>
      </div>
    </div>
  );
};
