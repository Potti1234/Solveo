import type {
  AmendmentComparison,
  CovenantCalculation,
  CovenantRulebook,
  CreditMonitoringResult,
  EarlyWarningScore,
  CovenantHeadroomPoint,
  HeadroomTrend,
  MaterialEventSignal,
  SecCompany,
  SecRecentFiling
} from "../types";
import { calculateCovenants } from "../tools/calculator";
import { findRecentFilings, fetchFilingDocuments, fetchSecDocumentText } from "./sec";
import { extractCovenantRulebookFromDocument, retrieveFinancialContext } from "./retriever";

export async function buildCreditMonitoring(input: {
  ticker: string;
  company: SecCompany | null;
  creditAgreementUrl: string | null;
  rulebook: CovenantRulebook;
  calculations: CovenantCalculation[];
}): Promise<CreditMonitoringResult> {
  const ticker = input.company?.ticker ?? input.ticker.toUpperCase();
  const [materialEvents, headroomTrend, amendmentComparison] = await Promise.all([
    monitorMaterialEvents(ticker),
    buildHeadroomTrend(ticker, input.rulebook),
    compareCreditAgreementAmendments(ticker, input.creditAgreementUrl, input.company?.title ?? ticker)
  ]);
  const earlyWarning = scoreEarlyWarning(input.calculations, materialEvents, headroomTrend, amendmentComparison);

  return {
    materialEvents,
    headroomTrend,
    amendmentComparison,
    earlyWarning,
    scheduleRecommendations: []
  };
}

async function monitorMaterialEvents(ticker: string): Promise<MaterialEventSignal[]> {
  const filings = await findRecentFilings(ticker, ["8-K"], 8);
  const events: MaterialEventSignal[] = [];

  for (const filing of filings) {
    const text = await fetchSecDocumentText(filing.primaryDocumentUrl);
    const event = classifyMaterialEvent(filing, text);
    if (event) events.push(event);
  }

  return events.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

async function buildHeadroomTrend(ticker: string, rulebook: CovenantRulebook): Promise<HeadroomTrend> {
  if (!enabled(process.env.ENABLE_HEADROOM_TREND_SCAN)) {
    return {
      points: [],
      direction: "insufficient_data",
      summary: "Historical covenant headroom scan is disabled for this run; enable ENABLE_HEADROOM_TREND_SCAN for deeper background analysis."
    };
  }

  const filings = await findRecentFilings(ticker, ["10-Q", "10-K"], 6);
  const targetRules = rulebook.rules.filter((rule) => rule.metric === "debt_to_ebitda" || rule.metric === "interest_coverage");
  const points: CovenantHeadroomPoint[] = [];

  for (const filing of filings.slice(0, 4)) {
    const queries = new Set<string>();
    if (targetRules.some((rule) => rule.metric === "debt_to_ebitda")) {
      queries.add("total debt current maturities long term debt balance sheet");
    }
    if (targetRules.some((rule) => rule.metric === "debt_to_ebitda" || rule.metric === "interest_coverage")) {
      queries.add("net income income tax expense interest expense depreciation amortization EBITDA reconciliation");
    }

    const retrievals = [];
    for (const query of queries) {
      retrievals.push(
        await retrieveFinancialContext({
          documentUrl: filing.primaryDocumentUrl,
          query,
          model: "prime",
          reasoning: "Trend monitoring retrieval for covenant headroom over recent SEC filings."
        })
      );
    }

    for (const calculation of calculateCovenants(targetRules, retrievals)) {
      const status: CovenantHeadroomPoint["status"] = calculation.actual > 0 ? (calculation.compliant ? "pass" : "fail") : "unknown";
      points.push({
        filingDate: filing.filingDate,
        filingUrl: filing.primaryDocumentUrl,
        ruleId: calculation.ruleId,
        actual: calculation.actual,
        threshold: calculation.threshold,
        operator: calculation.operator,
        cushion: calculation.operator === "<=" ? calculation.threshold - calculation.actual : calculation.actual - calculation.threshold,
        status
      });
    }
  }

  const knownPoints = points.filter((point) => point.status !== "unknown");
  const direction = trendDirection(knownPoints.map((point) => point.cushion));
  return {
    points,
    direction,
    summary:
      knownPoints.length < 2
        ? "Not enough historical covenant evidence was extracted to determine a reliable headroom trend."
        : `Covenant cushion trend is ${direction.replace("_", " ")} across ${knownPoints.length} extracted observations.`
  };
}

async function compareCreditAgreementAmendments(
  ticker: string,
  currentAgreementUrl: string | null,
  borrower: string
): Promise<AmendmentComparison | null> {
  if (!currentAgreementUrl) return null;
  if (!enabled(process.env.ENABLE_AMENDMENT_COMPARISON_SCAN)) {
    return {
      currentAgreementUrl,
      priorAgreementUrl: null,
      changes: []
    };
  }

  const filings = await findRecentFilings(ticker, ["8-K", "10-K"], 16);
  const candidateUrls: string[] = [];

  for (const filing of filings) {
    const documents = await fetchFilingDocuments(filing);
    candidateUrls.push(...documents.filter((document) => document.isExhibit101).map((document) => document.url));
  }

  const uniqueCandidates = [...new Set(candidateUrls)].filter((url) => url !== currentAgreementUrl);
  const priorAgreementUrl = uniqueCandidates[0] ?? null;
  if (!priorAgreementUrl) {
    return {
      currentAgreementUrl,
      priorAgreementUrl: null,
      changes: []
    };
  }

  const [current, prior] = await Promise.all([
    extractCovenantRulebookFromDocument(currentAgreementUrl, borrower),
    extractCovenantRulebookFromDocument(priorAgreementUrl, borrower)
  ]);
  if (!current || !prior) return { currentAgreementUrl, priorAgreementUrl, changes: [] };

  const changes = current.rules.map((currentRule) => {
    const priorRule = prior.rules.find((rule) => rule.metric === currentRule.metric || rule.name === currentRule.name) ?? null;
    const direction = compareThresholdDirection(priorRule?.threshold ?? null, currentRule.threshold, currentRule.operator);
    return {
      ruleName: currentRule.name,
      previousThreshold: priorRule?.threshold ?? null,
      currentThreshold: currentRule.threshold,
      direction,
      summary: priorRule
        ? `${currentRule.name} changed from ${priorRule.threshold} to ${currentRule.threshold}; ${direction}.`
        : `${currentRule.name} appears in the current agreement but was not extracted from the prior agreement.`,
      citations: [...(priorRule?.citations ?? []), ...currentRule.citations]
    };
  });

  return {
    currentAgreementUrl,
    priorAgreementUrl,
    changes
  };
}

function classifyMaterialEvent(filing: SecRecentFiling, text: string): MaterialEventSignal | null {
  const lower = text.toLowerCase();
  const rules: Array<{
    category: MaterialEventSignal["category"];
    severity: MaterialEventSignal["severity"];
    patterns: RegExp[];
    summary: string;
  }> = [
    {
      category: "default",
      severity: "high",
      patterns: [/event of default/i, /default under/i, /covenant breach/i],
      summary: "Recent 8-K includes default or covenant breach language."
    },
    {
      category: "debt_financing",
      severity: "medium",
      patterns: [/new credit facility/i, /term loan/i, /senior notes/i, /new debt/i, /borrowings/i],
      summary: "Recent 8-K includes debt financing or borrowing language."
    },
    {
      category: "credit_agreement",
      severity: "medium",
      patterns: [/credit agreement/i, /amendment to credit/i, /loan agreement/i],
      summary: "Recent 8-K references a credit agreement or amendment."
    },
    {
      category: "acquisition",
      severity: "medium",
      patterns: [/material acquisition/i, /merger agreement/i, /acquisition/i],
      summary: "Recent 8-K includes acquisition language that may affect leverage."
    },
    {
      category: "restructuring",
      severity: "high",
      patterns: [/restructuring/i, /bankruptcy/i, /chapter 11/i],
      summary: "Recent 8-K includes restructuring or insolvency-related language."
    },
    {
      category: "impairment",
      severity: "medium",
      patterns: [/impairment/i, /goodwill impairment/i],
      summary: "Recent 8-K includes impairment language."
    },
    {
      category: "leadership_change",
      severity: "low",
      patterns: [/chief financial officer/i, /\bCFO\b/i, /resignation/i, /departure/i],
      summary: "Recent 8-K includes leadership change language."
    },
    {
      category: "litigation",
      severity: "medium",
      patterns: [/litigation/i, /settlement/i, /investigation/i],
      summary: "Recent 8-K includes litigation, settlement, or investigation language."
    },
    {
      category: "liquidity",
      severity: "high",
      patterns: [/liquidity/i, /going concern/i, /substantial doubt/i],
      summary: "Recent 8-K includes liquidity or going-concern language."
    }
  ];

  for (const rule of rules) {
    const pattern = rule.patterns.find((candidate) => candidate.test(text));
    if (!pattern) continue;
    const index = lower.search(pattern);
    return {
      filingDate: filing.filingDate,
      form: filing.form,
      accessionNumber: filing.accessionNumber,
      documentUrl: filing.primaryDocumentUrl,
      category: rule.category,
      severity: rule.severity,
      summary: rule.summary,
      citations: [
        {
          source: filing.primaryDocumentUrl,
          locator: `8-k-${rule.category}`,
          excerpt: excerptAt(text, Math.max(index, 0), 600)
        }
      ]
    };
  }

  return null;
}

function scoreEarlyWarning(
  calculations: CovenantCalculation[],
  materialEvents: MaterialEventSignal[],
  headroomTrend: HeadroomTrend,
  amendmentComparison: AmendmentComparison | null
): EarlyWarningScore {
  let score = 0;
  const drivers: string[] = [];

  for (const calculation of calculations) {
    if (!calculation.compliant) {
      score += 45;
      drivers.push(`${calculation.ruleId} is failing.`);
      continue;
    }
    if (calculation.threshold !== 0 && calculation.actual > 0) {
      const distance = Math.abs(calculation.threshold - calculation.actual) / Math.abs(calculation.threshold);
      if (distance <= 0.1) {
        score += 25;
        drivers.push(`${calculation.ruleId} has less than 10% cushion.`);
      } else if (distance <= 0.25) {
        score += 12;
        drivers.push(`${calculation.ruleId} has limited cushion.`);
      }
    }
  }

  for (const event of materialEvents.slice(0, 4)) {
    score += event.severity === "high" ? 25 : event.severity === "medium" ? 12 : 5;
    drivers.push(`${event.severity.toUpperCase()} 8-K signal: ${event.summary}`);
  }

  if (headroomTrend.direction === "deteriorating") {
    score += 20;
    drivers.push("Covenant headroom trend is deteriorating.");
  }

  if (amendmentComparison?.changes.some((change) => change.direction === "tighter")) {
    score += 15;
    drivers.push("Credit agreement amendment appears tighter than prior terms.");
  }

  const bounded = Math.min(score, 100);
  return {
    score: bounded,
    level: bounded >= 75 ? "critical" : bounded >= 50 ? "high" : bounded >= 25 ? "medium" : "low",
    drivers: drivers.length > 0 ? drivers : ["No major early-warning drivers identified from extracted evidence."]
  };
}

function compareThresholdDirection(
  previousThreshold: number | null,
  currentThreshold: number | null,
  operator: "<=" | ">="
): "looser" | "tighter" | "unchanged" | "unknown" {
  if (previousThreshold === null || currentThreshold === null) return "unknown";
  if (previousThreshold === currentThreshold) return "unchanged";
  if (operator === "<=") return currentThreshold > previousThreshold ? "looser" : "tighter";
  return currentThreshold < previousThreshold ? "looser" : "tighter";
}

function trendDirection(cushions: number[]): HeadroomTrend["direction"] {
  if (cushions.length < 2) return "insufficient_data";
  const newest = cushions[0];
  const oldest = cushions[cushions.length - 1];
  const delta = newest - oldest;
  if (Math.abs(delta) < 0.05) return "stable";
  return delta > 0 ? "improving" : "deteriorating";
}

function severityRank(severity: MaterialEventSignal["severity"]): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - Math.floor(length / 3));
  return text.slice(start, Math.min(text.length, start + length)).trim();
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").toLowerCase());
}
