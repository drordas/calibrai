import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { DatasetSummary, PromptValidationResponse, MetricCatalogItem, ComputedSpec } from "../types";
import { generatePromptTemplate, validatePrompt, fetchCompatibleGroundTruths } from "../services/api";
import { METRIC_CATALOG } from "../data/metricCatalog";
import { useTranslation } from "../i18n";

const MetricFormulaModal = React.lazy(() => import("./MetricFormulaModal"));
import {
  Wand2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Eye,
  FileCode,
  Tag,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Calculator,
  Layers,
  Target,
  FileJson,
  Sliders,
  CheckSquare,
  FunctionSquare,
  PlusCircle,
  Trash2,
  Plus,
  ArrowRight,
  Zap,
  BrainCog,
  Key,
  FileText,
  Pencil,
  RotateCcw,
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
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PromptEditorProps {
  dataset: DatasetSummary;
  inputColumns: string[];
  contextColumns: string[];
  template: string;
  setTemplate: (tpl: string) => void;
  systemPrompt: string;
  setSystemPrompt: (sp: string) => void;
  taskType: string;
  setTaskType: (t: string) => void;
  groundTruthDatasetId?: string | null;
  groundTruthDatasetIds?: string[];
  groundTruthSchema?: any;
  idColumn?: string | null;
  specColumns?: string[];
  onValidationStateChange?: (isValid: boolean, isValidating: boolean) => void;
}

// ---------------------------------------------------------
// Template Decomposition & Composition Helpers
// ---------------------------------------------------------

type MetricBindingsValue = string[] | Record<string, string[]>;
type MetricBindingsMap = Record<string, MetricBindingsValue>;

function flattenMetricBindings(val: MetricBindingsValue | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val).flat();
}

function buildYamlSpec(
  taskType: string,
  outputSchema: Record<string, any>,
  specs: ComputedSpec[],
  groundTruthCol?: string,
  activeMetricIds?: string[],
  metricBindings?: MetricBindingsMap
): string {
  const lines: string[] = [];
  lines.push(`task_type: ${taskType}`);
  lines.push(`description: "Especificación de evaluación interactiva y métricas computadas"`);

  if (outputSchema && Object.keys(outputSchema).length > 0) {
    lines.push(`output_schema:`);
    for (const [k, v] of Object.entries(outputSchema)) {
      if (typeof v === "number") {
        lines.push(`  ${k}: ${v}`);
      } else if (typeof v === "string") {
        lines.push(`  ${k}: "${v.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  if (specs && specs.length > 0) {
    lines.push(`computed_specs:`);
    for (const s of specs) {
      lines.push(`  - name: ${s.name}`);
      lines.push(`    function: ${s.function}`);
      if (s.arguments && s.arguments.length > 0) {
        lines.push(`    arguments:`);
        for (const arg of s.arguments) {
          lines.push(`      - ${arg}`);
        }
      } else {
        lines.push(`    arguments: []`);
      }
      if (s.expression && s.expression.trim()) {
        lines.push(`    expression: "${s.expression.replace(/"/g, '\\"')}"`);
      }
      if (s.ground_truth_col && s.ground_truth_col !== "none") {
        lines.push(`    ground_truth_col: ${s.ground_truth_col}`);
      }
      if (s.tolerance !== undefined) {
        lines.push(`    tolerance: ${s.tolerance}`);
      }
      if (s.description && s.description.trim()) {
        lines.push(`    description: "${s.description.replace(/"/g, '\\"')}"`);
      }
    }
  }

  if (groundTruthCol && groundTruthCol !== "none") {
    lines.push(`ground_truth_col: ${groundTruthCol}`);
  }

  if (activeMetricIds && activeMetricIds.length > 0) {
    lines.push(`metrics:`);
    for (const mId of activeMetricIds) {
      lines.push(`  - ${mId}`);
    }
  }

  if (metricBindings && Object.keys(metricBindings).length > 0) {
    lines.push(`metric_bindings:`);
    for (const [mId, val] of Object.entries(metricBindings)) {
      if (Array.isArray(val)) {
        if (val.length > 0) {
          lines.push(`  ${mId}:`);
          for (const v of val) {
            lines.push(`    - ${v}`);
          }
        }
      } else if (val && typeof val === "object") {
        const nonEmptySlots = Object.entries(val).filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
        if (nonEmptySlots.length > 0) {
          lines.push(`  ${mId}:`);
          for (const [slotKey, arr] of nonEmptySlots) {
            lines.push(`    ${slotKey}:`);
            for (const v of arr) {
              lines.push(`      - ${v}`);
            }
          }
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

function composeFullTemplate(
  promptText: string,
  outputSchemaStr: string,
  specs: ComputedSpec[],
  taskType: string,
  groundTruthCol?: string,
  activeMetricIds?: string[],
  metricBindings?: MetricBindingsMap
): string {
  let parsedSchema: Record<string, any> = {};
  try {
    parsedSchema = JSON.parse(outputSchemaStr);
  } catch {
    // Keep empty if invalid JSON
  }
  const yamlSpec = buildYamlSpec(taskType, parsedSchema, specs, groundTruthCol, activeMetricIds, metricBindings);
  const cleanPrompt = promptText.trim();
  const cleanSchema = outputSchemaStr.trim();

  return `${cleanPrompt}\n\n\`\`\`json\n${cleanSchema}\n\`\`\`\n\n\`\`\`evaluation-spec\n${yamlSpec}\`\`\`\n`;
}

function decomposeFullTemplate(rawTemplate: string): {
  promptText: string;
  outputSchemaStr: string;
  metricBindings: MetricBindingsMap;
} {
  let text = rawTemplate || "";
  let schemaStr = '{\n  "output_1": 0.0,\n  "output_2": 0.0\n}';
  const metricBindings: MetricBindingsMap = {};

  // 1. Extract evaluation-spec
  const evalMatch = text.match(/```(?:evaluation-spec|eval-spec)\s*([\s\S]*?)\s*```/i);
  if (evalMatch && evalMatch.index !== undefined) {
    const specBlock = evalMatch[1];
    // Parse metric_bindings block if present (supports flat lists and nested parameter slots)
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
          metricBindings[currentKey] = [];
          continue;
        }
        const slotMatch = line.match(/^[ \t]{4}([a-zA-Z0-9_]+):\s*$/);
        if (slotMatch && currentKey) {
          currentSlot = slotMatch[1];
          const existing = metricBindings[currentKey];
          if (Array.isArray(existing)) {
            metricBindings[currentKey] = { [currentSlot]: [] };
          } else {
            existing[currentSlot] = [];
          }
          continue;
        }
        const slotItemMatch = line.match(/^[ \t]{6}-\s*(.+)$/);
        if (slotItemMatch && currentKey && currentSlot) {
          const target = metricBindings[currentKey];
          if (target && !Array.isArray(target)) {
            target[currentSlot] = target[currentSlot] || [];
            target[currentSlot].push(slotItemMatch[1].trim());
          }
          continue;
        }
        const itemMatch = line.match(/^[ \t]{4}-\s*(.+)$/);
        if (itemMatch && currentKey) {
          const target = metricBindings[currentKey];
          if (Array.isArray(target)) {
            target.push(itemMatch[1].trim());
          }
        }
      }
    }
    text = text.slice(0, evalMatch.index).trim() + "\n" + text.slice(evalMatch.index + evalMatch[0].length).trim();
  }

  // 2. Extract ```json block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch && jsonMatch.index !== undefined) {
    schemaStr = jsonMatch[1].trim();
    text = text.slice(0, jsonMatch.index).trim() + "\n" + text.slice(jsonMatch.index + jsonMatch[0].length).trim();
  }

  // 3. Strip trailing format boilerplate headers to leave clean Prompt Real
  text = text
    .replace(/(?:INSTRUCCIONES DE FORMATO:?|FORMAT INSTRUCTIONS:?|Responde [^:\n]+:?)\s*$/im, "")
    .trim();

  return {
    promptText: text,
    outputSchemaStr: schemaStr,
    metricBindings,
  };
}

function generateDefaultFormula(fn: string, args: string[]): string {
  if (!args || args.length === 0) return "";
  switch (fn) {
    case "suma":
      return args.join(" + ");
    case "resta":
      return args.length > 1 ? `${args[0]} - ${args.slice(1).join(" - ")}` : args[0];
    case "multiplicacion":
      return args.join(" * ");
    case "division":
      return args.length > 1 ? `${args[0]} / ${args.slice(1).join(" / ")}` : args[0];
    case "promedio":
      return args.length > 1 ? `(${args.join(" + ")}) / ${args.length}` : args[0];
    case "diff":
      return args.length >= 2 ? `abs(${args[0]} - ${args[1]})` : `abs(${args[0]})`;
    case "abs":
      return `abs(${args[0]})`;
    case "min":
      return `min(${args.join(", ")})`;
    case "max":
      return `max(${args.join(", ")})`;
    case "nss":
      return args.length >= 2
        ? `(${args[0]} - ${args[1]}) / max(${args.join(" + ")}, 1)`
        : `(${args[0]} - 0)`;
    case "internal_consistency":
      return `internal_consistency(${args.join(", ")})`;
    case "rule_consistency":
      return `rule_consistency(${args.join(", ")})`;
    case "verbatim_faithfulness":
      return args.length >= 2
        ? `verbatim_faithfulness(${args[0]}, ${args[1]})`
        : `verbatim_faithfulness(${args[0]})`;
    case "tolerance_match":
      return args.length >= 2
        ? `abs(${args[0]} - ${args[1]}) <= 0.05`
        : `abs(${args[0]}) <= 0.05`;
    default:
      return args.join(" + ");
  }
}

// ---------------------------------------------------------
// Component
// ---------------------------------------------------------

export const PromptEditor: React.FC<PromptEditorProps> = ({
  dataset,
  inputColumns,
  contextColumns,
  specColumns = [],
  onValidationStateChange,
  template,
  setTemplate,
  systemPrompt,
  setSystemPrompt,
  taskType,
  setTaskType,
  groundTruthDatasetId,
  groundTruthDatasetIds,
  groundTruthSchema,
  idColumn,
}) => {
  const { t } = useTranslation();
  const [validation, setValidation] = useState<PromptValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedGroundTruth, setSelectedGroundTruth] = useState<string>("none");
  const [isAutodetecting, setIsAutodetecting] = useState<boolean>(false);
  const [autodetectSuccess, setAutodetectSuccess] = useState<boolean>(false);

  // Metric Catalog & Formula Modal states
  const [selectedMetricModal, setSelectedMetricModal] = useState<MetricCatalogItem | null>(null);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState<boolean>(false);

  // Custom metric form states (Tab Catalog)
  const [customMetricName, setCustomMetricName] = useState<string>("");
  const [customMetricId, setCustomMetricId] = useState<string>("");
  const [customMetricType, setCustomMetricType] = useState<string>("regex_rule");
  const [customMetricFormula, setCustomMetricFormula] = useState<string>("");
  const [customMetricDesc, setCustomMetricDesc] = useState<string>("");

  // -------------------------------------------------------
  // 3-PART STATE
  // -------------------------------------------------------
  const initialDecomposed = useMemo(() => decomposeFullTemplate(template), []);
  const [promptRealText, setPromptRealText] = useState<string>(initialDecomposed.promptText);
  const [outputSchemaText, setOutputSchemaText] = useState<string>(initialDecomposed.outputSchemaStr);
  const [computedSpecs, setComputedSpecs] = useState<ComputedSpec[]>([]);
  const [metricBindings, setMetricBindings] = useState<MetricBindingsMap>(initialDecomposed.metricBindings || {});
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastCursorRef = useRef<{ start: number; end: number } | null>(null);
  const pendingCaretPosRef = useRef<number | null>(null);
  const [braceAutocomplete, setBraceAutocomplete] = useState<{
    query: string;
    replaceStart: number;
    replaceEnd: number;
    activeIndex: number;
  } | null>(null);

  // Restore caret position synchronously after promptRealText updates from variable insertion
  useLayoutEffect(() => {
    if (pendingCaretPosRef.current !== null && promptTextareaRef.current) {
      const pos = pendingCaretPosRef.current;
      pendingCaretPosRef.current = null;
      promptTextareaRef.current.focus();
      promptTextareaRef.current.setSelectionRange(pos, pos);
      lastCursorRef.current = { start: pos, end: pos };
    }
  }, [promptRealText]);

  // Only columns explicitly selected in Step 1 for prompt injection (TEXTO, ID, CONTEXTO)
  // SPEC columns are excluded because they belong to evaluation-spec / Ground Truth, not the prompt.
  const selectedDatasetVars = useMemo(() => {
    const list: Array<{ name: string; role: "TEXTO" | "ID" | "CONTEXTO" }> = [];
    const seen = new Set<string>();
    for (const col of inputColumns || []) {
      if (col && !seen.has(col)) {
        seen.add(col);
        list.push({ name: col, role: "TEXTO" });
      }
    }
    if (idColumn && !seen.has(idColumn)) {
      seen.add(idColumn);
      list.push({ name: idColumn, role: "ID" });
    }
    for (const col of contextColumns || []) {
      if (col && !seen.has(col)) {
        seen.add(col);
        list.push({ name: col, role: "CONTEXTO" });
      }
    }
    return list;
  }, [inputColumns, idColumn, contextColumns]);

  const selectedColumnNames = useMemo(() => selectedDatasetVars.map((v) => v.name), [selectedDatasetVars]);

  const filteredAutocompleteVars = useMemo(() => {
    if (!braceAutocomplete) return [];
    const q = braceAutocomplete.query.toLowerCase();
    return selectedDatasetVars.filter((v) => v.name.toLowerCase().includes(q));
  }, [braceAutocomplete, selectedDatasetVars]);

  // Spec Builder Form State
  const [isAddingSpec, setIsAddingSpec] = useState<boolean>(false);
  const [editingSpecIndex, setEditingSpecIndex] = useState<number | null>(null);
  const [newSpecName, setNewSpecName] = useState<string>("");
  const [newSpecFunction, setNewSpecFunction] = useState<string>("suma");
  const [newSpecArgs, setNewSpecArgs] = useState<string[]>([]);
  const [newSpecCustomExpr, setNewSpecCustomExpr] = useState<string>("");
  const [isFormulaManuallyEdited, setIsFormulaManuallyEdited] = useState<boolean>(false);
  const [isCustomExprMode, setIsCustomExprMode] = useState<boolean>(false);
  const [newSpecGtCol, setNewSpecGtCol] = useState<string>("none");
  const [newSpecTolerance, setNewSpecTolerance] = useState<number>(0.05);
  const [newSpecDesc, setNewSpecDesc] = useState<string>("");

  const resetNewSpecForm = () => {
    setEditingSpecIndex(null);
    setNewSpecName("");
    setNewSpecArgs([]);
    setNewSpecCustomExpr("");
    setIsFormulaManuallyEdited(false);
    setIsCustomExprMode(false);
    setNewSpecDesc("");
    setIsAddingSpec(false);
  };

  // Parse detected outputs from current JSON schema text (including nested object subkeys)
  const detectedOutputKeys = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(outputSchemaText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys: string[] = [];
        for (const [k, v] of Object.entries(parsed)) {
          keys.push(k);
          if (v && typeof v === "object" && !Array.isArray(v)) {
            for (const subKey of Object.keys(v)) {
              keys.push(`${k}.${subKey}`);
            }
          }
        }
        return keys;
      }
    } catch {
      // invalid JSON
    }
    return [];
  }, [outputSchemaText]);

  // JSON Schema validity indicator
  const isSchemaJsonValid = useMemo<boolean>(() => {
    try {
      JSON.parse(outputSchemaText);
      return true;
    } catch {
      return false;
    }
  }, [outputSchemaText]);

  // Candidate variables for Spec arguments:
  // 1. Output keys from Part 2 (LLM outputs)
  // 2. Explicitly selected Context columns from Step 1
  // 3. Explicitly selected ID column from Step 1
  // 4. Explicitly selected Input (Text) columns from Step 1
  // 5. Previously defined computed specs (for chaining)
  const availableSpecArgumentCandidates = useMemo(() => {
    const outputs = detectedOutputKeys.map((k) => ({
      name: k,
      type: "output" as const,
      badge: "output",
    }));

    const contextCols = (contextColumns || []).map((k) => ({
      name: k,
      type: "context" as const,
      badge: "contexto",
    }));

    const idCols = idColumn
      ? [{ name: idColumn, type: "id" as const, badge: "id" }]
      : [];

    const inputCols = (inputColumns || [])
      .filter((k) => k !== idColumn && !(contextColumns || []).includes(k))
      .map((k) => ({
        name: k,
        type: "input" as const,
        badge: "texto",
      }));

    const specCols = (specColumns || []).map((k) => ({
      name: k,
      type: "spec_col" as const,
      badge: "solo spec",
    }));

    const previousSpecs = computedSpecs.map((s) => ({
      name: s.name,
      type: "spec" as const,
      badge: "spec",
    }));

    return [...outputs, ...contextCols, ...idCols, ...inputCols, ...specCols, ...previousSpecs];
  }, [detectedOutputKeys, contextColumns, idColumn, inputColumns, specColumns, computedSpecs]);

  // Auto-calculated formula preview
  const liveFormulaPreview = useMemo(() => {
    if (isCustomExprMode || newSpecFunction === "custom_expr") {
      return newSpecCustomExpr.trim() || "(expresión matemática libre)";
    }
    return generateDefaultFormula(newSpecFunction, newSpecArgs) || "(selecciona argumentos)";
  }, [newSpecFunction, newSpecArgs, newSpecCustomExpr, isCustomExprMode]);

  // Compute intelligent default spec variable bindings per catalog metric
  const getDefaultBindingsForMetric = (
    metricId: string,
    candidates = availableSpecArgumentCandidates,
    gtCol = selectedGroundTruth
  ): string[] => {
    const outputs = candidates.filter((c) => c.type === "output").map((c) => c.name);
    const leafOutputs = outputs.filter((k) => k.includes(".") || !outputs.some((other) => other.startsWith(`${k}.`)));
    const topOutputs = outputs.filter((k) => !k.includes("."));
    const inputs = candidates.filter((c) => c.type === "input").map((c) => c.name);
    const contexts = candidates.filter((c) => c.type === "context" || c.type === "spec_col").map((c) => c.name);
    const specs = candidates.filter((c) => c.type === "spec").map((c) => c.name);

    switch (metricId) {
      case "verbatim_faithfulness": {
        const quoteFields = leafOutputs.filter((k) => /marker|cita|quote|evidenc|extract|frase/i.test(k));
        return Array.from(new Set([...(quoteFields.length > 0 ? quoteFields : leafOutputs), ...inputs]));
      }
      case "internal_consistency_llm": {
        const markerFields = leafOutputs.filter((k) => /marker|cita|pos|neg|neu/i.test(k));
        return markerFields.length > 0 ? markerFields : leafOutputs;
      }
      case "rule_consistency": {
        const ruleFields = leafOutputs.filter((k) => /sentiment|polar|marker|cita/i.test(k));
        return ruleFields.length > 0 ? ruleFields : leafOutputs;
      }
      case "inter_rater_agreement":
      case "krippendorff_alpha": {
        const catFields = leafOutputs.filter((k) => /sentiment|polar|categ|label|class|verdict/i.test(k));
        return catFields.length > 0 ? catFields : leafOutputs;
      }
      case "polarity_count_agreement_icc": {
        const countFields = leafOutputs.filter((k) => /marker|cita|count|num/i.test(k));
        return Array.from(new Set([...(countFields.length > 0 ? countFields : leafOutputs), ...specs]));
      }
      case "rating_congruence": {
        const sentFields = [...specs, ...leafOutputs].filter((k) => /nss|sentiment|polar|score/i.test(k));
        const ratingCols = contexts.filter((k) => /rating|star|score|nota|val/i.test(k));
        return Array.from(
          new Set([
            ...(sentFields.length > 0 ? sentFields : leafOutputs.slice(0, 2)),
            ...(ratingCols.length > 0 ? ratingCols : contexts),
          ])
        );
      }
      case "json_validity": {
        return topOutputs.length > 0 ? topOutputs : leafOutputs;
      }
      case "numeric_accuracy": {
        const numTargets = [...specs, ...leafOutputs.filter((k) => !/marker|cita/i.test(k))];
        const gtList = gtCol && gtCol !== "none" ? [gtCol] : contexts;
        return Array.from(new Set([...numTargets, ...gtList]));
      }
      case "prevalence_positive_ratio":
      case "net_sentiment_score": {
        const statFields = [...specs, ...leafOutputs].filter((k) => /sentiment|polar|marker|nss/i.test(k));
        return statFields.length > 0 ? statFields : leafOutputs;
      }
      default:
        return leafOutputs.length > 0 ? leafOutputs : candidates.map((c) => c.name);
    }
  };

  const getEffectiveBindingsForMetric = (metricId: string): string[] => {
    const validSet = new Set(availableSpecArgumentCandidates.map((c) => c.name));
    if (selectedGroundTruth && selectedGroundTruth !== "none") {
      validSet.add(selectedGroundTruth);
    }
    const custom = metricBindings[metricId];
    if (custom !== undefined) {
      return flattenMetricBindings(custom).filter((v) => validSet.has(v));
    }
    return getDefaultBindingsForMetric(metricId).filter((v) => validSet.has(v));
  };

  const getDefaultSlotBindingsForMetric = (
    metricId: string,
    candidates = availableSpecArgumentCandidates,
    gtCol = selectedGroundTruth
  ): Record<string, string[]> => {
    const outputs = candidates.filter((c) => c.type === "output").map((c) => c.name);
    const leafOutputs = outputs.filter((k) => k.includes(".") || !outputs.some((other) => other.startsWith(`${k}.`)));
    const specs = candidates.filter((c) => c.type === "spec").map((c) => c.name);
    const contexts = candidates.filter((c) => c.type === "context" || c.type === "input").map((c) => c.name);
    const specCols = candidates.filter((c) => c.type === "spec_col").map((c) => c.name);

    switch (metricId) {
      case "rating_congruence": {
        const sig = specs.find((k) => /nss|score|polar/i.test(k)) || "__auto_nss__";
        const crit = [...specCols, ...contexts].find((k) => /rating|star|score|nota|val/i.test(k)) || specCols[0] || "";
        return {
          signal_var: sig ? [sig] : [],
          criterion_var: crit ? [crit] : [],
        };
      }
      case "verbatim_faithfulness": {
        const quoteFields = leafOutputs.filter((k) => /marker|cita|quote|evidenc|extract|frase/i.test(k));
        const srcCol = contexts.find((k) => /comment|text|review|body|content/i.test(k)) || contexts[0] || specCols[0] || "";
        return {
          quote_fields: quoteFields.length > 0 ? quoteFields : leafOutputs,
          source_text_col: srcCol ? [srcCol] : [],
        };
      }
      case "numeric_accuracy": {
        const pred = [...specs, ...leafOutputs].find((k) => !/marker|cita/i.test(k)) || "";
        const ref = (gtCol && gtCol !== "none" ? gtCol : specCols[0] || contexts[0]) || "";
        return {
          prediction_var: pred ? [pred] : [],
          reference_var: ref ? [ref] : [],
        };
      }
      case "net_sentiment_score": {
        const pos = [...leafOutputs, ...specs].filter((k) => /pos/i.test(k));
        const neg = [...leafOutputs, ...specs].filter((k) => /neg/i.test(k));
        return {
          positive_fields: pos,
          negative_fields: neg,
        };
      }
      default:
        return {};
    }
  };

  const getEffectiveSlotBindings = (metricId: string): Record<string, string[]> => {
    const custom = metricBindings[metricId];
    if (custom && !Array.isArray(custom)) {
      return custom;
    }
    return getDefaultSlotBindingsForMetric(metricId);
  };

  // Linter Check 1: Non-spec prompt variables (CONTEXTO / TEXTO) selected in Step 1 but not used in the prompt
  const unusedPromptVars = useMemo(() => {
    const promptTargets = Array.from(new Set([...(contextColumns || []), ...(inputColumns || [])])).filter(Boolean);
    if (promptTargets.length === 0) return [];
    const usedInPrompt = new Set<string>(validation?.detected_variables || []);
    const matches = promptRealText.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g);
    for (const m of matches) {
      if (m[1]) usedInPrompt.add(m[1]);
    }
    return promptTargets.filter((col) => !usedInPrompt.has(col));
  }, [contextColumns, inputColumns, promptRealText, validation?.detected_variables]);

  // Linter Check 2: SPEC variables declared in Step 1 that are not used in Evaluation Specs, Metric Catalog, or YAML
  const unusedSpecVars = useMemo(() => {
    const specsToCheck = (specColumns || []).filter(Boolean);
    if (specsToCheck.length === 0) return [];

    const yamlMatch = template.match(/```evaluation-spec\s*([\s\S]*?)```/i);
    const yamlText = yamlMatch ? yamlMatch[1] : "";

    const activeMetricIds: string[] = [];
    for (const m of METRIC_CATALOG) {
      const regex = new RegExp(`^\\s*-\\s*${m.id}\\b`, "m");
      if (regex.test(template) || validation?.detected_metrics?.includes(m.id)) {
        activeMetricIds.push(m.id);
      }
    }

    const usedInCatalog = new Set<string>();
    for (const mId of activeMetricIds) {
      const rawVal = metricBindings[mId];
      const bindings = rawVal
        ? flattenMetricBindings(rawVal)
        : Object.values(getDefaultSlotBindingsForMetric(mId)).flat().concat(getDefaultBindingsForMetric(mId));
      for (const b of bindings) usedInCatalog.add(b);
    }

    const usedInSpecs = new Set<string>();
    for (const cs of computedSpecs) {
      for (const arg of cs.arguments || []) usedInSpecs.add(arg);
    }

    return specsToCheck.filter((col) => {
      const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordRegex = new RegExp(`\\b${escaped}\\b`);

      const inComputedArgs = usedInSpecs.has(col);
      const inComputedFormula = computedSpecs.some(
        (cs) => (cs.expression && wordRegex.test(cs.expression)) || cs.ground_truth_col === col
      );
      const inCatalog = usedInCatalog.has(col);
      const inGroundTruth = selectedGroundTruth === col || validation?.ground_truth_col === col;
      const inSourceText = validation?.eval_spec?.source_text_col?.replace(/[{}]/g, "") === col;
      const inYaml = yamlText ? wordRegex.test(yamlText) : false;

      return !(inComputedArgs || inComputedFormula || inCatalog || inGroundTruth || inSourceText || inYaml);
    });
  }, [specColumns, template, computedSpecs, metricBindings, selectedGroundTruth, validation]);

  // Helper to get currently active metric IDs
  const getCurrentActiveMetricIds = (tpl: string = template): string[] => {
    const activeIds: string[] = [];
    for (const m of METRIC_CATALOG) {
      const regex = new RegExp(`^\\s*-\\s*${m.id}\\b`, "m");
      if (regex.test(tpl) || validation?.detected_metrics?.includes(m.id)) {
        activeIds.push(m.id);
      }
    }
    return activeIds;
  };

  // Sync back to template and parent
  const syncAndValidate = (
    pText: string,
    oSchema: string,
    specs: ComputedSpec[],
    gtCol?: string,
    customActiveMetrics?: string[],
    customBindings?: MetricBindingsMap
  ) => {
    const activeIds = customActiveMetrics ?? getCurrentActiveMetricIds(template);
    const bindingsToUse = customBindings ?? metricBindings;
    const full = composeFullTemplate(
      pText,
      oSchema,
      specs,
      taskType,
      gtCol ?? selectedGroundTruth,
      activeIds,
      bindingsToUse
    );
    setTemplate(full);
    triggerValidation(full, systemPrompt);
  };

  // -------------------------------------------------------
  // Lifecycle & Auto-generation
  // -------------------------------------------------------
  useEffect(() => {
    if (taskType === "aaker_dimensions") {
      setTaskType("aspect_polarity");
    }
  }, []);

  useEffect(() => {
    if (!template) {
      handleAutoGenerate();
    } else {
      triggerValidation(template, systemPrompt);
    }
  }, [dataset.id, inputColumns, contextColumns, idColumn, specColumns, taskType]);

  const handleAutoGenerate = async () => {
    try {
      const gt = selectedGroundTruth !== "none" ? selectedGroundTruth : undefined;
      const res = await generatePromptTemplate(
        dataset.id,
        taskType || "numeric_math",
        inputColumns,
        contextColumns,
        gt
      );

      setTemplate(res.template);
      setSystemPrompt(res.system_prompt);

      // Populate 3-part states
      if (res.prompt_text) {
        setPromptRealText(res.prompt_text);
      } else {
        const dec = decomposeFullTemplate(res.template);
        setPromptRealText(dec.promptText);
      }

      if (res.output_schema) {
        setOutputSchemaText(JSON.stringify(res.output_schema, null, 2));
      }

      if (res.computed_specs && res.computed_specs.length > 0) {
        setComputedSpecs(res.computed_specs);
      } else {
        setComputedSpecs([]);
      }

      triggerValidation(res.template, res.system_prompt);
    } catch (err) {
      console.error("Error generating prompt template:", err);
    }
  };

  const triggerValidation = async (tpl: string, sysPrompt: string) => {
    setIsValidating(true);
    try {
      const res = await validatePrompt(dataset.id, tpl, sysPrompt, selectedColumnNames);
      setValidation(res);
      if (res.ground_truth_col) {
        setSelectedGroundTruth(res.ground_truth_col);
      }
      // If computed specs came back from server and local state was empty, synchronize
      if (res.computed_specs && res.computed_specs.length > 0 && computedSpecs.length === 0) {
        setComputedSpecs(res.computed_specs);
      }
    } catch (err) {
      console.error("Error validating prompt:", err);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    onValidationStateChange?.(Boolean(validation?.is_valid), isValidating);
  }, [validation, isValidating, onValidationStateChange]);

  // -------------------------------------------------------
  // Handlers for 3 Parts
  // -------------------------------------------------------

  // Part 1: Real Prompt change (with inline `{` variable autocomplete trigger)
  const handlePromptRealChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caretPos = e.target.selectionStart ?? val.length;
    lastCursorRef.current = { start: caretPos, end: e.target.selectionEnd ?? caretPos };

    const beforeCaret = val.slice(0, caretPos);
    const openBraceMatch = beforeCaret.match(/\{([a-zA-Z0-9_.-]*)$/);
    if (openBraceMatch && selectedDatasetVars.length > 0) {
      const query = openBraceMatch[1];
      const replaceStart = caretPos - openBraceMatch[0].length;
      const replaceEnd = val[caretPos] === "}" ? caretPos + 1 : caretPos;
      setBraceAutocomplete({
        query,
        replaceStart,
        replaceEnd,
        activeIndex: 0,
      });
    } else {
      setBraceAutocomplete(null);
    }

    setPromptRealText(val);
    syncAndValidate(val, outputSchemaText, computedSpecs);
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!braceAutocomplete || filteredAutocompleteVars.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setBraceAutocomplete((prev) =>
        prev
          ? { ...prev, activeIndex: (prev.activeIndex + 1) % filteredAutocompleteVars.length }
          : null
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setBraceAutocomplete((prev) =>
        prev
          ? {
              ...prev,
              activeIndex:
                (prev.activeIndex - 1 + filteredAutocompleteVars.length) %
                filteredAutocompleteVars.length,
            }
          : null
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const chosen = filteredAutocompleteVars[braceAutocomplete.activeIndex] || filteredAutocompleteVars[0];
      if (chosen) {
        insertVariable(chosen.name, {
          start: braceAutocomplete.replaceStart,
          end: braceAutocomplete.replaceEnd,
        });
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setBraceAutocomplete(null);
    }
  };

  // Part 2: Output JSON Schema change
  const handleOutputSchemaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setOutputSchemaText(val);
    syncAndValidate(promptRealText, val, computedSpecs);
  };

  const handleFunctionChange = (fn: string) => {
    setNewSpecFunction(fn);
    const suggested = generateDefaultFormula(fn, newSpecArgs);
    setNewSpecCustomExpr(suggested);
    setIsFormulaManuallyEdited(false);
  };

  // Part 3: Toggle argument selection for the new spec
  const toggleArgumentForNewSpec = (argName: string) => {
    setNewSpecArgs((prev) => {
      const next = prev.includes(argName) ? prev.filter((a) => a !== argName) : [...prev, argName];
      if (!isFormulaManuallyEdited) {
        setNewSpecCustomExpr(generateDefaultFormula(newSpecFunction, next));
      }
      return next;
    });
  };

  // Part 3: Edit existing spec
  const handleEditComputedSpec = (idx: number) => {
    const spec = computedSpecs[idx];
    if (!spec) return;
    setEditingSpecIndex(idx);
    setNewSpecName(spec.name);
    setNewSpecFunction(spec.function || "custom_expr");
    setNewSpecArgs(spec.arguments || []);
    const expr = spec.expression || generateDefaultFormula(spec.function, spec.arguments || []);
    setNewSpecCustomExpr(expr);
    setIsFormulaManuallyEdited(Boolean(spec.expression));
    setNewSpecGtCol(spec.ground_truth_col || "none");
    setNewSpecTolerance(spec.tolerance ?? 0.05);
    setNewSpecDesc(spec.description || "");
    setIsAddingSpec(true);
  };

  // Part 3: Add or update spec
  const handleAddComputedSpec = () => {
    if (!newSpecName.trim()) return;
    const cleanName = newSpecName.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

    // Check duplicate (ignore self if editing)
    const isDup = computedSpecs.some((s, idx) => s.name === cleanName && idx !== editingSpecIndex);
    if (isDup) {
      alert(`Ya existe una especificación con el nombre "${cleanName}". Usa otro nombre.`);
      return;
    }

    const expr = newSpecCustomExpr.trim() || generateDefaultFormula(newSpecFunction, newSpecArgs);

    const newSpec: ComputedSpec = {
      name: cleanName,
      function: newSpecFunction,
      arguments: newSpecArgs.length > 0 ? newSpecArgs : (detectedOutputKeys.length > 0 ? [detectedOutputKeys[0]] : []),
      expression: expr || undefined,
      ground_truth_col: newSpecGtCol !== "none" ? newSpecGtCol : undefined,
      tolerance: newSpecTolerance,
      description: newSpecDesc.trim() || undefined,
    };

    let updated: ComputedSpec[];
    if (editingSpecIndex !== null && editingSpecIndex >= 0 && editingSpecIndex < computedSpecs.length) {
      updated = [...computedSpecs];
      updated[editingSpecIndex] = newSpec;
    } else {
      updated = [...computedSpecs, newSpec];
    }

    setComputedSpecs(updated);
    syncAndValidate(promptRealText, outputSchemaText, updated);
    resetNewSpecForm();
  };

  // Part 3: Delete spec
  const handleDeleteComputedSpec = (specName: string) => {
    const updated = computedSpecs.filter((s) => s.name !== specName);
    setComputedSpecs(updated);
    syncAndValidate(promptRealText, outputSchemaText, updated);
  };

  // Part 2: Autodetect Output JSON Schema from Ground Truth
  const handleAutodetectFromGroundTruth = async () => {
    setIsAutodetecting(true);
    try {
      let schemaToUse = groundTruthSchema;

      // If not passed or missing dimensions, fetch compatible ground truths
      if (!schemaToUse || !schemaToUse.dimensions || schemaToUse.dimensions.length === 0) {
        if (dataset?.id) {
          const compats = await fetchCompatibleGroundTruths(dataset.id);
          const targetGtId = groundTruthDatasetId || (groundTruthDatasetIds && groundTruthDatasetIds[0]);
          if (targetGtId) {
            const matched = compats.find((c) => c.dataset_id === targetGtId);
            if (matched && matched.schema) {
              schemaToUse = matched.schema;
            }
          }
          if (!schemaToUse || !schemaToUse.dimensions || schemaToUse.dimensions.length === 0) {
            const anyCompat = compats.find((c) => c.schema && c.schema.dimensions && c.schema.dimensions.length > 0);
            if (anyCompat && anyCompat.schema) {
              schemaToUse = anyCompat.schema;
            }
          }
        }
      }

      if (schemaToUse && schemaToUse.dimensions && schemaToUse.dimensions.length > 0) {
        const detectedOutput: Record<string, any> = {};
        for (const dim of schemaToUse.dimensions) {
          const dimObj: Record<string, any> = {};
          if (dim.sentiment_field) {
            const validCats = (dim.sentiment_categories || []).filter(
              (c: any) => c && String(c).trim() && String(c).toLowerCase() !== "blank"
            );
            const catStr = validCats.length > 0 ? validCats.join(" | ") : "Positive | Negative | Neutral | Mixed";
            dimObj[dim.sentiment_field] = `string (${catStr})`;
          }
          if (dim.markers_fields && dim.markers_fields.length > 0) {
            for (const mf of dim.markers_fields) {
              dimObj[mf] = ["string"];
            }
          } else if (!dim.sentiment_field) {
            dimObj["sentiment"] = "string (Positive | Negative | Neutral | Mixed)";
            dimObj["markers_positive"] = ["string"];
            dimObj["markers_negative"] = ["string"];
            dimObj["markers_neutral"] = ["string"];
          }
          detectedOutput[dim.name] = dimObj;
        }

        const formattedJson = JSON.stringify(detectedOutput, null, 2);
        setOutputSchemaText(formattedJson);
        syncAndValidate(promptRealText, formattedJson, computedSpecs);
        setAutodetectSuccess(true);
        setTimeout(() => setAutodetectSuccess(false), 2500);
        return;
      }

      // Fallback: check dataset columns for ground_truth.* or target.*
      const gtCols = dataset?.columns?.filter((c) =>
        c.name.startsWith("ground_truth.") || c.name.startsWith("target.")
      ) || [];

      if (gtCols.length > 0) {
        const fallbackOutput: Record<string, any> = {};
        for (const col of gtCols) {
          const cleanName = col.name.replace(/^(ground_truth\.|target\.)/, "");
          const isNumeric = /int|double|float|decimal|numeric/i.test(col.data_type || "");
          fallbackOutput[cleanName] = isNumeric ? 0.0 : "string";
        }
        const formattedJson = JSON.stringify(fallbackOutput, null, 2);
        setOutputSchemaText(formattedJson);
        syncAndValidate(promptRealText, formattedJson, computedSpecs);
        setAutodetectSuccess(true);
        setTimeout(() => setAutodetectSuccess(false), 2500);
        return;
      }

      alert(t("prompt.autodetectGtNoDimensions"));
    } catch (err) {
      console.error("Error autodetecting ground truth schema:", err);
      alert(t("prompt.autodetectGtNoDimensions"));
    } finally {
      setIsAutodetecting(false);
    }
  };

  // Insert variable {col} into Part 1 (Prompt Real) at exact cursor position without jumping to end
  const insertVariable = (varName: string, replaceRange?: { start: number; end: number }) => {
    const textToInsert = `{${varName}}`;
    const textarea = promptTextareaRef.current;
    const current = promptRealText;
    const start = replaceRange
      ? replaceRange.start
      : lastCursorRef.current
      ? lastCursorRef.current.start
      : textarea
      ? textarea.selectionStart
      : current.length;
    const end = replaceRange
      ? replaceRange.end
      : lastCursorRef.current
      ? lastCursorRef.current.end
      : textarea
      ? textarea.selectionEnd
      : start;

    const updated = current.substring(0, start) + textToInsert + current.substring(end);
    const nextCaretPos = start + textToInsert.length;

    pendingCaretPosRef.current = nextCaretPos;
    lastCursorRef.current = { start: nextCaretPos, end: nextCaretPos };
    setBraceAutocomplete(null);
    setPromptRealText(updated);
    syncAndValidate(updated, outputSchemaText, computedSpecs);
  };

  // Raw YAML manual editor handler (for advanced users)
  const handleRawTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTpl = e.target.value;
    setTemplate(newTpl);
    const dec = decomposeFullTemplate(newTpl);
    setPromptRealText(dec.promptText);
    setOutputSchemaText(dec.outputSchemaStr);
    triggerValidation(newTpl, systemPrompt);
  };

  const handleTaskTypeChange = (newType: string) => {
    setTaskType(newType);
    setTimeout(async () => {
      try {
        const res = await generatePromptTemplate(
          dataset.id,
          newType,
          inputColumns,
          contextColumns,
          selectedGroundTruth !== "none" ? selectedGroundTruth : undefined
        );
        setTemplate(res.template);
        setSystemPrompt(res.system_prompt);
        if (res.prompt_text) setPromptRealText(res.prompt_text);
        if (res.output_schema) setOutputSchemaText(JSON.stringify(res.output_schema, null, 2));
        if (res.computed_specs) setComputedSpecs(res.computed_specs);
        triggerValidation(res.template, res.system_prompt);
      } catch (e) {
        console.error(e);
      }
    }, 50);
  };

  const handleGroundTruthChange = (newGt: string) => {
    setSelectedGroundTruth(newGt);
    syncAndValidate(promptRealText, outputSchemaText, computedSpecs, newGt);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isMetricActive = (metricId: string): boolean => {
    if (validation?.detected_metrics?.includes(metricId)) return true;
    const regex = new RegExp(`^\\s*-\\s*${metricId}\\b`, "m");
    return regex.test(template);
  };

  const toggleMetric = (metricId: string) => {
    const currentlyActive = isMetricActive(metricId);
    const currentList = METRIC_CATALOG.map((m) => m.id).filter((id) => isMetricActive(id));
    let nextActiveIds: string[];
    const nextBindings = { ...metricBindings };

    if (currentlyActive) {
      nextActiveIds = currentList.filter((id) => id !== metricId);
    } else {
      nextActiveIds = Array.from(new Set([...currentList, metricId]));
      if (!nextBindings[metricId] || flattenMetricBindings(nextBindings[metricId]).length === 0) {
        const catalogDef = METRIC_CATALOG.find((m) => m.id === metricId);
        nextBindings[metricId] = catalogDef?.parameterSlots
          ? getDefaultSlotBindingsForMetric(metricId)
          : getDefaultBindingsForMetric(metricId);
        setMetricBindings(nextBindings);
      }
    }

    syncAndValidate(promptRealText, outputSchemaText, computedSpecs, selectedGroundTruth, nextActiveIds, nextBindings);
  };

  const handleToggleMetricVariable = (metricId: string, varName: string) => {
    const currentVars = getEffectiveBindingsForMetric(metricId);
    const nextVars = currentVars.includes(varName)
      ? currentVars.filter((v) => v !== varName)
      : [...currentVars, varName];
    const nextBindings = {
      ...metricBindings,
      [metricId]: nextVars,
    };
    setMetricBindings(nextBindings);
    syncAndValidate(
      promptRealText,
      outputSchemaText,
      computedSpecs,
      selectedGroundTruth,
      undefined,
      nextBindings
    );
  };

  const handleResetMetricVariables = (metricId: string) => {
    const catalogDef = METRIC_CATALOG.find((m) => m.id === metricId);
    const defaults: MetricBindingsValue = catalogDef?.parameterSlots
      ? getDefaultSlotBindingsForMetric(metricId)
      : getDefaultBindingsForMetric(metricId);
    const nextBindings = {
      ...metricBindings,
      [metricId]: defaults,
    };
    setMetricBindings(nextBindings);
    syncAndValidate(
      promptRealText,
      outputSchemaText,
      computedSpecs,
      selectedGroundTruth,
      undefined,
      nextBindings
    );
  };

  const handleSetMetricSlotVariable = (
    metricId: string,
    slotKey: string,
    varName: string,
    multiple: boolean
  ) => {
    const currentSlots = getEffectiveSlotBindings(metricId);
    const currentArr = currentSlots[slotKey] || [];
    const nextArr = multiple
      ? currentArr.includes(varName)
        ? currentArr.filter((v) => v !== varName)
        : [...currentArr, varName]
      : varName
      ? [varName]
      : [];
    const nextBindings: MetricBindingsMap = {
      ...metricBindings,
      [metricId]: {
        ...currentSlots,
        [slotKey]: nextArr,
      },
    };
    setMetricBindings(nextBindings);
    syncAndValidate(
      promptRealText,
      outputSchemaText,
      computedSpecs,
      selectedGroundTruth,
      undefined,
      nextBindings
    );
  };

  const handleOpenMetricModal = (metricIdentifier: string | MetricCatalogItem) => {
    if (typeof metricIdentifier === "object") {
      setSelectedMetricModal(metricIdentifier);
      setIsFormulaModalOpen(true);
      return;
    }
    const found = METRIC_CATALOG.find((m) => m.id === metricIdentifier);
    if (found) {
      setSelectedMetricModal(found);
    } else {
      setSelectedMetricModal({
        id: metricIdentifier,
        name: metricIdentifier.replace(/_/g, " ").toUpperCase(),
        category: "custom",
        categoryLabel: t("prompt.customMetricCategoryLabel"),
        shortDesc: t("prompt.customMetricShortDesc"),
        formulaTex: `${metricIdentifier} = f(datos)`,
        variables: [{ symbol: "datos", label: t("prompt.customMetricDataLabel") }],
        interpretation: [
          { range: t("prompt.customMetricRuleRange"), label: t("prompt.customMetricRuleLabel"), badgeVariant: "default" },
        ],
        citation: t("prompt.customMetricCitation"),
        higherIsBetter: true,
      });
    }
    setIsFormulaModalOpen(true);
  };

  const handleAddCustomMetric = () => {
    if (!customMetricId.trim() && !customMetricName.trim()) return;
    const cleanId = (customMetricId.trim() || customMetricName.trim().toLowerCase()).replace(/[^a-z0-9_]/g, "_");
    let newTpl = template;
    const comment = customMetricDesc.trim() || customMetricFormula.trim() || customMetricName.trim();
    const entry = `  - ${cleanId}        # ${comment}`;

    if (newTpl.includes("metrics:")) {
      newTpl = newTpl.replace(/metrics:\s*[\r\n]+/, `metrics:\n${entry}\n`);
    } else if (newTpl.includes("```evaluation-spec")) {
      newTpl = newTpl.replace("```evaluation-spec", `\`\`\`evaluation-spec\nmetrics:\n${entry}`);
    } else {
      newTpl += `\n\`\`\`evaluation-spec\ntask_type: ${taskType}\nmetrics:\n${entry}\n\`\`\`\n`;
    }

    setTemplate(newTpl);
    triggerValidation(newTpl, systemPrompt);

    setCustomMetricName("");
    setCustomMetricId("");
    setCustomMetricFormula("");
    setCustomMetricDesc("");
    setActiveTab("catalog");
  };

  const availableColumns = useMemo(
    () => Array.from(new Set([...(specColumns || []), ...selectedColumnNames])),
    [specColumns, selectedColumnNames]
  );

  return (
    <div className="space-y-6">
      {/* Top Config Header */}
      <Card className="neo-panel border-border shadow-spatial">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              <span>{t("prompt.headerTitle")}</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {t("prompt.headerDesc")}
            </CardDescription>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-72">
              <Select value={taskType} onValueChange={handleTaskTypeChange}>
                <SelectTrigger id="select-task-type" className="h-9 text-xs bg-background/60 border-border/80">
                  <SelectValue placeholder={t("prompt.taskTypePlaceholder")} />
                </SelectTrigger>
                <SelectContent className="glass-panel border-border/80 text-xs">
                  <SelectItem value="numeric_math" className="gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Calculator className="w-3.5 h-3.5 text-blue-400" />
                      <span>{t("prompt.taskNumeric")}</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="aspect_polarity">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>{t("prompt.taskAspect")}</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="classification">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Target className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t("prompt.taskClassification")}</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="structured_json">
                    <span className="flex items-center gap-1.5 font-medium">
                      <FileJson className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t("prompt.taskJson")}</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="custom">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Sliders className="w-3.5 h-3.5 text-primary" />
                      <span>{t("prompt.taskCustom")}</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              onClick={handleAutoGenerate}
              className="h-9 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t("prompt.regenerateButton")}</span>
            </Button>
          </div>
        </CardHeader>

        {/* Variables selector (Strictly restricted to prompt-injectable columns from Step 1: TEXTO, ID, CONTEXTO) */}
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              {t("prompt.variablesLabel")}
            </Label>
            <span className="text-[11px] text-muted-foreground font-mono">
              Tip: Escribe <code className="px-1 py-0.5 rounded bg-muted border border-border text-primary font-bold">{"{"}</code> en el editor para autocompletar en la posición del cursor
            </span>
          </div>
          {selectedDatasetVars.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              No hay columnas seleccionadas en el Paso 1. Vuelve al Paso 1 y asigna al menos una columna como TEXTO, ID o CONTEXTO.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedDatasetVars.map(({ name: col, role }) => {
                const isUsed = validation?.detected_variables.includes(col);
                const roleBadgeClass =
                  role === "TEXTO"
                    ? "bg-primary/15 text-primary"
                    : role === "ID"
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                    : "bg-blue-500/15 text-blue-800 dark:text-blue-300";

                return (
                  <Button
                    key={col}
                    type="button"
                    variant={isUsed ? "secondary" : "outline"}
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertVariable(col)}
                    className={`h-7 px-2.5 text-xs font-mono gap-1.5 rounded-sm transition-all cursor-pointer ${
                      isUsed
                        ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={`Insertar {${col}} en la posición del cursor (${role})`}
                  >
                    <Tag className="w-3 h-3 opacity-60" />
                    <span>{`{${col}}`}</span>
                    <span className={`text-[9px] px-1 py-0 font-sans rounded-sm font-bold ${roleBadgeClass}`}>
                      {role}
                    </span>
                    {isUsed && <span className="text-[10px] text-primary ml-0.5 font-bold">✓</span>}
                  </Button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evaluation Spec Inspector Bar */}
      <Card className="bg-card border border-border p-4 rounded-lg shadow-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {t("prompt.evalSpecTitle")}
              </span>
              <Badge variant="outline" className="text-[10px] font-mono bg-background/60">
                {validation?.eval_spec?.task_type || taskType}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground pt-0.5">
              {t("prompt.evalSpecDesc")}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <Label htmlFor="gt-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                Ground Truth:
              </Label>
              <div className="w-56">
                <Select value={selectedGroundTruth} onValueChange={handleGroundTruthChange}>
                  <SelectTrigger id="gt-select" className="h-8 text-xs bg-background/80 border-border/80 font-mono">
                    <SelectValue placeholder={t("prompt.groundTruthPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border-border/80 text-xs font-mono">
                    <SelectItem value="none">{t("prompt.groundTruthNone")}</SelectItem>
                    {availableColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Metric Badges Display with clickable [fx] button */}
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">{t("prompt.computedMetricsLabel")}</span>
            {validation?.detected_metrics && validation.detected_metrics.length > 0 ? (
              validation.detected_metrics.map((m, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleOpenMetricModal(m)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-background/80 hover:bg-muted border border-border/80 text-foreground px-2 py-0.5 rounded-md transition-all group"
                  title={t("prompt.computedMetricsTooltip")}
                >
                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                  <span>{m}</span>
                  <span className="text-[10px] font-mono font-bold text-primary px-1 rounded bg-primary/10 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    fx
                  </span>
                </button>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground italic">
                {t("prompt.defaultMetricsFallback")}
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("catalog")}
            className="h-7 text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10 whitespace-nowrap"
          >
            <FunctionSquare className="w-3.5 h-3.5" />
            <span>{t("prompt.catalogButton")}</span>
          </Button>
        </div>
      </Card>

      {/* Editor, Catalog, Custom Metric & Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: 3-Part Editor & Tabs */}
        <Card className="lg:col-span-2 neo-panel border-border shadow-spatial overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2 bg-muted/20 flex-wrap gap-2">
              <TabsList className="bg-background/60 border border-border/60 h-8 p-0.5 flex-wrap">
                <TabsTrigger value="editor" className="text-xs gap-1.5 h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{t("prompt.editorTab")}</span>
                </TabsTrigger>
                <TabsTrigger value="catalog" className="text-xs gap-1.5 h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FunctionSquare className="w-3.5 h-3.5" />
                  <span>{t("prompt.catalogTab")}</span>
                </TabsTrigger>
                <TabsTrigger value="custom" className="text-xs gap-1.5 h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t("prompt.customTab")}</span>
                </TabsTrigger>
                <TabsTrigger value="raw_yaml" className="text-xs gap-1.5 h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{t("prompt.rawYamlTab")}</span>
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs gap-1.5 h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{t("prompt.dryRunTab")}</span>
                </TabsTrigger>
              </TabsList>

              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5"
                title="Copiar prompt completo"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t("prompt.copied") : t("prompt.copyTemplate")}</span>
              </Button>
            </div>

            {/* TAB 1: 3-PART TEMPLATE EDITOR */}
            <TabsContent value="editor" className="p-4 flex-1 flex flex-col space-y-6 m-0">
              {/* System Prompt Row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="system-prompt" className="text-xs font-semibold text-muted-foreground">
                    {t("prompt.systemPromptLabel")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {t("prompt.systemPromptHelp")}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 bg-background/80 text-muted-foreground border-border">
                      {(systemPrompt || "").length} chars &middot; ~{Math.ceil((systemPrompt || "").length / 4)} tokens
                    </Badge>
                  </div>
                </div>
                <Textarea
                  id="system-prompt"
                  rows={3}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="font-mono text-xs bg-background/60 border-border/80 resize-y leading-relaxed"
                />
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* PARTE 1: PROMPT REAL (Instrucciones para el Modelo) */}
              {/* ----------------------------------------------------------------- */}
              <Card className="border border-border/80 bg-card/60 shadow-none overflow-hidden">
                <CardHeader className="py-2.5 px-3.5 border-b border-border/60 bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-primary" />
                      <Label htmlFor="template-real-prompt" className="text-xs font-bold text-foreground cursor-pointer">
                        {t("prompt.part1Title")}
                      </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("prompt.part1Desc")}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-2 relative">
                  {braceAutocomplete && filteredAutocompleteVars.length > 0 && (
                    <div className="p-2 rounded-sm bg-card border-2 border-primary/50 shadow-md space-y-1.5 z-20">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Tag className="w-3 h-3 text-primary" />
                          <span>
                            Inyectar variable del dataset{" "}
                            {braceAutocomplete.query ? `(filtro: "{${braceAutocomplete.query}")` : ""}:
                          </span>
                        </span>
                        <span>↑↓ elegir &middot; Enter/Tab o clic insertar &middot; Esc cerrar</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredAutocompleteVars.map((v, idx) => {
                          const isSelected = idx === braceAutocomplete.activeIndex;
                          return (
                            <button
                              key={v.name}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                insertVariable(v.name, {
                                  start: braceAutocomplete.replaceStart,
                                  end: braceAutocomplete.replaceEnd,
                                })
                              }
                              className={`px-2 py-1 rounded-sm text-xs font-mono flex items-center gap-1.5 border transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary font-bold"
                                  : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-muted"
                              }`}
                            >
                              <span>{`{${v.name}}`}</span>
                              <span
                                className={`text-[9px] px-1 py-0 rounded-sm font-sans font-bold ${
                                  isSelected
                                    ? "bg-background/20 text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {v.role}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Textarea
                    ref={promptTextareaRef}
                    id="template-real-prompt"
                    value={promptRealText}
                    onChange={handlePromptRealChange}
                    onKeyDown={handlePromptKeyDown}
                    onSelect={(e) => {
                      lastCursorRef.current = {
                        start: e.currentTarget.selectionStart,
                        end: e.currentTarget.selectionEnd,
                      };
                    }}
                    onClick={(e) => {
                      lastCursorRef.current = {
                        start: e.currentTarget.selectionStart,
                        end: e.currentTarget.selectionEnd,
                      };
                    }}
                    onKeyUp={(e) => {
                      lastCursorRef.current = {
                        start: e.currentTarget.selectionStart,
                        end: e.currentTarget.selectionEnd,
                      };
                    }}
                    rows={7}
                    aria-label={t("prompt.part1Title")}
                    className="w-full p-3 text-xs font-mono bg-background/80 border-border/80 focus:ring-primary/20 resize-y leading-relaxed"
                    placeholder={t("prompt.promptRealPlaceholder")}
                  />
                </CardContent>
              </Card>

              {/* ----------------------------------------------------------------- */}
              {/* PARTE 2: ESTRUCTURA DE SALIDA (Output JSON Schema Backend) */}
              {/* ----------------------------------------------------------------- */}
              <Card className="border border-border/80 bg-card/60 shadow-none overflow-hidden">
                <CardHeader className="py-2.5 px-3.5 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-amber-500" />
                      <Label htmlFor="output-json-schema" className="text-xs font-bold text-foreground cursor-pointer">
                        {t("prompt.part2Title")}
                      </Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("prompt.part2Desc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      id="btn-autodetect-gt"
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAutodetectFromGroundTruth}
                      disabled={isAutodetecting}
                      className={`h-7 px-2.5 text-[11px] font-semibold gap-1.5 transition-all shadow-none ${
                        autodetectSuccess
                          ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                          : "text-primary border-primary/30 hover:bg-primary/10 hover:border-primary/50"
                      }`}
                      title={t("prompt.autodetectGtTooltip")}
                    >
                      {autodetectSuccess ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <BrainCog className={`w-3.5 h-3.5 text-primary ${isAutodetecting ? "animate-spin" : ""}`} />
                      )}
                      <span>
                        {autodetectSuccess ? t("prompt.autodetectGtApplied") : t("prompt.autodetectGtButton")}
                      </span>
                    </Button>

                    {isSchemaJsonValid ? (
                      <Badge variant="outline" className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border-emerald-500/30 gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {t("prompt.part2ValidJson")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-semibold text-destructive bg-destructive/10 border-destructive/30 gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t("prompt.part2InvalidJson")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <Textarea
                    id="output-json-schema"
                    value={outputSchemaText}
                    onChange={handleOutputSchemaChange}
                    rows={5}
                    aria-label={t("prompt.part2Title")}
                    className="w-full p-3 text-xs font-mono bg-background/80 border-border/80 focus:ring-amber-500/20 resize-y leading-relaxed"
                    placeholder={t("prompt.part2SchemaPlaceholder")}
                  />
                </CardContent>
              </Card>

              {/* ----------------------------------------------------------------- */}
              {/* PARTE 3: EVALUATION SPECS (Área Interactiva de Cálculos y Métricas) */}
              {/* ----------------------------------------------------------------- */}
              <Card className="border border-border/80 bg-card/60 shadow-none overflow-hidden">
                <CardHeader className="py-2.5 px-3.5 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-foreground">
                        {t("prompt.part3Title")}
                      </span>
                      <Badge variant="outline" className="text-[10px] text-blue-400 bg-blue-500/10 border-blue-500/30 font-medium">
                        {t("prompt.part3Badge", { count: computedSpecs.length })}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("prompt.part3Desc")}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-3.5 space-y-4">
                  {/* Interactive Spec Builder Form or Add Button */}
                  {!isAddingSpec ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingSpec(true)}
                      className="w-full py-5 border-dashed border-border/80 hover:border-primary/50 hover:bg-muted/30 text-xs font-semibold gap-2 text-foreground transition-all duration-200"
                    >
                      <PlusCircle className="w-4 h-4 text-primary" />
                      <span>{t("prompt.addSpecTitle")}</span>
                    </Button>
                  ) : (
                    <div className="p-3.5 rounded-lg border border-primary/30 bg-muted/20 space-y-3.5 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <PlusCircle className="w-3.5 h-3.5 text-primary" />
                          <span>{t("prompt.addSpecTitle")}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground italic font-mono hidden sm:inline">
                            ej: sumar_variables = output_1 + output_2
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetNewSpecForm}
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Spec Name */}
                        <div className="space-y-1">
                          <Label htmlFor="spec-name" className="text-xs font-medium text-foreground">
                            {t("prompt.specNameLabel")}
                          </Label>
                          <Input
                            id="spec-name"
                            value={newSpecName}
                            onChange={(e) => setNewSpecName(e.target.value)}
                            placeholder={t("prompt.specNamePlaceholder")}
                            className="text-xs h-8 font-mono bg-background/80"
                          />
                        </div>

                        {/* Spec Function */}
                        <div className="space-y-1">
                          <Label htmlFor="spec-function" className="text-xs font-medium text-foreground">
                            {t("prompt.specFunctionLabel")}
                          </Label>
                          <Select value={newSpecFunction} onValueChange={handleFunctionChange}>
                            <SelectTrigger id="spec-function" className="h-8 text-xs bg-background/80">
                              <SelectValue placeholder="Selecciona función" />
                            </SelectTrigger>
                            <SelectContent className="glass-panel text-xs max-h-64">
                              {/* Clásicas */}
                              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {t("prompt.functionGroupClassic")}
                              </div>
                              <SelectItem value="suma">{t("prompt.fnSuma")}</SelectItem>
                              <SelectItem value="resta">{t("prompt.fnResta")}</SelectItem>
                              <SelectItem value="multiplicacion">{t("prompt.fnMultiplicacion")}</SelectItem>
                              <SelectItem value="division">{t("prompt.fnDivision")}</SelectItem>
                              <SelectItem value="promedio">{t("prompt.fnPromedio")}</SelectItem>
                              <SelectItem value="diff">{t("prompt.fnDiff")}</SelectItem>
                              <SelectItem value="abs">{t("prompt.fnAbs")}</SelectItem>
                              <SelectItem value="min">{t("prompt.fnMin")}</SelectItem>
                              <SelectItem value="max">{t("prompt.fnMax")}</SelectItem>

                              {/* Metodológicas */}
                              <div className="px-2 py-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border/50">
                                {t("prompt.functionGroupMethodology")}
                              </div>
                              <SelectItem value="nss">{t("prompt.fnNss")}</SelectItem>
                              <SelectItem value="internal_consistency">{t("prompt.fnInternalConsistency")}</SelectItem>
                              <SelectItem value="rule_consistency">{t("prompt.fnRuleConsistency")}</SelectItem>
                              <SelectItem value="verbatim_faithfulness">{t("prompt.fnVerbatimFaithfulness")}</SelectItem>
                              <SelectItem value="tolerance_match">{t("prompt.fnToleranceMatch")}</SelectItem>

                              {/* Custom */}
                              <div className="px-2 py-1 mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border/50">
                                {t("prompt.functionGroupCustom")}
                              </div>
                              <SelectItem value="custom_expr">{t("prompt.fnCustomExpr")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Arguments Selector (Outputs or Specs anteriores para encadenar) */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-foreground block">
                          {t("prompt.specArgsLabel")}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          {t("prompt.specArgsHelp")}
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {availableSpecArgumentCandidates.map((cand) => {
                            const isSelected = newSpecArgs.includes(cand.name);
                            const getStyle = () => {
                              if (isSelected) {
                                switch (cand.type) {
                                  case "output":
                                    return "bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold shadow-sm";
                                  case "context":
                                    return "bg-purple-500/20 text-purple-300 border-purple-500/50 font-bold shadow-sm";
                                  case "id":
                                    return "bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold shadow-sm";
                                  case "input":
                                    return "bg-blue-500/20 text-blue-300 border-blue-500/50 font-bold shadow-sm";
                                  case "spec_col":
                                    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold shadow-sm";
                                  case "spec":
                                    return "bg-purple-500/20 text-purple-300 border-purple-500/50 font-bold shadow-sm";
                                }
                              }
                              switch (cand.type) {
                                case "output":
                                  return "bg-background/80 text-foreground border-border hover:bg-muted/40";
                                case "context":
                                  return "bg-purple-950/20 text-purple-400 border-purple-800/40 hover:bg-purple-900/30";
                                case "id":
                                  return "bg-amber-950/20 text-amber-400 border-amber-800/40 hover:bg-amber-900/30";
                                case "input":
                                  return "bg-blue-950/20 text-blue-400 border-blue-800/40 hover:bg-blue-900/30";
                                case "spec_col":
                                  return "bg-emerald-950/20 text-emerald-400 border-emerald-800/40 hover:bg-emerald-900/30";
                                case "spec":
                                  return "bg-purple-950/20 text-purple-400 border-purple-800/40 hover:bg-purple-900/30";
                              }
                            };

                            const renderIcon = () => {
                              switch (cand.type) {
                                case "output":
                                  return <Zap className="w-3 h-3 text-amber-400" />;
                                case "context":
                                  return <Layers className="w-3 h-3 text-purple-400" />;
                                case "id":
                                  return <Key className="w-3 h-3 text-amber-400" />;
                                case "input":
                                  return <FileText className="w-3 h-3 text-blue-400" />;
                                case "spec_col":
                                  return <Calculator className="w-3 h-3 text-emerald-400" />;
                                case "spec":
                                  return <FunctionSquare className="w-3 h-3 text-purple-400" />;
                              }
                            };

                            return (
                              <button
                                key={`${cand.type}-${cand.name}`}
                                type="button"
                                onClick={() => toggleArgumentForNewSpec(cand.name)}
                                className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border transition-all ${getStyle()}`}
                                title={`${cand.name} (${cand.badge})`}
                              >
                                {renderIcon()}
                                <span>{cand.name}</span>
                                <span className="text-[9px] px-1 py-0 bg-background/50 font-sans rounded opacity-80 uppercase tracking-wider">
                                  {cand.badge}
                                </span>
                                {isSelected && <span className="text-xs font-bold">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Formula Preview & Editable Free Expression */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            <Calculator className="w-3.5 h-3.5 text-primary" />
                            <span>Fórmula Matemática Sugerida / Editable</span>
                            {isFormulaManuallyEdited && (
                              <Badge variant="outline" className="text-[9px] font-mono py-0 text-amber-400 border-amber-500/30">
                                Personalizada
                              </Badge>
                            )}
                          </Label>
                          {isFormulaManuallyEdited && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsFormulaManuallyEdited(false);
                                setNewSpecCustomExpr(generateDefaultFormula(newSpecFunction, newSpecArgs));
                              }}
                              className="text-[11px] text-primary hover:underline font-mono flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restaurar sugerencia</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Input
                            id="spec-expression"
                            value={newSpecCustomExpr || generateDefaultFormula(newSpecFunction, newSpecArgs)}
                            onChange={(e) => {
                              setIsFormulaManuallyEdited(true);
                              setNewSpecCustomExpr(e.target.value);
                            }}
                            placeholder={generateDefaultFormula(newSpecFunction, newSpecArgs) || "Escribe fórmula libre (ej. (a - b) / max(a + b, 1))"}
                            className="text-xs h-8 font-mono bg-background/80"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Puedes editar libremente la expresión sugerida, cambiar variables o añadir ponderaciones como <code className="text-foreground font-mono">0.7 * a - 0.3 * b</code>.
                          </p>
                        </div>
                      </div>

                      {/* Description or Hypothesis */}
                      <div className="space-y-1">
                        <Label htmlFor="spec-desc" className="text-xs font-medium text-muted-foreground">
                          {t("prompt.specDescLabel")}
                        </Label>
                        <Input
                          id="spec-desc"
                          value={newSpecDesc}
                          onChange={(e) => setNewSpecDesc(e.target.value)}
                          placeholder={t("prompt.specDescPlaceholder")}
                          className="text-xs h-8 bg-background/80"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={resetNewSpecForm}
                          className="text-xs h-8 px-3 text-muted-foreground hover:text-foreground"
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          onClick={handleAddComputedSpec}
                          disabled={!newSpecName.trim()}
                          className="text-xs font-semibold gap-1.5 bg-primary text-primary-foreground h-8 px-4"
                        >
                          {editingSpecIndex !== null ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Guardar Cambios</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>{t("prompt.addSpecBtn")}</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* List of Configured Evaluation Specs */}
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      {t("prompt.configuredSpecsTitle", { count: computedSpecs.length })}
                    </Label>

                    {computedSpecs.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-border/80 text-center space-y-1 bg-muted/10">
                        <p className="text-xs text-muted-foreground font-medium">
                          {t("prompt.noSpecsConfigured")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {computedSpecs.map((spec, idx) => (
                          <div
                            key={spec.name}
                            className="p-3 rounded-lg border border-border bg-card/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/20 transition-all"
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-mono text-muted-foreground font-bold">
                                  #{idx + 1}
                                </span>
                                <span className="text-xs font-bold font-mono text-foreground flex items-center gap-1">
                                  <FunctionSquare className="w-3.5 h-3.5 text-primary" />
                                  <span>{spec.name}</span>
                                </span>
                                <Badge variant="outline" className="text-[10px] font-mono py-0 bg-background/80">
                                  {spec.function}
                                </Badge>
                                {spec.expression && (
                                  <Badge variant="secondary" className="text-[10px] font-mono py-0 text-primary">
                                    {spec.expression}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>Args:</span>
                                {spec.arguments.map((arg) => (
                                  <span key={arg} className="px-1.5 py-0 rounded bg-muted font-mono text-[10px] text-foreground">
                                    {arg}
                                  </span>
                                ))}
                                {spec.description && (
                                  <span className="italic ml-1 opacity-80">
                                    — {spec.description}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditComputedSpec(idx)}
                                className="h-7 px-2.5 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10 gap-1 transition-colors shadow-none"
                                title="Editar especificación"
                              >
                                <Pencil className="w-3 h-3 text-primary" />
                                <span>Editar</span>
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteComputedSpec(spec.name)}
                                className="h-7 px-2.5 text-xs font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/60 gap-1.5 shrink-0 transition-colors shadow-none"
                                title={t("prompt.deleteSpecConfirm")}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                <span>{t("common.delete") || "Eliminar"}</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: Metric Catalog with [fx] Inspector */}
            <TabsContent value="catalog" className="p-4 flex-1 m-0 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FunctionSquare className="w-4 h-4 text-primary" />
                    <span>{t("prompt.catalogHeaderTitle")}</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {t("prompt.catalogHeaderDesc")}
                  </p>
                </div>
              </div>

              <ScrollArea className="h-[520px] pr-3 space-y-4">
                <div className="space-y-3">
                  {METRIC_CATALOG.map((m) => {
                    const active = isMetricActive(m.id);
                    const metricName = t(`metricCatalog.${m.id}.name`) !== `metricCatalog.${m.id}.name` ? t(`metricCatalog.${m.id}.name`) : m.name;
                    const metricCat = t(`metricCatalog.${m.id}.categoryLabel`) !== `metricCatalog.${m.id}.categoryLabel` ? t(`metricCatalog.${m.id}.categoryLabel`) : m.categoryLabel;
                    const metricDesc = t(`metricCatalog.${m.id}.shortDesc`) !== `metricCatalog.${m.id}.shortDesc` ? t(`metricCatalog.${m.id}.shortDesc`) : m.shortDesc;
                    const boundVars = getEffectiveBindingsForMetric(m.id);
                    const candidateMap = new Map(availableSpecArgumentCandidates.map((c) => [c.name, c]));
                    if (selectedGroundTruth && selectedGroundTruth !== "none" && !candidateMap.has(selectedGroundTruth)) {
                      candidateMap.set(selectedGroundTruth, {
                        name: selectedGroundTruth,
                        type: "spec_col",
                        badge: "ground truth",
                      });
                    }
                    const allCandidates = Array.from(candidateMap.values());
                    const unselectedCandidates = allCandidates.filter((c) => !boundVars.includes(c.name));

                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-sm border transition-all space-y-3 ${
                          active
                            ? "bg-muted/40 border-primary/40"
                            : "bg-card border-border hover:bg-muted/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground">{metricName}</span>
                              <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 bg-background/80">
                                {m.id}
                              </Badge>
                              <Badge variant="secondary" className="text-[9px] py-0">
                                {metricCat}
                              </Badge>
                              {active && (
                                <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-primary/40 text-primary bg-primary/5">
                                  {boundVars.length} {boundVars.length === 1 ? "variable vinculada" : "variables vinculadas"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {metricDesc}
                            </p>
                            {!active && boundVars.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  Se aplicará sobre variables del spec:
                                </span>
                                {boundVars.slice(0, 5).map((v) => (
                                  <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted/60 border border-border text-muted-foreground">
                                    {v}
                                  </span>
                                ))}
                                {boundVars.length > 5 && (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    +{boundVars.length - 5} más
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenMetricModal(m)}
                              className="h-7 px-2.5 text-xs font-mono font-semibold gap-1 text-primary border border-border/70 hover:bg-muted"
                            >
                              <FunctionSquare className="w-3.5 h-3.5" />
                              <span>{t("prompt.fxFormulaButton")}</span>
                            </Button>

                            <Switch
                              checked={active}
                              onCheckedChange={() => toggleMetric(m.id)}
                              aria-label={`Activar métrica ${m.name}`}
                            />
                          </div>
                        </div>

                        {active && (
                          <div className="pt-2.5 border-t border-border/70 space-y-2.5 bg-background/50 p-2.5 rounded-sm">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                                <Sliders className="w-3 h-3 text-primary" />
                                <span>
                                  {m.parameterSlots
                                    ? t("linterExtra.formulaParamsLabel")
                                    : "Variables del Spec sobre las que se aplica esta métrica:"}
                                </span>
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResetMetricVariables(m.id)}
                                className="h-6 px-2 text-[10px] text-primary hover:text-primary/80 gap-1"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Restablecer según Spec</span>
                              </Button>
                            </div>

                            {m.parameterSlots && m.parameterSlots.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {m.parameterSlots.map((slot) => {
                                  const slotBindings = getEffectiveSlotBindings(m.id);
                                  const selectedForSlot = slotBindings[slot.key] || [];
                                  const slotCandidates = allCandidates.filter(
                                    (c) => !slot.allowedTypes || slot.allowedTypes.includes(c.type)
                                  );
                                  const specialOpts = slot.specialOptions || [];

                                  if (!slot.multiple) {
                                    const currentVal = selectedForSlot[0] || "";
                                    return (
                                      <div key={slot.key} className="space-y-1 p-2 rounded-sm border border-border/70 bg-card/60">
                                        <Label className="text-[10px] font-semibold text-muted-foreground block">
                                          {slot.label}
                                        </Label>
                                        <Select
                                          value={currentVal}
                                          onValueChange={(val) => handleSetMetricSlotVariable(m.id, slot.key, val, false)}
                                        >
                                          <SelectTrigger className="h-7 text-[11px] font-mono bg-background border-border">
                                            <SelectValue placeholder="Seleccionar variable..." />
                                          </SelectTrigger>
                                          <SelectContent className="text-xs font-mono">
                                            {specialOpts.map((opt) => (
                                              <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                                                {opt.label}
                                              </SelectItem>
                                            ))}
                                            {slotCandidates.map((cand) => (
                                              <SelectItem key={cand.name} value={cand.name} className="text-xs font-mono">
                                                {cand.name} ({cand.badge})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    );
                                  }

                                  const unselectedSlotCands = slotCandidates.filter(
                                    (c) => !selectedForSlot.includes(c.name)
                                  );
                                  return (
                                    <div key={slot.key} className="space-y-1.5 p-2 rounded-sm border border-border/70 bg-card/60">
                                      <Label className="text-[10px] font-semibold text-muted-foreground block">
                                        {slot.label}
                                      </Label>
                                      <div className="flex flex-wrap gap-1">
                                        {selectedForSlot.map((vName) => (
                                          <Badge
                                            key={vName}
                                            variant="secondary"
                                            className="text-[10px] font-mono py-0 px-1.5 gap-1 bg-background border border-primary/30 text-foreground"
                                          >
                                            <span>{vName}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleSetMetricSlotVariable(m.id, slot.key, vName, true)}
                                              className="text-muted-foreground hover:text-destructive cursor-pointer"
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                      {unselectedSlotCands.length > 0 && (
                                        <Select
                                          value=""
                                          onValueChange={(val) => {
                                            if (val) handleSetMetricSlotVariable(m.id, slot.key, val, true);
                                          }}
                                        >
                                          <SelectTrigger className="h-7 text-[11px] font-mono bg-background border-border">
                                            <SelectValue placeholder="Añadir variable..." />
                                          </SelectTrigger>
                                          <SelectContent className="text-xs font-mono">
                                            {unselectedSlotCands.map((cand) => (
                                              <SelectItem key={cand.name} value={cand.name} className="text-xs font-mono">
                                                {cand.name} ({cand.badge})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                            {boundVars.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {boundVars.map((vName) => {
                                  const meta = candidateMap.get(vName);
                                  return (
                                    <Badge
                                      key={vName}
                                      variant="secondary"
                                      className="text-[11px] font-mono py-0.5 px-2 gap-1.5 bg-background border border-primary/30 text-foreground"
                                    >
                                      <span>{vName}</span>
                                      {meta && (
                                        <span className="text-[9px] px-1 py-0 rounded-sm bg-muted text-muted-foreground font-sans uppercase">
                                          {meta.badge}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleMetricVariable(m.id, vName)}
                                        className="text-muted-foreground hover:text-destructive cursor-pointer ml-0.5"
                                        title={`Desvincular ${vName}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </Badge>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                                Ninguna variable seleccionada. Selecciona a continuación las variables del spec sobre las que aplicar {metricName}.
                              </p>
                            )}

                            {unselectedCandidates.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <div className="flex items-center gap-2 max-w-md">
                                  <Select
                                    value=""
                                    onValueChange={(val) => {
                                      if (val) handleToggleMetricVariable(m.id, val);
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-[11px] font-mono bg-background border-border">
                                      <SelectValue placeholder="Añadir variable definida en el spec..." />
                                    </SelectTrigger>
                                    <SelectContent className="text-xs font-mono">
                                      {unselectedCandidates.map((cand) => (
                                        <SelectItem key={cand.name} value={cand.name} className="text-xs font-mono">
                                          {cand.name} ({cand.badge})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground mr-1">
                                    Variables disponibles en el spec:
                                  </span>
                                  {unselectedCandidates.map((cand) => (
                                    <button
                                      key={cand.name}
                                      type="button"
                                      onClick={() => handleToggleMetricVariable(m.id, cand.name)}
                                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border border-dashed border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-1"
                                      title={`Vincular variable ${cand.name} (${cand.badge})`}
                                    >
                                      <Plus className="w-2.5 h-2.5 text-primary" />
                                      <span>{cand.name}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* TAB 3: Custom Metric Creator */}
            <TabsContent value="custom" className="p-4 flex-1 m-0 space-y-4">
              <div className="space-y-1 pb-2 border-b border-border/50">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-primary" />
                  <span>{t("prompt.customTitle")}</span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {t("prompt.customDesc")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="custom-name" className="text-xs font-medium text-foreground">
                    {t("prompt.customNameLabel")}
                  </Label>
                  <Input
                    id="custom-name"
                    value={customMetricName}
                    onChange={(e) => setCustomMetricName(e.target.value)}
                    placeholder={t("prompt.customNamePlaceholder")}
                    className="text-xs h-9 bg-background/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-id" className="text-xs font-medium text-foreground">
                    {t("prompt.customIdLabel")}
                  </Label>
                  <Input
                    id="custom-id"
                    value={customMetricId}
                    onChange={(e) => setCustomMetricId(e.target.value)}
                    placeholder={t("prompt.customIdPlaceholder")}
                    className="text-xs h-9 font-mono bg-background/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-type" className="text-xs font-medium text-foreground">
                    {t("prompt.customTypeLabel")}
                  </Label>
                  <Select value={customMetricType} onValueChange={setCustomMetricType}>
                    <SelectTrigger id="custom-type" className="h-9 text-xs bg-background/60">
                      <SelectValue placeholder={t("prompt.customTypePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="glass-panel text-xs">
                      <SelectItem value="regex_rule">{t("prompt.customTypeRegex")}</SelectItem>
                      <SelectItem value="numeric_tolerance">{t("prompt.customTypeNumeric")}</SelectItem>
                      <SelectItem value="categorical_agreement">{t("prompt.customTypeAgreement")}</SelectItem>
                      <SelectItem value="schema_validation">{t("prompt.customTypeSchema")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-formula" className="text-xs font-medium text-foreground">
                    {t("prompt.customFormulaLabel")}
                  </Label>
                  <Input
                    id="custom-formula"
                    value={customMetricFormula}
                    onChange={(e) => setCustomMetricFormula(e.target.value)}
                    placeholder={t("prompt.customFormulaPlaceholder")}
                    className="text-xs h-9 font-mono bg-background/60"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-desc" className="text-xs font-medium text-muted-foreground">
                  {t("prompt.customHypothesisLabel")}
                </Label>
                <Input
                  id="custom-desc"
                  value={customMetricDesc}
                  onChange={(e) => setCustomMetricDesc(e.target.value)}
                  placeholder={t("prompt.customHypothesisPlaceholder")}
                  className="text-xs h-9 bg-background/60"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={handleAddCustomMetric}
                  className="text-xs font-semibold gap-1.5 bg-primary text-primary-foreground h-9 px-4"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t("prompt.addCustomMetricButton")}</span>
                </Button>
              </div>
            </TabsContent>

            {/* TAB 4: Raw YAML Editor (for manual/advanced tweaking) */}
            <TabsContent value="raw_yaml" className="p-4 flex-1 m-0 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-primary" />
                    <Label htmlFor="template-raw-yaml" className="cursor-pointer font-semibold text-foreground">
                      {t("prompt.rawYamlTab")}
                    </Label>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Visualiza y ajusta la plantilla completa compuesta en YAML y bloques de salida.
                  </p>
                </div>
              </div>
              <Textarea
                id="template-raw-yaml"
                value={template}
                onChange={handleRawTemplateChange}
                rows={18}
                aria-label={t("prompt.rawYamlTab")}
                className="w-full p-3.5 text-xs font-mono bg-background/60 border-border/80 focus:ring-primary/20 resize-y leading-relaxed"
                placeholder={t("prompt.templatePlaceholder")}
              />
            </TabsContent>

            {/* TAB 5: Live Preview */}
            <TabsContent value="preview" className="p-4 flex-1 m-0">
              <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {t("prompt.previewHeader")}
                  </span>
                </div>
              </div>
              <ScrollArea className="h-[460px] w-full rounded-xl border border-border/60 bg-muted/30 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                  {validation?.preview_rendered || t("prompt.previewLoading")}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Right Column: Linter & Coherence Feedback */}
        <Card className="neo-panel border-border shadow-spatial p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{t("prompt.linterTitle")}</span>
              </h4>
              {isValidating ? (
                <Badge variant="outline" className="text-[10px] animate-pulse text-muted-foreground">
                  {t("prompt.linterAnalyzing")}
                </Badge>
              ) : !validation?.is_valid ? (
                <Badge variant="outline" className="text-[11px] font-bold text-destructive bg-destructive/10 border-destructive/30 gap-1">
                  <AlertCircle className="w-3 h-3" /> {t("prompt.linterIncoherent")}
                </Badge>
              ) : unusedPromptVars.length > 0 || unusedSpecVars.length > 0 || validation?.issues?.some((i) => i.severity === "warning") ? (
                <Badge variant="outline" className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t("linterExtra.warningsBadge")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {t("prompt.linterCoherent")}
                </Badge>
              )}
            </div>

            {/* Variables & Ground Truth Summary */}
            <div className="bg-muted/30 p-3 rounded-xl border border-border/40 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("prompt.outputFormat")}</span>
                <span className="font-mono font-bold text-primary">
                  {validation?.output_format === "json"
                    ? t("prompt.formatStrictJson")
                    : validation?.output_format === "structured_blocks"
                    ? t("prompt.formatStructuredBlocks")
                    : t("prompt.formatNumericDirect")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("prompt.inputVariables")}</span>
                <span className="font-mono font-semibold">{validation?.detected_variables.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("prompt.missingVariables")}</span>
                <span className={`font-mono font-semibold ${validation?.missing_variables.length ? "text-destructive" : "text-emerald-500"}`}>
                  {validation?.missing_variables.length || 0}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border/30">
                <span className="text-muted-foreground">{t("prompt.evaluationMode")}</span>
                <span className="font-semibold text-[11px] text-foreground">
                  {validation?.has_ground_truth
                    ? t("prompt.modeGroundTruth", { col: validation.ground_truth_col || "" })
                    : t("prompt.modeConsensus")}
                </span>
              </div>
            </div>

            {/* Issue List: 2 Elements (1. Prompt Coherence, 2. SPEC Variables Usage) */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                {t("prompt.automatedChecks")}
              </Label>

              {/* Elemento 1: Validez y coherencia del prompt */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>{t("linterExtra.check1Title")}</span>
                </div>

                {validation?.issues.length === 0 && unusedPromptVars.length === 0 && (
                  <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <AlertTitle className="text-xs font-bold">{t("prompt.checksSuccessTitle")}</AlertTitle>
                    <AlertDescription className="text-[11px] opacity-80 mt-0.5">
                      {t("prompt.checksSuccessDesc")}
                    </AlertDescription>
                  </Alert>
                )}

                {unusedPromptVars.length > 0 && (
                  <Alert className="py-2 text-xs bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <AlertTitle className="text-xs font-semibold ml-2">
                      {t("linterExtra.unusedPromptTitle")}
                    </AlertTitle>
                    <AlertDescription className="text-[11px] opacity-90 mt-1 ml-2">
                      {t("linterExtra.unusedPromptDesc")}{" "}
                      <span className="font-mono font-semibold">
                        {unusedPromptVars.map((v) => `{${v}}`).join(", ")}
                      </span>
                    </AlertDescription>
                  </Alert>
                )}

                {validation?.issues.map((issue, idx) => {
                  const isError = issue.severity === "error";
                  const isWarning = issue.severity === "warning";

                  return (
                    <Alert
                      key={idx}
                      variant={isError ? "destructive" : "default"}
                      className={`py-2 text-xs ${
                        isWarning ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" : ""
                      }`}
                    >
                      {isError ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Info className="w-4 h-4 text-primary" />
                      )}
                      <AlertTitle className="text-xs font-medium ml-2">{issue.message}</AlertTitle>
                      {issue.suggestion && (
                        <AlertDescription className="text-[11px] opacity-80 mt-1 italic font-mono ml-2">
                          {issue.suggestion}
                        </AlertDescription>
                      )}
                    </Alert>
                  );
                })}
              </div>

              {/* Elemento 2: Uso de variables de tipo SPEC */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>{t("linterExtra.check2Title")}</span>
                </div>

                {specColumns.length === 0 ? (
                  <Alert className="py-2 text-xs bg-muted/40 border-border/50 text-muted-foreground">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <AlertTitle className="text-xs font-medium ml-2">
                      {t("linterExtra.noSpecsDeclared")}
                    </AlertTitle>
                  </Alert>
                ) : unusedSpecVars.length > 0 ? (
                  <Alert className="py-2 text-xs bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <AlertTitle className="text-xs font-semibold ml-2">
                      {t("linterExtra.unusedSpecTitle")}
                    </AlertTitle>
                    <AlertDescription className="text-[11px] opacity-90 mt-1 ml-2">
                      {t("linterExtra.unusedSpecDesc")}{" "}
                      <span className="font-mono font-semibold">{unusedSpecVars.join(", ")}</span>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <AlertTitle className="text-xs font-bold">{t("linterExtra.allSpecsUsed")}</AlertTitle>
                    <AlertDescription className="text-[11px] opacity-80 mt-0.5 font-mono">
                      {specColumns.join(", ")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/40 text-[11px] text-muted-foreground leading-relaxed">
            💡 {t("prompt.extensibilityTip")}
          </div>
        </Card>
      </div>

      {/* Scientific Formula & Citation Modal */}
      {isFormulaModalOpen && (
        <React.Suspense fallback={null}>
          <MetricFormulaModal
            metric={selectedMetricModal}
            isOpen={isFormulaModalOpen}
            onClose={() => setIsFormulaModalOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};
