import React, { useState, useEffect } from "react";
import {
  ExperimentSummary,
  ExperimentDetail,
  ModelCatalogItem,
} from "../types";
import {
  fetchExperiments,
  fetchExperimentDetail,
  startExperiment,
  pauseExperiment,
  resumeExperiment,
  deleteExperiment,
  subscribeToExperimentStream,
} from "../services/api";
import { useTranslation } from "../i18n";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Plus,
  Layers,
  Bot,
  FileCode,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  Activity,
  ChevronRight,
  Filter,
  CheckSquare,
  ShieldCheck,
  RefreshCw,
  Zap,
  ListOrdered,
  Tag,
  Key,
  Loader2,
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
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExperimentDashboardProps {
  onNewExperiment: () => void;
  onNewFromTemplate?: () => void;
  onNewTemplate?: () => void;
  onUseAsTemplate?: (exp: ExperimentSummary) => void;
  onInspectExperimentResults: (exp: ExperimentDetail) => void;
  availableModels: ModelCatalogItem[];
}

export const ExperimentDashboard: React.FC<ExperimentDashboardProps> = ({
  onNewExperiment,
  onNewFromTemplate,
  onNewTemplate,
  onUseAsTemplate,
  onInspectExperimentResults,
  availableModels,
}) => {
  const { t } = useTranslation();
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeExpDetail, setActiveExpDetail] = useState<ExperimentDetail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Load experiments on mount and on poll
  const loadExperimentsList = async () => {
    try {
      const data = await fetchExperiments(statusFilter === "all" ? undefined : statusFilter);
      setExperiments(data);
    } catch (err) {
      console.error("Error loading experiments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExperimentsList();
    // Poll every 3 seconds to keep progress and queue state live
    const interval = setInterval(loadExperimentsList, 3000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  // Handle Pause
  const handlePause = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoadingId(id);
    try {
      await pauseExperiment(id);
      await loadExperimentsList();
    } catch (err) {
      console.error("Error pausing experiment:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Resume
  const handleResume = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoadingId(id);
    try {
      await resumeExperiment(id);
      await loadExperimentsList();
    } catch (err) {
      console.error("Error resuming experiment:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("dashboard.confirmDeleteExp"))) return;
    setActionLoadingId(id);
    try {
      await deleteExperiment(id);
      await loadExperimentsList();
      if (activeExpDetail?.id === id) {
        setShowDetailModal(false);
      }
    } catch (err) {
      console.error("Error deleting experiment:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open detail / live stream inspector (or go straight to results if completed)
  const handleViewDetail = async (expSummary: ExperimentSummary) => {
    try {
      const detail = await fetchExperimentDetail(expSummary.id);
      if (detail.status === "completed") {
        onInspectExperimentResults(detail);
      } else {
        setActiveExpDetail(detail);
        setShowDetailModal(true);
      }
    } catch (err) {
      console.error("Error loading experiment detail:", err);
    }
  };

  // Helper status badge renderer
  const renderStatusBadge = (status: string, progress: number) => {
    switch (status) {
      case "running":
        return (
          <Badge variant="outline" className="border-border bg-muted/40 text-foreground text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t("dashboard.statusRunning", { progress: progress.toFixed(0) })}</span>
          </Badge>
        );
      case "queued":
        return (
          <Badge variant="outline" className="border-border bg-muted/20 text-muted-foreground text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>{t("dashboard.statusQueued")}</span>
          </Badge>
        );
      case "paused":
        return (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <Pause className="w-3 h-3 text-muted-foreground" />
            <span>{t("dashboard.statusPaused")}</span>
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="border-border bg-muted/60 text-foreground text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
            <span>{t("dashboard.statusCompleted")}</span>
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <AlertCircle className="w-3 h-3" />
            <span>{t("dashboard.statusFailed")}</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[11px] font-medium gap-1.5 py-0.5 rounded-md">
            <FileCode className="w-3 h-3" />
            <span>{t("templates.badgeLabel")}</span>
          </Badge>
        );
    }
  };

  const runningCount = experiments.filter((e) => e.status === "running").length;
  const queuedCount = experiments.filter((e) => e.status === "queued").length;
  const pausedCount = experiments.filter((e) => e.status === "paused").length;
  const completedCount = experiments.filter((e) => e.status === "completed").length;
  const draftCount = experiments.filter((e) => e.status === "draft").length;

  return (
    <div className="space-y-6">
      {/* Top Editorial Monograph Abstract & Overview Command Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b-2 border-foreground/85">
        <div className="lg:col-span-5 p-5 rounded-none bg-secondary/60 border border-border ring-1 ring-inset ring-primary/25 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              {t("dashboard.title")}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("dashboard.subtitle")}
            </p>
          </div>
          <div className="pt-2 grid grid-cols-1 sm:inline-grid sm:grid-cols-[max-content_max-content] gap-2">
            <Button
              type="button"
              onClick={onNewExperiment}
              className="h-9 w-full px-3.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 rounded-sm cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("dashboard.createExperiment")}</span>
            </Button>
            {onNewFromTemplate && (
              <Button
                type="button"
                variant="outline"
                onClick={onNewFromTemplate}
                className="h-9 w-full px-3.5 text-xs font-semibold border-border bg-card hover:bg-muted text-foreground gap-1.5 rounded-sm cursor-pointer transition-colors"
              >
                <FileCode className="w-3.5 h-3.5 text-primary" />
                <span>{t("templates.fromTemplate")}</span>
              </Button>
            )}
            {onNewTemplate && (
              <Button
                type="button"
                variant="outline"
                onClick={onNewTemplate}
                className="h-9 w-full px-3.5 text-xs font-semibold border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary gap-1.5 rounded-sm cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("templates.createTemplate")}</span>
              </Button>
            )}
          </div>
        </div>

        {/* 4 Booktabs Top-Ruled Monograph Figures */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-5 items-start">
          <div className="border-t-2 border-foreground pt-3 space-y-1">
            <span className="font-serif text-xs font-semibold text-muted-foreground block">
              I. {t("dashboard.kpiTotal")}
            </span>
            <div className="font-serif text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {experiments.length}
            </div>
            <span className="text-[11px] font-mono text-[#1E3A5F] dark:text-[#7BA3D4] font-medium block">
              Registro PostgreSQL
            </span>
          </div>

          <div className="border-t-2 border-foreground pt-3 space-y-1">
            <span className="font-serif text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              <span>II. {t("dashboard.kpiRunning")}</span>
            </span>
            <div className="font-serif text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {runningCount}
            </div>
            <span className="text-[11px] font-mono text-[#1E3A5F] dark:text-[#7BA3D4] font-medium block">
              Inferencia SSE activa
            </span>
          </div>

          <div className="border-t-2 border-foreground pt-3 space-y-1">
            <span className="font-serif text-xs font-semibold text-muted-foreground block">
              III. {t("dashboard.kpiQueued")}
            </span>
            <div className="font-serif text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {queuedCount + pausedCount}
            </div>
            <span className="text-[11px] font-mono text-[#1E3A5F] dark:text-[#7BA3D4] font-medium block">
              En cola / pausados
            </span>
          </div>

          <div className="border-t-2 border-primary pt-3 space-y-1">
            <span className="font-serif text-xs font-semibold text-primary block">
              IV. {t("dashboard.kpiCompleted")}
            </span>
            <div className="font-serif text-3xl font-bold tracking-tight text-primary tabular-nums">
              {completedCount}
            </div>
            <span className="text-[11px] font-mono text-[#1E3A5F] dark:text-[#7BA3D4] font-medium block">
              Auditables
            </span>
          </div>
        </div>
      </section>

      {/* Filter bar & list */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-card rounded-sm border border-border flex-wrap">
          {[
            { id: "all", label: t("common.all"), count: experiments.length },
            { id: "draft", label: t("templates.tabLabel"), count: draftCount },
            { id: "running", label: t("dashboard.kpiRunning"), count: runningCount },
            { id: "queued", label: t("dashboard.statusQueued"), count: queuedCount },
            { id: "paused", label: t("dashboard.statusPaused"), count: pausedCount },
            { id: "completed", label: t("dashboard.statusCompleted"), count: completedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-sm text-xs font-serif transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-foreground/80 hover:text-foreground hover:bg-muted/60 font-medium"
              }`}
            >
              <span>{tab.label}</span>
              <span className="ml-1.5 text-[10px] opacity-80 font-mono">({tab.count})</span>
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadExperimentsList}
          className="h-8 px-3 text-xs text-foreground hover:bg-muted gap-1.5 rounded-sm border-border transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>{t("common.refresh")}</span>
        </Button>
      </div>

      {/* Experiments Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground text-xs font-mono">
          <RefreshCw className="w-4 h-4 mr-2 animate-spin text-muted-foreground" />
          <span>{t("dashboard.loadingExperiments")}</span>
        </div>
      ) : experiments.length === 0 ? (
        <Card className="border border-dashed border-border p-12 text-center space-y-4 rounded-lg bg-card">
          <div className="w-10 h-10 rounded-md bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Layers className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-semibold text-sm text-foreground">{t("dashboard.emptyTitle")}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("dashboard.emptySubtitle")}
            </p>
          </div>
          <Button
            type="button"
            onClick={onNewExperiment}
            className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground gap-2 rounded-md cursor-pointer transition-all duration-150"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("dashboard.createExperiment")}</span>
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="px-1">
            <h2 className="font-serif text-base font-bold text-foreground">
              <span className="text-primary mr-1.5">Registro I.</span>
              <span>{t("dashboard.catalogTitle")}</span>
            </h2>
          </div>

          <div className="border-t-2 border-b-2 border-foreground divide-y divide-border bg-card border-x border-x-border">
          {experiments.map((exp) => {
            const isProcessing = exp.status === "running";
            const isPaused = exp.status === "paused";
            const isQueued = exp.status === "queued";
            const isActionLoading = actionLoadingId === exp.id;

            return (
              <div
                key={exp.id}
                onClick={() => handleViewDetail(exp)}
                className="bg-card hover:bg-muted/35 transition-colors p-4 cursor-pointer group"
              >
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  {/* Left Column: Title & Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-serif font-bold text-base text-foreground group-hover:text-primary transition-colors">
                        {exp.name}
                      </h3>
                      {renderStatusBadge(exp.status, exp.progress_pct)}
                      <Badge variant="outline" className="text-[10px] font-mono border-border bg-muted/30 text-muted-foreground flex items-center gap-1 rounded-sm">
                        {exp.execution_mode === "parallel" ? (
                          <>
                            <Zap className="w-2.5 h-2.5 text-primary" />
                            <span>{t("dashboard.parallel")}</span>
                          </>
                        ) : (
                          <>
                            <ListOrdered className="w-2.5 h-2.5 text-muted-foreground" />
                            <span>{t("dashboard.sequential")}</span>
                          </>
                        )}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono border-border bg-muted/30 text-foreground rounded-sm">
                        {exp.task_type}
                      </Badge>
                    </div>

                    {exp.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{exp.description}</p>
                    )}

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                      <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                        <Layers className="w-3 h-3 text-muted-foreground" />
                        <span>Dataset: <strong className="text-foreground">{exp.dataset_name || exp.dataset_id}</strong></span>
                      </span>

                      <span className="text-border">&bull;</span>

                      <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                        <Bot className="w-3 h-3 text-muted-foreground" />
                        <span>{t("common.models")} ({exp.model_ids.length}):</span>
                        <div className="flex items-center gap-1 font-mono flex-wrap">
                          {exp.model_ids.map((m, mIdx) => {
                            const isCurrentRunning = isProcessing && (exp.current_model_index ?? 0) === mIdx;
                            const isCurrentPaused = isPaused && (exp.current_model_index ?? 0) === mIdx;
                            const isFailedModel = exp.status === "failed" && (exp.current_model_index ?? 0) === mIdx;
                            const isModelDone =
                              exp.status === "completed" ||
                              ((isProcessing || isPaused || exp.status === "failed") && (exp.current_model_index ?? 0) > mIdx) ||
                              isFailedModel;
                            const modelSummary = exp.summaries?.[m];
                            const hasModelErrors =
                              isFailedModel ||
                              Boolean(
                                isModelDone &&
                                  modelSummary &&
                                  ((modelSummary.success_rate ?? 100) < 100 || (modelSummary.json_validity_rate ?? 100) < 100)
                              );

                            let badgeClass = "bg-muted border border-border text-muted-foreground";
                            if (isCurrentRunning) {
                              badgeClass =
                                "bg-blue-500/15 border-blue-500/50 text-blue-700 dark:text-blue-400 font-bold ring-1 ring-blue-500/30 animate-pulse";
                            } else if (isCurrentPaused) {
                              badgeClass =
                                "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300 font-bold";
                            } else if (isModelDone && hasModelErrors) {
                              badgeClass =
                                "bg-destructive/15 border-destructive/50 text-destructive font-semibold";
                            } else if (isModelDone && !hasModelErrors) {
                              badgeClass =
                                "bg-emerald-500/15 border-emerald-600/40 text-emerald-700 dark:text-emerald-300 font-semibold";
                            }

                            return (
                              <Badge
                                key={m}
                                variant="secondary"
                                className={`text-[9px] px-1.5 py-0 border transition-all flex items-center gap-1 ${badgeClass}`}
                              >
                                {isCurrentRunning && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block mr-0.5" />
                                )}
                                {isCurrentPaused && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mr-0.5" />
                                )}
                                <span>{m.split("/")[1] || m}</span>
                                {isModelDone && !hasModelErrors && (
                                  <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-sans font-bold">✓</span>
                                )}
                                {isModelDone && hasModelErrors && (
                                  <span className="text-[8px] text-destructive font-sans font-bold">✕</span>
                                )}
                              </Badge>
                            );
                          })}
                        </div>
                      </span>

                      <span className="text-border">&bull;</span>

                      <span className="text-[11px] text-muted-foreground font-mono">
                        {t("common.samples")}: <strong className="text-foreground">{exp.total_samples || exp.sample_size}</strong>
                      </span>
                    </div>

                    {/* Progress Bar (Visible if running, queued or paused) */}
                    {(isProcessing || isPaused || isQueued) && (() => {
                      const currentModelName =
                        exp.model_ids?.[exp.current_model_index ?? 0]?.split("/")[1] ||
                        exp.model_ids?.[exp.current_model_index ?? 0] ||
                        "Modelo";
                      const isLoadingVram =
                        isProcessing &&
                        (exp.eval_spec?._runtime_phase === "loading_vram" ||
                          ((exp.current_sample_index ?? 0) === 0 && exp.eval_spec?._runtime_phase !== "processing_rows"));
                      const activeRow =
                        exp.eval_spec?._current_row ||
                        Math.min((exp.current_sample_index || 0) + 1, exp.total_samples || exp.sample_size);

                      return (
                        <div className="pt-1.5 space-y-1 max-w-xl">
                          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {isLoadingVram ? (
                                <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-semibold">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>
                                    [Modelo {(exp.current_model_index ?? 0) + 1}/{exp.model_ids?.length || 1}: {currentModelName}] · Cargando modelo en VRAM...
                                  </span>
                                </span>
                              ) : isProcessing ? (
                                exp.model_ids && exp.model_ids.length > 1 ? (
                                  t("dashboard.processingModelRow", {
                                    modelIndex: (exp.current_model_index ?? 0) + 1,
                                    totalModels: exp.model_ids.length,
                                    model: currentModelName,
                                    current: activeRow,
                                    total: exp.total_samples || exp.sample_size,
                                  })
                                ) : (
                                  t("dashboard.processingRow", {
                                    current: activeRow,
                                    total: exp.total_samples || exp.sample_size,
                                  })
                                )
                              ) : isPaused ? (
                                exp.model_ids && exp.model_ids.length > 1 ? (
                                  t("dashboard.pausedAtModelRow", {
                                    modelIndex: (exp.current_model_index ?? 0) + 1,
                                    totalModels: exp.model_ids.length,
                                    model: currentModelName,
                                    current: exp.current_sample_index,
                                  })
                                ) : (
                                  t("dashboard.pausedAtRow", { current: exp.current_sample_index })
                                )
                              ) : (
                                t("dashboard.queuedStatus")
                              )}
                            </span>
                            <span className="font-semibold text-foreground">{exp.progress_pct.toFixed(1)}%</span>
                          </div>
                          <Progress value={exp.progress_pct} className="h-1.5 bg-muted" />
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center gap-1.5 self-end lg:self-center shrink-0">
                    {/* Pause Button */}
                    {isProcessing && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isActionLoading}
                        onClick={(e) => handlePause(exp.id, e)}
                        className="h-7 px-2.5 text-xs font-medium border-border hover:bg-muted text-muted-foreground hover:text-foreground gap-1.5 rounded-md transition-all duration-150"
                        title={t("dashboard.pause")}
                      >
                        <Pause className="w-3 h-3" />
                        <span>{t("dashboard.pause")}</span>
                      </Button>
                    )}

                    {/* Resume Button */}
                    {isPaused && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isActionLoading}
                        onClick={(e) => handleResume(exp.id, e)}
                        className="h-7 px-2.5 text-xs font-medium border-border hover:bg-muted text-foreground gap-1.5 rounded-md transition-all duration-150"
                        title={t("dashboard.resume")}
                      >
                        <Play className="w-3 h-3" />
                        <span>{t("dashboard.resume")}</span>
                      </Button>
                    )}

                    {/* Use Template Button (strictly for saved templates) */}
                    {onUseAsTemplate && exp.status === "draft" && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUseAsTemplate(exp);
                        }}
                        className="h-7 px-2.5 text-xs font-medium gap-1.5 rounded-md transition-all duration-150 bg-primary text-primary-foreground hover:bg-primary/90"
                        title={t("templates.modalDesc")}
                      >
                        <FileCode className="w-3 h-3" />
                        <span>{t("templates.useTemplate")}</span>
                      </Button>
                    )}

                    {/* Inspect Details Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetail(exp);
                      }}
                      className="h-7 px-2.5 text-xs font-medium gap-1.5 rounded-md border-border hover:bg-muted text-foreground transition-all duration-150"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{exp.status === "completed" ? t("dashboard.viewMetrics") : t("dashboard.liveMonitor")}</span>
                    </Button>

                    {/* Delete Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isActionLoading}
                      onClick={(e) => handleDelete(exp.id, e)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all duration-150"
                      title={t("dashboard.deleteExpTitle")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>

          {/* Persistent Crear Experimento button at the bottom of the experiments list */}
          <div className="flex justify-center pt-2 pb-2">
            <Button
              type="button"
              onClick={onNewExperiment}
              className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 gap-2 rounded-md cursor-pointer transition-all duration-150"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("dashboard.createExperiment")}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Detail / Live Monitor Modal */}
      {showDetailModal && activeExpDetail && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] bg-card border border-border p-6 flex flex-col rounded-lg">
            <DialogHeader className="border-b border-border pb-3 pr-8">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <DialogTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                    <span>{activeExpDetail.name}</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground font-mono">
                    {t("dashboard.modalDataset", { name: activeExpDetail.dataset_name || activeExpDetail.dataset_id, id: activeExpDetail.id })}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  {renderStatusBadge(activeExpDetail.status, activeExpDetail.progress_pct)}
                </div>
              </div>
            </DialogHeader>

            {/* Modal Body */}
            <ScrollArea className="flex-1 max-h-[60vh] pr-4 space-y-4 py-3">
              {/* Columns & Execution Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.modalMainText")}</span>
                  <div className="text-xs font-mono font-medium text-foreground">
                    {activeExpDetail.input_columns?.join(", ") || t("dashboard.modalNotAssigned")}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.modalContext")}</span>
                  <div className="text-xs font-mono font-medium text-foreground">
                    {activeExpDetail.context_columns?.join(", ") || t("dashboard.modalNone")}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-muted/20 border border-border space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">{t("dashboard.modalRowId")}</span>
                  <div className="text-xs font-mono font-medium text-foreground">
                    {activeExpDetail.id_column || t("dashboard.modalUnassigned")}
                  </div>
                </div>
              </div>

              {/* Progress Summary if not completed */}
              <div className="p-3.5 rounded-md bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{t("dashboard.modalProgressTitle")}</span>
                  <span className="font-mono font-semibold text-foreground">{activeExpDetail.progress_pct.toFixed(1)}%</span>
                </div>
                <Progress value={activeExpDetail.progress_pct} className="h-2 bg-muted" />
                <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 font-mono">
                  <span>
                    {(() => {
                      const modalModelName =
                        activeExpDetail.model_ids?.[activeExpDetail.current_model_index ?? 0]?.split("/")[1] ||
                        activeExpDetail.model_ids?.[activeExpDetail.current_model_index ?? 0] ||
                        "Modelo";
                      const modalLoadingVram =
                        activeExpDetail.status === "running" &&
                        (activeExpDetail.eval_spec?._runtime_phase === "loading_vram" ||
                          ((activeExpDetail.current_sample_index ?? 0) === 0 &&
                            activeExpDetail.eval_spec?._runtime_phase !== "processing_rows"));
                      const modalActiveRow =
                        activeExpDetail.status === "running"
                          ? activeExpDetail.eval_spec?._current_row ||
                            Math.min(
                              (activeExpDetail.current_sample_index || 0) + 1,
                              activeExpDetail.total_samples || activeExpDetail.sample_size
                            )
                          : activeExpDetail.current_sample_index;

                      if (modalLoadingVram) {
                        return (
                          <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-semibold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>
                              [Modelo {(activeExpDetail.current_model_index ?? 0) + 1}/
                              {activeExpDetail.model_ids?.length || 1}: {modalModelName}] · Cargando modelo en VRAM...
                            </span>
                          </span>
                        );
                      }

                      return activeExpDetail.model_ids && activeExpDetail.model_ids.length > 1 ? (
                        <span className="flex items-center gap-1.5">
                          <strong className="text-blue-700 dark:text-blue-400">
                            [Modelo {(activeExpDetail.current_model_index ?? 0) + 1}/{activeExpDetail.model_ids.length}:{" "}
                            {modalModelName}]
                          </strong>
                          <span>&bull;</span>
                          <span>
                            {t("dashboard.modalCurrentSample", {
                              current: modalActiveRow,
                              total: activeExpDetail.total_samples,
                            })}
                          </span>
                        </span>
                      ) : (
                        t("dashboard.modalCurrentSample", {
                          current: modalActiveRow,
                          total: activeExpDetail.total_samples,
                        })
                      );
                    })()}
                  </span>
                  <span>{t("dashboard.modalMode", { mode: activeExpDetail.execution_mode })}</span>
                </div>
              </div>

              {/* Prompt Template Preview */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("dashboard.modalTemplate")}
                </span>
                <pre className="p-3 rounded-md bg-muted/30 border border-border text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {activeExpDetail.template}
                </pre>
              </div>

              {/* Action Bar inside modal */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                {activeExpDetail.status === "running" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => handlePause(activeExpDetail.id, e)}
                    className="h-8 px-3 text-xs border-border hover:bg-muted text-muted-foreground hover:text-foreground gap-1.5 rounded-md"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>{t("dashboard.modalPauseExp")}</span>
                  </Button>
                )}
                {activeExpDetail.status === "paused" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleResume(activeExpDetail.id, e)}
                    className="h-8 px-3 text-xs border-border hover:bg-muted text-foreground gap-1.5 rounded-md"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{t("dashboard.modalResumeExp")}</span>
                  </Button>
                )}
                {activeExpDetail.status === "completed" && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowDetailModal(false);
                      onInspectExperimentResults(activeExpDetail);
                    }}
                    className="h-8 px-3 text-xs bg-primary text-primary-foreground font-medium rounded-md gap-1.5 transition-all duration-150"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t("dashboard.modalViewMetrics")}</span>
                  </Button>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
