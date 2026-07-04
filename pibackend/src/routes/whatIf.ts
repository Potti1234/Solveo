import { Elysia } from "elysia";
import { executeCode } from "../tools/executeCode";
import { buildWhatIfScript } from "../tools/whatIf";
import type { WhatIfRequest, WhatIfResult } from "../types";

export const whatIfRoutes = new Elysia({ prefix: "/api/what-if" }).post("/run", async ({ body, set }) => {
  const request = normalizeWhatIfRequest(body);
  if (!request) {
    set.status = 400;
    return { detail: "ticker and question are required." };
  }

  const script = buildWhatIfScript(request);
  const execution = await executeCode({ language: "python", code: script.code });
  const result: WhatIfResult = {
    ticker: request.ticker.toUpperCase(),
    question: request.question,
    assumptions: script.assumptions,
    execution
  };

  return result;
});

function normalizeWhatIfRequest(body: unknown): WhatIfRequest | null {
  const payload = (body ?? {}) as Partial<WhatIfRequest>;
  const ticker = String(payload.ticker ?? "").trim();
  const question = String(payload.question ?? "").trim();
  if (!ticker || !question) return null;

  return {
    ticker,
    question,
    baselineRatio: toOptionalNumber(payload.baselineRatio),
    threshold: toOptionalNumber(payload.threshold),
    interestRateShockBps: toOptionalNumber(payload.interestRateShockBps)
  };
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
