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
  Save,
  FolderOpen,
  Share2,
  Lock,
  Plug,
  Users,
  X,
} from "lucide-react";

const PlugOffIcon: React.FC<{ className?: string; title?: string }> = ({
  className = "w-3.5 h-3.5",
  title,
}) => (
  <span className={`relative inline-flex items-center justify-center ${className}`} title={title}>
    <Plug className="w-full h-full" />
    <svg
      viewBox="0 0 24 24"
      className="absolute inset-0 w-full h-full pointer-events-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  </span>
);
import {
  discoverLocalModels,
  discoverRemoteModels,
  updateUserConfig,
  detectSystemVram,
  calculateContextSize,
  fetchConnectionProfiles,
  saveConnectionProfile,
  deleteConnectionProfile,
  fetchProfileShares,
  shareConnectionProfile,
  revokeProfileShare,
  ConnectionProfileItem,
  ConnectionProfileShareItem,
} from "../services/api";
import { ShareUserPicker } from "./ShareUserPicker";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  // Saved Connection Profiles (Ollama URLs & Cloud API Keys)
  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfileItem[]>([]);
  const [activeLocalProfile, setActiveLocalProfile] = useState<ConnectionProfileItem | null>(null);
  const [activeCloudProfiles, setActiveCloudProfiles] = useState<Record<string, ConnectionProfileItem | null>>({});
  const [saveProfileModal, setSaveProfileModal] = useState<{
    open: boolean;
    provider: string;
    value: string;
  } | null>(null);
  const [profileNameInput, setProfileNameInput] = useState<string>("");
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Share Connection Profile Modal states
  const [shareProfileTarget, setShareProfileTarget] = useState<ConnectionProfileItem | null>(null);
  const [profileShares, setProfileShares] = useState<ConnectionProfileShareItem[]>([]);
  const [shareTargetUserId, setShareTargetUserId] = useState<number | "">("");
  const [shareMaxVramGb, setShareMaxVramGb] = useState<string>("");
  const [isSharingProfile, setIsSharingProfile] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnectionProfiles()
      .then((rows) => {
        setConnectionProfiles(rows);
      })
      .catch(() => {});
  }, []);

  const handleOpenSaveProfile = (provider: string, value: string) => {
    setProfileNameInput("");
    setProfileError(null);
    setSaveProfileModal({ open: true, provider, value: value.trim() });
  };

  const handleConfirmSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveProfileModal) return;
    const cleanName = profileNameInput.trim();
    if (!cleanName) {
      setProfileError("Introduce un nombre para el perfil.");
      return;
    }
    if (saveProfileModal.provider === "ollama" && (systemVramGb === null || systemVramGb <= 0)) {
      setProfileError("Debes seleccionar la VRAM del sistema (GPU) antes de guardar un perfil local.");
      return;
    }
    setIsSavingProfile(true);
    setProfileError(null);
    try {
      const created = await saveConnectionProfile({
        name: cleanName,
        provider: saveProfileModal.provider,
        ollama_url: saveProfileModal.provider === "ollama" ? saveProfileModal.value : "",
        api_key: saveProfileModal.provider === "ollama" ? "" : saveProfileModal.value,
        vram_gb: saveProfileModal.provider === "ollama" ? systemVramGb : null,
      });
      setConnectionProfiles((prev) => [created, ...prev]);
      setSaveProfileModal(null);
      setProfileNameInput("");
    } catch (err: any) {
      setProfileError(err.message || "Error al guardar el perfil.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: number) => {
    try {
      await deleteConnectionProfile(profileId);
      setConnectionProfiles((prev) => prev.filter((p) => p.id !== profileId));
      if (activeLocalProfile?.id === profileId) setActiveLocalProfile(null);
    } catch (err) {
      console.error("Error deleting connection profile:", err);
    }
  };

  const handleOpenShareProfile = async (profile: ConnectionProfileItem) => {
    setShareProfileTarget(profile);
    setShareTargetUserId("");
    setShareMaxVramGb(profile.provider === "ollama" && profile.vram_gb ? String(profile.vram_gb) : "");
    setShareError(null);
    try {
      const shares = await fetchProfileShares(profile.id);
      setProfileShares(shares);
    } catch (err: any) {
      setShareError(err.message || "Error al cargar usuarios o comparticiones.");
    }
  };

  const handleConfirmShareProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareProfileTarget || !shareTargetUserId) return;
    setShareError(null);
    let maxVram: number | null = null;
    if (shareProfileTarget.provider === "ollama") {
      const parsed = parseFloat(shareMaxVramGb);
      const ownerVram = shareProfileTarget.vram_gb || 0;
      if (isNaN(parsed) || parsed <= 0 || parsed > ownerVram) {
        setShareError(`La VRAM compartida debe estar entre 1 y ${ownerVram} GB.`);
        return;
      }
      maxVram = parsed;
    }
    setIsSharingProfile(true);
    try {
      const created = await shareConnectionProfile(shareProfileTarget.id, {
        target_user_id: Number(shareTargetUserId),
        max_vram_gb: maxVram,
      });
      setProfileShares((prev) => [
        created,
        ...prev.filter((s) => s.target_user_id !== created.target_user_id),
      ]);
      setShareTargetUserId("");
    } catch (err: any) {
      setShareError(err.message || "Error al compartir el perfil.");
    } finally {
      setIsSharingProfile(false);
    }
  };

  const handleRevokeShare = async (shareId: number) => {
    if (!shareProfileTarget) return;
    try {
      await revokeProfileShare(shareProfileTarget.id, shareId);
      setProfileShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err: any) {
      setShareError(err.message || "Error al revocar el acceso.");
    }
  };

  const renderProfileControls = (
    provider: string,
    currentValue: string,
    onLoadProfile: (profile: ConnectionProfileItem) => void
  ) => {
    const matchingProfiles = connectionProfiles.filter(
      (p) => p.provider.toLowerCase() === provider.toLowerCase()
    );
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px] font-medium gap-1.5 bg-background/80 hover:bg-muted border-border"
            >
              <FolderOpen className="w-3 h-3 text-primary" />
              <span>Cargar perfil ({matchingProfiles.length})</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
              Perfiles guardados ({provider === "ollama" ? "Ollama" : provider.toUpperCase()})
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {matchingProfiles.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground">
                No hay perfiles guardados para {provider === "ollama" ? "Ollama" : provider.toUpperCase()}.
              </div>
            ) : (
              matchingProfiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => onLoadProfile(p)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">{p.name}</span>
                      {p.is_shared && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 bg-primary/10 text-primary border-primary/30 shrink-0">
                          @{p.owner_username}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {p.is_shared
                        ? p.provider === "ollama"
                          ? `URL oculta · Máx ${p.max_vram_gb ?? "?"} GB VRAM`
                          : "API-Key oculta (compartido)"
                        : p.provider === "ollama"
                        ? `${p.ollama_url} · ${p.vram_gb ?? "?"} GB VRAM`
                        : p.api_key.length > 8
                        ? `${p.api_key.slice(0, 4)}••••${p.api_key.slice(-4)}`
                        : "••••••••"}
                    </div>
                  </div>
                  {!p.is_shared && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenShareProfile(p);
                        }}
                        title="Compartir perfil"
                        aria-label={`Compartir perfil ${p.name}`}
                        className="p-1 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Share2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(p.id);
                        }}
                        title="Eliminar perfil"
                        aria-label={`Eliminar perfil ${p.name}`}
                        className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!currentValue.trim()}
          onClick={() => handleOpenSaveProfile(provider, currentValue)}
          className="h-7 px-2.5 text-[11px] font-medium gap-1.5 bg-background/80 hover:bg-muted border-border"
          title={
            provider === "ollama"
              ? "Guardar esta URL y VRAM como perfil de conexión"
              : "Guardar esta API-Key como perfil de conexión"
          }
        >
          <Save className="w-3 h-3 text-primary" />
          <span>Guardar perfil</span>
        </Button>
      </div>
    );
  };

  // Preset VRAM sizes (GB)
  const VRAM_PRESETS = [6, 8, 12, 16, 24, 32, 48, 80];

  // VRAM & Context Sizing States (starts null until selected or autodetected)
  const [systemVramGb, setSystemVramGb] = useState<number | null>(() => {
    const saved = apiKeys["system_vram_gb"];
    if (saved && !isNaN(parseFloat(saved)) && parseFloat(saved) > 0) {
      return parseFloat(saved);
    }
    return null;
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
  const handleDetectVram = async (targetUrl?: string, profileId?: number) => {
    setIsDetectingVram(true);
    try {
      const pid = profileId ?? (activeLocalProfile?.is_shared ? activeLocalProfile.id : undefined);
      const urlToUse = pid ? undefined : (targetUrl || ollamaUrl);
      const res = await detectSystemVram(urlToUse, pid);
      setDetectedVramInfo(res);
      if (res.detected && res.vram_gb && res.vram_gb > 0) {
        const cap = activeLocalProfile?.is_shared && activeLocalProfile.max_vram_gb
          ? activeLocalProfile.max_vram_gb
          : null;
        const finalVram = cap !== null ? Math.min(res.vram_gb, cap) : res.vram_gb;
        setSystemVramGb(finalVram);
        const updated = { ...apiKeys, system_vram_gb: String(finalVram) };
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

  // 3. Set VRAM manually or via preset (respecting shared profile cap)
  const handleSetVram = (vram: number) => {
    if (vram > 0) {
      const cap = activeLocalProfile?.is_shared && activeLocalProfile.max_vram_gb
        ? activeLocalProfile.max_vram_gb
        : null;
      const clamped = cap !== null ? Math.min(vram, cap) : vram;
      setSystemVramGb(clamped);
      const updated = { ...apiKeys, system_vram_gb: String(clamped) };
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
    const fitsInVram = systemVramGb !== null ? totalVramGb <= systemVramGb : true;

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

  // Cloud API discovery states (never auto-load saved connections; user loads profile manually)
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<"openai" | "gemini" | "anthropic" | "groq">("openai");
  const [currentKeyInput, setCurrentKeyInput] = useState<string>("");
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [discoveringRemote, setDiscoveringRemote] = useState<boolean>(false);
  const [remoteDiscoveredModels, setRemoteDiscoveredModels] = useState<ModelCatalogItem[]>([]);
  const [remoteCategoryFilter, setRemoteCategoryFilter] = useState<string>("all");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteSuccessMsg, setRemoteSuccessMsg] = useState<string | null>(null);

  // Ensure any lingering proxy models are purged from selected models
  useEffect(() => {
    if (selectedModelIds.some(id => id.startsWith("ollama/") && (id.includes(":cloud") || id.includes("deepseek-v4")))) {
      setSelectedModelIds(selectedModelIds.filter(id => !(id.startsWith("ollama/") && (id.includes(":cloud") || id.includes("deepseek-v4")))));
    }
  }, [selectedModelIds, setSelectedModelIds]);

  // When switching cloud provider, clear key input unless user explicitly loads a profile
  const handleSelectCloudProvider = (provider: "openai" | "gemini" | "anthropic" | "groq") => {
    setSelectedCloudProvider(provider);
    const loadedProfile = activeCloudProfiles[provider];
    setCurrentKeyInput(loadedProfile && !loadedProfile.is_shared ? loadedProfile.api_key || "" : "");
    setRemoteError(null);
    setRemoteSuccessMsg(null);
    setRemoteDiscoveredModels([]);
    setRemoteCategoryFilter("all");
  };

  // 1. Discover Local Models
  const handleDiscoverLocal = async () => {
    const isSharedLocal = Boolean(activeLocalProfile?.is_shared);
    if (!isSharedLocal && !ollamaUrl.trim()) {
      setLocalError("Introduce la URL del servidor Ollama o carga un perfil antes de detectar modelos.");
      return;
    }
    setDiscoveringLocal(true);
    setLocalError(null);
    setLocalSuccessMsg(null);
    try {
      const res = isSharedLocal && activeLocalProfile
        ? await discoverLocalModels(undefined, activeLocalProfile.id)
        : await discoverLocalModels(ollamaUrl);
      if (res.is_online && res.models.length > 0) {
        setLocalDiscoveredModels(res.models);
        const excludedNote = (res.excluded_remote_models && res.excluded_remote_models > 0)
          ? ` (${res.excluded_remote_models} modelos remotos/cloud tipo proxy fueron excluidos para asegurar ejecución estrictamente local)`
          : "";
        setLocalSuccessMsg(
          isSharedLocal
            ? `Perfil compartido conectado. Se encontraron ${res.models.length} modelos disponibles${excludedNote}.`
            : `Servidor conectado en ${res.resolved_url}. Se encontraron ${res.models.length} modelos instalados localmente en disco${excludedNote}.`
        );

        if (!isSharedLocal) {
          const updatedKeys = { ...apiKeys, ollama_url: res.resolved_url || ollamaUrl };
          setApiKeys(updatedKeys);
          updateUserConfig({ ollama_url: res.resolved_url || ollamaUrl, api_keys: updatedKeys }).catch(() => {});
          handleDetectVram(res.resolved_url || ollamaUrl);
        } else if (activeLocalProfile) {
          handleDetectVram(undefined, activeLocalProfile.id);
        }

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
    const sharedCloud = activeCloudProfiles[selectedCloudProvider];
    const isSharedCloud = Boolean(sharedCloud?.is_shared);
    if (!isSharedCloud && !currentKeyInput.trim()) {
      setRemoteError(t("models.enterApiKeyPrompt", { provider: selectedCloudProvider.toUpperCase() }));
      return;
    }

    setDiscoveringRemote(true);
    setRemoteError(null);
    setRemoteSuccessMsg(null);
    try {
      const res = isSharedCloud && sharedCloud
        ? await discoverRemoteModels(selectedCloudProvider, "", sharedCloud.id)
        : await discoverRemoteModels(selectedCloudProvider, currentKeyInput.trim());
      if (res.is_valid && res.models.length > 0) {
        setRemoteDiscoveredModels(res.models);
        setRemoteCategoryFilter("all");
        setRemoteSuccessMsg(t("models.credentialsVerifiedMsg", { provider: selectedCloudProvider.toUpperCase(), count: res.models.length }));

        if (!isSharedCloud) {
          const updatedKeys = { ...apiKeys, [selectedCloudProvider]: currentKeyInput.trim() };
          setApiKeys(updatedKeys);
          updateUserConfig({ api_keys: updatedKeys }).catch(() => {});
        }

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
      const vramFree = Math.max(0, (systemVramGb ?? 16) - vramReq.weightsGb - vramReq.overheadGb);
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
                  {t("models.vramWithBatch", { est: estimatedVramWithBatch, total: systemVramGb ?? "?" })}
                </span>
              )}
              <span>{t("models.maxSafeFlows", { count: maxBatchSize })}</span>
            </div>
          </div>

          {maxBatchSize > 1 ? (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {t("models.speedupBatch", { speedup: batchSize, rows: batchSize, vram: systemVramGb ?? "?" })}
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
                          {t("models.exceedsVramWarning", { req: vramReq.totalVramGb, avail: systemVramGb ?? 0 })}
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
                {activeLocalProfile?.is_shared ? (
                  <div className="w-full h-9 px-3 rounded-md border border-primary/30 bg-primary/10 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 text-foreground font-medium truncate">
                      <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">
                        Perfil compartido: <strong>{activeLocalProfile.name}</strong> (@{activeLocalProfile.owner_username}) · URL oculta
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLocalProfile(null);
                        const updatedKeys = { ...apiKeys, ollama_profile_id: "" };
                        setApiKeys(updatedKeys);
                        updateUserConfig({ api_keys: updatedKeys }).catch(() => {});
                      }}
                      title="Desconectar perfil compartido"
                      className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <Input
                    id="ollama-url-input"
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => {
                      setOllamaUrl(e.target.value);
                      if (activeLocalProfile) setActiveLocalProfile(null);
                    }}
                    placeholder="http://localhost:11434"
                    className="font-mono text-xs bg-background/80 h-9"
                  />
                )}
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
                    {activeLocalProfile?.is_shared && activeLocalProfile.max_vram_gb != null && (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30"
                      >
                        Máx: {activeLocalProfile.max_vram_gb} GB
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs font-bold ${
                        systemVramGb !== null
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {systemVramGb !== null ? `${systemVramGb} GB VRAM` : "Sin seleccionar"}
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
                  {VRAM_PRESETS.map((vram) => {
                    const maxCap =
                      activeLocalProfile?.is_shared && activeLocalProfile.max_vram_gb != null
                        ? activeLocalProfile.max_vram_gb
                        : null;
                    const disabledByCap = maxCap !== null && vram > maxCap;
                    return (
                      <Button
                        key={vram}
                        size="sm"
                        type="button"
                        disabled={disabledByCap}
                        variant={systemVramGb === vram ? "default" : "secondary"}
                        onClick={() => handleSetVram(vram)}
                        title={disabledByCap ? `Límite compartido: ${maxCap} GB` : undefined}
                        className={`h-7 px-2.5 text-[11px] font-mono font-bold transition-all ${
                          systemVramGb === vram ? "shadow-md shadow-primary/20" : ""
                        }`}
                      >
                        {vram} GB
                      </Button>
                    );
                  })}
                  <div className="flex items-center gap-1 ml-auto">
                    <Input
                      type="number"
                      min={1}
                      max={
                        activeLocalProfile?.is_shared && activeLocalProfile.max_vram_gb != null
                          ? activeLocalProfile.max_vram_gb
                          : 512
                      }
                      value={systemVramGb ?? ""}
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

            {/* Connection Profiles Bar (below 2. VRAM del Sistema, right-aligned) */}
            <div className="flex justify-end">
              {renderProfileControls("ollama", ollamaUrl, (profile) => {
                setLocalError(null);
                setActiveLocalProfile(profile);
                if (profile.is_shared) {
                  setOllamaUrl("");
                  const cap = profile.max_vram_gb ?? null;
                  if (cap !== null) {
                    const nextVram = systemVramGb !== null ? Math.min(systemVramGb, cap) : cap;
                    setSystemVramGb(nextVram);
                    const updatedKeys = {
                      ...apiKeys,
                      ollama_url: "",
                      ollama_profile_id: String(profile.id),
                      system_vram_gb: String(nextVram),
                    };
                    setApiKeys(updatedKeys);
                    updateUserConfig({ ollama_url: "", api_keys: updatedKeys }).catch(() => {});
                  } else {
                    const updatedKeys = { ...apiKeys, ollama_url: "", ollama_profile_id: String(profile.id) };
                    setApiKeys(updatedKeys);
                    updateUserConfig({ ollama_url: "", api_keys: updatedKeys }).catch(() => {});
                  }
                } else {
                  setOllamaUrl(profile.ollama_url);
                  const profVram = profile.vram_gb ?? systemVramGb;
                  if (profVram !== null && profVram > 0) setSystemVramGb(profVram);
                  const updatedKeys = {
                    ...apiKeys,
                    ollama_url: profile.ollama_url,
                    ollama_profile_id: String(profile.id),
                    ...(profVram ? { system_vram_gb: String(profVram) } : {}),
                  };
                  setApiKeys(updatedKeys);
                  updateUserConfig({ ollama_url: profile.ollama_url, api_keys: updatedKeys }).catch(() => {});
                }
              })}
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
                    {systemVramGb !== null
                      ? t("models.compatibleWithVram", { vram: systemVramGb, tokens: requiredContextTokens.toLocaleString() })
                      : "VRAM sin seleccionar"}
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
                                <span>~{vramReq.totalVramGb} GB ({t("models.exceedsSystemVram", { vram: systemVramGb ?? 0 })})</span>
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
                              title={t("models.doesNotFitVramTooltip", { req: vramReq.totalVramGb, tokens: requiredContextTokens, avail: systemVramGb ?? 0 })}
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
                  const matchingCount = connectionProfiles.filter(
                    (p) => p.provider.toLowerCase() === prov.id
                  ).length;
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-foreground">{prov.name}</span>
                        {matchingCount > 0 ? (
                          <span
                            title={`${matchingCount} perfil(es) de conexión asociado(s)`}
                            className="inline-flex items-center text-primary shrink-0"
                          >
                            <Plug className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <PlugOffIcon
                            className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"
                            title="Sin perfiles de conexión asociados"
                          />
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
                {activeCloudProfiles[selectedCloudProvider]?.is_shared ? (
                  <div className="w-full h-9 px-3 rounded-md border border-primary/30 bg-primary/10 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 text-foreground font-medium truncate">
                      <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">
                        Perfil compartido: <strong>{activeCloudProfiles[selectedCloudProvider]?.name}</strong> (@
                        {activeCloudProfiles[selectedCloudProvider]?.owner_username}) · API-Key oculta
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCloudProfiles((prev) => ({ ...prev, [selectedCloudProvider]: null }));
                        const updatedKeys = { ...apiKeys, [`${selectedCloudProvider}_profile_id`]: "" };
                        setApiKeys(updatedKeys);
                        updateUserConfig({ api_keys: updatedKeys }).catch(() => {});
                      }}
                      title="Desconectar perfil compartido"
                      className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full">
                    <Input
                      id="cloud-key-input"
                      type={showKeyText ? "text" : "password"}
                      value={currentKeyInput}
                      onChange={(e) => {
                        setCurrentKeyInput(e.target.value);
                        if (activeCloudProfiles[selectedCloudProvider]) {
                          setActiveCloudProfiles((prev) => ({ ...prev, [selectedCloudProvider]: null }));
                        }
                      }}
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
                )}

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

              <div className="flex justify-end">
                {renderProfileControls(selectedCloudProvider, currentKeyInput, (profile) => {
                  setRemoteError(null);
                  setActiveCloudProfiles((prev) => ({ ...prev, [selectedCloudProvider]: profile }));
                  if (profile.is_shared) {
                    setCurrentKeyInput("");
                    const updatedKeys = {
                      ...apiKeys,
                      [selectedCloudProvider]: "",
                      [`${selectedCloudProvider}_profile_id`]: String(profile.id),
                    };
                    setApiKeys(updatedKeys);
                    updateUserConfig({ api_keys: updatedKeys }).catch(() => {});
                  } else {
                    setCurrentKeyInput(profile.api_key);
                    const updatedKeys = {
                      ...apiKeys,
                      [selectedCloudProvider]: profile.api_key,
                      [`${selectedCloudProvider}_profile_id`]: String(profile.id),
                    };
                    setApiKeys(updatedKeys);
                    updateUserConfig({ api_keys: updatedKeys }).catch(() => {});
                  }
                })}
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
            {remoteDiscoveredModels.length > 0 && (() => {
              const categoryDefs = [
                { id: "all", label: "Todos" },
                { id: "texto", label: "Texto" },
                { id: "programacion", label: "Programación" },
                { id: "omnimodales", label: "Omnimodales" },
                { id: "imagenes", label: "Imágenes" },
              ];
              const getCategoryBadge = (cat?: string) => {
                const c = (cat || "texto").toLowerCase();
                if (c === "programacion") {
                  return (
                    <Badge variant="outline" className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                      Programación
                    </Badge>
                  );
                }
                if (c === "omnimodales") {
                  return (
                    <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border-amber-500/30">
                      Omnimodal
                    </Badge>
                  );
                }
                if (c === "imagenes") {
                  return (
                    <Badge variant="outline" className="text-[10px] font-mono bg-pink-500/10 text-pink-400 border-pink-500/30">
                      Imágenes
                    </Badge>
                  );
                }
                return (
                  <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    Texto
                  </Badge>
                );
              };

              const visibleRemoteModels =
                remoteCategoryFilter === "all"
                  ? remoteDiscoveredModels
                  : remoteDiscoveredModels.filter((m) => (m.category || "texto") === remoteCategoryFilter);

              return (
              <div className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span>{t("models.availableAccountModels", { count: visibleRemoteModels.length })}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {categoryDefs.map((cat) => {
                      const count =
                        cat.id === "all"
                          ? remoteDiscoveredModels.length
                          : remoteDiscoveredModels.filter((m) => (m.category || "texto") === cat.id).length;
                      if (cat.id !== "all" && count === 0) return null;
                      const active = remoteCategoryFilter === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setRemoteCategoryFilter(cat.id)}
                          className={`px-2 py-1 rounded-sm text-[11px] font-medium border transition-colors cursor-pointer ${
                            active
                              ? "bg-primary text-primary-foreground border-primary font-semibold"
                              : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          {cat.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleRemoteModels.map((m) => {
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
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-foreground break-all">{m.name}</span>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {getProviderBadge(m.provider, m.is_local)}
                              {getCategoryBadge(m.category)}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                            {m.description}
                          </p>
                          {(m.rpm_limit || m.tpm_limit) && (
                            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground pt-0.5">
                              {m.rpm_limit ? <span>RPM: {m.rpm_limit.toLocaleString()}</span> : null}
                              {m.tpm_limit ? <span>TPM: {m.tpm_limit.toLocaleString()}</span> : null}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {m.billing_tier === "free" ? (
                              <>
                                <span className="line-through opacity-60">${m.cost_per_million_input.toFixed(2)} / M</span>
                                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                                  Free Tier
                                </Badge>
                              </>
                            ) : (
                              <span>${m.cost_per_million_input.toFixed(2)} / M tokens</span>
                            )}
                          </span>
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
              );
            })()}
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

      {/* Save Connection Profile Dialog */}
      <Dialog
        open={Boolean(saveProfileModal?.open)}
        onOpenChange={(open) => {
          if (!open) setSaveProfileModal(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Save className="w-4 h-4 text-primary" />
              <span>Guardar perfil de conexión</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {saveProfileModal?.provider === "ollama"
                ? "Guarda esta URL de servidor Ollama con un nombre para reutilizarla en cualquier experimento."
                : `Guarda esta API-Key de ${saveProfileModal?.provider.toUpperCase()} con un nombre para cargarla rápidamente.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmSaveProfile} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="connection-profile-name" className="text-xs font-semibold">
                Nombre del perfil
              </Label>
              <Input
                id="connection-profile-name"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                placeholder={
                  saveProfileModal?.provider === "ollama"
                    ? "Ej. Ollama Local / Servidor GPU Lab"
                    : `Ej. ${saveProfileModal?.provider.toUpperCase()} Trabajo`
                }
                autoFocus
                className="text-xs h-9"
              />
            </div>

            <div className="p-2.5 rounded-md bg-muted/40 border border-border/60 text-[11px] font-mono text-muted-foreground break-all space-y-1">
              {saveProfileModal?.provider === "ollama" ? (
                <>
                  <div>URL: {saveProfileModal?.value}</div>
                  <div>
                    VRAM del sistema:{" "}
                    {systemVramGb !== null ? (
                      <strong className="text-foreground">{systemVramGb} GB</strong>
                    ) : (
                      <strong className="text-destructive">Sin seleccionar</strong>
                    )}
                  </div>
                </>
              ) : (
                `API-Key (${saveProfileModal?.provider.toUpperCase()}): ${
                  saveProfileModal?.value && saveProfileModal.value.length > 8
                    ? `${saveProfileModal.value.slice(0, 4)}••••${saveProfileModal.value.slice(-4)}`
                    : "••••••••"
                }`
              )}
            </div>

            {saveProfileModal?.provider === "ollama" && (systemVramGb === null || systemVramGb <= 0) && (
              <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  No has seleccionado la VRAM del sistema en <strong>2. VRAM del Sistema (GPU)</strong>. Selecciona la VRAM antes de guardar un perfil local.
                </span>
              </div>
            )}

            {profileError && (
              <p className="text-xs text-destructive font-medium">{profileError}</p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSaveProfileModal(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  isSavingProfile ||
                  (saveProfileModal?.provider === "ollama" && (systemVramGb === null || systemVramGb <= 0))
                }
                className="gap-1.5"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar perfil</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Connection Profile Dialog */}
      <Dialog
        open={Boolean(shareProfileTarget)}
        onOpenChange={(open) => {
          if (!open) setShareProfileTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              <span>Compartir perfil: {shareProfileTarget?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              El destinatario podrá usar este perfil sin ver nunca la URL ni la API-Key.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmShareProfile} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Usuario destinatario</span>
              </Label>
              <ShareUserPicker
                excludedUserIds={profileShares.map((s) => s.target_user_id)}
                selectedUserId={shareTargetUserId}
                onSelectUser={(u) => setShareTargetUserId(u.id)}
              />
            </div>

            {shareProfileTarget?.provider === "ollama" && (
              <div className="space-y-1.5">
                <Label htmlFor="share-profile-vram" className="text-xs font-semibold">
                  VRAM máxima a compartir (GB) — Máx. del perfil: {shareProfileTarget.vram_gb ?? 0} GB
                </Label>
                <Input
                  id="share-profile-vram"
                  type="number"
                  min={1}
                  max={shareProfileTarget.vram_gb || 512}
                  step={1}
                  value={shareMaxVramGb}
                  onChange={(e) => setShareMaxVramGb(e.target.value)}
                  className="text-xs font-mono h-9"
                />
              </div>
            )}

            {shareError && <p className="text-xs text-destructive font-medium">{shareError}</p>}

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSharingProfile || !shareTargetUserId} className="gap-1.5">
                {isSharingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>Compartir</span>
              </Button>
            </div>
          </form>

          {profileShares.length > 0 && (
            <div className="pt-3 border-t border-border space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground">
                Usuarios con acceso ({profileShares.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {profileShares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-muted/30 border border-border/50 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold truncate">@{s.target_username}</span>
                      {s.max_vram_gb != null && (
                        <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5">
                          Máx {s.max_vram_gb} GB
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeShare(s.id)}
                      className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                    >
                      Revocar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
