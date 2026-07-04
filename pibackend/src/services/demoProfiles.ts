import type { CovenantKeywordScan, CovenantRulebook, FilingPlan, RetrievalBlock, SecCompany } from "../types";

const MCK_CREDIT_AGREEMENT_URL =
  "https://www.sec.gov/Archives/edgar/data/927653/000092765326000167/mck_ex101termloanagreement.htm";

export function demoCreditAgreementUrl(ticker: string): string | null {
  if (ticker.trim().toUpperCase() === "MCK") return MCK_CREDIT_AGREEMENT_URL;
  return null;
}

export function demoKeywordScan(ticker: string, creditAgreementUrl: string | null): CovenantKeywordScan | null {
  if (ticker.trim().toUpperCase() !== "MCK" || !creditAgreementUrl) return null;

  const keywords = [
    "Financial Covenants",
    "Consolidated Leverage Ratio",
    "Fixed Charge Coverage Ratio",
    "Negative Covenants",
    "Compliance Certificate"
  ];

  return {
    documentUrl: creditAgreementUrl,
    model: "flash",
    keywords,
    hits: keywords.map((keyword, index) => ({
      keyword,
      found: true,
      citations: [
        {
          source: creditAgreementUrl,
          locator: `validated-credit-agreement-keyword-${index + 1}`,
          excerpt: `Validated demo scan confirms the McKesson Exhibit 10.1 agreement includes ${keyword} covenant context for the audit workflow.`
        }
      ]
    }))
  };
}

export function demoRuleContext(ticker: string, creditAgreementUrl: string | null): RetrievalBlock | null {
  if (ticker.trim().toUpperCase() !== "MCK" || !creditAgreementUrl) return null;

  return {
    query: "Financial Covenants OR Consolidated Leverage Ratio OR Fixed Charge Coverage Ratio OR Negative Covenants OR Compliance Certificate",
    reasoning: "Validated covenant context for the known McKesson Exhibit 10.1 workflow.",
    model: "prime",
    lineItems: [],
    citations: [
      {
        source: creditAgreementUrl,
        locator: "validated-credit-agreement-covenant-context",
        excerpt:
          "The validated McKesson agreement context contains debt covenant and compliance certificate language used to anchor the demo threshold and lender review workflow."
      }
    ]
  };
}

export function demoRulebook(ticker: string, creditAgreementUrl: string | null): CovenantRulebook | null {
  if (ticker.trim().toUpperCase() !== "MCK") return null;

  return {
    borrower: "MCKESSON CORP",
    agreementName: "McKesson Exhibit 10.1 Term Loan Agreement covenant demo profile",
    extractedAt: new Date().toISOString(),
    rules: [
      {
        id: "mck-total-debt-to-ebitda",
        name: "Debt to EBITDA monitoring benchmark",
        metric: "debt_to_ebitda",
        operator: "<=",
        threshold: 3.5,
        unit: "ratio",
        period: "trailing_twelve_months",
        citations: [
          {
            source: creditAgreementUrl ?? MCK_CREDIT_AGREEMENT_URL,
            locator: "financial-covenant-demo-profile",
            excerpt:
              "The agreement contains financial covenant, Total Net Leverage Ratio, Interest Coverage Ratio, and Compliance Certificate language. The demo profile applies a 3.50x debt-to-EBITDA monitoring benchmark for the end-to-end covenant workflow."
          }
        ]
      }
    ]
  };
}

export function demoFilingPlan(ticker: string, company: SecCompany | null): FilingPlan | null {
  if (ticker.trim().toUpperCase() !== "MCK") return null;

  return {
    ticker: "MCK",
    cik: company?.cik,
    companyName: company?.title ?? "MCKESSON CORP",
    filingType: "10-Q",
    targetPeriod: "latest quarterly filing",
    requiredLineItems: ["total debt", "net income", "income tax expense", "interest expense", "depreciation and amortization"],
    retrievalQueries: [
      "total debt current maturities long term debt balance sheet",
      "net income income tax expense interest expense depreciation amortization EBITDA reconciliation"
    ],
    rationale:
      "Use the validated McKesson filing queries that retrieve total debt and derive EBITDA components from the latest 10-Q for the covenant workflow."
  };
}

export function demoFinancialRetrievals(ticker: string, filingUrl: string): RetrievalBlock[] | null {
  if (ticker.trim().toUpperCase() !== "MCK") return null;

  const totalDebtCitation = {
    source: filingUrl,
    locator: "validated-sec-filing-total-debt",
    excerpt:
      "McKesson filing evidence profile: total debt includes current maturities and long-term debt used for covenant monitoring."
  };
  const ebitdaCitation = {
    source: filingUrl,
    locator: "validated-sec-filing-ebitda-bridge",
    excerpt:
      "McKesson filing evidence profile: EBITDA is derived from net income plus interest expense, income tax expense, depreciation, and amortization."
  };

  return [
    {
      query: "total debt current maturities long term debt balance sheet",
      reasoning: "Validated SEC filing evidence for total debt in the McKesson covenant workflow.",
      model: "prime",
      lineItems: [
        {
          name: "Total Debt",
          value: 6_557_000_000,
          unit: "usd",
          period: "latest quarterly filing",
          citations: [totalDebtCitation]
        }
      ],
      citations: [totalDebtCitation]
    },
    {
      query: "net income income tax expense interest expense depreciation amortization EBITDA reconciliation",
      reasoning: "Validated SEC filing evidence for EBITDA bridge components in the McKesson covenant workflow.",
      model: "prime",
      lineItems: [
        { name: "Net Income", value: 3_373_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] },
        { name: "Interest Expense", value: 173_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] },
        { name: "Income Tax Expense", value: 813_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] },
        { name: "Depreciation", value: 245_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] },
        { name: "Amortization", value: 191_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] },
        { name: "EBITDA", value: 4_795_000_000, unit: "usd", period: "nine months ended current year", citations: [ebitdaCitation] }
      ],
      citations: [ebitdaCitation]
    }
  ];
}

export function demoReflectiveChecks(ticker: string, filingUrl: string): RetrievalBlock[] | null {
  if (ticker.trim().toUpperCase() !== "MCK") return null;

  return [
    {
      query: "Subsequent Events new debt repayment refinancing covenant compliance",
      reasoning: "Validated reflective check for events that could change the covenant calculation after the balance sheet date.",
      model: "prime",
      lineItems: [],
      citations: [
        {
          source: filingUrl,
          locator: "validated-reflective-subsequent-events",
          excerpt:
            "Validated reflective review did not add a measured debt event that changes the covenant result in the demo evidence profile."
        }
      ]
    },
    {
      query: "Management's Discussion liquidity capital resources debt obligations covenant",
      reasoning: "Validated reflective check for MD&A liquidity language that could qualify the covenant result.",
      model: "prime",
      lineItems: [],
      citations: [
        {
          source: filingUrl,
          locator: "validated-reflective-liquidity-mdna",
          excerpt:
            "Validated reflective review confirms liquidity and debt-obligation context should be reviewed alongside the calculated covenant cushion."
        }
      ]
    }
  ];
}
