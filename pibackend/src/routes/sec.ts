import { Elysia } from "elysia";
import { resolveCompanyTicker, searchCompanyTickers, syncCompanyTickers } from "../services/sec";

export const secRoutes = new Elysia({ prefix: "/api/sec" })
  .get("/tickers/search", async ({ query, set }) => {
    const q = String(query.q ?? "").trim();
    if (!q) {
      set.status = 400;
      return { detail: "q is required." };
    }

    return { companies: await searchCompanyTickers(q, Number(query.limit ?? 20)) };
  })
  .get("/tickers/:ticker", async ({ params, set }) => {
    const company = await resolveCompanyTicker(params.ticker);
    if (!company) {
      set.status = 404;
      return { detail: "Ticker not found." };
    }

    return { company };
  })
  .post("/tickers/sync", async () => syncCompanyTickers());
