import {ensureMetaforTmuxProfile, METAFOR_TMUX_CONFIG_PATH} from "../../pkg/pty/src/tmux-profile.ts"

const session = process.env.NETWORK_TMUX_SESSION ?? "metafor-app-web-net"
const windowName = process.env.NETWORK_TMUX_WINDOW ?? "network"
const conflictSessions = (process.env.NETWORK_TMUX_CONFLICT_SESSIONS ?? "metafor-interpreter-web")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
const cwd = process.cwd()

const panes = {
  tls: 0,
  redirect: 1,
} as const

type NetworkMode = "dev" | "prod"

const cli = parseCli(process.argv.slice(2))
const action = cli.action
const mode = cli.mode

try {
  ensureMetaforTmuxProfile()
  await sleepStartDelay()
  await run(action)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

async function run(name: string): Promise<void> {
  if (name === "layout") {
    rebuildLayout()
    startTls()
    startRedirect()
    selectNetworkWindow()
    return
  }
  if (name === "status") {
    ensureLayout()
    status()
    return
  }
  if (name === "start:tls") {
    ensureLayout()
    startTls()
    return
  }
  if (name === "stop:tls") {
    ensureLayout()
    stopPane("tls")
    return
  }
  if (name === "start:redirect") {
    ensureLayout()
    startRedirect()
    return
  }
  if (name === "stop:redirect") {
    ensureLayout()
    stopPane("redirect")
    return
  }
  if (name === "tail") {
    ensureLayout()
    tailNetworkLogs()
    return
  }
  if (name === "clear") {
    ensureLayout()
    clearPanes()
    return
  }
  if (name === "stop") {
    stopAll()
    return
  }
  if (name === "start:matrix") {
    await startMatrixProcess()
    return
  }
  if (name === "stop:matrix") {
    await stopMatrixProcess()
    return
  }
  if (name === "restart:matrix") {
    await restartMatrixProcess()
    return
  }
  if (name === "start:energy") {
    await startEnergyProcess()
    return
  }
  if (name === "stop:energy") {
    await stopEnergyProcess()
    return
  }
  if (name === "restart:energy") {
    await restartEnergyProcess()
    return
  }
  if (name === "watch:ports") {
    await watchPorts()
    return
  }
  throw new Error(`unknown network tmux action: ${name}`)
}

function rebuildLayout(): void {
  stopConflictingSessions()
  if (tmuxOk(["has-session", "-t", session])) {
    killWindow(windowName)
    killWindow("https-443")
    killWindow("http-80")
  }
  if (tmuxOk(["has-session", "-t", session])) {
    sourceProfile()
    tmux(["new-window", "-d", "-t", session, "-n", windowName, "-c", cwd])
  } else {
    tmux(["-f", METAFOR_TMUX_CONFIG_PATH, "new-session", "-d", "-s", session, "-n", windowName, "-c", cwd])
  }
  tmux(["split-window", "-v", "-t", targetPane("tls"), "-c", cwd])
  tmux(["select-layout", "-t", targetWindow(), "even-vertical"])
  titlePane("tls", tlsPaneTitle())
  titlePane("redirect", "http redirect")
}

function ensureLayout(): void {
  ensureSession()
  if (!windowExists(windowName)) rebuildLayout()
}

function ensureSession(): void {
  if (tmuxOk(["has-session", "-t", session])) {
    sourceProfile()
    return
  }
  tmux(["-f", METAFOR_TMUX_CONFIG_PATH, "new-session", "-d", "-s", session, "-n", windowName, "-c", cwd])
}

function sourceProfile(): void {
  tmux(["source-file", METAFOR_TMUX_CONFIG_PATH])
}

function startTls(): void {
  titlePane("tls", tlsPaneTitle())
  runPane("tls", `${serviceEnvPrefix()} ${serverCommand()}`)
}

function startRedirect(): void {
  runPane("redirect", `${serviceEnvPrefix()} printf '${redirectPaneMessage()}\\n'`)
}

function tailNetworkLogs(): void {
  console.log(tmux(["capture-pane", "-t", targetWindow(), "-p", "-S", "-120"]))
}

function status(): void {
  writeNetworkWatch()
}

function clearPanes(): void {
  for (const name of Object.keys(panes) as Array<keyof typeof panes>) {
    tmux(["send-keys", "-t", targetPane(name), "C-l"])
    tmux(["clear-history", "-t", targetPane(name)])
  }
}

function stopPane(name: keyof typeof panes): void {
  tmux(["send-keys", "-t", targetPane(name), "C-c"])
}

function stopAll(): void {
  stopConflictingSessions()
  if (!tmuxOk(["has-session", "-t", session])) return
  killWindow(windowName)
  killWindow("https-443")
  killWindow("http-80")
}

function runPane(name: keyof typeof panes, command: string): void {
  const target = targetPane(name)
  tmux(["send-keys", "-t", target, "C-c"])
  tmux(["send-keys", "-t", target, "C-l"])
  tmux(["send-keys", "-t", target, command, "Enter"])
}

async function watchPorts(): Promise<void> {
  while (true) {
    writeNetworkWatch()
    if (process.env.NETWORK_TMUX_WATCH_ONCE === "1") return
    await Bun.sleep(2000)
  }
}

function writeNetworkWatch(): void {
  process.stdout.write("\x1b[2J\x1b[H")
  console.log(paint("cyan", "+------------------------------------------------------------+"))
  console.log(`${paint("cyan", "|")} ${paint("bold", "MetaFor network")} ${paint("gray", "ports / processes / tmux panes").padEnd(58)}${paint("cyan", "|")}`)
  console.log(paint("cyan", "+------------------------------------------------------------+"))
  console.log(`${paint("gray", "[TIME]")} ${paint("white", formatDateTime(new Date()))}`)
  console.log(`${paint("gray", "[MODE]")} ${paint("white", modeLabel())}`)
  console.log("")
  console.log(paint("magenta", "[LISTEN]"))
  const listen = listeningPorts()
  if (listen.length === 0) console.log(`  ${paint("yellow", "no interesting listening ports")}`)
  for (const item of listen) {
    const tone = portTone(item.port)
    const endpoint = `${item.host}:${item.port}`
    console.log(`  ${paint(tone, endpoint.padEnd(22))} ${paint("white", item.command.padEnd(12))} ${paint("gray", `pid=${item.pid}`)} ${paint("gray", item.protocol)}`)
  }
  console.log("")
  console.log(paint("magenta", "[TMUX]"))
  const tmuxPanes = tmuxPaneRows()
  if (tmuxPanes.length === 0) console.log(`  ${paint("yellow", "no tmux panes")}`)
  for (const pane of tmuxPanes) {
    const active = pane.active ? paint("green", "active") : paint("gray", "idle  ")
    const title = pane.title.length > 0 ? pane.title : "-"
    console.log(`  ${paint("cyan", pane.target.padEnd(34))} ${active} ${paint("white", title.padEnd(18))} ${paint("gray", pane.command)}`)
  }
}

function listeningPorts(): Array<{command: string; pid: string; protocol: string; host: string; port: number}> {
  const output = spawnText(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"])
  const rows: Array<{command: string; pid: string; protocol: string; host: string; port: number}> = []
  for (const line of output.split(/\r?\n/).slice(1)) {
    const parts = line.trim().split(/\s+/)
    const command = parts[0] ?? ""
    const pid = parts[1] ?? ""
    const protocol = parts[7] ?? ""
    const name = parts.slice(8).join(" ")
    const match = name.match(/^(.+):(\d+)\s+\(LISTEN\)$/)
    if (command.length === 0 || pid.length === 0 || protocol.length === 0 || match === null) continue
    const [, host = "", portText = ""] = match
    const port = Number(portText)
    if (!interestingPort(port)) continue
    rows.push({command, pid, protocol, host, port})
  }
  return rows.sort((a, b) => a.port - b.port || a.command.localeCompare(b.command))
}

function tmuxPaneRows(): Array<{target: string; title: string; command: string; active: boolean}> {
  const output = spawnText(["tmux", "list-panes", "-a", "-F", "#S:#W.#P\t#{pane_title}\t#{pane_current_command}\t#{pane_active}"])
  const rows: Array<{target: string; title: string; command: string; active: boolean}> = []
  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) continue
    const [target = "", title = "", command = "", active = "0"] = line.split("\t")
    if (!target.includes("metafor") && !target.includes(session) && command !== "bun" && command !== "tmux") continue
    rows.push({target, title, command, active: active === "1"})
  }
  return rows
}

function spawnText(command: string[]): string {
  const result = Bun.spawnSync(command, {stdout: "pipe", stderr: "pipe"})
  const stdout = new TextDecoder().decode(result.stdout)
  if (result.exitCode === 0) return stdout
  const stderr = new TextDecoder().decode(result.stderr)
  return stdout.length > 0 ? stdout : stderr
}

async function startMatrixProcess(): Promise<void> {
  await waitForInterpreterApi()
  const existing = await getMatrixProcess()
  if (existing?.runtime?.target?.state === "running") {
    console.log(`matrix process already running: ${existing.id}`)
    return
  }
  if (existing !== null) {
    await deleteInterpreterProcess(matrixProcessId())
  }

  const response = await interpreterJson("/processes", {
    method: "POST",
    body: JSON.stringify({
      processId: matrixProcessId(),
      label: "matrix/server.ts",
      modulePath: "matrix/server.ts",
      command: ["bun", "matrix/server.ts"],
      cwd,
      env: matrixProcessEnv(),
      pauseOnStart: false,
    }),
  })
  console.log(JSON.stringify(response, null, 2))
}

async function waitForInterpreterApi(timeoutMs = 15_000): Promise<void> {
  const started = Date.now()
  let lastError = ""
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(new URL("/health", interpreterApiUrl()))
      if (response.ok) return
      lastError = `${response.status} ${await response.text()}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(250)
  }
  throw new Error(`interpreter API is not ready: ${lastError}`)
}

async function stopMatrixProcess(): Promise<void> {
  const existing = await getMatrixProcess()
  if (existing === null) {
    console.log("matrix process is not registered")
    return
  }
  const response = await interpreterProcessAction(existing.id, "stop")
  console.log(JSON.stringify(response, null, 2))
}

async function restartMatrixProcess(): Promise<void> {
  const existing = await getMatrixProcess()
  if (existing === null) {
    await startMatrixProcess()
    return
  }
  const response = await interpreterProcessAction(existing.id, "restart")
  console.log(JSON.stringify(response, null, 2))
}

async function startEnergyProcess(): Promise<void> {
  await waitForInterpreterApi()
  const existing = await getEnergyProcess()
  if (existing?.runtime?.target?.state === "running") {
    console.log(`energy process already running: ${existing.id}`)
    return
  }
  if (existing !== null) {
    await deleteInterpreterProcess(energyProcessId())
  }

  const response = await interpreterJson("/processes", {
    method: "POST",
    body: JSON.stringify({
      processId: energyProcessId(),
      label: "energy/server.ts",
      modulePath: "energy/server.ts",
      command: ["bun", "energy/server.ts"],
      cwd,
      env: energyProcessEnv(),
      pauseOnStart: false,
    }),
  })
  console.log(JSON.stringify(response, null, 2))
}

async function stopEnergyProcess(): Promise<void> {
  const existing = await getEnergyProcess()
  if (existing === null) {
    console.log("energy process is not registered")
    return
  }
  const response = await interpreterProcessAction(existing.id, "stop")
  console.log(JSON.stringify(response, null, 2))
}

async function restartEnergyProcess(): Promise<void> {
  const existing = await getEnergyProcess()
  if (existing === null) {
    await startEnergyProcess()
    return
  }
  const response = await interpreterProcessAction(existing.id, "restart")
  console.log(JSON.stringify(response, null, 2))
}

async function getMatrixProcess(): Promise<Record<string, any> | null> {
  const payload = await interpreterJson("/processes")
  const processes = Array.isArray(payload.processes) ? payload.processes : []
  return processes.find((item: Record<string, any>) => item.id === matrixProcessId()) ?? null
}

async function getEnergyProcess(): Promise<Record<string, any> | null> {
  const payload = await interpreterJson("/processes")
  const processes = Array.isArray(payload.processes) ? payload.processes : []
  return processes.find((item: Record<string, any>) => item.id === energyProcessId()) ?? null
}

async function deleteInterpreterProcess(processId: string): Promise<void> {
  await interpreterJson(`/processes/${encodeURIComponent(processId)}`, {method: "DELETE"})
}

async function interpreterProcessAction(processId: string, action: string): Promise<Record<string, any>> {
  const payload = await interpreterJson(`/processes/${encodeURIComponent(processId)}/tools`, {
    method: "POST",
    body: JSON.stringify({tool_uses: [{recipient_name: "process.action", parameters: {action}}]}),
  })
  const tool = Array.isArray(payload.tool_uses) ? payload.tool_uses[0] as Record<string, any> | undefined : undefined
  if (tool?.ok !== true) throw new Error(String(tool?.error ?? "process action failed"))
  return payload
}

async function interpreterJson(path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  const url = new URL(path, interpreterApiUrl())
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
  const response = await fetch(url, {...init, headers})
  const text = await response.text()
  let payload: unknown = {}
  if (text.trim().length > 0) payload = JSON.parse(text) as unknown
  if (!response.ok) {
    throw new Error(`interpreter ${init.method ?? "GET"} ${url.pathname} failed ${response.status}: ${text}`)
  }
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload as Record<string, any> : {}
}

function interpreterApiUrl(): string {
  const explicit = process.env.INTERPRETER_HTTP_URL?.trim()
  if (explicit) return explicit
  const host = process.env.INTERPRETER_HTTP_HOST?.trim() || "127.0.0.1"
  const port = process.env.INTERPRETER_HTTP_PORT?.trim() || "6500"
  return `http://${host}:${port}/`
}

function matrixProcessId(): string {
  return process.env.MATRIX_PROCESS_ID?.trim() || "matrix-server.ts"
}

function energyProcessId(): string {
  return process.env.ENERGY_PROCESS_ID?.trim() || "energy-server.ts"
}

function matrixProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {
    MATRIX_BOUNDARY_WS_URL: matrixBoundaryWsUrl(),
    HOST: matrixHost(),
    PORT: matrixPort(),
  }
  const token = process.env.MATRIX_BRIDGE_TOKEN?.trim()
  if (token) env.MATRIX_BRIDGE_TOKEN = token
  return env
}

function energyProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ENERGY_BRIDGE_WS_URL: energyBridgeWsUrl(),
    HOST: energyHost(),
    PORT: energyPort(),
  }
  const token = process.env.ENERGY_BRIDGE_TOKEN?.trim()
  if (token) env.ENERGY_BRIDGE_TOKEN = token
  return env
}

function matrixBoundaryWsUrl(): string {
  const explicit = process.env.MATRIX_BOUNDARY_WS_URL?.trim() || process.env.APP_WEB_MATRIX_WS_URL?.trim()
  if (explicit) return explicit
  return `ws://${appWebBridgeHost()}:${appWebBridgePort()}/matrix/ws`
}

function energyBridgeWsUrl(): string {
  const explicit = process.env.ENERGY_BRIDGE_WS_URL?.trim() || process.env.APP_WEB_ENERGY_WS_URL?.trim()
  if (explicit) return explicit
  return `ws://${appWebBridgeHost()}:${appWebBridgePort()}/energy/ws`
}

function normalizeClientConnectHost(value: string | undefined | null): string | null {
  const host = value?.trim()
  if (!host || host === "0.0.0.0" || host === "::") return null
  return host
}

function appWebBridgeHost(): string {
  return normalizeClientConnectHost(process.env.APP_WEB_MATRIX_HOST)
    || normalizeClientConnectHost(process.env.APP_WEB_HOST)
    || normalizeClientConnectHost(process.env.HOST)
    || "127.0.0.1"
}

function appWebBridgePort(): string {
  return process.env.APP_WEB_MATRIX_PORT?.trim()
    || process.env.APP_WEB_PORT?.trim()
    || process.env.PORT?.trim()
    || "3004"
}

function matrixHost(): string {
  return process.env.MATRIX_HOST?.trim()
    || process.env.INTERPRETER_HTTP_HOST?.trim()
    || "127.0.0.1"
}

function matrixPort(): string {
  return process.env.MATRIX_PORT?.trim() || "3005"
}

function energyHost(): string {
  return process.env.ENERGY_HOST?.trim()
    || process.env.INTERPRETER_HTTP_HOST?.trim()
    || "127.0.0.1"
}

function energyPort(): string {
  return process.env.ENERGY_PORT?.trim() || "3006"
}

function titlePane(name: keyof typeof panes, title: string): void {
  tmux(["select-pane", "-t", targetPane(name), "-T", title])
}

function selectNetworkWindow(): void {
  tmux(["select-window", "-t", targetWindow()])
}

function windowExists(name: string): boolean {
  return tmuxOk(["list-windows", "-t", session, "-F", "#{window_name}"], name)
}

function killWindow(name: string): void {
  if (windowExists(name)) tmux(["kill-window", "-t", `${session}:${name}`])
}

function stopConflictingSessions(): void {
  for (const name of conflictSessions) {
    if (name === session) continue
    if (tmuxOk(["has-session", "-t", name])) tmux(["kill-session", "-t", name])
  }
}

function targetWindow(): string {
  return `${session}:${windowName}`
}

function targetPane(name: keyof typeof panes): string {
  return `${targetWindow()}.${panes[name]}`
}

function tmuxOk(args: string[], includes?: string): boolean {
  const result = Bun.spawnSync(["tmux", ...args], {stdout: "pipe", stderr: "pipe"})
  if (result.exitCode !== 0) return false
  if (includes === undefined) return true
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).includes(includes)
}

function tmux(args: string[]): string {
  const result = Bun.spawnSync(["tmux", ...args], {stdout: "pipe", stderr: "pipe"})
  const stdout = new TextDecoder().decode(result.stdout)
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr)
    throw new Error(`tmux ${args.join(" ")} failed: ${stderr || stdout}`)
  }
  return stdout
}

function serviceEnvPrefix(): string {
  return "unset LC_ALL NO_COLOR CLICOLOR_FORCE; export LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8 COLORTERM=truecolor CLICOLOR=1 FORCE_COLOR=3;"
}

async function sleepStartDelay(): Promise<void> {
  const delay = Number(process.env.NETWORK_TMUX_START_DELAY_MS ?? 0)
  if (!Number.isFinite(delay) || delay <= 0) return
  await Bun.sleep(Math.min(5000, Math.round(delay)))
}

function parseCli(args: string[]): {mode: NetworkMode; action: string} {
  let nextMode: NetworkMode = process.env.NETWORK_TMUX_MODE === "dev" ? "dev" : "prod"
  let nextAction: string | undefined
  for (const arg of args) {
    if (arg === "--dev") {
      nextMode = "dev"
      continue
    }
    if (arg === "--prod") {
      nextMode = "prod"
      continue
    }
    if (arg.startsWith("--")) throw new Error(`unknown network tmux flag: ${arg}`)
    nextAction ??= arg
  }
  return {mode: nextMode, action: nextAction ?? "layout"}
}

function serverCommand(): string {
  if (mode === "dev") {
    return [
      envAssignments({
        NETWORK_TMUX_MODE: "dev",
        NETWORK_TMUX_SESSION: session,
        NETWORK_TMUX_WINDOW: windowName,
      }),
      "bun --hot run pkg/interpreter/interpreter.ts",
      "app/web/server.ts",
      "--inspect",
      ...Object.entries(appServerEnv("dev")).map(([key, value]) => `-env.${key}=${shellQuote(value)}`),
      "app/web/tmp/boundary.sqlite",
    ].filter(Boolean).join(" ")
  }
  return `${envAssignments(appServerEnv("prod"))} bun app/web/server.ts`
}

function redirectPaneMessage(): string {
  return `${modeLabel()}: HTTP redirect is embedded in app/web/server.ts on port 80`
}

function tlsPaneTitle(): string {
  return mode === "dev" ? "app-web dev interp" : "app-web prod"
}

function modeLabel(): string {
  return mode === "dev" ? "app/web dev interpreter" : "app/web prod"
}

function appServerEnv(nextMode: NetworkMode): Record<string, string> {
  return {
    NODE_ENV: "production",
    BUN_ENV: "production",
    BOUNDARY_PATH: "app/web/tmp/boundary.sqlite",
    HOST: "0.0.0.0",
    PORT: "443",
    TLS_KEY_FILE: "app/web/tls/privkey.pem",
    TLS_CERT_FILE: "app/web/tls/fullchain.pem",
    NETWORK_TMUX_MODE: nextMode,
    NETWORK_TMUX_SESSION: session,
    NETWORK_TMUX_WINDOW: windowName,
  }
}

function envAssignments(env: Record<string, string>): string {
  return Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`).join(" ")
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

function interestingPort(port: number): boolean {
  return port === 80
    || port === 443
    || port === 3000
    || port === 3004
    || port === 3005
    || port === 3006
    || port === 32133
    || port === 6499
    || port === 6500
    || port === 6501
    || port === 6502
    || port === 7880
    || port === 7881
    || port === 7882
    || port === 9222
    || port === 9223
    || port === 9349
}

function portTone(port: number): Tone {
  if (port === 80 || port === 443) return "green"
  if (port === 3000 || port === 3004 || port === 3005 || port === 3006 || port === 6499 || port === 6500 || port === 6501 || port === 6502) return "cyan"
  if (port === 32133 || port === 9222 || port === 9223 || port === 9349) return "yellow"
  return "magenta"
}

function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

type Tone = "bold" | "cyan" | "gray" | "green" | "magenta" | "red" | "white" | "yellow"

function paint(tone: Tone, value: string): string {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") return value
  const colors: Record<Tone | "reset", string> = {
    bold: "\x1b[1m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
    white: "\x1b[97m",
    yellow: "\x1b[33m",
  }
  return `${colors[tone]}${value}${colors.reset}`
}
