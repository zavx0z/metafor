#!/usr/bin/env bun

type TargetLine = {
  ts?: string
  stream?: "stdout" | "stderr"
  text?: string
}

type TargetPayload = {
  state?: string
  pid?: number | null
  outputLineCount?: number
  output?: TargetLine[]
  exitCode?: number | null
  signalCode?: string | null
}

type ProcessPayload = {
  id?: string
  processId?: string
  label?: string
  runtime?: {
    target?: TargetPayload
  }
}

const PRODUCT_PROCESS_ID = process.env.NETWORK_PRODUCT_PROCESS_ID ?? "app-web-product"
const POLL_MS = Number(process.env.NETWORK_PRODUCT_POLL_MS ?? "2000")
const apiBase = interpreterApiBase()
const action = process.argv[2] ?? "run"

try {
  if (action === "run") await runProductProcess()
  else if (action === "stop") await stopProductProcess()
  else if (action === "status") await printProductStatus()
  else throw new Error(`unknown product interpreter action: ${action}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

async function runProductProcess(): Promise<void> {
  let stopping = false
  const stopAndExit = (): void => {
    if (stopping) return
    stopping = true
    void stopProductProcess().finally(() => process.exit(0))
  }
  process.on("SIGINT", stopAndExit)
  process.on("SIGTERM", stopAndExit)

  await deleteProductProcess(true)
  const payload = await requestJson("/processes", {
    method: "POST",
    body: {
      processId: PRODUCT_PROCESS_ID,
      label: "app/web product server",
      modulePath: "app/web/server.ts",
      cwd: process.cwd(),
      command: ["bun", "app/web/server.ts"],
      pauseOnStart: false,
      env: productServerEnv(),
    },
  })
  const created = processFromPayload(payload)
  console.log(`[product-interpreter] started ${created?.processId ?? PRODUCT_PROCESS_ID} via ${apiBase}`)

  let printedLineCount = 0
  while (!stopping) {
    const processPayload = await productProcess()
    if (processPayload === null) {
      console.log(`[product-interpreter] ${PRODUCT_PROCESS_ID} is no longer registered`)
      process.exit(1)
    }
    const target = processPayload.runtime?.target
    const output = target?.output ?? []
    for (const line of output.slice(printedLineCount)) {
      const stream = line.stream === "stderr" ? "stderr" : "stdout"
      console.log(`[${stream}] ${line.text ?? ""}`)
    }
    printedLineCount = output.length
    console.log(`[product-interpreter] state=${target?.state ?? "unknown"} pid=${target?.pid ?? "-"} lines=${target?.outputLineCount ?? output.length}`)
    if (target?.state === "exited" || target?.state === "failed") {
      const code = target.exitCode ?? (target.signalCode === null || target.signalCode === undefined ? 1 : 1)
      process.exit(typeof code === "number" ? code : 1)
    }
    await Bun.sleep(Math.max(500, Number.isFinite(POLL_MS) ? POLL_MS : 2000))
  }
}

async function stopProductProcess(): Promise<void> {
  const removed = await deleteProductProcess(false)
  console.log(removed ? `[product-interpreter] stopped ${PRODUCT_PROCESS_ID}` : `[product-interpreter] ${PRODUCT_PROCESS_ID} was not running`)
}

async function printProductStatus(): Promise<void> {
  const processPayload = await productProcess()
  if (processPayload === null) {
    console.log(`[product-interpreter] ${PRODUCT_PROCESS_ID} is not registered`)
    process.exit(1)
  }
  const target = processPayload.runtime?.target
  console.log(`[product-interpreter] state=${target?.state ?? "unknown"} pid=${target?.pid ?? "-"} lines=${target?.outputLineCount ?? 0}`)
  for (const line of (target?.output ?? []).slice(-8)) {
    const stream = line.stream === "stderr" ? "stderr" : "stdout"
    console.log(`[${stream}] ${line.text ?? ""}`)
  }
}

async function productProcess(): Promise<ProcessPayload | null> {
  const payload = await requestJson("/processes")
  const processes = processesFromPayload(payload)
  return processes.find((processPayload) => (processPayload.processId ?? processPayload.id) === PRODUCT_PROCESS_ID) ?? null
}

async function deleteProductProcess(ignoreMissing: boolean): Promise<boolean> {
  const payload = await requestJson(`/processes/${encodeURIComponent(PRODUCT_PROCESS_ID)}`, {
    method: "DELETE",
    allow404: true,
  })
  if (payload === null) {
    if (!ignoreMissing) return false
    return false
  }
  return true
}

function productServerEnv(): Record<string, string> {
  return {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    BUN_ENV: process.env.BUN_ENV ?? "production",
    BOUNDARY_PATH: process.env.BOUNDARY_PATH ?? "app/web/tmp/boundary.sqlite",
    HOST: process.env.HOST ?? "0.0.0.0",
    PORT: process.env.PORT ?? "443",
    TLS_KEY_FILE: process.env.TLS_KEY_FILE ?? "app/web/tls/privkey.pem",
    TLS_CERT_FILE: process.env.TLS_CERT_FILE ?? "app/web/tls/fullchain.pem",
  }
}

async function requestJson(path: string, opts: {method?: string; body?: unknown; allow404?: boolean} = {}): Promise<unknown | null> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {"content-type": "application/json"},
  }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)
  const response = await fetch(`${apiBase}${path}`, init)
  const text = await response.text()
  const payload = parseJsonPayload(text)
  if (response.status === 404 && opts.allow404 === true) return null
  if (!response.ok) {
    const message = errorMessage(payload) ?? text.trim() ?? `${response.status} ${response.statusText}`
    throw new Error(`${opts.method ?? "GET"} ${path} failed: ${message}`)
  }
  return payload
}

function processesFromPayload(payload: unknown): ProcessPayload[] {
  if (!isRecord(payload)) return []
  const processes = payload["processes"]
  if (!Array.isArray(processes)) return []
  return processes.filter(isProcessPayload)
}

function processFromPayload(payload: unknown): ProcessPayload | null {
  if (!isRecord(payload)) return null
  const processPayload = payload["process"]
  return isProcessPayload(processPayload) ? processPayload : null
}

function isProcessPayload(value: unknown): value is ProcessPayload {
  return isRecord(value)
}

function errorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const error = payload["error"]
  return typeof error === "string" ? error : null
}

function parseJsonPayload(text: string): unknown {
  if (text.trim().length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function interpreterApiBase(): string {
  const explicit = process.env.NETWORK_TMUX_INTERPRETER_URL ?? process.env.METAFOR_INTERPRETER_URL
  if (explicit !== undefined && explicit.trim().length > 0) return explicit.trim().replace(/\/+$/, "")
  const port = process.env.INTERPRETER_HTTP_PORT ?? "6500"
  return `http://127.0.0.1:${port}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
