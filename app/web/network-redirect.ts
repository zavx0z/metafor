import {networkInterfaces} from "node:os"

const host = process.env.HOST ?? "0.0.0.0"
const port = Number(process.env.PORT ?? "80")
const targetProtocol = normalizeProtocol(process.env.TARGET_PROTOCOL ?? "https")
const targetPort = process.env.TARGET_PORT ?? ""
const targetHost = process.env.TARGET_HOST?.trim() ?? ""
const colorEnabled = process.env.NO_COLOR == null && process.env.FORCE_COLOR !== "0"

const startedAt = new Date()

banner()

let server: ReturnType<typeof Bun.serve>

try {
  server = Bun.serve({
    hostname: host,
    port,
    fetch(req) {
      const source = new URL(req.url)
      const target = new URL(req.url)
      target.protocol = targetProtocol
      if (targetHost.length > 0) target.host = targetHost
      else target.port = targetPort
      logRequest(req.method, source, target)
      return Response.redirect(target.toString(), 308)
    },
  })
} catch (error) {
  log("ERR", "redirect failed", error instanceof Error ? error.message : String(error), "red")
  process.exit(1)
}

log("OK", "http redirect online", `${server.url.href} => ${targetProtocol}//<same-host>${targetPort.length > 0 ? `:${targetPort}` : ""}/`, "green")
for (const url of lanUrls()) log("LAN", "LAN entry", url, "cyan")
log("TMX", "tmux window", "metafor-app-web-net:http-80", "magenta")
log("TIME", "started", formatDateTime(startedAt), "gray")

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

await new Promise(() => {})

function banner(): void {
  console.log("")
  console.log(paint("cyan", "+--------------------------------------+"))
  console.log(paint("cyan", "| MetaFor network redirect             |"))
  console.log(paint("cyan", "+--------------------------------------+"))
}

function shutdown(signal: string): void {
  log("STOP", "stopping", signal, "red")
  server.stop(true)
  process.exit(0)
}

function normalizeProtocol(value: string): "http:" | "https:" {
  const clean = value.trim().replace(/:$/, "")
  return clean === "http" ? "http:" : "https:"
}

function logRequest(method: string, source: URL, target: URL): void {
  const path = `${source.pathname}${source.search}`
  log("REQ", `${method} ${source.host}`, `${path} => ${target.toString()}`, "yellow")
}

type Tone = "cyan" | "gray" | "green" | "magenta" | "red" | "yellow"

function log(tag: string, label: string, detail: string, tone: Tone): void {
  const time = formatTime(new Date())
  const prefix = paint(tone, `[${tag.padEnd(4)}]`)
  console.log(`${prefix} ${paint("gray", time)}  ${paint(tone, label.padEnd(22))} ${detail}`)
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  const ms = String(date.getMilliseconds()).padStart(3, "0")
  return `${hours}:${minutes}:${seconds}.${ms}`
}

function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day} ${formatTime(date)}`
}

function lanUrls(): string[] {
  if (host !== "0.0.0.0" && host !== "::") return [`http://${host}:${port}/`]
  const urls: string[] = []
  for (const items of Object.values(networkInterfaces())) {
    for (const item of items ?? []) {
      if (item.internal || item.family !== "IPv4") continue
      urls.push(`http://${item.address}:${port}/`)
    }
  }
  return urls
}

function paint(tone: Tone, value: string): string {
  if (!colorEnabled) return value
  const colors: Record<Tone | "reset", string> = {
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
    yellow: "\x1b[33m",
  }
  return `${colors[tone]}${value}${colors.reset}`
}
