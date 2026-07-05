import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CodeExecutionRequest, CodeExecutionResult, CodeLanguage } from "../types";

export const executeCodeToolDefinition = {
  name: "execute_code",
  description:
    "Executes Python or TypeScript code in a secure sandbox. Use this for complex financial calculations, data transformation, or trend projections that require logic beyond simple math.",
  parameters: {
    type: "object",
    properties: {
      language: { type: "string", enum: ["python", "typescript"] },
      code: { type: "string", description: "The code to execute. Should print the final result to stdout." }
    },
    required: ["language", "code"]
  }
} as const;

const MAX_CODE_BYTES = Number(process.env.CODE_EXECUTION_MAX_CODE_BYTES ?? 30_000);
const MAX_OUTPUT_BYTES = Number(process.env.CODE_EXECUTION_MAX_OUTPUT_BYTES ?? 20_000);
const DEFAULT_TIMEOUT_MS = Number(process.env.CODE_EXECUTION_TIMEOUT_MS ?? 8_000);

export async function executeCode(request: CodeExecutionRequest): Promise<CodeExecutionResult> {
  validateExecutionRequest(request);

  const startedAt = Date.now();
  const workdir = mkdtempSync(join(tmpdir(), "vultr-audit-code-"));
  const filename = request.language === "python" ? "analysis.py" : "analysis.ts";
  const filepath = join(workdir, filename);
  writeFileSync(filepath, request.code, "utf8");

  let timedOut = false;
  try {
    const proc = Bun.spawn({
      cmd: commandFor(request.language, filepath),
      cwd: workdir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: executionEnv()
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, DEFAULT_TIMEOUT_MS);

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      streamToText(proc.stdout),
      streamToText(proc.stderr)
    ]).finally(() => clearTimeout(timeout));

    return {
      language: request.language,
      code: request.code,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      exitCode,
      timedOut,
      durationMs: Date.now() - startedAt
    };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function validateExecutionRequest(request: CodeExecutionRequest) {
  if (!isCodeLanguage(request.language)) {
    throw new Error("language must be python or typescript.");
  }

  if (!request.code.trim()) {
    throw new Error("code is required.");
  }

  if (Buffer.byteLength(request.code, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`code exceeds ${MAX_CODE_BYTES} bytes.`);
  }
}

function isCodeLanguage(value: string): value is CodeLanguage {
  return value === "python" || value === "typescript";
}

function commandFor(language: CodeLanguage, filepath: string): string[] {
  if (language === "python") {
    return [process.env.PYTHON_BIN ?? "python", filepath];
  }

  return [process.env.BUN_BIN ?? "bun", "run", filepath];
}

function executionEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    PYTHONPATH: "",
    NODE_ENV: "production",
    NO_COLOR: "1"
  };
}

async function streamToText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  return new Response(stream).text();
}

function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, "utf8") <= MAX_OUTPUT_BYTES) return output;
  return `${output.slice(0, MAX_OUTPUT_BYTES)}\n[truncated]`;
}
