# Solveo Pi Backend

TypeScript/Bun backend for the Solveo demo using Elysia, Drizzle, and SQLite.

```bash
cd pibackend
bun install
bun run dev
```

The API defaults to `http://localhost:8001`. Point the frontend at it with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8001
```

The service reads seed data from `../seed` and creates `pibackend/solveo_pi.db` unless `DATABASE_PATH` is set.
It also reads the root `.env` file for Vultr settings. When `VULTR_API_KEY` is set and `VULTR_DEMO_MODE` is not true, planning, adjudication, and response drafting call the Vultr OpenAI-compatible chat API. Without a live key, the deterministic demo fallbacks are used.
