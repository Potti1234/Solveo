import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(here, "..", "..", "..");
export const backendRoot = join(projectRoot, "pibackend");
export const dbFile = process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : join(backendRoot, "vultr_audit.db");
