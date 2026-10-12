const BunSocket = WebSocket as unknown as {new(url: string | URL, options?: Bun.WebSocketOptions): WebSocket}

export function proxyUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined
  try {
    if (typeof value !== "string") throw new Error()
    const proxy = new URL(value)
    if (proxy.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(proxy.hostname)
      || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== "/") throw new Error()
    return proxy.href
  } catch {throw new Error("Invalid private peer configuration")}
}

/** Scoped Bun WS policy; TLS native verified, global env/routes/DNS/proxy не меняются. */
export function webSocketFactory(webSocketProxyUrl?: string): (url: string | URL) => WebSocket {
  const proxy = proxyUrl(webSocketProxyUrl)
  return address => {
    const url = new URL(address)
    const local = url.hostname === "localhost" || url.hostname === "[::1]" || /^127\./.test(url.hostname)
    return proxy && !local ? new BunSocket(url, {proxy}) : new BunSocket(url)
  }
}
