import React, { useState, useEffect } from "react";
import {
  SavedBenchmarkSummary,
  SavedBenchmarkDetail,
  ModelBenchmarkSummary,
  PairwiseComparison,
} from "../types";
import {
  fetchSavedBenchmarks,
  saveBenchmarkRun,
  fetchSavedBenchmarkDetail,
  deleteSavedBenchmark,
} from "../services/api";
import { useTranslation } from "../i18n";
import {
  Bookmark,
  Save,
  Trash2,
  FolderOpen,
  Clock,
  Database,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SavedBenchmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  canSaveCurrent: boolean;
  currentData?: {
    datasetId: string;
    datasetName: string;
    taskType: string;
    template: string;
    systemPrompt: string;
    modelIds: string[];
    sampleSize: number;
    modelSummaries: Record<string, ModelBenchmarkSummary>;
    pairwiseMatrix: PairwiseComparison[];
    bestPerformers: Record<string, string>;
  };
  onLoadBenchmark: (detail: SavedBenchmarkDetail) => void;
}

export const SavedBenchmarksModal: React.FC<SavedBenchmarksModalProps> = ({
  isOpen,
  onClose,
  canSaveCurrent,
  currentData,
  onLoadBenchmark,
}) => {
  const { t } = useTranslation();
  const [benchmarks, setBenchmarks] = useState<SavedBenchmarkSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>("Benchmark LLM - " + new Date().toLocaleDateString());
  const [saveDesc, setSaveDesc] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>(canSaveCurrent ? "save" : "list");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadList();
      if (canSaveCurrent) {
        setActiveTab("save");
      } else {
        setActiveTab("list");
      }
    }
  }, [isOpen, canSaveCurrent]);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await fetchSavedBenchmarks();
      setBenchmarks(data);
    } catch (err) {
      console.error("Error loading saved benchmarks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentData || !saveName.trim()) return;

    setSaving(true);
    try {
      await saveBenchmarkRun({
        name: saveName.trim(),
        description: saveDesc.trim(),
        dataset_id: currentData.datasetId,
        dataset_name: currentData.datasetName,
        task_type: currentData.taskType,
        template: currentData.template,
        system_prompt: currentData.systemPrompt,
        model_ids: currentData.modelIds,
        sample_size: currentData.sampleSize,
        model_summaries: currentData.modelSummaries,
        pairwise_matrix: currentData.pairwiseMatrix,
        best_performers: currentData.bestPerformers,
      });
      setSuccessMsg(t("saved.saveSuccess"));
      setTimeout(() => {
        setSuccessMsg(null);
        setActiveTab("list");
        loadList();
      }, 1500);
    } catch (err) {
      console.error("Error saving benchmark:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const detail = await fetchSavedBenchmarkDetail(id);
      onLoadBenchmark(detail);
      onClose();
    } catch (err) {
      console.error("Error loading benchmark detail:", err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("saved.confirmDelete"))) return;
    try {
      await deleteSavedBenchmark(id);
      setBenchmarks(benchmarks.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Error deleting benchmark:", err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-card border border-border p-0 overflow-hidden flex flex-col max-h-[85vh] rounded-lg shadow-none">
        <DialogHeader className="p-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-muted-foreground" />
            <DialogTitle className="font-semibold text-sm text-foreground">
              {t("saved.title")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {t("saved.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 border-b border-border bg-muted/10 py-2">
            <TabsList className="bg-muted/40 border border-border h-8 p-0.5 rounded-md">
              <TabsTrigger value="list" className="text-xs px-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground font-medium rounded-sm">
                {t("saved.savedBenchmarksCount", { count: benchmarks.length })}
              </TabsTrigger>
              {canSaveCurrent && (
                <TabsTrigger value="save" className="text-xs px-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground font-medium rounded-sm">
                  {t("saved.saveCurrentResults")}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <ScrollArea className="flex-1 p-5">
            {successMsg && (
              <Alert className="mb-4 bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <AlertDescription className="font-semibold ml-2">{successMsg}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="save" className="space-y-4 m-0">
              {canSaveCurrent && (
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="benchmark-name" className="text-xs font-semibold text-muted-foreground">
                      {t("saved.nameLabel")}
                    </Label>
                    <Input
                      id="benchmark-name"
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      required
                      placeholder={t("saved.namePlaceholder")}
                      className="bg-background/60 border-border/80 h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="benchmark-desc" className="text-xs font-semibold text-muted-foreground">
                      {t("saved.notesLabel")}
                    </Label>
                    <Textarea
                      id="benchmark-desc"
                      value={saveDesc}
                      onChange={(e) => setSaveDesc(e.target.value)}
                      rows={3}
                      placeholder={t("saved.notesPlaceholder")}
                      className="bg-background/60 border-border/80 text-xs"
                    />
                  </div>

                  <div className="p-3 bg-muted/30 border border-border/60 rounded-xl text-xs space-y-1">
                    <span className="font-semibold text-muted-foreground block">{t("saved.summaryToSave")}</span>
                    <p className="text-foreground">
                      {t("saved.modelsToSave", { models: currentData?.modelIds.join(", ") || "" })}
                    </p>
                    <p className="text-foreground">
                      {t("saved.samplesEvaluated", { count: currentData?.sampleSize ?? 0 })}
                    </p>
                    <p className="text-foreground">
                      {t("saved.includesContent")}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs rounded-xl shadow-md gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{saving ? t("saved.savingToDb") : t("saved.saveToDb")}</span>
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="list" className="space-y-3 m-0">
              {loading && (
                <div className="text-center py-8 text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>{t("saved.loadingSaved")}</span>
                </div>
              )}
              {!loading && benchmarks.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground space-y-2">
                  <Database className="w-8 h-8 opacity-40 mx-auto text-primary animate-float" />
                  <p className="font-semibold text-foreground">{t("saved.noSavedYet")}</p>
                  <p className="text-[11px]">{t("saved.runAndSavePrompt")}</p>
                </div>
              )}

              {benchmarks.map((b) => (
                <div
                  key={b.id}
                  onClick={() => handleLoad(b.id)}
                  className="p-4 bg-muted/20 hover:bg-muted/40 border border-border/60 rounded-xl transition-all duration-300 ease-out cursor-pointer flex items-center justify-between gap-4 group antigravity-lift"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-foreground">{b.name}</h4>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 bg-primary/10 text-primary uppercase font-bold border-primary/20">
                        {b.task_type}
                      </Badge>
                    </div>
                    {b.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{b.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                      <span>{b.model_count} {t("common.models")}</span>
                      <span>&bull;</span>
                      <span>{b.sample_size} {t("common.samples")}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(b.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoad(b.id)}
                      className="h-8 px-3 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 text-xs font-semibold gap-1.5"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{t("saved.loadButton")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(b.id, e)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title={t("saved.deleteFromDbTooltip")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SavedBenchmarksModal;
