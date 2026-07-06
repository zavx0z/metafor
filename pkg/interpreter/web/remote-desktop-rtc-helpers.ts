export type RemoteDesktopRtcResolvedConfig = {
  signalUrls: string[]
  iceServers: RTCIceServer[] | null
}

export function remoteDesktopRandomToken(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function responseErrorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => response.statusText)
  const compact = text.replace(/\s+/g, " ").trim()
  return compact.length > 0 ? compact.slice(0, 180) : response.statusText
}

export function interpreterRtcSignalUrl(path = remoteDesktopRtcSignalPath()): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${path}`
}

export function interpreterWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${interpreterHttpPath(path)}`
}

export function interpreterHttpPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`
}

export function postInterpreterClientEvent(scope: string, label: string, detail: Record<string, unknown> = {}): void {
  const body = JSON.stringify({scope, label, detail})
  void fetch(interpreterHttpPath("/client-event"), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body,
    keepalive: body.length < 60_000,
  }).catch(() => undefined)
}

export async function resolveRemoteDesktopRtcConfig(): Promise<RemoteDesktopRtcResolvedConfig> {
  const candidates: string[] = []
  let iceServers: RTCIceServer[] | null = null
  for (const path of remoteDesktopApiPaths("/rtc/state")) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1_500)
    try {
      const response = await fetch(`${path}?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) continue
      const payload = await response.json()
      const signalUrl = remoteDesktopSignalUrlFromState(payload)
      if (signalUrl !== null) candidates.push(...remoteDesktopSignalUrlCandidates(signalUrl))
      iceServers ??= remoteDesktopIceServersFromState(payload)
    } catch {
      // Fall through to the same-origin default below.
    } finally {
      window.clearTimeout(timer)
    }
  }
  candidates.push(...remoteDesktopSignalUrlCandidates(null))
  return {signalUrls: uniqueStrings(candidates), iceServers}
}

function remoteDesktopSignalUrlFromState(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const remoteDesktop = (value as {remoteDesktop?: unknown}).remoteDesktop
  if (typeof remoteDesktop !== "object" || remoteDesktop === null || Array.isArray(remoteDesktop)) return null
  const signalUrl = (remoteDesktop as {signalUrl?: unknown}).signalUrl
  return typeof signalUrl === "string" && signalUrl.trim().length > 0 ? signalUrl.trim() : null
}

function remoteDesktopIceServersFromState(value: unknown): RTCIceServer[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const remoteDesktop = (value as {remoteDesktop?: unknown}).remoteDesktop
  if (typeof remoteDesktop !== "object" || remoteDesktop === null || Array.isArray(remoteDesktop)) return null
  const iceServers = (remoteDesktop as {iceServers?: unknown}).iceServers
  const parsed = normalizeRtcIceServers(iceServers)
  return parsed.length === 0 ? null : parsed
}

function normalizeRtcIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeRtcIceServer).filter((server): server is RTCIceServer => server !== null)
}

function normalizeRtcIceServer(value: unknown): RTCIceServer | null {
  if (typeof value === "string" && value.trim().length > 0) return {urls: value.trim()}
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const raw = value as {urls?: unknown; username?: unknown; credential?: unknown; credentialType?: unknown}
  const urls = normalizeRtcIceServerUrls(raw.urls)
  if (urls.length === 0) return null
  return {
    urls: urls.length === 1 ? urls[0]! : urls,
    ...(typeof raw.username === "string" ? {username: raw.username} : {}),
    ...(typeof raw.credential === "string" ? {credential: raw.credential} : {}),
    ...(raw.credentialType === "password" || raw.credentialType === "oauth" ? {credentialType: raw.credentialType} : {}),
  }
}

function normalizeRtcIceServerUrls(value: unknown): string[] {
  if (typeof value === "string") return value.trim().length > 0 ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

export function iceServersForDiagnostics(servers: RTCIceServer[]): string[] {
  return servers.flatMap((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls
    return urls.map((url) => {
      const compact = url.replace(/\/\/[^:@/]+:[^@/]+@/, "//***:***@")
      return compact.length > 160 ? compact.slice(0, 160) : compact
    })
  })
}

function normalizeRemoteDesktopSignalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.href)
    if (window.location.protocol === "https:" && url.protocol === "ws:") {
      const sameOrigin = new URL(window.location.href)
      sameOrigin.protocol = "wss:"
      sameOrigin.pathname = url.pathname === "/webrtc/signaling"
        ? remoteDesktopRtcSignalPath()
        : url.pathname
      sameOrigin.search = url.search
      sameOrigin.hash = ""
      return sameOrigin.toString()
    }
    return url.toString()
  } catch {
    return interpreterRtcSignalUrl()
  }
}

function remoteDesktopSignalUrlCandidates(rawUrl: string | null): string[] {
  const candidates: string[] = []
  if (rawUrl !== null) candidates.push(normalizeRemoteDesktopSignalUrl(rawUrl))
  candidates.push(interpreterRtcSignalUrl("/webrtc/signaling"))
  if (rawUrl !== null && window.location.protocol !== "https:") candidates.push(rawUrl)
  return candidates
}

export function remoteDesktopApiPaths(path: string): string[] {
  const suffix = path.startsWith("/") ? path : `/${path}`
  return [`/remote-desktop${suffix}`]
}

function remoteDesktopRtcSignalPath(): string {
  return "/webrtc/signaling"
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
