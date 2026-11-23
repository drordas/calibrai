import React, { useState, useEffect } from "react";
import {
  DatasetSummary,
  ModelCatalogItem,
  ModelBenchmarkSummary,
  PairwiseComparison,
  User,
  UserConfig,
  SavedBenchmarkDetail,
  ExperimentSummary,
  AppNotification,
} from "./types";
import {
  fetchDatasets,
  fetchModels,
  runBenchmarkStream,
  fetchMe,
  removeToken,
  updateUserConfig,
  recalculateExperimentMetrics,
  fetchExperiments,
  fetchExperimentDetail,
  deleteExperiment,
  createExperiment,
  updateExperimentTemplate,
  fetchNotifications,
  markExperimentNotificationRead,
} from "./services/api";
import { LoginPage } from "./components/LoginPage";
import { DatasetViewer } from "./components/DatasetViewer";

const SavedBenchmarksModal = React.lazy(() => import("./components/SavedBenchmarksModal"));
import { PromptEditor } from "./components/PromptEditor";
import { ModelSelector } from "./components/ModelSelector";
import { Leaderboard } from "./components/Leaderboard";
import { PairwiseMatrix } from "./components/PairwiseMatrix";
import { LiveBenchmarkView } from "./components/LiveBenchmarkView";
import { ExperimentDashboard } from "./components/ExperimentDashboard";
import { LaunchExperimentView } from "./components/LaunchExperimentView";
import { LanguageSelector } from "./components/LanguageSelector";
import { UserProfileModal } from "./components/UserProfileModal";
import { ValidationMethodologyView } from "./components/ValidationMethodologyView";
import { useTranslation } from "./i18n";
import { ExperimentDetail } from "./types";
import {
  Database,
  FileCode,
  Cpu,
  BarChart3,
  Grid,
  Sun,
  Moon,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Activity,
  User as UserIcon,
  Bookmark,
  LogOut,
  Save,
  Orbit,
  Layers,
  Rocket,
  Lock,
  CheckCircle2,
  ChevronRight,
  Plus,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Loader2,
  Bell,
  Eye,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function App() {
  const { t, syncWithUserConfig } = useTranslation();
  const [isDark, setIsDark] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [, setUserConfig] = useState<UserConfig | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  // Data states
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<DatasetSummary | null>(null);
  const [inputColumns, setInputColumns] = useState<string[]>([]);
  const [contextColumns, setContextColumns] = useState<string[]>([]);
  const [specColumns, setSpecColumns] = useState<string[]>([]);
  const [idColumn, setIdColumn] = useState<string>("");

  // Ground truth states
  const [groundTruthDatasetId, setGroundTruthDatasetId] = useState<string | null>(null);
  const [groundTruthDatasetIds, setGroundTruthDatasetIds] = useState<string[]>([]);
  const [groundTruthName, setGroundTruthName] = useState<string>(() => t("results.humanExpert"));
  const [groundTruthSchema, setGroundTruthSchema] = useState<any>(null);

  // Prompt states
  const [template, setTemplate] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [taskType, setTaskType] = useState<string>("numeric_math");

  // Model states
  const [availableModels, setAvailableModels] = useState<ModelCatalogItem[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [modelTemperatures, setModelTemperatures] = useState<Record<string, number>>({});
  const [sampleSize, setSampleSize] = useState<number>(25);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  // Execution & Streaming states
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [modelIndex, setModelIndex] = useState<number>(0);
  const [totalModels, setTotalModels] = useState<number>(0);
  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0);
  const [latestResult, setLatestResult] = useState<any>(null);

  // Result metrics states
  const [summaries, setSummaries] = useState<Record<string, ModelBenchmarkSummary>>({});
  const [pairwiseList, setPairwiseList] = useState<PairwiseComparison[]>([]);
  const [bestPerformers, setBestPerformers] = useState<Record<string, string>>({});

  // Workflow navigation
  // "dashboard": Listado de experimentos
  // "wizard": Asistente secuencial de 4 pasos para crear un experimento
  // "results": Inspección de resultados y matriz 1 vs 1
  const [currentMode, setCurrentMode] = useState<"dashboard" | "wizard" | "results">("dashboard");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [resultsTab, setResultsTab] = useState<"leaderboard" | "matrix" | "methodology">("leaderboard");
  const [showSavedModal, setShowSavedModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [openDatasetsSignal, setOpenDatasetsSignal] = useState<number>(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [currentExperimentId, setCurrentExperimentId] = useState<string | null>(null);
  const [currentExperimentDetail, setCurrentExperimentDetail] = useState<ExperimentDetail | null>(null);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [wizardLoadKey, setWizardLoadKey] = useState<number>(0);
  const [initialLaunchConfig, setInitialLaunchConfig] = useState<{
    name?: string;
    description?: string;
    executionMode?: "sequential" | "parallel";
    evalSpec?: Record<string, any>;
  } | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [templateCandidates, setTemplateCandidates] = useState<ExperimentSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [isTemplateMode, setIsTemplateMode] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [savingTemplateStep, setSavingTemplateStep] = useState<boolean>(false);
  const [templateSavedFeedback, setTemplateSavedFeedback] = useState<boolean>(false);

  // Sequential Validation Rules:
  // Paso 1 válido: Dataset seleccionado Y al menos una columna de Texto Principal asignada (o template ya cargado)
  const isStep1Valid = Boolean(selectedDataset && (contextColumns.length > 0 || inputColumns.length > 0 || template.length > 0));
  // Paso 2 válido: Paso 1 completado Y plantilla no vacía (Prompt & Métricas)
  const isStep2Valid = isStep1Valid && template.trim().length > 0;
  // Paso 3 válido: Paso 2 completado Y al menos un modelo seleccionado (Modelos & Hardware)
  const isStep3Valid = isStep2Valid && selectedModelIds.length > 0 && sampleSize >= 1;

  // Dynamic Tab Visibility Rule:
  // Methodology tab is shown whenever the experiment has summaries/pairwise results to validate
  const isQualitativeValidation = Boolean(
    Object.keys(summaries).length > 0 || pairwiseList.length > 0
  );
  const activeResultsTab = (!isQualitativeValidation && resultsTab === "methodology") ? "leaderboard" : resultsTab;

  const startNewExperiment = () => {
    setIsTemplateMode(false);
    setEditingTemplateId(null);
    setTemplateSavedFeedback(false);
    setSelectedDataset(null);
    setInputColumns([]);
    setContextColumns([]);
    setSpecColumns([]);
    setIdColumn("");
    setTemplate("");
    setSystemPrompt("");
    setSelectedModelIds([]);
    setModelTemperatures({});
    setGroundTruthDatasetId(null);
    setGroundTruthDatasetIds([]);
    setGroundTruthName(t("results.humanExpert"));
    setGroundTruthSchema(null);
    setInitialLaunchConfig(null);
    setCurrentExperimentId(null);
    setWizardLoadKey((k) => k + 1);
    setWizardStep(1);
    setCurrentMode("wizard");
  };

  const startNewTemplate = () => {
    startNewExperiment();
    setIsTemplateMode(true);
    setEditingTemplateId(null);
  };

  const handleSaveTemplateStep = async () => {
    if (!selectedDataset) return;
    setSavingTemplateStep(true);
    setTemplateSavedFeedback(false);
    try {
      const payload = {
        name:
          initialLaunchConfig?.name?.trim() ||
          `Plantilla: ${selectedDataset.name.replace(/\.[^/.]+$/, "")} — ${taskType}`,
        description: initialLaunchConfig?.description || "",
        dataset_id: selectedDataset.id,
        dataset_name: selectedDataset.name,
        input_columns: inputColumns,
        context_columns: contextColumns,
        spec_columns: specColumns,
        id_column: idColumn || undefined,
        model_ids: selectedModelIds,
        ground_truth_dataset_id: groundTruthDatasetIds[0] || groundTruthDatasetId || undefined,
        ground_truth_dataset_ids: groundTruthDatasetIds,
        ground_truth_name: groundTruthName || t("results.humanExpert"),
        template: template || "",
        system_prompt: systemPrompt || "",
        task_type: taskType,
        eval_spec: {
          ...(initialLaunchConfig?.evalSpec || {}),
          spec_columns: specColumns,
        },
        sample_size: sampleSize,
        execution_mode: initialLaunchConfig?.executionMode || "sequential",
        model_temperatures: modelTemperatures || {},
      };
      if (editingTemplateId) {
        const updated = await updateExperimentTemplate(editingTemplateId, payload);
        setEditingTemplateId(updated.id);
      } else {
        const created = await createExperiment(payload, false);
        setEditingTemplateId(created.id);
      }
      setTemplateSavedFeedback(true);
      setTimeout(() => setTemplateSavedFeedback(false), 3000);
    } catch (err) {
      console.error("Error saving template step:", err);
    } finally {
      setSavingTemplateStep(false);
    }
  };

  const openTemplateSelector = async () => {
    setShowTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const list = await fetchExperiments();
      setTemplateCandidates(list);
    } catch (err) {
      console.error("Error loading experiment templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadExperimentAsTemplate = async (expId: string) => {
    setLoadingTemplateId(expId);
    try {
      const detail = await fetchExperimentDetail(expId);
      const matchedDataset = datasets.find((d) => d.id === detail.dataset_id) || null;
      setSelectedDataset(matchedDataset);
      setInputColumns(detail.input_columns || []);
      setContextColumns(detail.context_columns || []);
      setSpecColumns(
        Array.isArray(detail.eval_spec?.spec_columns)
          ? (detail.eval_spec.spec_columns as string[])
          : []
      );
      setIdColumn(detail.id_column || "");
      setGroundTruthDatasetId(detail.ground_truth_dataset_id || null);
      setGroundTruthDatasetIds(
        detail.ground_truth_dataset_ids && detail.ground_truth_dataset_ids.length > 0
          ? detail.ground_truth_dataset_ids
          : detail.ground_truth_dataset_id
          ? [detail.ground_truth_dataset_id]
          : []
      );
      setGroundTruthName(detail.ground_truth_name || t("results.humanExpert"));
      setGroundTruthSchema(null);
      setTemplate(detail.template || "");
      setSystemPrompt(detail.system_prompt || "");
      setTaskType(detail.task_type || "numeric_math");
      setSelectedModelIds(detail.model_ids || []);
      setModelTemperatures(detail.model_temperatures || {});
      setSampleSize(detail.sample_size || matchedDataset?.total_rows || 25);
      setInitialLaunchConfig({
        name: detail.status === "draft" ? detail.name : `${detail.name} (Copia)`,
        description: detail.description || "",
        executionMode: detail.execution_mode === "parallel" ? "parallel" : "sequential",
        evalSpec: detail.eval_spec || {},
      });
      setCurrentExperimentId(null);
      setIsTemplateMode(true);
      setEditingTemplateId(detail.status === "draft" ? detail.id : null);
      setTemplateSavedFeedback(false);
      setWizardLoadKey((k) => k + 1);
      setWizardStep(1);
      setCurrentMode("wizard");
      setShowTemplateModal(false);
    } catch (err) {
      console.error("Error loading template into wizard:", err);
    } finally {
      setLoadingTemplateId(null);
    }
  };

  const handleDeleteTemplate = async (expId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteExperiment(expId);
      setTemplateCandidates((prev) => prev.filter((item) => item.id !== expId));
    } catch (err) {
      console.error("Error deleting template:", err);
    }
  };

  // Auth verification on mount
  useEffect(() => {
    checkInitialAuth();
  }, []);

  // Sync dark theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const checkInitialAuth = async () => {
    setCheckingAuth(true);
    try {
      const data = await fetchMe();
      setCurrentUser(data.user);
      setUserConfig(data.config);
      applyUserConfig(data.config);
      await loadInitialData();
    } catch {
      setCurrentUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLoginSuccess = async (user: User, config: UserConfig) => {
    setCurrentUser(user);
    setUserConfig(config);
    applyUserConfig(config);
    await loadInitialData();
  };

  const applyUserConfig = (config: UserConfig) => {
    if (config.selected_models && config.selected_models.length > 0) {
      setSelectedModelIds(config.selected_models);
    }
    if (config.default_sample_size) {
      setSampleSize(config.default_sample_size);
    }
    if (config.default_task_type) {
      setTaskType(config.default_task_type === "aaker_dimensions" ? "aspect_polarity" : config.default_task_type);
    }
    if (config.api_keys) {
      setApiKeys(config.api_keys);
    }
    if (config.language) {
      syncWithUserConfig(config.language);
    }
  };

  const handleLogout = () => {
    removeToken();
    setCurrentUser(null);
    setUserConfig(null);
  };

  const loadInitialData = async () => {
    try {
      const [dsList, mList] = await Promise.all([fetchDatasets(), fetchModels()]);
      setDatasets(dsList);
      setAvailableModels(mList);
    } catch (err) {
      console.error("Error loading initial data:", err);
    }
  };

  const handleStartBenchmark = async () => {
    if (!selectedDataset || selectedModelIds.length === 0) return;

    setIsRunning(true);
    setSummaries({});
    setPairwiseList([]);
    setBestPerformers({});
    setCurrentMode("results");
    setResultsTab("leaderboard");

    // Sync selected models & config to PostgreSQL
    updateUserConfig({
      selected_models: selectedModelIds,
      default_sample_size: sampleSize,
      api_keys: apiKeys,
    }).catch(() => {});

    await runBenchmarkStream(
      {
        dataset_id: selectedDataset.id,
        model_ids: selectedModelIds,
        template,
        system_prompt: systemPrompt,
        sample_size: sampleSize,
        batch_size: batchSize,
        api_keys: apiKeys,
        task_type: taskType,
      },
      (eventType, data) => {
        if (eventType === "benchmark_start") {
          setTotalModels(data.models.length);
          setTotalSamples(data.total_samples);
        } else if (eventType === "model_start") {
          setCurrentModel(data.model_id);
          setModelIndex(data.model_index);
          setSampleIndex(0);
        } else if (eventType === "sample_update") {
          setSampleIndex(data.sample_index);
          setLatestResult(data.latest_result);
          setSummaries((prev) => ({
            ...prev,
            [data.model_id]: data.current_summary,
          }));
        } else if (eventType === "model_finished") {
          setSummaries((prev) => ({
            ...prev,
            [data.model_id]: data.summary,
          }));
        } else if (eventType === "benchmark_completed") {
          setIsRunning(false);
          setSummaries(data.summaries);
          setPairwiseList(data.pairwise_matrix);
          setBestPerformers(data.best_performers);
        }
      },
      (err) => {
        console.error("Benchmark stream error:", err);
        setIsRunning(false);
      }
    );
  };

  const handleLoadSavedBenchmark = (detail: SavedBenchmarkDetail) => {
    setSummaries(detail.model_summaries);
    setPairwiseList(detail.pairwise_matrix);
    setBestPerformers(detail.best_performers);
    setSelectedModelIds(detail.model_ids);
    setSampleSize(detail.sample_size);
    setTemplate(detail.template);
    setSystemPrompt(detail.system_prompt || "");
    setTaskType(detail.task_type);
    setCurrentMode("results");
    setResultsTab("leaderboard");
  };

  const handleInspectExperimentResults = (exp: ExperimentDetail) => {
    if (exp.summaries && Object.keys(exp.summaries).length > 0) {
      setSummaries(exp.summaries);
    }
    if (exp.pairwise_matrix && exp.pairwise_matrix.length > 0) {
      setPairwiseList(exp.pairwise_matrix);
    }
    if (exp.best_performers && Object.keys(exp.best_performers).length > 0) {
      setBestPerformers(exp.best_performers);
    }
    if (exp.template) {
      setTemplate(exp.template);
    }
    if (exp.system_prompt) {
      setSystemPrompt(exp.system_prompt);
    }
    if (exp.task_type) {
      setTaskType(exp.task_type);
    }
    if (exp.sample_size) {
      setSampleSize(exp.sample_size);
    }
    if (exp.model_ids && exp.model_ids.length > 0) {
      setSelectedModelIds(exp.model_ids);
    }
    const foundDs = datasets.find((d) => d.id === exp.dataset_id);
    if (foundDs) {
      setSelectedDataset(foundDs);
      setInputColumns(exp.input_columns || []);
      setContextColumns(exp.context_columns || []);
      setSpecColumns(exp.spec_columns || []);
      setIdColumn(exp.id_column || "");
    }
    setCurrentExperimentDetail(exp);
    setCurrentExperimentId(exp.id);
    setCurrentMode("results");
    setResultsTab("leaderboard");
  };

  const handleRecalculateMetrics = async (newSpec?: Record<string, any>) => {
    if (!currentExperimentId) return;
    try {
      setIsRecalculating(true);
      const updated = await recalculateExperimentMetrics(currentExperimentId, newSpec);
      handleInspectExperimentResults(updated);
    } catch (err) {
      console.error("Error al recalcular métricas:", err);
      alert("Error al recalcular métricas del experimento.");
    } finally {
      setIsRecalculating(false);
    }
  };

  // If loading or not logged in, show login page
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    const loadNotifs = () => {
      fetchNotifications()
        .then((res) => setNotifications(res.notifications || []))
        .catch(() => {});
    };
    loadNotifs();
    const timer = setInterval(loadNotifs, 15000);
    return () => clearInterval(timer);
  }, [currentUser]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground spatial-mesh">
        <Card className="glass-panel border-border/80 shadow-2xl p-6 flex items-center gap-3">
          <Database className="w-5 h-5 text-primary animate-pulse" />
          <span className="text-xs font-semibold text-muted-foreground">
            Verificando sesión segura con PostgreSQL...
          </span>
        </Card>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const hasBenchmarkResults = Object.keys(summaries).length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans relative overflow-x-hidden">
      {/* Monograph Double-Ruled Editorial Masthead */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-t-[3px] border-t-foreground border-b border-b-foreground/85">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left Editorial Masthead & Active Dataset Telemetry */}
          <button
            type="button"
            onClick={() => setCurrentMode("dashboard")}
            title={t("nav.experiments")}
            className="flex items-center gap-3 text-left py-0.5 rounded hover:opacity-90 transition-opacity cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0"
          >
            <img
              src="/favicon.svg?v=3.0"
              alt="CalibrAI Logo"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-sm shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-serif font-bold text-base sm:text-lg tracking-tight text-foreground group-hover:text-primary transition-colors truncate">
                  CalibrAI
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
                {selectedDataset ? (
                  <span className="truncate max-w-[180px] sm:max-w-[240px] text-foreground flex items-center gap-1">
                    <Database className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-medium text-foreground truncate">{selectedDataset.name}</span>
                    <span className="text-muted-foreground shrink-0">(N = {selectedDataset.total_rows.toLocaleString()})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1 truncate">
                    <Database className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{t("nav.noDatasetLoaded")}</span>
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Center Monograph Section Navigation (Responsive on both mobile and desktop) */}
          <nav aria-label="Secciones principales" className="order-3 md:order-2 w-full md:w-auto flex items-center justify-between md:justify-start gap-1 border border-border bg-card/80 p-1 rounded-sm">
            <button
              type="button"
              onClick={() => setCurrentMode("dashboard")}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-serif transition-colors cursor-pointer rounded-sm ${
                currentMode === "dashboard"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-foreground/80 hover:text-foreground hover:bg-muted/60 font-medium"
              }`}
            >
              <span className="font-mono text-[10px] opacity-80">I.</span>
              <span>{t("nav.experiments")}</span>
            </button>

            <button
              type="button"
              disabled={!selectedDataset && currentMode !== "wizard"}
              onClick={() => {
                if (selectedDataset) {
                  setCurrentMode("wizard");
                }
              }}
              title={
                !selectedDataset && currentMode !== "wizard"
                  ? t("nav.tooltipNewBenchmark")
                  : undefined
              }
              className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-serif transition-colors rounded-sm ${
                !selectedDataset && currentMode !== "wizard"
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : currentMode === "wizard"
                  ? "bg-primary text-primary-foreground font-bold cursor-pointer"
                  : "text-foreground/80 hover:text-foreground hover:bg-muted/60 font-medium cursor-pointer"
              }`}
            >
              <span className="font-mono text-[10px] opacity-80">II.</span>
              <span>{t("nav.newBenchmark")}</span>
              {currentMode === "wizard" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono bg-background/20 text-primary-foreground border-primary-foreground/30">
                  {wizardStep}/4
                </Badge>
              )}
            </button>

            <button
              type="button"
              disabled={!selectedDataset || !hasBenchmarkResults}
              onClick={() => {
                if (selectedDataset && hasBenchmarkResults) {
                  setCurrentMode("results");
                  setResultsTab("leaderboard");
                }
              }}
              title={
                !selectedDataset
                  ? t("nav.tooltipResultsNoDataset")
                  : !hasBenchmarkResults
                  ? t("nav.tooltipResultsNoData")
                  : undefined
              }
              className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-serif transition-colors rounded-sm ${
                !selectedDataset || !hasBenchmarkResults
                  ? "opacity-40 cursor-not-allowed text-muted-foreground"
                  : currentMode === "results"
                  ? "bg-primary text-primary-foreground font-bold cursor-pointer"
                  : "text-foreground/80 hover:text-foreground hover:bg-muted/60 font-medium cursor-pointer"
              }`}
            >
              <span className="font-mono text-[10px] opacity-80">III.</span>
              <span>{t("nav.resultsMatrix")}</span>
              {hasBenchmarkResults && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 font-mono ${
                    currentMode === "results"
                      ? "bg-background/20 text-primary-foreground border-primary-foreground/30"
                      : "bg-muted text-foreground border-border"
                  }`}
                >
                  {Object.keys(summaries).length}
                </Badge>
              )}
            </button>
          </nav>

          {/* Right Action Suite */}
          <div className="order-2 md:order-3 flex items-center gap-1 sm:gap-1.5 shrink-0">
            {isRunning && (
              <Badge
                variant="outline"
                className="flex items-center gap-1.5 px-2 py-0.5 border-primary/40 bg-primary/10 text-primary text-[11px] font-mono"
              >
                <Activity className="w-3 h-3 animate-pulse" />
                <span className="hidden sm:inline">Streaming SSE</span>
              </Badge>
            )}

            {/* Saved Benchmarks Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSavedModal(true)}
              className="text-xs font-medium gap-1.5 h-8 bg-card hover:bg-muted border-border rounded-sm transition-colors"
              title={t("saved.viewHistoryTooltip")}
            >
              <Bookmark className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">{t("saved.history")}</span>
            </Button>

            {/* Save Current Benchmark Button */}
            {hasBenchmarkResults && (
              <Button
                size="sm"
                onClick={() => setShowSavedModal(true)}
                className="text-xs font-medium gap-1.5 h-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm transition-colors"
                title={t("saved.saveResultsTooltip")}
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("common.save")}</span>
              </Button>
            )}

            {/* User Session / Profile Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 bg-card hover:bg-muted text-xs border-border font-mono font-medium rounded-sm transition-colors"
              title={t("profile.openTooltip")}
            >
              <UserIcon className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline text-foreground">{currentUser.username}</span>
            </Button>

            {/* Notifications Bell */}
            <DropdownMenu onOpenChange={(open) => {
              if (open && currentUser) {
                fetchNotifications().then((res) => setNotifications(res.notifications || [])).catch(() => {});
              }
            }}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-8 w-8 rounded-sm border-border bg-card text-foreground hover:bg-muted transition-colors"
                  title={t("notifications.title")}
                >
                  <Bell className="w-3.5 h-3.5" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 bg-card border border-border rounded-sm shadow-none p-1">
                <DropdownMenuLabel className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1.5 flex items-center justify-between">
                  <span>{t("notifications.title")}</span>
                  <span className="tabular-nums">{notifications.length}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border my-1" />
                {notifications.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t("notifications.empty")}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-sm hover:bg-muted/60 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-primary">
                            {n.type === "experiment_completed"
                              ? t("notifications.expCompleted")
                              : n.type === "dataset_shared"
                                ? t("notifications.datasetShared", { username: n.from_username || "" })
                                : t("notifications.expShared", { username: n.from_username || "" })}
                          </div>
                          <div className="text-xs font-medium text-foreground truncate">
                            {n.title}
                          </div>
                        </div>

                        {n.type === "experiment_completed" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-sm border-border shrink-0"
                            title={t("notifications.viewExperiment")}
                            onClick={async () => {
                              try {
                                await markExperimentNotificationRead(n.resource_id);
                                setNotifications((prev) => prev.filter((item) => item.id !== n.id));
                                const detail = await fetchExperimentDetail(n.resource_id);
                                handleInspectExperimentResults(detail);
                              } catch (err) {
                                console.error("Error opening completed experiment:", err);
                              }
                            }}
                          >
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}

                        {n.type === "dataset_shared" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] rounded-sm border-border shrink-0"
                            onClick={() => {
                              setCurrentMode("dashboard");
                              setOpenDatasetsSignal((k) => k + 1);
                            }}
                          >
                            {t("notifications.openDatasets")}
                          </Button>
                        )}

                        {n.type === "experiment_shared" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-sm border-border shrink-0"
                            title={t("notifications.openExperiment")}
                            onClick={async () => {
                              try {
                                const detail = await fetchExperimentDetail(n.resource_id);
                                handleInspectExperimentResults(detail);
                              } catch {
                                setCurrentMode("dashboard");
                              }
                            }}
                          >
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language Selector (only short code: ES, UK, US) */}
            <LanguageSelector variant="outline" showLabel={false} />

            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              className="h-8 w-8 rounded-sm border-border bg-card text-foreground hover:bg-muted transition-colors"
              title={t("nav.toggleTheme")}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>

            {/* Logout */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title={t("auth.logout")}
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>


        {currentMode === "wizard" && (
          <div className="border-t border-border bg-card/60 py-2 px-4 sm:px-6 overflow-x-auto no-scrollbar">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 min-w-[700px]">
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMode("dashboard")}
                  className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md shrink-0 transition-all duration-150"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t("wizard.exitToExperiments")}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openTemplateSelector}
                  className="text-xs h-7 gap-1.5 border-border bg-card hover:bg-muted text-foreground rounded-md shrink-0 transition-all duration-150"
                  title={t("templates.modalDesc")}
                >
                  <FileCode className="w-3 h-3 text-primary" />
                  <span>{t("templates.loadTemplate")}</span>
                </Button>
              </div>

              <div className="h-4 w-px bg-border mx-1 shrink-0" />

              {/* Minimal Architectural Stepper */}
              <div className="flex items-center gap-1.5">
                {/* Step 1: Dataset & Columnas */}
                <button
                  type="button"
                  id="wizard-step-1-btn"
                  onClick={() => setWizardStep(1)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer border ${
                    wizardStep === 1
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : isStep1Valid
                      ? "bg-muted/40 text-foreground border-border hover:bg-muted"
                      : "bg-transparent text-muted-foreground border-border/50"
                  }`}
                >
                  {isStep1Valid && wizardStep !== 1 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded bg-foreground/10 font-mono flex items-center justify-center text-[10px]">1</span>
                  )}
                  <Database className="w-3.5 h-3.5" />
                  <span>{t("wizard.step1Nav")}</span>
                </button>

                <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                {/* Step 2: Prompt & Métricas */}
                <button
                  type="button"
                  id="wizard-step-2-btn"
                  disabled={!isStep1Valid}
                  onClick={() => isStep1Valid && setWizardStep(2)}
                  title={!isStep1Valid ? t("wizard.step1Tooltip") : ""}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 border ${
                    wizardStep === 2
                      ? "bg-primary text-primary-foreground border-primary font-semibold cursor-pointer"
                      : isStep2Valid
                      ? "bg-muted/40 text-foreground border-border hover:bg-muted cursor-pointer"
                      : isStep1Valid
                      ? "bg-transparent text-foreground/80 border-border hover:bg-muted cursor-pointer"
                      : "opacity-40 cursor-not-allowed text-muted-foreground border-border/40"
                  }`}
                >
                  {!isStep1Valid ? (
                    <Lock className="w-3 h-3 text-muted-foreground/60" />
                  ) : isStep2Valid && wizardStep !== 2 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded bg-foreground/10 font-mono flex items-center justify-center text-[10px]">2</span>
                  )}
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{t("wizard.step2Nav")}</span>
                </button>

                <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                {/* Step 3: Modelos & Hardware */}
                <button
                  type="button"
                  id="wizard-step-3-btn"
                  disabled={!isStep2Valid}
                  onClick={() => isStep2Valid && setWizardStep(3)}
                  title={!isStep2Valid ? t("wizard.step2Tooltip") : ""}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 border ${
                    wizardStep === 3
                      ? "bg-primary text-primary-foreground border-primary font-semibold cursor-pointer"
                      : isStep3Valid
                      ? "bg-muted/40 text-foreground border-border hover:bg-muted cursor-pointer"
                      : isStep2Valid
                      ? "bg-transparent text-foreground/80 border-border hover:bg-muted cursor-pointer"
                      : "opacity-40 cursor-not-allowed text-muted-foreground border-border/40"
                  }`}
                >
                  {!isStep2Valid ? (
                    <Lock className="w-3 h-3 text-muted-foreground/60" />
                  ) : isStep3Valid && wizardStep !== 3 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded bg-foreground/10 font-mono flex items-center justify-center text-[10px]">3</span>
                  )}
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{t("wizard.step3Nav")}</span>
                </button>

                <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

                {/* Step 4: Lanzar */}
                <button
                  type="button"
                  id="wizard-step-4-btn"
                  disabled={!isStep3Valid}
                  onClick={() => isStep3Valid && setWizardStep(4)}
                  title={!isStep3Valid ? t("wizard.step3Tooltip") : ""}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 border ${
                    wizardStep === 4
                      ? "bg-primary text-primary-foreground border-primary font-semibold cursor-pointer"
                      : isStep3Valid
                      ? "bg-transparent text-foreground/80 border-border hover:bg-muted cursor-pointer"
                      : "opacity-40 cursor-not-allowed text-muted-foreground border-border/40"
                  }`}
                >
                  {!isStep3Valid ? (
                    <Lock className="w-3 h-3 text-muted-foreground/60" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded bg-foreground/10 font-mono flex items-center justify-center text-[10px]">4</span>
                  )}
                  <Rocket className="w-3.5 h-3.5" />
                  <span>{t("wizard.step4Nav")}</span>
                </button>
              </div>

              <Badge variant="outline" className="hidden lg:flex items-center text-[11px] text-muted-foreground font-mono bg-muted/20 border-border">
                {t("nav.stepProgress", { step: wizardStep })}
              </Badge>
            </div>
          </div>
        )}

        {currentMode === "results" && (
          <div className="border-t border-border bg-card/60 py-2 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentMode("dashboard")}
                  className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all duration-150"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t("wizard.exitToExperiments")}</span>
                </Button>

                <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

                <div className="flex items-center bg-muted/40 p-0.5 rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setResultsTab("leaderboard")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm transition-all duration-150 cursor-pointer ${
                      activeResultsTab === "leaderboard"
                        ? "bg-card text-foreground border border-border font-semibold shadow-none"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>{t("results.tabLeaderboard")}</span>
                    {Object.keys(summaries).length > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1 py-0 font-mono bg-muted text-muted-foreground border border-border"
                      >
                        {Object.keys(summaries).length}
                      </Badge>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultsTab("matrix")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm transition-all duration-150 cursor-pointer ${
                      activeResultsTab === "matrix"
                        ? "bg-card text-foreground border border-border font-semibold shadow-none"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>{t("results.tabMatrix")}</span>
                    {pairwiseList.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1 py-0 font-mono bg-muted text-muted-foreground border border-border"
                      >
                        {pairwiseList.length}
                      </Badge>
                    )}
                  </button>

                  {isQualitativeValidation && (
                    <button
                      type="button"
                      onClick={() => setResultsTab("methodology")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm transition-all duration-150 cursor-pointer ${
                        activeResultsTab === "methodology"
                          ? "bg-card text-foreground border border-border font-semibold shadow-none"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <span>4 Pilares Metodológicos</span>
                    </button>
                  )}
                </div>
              </div>

              {currentExperimentId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculateMetrics}
                  disabled={isRecalculating}
                  className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-foreground border-border hover:bg-muted/50 rounded-md transition-all font-mono"
                  title="Recalcular métricas sobre las respuestas ya generadas sin reejecutar inferencias"
                >
                  <RefreshCw className={`w-3 h-3 ${isRecalculating ? "animate-spin text-primary" : ""}`} />
                  <span>{isRecalculating ? "Recalculando..." : "Recalcular Métricas"}</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content View */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6 relative z-10">
        {/* DASHBOARD MODE: Experiments List & Monitor */}
        {currentMode === "dashboard" && (
          <ExperimentDashboard
            onNewExperiment={startNewExperiment}
            onNewFromTemplate={openTemplateSelector}
            onNewTemplate={startNewTemplate}
            onUseAsTemplate={(exp) => loadExperimentAsTemplate(exp.id)}
            onInspectExperimentResults={handleInspectExperimentResults}
            availableModels={availableModels}
            openDatasetsSignal={openDatasetsSignal}
          />
        )}

        {/* WIZARD MODE: Strictly Sequential 4 Steps */}
        {currentMode === "wizard" && (
          <>
            {/* Step 1: Dataset & Columns */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <DatasetViewer
                  datasets={datasets}
                  selectedDataset={selectedDataset}
                  onSelectDataset={(ds) => {
                    setSelectedDataset(ds);
                    if (ds) {
                      setSampleSize(ds.total_rows);
                    }
                    setInputColumns([]);
                    setContextColumns([]);
                    setSpecColumns([]);
                    const detectedId =
                      ds?.detected_id_column ||
                      ds?.columns.find((c) => c.is_id_candidate)?.name ||
                      ds?.columns.find((c) => c.is_unique)?.name ||
                      "";
                    setIdColumn(detectedId);
                    setTemplate("");
                  }}
                  inputColumns={inputColumns}
                  setInputColumns={setInputColumns}
                  contextColumns={contextColumns}
                  setContextColumns={setContextColumns}
                  specColumns={specColumns}
                  setSpecColumns={setSpecColumns}
                  idColumn={idColumn}
                  setIdColumn={setIdColumn}
                  onRefreshDatasets={loadInitialData}
                  groundTruthDatasetId={groundTruthDatasetId}
                  setGroundTruthDatasetId={setGroundTruthDatasetId}
                  groundTruthDatasetIds={groundTruthDatasetIds}
                  setGroundTruthDatasetIds={setGroundTruthDatasetIds}
                  groundTruthName={groundTruthName}
                  setGroundTruthName={setGroundTruthName}
                  onGroundTruthSchemaDetected={setGroundTruthSchema}
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMode("dashboard")}
                    className="h-9 px-4 text-xs font-semibold rounded-sm"
                  >
                    {t("wizard.cancelAndExit")}
                  </Button>

                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {!isStep1Valid && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        {t("wizard.step1Warning")}
                      </span>
                    )}
                    {isTemplateMode && selectedDataset && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingTemplateStep}
                        onClick={handleSaveTemplateStep}
                        className="h-10 px-4 text-xs font-semibold rounded-sm gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {savingTemplateStep
                            ? t("templates.savingTemplate")
                            : templateSavedFeedback
                            ? t("templates.savedTemplateOk")
                            : t("templates.saveTemplateStep")}
                        </span>
                      </Button>
                    )}
                    <Button
                      id="btn-continue-prompt"
                      disabled={!isStep1Valid}
                      onClick={() => setWizardStep(2)}
                      className={`gap-2 h-10 px-5 text-xs font-bold rounded-sm transition-colors ${
                        isStep1Valid
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span>{t("wizard.continueToStep2")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Prompt Editor & Evaluation Spec */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                {selectedDataset && (
                  <PromptEditor
                    key={`prompt-${wizardLoadKey}`}
                    dataset={selectedDataset}
                    inputColumns={inputColumns}
                    contextColumns={contextColumns}
                    specColumns={specColumns}
                    template={template}
                    setTemplate={setTemplate}
                    systemPrompt={systemPrompt}
                    setSystemPrompt={setSystemPrompt}
                    taskType={taskType}
                    setTaskType={setTaskType}
                    groundTruthDatasetId={groundTruthDatasetId}
                    groundTruthDatasetIds={groundTruthDatasetIds}
                    groundTruthSchema={groundTruthSchema}
                    idColumn={idColumn}
                  />
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <Button
                    id="btn-back-dataset"
                    variant="secondary"
                    size="sm"
                    onClick={() => setWizardStep(1)}
                    className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t("wizard.backToStep1")}</span>
                  </Button>

                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {!isStep2Valid && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        {t("wizard.step2Warning")}
                      </span>
                    )}
                    {isTemplateMode && selectedDataset && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingTemplateStep}
                        onClick={handleSaveTemplateStep}
                        className="h-10 px-4 text-xs font-semibold rounded-sm gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {savingTemplateStep
                            ? t("templates.savingTemplate")
                            : templateSavedFeedback
                            ? t("templates.savedTemplateOk")
                            : t("templates.saveTemplateStep")}
                        </span>
                      </Button>
                    )}
                    <Button
                      id="btn-continue-models"
                      disabled={!isStep2Valid}
                      onClick={() => setWizardStep(3)}
                      className={`gap-2 h-10 px-5 text-xs font-bold rounded-sm transition-colors ${
                        isStep2Valid
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span>{t("wizard.continueToStep3")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Models & Sample Size & Hardware sizing */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                {selectedDataset && (
                  <ModelSelector
                    availableModels={availableModels}
                    setAvailableModels={setAvailableModels}
                    selectedModelIds={selectedModelIds}
                    setSelectedModelIds={setSelectedModelIds}
                    modelTemperatures={modelTemperatures}
                    setModelTemperatures={setModelTemperatures}
                    sampleSize={sampleSize}
                    setSampleSize={setSampleSize}
                    maxSamples={selectedDataset.total_rows}
                    batchSize={batchSize}
                    setBatchSize={setBatchSize}
                    apiKeys={apiKeys}
                    setApiKeys={setApiKeys}
                    onStartBenchmark={handleStartBenchmark}
                    isRunning={isRunning}
                    selectedDataset={selectedDataset}
                    inputTextColumns={inputColumns}
                    contextColumns={contextColumns}
                    template={template}
                    systemPrompt={systemPrompt}
                    taskType={taskType}
                  />
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <Button
                    id="btn-back-prompt"
                    variant="secondary"
                    size="sm"
                    onClick={() => setWizardStep(2)}
                    className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t("wizard.backToStep2")}</span>
                  </Button>

                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {!isStep3Valid && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        {t("wizard.step3Warning")}
                      </span>
                    )}
                    {isTemplateMode && selectedDataset && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingTemplateStep}
                        onClick={handleSaveTemplateStep}
                        className="h-10 px-4 text-xs font-semibold rounded-sm gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {savingTemplateStep
                            ? t("templates.savingTemplate")
                            : templateSavedFeedback
                            ? t("templates.savedTemplateOk")
                            : t("templates.saveTemplateStep")}
                        </span>
                      </Button>
                    )}
                    <Button
                      id="btn-continue-launch"
                      disabled={!isStep3Valid}
                      onClick={() => setWizardStep(4)}
                      className={`gap-2 h-10 px-5 text-xs font-bold rounded-sm transition-colors ${
                        isStep3Valid
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span>{isTemplateMode ? t("templates.executeFromTemplate") : t("wizard.continueToStep4")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Launch Experiment & Execution Strategy */}
            {wizardStep === 4 && (
              <LaunchExperimentView
                key={`launch-${wizardLoadKey}`}
                dataset={selectedDataset}
                inputColumns={inputColumns}
                contextColumns={contextColumns}
                specColumns={specColumns}
                idColumn={idColumn}
                selectedModelIds={selectedModelIds}
                modelTemperatures={modelTemperatures}
                availableModels={availableModels}
                template={template}
                systemPrompt={systemPrompt}
                taskType={taskType}
                sampleSize={sampleSize}
                setSampleSize={setSampleSize}
                availableDatasets={datasets}
                groundTruthDatasetId={groundTruthDatasetId}
                groundTruthDatasetIds={groundTruthDatasetIds}
                groundTruthName={groundTruthName}
                initialConfig={initialLaunchConfig}
                onLaunchSuccess={() => setCurrentMode("dashboard")}
                onBackToModels={() => setWizardStep(3)}
                onBackToPrompt={() => setWizardStep(3)}
              />
            )}
          </>
        )}

        {/* RESULTS MODE: Leaderboard & Pairwise Matrix */}
        {currentMode === "results" && (
          <>
            {activeResultsTab === "leaderboard" && (
              <div className="space-y-6">
                {isRunning && (
                  <LiveBenchmarkView
                    currentModel={currentModel}
                    modelIndex={modelIndex}
                    totalModels={totalModels}
                    sampleIndex={sampleIndex}
                    totalSamples={totalSamples}
                    latestResult={latestResult}
                    isRunning={isRunning}
                  />
                )}

                <Leaderboard
                  summaries={summaries}
                  bestPerformers={bestPerformers}
                  experimentName={currentExperimentDetail?.name}
                  datasetName={selectedDataset?.name || currentExperimentDetail?.dataset_name}
                  template={template || currentExperimentDetail?.template}
                  systemPrompt={systemPrompt || currentExperimentDetail?.system_prompt}
                  inputColumns={inputColumns.length > 0 ? inputColumns : currentExperimentDetail?.input_columns}
                  contextColumns={contextColumns.length > 0 ? contextColumns : currentExperimentDetail?.context_columns}
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  {hasBenchmarkResults && (
                    <Button
                      id="btn-save-benchmark"
                      variant="outline"
                      onClick={() => setShowSavedModal(true)}
                      className="gap-2 h-10 px-4 text-xs font-bold border-border bg-card hover:bg-muted text-foreground rounded-sm transition-colors"
                    >
                      <Save className="w-4 h-4 text-primary" />
                      <span>{t("results.saveToPostgres")}</span>
                    </Button>
                  )}

                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {pairwiseList.length > 0 && (
                      <Button
                        id="btn-continue-matrix"
                        onClick={() => setResultsTab("matrix")}
                        variant="secondary"
                        className="gap-2 h-10 px-4 text-xs font-semibold rounded-sm border border-border"
                      >
                        <Grid className="w-4 h-4 text-muted-foreground" />
                        <span>{t("results.viewMatrix")}</span>
                      </Button>
                    )}

                    {isQualitativeValidation && (
                      <Button
                        id="btn-view-methodology"
                        onClick={() => setResultsTab("methodology")}
                        className="gap-2 h-10 px-5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>4 Pilares Metodológicos</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeResultsTab === "matrix" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setResultsTab("leaderboard")}
                    className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t("results.backToLeaderboard")}</span>
                  </Button>

                  {isQualitativeValidation && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResultsTab("methodology")}
                      className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5 border-border"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <span>Ver 4 Pilares Metodológicos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <PairwiseMatrix
                  pairwiseList={pairwiseList}
                  modelIds={selectedModelIds}
                  experimentId={currentExperimentId || undefined}
                />
              </div>
            )}

            {activeResultsTab === "methodology" && isQualitativeValidation && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setResultsTab("leaderboard")}
                    className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t("results.backToLeaderboard")}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResultsTab("matrix")}
                    className="h-9 px-4 text-xs font-semibold rounded-sm gap-1.5 border-border"
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Ver Matriz 1 vs 1</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <ValidationMethodologyView
                  summaries={summaries}
                  pairwiseList={pairwiseList}
                  selectedModelIds={selectedModelIds}
                  experimentId={currentExperimentId || undefined}
                  evalSpec={currentExperimentDetail?.eval_spec}
                  onRecalculate={handleRecalculateMetrics}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Saved Benchmarks Modal */}
      {showSavedModal && (
        <React.Suspense fallback={null}>
          <SavedBenchmarksModal
            isOpen={showSavedModal}
            onClose={() => setShowSavedModal(false)}
            canSaveCurrent={hasBenchmarkResults}
            currentData={
              selectedDataset && hasBenchmarkResults
                ? {
                    datasetId: selectedDataset.id,
                    datasetName: selectedDataset.name,
                    taskType: taskType,
                    template: template,
                    systemPrompt: systemPrompt,
                    modelIds: selectedModelIds,
                    sampleSize: sampleSize,
                    modelSummaries: summaries,
                    pairwiseMatrix: pairwiseList,
                    bestPerformers: bestPerformers,
                  }
                : undefined
            }
            onLoadBenchmark={handleLoadSavedBenchmark}
          />
        </React.Suspense>
      )}

      {/* Experiment Templates Selector Modal (strictly saved templates, never executed experiments) */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-2xl max-h-[82vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-serif">
              <FileCode className="w-4 h-4 text-primary" />
              <span>{t("templates.modalTitle")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("templates.modalDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{t("templates.loading")}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("templates.savedHeading", {
                    count: templateCandidates.filter((e) => e.status === "draft").length,
                  })}
                </div>
                {templateCandidates.filter((e) => e.status === "draft").length === 0 ? (
                  <div className="p-4 rounded-md border border-dashed border-border text-xs text-muted-foreground text-center space-y-1">
                    <div className="font-medium text-foreground">{t("templates.emptyTitle")}</div>
                    <div>{t("templates.emptyHint")}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templateCandidates
                      .filter((e) => e.status === "draft")
                      .map((tpl) => (
                        <div
                          key={tpl.id}
                          onClick={() => loadExperimentAsTemplate(tpl.id)}
                          className="p-3 rounded-md border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] border-primary/40 bg-primary/10 text-primary">
                                {t("templates.badgeLabel")}
                              </Badge>
                              <span className="text-xs font-semibold text-foreground truncate">{tpl.name}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>{t("templates.datasetPrefix")} {tpl.dataset_name || tpl.dataset_id}</span>
                              <span>{t("templates.modelsPrefix")} {tpl.model_ids?.length || 0}</span>
                              <span>{t("templates.samplesPrefix")} {tpl.sample_size}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              disabled={loadingTemplateId === tpl.id}
                              className="h-7 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              {loadingTemplateId === tpl.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                t("templates.loadBtn")
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title={t("templates.deleteBtn")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={currentUser}
        onProfileUpdated={(updatedUser, updatedConfig) => {
          setCurrentUser(updatedUser);
          syncWithUserConfig(updatedConfig.language);
        }}
      />

    </div>
  );
}

export default App;
