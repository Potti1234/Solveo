import type { CovenantCalculation, CovenantRule, RetrievalBlock } from "../types";

type MetricInputs = {
  totalDebt?: number;
  ebitda?: number;
  netIncome?: number;
  incomeTaxExpense?: number;
  depreciation?: number;
  amortization?: number;
  liquidity?: number;
  interestExpense?: number;
};

export function calculateCovenants(rules: CovenantRule[], retrievals: RetrievalBlock[]): CovenantCalculation[] {
  const inputs = collectMetricInputs(retrievals);

  return rules.map((rule) => {
    const actual = calculateMetric(rule.metric, inputs);
    const compliant = rule.operator === "<=" ? actual <= rule.threshold : actual >= rule.threshold;

    return {
      ruleId: rule.id,
      actual,
      threshold: rule.threshold,
      operator: rule.operator,
      compliant,
      formula: formulaFor(rule.metric),
      citations: retrievals.flatMap((retrieval) => retrieval.citations)
    };
  });
}

function collectMetricInputs(retrievals: RetrievalBlock[]): MetricInputs {
  const inputs: MetricInputs = {};

  for (const item of retrievals.flatMap((retrieval) => retrieval.lineItems)) {
    const key = item.name.toLowerCase();
    if (key.includes("total debt")) inputs.totalDebt = item.value;
    if (key.includes("ebitda")) inputs.ebitda = item.value;
    if (key === "net income") inputs.netIncome = item.value;
    if (key.includes("income tax")) inputs.incomeTaxExpense = item.value;
    if (key === "depreciation") inputs.depreciation = item.value;
    if (key === "amortization") inputs.amortization = item.value;
    if (key.includes("liquidity") || key.includes("cash")) inputs.liquidity = item.value;
    if (key.includes("interest expense")) inputs.interestExpense = item.value;
  }

  inputs.ebitda ??= deriveEbitda(inputs);

  return inputs;
}

function calculateMetric(metric: CovenantRule["metric"], inputs: MetricInputs): number {
  if (metric === "debt_to_ebitda") return safeDivide(inputs.totalDebt, inputs.ebitda);
  if (metric === "minimum_liquidity") return inputs.liquidity ?? 0;
  if (metric === "interest_coverage") return safeDivide(inputs.ebitda, inputs.interestExpense);
  return 0;
}

function safeDivide(numerator?: number, denominator?: number): number {
  if (!numerator || !denominator) return 0;
  return numerator / denominator;
}

function deriveEbitda(inputs: MetricInputs): number | undefined {
  const components: Array<number | undefined> = [
    inputs.netIncome,
    inputs.interestExpense,
    inputs.incomeTaxExpense,
    inputs.depreciation,
    inputs.amortization
  ];
  if (components.some((value) => typeof value !== "number")) return undefined;
  return components.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function formulaFor(metric: CovenantRule["metric"]): string {
  if (metric === "debt_to_ebitda") return "Total Debt / EBITDA";
  if (metric === "minimum_liquidity") return "Cash and available liquidity";
  if (metric === "interest_coverage") return "EBITDA / Interest Expense";
  return "Custom covenant formula";
}
