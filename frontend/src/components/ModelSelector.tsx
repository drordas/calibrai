import React, { useState, useEffect } from "react";
import {
  ModelCatalogItem,
  DatasetSummary,
  ContextCalculationResponse,
  DetectVramResponse,
} from "../types";
import { useTranslation } from "../i18n";
import {
  Cpu,
  Cloud,
  Check,
  Server,
  Key,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  HardDrive,
  Gauge,
  Info,
  ShieldAlert,
  Sliders,
  AlertTriangle,
  Zap,
  Thermometer,
} from "lucide-react";
import {
  discoverLocalModels,
  discoverRemoteModels,
  updateUserConfig,
  detectSystemVram,
  calculateContextSize,
} from "../services/api";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface ModelSelectorProps {
  availableModels: ModelCatalogItem[];
  setAvailableModels?: React.Dispatch<React.SetStateAction<ModelCatalogItem[]>>;
  selectedModelIds: string[];
  setSelectedModelIds: (ids: string[]) => void;
  modelTemperatures?: Record<string, number>;
  setModelTemperatures?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  sampleSize: number;
  setSampleSize: (size: number) => void;
  maxSamples: number;
  batchSize?: number;
  setBatchSize?: (size: number) => void;
  apiKeys: Record<string, string>;
  setApiKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onStartBenchmark: () => void;
  isRunning: boolean;
  selectedDataset?: DatasetSummary | null;
  inputTextColumns?: string[];
  contextColumns?: string[];
  template?: string;
  systemPrompt?: string;
  taskType?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  availableModels,
  setAvailableModels,
  selectedModelIds,
  setSelectedModelIds,
  modelTemperatures,
  setModelTemperatures,
  sampleSize,
  setSampleSize,
  maxSamples,
  batchSize = 1,
  setBatchSize,
  apiKeys,
  setApiKeys,
  selectedDataset,
  inputTextColumns = [],
  contextColumns = [],
  template = "",
  systemPrompt = "",
  taskType = "numeric_math",
}) => {
  const { t } = useTranslation();
  // Ollama Temperature state (bulk vs individual)
  const [isSameOllamaTemp, setIsSameOllamaTemp] = useState<boolean>(true);
  const [commonOllamaTemp, setCommonOllamaTemp] = useState<number>(0.8);

  // Mode for adding models on demand: "local" | "cloud" | "simulated"
  const [activeAddTab, setActiveAddTab] = useState<"local" | "cloud" | "simulated">("local");

  const simulatedModels: ModelCatalogItem[] = [
    {
      id: "sim/evaluador-rapido",
      name: t("models.simQuickEvalName"),
      provider: "sim",
      is_local: true,
      is_available: true,
      context_window: 128000,
      cost_per_million_input: 0.0,
      cost_per_million_output: 0.0,
      description: t("models.simQuickEvalDesc"),
    },
    {
      id: "sim/llama3-sim",
      name: t("models.simLlamaName"),
      provider: "sim",
      is_local: true,
      is_available: true,
      context_window: 128000,
      cost_per_million_input: 0.0,
      cost_per_million_output: 0.0,
      description: t("models.simLlamaDesc"),
    },
    {
      id: "sim/gpt4o-sim",
      name: t("models.simGptName"),
      provider: "sim",
      is_local: true,
      is_available: true,
      context_window: 128000,
      cost_per_million_input: 0.0,
      cost_per_million_output: 0.0,
      description: t("models.simGptDesc"),
    },
  ];

  // Local Ollama discovery states (default empty per user requirement)
  const [ollamaUrl, setOllamaUrl] = useState<string>("");
  const [discoveringLocal, setDiscoveringLocal] = useState<boolean>(false);
  const [localDiscoveredModels, setLocalDiscoveredModels] = useState<ModelCatalogItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccessMsg, setLocalSuccessMsg] = useState<string | null>(null);

  // Preset VRAM sizes (GB)
  const VRAM_PRESETS = [6, 8, 12, 16, 24, 32, 48, 80];

  // VRAM & Context Sizing States
  const [systemVramGb, setSystemVramGb] = useState<number>(() => {
    const saved = apiKeys["system_vram_gb"];
    if (saved && !isNaN(parseFloat(saved))) {
      return parseFloat(saved);
    }
    return 16;
  });
  const [isDetectingVram, setIsDetectingVram] = useState<boolean>(false);
  const [detectedVramInfo, setDetectedVramInfo] = useState<DetectVramResponse | null>(null);

  // Context Calculation State
  const [contextCalc, setContextCalc] = useState<ContextCalculationResponse | null>(null);
  const [isCalculatingContext, setIsCalculatingContext] = useState<boolean>(false);
  const [requiredContextTokens, setRequiredContextTokens] = useState<number>(2048);

  // 1. Calculate required context size based on fixed prompt (system + user template) + longest injected row + completion margin
  useEffect(() => {
    let isMounted = true;
    if (selectedDataset?.id) {
      setIsCalculatingContext(true);
      const combinedTemplate = systemPrompt ? `${systemPrompt}\n\n${template || ""}` : (template || "");
      calculateContextSize({
        dataset_id: selectedDataset.id,
        input_columns: inputTextColumns,
        context_columns: contextColumns,
        template: combinedTemplate,
        completion_tokens: 512,
      })
        .then((res) => {
          if (isMounted) {
            setContextCalc(res);
            setRequiredContextTokens(res.required_context_tokens);
          }
        })
        .catch((err) => {
          console.warn("Context calculation fallback used:", err);
        })
        .finally(() => {
          if (isMounted) setIsCalculatingContext(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedDataset?.id, inputTextColumns, contextColumns, template, systemPrompt]);

  // 2. Autodetect System VRAM
  const handleDetectVram = async (targetUrl?: string) => {
    setIsDetectingVram(true);
    try {
      const urlToUse = targetUrl || ollamaUrl;
      const res = await detectSystemVram(urlToUse);
      setDetectedVramInfo(res);
      if (res.detected && res.vram_gb && res.vram_gb > 0) {
        setSystemVramGb(res.vram_gb);
        const updated = { ...apiKeys, system_vram_gb: String(res.vram_gb) };
        setApiKeys(updated);
        updateUserConfig({ api_keys: updated }).catch(() => {});
      }
    } catch (err: any) {
      setDetectedVramInfo({
        detected: false,
        is_local: false,
        recommended_options: VRAM_PRESETS,
        message: err.message || t("models.gpuQueryErrorFallback"),
      });
    } finally {
      setIsDetectingVram(false);
    }
  };

  // 3. Set VRAM manually or via preset
  const handleSetVram = (vram: number) => {
    if (vram > 0) {
      setSystemVramGb(vram);
      const updated = { ...apiKeys, system_vram_gb: String(vram) };
      setApiKeys(updated);
      updateUserConfig({ api_keys: updated }).catch(() => {});
    }
  };

  // Helper to parse parameter billions
  const parseParameterBillions = (paramStr?: string, modelName: string = ""): number => {
    if (paramStr) {
      const clean = paramStr.toLowerCase().trim();
      const match = clean.match(/([\d.]+)\s*b/);
      if (match) return parseFloat(match[1]);
    }
    const nameMatch = modelName.toLowerCase().match(/(\d+)b/);
    if (nameMatch) return parseFloat(nameMatch[1]);
    return 7.0;
  };

  // Helper to compute VRAM requirement for a local model
  const computeModelVramRequirement = (
    model: ModelCatalogItem,
    contextTokens: number
  ) => {
    const sizeBytes = model.size_bytes || 0;
    let weightsGb = 0;
    if (sizeBytes > 0) {
      weightsGb = (sizeBytes / (1024 * 1024 * 1024)) * 1.05;
    } else if (model.estimated_vram_gb) {
      weightsGb = model.estimated_vram_gb * 0.8;
    } else {
      weightsGb = 4.5;
    }

    const paramB = parseParameterBillions(model.parameter_size, model.name || model.id);
    const paramFactor = Math.max(paramB, 3.0);
    // ~35KB per token per billion parameters for fp16 KV cache
    const kvCacheGb = contextTokens * paramFactor * 0.000035;
    const overheadGb = 0.6;
    const totalVramGb = Math.round((weightsGb + kvCacheGb + overheadGb) * 10) / 10;
    const fitsInVram = totalVramGb <= systemVramGb;

    return {
      weightsGb: Math.round(weightsGb * 10) / 10,
      kvCacheGb: Math.round(kvCacheGb * 10) / 10,
      overheadGb,
      totalVramGb,
      fitsInVram,
      paramB,
    };
  };

  // Attempt initial background VRAM detection on mount if ollamaUrl is configured
  useEffect(() => {
    if (ollamaUrl) {
      handleDetectVram(ollamaUrl);
    }
  }, []);

  // Cloud API discovery states
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<"openai" | "gemini" | "anthropic" | "groq">("openai");
  const [currentKeyInput, setCurrentKeyInput] = useState<string>(apiKeys["openai"] || "");
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [discoveringRemote, setDiscoveringRemote] = useState<boolean>(false);
  const [remoteDiscoveredModels, setRemoteDiscoveredModels] = useState<ModelCatalogItem[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteSuccessMsg, setRemoteSuccessMsg] = useState<string | null>(null);

  // Ensure any lingering proxy models are purged from selected models
  useEffect(() => {
    if (selectedModelIds.some(id => id.startsWith("ollama/") && (id.includes(":cloud") || id.includes("deepseek-v4")))) {
      setSelectedModelIds(selectedModelIds.filter(id => !(id.startsWith("ollama/") && (id.includes(":cloud") || id.includes("deepseek-v4")))));
    }
  }, [selectedModelIds, setSelectedModelIds]);

  // When switching cloud provider, sync the current key input with the stored key for that provider
  const handleSelectCloudProvider = (provider: "openai" | "gemini" | "anthropic" | "groq") => {
    setSelectedCloudProvider(provider);
    setCurrentKeyInput(apiKeys[provider] || "");
    setRemoteError(null);
    setRemoteSuccessMsg(null);
    setRemoteDiscoveredModels([]);
  };

  // 1. Discover Local Models
  const handleDiscoverLocal = async () => {
    if (!ollamaUrl.trim()) {
      setLocalError("Introduce la URL del servidor Ollama antes de detectar modelos.");
      return;
    }
    setDiscoveringLocal(true);
    setLocalError(null);
    setLocalSuccessMsg(null);
    try {
      const res = await discoverLocalModels(ollamaUrl);
      if (res.is_online && res.models.length > 0) {
        setLocalDiscoveredModels(res.models);
        const excludedNote = (res.excluded_remote_models && res.excluded_remote_models > 0)
          ? ` (${res.excluded_remote_models} modelos remotos/cloud tipo proxy fueron excluidos para asegurar ejecución estrictamente local)`
          : "";
        setLocalSuccessMsg(`Servidor conectado en ${res.resolved_url}. Se encontraron ${res.models.length} modelos instalados localmente en disco${excludedNote}.`);
        
        // Save verified ollama URL
        const updatedKeys = { ...apiKeys, ollama_url: res.resolved_url || ollamaUrl };
        setApiKeys(updatedKeys);
        updateUserConfig({ ollama_url: res.resolved_url || ollamaUrl, api_keys: updatedKeys }).catch(() => {});

        // Autodetect VRAM for this host
        handleDetectVram(res.resolved_url || ollamaUrl);

        // Merge into availableModels if not present, pruning non-local ollama items
        if (setAvailableModels) {
          setAvailableModels((prev) => {
            const cleanPrev = prev.filter(m => !(m.provider === "ollama" && (m.id.includes(":cloud") || !m.is_local)));
            const existingIds = new Set(cleanPrev.map((m) => m.id));
            const newItems = res.models.filter((m) => !existingIds.has(m.id));
            return [...cleanPrev, ...newItems];
          });
        }
      } else if (res.is_online && res.models.length === 0) {
        setLocalDiscoveredModels([]);
        const excludedNote = (res.excluded_remote_models && res.excluded_remote_models > 0)
          ? t("models.ollamaExcludedRemoteNote", { count: res.excluded_remote_models })
          : "";
        setLocalSuccessMsg(t("models.ollamaConnectedNoModels", { url: res.resolved_url, excludedNote }));
      } else {
        setLocalDiscoveredModels([]);
        setLocalError(res.error || t("models.ollamaConnectErrorAt", { url: ollamaUrl }));
      }
    } catch (err: any) {
      setLocalError(err.message || t("models.ollamaConnectErrorFallback"));
    } finally {
      setDiscoveringLocal(false);
    }
  };

  // 2. Discover Remote Models
  const handleDiscoverRemote = async () => {
    if (!currentKeyInput.trim()) {
      setRemoteError(t("models.enterApiKeyPrompt", { provider: selectedCloudProvider.toUpperCase() }));
      return;
    }

    setDiscoveringRemote(true);
    setRemoteError(null);
    setRemoteSuccessMsg(null);
    try {
      const res = await discoverRemoteModels(selectedCloudProvider, currentKeyInput.trim());
      if (res.is_valid && res.models.length > 0) {
        setRemoteDiscoveredModels(res.models);
        setRemoteSuccessMsg(t("models.credentialsVerifiedMsg", { provider: selectedCloudProvider.toUpperCase(), count: res.models.length }));
        
        // Save the valid key in state and user configuration
        const updatedKeys = { ...apiKeys, [selectedCloudProvider]: currentKeyInput.trim() };
        setApiKeys(updatedKeys);
        updateUserConfig({ api_keys: updatedKeys }).catch(() => {});

        // Merge into availableModels
        if (setAvailableModels) {
          setAvailableModels((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems = res.models.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newItems];
          });
        }
      } else {
        setRemoteDiscoveredModels([]);
        setRemoteError(res.error || t("models.couldNotFetchRemoteModels"));
      }
    } catch (err: any) {
      setRemoteError(err.message || t("models.verifyKeyErrorWithProvider", { provider: selectedCloudProvider.toUpperCase() }));
    } finally {
      setDiscoveringRemote(false);
    }
  };

  // Ollama Temperature helpers
  const handleCommonTempChange = (temp: number) => {
    setCommonOllamaTemp(temp);
    if (!setModelTemperatures) return;
    setModelTemperatures((prev) => {
      const updated = { ...prev };
      selectedModelIds.forEach((id) => {
        const details = getModelDetails(id);
        if (details.provider === "ollama") {
          updated[id] = temp;
        }
      });
      return updated;
    });
  };

  const handleModelTempChange = (modelId: string, temp: number) => {
    if (!setModelTemperatures) return;
    setModelTemperatures((prev) => ({
      ...prev,
      [modelId]: temp,
    }));
  };

  const handleToggleSameTemp = (same: boolean) => {
    setIsSameOllamaTemp(same);
    if (same && setModelTemperatures) {
      setModelTemperatures((prev) => {
        const updated = { ...prev };
        selectedModelIds.forEach((id) => {
          const details = getModelDetails(id);
          if (details.provider === "ollama") {
            updated[id] = commonOllamaTemp;
          }
        });
        return updated;
      });
    }
  };

  // Add a model to active experiment
  const addModelToExperiment = (model: ModelCatalogItem) => {
    if (!selectedModelIds.includes(model.id)) {
      setSelectedModelIds([...selectedModelIds, model.id]);
      if (model.provider === "ollama" && setModelTemperatures) {
        setModelTemperatures((prev) => ({
          ...prev,
          [model.id]: isSameOllamaTemp ? commonOllamaTemp : (prev[model.id] ?? 0.8),
        }));
      }
    }
    // Ensure it exists in availableModels so it displays cleanly everywhere
    if (setAvailableModels) {
      setAvailableModels((prev) => {
        if (!prev.some((m) => m.id === model.id)) {
          return [...prev, model];
        }
        return prev;
      });
    }
  };

  // Remove a model from active experiment
  const removeModelFromExperiment = (id: string) => {
    setSelectedModelIds(selectedModelIds.filter((m) => m !== id));
    if (setModelTemperatures) {
      setModelTemperatures((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  // Lookup model metadata from availableModels or discovered lists
  const getModelDetails = (id: string): ModelCatalogItem => {
    const found =
      availableModels.find((m) => m.id === id) ||
      localDiscoveredModels.find((m) => m.id === id) ||
      remoteDiscoveredModels.find((m) => m.id === id) ||
      simulatedModels.find((m) => m.id === id);

    if (found) return found;

    // Fallback if not found yet
    const isLocal = id.startsWith("ollama/");
    const provider = id.split("/")[0] || (isLocal ? "ollama" : "cloud");
    const name = id.split("/")[1] || id;
    return {
      id,
      name,
      provider,
      is_local: isLocal,
      is_available: true,
      context_window: 128000,
      cost_per_million_input: isLocal ? 0.0 : 0.5,
      cost_per_million_output: isLocal ? 0.0 : 1.5,
      description: isLocal ? t("models.localModelDesc") : t("models.cloudModelDesc"),
    };
  };

  // Dynamic calculation of maximum safe concurrent batch size based on selected models and VRAM
  const { maxBatchSize, bottleneckModelName, estimatedVramWithBatch } = React.useMemo(() => {
    const selectedLocalDetails = selectedModelIds
      .map((id) => getModelDetails(id))
      .filter((m) => m.is_local || m.provider === "ollama");

    if (selectedLocalDetails.length === 0) {
      // If only cloud or simulated models are selected, allow up to 10 parallel requests (or sampleSize)
      const cap = Math.min(10, Math.max(1, sampleSize));
      return {
        maxBatchSize: cap,
        bottleneckModelName: null,
        estimatedVramWithBatch: null,
      };
    }

    let minBatchCap = 32; // practical hardware limit
    let bottleneck = "";
    let maxWeights = 0;
    let maxKvPerStream = 0;

    for (const m of selectedLocalDetails) {
      const vramReq = computeModelVramRequirement(m, requiredContextTokens);
      if (!vramReq.fitsInVram) {
        // If a model doesn't even fit in sequential, batch size cannot be > 1
        return {
          maxBatchSize: 1,
          bottleneckModelName: m.name,
          estimatedVramWithBatch: vramReq.totalVramGb,
        };
      }
      const vramFree = Math.max(0, systemVramGb - vramReq.weightsGb - vramReq.overheadGb);
      const kvPerStream = Math.max(0.01, vramReq.kvCacheGb);
      const modelBatchLimit = Math.max(1, Math.floor(vramFree / kvPerStream));
      if (modelBatchLimit < minBatchCap) {
        minBatchCap = modelBatchLimit;
        bottleneck = m.name;
        maxWeights = vramReq.weightsGb;
        maxKvPerStream = kvPerStream;
      }
    }

    const finalMaxBatch = Math.max(1, Math.min(minBatchCap, sampleSize, 32));
    const estVram = maxWeights > 0
      ? Math.round((maxWeights + (batchSize * maxKvPerStream) + 0.6) * 10) / 10
      : null;

    return {
      maxBatchSize: finalMaxBatch,
      bottleneckModelName: bottleneck,
      estimatedVramWithBatch: estVram,
    };
  }, [selectedModelIds, systemVramGb, requiredContextTokens, sampleSize, batchSize, availableModels, localDiscoveredModels]);

  // Auto-clamp batchSize when maxBatchSize changes
  useEffect(() => {
    if (setBatchSize) {
      if (batchSize > maxBatchSize) {
        setBatchSize(maxBatchSize);
      } else if (batchSize < 1) {
        setBatchSize(1);
      }
    }
  }, [maxBatchSize, batchSize, setBatchSize]);

  const getProviderBadge = (provider: string, isLocal: boolean) => {
    if (isLocal || provider === "ollama") {
      return (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-mono gap-1">
          <Server className="w-3 h-3" />
          <span>Local (Ollama)</span>
        </Badge>
      );
    }
    if (provider === "openai") {
      return (
        <Badge variant="outline" className="bg-violet-500/15 text-violet-300 border-violet-500/30 text-[10px] font-mono gap-1">
          <Cloud className="w-3 h-3" />
          <span>OpenAI</span>
        </Badge>
      );
    }
    if (provider === "gemini") {
      return (
        <Badge variant="outline" className="bg-sky-500/15 text-sky-300 border-sky-500/30 text-[10px] font-mono gap-1">
          <Cloud className="w-3 h-3" />
          <span>Google Gemini</span>
        </Badge>
      );
    }
    if (provider === "anthropic") {
      return (
        <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] font-mono gap-1">
          <Cloud className="w-3 h-3" />
          <span>Anthropic Claude</span>
        </Badge>
      );
    }
    if (provider === "sim") {
      return (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] font-mono gap-1">
          <Sparkles className="w-3 h-3" />
          <span>{t("models.badgeSimTest")}</span>
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-500/15 text-orange-300 border-orange-500/30 text-[10px] font-mono gap-1">
        <Cloud className="w-3 h-3" />
        <span className="capitalize">{provider}</span>
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Execution Sample Size & Batch Concurrency Card */}
      <Card className="neo-panel border-border shadow-spatial p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">
                {t("models.title")}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              {t("models.subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              {t("models.sampleSizeLabel")}
            </Label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                type="button"
                variant={sampleSize === maxSamples ? "default" : "secondary"}
                onClick={() => setSampleSize(maxSamples)}
                className={`h-8 px-3 text-xs font-semibold transition-all ${
                  sampleSize === maxSamples ? "shadow-md shadow-primary/20 font-bold" : ""
                }`}
              >
                {t("models.totalDatasetRows", { count: maxSamples })}
              </Button>

              <span className="text-[10px] text-muted-foreground font-mono">{t("models.quickTest")}</span>

              {[10, 25, 50, 100].map((num) => (
                <Button
                  key={num}
                  size="sm"
                  type="button"
                  variant={sampleSize === num ? "default" : "outline"}
                  onClick={() => setSampleSize(Math.min(num, maxSamples))}
                  className={`h-8 px-2 text-xs font-mono font-semibold transition-all ${
                    sampleSize === num ? "shadow-md shadow-primary/20 bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {num}
                </Button>
              ))}

              <div className="flex items-center gap-1 ml-1">
                <Input
                  type="number"
                  min={1}
                  max={maxSamples}
                  value={sampleSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setSampleSize(Math.max(1, Math.min(val, maxSamples)));
                    }
                  }}
                  className="w-20 h-8 text-xs font-mono font-bold bg-background/80"
                />
                <span className="text-[11px] text-muted-foreground font-mono">{t("common.rows")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* BATCH CONCURRENCY & PARALLEL SLIDER */}
        <div className="pt-3 border-t border-border/50 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-foreground">
                {t("models.concurrencyBatchTitle")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {batchSize === 1 ? (
                <Badge variant="outline" className="text-xs font-mono bg-muted/30 text-foreground border-border/80">
                  {t("models.modeSequential")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs font-mono bg-amber-500/15 text-amber-300 border-amber-500/30 font-bold gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>{t("models.batchConcurrent", { size: batchSize })}</span>
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-1.5 px-0.5">
            <Slider
              min={1}
              max={maxBatchSize}
              step={1}
              value={[batchSize]}
              onValueChange={(val) => setBatchSize && setBatchSize(val[0])}
              disabled={maxBatchSize <= 1}
              className="py-1 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>1 ({t("models.strictSequential")})</span>
              {estimatedVramWithBatch && (
                <span className="text-emerald-400/90 font-semibold">
                  {t("models.vramWithBatch", { est: estimatedVramWithBatch, total: systemVramGb })}
                </span>
              )}
              <span>{t("models.maxSafeFlows", { count: maxBatchSize })}</span>
            </div>
          </div>

          {maxBatchSize > 1 ? (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {t("models.speedupBatch", { speedup: batchSize, rows: batchSize, vram: systemVramGb })}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {bottleneckModelName
                  ? t("models.vramTightWarning", { model: bottleneckModelName })
                  : t("models.selectModelForBatch")}
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* SECTION 1: Active Models in this Experiment */}
      <Card className="neo-panel border-border shadow-spatial p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-foreground font-display">
              {t("models.activeModelsTitle")}
            </h4>
          </div>
          <Badge
            variant={selectedModelIds.length > 0 ? "default" : "outline"}
            className={`text-xs font-mono px-2.5 py-0.5 ${
              selectedModelIds.length > 0
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground border-border/80"
            }`}
          >
            {selectedModelIds.length === 1
              ? t("models.activeModelsCountSingular")
              : t("models.activeModelsCountPlural", { count: selectedModelIds.length })}
          </Badge>
        </div>

        {/* Global Ollama Temperature Controls */}
        {(() => {
          const selectedOllamaModelCount = selectedModelIds.filter((id) => getModelDetails(id).provider === "ollama").length;
          if (selectedOllamaModelCount === 0) return null;

          return (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-foreground">
                      {t("models.ollamaTempConfigTitle")}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                      {selectedOllamaModelCount} {selectedOllamaModelCount === 1 ? "modelo Ollama" : "modelos Ollama"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("models.ollamaTempConfigDesc")}
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-background/80 px-3 py-1.5 rounded-lg border border-border/60 shrink-0">
                  <Switch
                    id="toggle-same-temp"
                    checked={isSameOllamaTemp}
                    onCheckedChange={handleToggleSameTemp}
                  />
                  <Label htmlFor="toggle-same-temp" className="text-xs font-medium cursor-pointer">
                    {t("models.applySameTempToAll")}
                  </Label>
                </div>
              </div>

              {isSameOllamaTemp && (
                <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <span className="text-xs font-semibold text-foreground">
                      {t("models.globalTempLabel")}:
                    </span>
                    <span className="font-mono text-sm font-bold text-primary">
                      {commonOllamaTemp.toFixed(2)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${
                        commonOllamaTemp === 0.8
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold"
                      }`}
                    >
                      {commonOllamaTemp === 0.8
                        ? t("models.defaultTempBadge")
                        : t("models.customTempBadge")}
                    </Badge>
                  </div>

                  <div className="flex-1 flex items-center gap-3">
                    <Slider
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={[commonOllamaTemp]}
                      onValueChange={([val]) => handleCommonTempChange(val)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={2.0}
                      step={0.05}
                      value={commonOllamaTemp}
                      onChange={(e) => handleCommonTempChange(parseFloat(e.target.value) || 0.0)}
                      className="w-16 h-7 text-xs font-mono p-1 text-center bg-background border-border/80"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCommonTempChange(0.8)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 border border-border/40"
                      title={t("models.resetDefault")}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t("models.resetDefault")}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {selectedModelIds.length === 0 ? (
          <div className="py-8 px-4 text-center border border-dashed border-border/70 rounded-2xl bg-muted/10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h5 className="text-sm font-bold text-foreground">
                {t("models.noModelsTitle")}
              </h5>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {t("models.noModelsDesc")}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedModelIds.map((id, index) => {
              const details = getModelDetails(id);
              const isLocal = details.is_local || details.provider === "ollama";
              const vramReq = isLocal ? computeModelVramRequirement(details, requiredContextTokens) : null;
              const exceedsVram = Boolean(vramReq && !vramReq.fitsInVram);

              return (
                <div
                  key={id}
                  className={`p-3.5 rounded-xl border shadow-sm transition-all flex flex-col justify-between gap-3 group relative ${
                    exceedsVram
                      ? "border-destructive/50 bg-destructive/10"
                      : "border-primary/30 bg-primary/5 hover:bg-primary/10"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold font-mono">
                        {index + 1}
                      </span>
                      {getProviderBadge(details.provider, details.is_local)}
                      {vramReq && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${
                            vramReq.fitsInVram
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-destructive/20 text-destructive border-destructive/40 font-bold"
                          }`}
                        >
                          ~{vramReq.totalVramGb} GB VRAM
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeModelFromExperiment(id)}
                        className="w-7 h-7 ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                        title={t("models.removeModelTooltip")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="font-bold text-sm text-foreground tracking-tight break-all">
                      {details.name}
                    </div>

                    {exceedsVram && vramReq && (
                      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-destructive/20 border border-destructive/30 text-[11px] text-destructive font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          {t("models.exceedsVramWarning", { req: vramReq.totalVramGb, avail: systemVramGb })}
                        </span>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {details.description}
                    </p>
                  </div>

                  {details.provider === "ollama" && (
                    <div className="pt-2 pb-1 border-t border-border/40 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                          <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                          <span>{t("models.modelTempLabel")}</span>
                        </span>
                        {isSameOllamaTemp ? (
                          <Badge variant="outline" className="text-[10px] bg-muted/40 font-mono text-muted-foreground">
                            {t("models.syncedTemp", { temp: ((modelTemperatures && modelTemperatures[id]) ?? commonOllamaTemp).toFixed(2) })}
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                ((modelTemperatures && modelTemperatures[id]) ?? 0.8) === 0.8
                                  ? "bg-muted/40 text-muted-foreground"
                                  : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                              }`}
                            >
                              {((modelTemperatures && modelTemperatures[id]) ?? 0.8) === 0.8
                                ? t("models.defaultTempBadge")
                                : t("models.customTempBadge")}
                            </Badge>
                            <span className="font-mono font-bold text-xs text-foreground">
                              {((modelTemperatures && modelTemperatures[id]) ?? 0.8).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {!isSameOllamaTemp && (
                        <div className="flex items-center gap-2 pt-1">
                          <Slider
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={[((modelTemperatures && modelTemperatures[id]) ?? 0.8)]}
                            onValueChange={([val]) => handleModelTempChange(id, val)}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={2.0}
                            step={0.05}
                            value={((modelTemperatures && modelTemperatures[id]) ?? 0.8)}
                            onChange={(e) => handleModelTempChange(id, parseFloat(e.target.value) || 0.0)}
                            className="w-14 h-6 text-[11px] font-mono p-1 text-center bg-background border-border/80"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleModelTempChange(id, 0.8)}
                            className="w-6 h-6 text-muted-foreground hover:text-foreground border border-border/40 rounded shrink-0"
                            title={t("models.resetDefault")}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                    <span>
                      {isLocal && vramReq
                        ? t("models.kvTokens", { kv: vramReq.kvCacheGb, tokens: requiredContextTokens })
                        : t("models.windowTokens", { tokens: Math.round(details.context_window / 1024) })}
                    </span>
                    <span>
                      {details.is_local
                        ? t("models.costLocal")
                        : t("models.costPerMillionIn", { cost: details.cost_per_million_input.toFixed(2) })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* SECTION 2: Add Models On Demand */}
      <Card className="neo-panel border-border shadow-spatial p-5 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t("models.addModelsTitle")}</span>
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("models.addModelsDesc")}
            </p>
          </div>

          {/* Toggle between Local and Cloud */}
          <div className="flex items-center p-1 bg-muted/40 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setActiveAddTab("local")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeAddTab === "local"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{t("models.tabLocal")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveAddTab("cloud")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeAddTab === "cloud"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{t("models.tabCloud")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveAddTab("simulated")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeAddTab === "simulated"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("models.tabSim")}</span>
            </button>
          </div>
        </div>

        {/* TAB 1: LOCAL OLLAMA DISCOVERY */}
        {activeAddTab === "local" && (
          <div className="space-y-4">
            {/* Ollama Server URL input */}
            <div className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ollama-url-input" className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t("models.ollamaServerUrl")}</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("models.ollamaServerDesc")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <Input
                  id="ollama-url-input"
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="font-mono text-xs bg-background/80 h-9"
                />
                <Button
                  type="button"
                  onClick={handleDiscoverLocal}
                  disabled={discoveringLocal}
                  className="w-full sm:w-auto h-9 px-4 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl gap-2 shrink-0 cursor-pointer shadow-md shadow-primary/20"
                >
                  {discoveringLocal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("models.connecting")}</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t("models.discoverModels")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* VRAM & CONTEXT SMART ESTIMATOR CONTROL PANEL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card 1: Contexto Requerido */}
              <div className="p-4 rounded-xl bg-card/60 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-primary" />
                    <span className="font-bold text-xs text-foreground">
                      {t("models.contextCardTitle")}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/30"
                  >
                    {isCalculatingContext ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> {t("models.calculating")}
                      </span>
                    ) : (
                      `${requiredContextTokens.toLocaleString()} tokens`
                    )}
                  </Badge>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("models.contextDesc", { count: inputTextColumns.length + contextColumns.length })}
                </p>

                {contextCalc ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-1">
                      <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
                        <div className="text-muted-foreground">{t("models.fixedPromptLabel")}</div>
                        <div className="font-bold text-foreground text-xs mt-0.5">
                          ~{contextCalc.fixed_prompt_tokens} tok
                        </div>
                        <div className="text-[9px] text-muted-foreground/70">{contextCalc.fixed_prompt_chars} {t("models.chars")}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
                        <div className="text-muted-foreground">{t("models.longestRowLabel")}</div>
                        <div className="font-bold text-foreground text-xs mt-0.5">
                          ~{contextCalc.max_injected_tokens} tok
                        </div>
                        <div className="text-[9px] text-muted-foreground/70">{contextCalc.max_injected_chars} {t("models.chars")}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
                        <div className="text-muted-foreground">{t("models.outputMarginLabel")}</div>
                        <div className="font-bold text-foreground text-xs mt-0.5">
                          +{contextCalc.completion_tokens} tok
                        </div>
                        <div className="text-[9px] text-muted-foreground/70">{t("models.generation")}</div>
                      </div>
                    </div>

                    {contextCalc.avg_total_raw_tokens ? (
                      <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 px-1 text-muted-foreground border-t border-border/30 gap-1">
                        <span>{t("models.maxPeakWorstCase")} <strong className="text-foreground font-mono">~{contextCalc.total_raw_tokens} tok</strong></span>
                        <span>{t("models.corpusAverage")} <strong className="text-foreground font-mono">~{contextCalc.avg_total_raw_tokens} tok</strong></span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 p-2 rounded-lg bg-muted/20 border border-border/30">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{t("models.standardContextNotice", { tokens: requiredContextTokens })}</span>
                  </div>
                )}
              </div>

              {/* Card 2: VRAM del Sistema */}
              <div className="p-4 rounded-xl bg-card/60 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-xs text-foreground">
                      {t("models.vramCardHeader")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs font-bold bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    >
                      {systemVramGb} GB VRAM
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDetectVram()}
                      disabled={isDetectingVram}
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      title={t("models.detectGpuTitle")}
                    >
                      {isDetectingVram ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      <span className="ml-1 hidden sm:inline">{t("models.autodetect")}</span>
                    </Button>
                  </div>
                </div>

                {detectedVramInfo?.detected ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {t("models.detectedGpu", { gpu: detectedVramInfo.gpu_name || "", vram: detectedVramInfo.vram_gb ?? 0 })}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {detectedVramInfo?.message || t("models.selectVramDesc")}
                  </p>
                )}

                {/* Preset VRAM Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {VRAM_PRESETS.map((vram) => (
                    <Button
                      key={vram}
                      size="sm"
                      type="button"
                      variant={systemVramGb === vram ? "default" : "secondary"}
                      onClick={() => handleSetVram(vram)}
                      className={`h-7 px-2.5 text-[11px] font-mono font-bold transition-all ${
                        systemVramGb === vram ? "shadow-md shadow-primary/20" : ""
                      }`}
                    >
                      {vram} GB
                    </Button>
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <Input
                      type="number"
                      min={1}
                      max={512}
                      value={systemVramGb}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) handleSetVram(val);
                      }}
                      className="w-16 h-7 text-[11px] font-mono text-center px-1"
                      placeholder="GB"
                    />
                    <span className="text-[11px] text-muted-foreground font-mono">GB</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Local Error feedback */}
            {localError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1 flex items-start gap-3 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">{t("models.ollamaErrorTitle")}</span>
                  <p className="text-muted-foreground leading-relaxed">{localError}</p>
                </div>
              </div>
            )}

            {/* Local Success feedback */}
            {localSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{localSuccessMsg}</span>
              </div>
            )}

            {/* Discovered Local Models Grid */}
            {localDiscoveredModels.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>{t("models.detectedLocalModels", { count: localDiscoveredModels.length })}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {t("models.compatibleWithVram", { vram: systemVramGb, tokens: requiredContextTokens.toLocaleString() })}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {localDiscoveredModels.map((m) => {
                    const isAdded = selectedModelIds.includes(m.id);
                    const vramReq = computeModelVramRequirement(m, requiredContextTokens);
                    const fitsInVram = vramReq.fitsInVram;

                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          !fitsInVram
                            ? "opacity-65 bg-muted/10 border-destructive/30 hover:opacity-85"
                            : isAdded
                            ? "bg-emerald-500/10 border-emerald-500/40"
                            : "glass-panel-subtle hover:bg-muted/40 border-border/70"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-foreground break-all">{m.name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                              Local
                            </Badge>
                          </div>

                          {/* VRAM Requirement Badge & Details */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {fitsInVram ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/15 gap-1"
                              >
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>~{vramReq.totalVramGb} GB VRAM</span>
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono text-destructive border-destructive/40 bg-destructive/15 gap-1"
                              >
                                <AlertTriangle className="w-3 h-3 text-destructive" />
                                <span>~{vramReq.totalVramGb} GB ({t("models.exceedsSystemVram", { vram: systemVramGb })})</span>
                              </Badge>
                            )}

                            {m.parameter_size && (
                              <Badge variant="secondary" className="text-[10px] font-mono">
                                {m.parameter_size}
                              </Badge>
                            )}
                            {m.quantization_level && (
                              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                                {m.quantization_level}
                              </Badge>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground leading-relaxed">{m.description}</p>

                          {/* Memory breakdown details */}
                          <div className="text-[10px] font-mono text-muted-foreground/80 flex items-center gap-2 pt-0.5">
                            <span>{t("models.weightsLabel", { weights: vramReq.weightsGb })}</span>
                            <span>•</span>
                            <span>KV: {vramReq.kvCacheGb} GB ({requiredContextTokens} tok)</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] font-mono text-muted-foreground">{t("models.freeCost")}</span>
                          {isAdded ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => removeModelFromExperiment(m.id)}
                              className="h-7 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30 rounded-lg"
                            >
                              {t("models.removeButton")}
                            </Button>
                          ) : !fitsInVram ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={true}
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] font-semibold text-destructive/80 border-destructive/30 opacity-70 cursor-not-allowed gap-1.5"
                              title={t("models.doesNotFitVramTooltip", { req: vramReq.totalVramGb, tokens: requiredContextTokens, avail: systemVramGb })}
                            >
                              <AlertTriangle className="w-3 h-3 text-destructive" />
                              <span>{t("models.doesNotFitVram")}</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => addModelToExperiment(m)}
                              className="h-7 px-2.5 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg gap-1 shadow-sm"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{t("models.addToExperiment")}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CLOUD API MODELS DISCOVERY */}
        {activeAddTab === "cloud" && (
          <div className="space-y-4">
            {/* Provider Selector Buttons */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                {t("models.selectCloudProvider")}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "openai", name: "OpenAI", desc: "GPT-4o, Mini, o1" },
                  { id: "gemini", name: "Google Gemini", desc: "Flash, Pro 1.5/2.5" },
                  { id: "anthropic", name: "Anthropic Claude", desc: "Sonnet, Haiku" },
                  { id: "groq", name: "Groq LPU", desc: "Llama 3.3, Mixtral" },
                ].map((prov) => {
                  const isSelected = selectedCloudProvider === prov.id;
                  const hasSavedKey = Boolean(apiKeys[prov.id]);
                  return (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => handleSelectCloudProvider(prov.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                        isSelected
                          ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40"
                          : "bg-muted/20 border-border/70 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-foreground">{prov.name}</span>
                        {hasSavedKey && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" title={t("models.savedKeyTooltip")} />
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{prov.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API Key Input Card */}
            <div className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="cloud-key-input" className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-primary" />
                  <span>{t("models.apiKeyFor", { provider: selectedCloudProvider.toUpperCase() })}</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("models.apiKeyVerifyDesc", { provider: selectedCloudProvider.toUpperCase() })}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="relative w-full">
                  <Input
                    id="cloud-key-input"
                    type={showKeyText ? "text" : "password"}
                    value={currentKeyInput}
                    onChange={(e) => setCurrentKeyInput(e.target.value)}
                    placeholder={
                      selectedCloudProvider === "openai"
                        ? "sk-proj-..."
                        : selectedCloudProvider === "gemini"
                        ? "AIzaSy..."
                        : selectedCloudProvider === "anthropic"
                        ? "sk-ant-..."
                        : "gsk_..."
                    }
                    className="font-mono text-xs bg-background/80 h-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyText(!showKeyText)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showKeyText ? t("models.hideKey") : t("models.showKey")}
                  >
                    {showKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <Button
                  type="button"
                  onClick={handleDiscoverRemote}
                  disabled={discoveringRemote}
                  className="w-full sm:w-auto h-9 px-4 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl gap-2 shrink-0 cursor-pointer shadow-md shadow-primary/20"
                >
                  {discoveringRemote ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("models.validatingKey")}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("models.verifyAndList")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Remote Error feedback */}
            {remoteError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1 flex items-start gap-3 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">{t("models.authErrorWith", { provider: selectedCloudProvider.toUpperCase() })}</span>
                  <p className="text-muted-foreground leading-relaxed">{remoteError}</p>
                </div>
              </div>
            )}

            {/* Remote Success feedback */}
            {remoteSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-400" />
                <span>{remoteSuccessMsg}</span>
              </div>
            )}

            {/* Discovered Remote Models Grid */}
            {remoteDiscoveredModels.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-foreground flex items-center gap-2">
                  <span>{t("models.availableAccountModels", { count: remoteDiscoveredModels.length })}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {remoteDiscoveredModels.map((m) => {
                    const isAdded = selectedModelIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          isAdded
                            ? "bg-primary/10 border-primary/40"
                            : "glass-panel-subtle hover:bg-muted/40 border-border/70"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-foreground break-all">{m.name}</span>
                            {getProviderBadge(m.provider, m.is_local)}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                            {m.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                          <span>${m.cost_per_million_input.toFixed(2)} / M tokens</span>
                          {isAdded ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => removeModelFromExperiment(m.id)}
                              className="h-7 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30 rounded-lg"
                            >
                              {t("models.removeButton")}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => addModelToExperiment(m)}
                              className="h-7 px-2.5 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg gap-1 shadow-sm"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{t("models.addToExperiment")}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SIMULATED TEST MODELS */}
        {activeAddTab === "simulated" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h5 className="font-bold text-xs text-foreground">
                  {t("models.simModelsTitle")}
                </h5>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("models.simModelsDesc")}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {simulatedModels.map((m) => {
                const isAdded = selectedModelIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      isAdded
                        ? "bg-emerald-500/10 border-emerald-500/40"
                        : "glass-panel-subtle hover:bg-muted/40 border-border/70"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-foreground break-all">{m.name}</span>
                        {getProviderBadge(m.provider, m.is_local)}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{m.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-[10px] font-mono text-muted-foreground">{t("models.freeCost")}</span>
                      {isAdded ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeModelFromExperiment(m.id)}
                          className="h-7 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30 rounded-lg"
                        >
                          {t("models.removeButton")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addModelToExperiment(m)}
                          className="h-7 px-2.5 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg gap-1 shadow-sm"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{t("models.addToExperiment")}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
