import { createSchema } from "../db/client";
import { syncCompanyTickers } from "../services/sec";

createSchema();

const result = await syncCompanyTickers();
console.log(`Synced ${result.count} SEC company tickers at ${result.syncedAt}`);
