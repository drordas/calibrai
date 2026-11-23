import React from "react";
import { useTranslation, Language } from "../i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Globe, Check } from "lucide-react";

interface LanguageSelectorProps {
  variant?: "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  className?: string;
  showLabel?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = "outline",
  size = "sm",
  className = "",
  showLabel = true,
}) => {
  const { language, setLanguage, languages } = useTranslation();

  const currentOption = languages.find((l) => l.code === language) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={`h-7 px-2 gap-1.5 border-border bg-card hover:bg-muted/60 text-foreground text-xs font-medium rounded-md transition-all duration-150 cursor-pointer ${className}`}
          title="Seleccionar idioma / Select language"
        >
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
            {currentOption.flag}
          </span>
          {showLabel && (
            <span className="hidden xl:inline text-muted-foreground text-[11px]">
              {currentOption.label}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-48 bg-card border border-border p-1 shadow-spatial rounded-md"
      >
        <DropdownMenuLabel className="text-[10px] uppercase font-mono font-semibold tracking-wider text-muted-foreground px-2 py-1">
          Idioma / Language
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border my-1" />

        {languages.map((lang) => {
          const isSelected = language === lang.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code as Language)}
              className={`flex items-center justify-between px-2 py-1.5 text-xs rounded-sm cursor-pointer transition-colors ${
                isSelected
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-4 flex items-center justify-center rounded bg-muted/70 text-[9px] font-mono font-bold border border-border">
                  {lang.flag}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs leading-none">{lang.label}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                    {lang.sublabel}
                  </span>
                </div>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-2 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
