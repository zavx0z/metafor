import {ensureMetaforTmuxProfile, METAFOR_TMUX_CONFIG_PATH} from "../../pkg/pty/src/tmux-profile.ts"

const session = process.env.NETWORK_TMUX_SESSION ?? "metafor-app-web-net"
const windowName = process.env.NETWORK_TMUX_WINDOW ?? "network"
const cwd = process.cwd()

const panes = {
  tls: 0,
  redirect: 1,
  ports: 2,
  debug: 3,
} as const

const action = process.argv[2] ?? "layout"

try {
  ensureMetaforTmuxProfile()
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
    startPorts()
    writeDebugPrompt()
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
  if (name === "start:ports") {
    ensureLayout()
    startPorts()
    return
  }
  if (name === "stop:ports") {
    ensureLayout()
    stopPane("ports")
    return
  }
  if (name === "debug:prod") {
    ensureLayout()
    startDebugProd()
    return
  }
  if (name === "stop:debug") {
    ensureLayout()
    stopDebugProd()
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
  if (name === "watch:ports") {
    await watchPorts()
    return
  }
  throw new Error(`unknown network tmux action: ${name}`)
}

function rebuildLayout(): void {
  if (tmuxOk(["has-session", "-t", session])) {
    killWindow(windowName)
    killWindow("https-443")
    killWindow("http-80")
    killWindow("ports")
    killWindow("debug-prod")
  }
  if (tmuxOk(["has-session", "-t", session])) {
    sourceProfile()
    tmux(["new-window", "-d", "-t", session, "-n", windowName, "-c", cwd])
  } else {
    tmux(["-f", METAFOR_TMUX_CONFIG_PATH, "new-session", "-d", "-s", session, "-n", windowName, "-c", cwd])
  }
  tmux(["split-window", "-h", "-t", targetPane("tls"), "-c", cwd])
  tmux(["select-pane", "-t", targetPane("tls")])
  tmux(["split-window", "-v", "-t", targetPane("tls"), "-c", cwd])
  tmux(["select-pane", "-t", targetPane("redirect")])
  tmux(["split-window", "-v", "-t", targetPane("redirect"), "-c", cwd])
  tmux(["select-layout", "-t", targetWindow(), "tiled"])
  titlePane("tls", "app-web tls")
  titlePane("redirect", "http redirect")
  titlePane("ports", "ports watch")
  titlePane("debug", "prod debug")
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
  runPane("tls", `${serviceEnvPrefix()} NODE_ENV=production BUN_ENV=production BOUNDARY_PATH=app/web/tmp/boundary.sqlite HOST=0.0.0.0 PORT=443 TLS_KEY_FILE=app/web/tls/privkey.pem TLS_CERT_FILE=app/web/tls/fullchain.pem bun app/web/server.ts`)
}

function startRedirect(): void {
  runPane("redirect", `${serviceEnvPrefix()} HOST=0.0.0.0 PORT=80 bun app/web/network-redirect.ts`)
}

function startPorts(): void {
  runPane("ports", `${serviceEnvPrefix()} bun app/web/network-tmux.ts watch:ports`)
}

function startDebugProd(): void {
  const env = {
    BOUNDARY_PATH: "app/web/tmp/boundary.sqlite",
    HOST: "0.0.0.0",
    PORT: "3443",
    TLS_KEY_FILE: "app/web/tls/privkey.pem",
    TLS_CERT_FILE: "app/web/tls/fullchain.pem",
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    FORCE_COLOR: "3",
    LANG: "en_US.UTF-8",
    LC_CTYPE: "en_US.UTF-8",
  }
  runPane("debug", [
    `${serviceEnvPrefix()} printf '\\033[35m[debug]\\033[0m restarting interpreter process \\033[36mapp-web-prod-debug\\033[0m\\n'`,
    "curl -sS -X POST http://127.0.0.1:6500/processes/app-web-prod-debug/action -H 'content-type: application/json' -d '{\"action\":\"stop\"}' >/dev/null || true",
    "curl -sS -X POST http://127.0.0.1:6500/processes -H 'content-type: application/json' -d '{\"id\":\"app-web-prod-debug\",\"label\":\"app/web prod debug\",\"command\":[\"bun\",\"app/web/server.ts\"],\"cwd\":\"" + jsonEscape(cwd) + "\",\"env\":" + shellJson(env) + ",\"pauseOnStart\":true}'",
    "printf '\\n\\033[32m[debug]\\033[0m process ready, open interpreter process \\033[36mapp-web-prod-debug\\033[0m\\n'",
  ].join("; "))
}

function stopDebugProd(): void {
  runPane("debug", [
    "curl -sS -X POST http://127.0.0.1:6500/processes/app-web-prod-debug/action -H 'content-type: application/json' -d '{\"action\":\"stop\"}'",
    "printf '\\n[debug-prod] stop requested\\n'",
  ].join("; "))
}

function writeDebugPrompt(): void {
  runPane("debug", `${serviceEnvPrefix()} printf '\\033[36m+--------------------------------------+\\033[0m\\n\\033[36m| MetaFor app/web prod debug           |\\033[0m\\n\\033[36m+--------------------------------------+\\033[0m\\n\\033[90mUse the Debug switch to run app/web/server.ts via /processes with pauseOnStart.\\033[0m\\n'`)
}

function tailNetworkLogs(): void {
  runPane("ports", "tmux capture-pane -t " + shellQuote(targetWindow()) + " -p -S -120")
}

function status(): void {
  runPane("ports", `${serviceEnvPrefix()} bun app/web/network-tmux.ts watch:ports`)
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function shellJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("\\", "\\\\").replaceAll("'", "'\\''")
}

function jsonEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")
}

function serviceEnvPrefix(): string {
  return "unset LC_ALL NO_COLOR CLICOLOR_FORCE; export LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8 COLORTERM=truecolor CLICOLOR=1 FORCE_COLOR=3;"
}

function interestingPort(port: number): boolean {
  return port === 80 || port === 443 || port === 6500 || port === 7880 || port === 7881 || port === 7882 || port === 9222 || port === 9223
}

function portTone(port: number): Tone {
  if (port === 80 || port === 443) return "green"
  if (port === 6500) return "cyan"
  if (port === 9222 || port === 9223) return "yellow"
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
