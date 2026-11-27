import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import esDict from "../locales/es.json";
import ukDict from "../locales/uk.json";
import usaDict from "../locales/usa.json";
import { updateUserConfig } from "../services/api";

export type Language = "es" | "uk" | "usa";

export interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
  sublabel: string;
}

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: "es", label: "Castellano", flag: "ES", sublabel: "Español (España)" },
  { code: "uk", label: "English (UK)", flag: "UK", sublabel: "British English" },
  { code: "usa", label: "English (US)", flag: "US", sublabel: "American English" },
];

const dictionaries: Record<Language, any> = {
  es: esDict,
  uk: ukDict,
  usa: usaDict,
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language, persistToBackend?: boolean) => Promise<void>;
  syncWithUserConfig: (backendLang?: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  languages: LanguageOption[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = "llm_benchmark_language";

const normalizeLanguageCode = (code?: string | null): Language => {
  if (!code) return "es";
  const clean = code.toLowerCase().trim();
  if (clean === "es" || clean === "sp") return "es";
  if (clean === "uk") return "uk";
  if (clean === "usa") return "usa";
  return "es";
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeLanguageCode(saved);
  });

  const setLanguage = useCallback(async (newLang: Language, persistToBackend: boolean = true) => {
    const validLang = normalizeLanguageCode(newLang);

    setLanguageState(validLang);
    localStorage.setItem(STORAGE_KEY, validLang);

    if (persistToBackend) {
      try {
        await updateUserConfig({ language: validLang });
      } catch (err) {
        // Ignored if user is not authenticated yet
        console.warn("Could not persist language preference to backend profile:", err);
      }
    }
  }, []);

  const syncWithUserConfig = useCallback((backendLang?: string) => {
    if (!backendLang) return;
    const lang = normalizeLanguageCode(backendLang);
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const keys = key.split(".");
      
      const lookup = (dict: any): any => {
        let curr = dict;
        for (const k of keys) {
          if (curr && typeof curr === "object" && k in curr) {
            curr = curr[k];
          } else {
            return undefined;
          }
        }
        return curr;
      };

      let result = lookup(dictionaries[language]);
      
      // Fallback to Spanish if missing in UK or USA
      if (result === undefined) {
        result = lookup(dictionaries["es"]);
      }

      // Fallback to USA if missing in Spanish
      if (result === undefined) {
        result = lookup(dictionaries["usa"]);
      }

      if (typeof result !== "string") {
        return key;
      }

      if (params) {
        return Object.entries(params).reduce((str, [pKey, pVal]) => {
          return str.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
        }, result);
      }

      return result;
    },
    [language]
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        syncWithUserConfig,
        t,
        languages: AVAILABLE_LANGUAGES,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
};
