import { createSchema } from "../db/client";
import { seedIfNeeded } from "../db/seed";

createSchema();
seedIfNeeded();
console.log("pibackend database initialized");
