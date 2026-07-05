import type { CovenantCalculation, CovenantRulebook, RetrievalBlock } from "../types";

type ScriptInputs = {
  rulebook: CovenantRulebook;
  calculations: CovenantCalculation[];
  retrievals: RetrievalBlock[];
};

export function buildMathVerificationScript(inputs: ScriptInputs): string {
  const payload = compactInputs(inputs);
  return `import json

payload = json.loads(r'''${JSON.stringify(payload, null, 2)}''')

checks = []
for calc in payload["calculations"]:
    operator = calc["operator"]
    actual = float(calc["actual"])
    threshold = float(calc["threshold"])
    if operator == "<=":
        compliant = actual <= threshold
        cushion = threshold - actual
    else:
        compliant = actual >= threshold
        cushion = actual - threshold
    checks.append({
        "ruleId": calc["ruleId"],
        "formula": calc["formula"],
        "actual": actual,
        "threshold": threshold,
        "operator": operator,
        "verifiedCompliant": compliant,
        "reportedCompliant": bool(calc["compliant"]),
        "matchesReportedDecision": compliant == bool(calc["compliant"]),
        "cushion": cushion
    })

print(json.dumps({
    "analysis": "math_verification",
    "purpose": "Verify covenant math from extracted legal formula and financial variables.",
    "checks": checks
}, indent=2))
`;
}

export function buildTwoQuarterProjectionScript(inputs: ScriptInputs): string {
  const payload = compactInputs(inputs);
  return `import json

payload = json.loads(r'''${JSON.stringify(payload, null, 2)}''')

stress_cases = []
for calc in payload["calculations"]:
    actual = float(calc["actual"])
    threshold = float(calc["threshold"])
    operator = calc["operator"]
    baseline = actual if actual > 0 else (threshold * 0.90 if operator == "<=" else threshold * 1.10)

    quarters = []
    for quarter in [1, 2]:
        if operator == "<=":
            # Leverage-style stress: EBITDA/revenue declines 10% per quarter while debt is flat.
            projected = baseline / (0.90 ** quarter)
            breach = projected > threshold
        else:
            # Coverage/liquidity-style stress: available cushion declines 10% per quarter.
            projected = baseline * (0.90 ** quarter)
            breach = projected < threshold
        quarters.append({
            "quarter": quarter,
            "projectedValue": projected,
            "threshold": threshold,
            "breach": breach
        })

    first_breach = next((item["quarter"] for item in quarters if item["breach"]), None)
    stress_cases.append({
        "ruleId": calc["ruleId"],
        "operator": operator,
        "baseline": baseline,
        "threshold": threshold,
        "assumption": "10% adverse revenue/EBITDA or cushion movement per quarter",
        "quarters": quarters,
        "likelyBreachInNextTwoQuarters": first_breach is not None,
        "firstProjectedBreachQuarter": first_breach
    })

print(json.dumps({
    "analysis": "two_quarter_stress_projection",
    "purpose": "Project whether a covenant breach is likely in the next two quarters under adverse trend assumptions.",
    "stressCases": stress_cases
}, indent=2))
`;
}

function compactInputs(inputs: ScriptInputs): ScriptInputs {
  return {
    rulebook: {
      ...inputs.rulebook,
      rules: inputs.rulebook.rules.map((rule) => ({
        ...rule,
        citations: rule.citations.map((citation) => ({
          ...citation,
          excerpt: citation.excerpt.slice(0, 500)
        }))
      }))
    },
    calculations: inputs.calculations.map((calculation) => ({
      ...calculation,
      citations: calculation.citations.slice(0, 6).map((citation) => ({
        ...citation,
        excerpt: citation.excerpt.slice(0, 500)
      }))
    })),
    retrievals: inputs.retrievals.map((retrieval) => ({
      query: retrieval.query,
      reasoning: retrieval.reasoning,
      model: retrieval.model,
      lineItems: retrieval.lineItems,
      citations: retrieval.citations.slice(0, 4).map((citation) => ({
        ...citation,
        excerpt: citation.excerpt.slice(0, 500)
      }))
    }))
  };
}
