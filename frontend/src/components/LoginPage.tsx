import React, { useState } from "react";
import { User, UserConfig } from "../types";
import { loginUser, registerUser } from "../services/api";
import { useTranslation } from "../i18n";
import { LanguageSelector } from "./LanguageSelector";
import {
  Lock,
  User as UserIcon,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  UserPlus,
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
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LoginPageProps {
  onLoginSuccess: (user: User, config: UserConfig) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { t, language, syncWithUserConfig } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError(t("auth.passwordsMismatch"));
      return;
    }

    setLoading(true);
    try {
      const data =
        mode === "register"
          ? await registerUser(username.trim(), password, fullName.trim(), language)
          : await loginUser(username.trim(), password);
      if (data.config?.language) {
        syncWithUserConfig(data.config.language);
      }
      onLoginSuccess(data.user, data.config);
    } catch (err: any) {
      setError(err.message || t("auth.invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setError(null);
    setConfirmPassword("");
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background select-none relative">
      {/* Top Language Selector */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <LanguageSelector variant="outline" showLabel={true} />
      </div>

      <Card className="w-full max-w-sm border-t-2 border-t-foreground border-b-2 border-b-foreground border-x border-x-border bg-card rounded-none shadow-subtle p-6">
        <CardHeader className="text-center space-y-2.5 p-0 pb-4 border-b border-border">
          <img
            src="/favicon.svg?v=3.0"
            alt="CalibrAI Logo"
            className="mx-auto w-11 h-11 rounded-sm"
          />

          <div>
            <CardTitle className="font-serif text-xl font-bold tracking-tight text-foreground">
              {t("auth.title")}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              {mode === "register" ? t("auth.createAccountSubtitle") : t("auth.subtitle")}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-0 pt-1">
          {error && (
            <Alert variant="destructive" role="alert" aria-live="assertive" className="bg-destructive/10 border-destructive/20 text-destructive text-xs py-2 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <AlertDescription className="text-xs font-medium ml-2">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} id="login-form" className="space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                {t("auth.username")}
              </Label>
              <div className="relative">
                <UserIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder={t("auth.placeholderUser")}
                  className="pl-8 bg-muted/30 border-border focus:border-zinc-500 focus:ring-0 h-9 text-xs rounded-md transition-all duration-150"
                />
              </div>
            </div>

            {mode === "register" && (
              <div className="space-y-1">
                <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground">
                  {t("auth.fullName")}
                </Label>
                <div className="relative">
                  <UserPlus className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("auth.fullNamePlaceholder")}
                    className="pl-8 bg-muted/30 border-border focus:border-zinc-500 focus:ring-0 h-9 text-xs rounded-md transition-all duration-150"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                {t("auth.password")}
              </Label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={t("auth.placeholderPass")}
                  className="pl-8 pr-9 bg-muted/30 border-border focus:border-zinc-500 focus:ring-0 h-9 text-xs font-mono rounded-md transition-all duration-150"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-transparent"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                </Button>
              </div>
            </div>

            {mode === "register" && (
              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">
                  {t("auth.confirmPassword")}
                </Label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder={t("auth.confirmPasswordPlaceholder")}
                    className="pl-8 bg-muted/30 border-border focus:border-zinc-500 focus:ring-0 h-9 text-xs font-mono rounded-md transition-all duration-150"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs rounded-md flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer disabled:opacity-50 mt-1"
            >
              <span>
                {loading
                  ? mode === "register"
                    ? t("auth.registering")
                    : t("auth.verifying")
                  : mode === "register"
                  ? t("auth.registerButton")
                  : t("auth.loginButton")}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </form>

          <div className="pt-2 border-t border-border/60 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-xs text-primary hover:underline font-medium cursor-pointer"
            >
              {mode === "register" ? t("auth.switchToLogin") : t("auth.switchToRegister")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

