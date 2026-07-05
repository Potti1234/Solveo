import type { AuditExplainability, AuditRunResult, FinancialLineItem } from "../types";

export function buildAuditExplainability(result: Omit<AuditRunResult, "explainability">): AuditExplainability {
  const documents = [
    result.creditAgreementUrl
      ? {
          kind: "credit_agreement" as const,
          title: "Credit agreement / Exhibit 10.1",
          url: result.creditAgreementUrl
        }
      : null,
    ...uniqueSources(result.retrievals.flatMap((retrieval) => retrieval.citations)).map((url) => ({
      kind: "sec_filing" as const,
      title: "SEC filing evidence",
      url
    })),
    ...(result.externalContext?.results.slice(0, 3).map((item) => ({
      kind: "external_context" as const,
      title: item.title,
      url: item.url
    })) ?? [])
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    documents,
    toolCalls: buildToolCalls(result),
    evidenceTrail: buildEvidenceTrail(result),
    calculationTrail: buildCalculationTrail(result),
    codeVerification: result.codeAnalyses.map((analysis, index) => ({
      language: analysis.language,
      purpose: index === 0 ? "Verify covenant math" : "Project two-quarter breach risk",
      exitCode: analysis.exitCode,
      timedOut: analysis.timedOut,
      stdoutPreview: analysis.stdout.slice(0, 800)
    })),
    decisionTrail: {
      status: result.memo.status,
      summary: result.memo.summary,
      actionStatus: result.actionPlan?.status,
      borrowerQuestions: result.actionPlan?.borrowerQuestions ?? []
    },
    caveats: buildCaveats(result)
  };
}

export function renderAuditMarkdown(result: AuditRunResult): string {
  const report = result.explainability;
  const lines = [
    `# Covenant Audit Report: ${result.memo.ticker}`,
    "",
    `Status: ${result.memo.status.toUpperCase()}`,
    "",
    "## Documents Used",
    ...report.documents.map((document) => `- ${document.title} (${document.kind}): ${document.url}`),
    "",
    "## Tools Called",
    ...report.toolCalls.map((call) => `${call.order}. ${call.tool}: ${call.purpose}\n   - Input: ${call.inputSummary}\n   - Output: ${call.outputSummary}`),
    "",
    "## Evidence Trail",
    ...report.evidenceTrail.map(
      (evidence) =>
        `- ${evidence.label}${evidence.value !== undefined ? `: ${formatValue(evidence.value)}${evidence.unit ? ` ${evidence.unit}` : ""}` : ""}\n  Source: ${evidence.source}\n  Locator: ${evidence.locator}\n  Excerpt: ${evidence.excerpt}`
    ),
    "",
    "## Calculation Trail",
    ...report.calculationTrail.map(
      (calculation) =>
        `- ${calculation.formula}: ${calculation.actual.toFixed(3)} ${calculation.operator} ${calculation.threshold} => ${calculation.result.toUpperCase()}\n  Inputs: ${calculation.inputs
          .map((input) => `${input.name}=${formatValue(input.value)} ${input.unit}`)
          .join(", ")}`
    ),
    "",
    "## Code Verification",
    ...report.codeVerification.map(
      (code) =>
        `- ${code.purpose}: exit=${code.exitCode}, timedOut=${code.timedOut}\n  Output: ${oneLine(code.stdoutPreview)}`
    ),
    "",
    "## Credit Monitoring",
    ...(result.creditMonitoring
      ? [
          `Early warning: ${result.creditMonitoring.earlyWarning.level.toUpperCase()} (${result.creditMonitoring.earlyWarning.score}/100)`,
          ...result.creditMonitoring.earlyWarning.drivers.map((driver) => `- Driver: ${driver}`),
          `Headroom trend: ${result.creditMonitoring.headroomTrend.direction}`,
          ...result.creditMonitoring.materialEvents.map(
            (event) => `- 8-K ${event.severity.toUpperCase()} ${event.category}: ${event.summary}\n  Source: ${event.documentUrl}`
          ),
          ...(result.creditMonitoring.amendmentComparison?.changes.map(
            (change) =>
              `- Amendment ${change.direction}: ${change.ruleName} ${change.previousThreshold ?? "n/a"} -> ${change.currentThreshold ?? "n/a"}\n  ${change.summary}`
          ) ?? []),
          ...result.creditMonitoring.scheduleRecommendations.map(
            (schedule) =>
              `- Schedule ${schedule.kind}: every ${schedule.cadenceMinutes} minute(s), next ${schedule.runAt}\n  Reason: ${schedule.reason}`
          )
        ]
      : ["Credit monitoring expansion was not run."]),
    "",
    "## Decision",
    report.decisionTrail.summary,
    "",
    "## Borrower Questions",
    ...report.decisionTrail.borrowerQuestions.map((question) => `- ${question}`),
    "",
    "## Caveats",
    ...report.caveats.map((caveat) => `- ${caveat}`)
  ];

  return `${lines.join("\n")}\n`;
}

function buildToolCalls(result: Omit<AuditRunResult, "explainability">): AuditExplainability["toolCalls"] {
  let order = 1;
  const documentKeywordScan = Boolean(
    result.keywordScan?.hits.some((hit) => hit.citations.some((citation) => citation.locator.startsWith("document-text-")))
  );
  const documentRulebook = result.rulebook.rules.some((rule) => rule.citations.some((citation) => citation.locator.startsWith("document-text-")));
  const llmRulebook = result.rulebook.rules.some((rule) => rule.citations.some((citation) => citation.locator.startsWith("llm-")));
  const calls: AuditExplainability["toolCalls"] = [
    {
      order: order++,
      tool: "sec.resolve_ticker",
      purpose: "Resolve borrower ticker to SEC CIK/company metadata.",
      inputSummary: result.memo.ticker,
      outputSummary: result.plan.cik ? `CIK ${result.plan.cik}; ${result.plan.companyName ?? "company resolved"}` : "No SEC CIK in plan."
    },
    {
      order: order++,
      tool: "sec.discover_exhibit_10_1",
      purpose: "Find recent 10-K/8-K credit agreement exhibits.",
      inputSummary: result.memo.ticker,
      outputSummary: result.creditAgreementUrl ?? "No agreement discovered."
    },
    {
      order: order++,
      tool: documentKeywordScan ? "document.keyword_scan" : "vultr.vector_search.flash",
      purpose: "Scan credit agreement for covenant sections.",
      inputSummary: result.keywordScan?.keywords.join(", ") ?? "No credit agreement scan.",
      outputSummary: `${result.keywordScan?.hits.filter((hit) => hit.found).length ?? 0} keyword hits.`
    },
    {
      order: order++,
      tool: llmRulebook ? "vultr.covenant_extractor" : documentRulebook ? "document.covenant_parser" : "vultr.rag_chat.prime",
      purpose: "Extract covenant rule context and plan filing retrieval.",
      inputSummary: result.rulebook.rules.map((rule) => rule.name).join(", "),
      outputSummary: `${result.rulebook.rules.length} covenant rule(s).`
    }
  ];

  for (const retrieval of result.retrievals) {
    const documentRetrieval = retrieval.citations.some((citation) => citation.locator.startsWith("document-text-"));
    const llmRetrieval = retrieval.citations.some((citation) => citation.locator.startsWith("llm-"));
    calls.push({
      order: order++,
      tool: llmRetrieval ? "vultr.financial_extractor" : documentRetrieval ? "sec.document_parser" : "vultr.vector_search.prime",
      purpose: retrieval.reasoning,
      inputSummary: retrieval.query,
      outputSummary: `${retrieval.lineItems.length} line item(s), ${retrieval.citations.length} citation(s).`
    });
  }

  for (const check of result.reflectiveChecks) {
    const documentCheck = check.citations.some((citation) => citation.locator.startsWith("document-text-"));
    const llmCheck = check.citations.some((citation) => citation.locator.startsWith("llm-"));
    calls.push({
      order: order++,
      tool: llmCheck ? "vultr.financial_extractor" : documentCheck ? "sec.document_parser" : "vultr.reflective_retrieval",
      purpose: check.reasoning,
      inputSummary: check.query,
      outputSummary: `${check.citations.length} citation(s).`
    });
  }

  result.codeAnalyses.forEach((analysis, index) => {
    calls.push({
      order: order++,
      tool: "execute_code",
      purpose: index === 0 ? "Verify covenant math in Python." : "Run two-quarter stress projection in Python.",
      inputSummary: `${analysis.language} script, ${analysis.code.length} characters.`,
      outputSummary: `exit=${analysis.exitCode}, timedOut=${analysis.timedOut}.`
    });
  });

  if (result.externalContext) {
    calls.push({
      order: order++,
      tool: "web_search",
      purpose: "Check external context for recent financing/covenant events.",
      inputSummary: result.externalContext.query,
      outputSummary: `${result.externalContext.results.length} result(s) from ${result.externalContext.provider}.`
    });
  }

  if (result.creditMonitoring) {
    calls.push({
      order: order++,
      tool: "credit.material_event_monitor",
      purpose: "Scan recent 8-K filings for credit-relevant events.",
      inputSummary: result.memo.ticker,
      outputSummary: `${result.creditMonitoring.materialEvents.length} material event signal(s).`
    });
    calls.push({
      order: order++,
      tool: "credit.headroom_trend",
      purpose: "Calculate covenant headroom across recent quarterly filings.",
      inputSummary: result.rulebook.rules.map((rule) => rule.name).join(", "),
      outputSummary: result.creditMonitoring.headroomTrend.summary
    });
    calls.push({
      order: order++,
      tool: "credit.amendment_detector",
      purpose: "Compare current and prior credit agreement covenant terms when available.",
      inputSummary: result.creditAgreementUrl ?? "No credit agreement URL.",
      outputSummary: `${result.creditMonitoring.amendmentComparison?.changes.length ?? 0} amendment change(s).`
    });
    calls.push({
      order: order++,
      tool: "credit.schedule_planner",
      purpose: "Recommend background monitoring jobs based on risk level.",
      inputSummary: result.creditMonitoring.earlyWarning.level,
      outputSummary: `${result.creditMonitoring.scheduleRecommendations.length} recommended schedule(s).`
    });
  }

  return calls;
}

function buildEvidenceTrail(result: Omit<AuditRunResult, "explainability">): AuditExplainability["evidenceTrail"] {
  const lineItemEvidence = result.retrievals.flatMap((retrieval) =>
    retrieval.lineItems.flatMap((item) => {
      const citations = item.name === "EBITDA" ? item.citations.slice(0, 1) : item.citations;
      return citations.map((citation) => ({
        label: item.name,
        value: item.value,
        unit: item.unit,
        period: item.period,
        source: citation.source,
        locator: citation.locator,
        excerpt: citation.excerpt
      }));
    })
  );

  const ruleEvidence = result.rulebook.rules.flatMap((rule) =>
    rule.citations.map((citation) => ({
      label: rule.name,
      value: `${rule.operator} ${rule.threshold}`,
      unit: rule.unit,
      period: rule.period,
      source: citation.source,
      locator: citation.locator,
      excerpt: citation.excerpt
    }))
  );

  return [...ruleEvidence, ...lineItemEvidence];
}

function buildCalculationTrail(result: Omit<AuditRunResult, "explainability">): AuditExplainability["calculationTrail"] {
  const inputs = result.retrievals.flatMap((retrieval) => retrieval.lineItems);
  return result.memo.calculations.map((calculation) => ({
    formula: calculation.formula,
    inputs: relevantInputs(calculation.formula, inputs),
    actual: calculation.actual,
    threshold: calculation.threshold,
    operator: calculation.operator,
    result: calculation.compliant ? "pass" : "fail"
  }));
}

function relevantInputs(formula: string, inputs: FinancialLineItem[]) {
  if (formula === "Total Debt / EBITDA") {
    return inputs
      .filter((input) => ["Total Debt", "EBITDA", "Net Income", "Interest Expense", "Income Tax Expense", "Depreciation", "Amortization"].includes(input.name))
      .map(toInputSummary);
  }

  return inputs.map(toInputSummary);
}

function toInputSummary(input: FinancialLineItem) {
  return { name: input.name, value: input.value, unit: input.unit, period: input.period };
}

function buildCaveats(result: Omit<AuditRunResult, "explainability">): string[] {
  const caveats: string[] = [];
  if (result.memo.status === "needs_review") caveats.push("The agent did not extract enough measured values for a final compliance decision.");
  if (result.retrievals.some((retrieval) => retrieval.lineItems.some((item) => item.name === "EBITDA"))) {
    caveats.push("EBITDA may be derived from filing components when a directly reported Adjusted EBITDA value is unavailable.");
  }
  if (!result.externalContext) caveats.push("External web search was not triggered because the result was not within the configured risk threshold.");
  if (result.rulebook.agreementName.includes("Unresolved covenant rulebook")) caveats.push("The agent could not extract a covenant threshold from the agreement; the audit requires human review.");
  if (result.creditMonitoring?.headroomTrend.direction === "insufficient_data") {
    caveats.push("Historical covenant headroom trend has insufficient extracted quarterly observations.");
  }
  return caveats.length > 0 ? caveats : ["No major caveats recorded by the current workflow."];
}

function uniqueSources(citations: Array<{ source: string }>): string[] {
  return [...new Set(citations.map((citation) => citation.source))];
}

function formatValue(value: number | string): string {
  return typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 3 }) : value;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}
