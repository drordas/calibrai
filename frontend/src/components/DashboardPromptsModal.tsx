import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DatasetSummary } from "../types";
import {
  deleteSavedPrompt,
  fetchDatasets,
  fetchSavedPrompts,
  SavedPromptItem,
  updateSavedPrompt,
} from "../services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
  Database,
  Eye,
  FileCode,
  Loader2,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";

interface DashboardPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDatasetFilter?: string;
}

export const DashboardPromptsModal: React.FC<DashboardPromptsModalProps> = ({
  isOpen,
  onClose,
  initialDatasetFilter,
}) => {
  const [prompts, setPrompts] = useState<SavedPromptItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetFilter, setSelectedDatasetFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [previewTarget, setPreviewTarget] = useState<SavedPromptItem | null>(null);
  const [editTarget, setEditTarget] = useState<SavedPromptItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDatasetId, setEditDatasetId] = useState<string>("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editModelPrompt, setEditModelPrompt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SavedPromptItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [promptList, dsList] = await Promise.all([
        fetchSavedPrompts(),
        fetchDatasets(),
      ]);
      setPrompts(promptList);
      setDatasets(dsList);
    } catch (err: any) {
      setError(err?.message || "Error cargando los prompts guardados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedDatasetFilter(initialDatasetFilter || "all");
      setPreviewTarget(null);
      setEditTarget(null);
      setDeleteTarget(null);
      setFeedback(null);
      setSelectedDatasetFilter("all");
      void loadData();
    }
  }, [isOpen, loadData]);

  const datasetMap = useMemo(() => {
    const map = new Map<string, DatasetSummary>();
    for (const ds of datasets) map.set(ds.id, ds);
    return map;
  }, [datasets]);

  const taskDatasets = useMemo(
    () => datasets.filter((ds) => !ds.is_ground_truth),
    [datasets]
  );

  const filteredPrompts = useMemo(() => {
    if (selectedDatasetFilter === "all") return prompts;
    return prompts.filter((p) => p.dataset_id === selectedDatasetFilter);
  }, [prompts, selectedDatasetFilter]);

  const getDatasetLabel = (datasetId?: string | null) => {
    if (!datasetId) return "Sin dataset";
    return datasetMap.get(datasetId)?.name || datasetId;
  };

  const handleOpenEdit = (item: SavedPromptItem) => {
    setError(null);
    setFeedback(null);
    setPreviewTarget(null);
    setEditTarget(item);
    setEditName(item.name);
    setEditDatasetId(item.dataset_id || "");
    setEditSystemPrompt(item.system_prompt || "");
    setEditModelPrompt(item.model_prompt || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    const cleanName = editName.trim();
    if (!cleanName) {
      setError("El título del prompt es obligatorio.");
      return;
    }
    if (!editModelPrompt.trim()) {
      setError("El Prompt del Modelo no puede estar vacío.");
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateSavedPrompt(editTarget.id, {
        name: cleanName,
        dataset_id: editDatasetId || null,
        system_prompt: editSystemPrompt,
        model_prompt: editModelPrompt,
      });
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditTarget(null);
      setFeedback(`Prompt "${updated.name}" actualizado correctamente.`);
    } catch (err: any) {
      setError(err?.message || "Error actualizando el prompt");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSavedPrompt(deleteTarget.id);
      setPrompts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (previewTarget?.id === deleteTarget.id) setPreviewTarget(null);
      if (editTarget?.id === deleteTarget.id) setEditTarget(null);
      setFeedback(`Prompt "${deleteTarget.name}" eliminado correctamente.`);
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.message || "Error eliminando el prompt");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl max-h-[88vh] bg-card border-border rounded-sm shadow-none flex flex-col overflow-hidden">
          <DialogHeader className="border-b border-border pb-3 pr-6">
            <DialogTitle className="font-serif text-lg font-bold text-foreground flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary shrink-0" />
              <span>
                {previewTarget
                  ? previewTarget.name
                  : editTarget
                  ? `Editar prompt: ${editTarget.name}`
                  : "Prompts Almacenados"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {previewTarget
                ? `Dataset asociado: ${getDatasetLabel(previewTarget.dataset_id)}`
                : editTarget
                ? "Modifica el título, el Prompt del Sistema o el Prompt del Modelo."
                : "Listado de prompts guardados asociados a cada Dataset de Tareas."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 min-w-0">
            {error && (
              <div className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {feedback && (
              <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
                {feedback}
              </div>
            )}

            {previewTarget ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Prompt del Sistema
                  </Label>
                  <pre className="p-3 rounded-sm border border-border bg-background text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed text-foreground">
                    {previewTarget.system_prompt || "—"}
                  </pre>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Prompt del Modelo
                  </Label>
                  <pre className="p-3 rounded-sm border border-border bg-background text-xs font-mono whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed text-foreground">
                    {previewTarget.model_prompt}
                  </pre>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewTarget(null)}
                    className="h-8 text-xs rounded-sm border-border gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al listado</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleOpenEdit(previewTarget)}
                    className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                </div>
              </div>
            ) : editTarget ? (
              <form onSubmit={handleSaveEdit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-name" className="text-xs font-semibold text-foreground">
                    Título del prompt
                  </Label>
                  <Input
                    id="edit-prompt-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 text-xs bg-background border-border rounded-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Dataset de Tareas asociado
                  </Label>
                  <Select value={editDatasetId || "none"} onValueChange={(v) => setEditDatasetId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-sm text-xs">
                      <SelectItem value="none">Sin dataset</SelectItem>
                      {taskDatasets.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id}>
                          {ds.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-system" className="text-xs font-semibold text-foreground">
                    Prompt del Sistema
                  </Label>
                  <Textarea
                    id="edit-prompt-system"
                    rows={4}
                    value={editSystemPrompt}
                    onChange={(e) => setEditSystemPrompt(e.target.value)}
                    className="font-mono text-xs bg-background border-border rounded-sm resize-y leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-model" className="text-xs font-semibold text-foreground">
                    Prompt del Modelo
                  </Label>
                  <Textarea
                    id="edit-prompt-model"
                    rows={10}
                    value={editModelPrompt}
                    onChange={(e) => setEditModelPrompt(e.target.value)}
                    className="font-mono text-xs bg-background border-border rounded-sm resize-y leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingEdit}
                    onClick={() => setEditTarget(null)}
                    className="h-8 text-xs rounded-sm border-border gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingEdit}
                    className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  >
                    {savingEdit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <span>Guardar cambios</span>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  {initialDatasetFilter && initialDatasetFilter !== "all" ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Dataset de Tareas:</span>
                      <Badge
                        variant="outline"
                        className="text-[11px] font-mono rounded-sm border-border bg-muted/30 text-foreground gap-1"
                      >
                        <Database className="w-3 h-3 text-primary" />
                        <span>{getDatasetLabel(initialDatasetFilter)}</span>
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Filtrar por Dataset de Tareas:</span>
                      <div className="w-60">
                        <Select value={selectedDatasetFilter} onValueChange={setSelectedDatasetFilter}>
                          <SelectTrigger className="h-8 text-xs bg-background border-border rounded-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border rounded-sm text-xs">
                            <SelectItem value="all">Todos los datasets ({prompts.length})</SelectItem>
                            {taskDatasets.map((ds) => (
                              <SelectItem key={ds.id} value={ds.id}>
                                {ds.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <Badge variant="outline" className="text-[11px] font-mono rounded-sm self-start sm:self-auto">
                    {filteredPrompts.length} {filteredPrompts.length === 1 ? "prompt" : "prompts"}
                  </Badge>
                </div>

                {loading ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Cargando prompts...</span>
                  </div>
                ) : filteredPrompts.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
                    No hay prompts guardados para este filtro.
                  </div>
                ) : (
                  <div className="border-t-2 border-b-2 border-foreground">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-foreground hover:bg-transparent">
                          <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Título
                          </TableHead>
                          <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Dataset de Tareas
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Acciones
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPrompts.map((item) => {
                          const linkedDs = datasets.find((d) => d.id === item.dataset_id);
                          const isSharedPrompt = Boolean(linkedDs?.is_shared || linkedDs?.is_shared_by_owner);
                          return (
                          <TableRow key={item.id} className="border-b border-border/60">
                            <TableCell className="py-2.5 text-xs font-semibold text-foreground">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSharedPrompt && (
                                  <span
                                    title={
                                      linkedDs?.shared_by
                                        ? `Compartido por @${linkedDs.shared_by}`
                                        : "Compartido"
                                    }
                                    className="inline-flex items-center text-primary shrink-0"
                                  >
                                    <Users className="w-3.5 h-3.5" />
                                  </span>
                                )}
                                <span className="truncate">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className="text-[11px] font-mono rounded-sm border-border bg-muted/30 text-foreground gap-1"
                              >
                                <Database className="w-3 h-3 text-primary" />
                                <span>{getDatasetLabel(item.dataset_id)}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPreviewTarget(item)}
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Ver prompt"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEdit(item)}
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="Editar prompt"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(item)}
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Eliminar prompt"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="h-8 text-xs rounded-sm border-border"
                  >
                    Cerrar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Eliminar prompt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ¿Seguro que deseas eliminar el prompt <strong>"{deleteTarget?.name}"</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="h-8 text-xs rounded-sm gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Eliminando...</span>
                </>
              ) : (
                <span>Eliminar</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
