import type { WhatIfRequest } from "../types";

export function buildWhatIfScript(request: WhatIfRequest): { code: string; assumptions: Record<string, unknown> } {
  const baselineRatio = request.baselineRatio ?? 3.2;
  const threshold = request.threshold ?? 3.5;
  const interestRateShockBps = request.interestRateShockBps ?? inferRateShockBps(request.question) ?? 150;
  const interestExpenseSensitivity = 0.08;

  const assumptions = {
    baselineRatio,
    threshold,
    interestRateShockBps,
    interestExpenseSensitivity,
    interpretation:
      "Each 100 bps rate shock increases the modeled ratio by 8% of baseline when coverage/debt service variables are not yet extracted."
  };

  const code = `import json

baseline_ratio = ${baselineRatio}
threshold = ${threshold}
interest_rate_shock_bps = ${interestRateShockBps}
interest_expense_sensitivity = ${interestExpenseSensitivity}

shock_multiplier = 1 + (interest_rate_shock_bps / 100) * interest_expense_sensitivity
stressed_ratio = baseline_ratio * shock_multiplier
passes = stressed_ratio <= threshold

print(json.dumps({
    "analysis": "what_if_interest_rate_stress",
    "question": ${JSON.stringify(request.question)},
    "baselineRatio": baseline_ratio,
    "threshold": threshold,
    "interestRateShockBps": interest_rate_shock_bps,
    "shockMultiplier": shock_multiplier,
    "stressedRatio": stressed_ratio,
    "passes": passes,
    "cushionAfterStress": threshold - stressed_ratio,
    "note": "Replace default assumptions with extracted interest expense and coverage variables once retriever line items are available."
}, indent=2))
`;

  return { code, assumptions };
}

function inferRateShockBps(question: string): number | null {
  const percentMatch = /(\d+(?:\.\d+)?)\s*%/.exec(question);
  if (percentMatch) return Math.round(Number(percentMatch[1]) * 100);

  const bpsMatch = /(\d+(?:\.\d+)?)\s*(?:bps|basis points)/i.exec(question);
  if (bpsMatch) return Math.round(Number(bpsMatch[1]));

  return null;
}
