import React, { useCallback, useEffect, useState } from "react";
import {
  ConnectionProfileItem,
  ConnectionProfileShareItem,
  deleteConnectionProfile,
  fetchConnectionProfiles,
  fetchProfileShares,
  revokeProfileShare,
  shareConnectionProfile,
  updateConnectionProfile,
} from "../services/api";
import { ShareUserPicker } from "./ShareUserPicker";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plug,
  Server,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { SharedAccessModal } from "./SharedAccessModal";

interface DashboardConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DashboardConnectionsModal: React.FC<DashboardConnectionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [profiles, setProfiles] = useState<ConnectionProfileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ConnectionProfileItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<ConnectionProfileItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editVramGb, setEditVramGb] = useState("");
  const [showEditKey, setShowEditKey] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [shareTarget, setShareTarget] = useState<ConnectionProfileItem | null>(null);
  const [profileShares, setProfileShares] = useState<ConnectionProfileShareItem[]>([]);
  const [shareTargetUserId, setShareTargetUserId] = useState<number | "">("");
  const [shareMaxVramGb, setShareMaxVramGb] = useState<string>("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharedAccessTarget, setSharedAccessTarget] = useState<ConnectionProfileItem | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const rows = await fetchConnectionProfiles();
      setProfiles(rows);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar los perfiles de conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    }
  }, [isOpen, loadProfiles]);

  const ownedProfiles = profiles.filter((p) => !p.is_shared);
  const sharedWithMe = profiles.filter((p) => p.is_shared);

  const handleOpenShare = async (profile: ConnectionProfileItem) => {
    setShareTarget(profile);
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

  const handleConfirmShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTarget || !shareTargetUserId) return;
    setShareError(null);
    let maxVram: number | null = null;
    if (shareTarget.provider === "ollama") {
      const parsed = parseFloat(shareMaxVramGb);
      const ownerVram = shareTarget.vram_gb || 0;
      if (isNaN(parsed) || parsed <= 0 || parsed > ownerVram) {
        setShareError(`La VRAM compartida debe estar entre 1 y ${ownerVram} GB.`);
        return;
      }
      maxVram = parsed;
    }
    setIsSharing(true);
    try {
      const created = await shareConnectionProfile(shareTarget.id, {
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
      setIsSharing(false);
    }
  };

  const handleRevokeShare = async (shareId: number) => {
    if (!shareTarget) return;
    try {
      await revokeProfileShare(shareTarget.id, shareId);
      setProfileShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err: any) {
      setShareError(err.message || "Error al revocar el acceso.");
    }
  };

  const handleOpenEdit = (profile: ConnectionProfileItem) => {
    if (profile.is_shared) return;
    setEditTarget(profile);
    setEditName(profile.name);
    setEditUrl(profile.ollama_url || "");
    setEditApiKey(profile.api_key || "");
    setEditVramGb(profile.vram_gb != null ? String(profile.vram_gb) : "");
    setShowEditKey(false);
    setEditError(null);
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || editTarget.is_shared) return;
    setEditError(null);

    const cleanName = editName.trim();
    if (!cleanName) {
      setEditError("El nombre del perfil no puede estar vacío.");
      return;
    }

    let parsedVram: number | null = null;
    if (editTarget.provider === "ollama") {
      if (!editUrl.trim()) {
        setEditError("La URL de Ollama es obligatoria.");
        return;
      }
      const v = parseFloat(editVramGb);
      if (isNaN(v) || v <= 0) {
        setEditError("Debes indicar una VRAM válida (mayor que 0 GB).");
        return;
      }
      parsedVram = v;
    } else if (!editApiKey.trim()) {
      setEditError("La API-Key es obligatoria.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const updated = await updateConnectionProfile(editTarget.id, {
        name: cleanName,
        provider: editTarget.provider,
        ollama_url: editTarget.provider === "ollama" ? editUrl.trim() : "",
        api_key: editTarget.provider === "ollama" ? "" : editApiKey.trim(),
        vram_gb: parsedVram,
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditTarget(null);
    } catch (err: any) {
      setEditError(err.message || "Error al actualizar el perfil.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await deleteConnectionProfile(deleteTarget.id);
      setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al eliminar el perfil.");
    } finally {
      setDeleting(false);
    }
  };

  const renderProviderBadge = (provider: string) => {
    const isOllama = provider.toLowerCase() === "ollama";
    return (
      <Badge
        variant="outline"
        className={`text-[10px] font-mono gap-1 ${
          isOllama
            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
            : "bg-sky-500/10 text-sky-400 border-sky-500/30"
        }`}
      >
        {isOllama ? <Server className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
        <span>{isOllama ? "Ollama" : provider.toUpperCase()}</span>
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-serif font-bold">
              <Plug className="w-4 h-4 text-primary" />
              <span>Gestionar Conexiones</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Consulta tus perfiles de conexión guardados, gestiona los que has compartido y revisa los compartidos contigo.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="p-2.5 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Cargando perfiles de conexión...</span>
            </div>
          ) : (
            <Tabs defaultValue="owned" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="owned" className="text-xs">
                  Mis Perfiles ({ownedProfiles.length})
                </TabsTrigger>
                <TabsTrigger value="shared" className="text-xs">
                  Compartidos Conmigo ({sharedWithMe.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="owned" className="pt-3">
                {ownedProfiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
                    No tienes perfiles de conexión guardados todavía. Puedes guardarlos desde el selector de modelos al crear un experimento.
                  </div>
                ) : (
                  <div className="border border-border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs">Nombre del Perfil</TableHead>
                          <TableHead className="text-xs">Proveedor</TableHead>
                          <TableHead className="text-xs">URL / API-Key</TableHead>
                          <TableHead className="text-xs text-right">VRAM</TableHead>
                          <TableHead className="text-xs text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ownedProfiles.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs font-semibold">
                              <div className="flex items-center gap-1.5">
                                {p.is_shared_by_owner && (
                                  <button
                                    type="button"
                                    onClick={() => setSharedAccessTarget(p)}
                                    title="Ver usuarios con acceso"
                                    className="text-primary hover:text-primary/80 transition-colors shrink-0"
                                  >
                                    <Users className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <span>{p.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>{renderProviderBadge(p.provider)}</TableCell>
                            <TableCell className="text-[11px] font-mono text-muted-foreground max-w-[240px] truncate">
                              {p.provider === "ollama"
                                ? p.ollama_url
                                : p.api_key.length > 8
                                ? `${p.api_key.slice(0, 4)}••••${p.api_key.slice(-4)}`
                                : "••••••••"}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right">
                              {p.provider === "ollama" && p.vram_gb ? `${p.vram_gb} GB` : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEdit(p)}
                                  title="Editar perfil"
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenShare(p)}
                                  title="Compartir y gestionar accesos"
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(p)}
                                  title="Eliminar perfil"
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="shared" className="pt-3">
                {sharedWithMe.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
                    Ningún usuario ha compartido perfiles de conexión contigo todavía.
                  </div>
                ) : (
                  <div className="border border-border rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs">Nombre del Perfil</TableHead>
                          <TableHead className="text-xs">Proveedor</TableHead>
                          <TableHead className="text-xs">Propietario</TableHead>
                          <TableHead className="text-xs">Credenciales</TableHead>
                          <TableHead className="text-xs text-right">VRAM Máx.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sharedWithMe.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs font-semibold">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSharedAccessTarget(p)}
                                  title="Ver detalles de compartición"
                                  className="text-primary hover:text-primary/80 transition-colors shrink-0"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                </button>
                                <span>{p.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>{renderProviderBadge(p.provider)}</TableCell>
                            <TableCell className="text-xs font-mono text-primary">
                              @{p.owner_username}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Lock className="w-3 h-3 text-primary" />
                                <span>{p.provider === "ollama" ? "URL oculta" : "API-Key oculta"}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right">
                              {p.provider === "ollama" && p.max_vram_gb != null
                                ? `${p.max_vram_gb} GB`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Profile Sub-Modal */}
      <Dialog open={Boolean(shareTarget)} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              <span>Compartir perfil: {shareTarget?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              El usuario receptor podrá usar este perfil sin ver nunca la URL ni la API-Key.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmShare} className="space-y-3">
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

            {shareTarget?.provider === "ollama" && (
              <div className="space-y-1.5">
                <Label htmlFor="conn-modal-share-vram" className="text-xs font-semibold">
                  VRAM máxima a compartir (GB) — Máx. del perfil: {shareTarget.vram_gb ?? 0} GB
                </Label>
                <Input
                  id="conn-modal-share-vram"
                  type="number"
                  min={1}
                  max={shareTarget.vram_gb || 512}
                  step={1}
                  value={shareMaxVramGb}
                  onChange={(e) => setShareMaxVramGb(e.target.value)}
                  className="text-xs font-mono h-9"
                />
              </div>
            )}

            {shareError && <p className="text-xs text-destructive font-medium">{shareError}</p>}

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSharing || !shareTargetUserId} className="gap-1.5">
                {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
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

      {/* Edit Connection Profile Dialog (Owner Only) */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              <span>Editar perfil de conexión</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Actualiza los datos de tu perfil {editTarget?.provider === "ollama" ? "Ollama" : editTarget?.provider.toUpperCase()}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-conn-name" className="text-xs font-semibold">
                Nombre del perfil
              </Label>
              <Input
                id="edit-conn-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {editTarget?.provider === "ollama" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-conn-url" className="text-xs font-semibold">
                    URL del servidor Ollama
                  </Label>
                  <Input
                    id="edit-conn-url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="text-xs font-mono h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-conn-vram" className="text-xs font-semibold">
                    VRAM del sistema (GB)
                  </Label>
                  <Input
                    id="edit-conn-vram"
                    type="number"
                    min={1}
                    max={512}
                    step={1}
                    value={editVramGb}
                    onChange={(e) => setEditVramGb(e.target.value)}
                    placeholder="Ej. 24"
                    className="text-xs font-mono h-9"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="edit-conn-key" className="text-xs font-semibold">
                  API-Key ({editTarget?.provider.toUpperCase()})
                </Label>
                <div className="relative">
                  <Input
                    id="edit-conn-key"
                    type={showEditKey ? "text" : "password"}
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    className="text-xs font-mono h-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditKey((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showEditKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {editError && <p className="text-xs text-destructive font-medium">{editError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSavingEdit} className="gap-1.5">
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                <span>Guardar cambios</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              <span>Eliminar perfil de conexión</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              ¿Seguro que quieres eliminar el perfil <strong>{deleteTarget?.name}</strong>? Los usuarios con los que lo hayas compartido perderán el acceso.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="gap-1.5"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Eliminar</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SharedAccessModal
        isOpen={Boolean(sharedAccessTarget)}
        onClose={() => setSharedAccessTarget(null)}
        resourceTypeLabel="Perfil de Conexión"
        resourceName={sharedAccessTarget?.name || ""}
        isOwner={!sharedAccessTarget?.is_shared}
        sharedBy={sharedAccessTarget?.owner_username}
        recipientShareMode="shared"
        hideModeSelect={true}
        loadShares={async () => {
          if (!sharedAccessTarget) return [];
          const rows = await fetchProfileShares(sharedAccessTarget.id);
          return rows.map((r) => ({
            id: r.id,
            target_user_id: r.target_user_id,
            target_username: r.target_username,
            share_mode: "shared",
            status: "accepted",
            extraInfo: r.max_vram_gb != null ? `VRAM máx: ${r.max_vram_gb} GB` : null,
          }));
        }}
        onRevokeShare={async (shareId) => {
          if (!sharedAccessTarget) return;
          await revokeProfileShare(sharedAccessTarget.id, shareId);
        }}
        onChanged={loadProfiles}
      />
    </>
  );
};
