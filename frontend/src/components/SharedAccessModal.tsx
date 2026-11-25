import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Share2, Users } from "lucide-react";

export interface SharedAccessEntry {
  id: number;
  target_user_id: number;
  target_username: string;
  share_mode: string;
  status: string;
  extraInfo?: string | null;
}

export interface SharedAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceTypeLabel: string; // "Experimento" | "Dataset" | "Prompt"
  resourceName: string;
  isOwner: boolean;
  sharedBy?: string | null;
  recipientShareMode?: string | null;
  hideModeSelect?: boolean;
  loadShares?: () => Promise<SharedAccessEntry[]>;
  onUpdateShareMode?: (shareId: number, newMode: "view" | "edit") => Promise<SharedAccessEntry>;
  onRevokeShare?: (shareId: number) => Promise<void>;
  onChanged?: () => void;
}

const UnshareIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <span className={`relative inline-flex items-center justify-center ${className}`}>
    <Share2 className="w-full h-full" />
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

export const SharedAccessModal: React.FC<SharedAccessModalProps> = ({
  isOpen,
  onClose,
  resourceTypeLabel,
  resourceName,
  isOwner,
  sharedBy,
  recipientShareMode,
  hideModeSelect = false,
  loadShares,
  onUpdateShareMode,
  onRevokeShare,
  onChanged,
}) => {
  const [shares, setShares] = useState<SharedAccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingShareId, setEditingShareId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadSharesRef = useRef(loadShares);
  loadSharesRef.current = loadShares;

  useEffect(() => {
    if (!isOpen) {
      setEditingShareId(null);
      setError(null);
      return;
    }
    if (!isOwner || !loadSharesRef.current) {
      setShares([]);
      return;
    }
    setLoading(true);
    setError(null);
    loadSharesRef.current()
      .then((rows) => setShares(rows))
      .catch((err: any) => setError(err?.message || "Error cargando usuarios compartidos"))
      .finally(() => setLoading(false));
  }, [isOpen, isOwner, resourceName]);

  const handleModeChange = async (shareId: number, newMode: "view" | "edit") => {
    if (!onUpdateShareMode) return;
    setSavingId(shareId);
    setError(null);
    try {
      const updated = await onUpdateShareMode(shareId, newMode);
      setShares((prev) => prev.map((s) => (s.id === shareId ? updated : s)));
      setEditingShareId(null);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Error actualizando el modo de compartición");
    } finally {
      setSavingId(null);
    }
  };

  const handleRevoke = async (shareId: number) => {
    if (!onRevokeShare) return;
    setRevokingId(shareId);
    setError(null);
    try {
      await onRevokeShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      if (editingShareId === shareId) setEditingShareId(null);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Error al descompartir");
    } finally {
      setRevokingId(null);
    }
  };

  const formatModeLabel = (mode?: string | null) => {
    if (mode === "edit") return "Edición";
    if (mode === "copy") return "Copia independiente";
    if (mode === "shared") return "Acceso compartido";
    return "Visualizar (solo lectura)";
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border rounded-sm shadow-none">
        <DialogHeader className="border-b border-border pb-3">
          <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary shrink-0" />
            <span>Accesos compartidos · {resourceTypeLabel}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isOwner ? (
              <>
                Usuarios con acceso a <strong>{resourceName}</strong>.
              </>
            ) : (
              <>
                Recurso <strong>{resourceName}</strong> compartido contigo.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              {error}
            </div>
          )}

          {!isOwner ? (
            <div className="p-3 rounded-sm border border-border bg-muted/30 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-mono font-semibold text-foreground">
                  Compartido por {sharedBy ? `@${sharedBy}` : "otro usuario"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Tu acceso actual es gestionado por el propietario.
                </div>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono shrink-0">
                {formatModeLabel(recipientShareMode)}
              </Badge>
            </div>
          ) : loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Cargando comparticiones...</span>
            </div>
          ) : shares.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
              Este {resourceTypeLabel.toLowerCase()} ya no está compartido con ningún usuario.
            </div>
          ) : (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {shares.map((sh) => {
                const isEditing = editingShareId === sh.id;
                const isBusy = savingId === sh.id || revokingId === sh.id;
                return (
                  <div
                    key={sh.id}
                    className="flex items-center justify-between gap-2.5 p-2.5 border border-border rounded-sm bg-background"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-foreground truncate">
                          @{sh.target_username}
                        </span>
                        {sh.status === "pending" && (
                          <Badge variant="outline" className="text-[10px] font-mono py-0 text-amber-500 border-amber-500/40">
                            Pendiente
                          </Badge>
                        )}
                        {sh.status === "accepted" && (
                          <Badge variant="outline" className="text-[10px] font-mono py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10">
                            Aceptado
                          </Badge>
                        )}
                        {sh.extraInfo && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {sh.extraInfo}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!hideModeSelect && (
                        <>
                          <Select
                            value={sh.share_mode === "edit" ? "edit" : "view"}
                            disabled={!isEditing || isBusy}
                            onValueChange={(val) => handleModeChange(sh.id, val as "view" | "edit")}
                          >
                            <SelectTrigger className="h-7 w-[170px] text-[11px] font-mono bg-card border-border rounded-sm disabled:opacity-75">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border rounded-sm shadow-none">
                              <SelectItem value="view" className="text-xs">
                                Visualizar (solo lectura)
                              </SelectItem>
                              <SelectItem value="edit" className="text-xs">
                                Edición
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            variant={isEditing ? "secondary" : "ghost"}
                            size="icon"
                            disabled={isBusy}
                            onClick={() => setEditingShareId(isEditing ? null : sh.id)}
                            className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary"
                            title={isEditing ? "Cancelar edición" : "Cambiar modo de compartición"}
                          >
                            {savingId === sh.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isBusy}
                        onClick={() => handleRevoke(sh.id)}
                        className="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Descompartir"
                      >
                        {revokingId === sh.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UnshareIcon className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
      </DialogContent>
    </Dialog>
  );
};
