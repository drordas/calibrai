---
name: CalibrAI
description: Interactive JCR psychometric monograph and validation workbench.
colors:
  archival-cream: "#FAF8F5"
  charcoal-ink: "#141413"
  scholarly-crimson: "#7C1D26"
  illuminated-crimson: "#C83E4B"
  prussian-slate: "#1E3A5F"
  warm-stone: "#EDE8DD"
  booktabs-rule: "#D5CFC2"
  alert-vermilion: "#BA311C"
  nocturnal-folio: "#121316"
typography:
  display:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Source Sans 3', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.scholarly-crimson}"
    textColor: "{colors.archival-cream}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card-monograph:
    backgroundColor: "{colors.archival-cream}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.none}"
    padding: "24px"
---

# Design System: CalibrAI

<!-- impeccable:design-map -->
Name: CalibrAI
Colors: primary: scholarly-crimson #7C1D26; secondary: prussian-slate #1E3A5F; tertiary: alert-vermilion #BA311C; neutral: archival-cream #FAF8F5; primary: illuminated-crimson #C83E4B
Fonts: Source Serif 4 (display, headline, title); Source Sans 3 (body); JetBrains Mono (label)
Spacing: xs 4px, sm 8px, md 16px, lg 24px, xl 32px
Radius: none 0px, sm 2px, md 4px
North Star: "Monografía Científica JCR & Psicometría"
Rules:
- The Crimson Significance Rule. Reserve Scholarly JCR Crimson for primary CTAs, active tabs, `Registro I.` prefixes, and Pillar IV KPIs.
- The Archival Paper Default Rule. Light mode on warm archival cream is canonical; dark mode uses nocturnal slate with identical contrast.
- The Roman Numeral Indexing Rule. Index navigation modes, KPIs, registries, and validation pillars with Roman numerals (`I.`–`IV.`).
- The Booktabs Over Box-Shadow Rule. Use `2px` solid top and bottom rules (`border-t-2 border-b-2 border-foreground`) instead of shadows.
Elevation:
- Zero-Shadow Panels: shadow-none
Don't:
- Don't use glassmorphic blur, drop shadows, or hover scale transforms.
- Don't use large pill radii (`rounded-xl`, `rounded-2xl`) on containers or tables.
- Don't render numerical columns without `tabular-nums`.
Full: .impeccable/design-full.md
