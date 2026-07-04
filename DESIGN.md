---
name: Concierge Court
description: Manager-first hotel AI operations dashboard for guest complaints, agent oversight, and human intervention.
colors:
  ink: "#182026"
  muted: "#69747c"
  line: "#d9dee2"
  paper: "#ffffff"
  wash: "#f5f7f8"
  teal: "#0f766e"
  coral: "#b42318"
  amber: "#a16207"
  violet: "#6d5dfc"
  slate-panel: "#eef2f4"
  focus: "#0f766e"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
    typography: "{typography.label}"
  card-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  status-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
    typography: "{typography.label}"
---

# Design System: Concierge Court

## 1. Overview

**Creative North Star: "The Manager's Flight Board"**

Concierge Court should feel like a dense operations board for hotel leaders: clean, fast, legible, and always oriented around what needs attention. The redesigned dashboard uses a Linear-like product rhythm with a tight sidebar, crisp surfaces, quiet typography, and status-forward rows. It is not a marketing page and not a technical agent console; the interface exists to help managers understand what the AI agents are doing and where humans should step in.

The visual baseline is shadcn-style composition: familiar primitives, strong focus states, restrained borders, predictable spacing, and components that can be customized without becoming decorative. Cards, tables, panels, tabs, buttons, dialogs, dropdowns, command menus, skeletons, and toasts should all feel like one component system. Agent activity appears as auditable work, not magic: each plan, citation, draft, and action gets a clear place in the workflow.

**Key Characteristics:**
- Dense manager-first information layout with compact navigation and fast route switching.
- Restrained neutral palette with teal used sparingly for primary actions, current location, and live agent activity.
- Status semantics that combine color, label, icon, and shape so severity stays readable for everyone.
- shadcn components as the baseline, restyled to fit Concierge Court rather than left at defaults.
- Human interception controls are visible, direct, and phrased in hotel operations language.

## 2. Colors

The palette is restrained and operational: mostly white, cool gray, strong ink, and small amounts of semantic color for decisions, alerts, and agent state.

### Primary
- **Operational Teal**: The primary action and active-state color. Use for current navigation, focused controls, live agent activity, approved/legitimate outcomes, and the strongest call to action on a screen. Keep it below 10% of the visible surface.

### Secondary
- **Intervention Violet**: Reserved for human takeover, manager review, or AI-agent oversight moments where the user is changing the agent's path. Do not use it as general decoration.

### Tertiary
- **Risk Coral**: Used for severe alerts, failed checks, unsubstantiated claims, escalation risk, and destructive actions.
- **Policy Amber**: Used for pending review, evidence gaps, medium-risk warnings, and compensation uncertainty.

### Neutral
- **Command Ink**: Primary text, icons, headings, and high-emphasis data.
- **Readable Muted**: Secondary text and timestamps. Never use it below WCAG AA contrast.
- **Rule Line**: Dividers, panel borders, table row separators, and input strokes.
- **Paper Surface**: Main cards, tables, menus, dialogs, and popovers.
- **Dashboard Wash**: App background, sidebar background variants, and quiet empty states.
- **Panel Slate**: Secondary navigation rails, filter bars, and grouped control regions when a white card would create too many boxes.

### Named Rules

**The Ten Percent Accent Rule.** Teal, violet, coral, and amber are operational signals, not decoration. If a screen feels colorful before the data is read, the color use is too loud.

**The Status Redundancy Rule.** Color never carries status alone. Every verdict, severity, confidence, and escalation state must include text and, when useful, an icon.

## 3. Typography

**Display Font:** Inter, with system-ui fallback.
**Body Font:** Inter, with system-ui fallback.
**Label/Mono Font:** Inter for labels; use a mono stack only for trace IDs, timestamps, payload snippets, or policy locators.

**Character:** Product-native, compact, and businesslike. The type system should look like a daily operations tool rather than a brand campaign.

### Hierarchy
- **Display** (650, 28px, 1.18): Screen titles, dashboard overview headers, and important modal titles only.
- **Headline** (650, 20px, 1.25): Panel headings, report sections, case titles, and major table group headings.
- **Title** (650, 15px, 1.35): Row titles, card titles, alert summaries, and active conversation subjects.
- **Body** (400, 14px, 1.55): Message previews, reasoning, draft responses, and operational summaries. Prose line length should stay under 75ch.
- **Label** (600, 12px, 1.2): Navigation labels, chips, metadata, column headers, and compact controls. Use sentence case by default.

### Named Rules

**The UI Scale Rule.** Do not use landing-page type scales in the dashboard. Product headings are fixed rem sizes, not fluid hero typography.

**The No Jargon Label Rule.** Labels must describe user-facing work: "Review draft", "Take over chat", "Escalate case", "View evidence". Avoid internal agent-stage names unless the user is inspecting a trace.

## 4. Elevation

Concierge Court uses tonal layering and crisp borders first, shadows second. Resting surfaces are mostly flat. Elevation appears when a component is interactive, floating, or temporarily above the main workflow, such as dropdowns, command menus, dialogs, and hoverable rows.

### Shadow Vocabulary
- **Crisp Rest** (`box-shadow: 0 1px 2px rgba(24, 32, 38, 0.08)`): Current card and row vocabulary. Use only when a surface needs slight separation from the wash background.
- **Popover Lift** (`box-shadow: 0 8px 24px rgba(24, 32, 38, 0.14)`): Menus, command palette, date pickers, and tooltips. Do not pair this with heavy borders.
- **Dialog Lift** (`box-shadow: 0 20px 48px rgba(24, 32, 38, 0.18)`): Dialogs and takeover confirmations only.

### Named Rules

**The Flat Operations Rule.** Tables, inbox rows, trace items, and dashboard panels stay flat at rest. Depth is used for hierarchy and interaction, not visual softness.

## 5. Components

### Buttons
- **Shape:** Gently squared product controls (8px radius), matching shadcn Button proportions.
- **Primary:** Operational Teal background with Paper text, 36px height, 8px by 12px padding. Use for one primary action per local region.
- **Hover / Focus:** Hover deepens the background or shifts to a subtle teal tint. Focus uses a visible 2px ring with offset, never outline removal.
- **Secondary / Ghost / Tertiary:** Secondary buttons use Paper background, Rule Line border, Command Ink text. Ghost buttons are for sidebar and row actions. Destructive buttons use Risk Coral and must name the object being affected.

### Chips
- **Style:** Pill shape for compact metadata and status. Use subtle tinted fills with borders only when the state needs emphasis.
- **State:** Active filters can use Teal tint and border. Severity chips must include text such as "High risk", "Needs review", or "Agent live".

### Cards / Containers
- **Corner Style:** 12px for larger panels, 8px for compact rows and nested trace items. Never exceed 16px on dashboard cards.
- **Background:** Paper for primary content, Dashboard Wash or Panel Slate for grouped controls and empty states.
- **Shadow Strategy:** Flat by default with Crisp Rest only when separation from the background is needed.
- **Border:** Rule Line at 1px. No colored side stripes.
- **Internal Padding:** 16px for cards, 12px for dense rows, 24px for page-level summary regions.

### Inputs / Fields
- **Style:** shadcn Input baseline with Paper background, Rule Line border, 8px radius, 36px to 40px height.
- **Focus:** Teal focus ring with visible offset. Placeholder text must pass WCAG AA contrast or be darkened.
- **Error / Disabled:** Error states use Risk Coral plus text. Disabled states reduce opacity but keep labels readable.

### Navigation
- **Style:** Use a left sidebar as the primary redesign direction. It should support quick links for Inbox, Agent Activity, Conversations, Reports, Ops Alerts, Policies, and Settings. Active nav uses Teal tint, a clear icon, and readable label text.
- **Density:** Compact rows, 36px to 40px tall, with grouped sections for operations and admin.
- **Mobile Treatment:** Collapse to a top bar plus sheet navigation. Preserve active route, search, and primary status summary.

### Agent Activity Timeline

Agent work is a signature component. Each event should show stage, source, confidence, timestamp, output summary, and expandable evidence. The default view must be readable by a manager; raw payloads belong behind disclosure controls.

### Case Inbox Row

Inbox rows should behave like compact work items, not marketing cards. Each row shows guest, channel, subject, room, urgency, current owner, AI status, and last activity. Rows support hover actions for "Open case", "Review draft", and "Take over chat".

## 6. Do's and Don'ts

### Do:
- **Do** use shadcn primitives as the implementation baseline, then tune tokens, density, and state vocabulary for Concierge Court.
- **Do** make manager overview visible before detail: workload, live agents, risky chats, pending approvals, and operations patterns.
- **Do** keep AI actions auditable with clear traces, citations, drafts, tickets, and intervention controls.
- **Do** use the current restraint of Paper, Dashboard Wash, Command Ink, Rule Line, and Operational Teal as the base palette.
- **Do** include keyboard states, skeleton loading, empty states, reduced-motion support, and color-blind-safe status patterns.

### Don't:
- **Don't** make the dashboard feel overly technical, developer-first, or like an AI lab console.
- **Don't** use generic SaaS marketing polish, luxury-hotel beige, decorative AI gradients, glassy effects, or empty dashboard ornament.
- **Don't** hide human intervention. "Take over chat", "Review draft", "Rerun investigation", and "Escalate case" should be visible where the decision is made.
- **Don't** use color alone for severity, verdict, confidence, or escalation state.
- **Don't** create identical card grids with icon, heading, and paragraph repeated across the dashboard.
- **Don't** pair 1px borders with large soft shadows on every surface. Pick crisp border-first layering for normal dashboard UI.
