import {serializeError} from "./errors.ts"

const BROWSER_HOST_PREFIX = "/browser-display"
const BROWSER_HOST_PROXY_PREFIX = `${BROWSER_HOST_PREFIX}/proxy`
const DEFAULT_BROWSER_HOST_TIMEOUT_MS = 8_000
const SNAPSHOT_BROWSER_HOST_TIMEOUT_MS = 15_000

type BrowserHostRoute = {
  method: string
  path: string
  upstreamPath: string
  responseKind: "json" | "stream"
  timeoutMs: number
  configKind: "browser" | "remoteDesktop"
}

type BrowserHostConfig =
  | {ok: true; baseUrl: URL; configuredFrom: string}
  | {ok: false; configured: boolean; env: string[]; error: string}

const BROWSER_HOST_ROUTES: BrowserHostRoute[] = [
  {method: "GET", path: "/browser-display/health", upstreamPath: "/health", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "GET", path: "/browser-display/state", upstreamPath: "/state", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "GET", path: "/browser-display/status", upstreamPath: "/state", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "GET", path: "/browser-display/snapshot", upstreamPath: "/snapshot", responseKind: "stream", timeoutMs: SNAPSHOT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/navigate", upstreamPath: "/navigate", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/reload", upstreamPath: "/reload", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/back", upstreamPath: "/back", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/forward", upstreamPath: "/forward", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/devtools", upstreamPath: "/devtools", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/fullscreen", upstreamPath: "/fullscreen", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/viewport", upstreamPath: "/viewport", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "POST", path: "/browser-display/input", upstreamPath: "/input", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "browser"},
  {method: "GET", path: "/remote-desktop/health", upstreamPath: "/desktop/health", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "GET", path: "/remote-desktop/state", upstreamPath: "/desktop/health", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "GET", path: "/remote-desktop/status", upstreamPath: "/desktop/health", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "GET", path: "/remote-desktop/rtc/state", upstreamPath: "/desktop/rtc/state", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "POST", path: "/remote-desktop/rtc/restart", upstreamPath: "/desktop/rtc/restart", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "GET", path: "/remote-desktop/snapshot", upstreamPath: "/desktop/snapshot", responseKind: "stream", timeoutMs: SNAPSHOT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "POST", path: "/remote-desktop/snapshot", upstreamPath: "/desktop/snapshot", responseKind: "stream", timeoutMs: SNAPSHOT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "POST", path: "/remote-desktop/input", upstreamPath: "/desktop/input", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "GET", path: "/remote-desktop/browser/windows", upstreamPath: "/desktop/browser/windows", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
  {method: "POST", path: "/remote-desktop/browser/open", upstreamPath: "/desktop/browser/open", responseKind: "json", timeoutMs: DEFAULT_BROWSER_HOST_TIMEOUT_MS, configKind: "remoteDesktop"},
]

const BROWSER_HOST_ROUTE_INDEX = new Map(BROWSER_HOST_ROUTES.map((route) => [`${route.method} ${route.path}`, route]))

export async function handleBrowserHostRoute(req: Request, method: string, path: string): Promise<Response | null> {
  const route = BROWSER_HOST_ROUTE_INDEX.get(`${method} ${path}`)
  if (route !== undefined) return await proxyBrowserHostRequest(req, route)

  if (path === BROWSER_HOST_PROXY_PREFIX || path.startsWith(`${BROWSER_HOST_PROXY_PREFIX}/`)) {
    if (!isBrowserHostProxyMethod(method)) return browserHostJsonResponse({ok: false, error: `method not allowed: ${method}`}, 405)
    const upstreamPath = path.slice(BROWSER_HOST_PROXY_PREFIX.length) || "/"
    const pathError = validateBrowserHostProxyPath(upstreamPath)
    if (pathError !== null) return browserHostJsonResponse({ok: false, error: pathError}, 400)
    return await proxyBrowserHostRequest(req, {
      method,
      path,
      upstreamPath,
      responseKind: "stream",
      timeoutMs: SNAPSHOT_BROWSER_HOST_TIMEOUT_MS,
      configKind: "browser",
    })
  }

  return null
}

async function proxyBrowserHostRequest(req: Request, route: BrowserHostRoute): Promise<Response> {
  const config = browserHostConfig(route.configKind)
  if (!config.ok) return browserHostUnavailableResponse(config)

  const incomingUrl = new URL(req.url)
  const target = browserHostTargetUrl(config.baseUrl, route.upstreamPath, incomingUrl.search)
  const controller = new AbortController()
  const timeoutMs = browserHostTimeoutMs(route.timeoutMs)
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const init: RequestInit = {
      method: req.method,
      headers: browserHostRequestHeaders(req),
      signal: controller.signal,
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.arrayBuffer()
      if (body.byteLength > 0) init.body = body
    }
    const upstream = await fetch(target, init)
    return browserHostProxyResponse(upstream, route.responseKind)
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError"
    return browserHostJsonResponse({
      ok: false,
      browserHost: browserHostDiagnostic(config),
      target: safeUrlForDiagnostic(target),
      error: timedOut ? `browser-host request timed out after ${timeoutMs}ms` : serializeError(error),
    }, timedOut ? 504 : 502)
  } finally {
    clearTimeout(timer)
  }
}

function browserHostConfig(kind: BrowserHostRoute["configKind"]): BrowserHostConfig {
  const env = browserHostEnv(kind)
  const explicitUrl = process.env[env.url]?.trim()
  if (explicitUrl !== undefined && explicitUrl.length > 0) {
    const parsed = parseBrowserHostUrl(explicitUrl)
    return parsed.ok ? {...parsed, configuredFrom: env.url} : {ok: false, configured: true, env: env.all, error: parsed.error}
  }

  const portValue = process.env[env.port]?.trim()
  if (portValue !== undefined && portValue.length > 0) {
    const port = Number(portValue)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      return {ok: false, configured: true, env: env.all, error: `${env.port} must be an integer from 1 to 65535`}
    }
    return {
      ok: true,
      baseUrl: new URL(`http://127.0.0.1:${port}`),
      configuredFrom: env.port,
    }
  }

  if (kind === "remoteDesktop") return browserHostConfig("browser")

  return {
    ok: false,
    configured: false,
    env: env.all,
    error: `browser-host is not configured; set ${env.url} or ${env.port}`,
  }
}

function browserHostEnv(kind: BrowserHostRoute["configKind"]): {url: string; port: string; all: string[]} {
  if (kind === "remoteDesktop") {
    return {
      url: "INTERPRETER_REMOTE_DESKTOP_HOST_URL",
      port: "INTERPRETER_REMOTE_DESKTOP_HOST_PORT",
      all: [
        "INTERPRETER_REMOTE_DESKTOP_HOST_URL",
        "INTERPRETER_REMOTE_DESKTOP_HOST_PORT",
        "INTERPRETER_BROWSER_HOST_URL",
        "INTERPRETER_BROWSER_HOST_PORT",
      ],
    }
  }
  return {
    url: "INTERPRETER_BROWSER_HOST_URL",
    port: "INTERPRETER_BROWSER_HOST_PORT",
    all: ["INTERPRETER_BROWSER_HOST_URL", "INTERPRETER_BROWSER_HOST_PORT"],
  }
}

function parseBrowserHostUrl(value: string): {ok: true; baseUrl: URL} | {ok: false; error: string} {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    return {ok: false, error: `INTERPRETER_BROWSER_HOST_URL is not a valid URL: ${serializeError(error)}`}
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {ok: false, error: "INTERPRETER_BROWSER_HOST_URL must use http or https"}
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return {ok: false, error: "INTERPRETER_BROWSER_HOST_URL must not include credentials"}
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return {ok: false, error: "INTERPRETER_BROWSER_HOST_URL must not include query or hash"}
  }
  if (!isLoopbackHostname(url.hostname)) {
    return {ok: false, error: "INTERPRETER_BROWSER_HOST_URL must point to localhost, 127.0.0.0/8 or ::1"}
  }
  return {ok: true, baseUrl: url}
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost"
    || normalized === "::1"
    || isLoopbackIpv4(normalized)
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = hostname.split(".")
  if (parts.length !== 4 || parts[0] !== "127") return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255
  })
}

function browserHostTargetUrl(baseUrl: URL, upstreamPath: string, search: string): URL {
  const target = new URL(baseUrl.toString())
  const basePath = target.pathname.replace(/\/+$/, "")
  const cleanPath = upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`
  target.pathname = `${basePath}${cleanPath}`.replace(/\/{2,}/g, "/")
  target.search = search
  target.hash = ""
  return target
}

function browserHostRequestHeaders(req: Request): Headers {
  const headers = new Headers()
  for (const name of ["accept", "content-type"]) {
    const value = req.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return headers
}

function browserHostProxyResponse(upstream: Response, responseKind: BrowserHostRoute["responseKind"]): Response {
  const headers = new Headers()
  copyBrowserHostHeader(upstream.headers, headers, "content-type")
  copyBrowserHostHeader(upstream.headers, headers, "content-length")
  copyBrowserHostHeader(upstream.headers, headers, "etag")
  copyBrowserHostHeader(upstream.headers, headers, "last-modified")
  const cacheControl = upstream.headers.get("cache-control") ?? "no-store"
  headers.set("cache-control", cacheControl)

  const size = upstream.headers.get("content-length")
  if (size !== null) headers.set("x-browser-host-size", size)
  if (responseKind === "stream" && !headers.has("content-type")) headers.set("content-type", "application/octet-stream")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

function copyBrowserHostHeader(from: Headers, to: Headers, name: string): void {
  const value = from.get(name)
  if (value !== null) to.set(name, value)
}

function browserHostUnavailableResponse(config: Extract<BrowserHostConfig, {ok: false}>): Response {
  return browserHostJsonResponse({
    ok: false,
    browserHost: {
      available: false,
      configured: config.configured,
      env: config.env,
    },
    error: config.error,
  }, 503)
}

function browserHostDiagnostic(config: Extract<BrowserHostConfig, {ok: true}>): Record<string, unknown> {
  return {
    available: false,
    configured: true,
    configuredFrom: config.configuredFrom,
    baseUrl: safeUrlForDiagnostic(config.baseUrl),
  }
}

function safeUrlForDiagnostic(url: URL): string {
  const copy = new URL(url.toString())
  copy.username = ""
  copy.password = ""
  return copy.toString()
}

function browserHostTimeoutMs(fallback: number): number {
  const value = process.env.INTERPRETER_BROWSER_HOST_TIMEOUT_MS?.trim()
  if (value === undefined || value.length === 0) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isBrowserHostProxyMethod(method: string): boolean {
  return method === "GET"
    || method === "HEAD"
    || method === "POST"
    || method === "PUT"
    || method === "PATCH"
    || method === "DELETE"
}

function validateBrowserHostProxyPath(path: string): string | null {
  if (!path.startsWith("/")) return "browser-host proxy path must start with /"
  if (path === "/") return "browser-host proxy path is required"
  if (path.startsWith("//")) return "browser-host proxy path must be relative to the configured host"
  if (path.includes("\\")) return "browser-host proxy path must not contain backslashes"
  const segments = path.split("/")
  if (segments.some((segment) => {
    const decoded = decodeBrowserHostPathSegment(segment)
    return decoded === "." || decoded === ".." || decoded.includes("\\")
  })) {
    return "browser-host proxy path must not contain . or .. segments or backslashes"
  }
  return null
}

function decodeBrowserHostPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function browserHostJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"},
  })
}
