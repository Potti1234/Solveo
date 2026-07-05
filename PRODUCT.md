# Product

## Register

product

## Users

The primary user is a risk analyst at a bank reviewing borrower credit risk, covenant compliance, and follow-up actions. They work under time pressure, need a clear view of what changed and what still needs attention, and must be able to trace every claim back to a filing, agreement, tool call, calculation, or generated script.

Hackathon judges are an important secondary audience. The interface should reveal the agent's internal workflow, tool orchestration, Vultr-backed retrieval, and paper trail without turning the product into a staged demo.

## Product Purpose

Vultr-Audit helps risk analysts understand a borrower's covenant situation by turning SEC filings, credit agreements, financial extraction, code verification, and monitoring recommendations into a clear run history. A successful run gives the analyst a practical overview of the situation, the evidence behind the conclusion, and confidence that follow-up monitoring is scheduled or recommended.

The product should increasingly support automatic follow-up agents, such as one-week rescans, daily 8-K checks, and high-frequency news monitoring for risky situations. These follow-up agents should be visible in the sidebar as scheduled work, not hidden in a report.

## Brand Personality

Precise, calm, clean.

The product should feel like a serious analytical workspace: quiet, legible, and focused on the chat-led investigation. It should make complex agent behavior understandable without adding visual noise.

## Anti-references

Do not make the product look like crypto dark mode, neon fintech, generic AI-purple workflow software, a playful consumer chatbot, or a dense Bloomberg-style terminal. Avoid decorative dashboards, marketing-style hero sections, and heavy visual effects.

The main surface should not be a form-heavy interface with many required fields. The primary input should be a natural-language chat composer with document upload, while structured parameters can be inferred, shown contextually, or adjusted only when needed.

## Design Principles

1. Lead with the conversation. The chat timeline is the primary interface because the analyst understands the work through the agent's step-by-step investigation.
2. Make internals inspectable, not overwhelming. Tool calls, retrievals, calculations, scripts, and citations should be visible in the flow and explorable on demand.
3. Preserve the paper trail. Every claim, ratio, and recommendation should expose source evidence, calculation inputs, and caveats.
4. Convert analysis into follow-up work. The end state should include a plan, scheduled monitoring recommendations, and borrower questions, not just a static answer.
5. Keep the surface calm. Use restrained color, clear spacing, familiar shadcn components, and concise language so the analyst stays focused on risk decisions.

## Accessibility & Inclusion

No special requirements were specified. Target WCAG AA as the default: strong contrast, keyboard-accessible chat, sidebar, and inspector controls, visible focus states, reduced-motion support, and status indicators that do not rely on color alone.
