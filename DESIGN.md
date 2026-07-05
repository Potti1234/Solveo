---
name: Vultr-Audit
description: A calm case-file interface for bank risk analysts reviewing covenant risk.
colors:
  ink: "#18181b"
  paper: "#fafafa"
  surface: "#ffffff"
  muted: "#f4f4f5"
  border: "#e4e4e7"
  subdued-text: "#71717a"
  success: "#047857"
  success-bg: "#ecfdf5"
  warning: "#b45309"
  warning-bg: "#fffbeb"
  danger: "#b91c1c"
  danger-bg: "#fef2f2"
  info: "#1d4ed8"
  info-bg: "#eff6ff"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.12em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  chat-bubble-agent:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  chat-bubble-user:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  badge-neutral:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Vultr-Audit

## 1. Overview

**Creative North Star: "The Analyst's Case File"**

Vultr-Audit is a product workspace for risk analysts, not a marketing surface. The visual system should feel like a clean digital case file: organized, quiet, source-conscious, and ready for repeated review. The chat is the primary work surface because it shows the investigation unfolding; the inspector and sidebar support the conversation rather than competing with it.

The interface rejects crypto dark mode, neon fintech, generic AI-purple workflow software, playful chatbot styling, and dense terminal aesthetics. It should make the agent's internal work visible for judges and analysts, but it must never feel staged or decorative.

**Key Characteristics:**
- Restrained monochrome surfaces with status color used only for state.
- Flat layered panels, borders, and dividers instead of decorative shadows.
- Compact shadcn controls with consistent radii and predictable affordances.
- Chat-led analysis with inspectable evidence, calculations, and scheduled follow-up work.
- Calm copy that explains what the agent is doing in concrete terms.

## 2. Colors

The palette is monochrome with restrained status color: black, white, and zinc neutrals carry the product; green, amber, red, and blue appear only when they communicate state.

### Primary
- **Case File Ink**: The primary action and selected-message color. Use it for the strongest foregrounds, user chat bubbles, and primary commands.

### Neutral
- **Case File Paper**: The app background. It keeps the surface bright without introducing beige, cream, or warm paper defaults.
- **Evidence Surface**: The pure white panel and bubble surface for the chat, inspector, sidebar, and form controls.
- **Quiet Layer**: The muted layer for hover states, inactive badges, panel fills, and low-emphasis grouped content.
- **Hairline Border**: The structural divider color. Borders define panels, message cards, inputs, sidebars, and the inspector.
- **Subdued Text**: Secondary labels, timestamps, helper text, and metadata. Use carefully and keep contrast readable.

### Tertiary
- **Pass Green**: Use only for compliant status, successful checks, and positive follow-up states.
- **Review Amber**: Use only for warnings, near-limit states, and items requiring analyst review.
- **Fail Red**: Use only for failures, breached rules, errors, and destructive controls.
- **Working Blue**: Use only for active processing, live streaming, and currently running agent work.

### Named Rules

**The Status-Only Color Rule.** Green, amber, red, and blue are state language, not decoration. If a color does not tell the analyst something changed, passed, failed, or is running, remove it.

**The No Crypto Dark Mode Rule.** Dark surfaces may exist for code output only. The product shell stays light, clean, and legible.

## 3. Typography

**Display Font:** Geist Variable with ui-sans-serif fallback  
**Body Font:** Geist Variable with ui-sans-serif fallback  
**Label/Mono Font:** Geist Mono for numbers, code output, ratios, and payload previews

**Character:** The typography is compact and operational. It should feel precise without becoming cramped, using weight and spacing rather than oversized type.

### Hierarchy

- **Display** (600, 16px, 1.25): App title and run title only. Product UI does not use hero-scale type.
- **Headline** (600, 14px, 1.35): Inspector section titles, event titles, and important panel headers.
- **Title** (500-600, 14px, 1.35): Run list labels, tool names, memo headings, and action labels.
- **Body** (400, 14px, 1.6): Chat copy, evidence summaries, explanations, and memo text. Cap long prose at 65-75ch.
- **Label** (500, 12px, 0.12em, uppercase only for short labels): Metadata labels such as Decision, Inputs, and Citations.
- **Mono** (400, 12px, 1.5): Ratios, values, code output, JSON payloads, and accession-like identifiers.

### Named Rules

**The Product Type Rule.** Never use display typography for ordinary UI. The analyst should feel oriented, not addressed by a landing page.

**The Evidence Number Rule.** Financial values, ratios, script output, and raw payload previews use mono or tabular numbers.

## 4. Elevation

The system is flat by default. Depth comes from borders, tonal layering, spacing, and sticky regions, not shadows. A panel can be important without floating. Shadows are reserved for existing shadcn focus mechanics or short-lived interaction feedback, never for decorative cards.

### Shadow Vocabulary

- **None at Rest**: Panels, sidebars, chat bubbles, inspector sections, inputs, and badges are border-defined at rest.
- **Focus Ring**: The 3px shadcn focus ring communicates keyboard focus and must remain visible.
- **Minimal Interaction Lift**: Active controls may translate by 1px on press. Do not pair wide shadows with 1px borders.

### Named Rules

**The Flat Case File Rule.** If a surface can be separated with a 1px border or divider, use that instead of a shadow.

## 5. Components

### Buttons

- **Shape:** Compact rounded rectangle (10px radius).
- **Primary:** Case File Ink background with Case File Paper text, 32px height, compact horizontal padding.
- **Hover / Focus:** Hover slightly softens the ink or fills neutral backgrounds. Focus uses the shadcn ring and must remain visible.
- **Secondary / Ghost / Outline:** Outline and ghost variants use borders or neutral hover fills. They should never introduce new accent colors.

### Chips

- **Style:** Small pill badges with neutral fills or state-tinted backgrounds.
- **State:** Status chips use Pass Green, Review Amber, Fail Red, or Working Blue only when the label expresses that state.

### Cards / Containers

- **Corner Style:** Small to medium radius (8-12px). Never use oversized rounded cards.
- **Background:** Evidence Surface for primary panels, Quiet Layer for grouped or inactive detail.
- **Shadow Strategy:** Flat by default; use borders and dividers.
- **Border:** Hairline Border is the primary container boundary.
- **Internal Padding:** Dense product spacing, usually 12-20px depending on hierarchy.

### Inputs / Fields

- **Style:** 32px compact fields with 10px radius, border stroke, and white or transparent surface.
- **Focus:** Border shifts to ring color with the shadcn focus ring.
- **Error / Disabled:** Error uses Fail Red tint and border. Disabled fields reduce opacity and remove pointer interaction.

### Navigation

The left sidebar is an agent-run ledger. It should list current runs, scheduled follow-up agents, and run status with compact rows. The sidebar can collapse, but it must preserve recognizability through icons and tooltips. Active rows use neutral selection, not saturated accent color.

### Chat Timeline

The chat timeline is the primary product surface. User messages use the dark primary bubble; agent events use white bordered bubbles; processing events show Working Blue only for live activity. Every event that affects the analysis should be inspectable in the right panel.

### Inspector

The inspector is contextual evidence, not a second report page. It should show the selected event's inputs, outputs, citations, calculations, code output, or raw payload. Long details scroll inside the inspector while the chat remains the primary scroll surface.

## 6. Do's and Don'ts

### Do:

- **Do** lead with the conversation. The chat timeline is the analyst's main work surface.
- **Do** use monochrome surfaces and restrained status colors.
- **Do** keep panels flat and layered with borders.
- **Do** expose source citations, tool inputs, tool outputs, code output, and raw payloads on demand.
- **Do** show scheduled follow-up agents in the sidebar as operational work.
- **Do** use concise, natural language for agent progress: "I am retrieving evidence for total debt" beats internal system phrasing.
- **Do** preserve shadcn component vocabulary across buttons, inputs, badges, bubbles, sidebar, and attachments.

### Don't:

- **Don't** make the product look like crypto dark mode, neon fintech, generic AI-purple workflow software, a playful consumer chatbot, or a dense Bloomberg-style terminal.
- **Don't** use marketing-style hero sections, decorative dashboards, or heavy visual effects.
- **Don't** make the main surface a form-heavy interface with many required fields. The primary input is a natural-language chat composer with document upload.
- **Don't** use color as decoration. Status colors only communicate pass, warning, fail, or running.
- **Don't** use oversized card radii, wide soft shadows, gradient text, glassmorphism, or colored side-stripe borders.
- **Don't** hide the paper trail in a final report only. Evidence must be visible where the claim appears.
