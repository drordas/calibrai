import React, { useState, useEffect, useRef } from "react";
import { User, UserConfig } from "../types";
import { updateUserProfile } from "../services/api";
import { useTranslation, AVAILABLE_LANGUAGES, Language } from "../i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  Share2,
  User as UserIcon,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onProfileUpdated: (user: User, config: UserConfig) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onProfileUpdated,
}) => {
  const { t, language } = useTranslation();
  const prevOpenRef = useRef(false);

  const [fullName, setFullName] = useState(user.full_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [defaultLanguage, setDefaultLanguage] = useState<Language>(language);
  const [allowDatasetSharing, setAllowDatasetSharing] = useState<boolean>(user.allow_dataset_sharing ?? true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setFullName(user.full_name || "");
      setEmail(user.email || "");
      setDefaultLanguage(language);
      setAllowDatasetSharing(user.allow_dataset_sharing ?? true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError(null);
      setSuccess(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, user, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setError(t("profile.invalidEmail"));
      return;
    }

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        setError(t("profile.currentPasswordRequired"));
        return;
      }
      if (newPassword.length < 4) {
        setError(t("profile.passwordTooShort"));
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(t("profile.passwordMismatch"));
        return;
      }
    }

    setSaving(true);
    try {
      const result = await updateUserProfile({
        full_name: fullName.trim(),
        email: trimmedEmail,
        language: defaultLanguage,
        allow_dataset_sharing: allowDatasetSharing,
        ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
      });
      onProfileUpdated(result.user, result.config);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(t("profile.savedSuccess"));
    } catch (err: any) {
      setError(err.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border rounded-sm shadow-none">
        <DialogHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="font-serif text-lg font-bold text-foreground flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" />
              {t("profile.title")}
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-[11px] rounded-sm border-border">
              @{user.username}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("profile.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="space-y-1.5">
              <Label
                htmlFor="profile-fullname"
                className="h-4 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
              >
                <UserIcon className="w-3 h-3 text-primary shrink-0" />
                <span>{t("profile.fullNameLabel")}</span>
              </Label>
              <Input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("profile.fullNamePlaceholder")}
                className="h-9 text-xs bg-background border-border rounded-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="profile-email"
                className="h-4 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
              >
                <Mail className="w-3 h-3 text-primary shrink-0" />
                <span>{t("profile.emailLabel")}</span>
              </Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("profile.emailPlaceholder")}
                className="h-9 text-xs bg-background border-border rounded-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="h-4 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Globe className="w-3 h-3 text-primary shrink-0" />
              <span>{t("profile.defaultLanguageLabel")}</span>
            </Label>
            <Select value={defaultLanguage} onValueChange={(val) => setDefaultLanguage(val as Language)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-sm shadow-none">
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-xs">
                    <span className="font-mono text-[10px] mr-2 text-muted-foreground">[{lang.flag}]</span>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-background">
            <div className="space-y-0.5">
              <Label
                htmlFor="profile-dataset-sharing"
                className="text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{t("profile.allowDatasetSharingLabel")}</span>
              </Label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("profile.allowDatasetSharingHint")}
              </p>
            </div>
            <Switch
              id="profile-dataset-sharing"
              checked={allowDatasetSharing}
              onCheckedChange={setAllowDatasetSharing}
            />
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                {t("profile.passwordSectionTitle")}
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("profile.passwordSectionHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="profile-current-pass"
                className="h-4 flex items-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
              >
                {t("profile.currentPasswordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="profile-current-pass"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("profile.currentPasswordPlaceholder")}
                  autoComplete="current-password"
                  className="h-9 pr-9 text-xs bg-background border-border rounded-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="profile-new-pass"
                  className="h-4 flex items-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                >
                  {t("profile.newPasswordLabel")}
                </Label>
                <div className="relative">
                  <Input
                    id="profile-new-pass"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("profile.newPasswordPlaceholder")}
                    autoComplete="new-password"
                    className="h-9 pr-9 text-xs bg-background border-border rounded-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="profile-confirm-pass"
                  className="h-4 flex items-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                >
                  {t("profile.confirmPasswordLabel")}
                </Label>
                <div className="relative">
                  <Input
                    id="profile-confirm-pass"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("profile.confirmPasswordPlaceholder")}
                    autoComplete="new-password"
                    className="h-9 pr-9 text-xs bg-background border-border rounded-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs rounded-sm border-border"
            >
              {t("common.close")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("profile.saving")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
