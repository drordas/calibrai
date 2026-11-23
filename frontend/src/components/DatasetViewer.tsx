import React, { useState, useEffect, useRef, useMemo } from "react";
import { DatasetSummary, PaginatedRowsResponse } from "../types";
import { fetchPaginatedRows, uploadDataset, deleteDataset, fetchCompatibleGroundTruths, CompatibleGroundTruth } from "../services/api";
import { useTranslation } from "../i18n";
import {
  Database,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Trash2,
  Loader2,
  AlertCircle,
  Key,
  CheckSquare,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Info,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  Calculator,
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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DatasetViewerProps {
  datasets: DatasetSummary[];
  selectedDataset: DatasetSummary | null;
  onSelectDataset: (ds: DatasetSummary | null) => void;
  inputColumns: string[];
  setInputColumns: (cols: string[]) => void;
  contextColumns: string[];
  setContextColumns: (cols: string[]) => void;
  specColumns?: string[];
  setSpecColumns?: (cols: string[]) => void;
  idColumn: string;
  setIdColumn: (col: string) => void;
  onRefreshDatasets: () => void;
  groundTruthDatasetId?: string | null;
  setGroundTruthDatasetId?: (id: string | null) => void;
  groundTruthDatasetIds?: string[];
  setGroundTruthDatasetIds?: (ids: string[]) => void;
  groundTruthName?: string;
  setGroundTruthName?: (name: string) => void;
  onGroundTruthSchemaDetected?: (schema: any) => void;
}

export const DatasetViewer: React.FC<DatasetViewerProps> = ({
  datasets,
  selectedDataset,
  onSelectDataset,
  inputColumns,
  setInputColumns,
  contextColumns,
  setContextColumns,
  specColumns = [],
  setSpecColumns,
  idColumn,
  setIdColumn,
  onRefreshDatasets,
  groundTruthDatasetId,
  setGroundTruthDatasetId,
  groundTruthDatasetIds,
  setGroundTruthDatasetIds,
  groundTruthName,
  setGroundTruthName,
  onGroundTruthSchemaDetected,
}) => {
  const { t } = useTranslation();
  const [paginatedData, setPaginatedData] = useState<PaginatedRowsResponse | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(25);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Compatible Ground Truth states
  const [compatibleGroundTruths, setCompatibleGroundTruths] = useState<CompatibleGroundTruth[]>([]);
  const [loadingCompat, setLoadingCompat] = useState<boolean>(false);
  const [gtUploadError, setGtUploadError] = useState<string | null>(null);
  const [gtUploading, setGtUploading] = useState<boolean>(false);

  // Separate Corpus vs Ground Truth datasets
  const corpusDatasets = datasets.filter((ds) => !ds.is_ground_truth);
  const groundTruthDatasets = datasets.filter((ds) => Boolean(ds.is_ground_truth));

  // Compatible Ground Truths for current selectedDataset (only shown when a corpus is selected)
  const compatibleGtIds = useMemo(
    () => new Set(compatibleGroundTruths.map((c) => c.dataset_id)),
    [compatibleGroundTruths]
  );
  const visibleGroundTruths: DatasetSummary[] = useMemo(
    () => (selectedDataset ? groundTruthDatasets.filter((gt: DatasetSummary) => compatibleGtIds.has(gt.id)) : []),
    [selectedDataset, groundTruthDatasets, compatibleGtIds]
  );

  // Multi-selection of Ground Truth
  const selectedGtIds = groundTruthDatasetIds ?? (groundTruthDatasetId ? [groundTruthDatasetId] : []);

  const updateSelectedGtIds = (newIds: string[]) => {
    if (setGroundTruthDatasetIds) {
      setGroundTruthDatasetIds(newIds);
    }
    if (setGroundTruthDatasetId) {
      setGroundTruthDatasetId(newIds.length > 0 ? newIds[0] : null);
    }
    if (newIds.length > 0 && onGroundTruthSchemaDetected) {
      const firstCompat = compatibleGroundTruths.find((g) => g.dataset_id === newIds[0]);
      if (firstCompat) {
        onGroundTruthSchemaDetected(firstCompat.schema);
      }
    } else if (newIds.length === 0 && onGroundTruthSchemaDetected) {
      onGroundTruthSchemaDetected(null);
    }
  };

  const toggleGroundTruth = (dsId: string) => {
    if (selectedGtIds.includes(dsId)) {
      updateSelectedGtIds(selectedGtIds.filter((id) => id !== dsId));
    } else {
      updateSelectedGtIds([...selectedGtIds, dsId]);
    }
  };

  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleHorizontalScroll = (direction: "left" | "right") => {
    if (!tableScrollRef.current) return;
    const delta = direction === "left" ? -400 : 400;
    tableScrollRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  // Load rows when selectedDataset changes - columns are UNCHECKED by default
  useEffect(() => {
    if (!selectedDataset) {
      setPaginatedData(null);
      return;
    }
    if (selectedDataset && selectedDataset.columns.length > 0) {
      // Auto-detect candidate ID column if it has unique values
      const detectedId =
        selectedDataset.detected_id_column ||
        selectedDataset.columns.find((c) => c.is_id_candidate)?.name ||
        selectedDataset.columns.find((c) => c.is_unique)?.name ||
        "";

      // By default: all input and context columns remain UNCHECKED ([]).
      // Only set ID if not already set and a unique candidate was detected:
      if (!idColumn && detectedId) {
        setIdColumn(detectedId);
      }

      setOffset(0);
      loadRows(selectedDataset.id, 0, limit, search);
    }
  }, [selectedDataset]);

  // Load compatible ground truths when selectedDataset changes
  useEffect(() => {
    if (!selectedDataset) {
      setCompatibleGroundTruths([]);
      updateSelectedGtIds([]);
      return;
    }
    setLoadingCompat(true);
    fetchCompatibleGroundTruths(selectedDataset.id)
      .then((res) => {
        setCompatibleGroundTruths(res);
        const validIds = new Set(res.map((r) => r.dataset_id));
        const currentSelected = groundTruthDatasetIds ?? (groundTruthDatasetId ? [groundTruthDatasetId] : []);
        const validSelected = currentSelected.filter((id) => validIds.has(id));
        if (validSelected.length !== currentSelected.length) {
          updateSelectedGtIds(validSelected);
        }
      })
      .catch((err) => {
        console.error("Error loading compatible ground truths:", err);
      })
      .finally(() => setLoadingCompat(false));
  }, [selectedDataset]);

  const handleGroundTruthUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setGtUploading(true);
    setGtUploadError(null);
    try {
      const summary = await uploadDataset(file, undefined, selectedDataset?.id);
      onRefreshDatasets();
      if (selectedDataset) {
        const res = await fetchCompatibleGroundTruths(selectedDataset.id);
        setCompatibleGroundTruths(res);
      }
      updateSelectedGtIds([...selectedGtIds, summary.id]);
    } catch (err: any) {
      setGtUploadError(err.message || t("dataset.gtUploadErrorFallback"));
    } finally {
      setGtUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (datasetId: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDataset(datasetId);
      if (selectedDataset?.id === datasetId) {
        onSelectDataset(null);
      }
      if (selectedGtIds.includes(datasetId)) {
        updateSelectedGtIds(selectedGtIds.filter((id) => id !== datasetId));
      }
      setConfirmDeleteId(null);
      onRefreshDatasets();
      if (selectedDataset && selectedDataset.id !== datasetId) {
        const res = await fetchCompatibleGroundTruths(selectedDataset.id);
        setCompatibleGroundTruths(res);
      }
    } catch (err: any) {
      setDeleteError(err.message || t("dataset.deleteErrorFallback"));
    } finally {
      setDeleting(false);
    }
  };

  const loadRows = async (dsId: string, newOffset: number, newLimit: number, q: string) => {
    setLoading(true);
    try {
      const data = await fetchPaginatedRows(dsId, newOffset, newLimit, undefined, q);
      setPaginatedData(data);
    } catch (err) {
      console.error("Error loading rows:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    setOffset(0);
    if (selectedDataset) {
      loadRows(selectedDataset.id, 0, limit, val);
    }
  };

  const handlePageChange = (direction: "prev" | "next") => {
    if (!paginatedData || !selectedDataset) return;
    const newOffset = direction === "prev" ? Math.max(0, offset - limit) : offset + limit;
    if (newOffset < paginatedData.total_rows) {
      setOffset(newOffset);
      loadRows(selectedDataset.id, newOffset, limit, search);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const newDs = await uploadDataset(file);
      onRefreshDatasets();
      onSelectDataset(newDs);
    } catch (err: any) {
      setUploadError(err.message || t("dataset.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  const toggleContextColumn = (col: string) => {
    if (contextColumns.includes(col)) {
      setContextColumns(contextColumns.filter((c) => c !== col));
    } else {
      setContextColumns([...contextColumns, col]);
      setInputColumns(inputColumns.filter((c) => c !== col));
      if (setSpecColumns) setSpecColumns(specColumns.filter((c) => c !== col));
      if (idColumn === col) setIdColumn("");
    }
  };

  const toggleSpecColumn = (col: string) => {
    if (!setSpecColumns) return;
    if (specColumns.includes(col)) {
      setSpecColumns(specColumns.filter((c) => c !== col));
    } else {
      setSpecColumns([...specColumns, col]);
      setInputColumns(inputColumns.filter((c) => c !== col));
      setContextColumns(contextColumns.filter((c) => c !== col));
      if (idColumn === col) setIdColumn("");
    }
  };

  const toggleIdColumn = (col: string) => {
    if (idColumn === col) {
      setIdColumn("");
    } else {
      setIdColumn(col);
      setInputColumns(inputColumns.filter((c) => c !== col));
      setContextColumns(contextColumns.filter((c) => c !== col));
      if (setSpecColumns) setSpecColumns(specColumns.filter((c) => c !== col));
    }
  };

  const handleDeselectAll = () => {
    setInputColumns([]);
    setContextColumns([]);
    if (setSpecColumns) setSpecColumns([]);
    setIdColumn("");
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Dataset Selection & Upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`${selectedDataset ? "md:col-span-2" : "md:col-span-3"} neo-panel border-border shadow-spatial`}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span>{t("dataset.corpusAvailableTitle")}</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                {t("dataset.corpusAvailableDesc")}
              </CardDescription>
            </div>

            <div>
              <input
                id="dataset-upload-input"
                type="file"
                accept=".csv,.xlsx,.xls,.json,.jsonl"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                asChild
                disabled={uploading}
                className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 text-xs font-semibold shadow-sm cursor-pointer"
              >
                <label htmlFor="dataset-upload-input" className="flex items-center gap-2 cursor-pointer">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? t("dataset.uploading") : t("dataset.uploadButton")}</span>
                </label>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {uploadError && (
              <Alert variant="destructive" className="py-2 text-xs">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            {corpusDatasets.length === 0 ? (
              <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center space-y-3 bg-muted/10">
                <Upload className="w-8 h-8 text-primary mx-auto opacity-70 animate-float" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm">{t("dataset.noCorpusLoaded")}</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {t("dataset.uploadPrompt")}
                  </p>
                </div>
                <Button
                  size="sm"
                  asChild
                  className="bg-primary text-primary-foreground text-xs font-bold shadow-md hover:scale-105 transition-all"
                >
                  <label htmlFor="dataset-upload-input" className="cursor-pointer flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>{t("dataset.selectFromFile")}</span>
                  </label>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {corpusDatasets.map((ds) => {
                  const isSelected = selectedDataset?.id === ds.id;
                  return (
                    <div
                      key={ds.id}
                      className={`group inline-flex items-center rounded-xl text-xs font-medium transition-all duration-300 ease-out ${
                        isSelected
                           ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/40"
                          : "bg-secondary/70 hover:bg-secondary text-secondary-foreground border border-border/60"
                      }`}
                    >
                      <button
                        onClick={() => onSelectDataset(ds)}
                        className="flex items-center gap-2 pl-3.5 pr-2 py-2"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 opacity-80" />
                        <span className="font-semibold">{ds.name}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono px-1.5 py-0 ${
                            isSelected ? "bg-white/20 text-white" : "bg-background/60"
                          }`}
                        >
                          {t("dataset.rowsCount", { count: ds.total_rows.toLocaleString() })}
                        </Badge>
                        {ds.is_sample && (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          >
                            Sample
                          </Badge>
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("dataset.deleteDatasetTooltip", { name: ds.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(ds.id);
                          setDeleteError(null);
                        }}
                        className={`h-7 w-7 mr-1 rounded-lg ${
                          isSelected
                            ? "text-primary-foreground/70 hover:text-white hover:bg-white/20"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Dataset Summary Card */}
        {selectedDataset && (
          <Card className="neo-panel border-border shadow-spatial">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{t("dataset.metadataCorpusTitle")}</span>
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmDeleteId(selectedDataset.id);
                  setDeleteError(null);
                }}
                className="h-7 text-[11px] font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive px-2"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                <span>{t("dataset.deleteButton")}</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/40 p-2.5 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">{t("dataset.format")}</span>
                  <span className="font-bold uppercase text-primary font-mono">{selectedDataset.format}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">{t("dataset.totalRows")}</span>
                  <span className="font-bold text-foreground font-mono">{selectedDataset.total_rows.toLocaleString()}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">{t("dataset.columns")}</span>
                  <span className="font-bold text-foreground font-mono">{selectedDataset.columns.length}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-xl border border-border/40">
                  <span className="text-[11px] text-muted-foreground block">{t("dataset.size")}</span>
                  <span className="font-bold text-foreground font-mono">{(selectedDataset.size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmDeleteId(selectedDataset.id);
                  setDeleteError(null);
                }}
                className="w-full text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 h-9"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                <span>{t("dataset.deleteThisDataset")}</span>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ground Truth Datasets Section (Always in 2nd position directly below Corpus) */}
      <Card className="neo-panel border-border shadow-spatial">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{t("dataset.gtTitle")}</span>
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-normal">
                {t("dataset.gtMultiOptional")}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {t("dataset.gtDesc")}
            </CardDescription>
          </div>

          <div>
            <input
              id="gt-upload-input"
              type="file"
              accept=".json,.csv,.jsonl,.xlsx"
              className="hidden"
              onChange={handleGroundTruthUpload}
              disabled={gtUploading || !selectedDataset}
            />
            <Button
              variant="outline"
              size="sm"
              asChild={Boolean(selectedDataset)}
              disabled={gtUploading || !selectedDataset}
              className={`text-xs font-semibold shadow-sm ${
                selectedDataset
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 cursor-pointer"
                  : "opacity-50 cursor-not-allowed text-muted-foreground border-border"
              }`}
              title={selectedDataset ? t("dataset.uploadGtTooltipActive") : t("dataset.uploadGtTooltipDisabled")}
            >
              {selectedDataset ? (
                <label htmlFor="gt-upload-input" className="flex items-center gap-2 cursor-pointer">
                  {gtUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{gtUploading ? t("dataset.uploadGtLoading") : t("dataset.uploadGtButton")}</span>
                </label>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span>{t("dataset.uploadGtButton")}</span>
                </span>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {gtUploadError && (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{gtUploadError}</AlertDescription>
            </Alert>
          )}

          {!selectedDataset ? (
            /* Scenario 1: No corpus dataset is selected yet */
            <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center space-y-3 bg-muted/10">
              <ShieldCheck className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-foreground">{t("dataset.selectCorpusFirstTitle")}</h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {t("dataset.selectCorpusFirstDesc")}
                </p>
              </div>
            </div>
          ) : loadingCompat ? (
            /* Scenario 2: Loading compatibility check */
            <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center space-y-3 bg-muted/10">
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin mx-auto" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-foreground">{t("dataset.checkingCompatTitle")}</h4>
                <p className="text-xs text-muted-foreground">
                  {t("dataset.checkingCompatDesc", { name: selectedDataset.name })}
                </p>
              </div>
            </div>
          ) : visibleGroundTruths.length === 0 ? (
            /* Scenario 3: No compatible ground truths found */
            <div className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center space-y-3 bg-muted/10">
              <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto opacity-70 animate-float" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">{t("dataset.noCompatGtTitle")}</h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {t("dataset.noCompatGtDesc", { name: selectedDataset.name })}
                </p>
              </div>
              <Button
                size="sm"
                asChild
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md hover:scale-105 transition-all cursor-pointer"
              >
                <label htmlFor="gt-upload-input" className="cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span>{t("dataset.uploadGtForDataset", { name: selectedDataset.name })}</span>
                </label>
              </Button>
            </div>
          ) : (
            /* Scenario 4: Compatible ground truths available */
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 pt-1">
                {visibleGroundTruths.map((gt) => {
                  const isSelected = selectedGtIds.includes(gt.id);
                  const compatInfo = compatibleGroundTruths.find((c) => c.dataset_id === gt.id);
                  const dimNames = Array.from(new Set(
                    gt.columns
                      .filter((c) => c.name.startsWith("ground_truth.") || c.name.startsWith("target."))
                      .map((c) => c.name.split(".")[1])
                  )).filter(Boolean);

                  return (
                    <div
                      key={gt.id}
                      className={`group inline-flex items-center rounded-xl text-xs font-medium transition-all duration-300 ease-out ${
                        isSelected
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 ring-1 ring-emerald-500/50"
                          : "bg-secondary/70 hover:bg-secondary text-secondary-foreground border border-border/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroundTruth(gt.id)}
                        className="flex items-center gap-2 pl-3.5 pr-2 py-2 text-left"
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
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono uppercase px-1.5 py-0 ${
                            isSelected ? "bg-white/15 text-white border-white/30" : "bg-background/40 border-border text-muted-foreground"
                          }`}
                        >
                          {gt.format}
                        </Badge>
                        {dimNames.length > 0 && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono px-1.5 py-0 ${
                              isSelected ? "bg-white/15 text-white border-white/30" : "bg-background/40 border-border text-muted-foreground"
                            }`}
                          >
                            {t("dataset.dimsCount", { count: dimNames.length })}
                          </Badge>
                        )}
                        {compatInfo && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono px-1.5 py-0 ${
                              compatInfo.common_ids_count > 0
                                ? isSelected
                                  ? "bg-white/25 text-white border-white/40"
                                  : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                                : "bg-destructive/15 text-destructive border-destructive/30"
                            }`}
                            title={t("dataset.matchingIdsTooltip", { common: compatInfo.common_ids_count, total: selectedDataset.total_rows })}
                          >
                            {compatInfo.common_ids_count > 0 ? t("dataset.matchingIdsBadge", { percent: compatInfo.overlap_percentage }) : t("dataset.zeroMatchingIds")}
                          </Badge>
                        )}
                        {gt.is_sample && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0 ${
                              isSelected
                                ? "bg-white/20 text-white border-white/30"
                                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            Sample
                          </Badge>
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t("dataset.deleteGtTooltip", { name: gt.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(gt.id);
                          setDeleteError(null);
                        }}
                        className={`h-7 w-7 mr-1 rounded-lg ${
                          isSelected
                            ? "text-white/70 hover:text-white hover:bg-white/20"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Multi-Selection Inspection & Dimension Badges */}
              {selectedGtIds.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">
                        {selectedGtIds.length === 1
                          ? t("dataset.singleGtSelected", { name: groundTruthDatasets.find((g) => g.id === selectedGtIds[0])?.name || t("results.humanExpert") })
                          : t("dataset.multiGtSelected", {
                              count: selectedGtIds.length,
                              names: selectedGtIds
                                .map((id) => groundTruthDatasets.find((g) => g.id === id)?.name)
                                .filter(Boolean)
                                .join(", "),
                            })}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateSelectedGtIds([])}
                      className="h-6 text-[10px] text-muted-foreground hover:text-foreground hover:bg-emerald-500/20 px-2"
                    >
                      {t("dataset.deselectAllGt")}
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {selectedGtIds.length > 1
                      ? t("dataset.multiGtAlignmentDesc")
                      : t("dataset.singleGtAlignmentDesc")}
                  </p>

                  {/* Dimension Badges */}
                  {(() => {
                    const allDims = Array.from(new Set(
                      groundTruthDatasets
                        .filter((g) => selectedGtIds.includes(g.id))
                        .flatMap((g) =>
                          g.columns
                            .filter((c) => c.name.startsWith("ground_truth.") || c.name.startsWith("target."))
                            .map((c) => c.name.split(".")[1])
                        )
                    )).filter(Boolean);

                    return allDims.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-emerald-500/20">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1">
                          {t("dataset.evaluableDimsTitle", { count: allDims.length })}
                        </span>
                        {allDims.map((dim) => (
                          <Badge
                            key={dim}
                            variant="secondary"
                            className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          >
                            {dim}
                          </Badge>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Role Assignment Bar (shown below Ground Truth when a dataset is selected) */}
      {selectedDataset && (
        <Card className="neo-panel border-border shadow-spatial">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span>{t("dataset.columnAssignmentTitle")}</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  {t("dataset.columnAssignmentDesc")}
                </CardDescription>
              </div>

              {(contextColumns.length > 0 || (specColumns || []).length > 0 || idColumn) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted/50 gap-1.5"
                >
                  <Trash2 className="w-3 h-3 opacity-60" />
                  <span>{t("dataset.deselectAllCols")}</span>
                </Button>
              )}
            </div>

            {/* Quick status badges */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-muted-foreground">{t("dataset.currentStatus")}</span>
              <Badge variant="outline" className="text-[11px] font-mono bg-background/50 flex items-center gap-1">
                <Key className="w-3 h-3 text-amber-500" />
                {t("dataset.rowIdLabel")} <strong className="ml-1 text-amber-400">{idColumn || t("dataset.unassigned")}</strong>
                {(() => {
                  const idColMeta = selectedDataset.columns.find((c) => c.name === idColumn);
                  return idColMeta?.is_unique ? (
                    <span className="text-[9px] text-amber-500/90 font-sans ml-1">{t("dataset.uniquePercentBadge")}</span>
                  ) : null;
                })()}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-mono bg-background/50">
                {t("dataset.contextLabel")} <strong className="ml-1 text-purple-400">{contextColumns.length === 0 ? t("dataset.unchecked") : contextColumns.join(", ")}</strong>
              </Badge>
              <Badge variant="outline" className="text-[11px] font-mono bg-background/50 flex items-center gap-1">
                <Calculator className="w-3 h-3 text-blue-500" />
                {t("dataset.specLabel")} <strong className="ml-1 text-blue-400">{(specColumns || []).length === 0 ? t("dataset.unchecked") : (specColumns || []).join(", ")}</strong>
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Guide: Difference between ID, Context, and Spec */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-xs space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-semibold text-xs">{t("dataset.roleGuideTitle")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400 text-[11px] uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>{t("dataset.rowIdRoleTitle")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("dataset.rowIdRoleDesc")}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-purple-400 text-[11px] uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>{t("dataset.contextRoleTitle")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("dataset.contextRoleDesc")}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-blue-400 text-[11px] uppercase tracking-wider">
                    <Calculator className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t("dataset.specRoleTitle")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("dataset.specRoleDesc")}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">
              {t("dataset.clickToAssignDesc")}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedDataset.columns.map((col) => {
                const isContext = contextColumns.includes(col.name);
                const isId = idColumn === col.name;
                const isSpec = (specColumns || []).includes(col.name);
                const isUnique = col.is_unique;
                const isIdCandidate = col.is_id_candidate;

                return (
                  <div
                    key={col.name}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-300 ease-out ${
                      isId
                        ? "bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-500/30 ring-1 ring-amber-500/40"
                        : isContext
                        ? "bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 ring-1 ring-purple-500/30"
                        : isSpec
                        ? "bg-blue-600/15 text-blue-400 border-blue-500/40 ring-1 ring-blue-500/30"
                        : "bg-secondary/70 text-secondary-foreground border-border/60 hover:bg-secondary"
                    }`}
                  >
                    <span className="font-mono text-xs font-medium">{col.name}</span>

                    {/* Autodetected Unique / ID indicator */}
                    {(isIdCandidate || isUnique) && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono px-1 py-0 border-amber-500/40 text-amber-500 bg-amber-500/10 flex items-center gap-0.5"
                        title={t("dataset.uniqueColTooltip", { count: col.unique_count ?? selectedDataset.total_rows })}
                      >
                        <Key className="w-2.5 h-2.5" />
                        <span>{t("dataset.uniqueIdBadge")}</span>
                      </Badge>
                    )}

                    {isId && (
                      <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-amber-500/20 text-amber-400 uppercase">
                        {t("dataset.roleIdBtn")}
                      </Badge>
                    )}
                    {isContext && (
                      <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-purple-500/20 text-purple-400 uppercase">
                        {t("dataset.roleContextBtn")}
                      </Badge>
                    )}
                    {isSpec && (
                      <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-blue-500/20 text-blue-400 uppercase">
                        {t("dataset.roleSpecBtn")}
                      </Badge>
                    )}

                    <div className="flex items-center gap-1 border-l pl-1.5 ml-1 border-current/20">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title={isId ? t("dataset.unmarkId") : t("dataset.markId")}
                        onClick={() => toggleIdColumn(col.name)}
                        className={`h-5 px-1.5 text-[10px] rounded transition-colors ${
                          isId ? "bg-amber-500/30 text-amber-200 font-bold" : "hover:bg-foreground/10"
                        }`}
                      >
                        {t("dataset.roleIdBtn")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title={isContext ? t("dataset.unmarkContext") : t("dataset.markContext")}
                        onClick={() => toggleContextColumn(col.name)}
                        className={`h-5 px-1.5 text-[10px] rounded transition-colors ${
                          isContext ? "bg-purple-500/30 text-purple-200 font-bold" : "hover:bg-foreground/10"
                        }`}
                      >
                        {t("dataset.roleContextBtn")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title={isSpec ? t("dataset.unmarkSpec") : t("dataset.markSpec")}
                        onClick={() => toggleSpecColumn(col.name)}
                        className={`h-5 px-1.5 text-[10px] rounded transition-colors ${
                          isSpec ? "bg-blue-500/30 text-blue-200 font-bold" : "hover:bg-foreground/10"
                        }`}
                      >
                        {t("dataset.roleSpecBtn")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paginated Data Table with Search */}
      {selectedDataset && (
        <Card className="neo-panel border-border shadow-spatial overflow-hidden space-y-0">
          <CardHeader className="p-4 border-b border-border/60 bg-muted/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder={t("dataset.searchDuckdbPlaceholder")}
                aria-label={t("dataset.searchDuckdbPlaceholder")}
                className="pl-9 h-9 text-xs bg-background/60 border-border/70"
              />
            </div>

            {/* Horizontal Scroll Controls & Column Counter */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[11px] font-mono text-muted-foreground gap-1.5 py-1 px-2.5 bg-background/50 border-border/60"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                <span>
                  {t("dataset.columnsCount", { count: paginatedData?.columns.length || 0 })}
                </span>
              </Badge>

              <div className="flex items-center gap-1 border border-border/60 rounded-lg p-0.5 bg-background/40">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleHorizontalScroll("left")}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 hover:bg-muted"
                  title={t("dataset.scrollLeftTooltip")}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("dataset.scrollLeft")}</span>
                </Button>
                <div className="w-[1px] h-4 bg-border/60" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleHorizontalScroll("right")}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 hover:bg-muted"
                  title={t("dataset.scrollRightTooltip")}
                >
                  <span className="hidden sm:inline">{t("dataset.scrollRight")}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground w-full lg:w-auto justify-between lg:justify-end">
              <span>
                {t("dataset.showingRows", {
                  from: offset + 1,
                  to: Math.min(offset + limit, paginatedData?.total_rows || 0),
                  total: paginatedData?.total_rows || 0,
                })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange("prev")}
                  disabled={offset === 0 || loading}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange("next")}
                  disabled={!paginatedData || offset + limit >= paginatedData.total_rows || loading}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <div className="relative">
            {loading && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-20">
                <span className="text-xs font-semibold text-primary animate-pulse flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t("dataset.queryingDuckdb")}</span>
                </span>
              </div>
            )}
            <Table
              containerRef={tableScrollRef}
              containerClassName="max-h-[500px] overflow-x-auto overflow-y-auto select-text scroll-smooth"
              containerAriaLabel={t("dataset.showingRows", {
                from: offset + 1,
                to: Math.min(offset + limit, paginatedData?.total_rows || 0),
                total: paginatedData?.total_rows || 0,
              })}
              className="w-max min-w-full"
            >
              <TableHeader className="bg-muted/70 sticky top-0 border-b border-border/80 backdrop-blur-md z-10 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/90 backdrop-blur-md z-20 shadow-[1px_0_0_0_hsl(var(--border))]">
                    #
                  </TableHead>
                  {paginatedData?.columns.map((col) => {
                    const isContext = contextColumns.includes(col);
                    const isId = idColumn === col;
                    const isSpec = (specColumns || []).includes(col);
                    const colMeta = selectedDataset?.columns.find((c) => c.name === col);

                    return (
                      <TableHead
                        key={col}
                        className={`text-xs font-semibold whitespace-nowrap min-w-[170px] transition-colors py-3 px-3.5 ${
                          isId
                            ? "bg-amber-500/20 text-amber-500 dark:text-amber-400 border-b-2 border-amber-500"
                            : isContext
                            ? "bg-purple-500/20 text-purple-400 border-b-2 border-purple-500"
                            : isSpec
                            ? "bg-blue-500/20 text-blue-400 border-b-2 border-blue-500"
                            : "text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isId && <Key className="w-3 h-3 text-amber-500" />}
                          {isSpec && <Calculator className="w-3 h-3 text-blue-500" />}
                          <span>{col}</span>
                          {colMeta?.is_unique && !isId && (
                            <span className="text-[9px] font-mono px-1 py-0 rounded bg-amber-500/10 text-amber-500 font-normal" title={t("dataset.uniquePercentBadge")}>
                              {t("dataset.hundredPercentUnique")}
                            </span>
                          )}
                          {isContext && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                          {isSpec && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData?.rows.map((row, rIdx) => (
                  <TableRow key={rIdx} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="py-2.5 px-3 text-muted-foreground font-mono text-center text-xs sticky left-0 bg-background/95 backdrop-blur-md z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                      {offset + rIdx + 1}
                    </TableCell>
                    {paginatedData.columns.map((col) => {
                      const val = row[col];
                      const isContext = contextColumns.includes(col);
                      const isId = idColumn === col;
                      const isSpec = (specColumns || []).includes(col);
                      return (
                        <TableCell
                          key={col}
                          className={`py-2.5 px-3.5 max-w-sm truncate whitespace-nowrap text-xs ${
                            isId
                              ? "font-mono font-medium text-amber-600 dark:text-amber-400 bg-amber-500/5"
                              : isContext
                              ? "font-medium text-purple-400 bg-purple-500/5"
                              : isSpec
                              ? "font-mono font-medium text-blue-400 bg-blue-500/5"
                              : "text-muted-foreground"
                          }`}
                          title={String(val ?? "")}
                        >
                          {String(val ?? "")}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Modal de confirmación para eliminar Dataset usando Dialog de shadcn/ui */}
      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md neo-panel-elevated border-border shadow-spatial">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-2.5 bg-destructive/10 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                {t("dataset.deleteModalTitle")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("dataset.deleteModalDesc")}
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const targetDs = datasets.find((d) => d.id === confirmDeleteId);
            return targetDs ? (
              <div className="p-3 bg-muted/40 rounded-xl text-xs font-mono space-y-1 border border-border/40">
                <div className="text-muted-foreground">{t("dataset.deleteModalName")} <span className="text-foreground font-semibold">{targetDs.name}</span></div>
                <div className="text-muted-foreground">{t("dataset.deleteModalFile")} <span className="text-foreground">{targetDs.filename}</span></div>
                <div className="text-muted-foreground">{t("dataset.deleteModalRows")} <span className="text-foreground">{targetDs.total_rows.toLocaleString()}</span></div>
              </div>
            ) : null;
          })()}

          {deleteError && (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={deleting}
              onClick={() => {
                setConfirmDeleteId(null);
                setDeleteError(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              className="gap-2 font-bold shadow-md shadow-destructive/20"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("dataset.deleteModalDeleting")}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t("dataset.deleteModalConfirm")}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
