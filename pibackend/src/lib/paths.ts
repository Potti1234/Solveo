import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(here, "..", "..", "..");
export const seedDir = join(projectRoot, "seed");
export const dbFile = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : join(projectRoot, "pibackend", "solveo_pi.db");
