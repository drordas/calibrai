import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathFormulaProps {
  math: string;
  displayMode?: boolean;
  className?: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({
  math,
  displayMode = true,
  className = "",
}) => {
  const html = useMemo(() => {
    if (!math) return "";
    let clean = math.trim();
    // Strip leading and trailing math delimiters like $ or $$
    clean = clean.replace(/^\${1,2}/, "").replace(/\${1,2}$/, "").trim();

    try {
      return katex.renderToString(clean, {
        displayMode,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch {
      return clean;
    }
  }, [math, displayMode]);

  return (
    <span
      className={`inline-block math-formula-container ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
