const PREFIX = "force/replay/"

export const forceReplayPath = (domain: string, id: string): string =>
  `${PREFIX}${encodeURIComponent(domain)}/${encodeURIComponent(id)}`

export const parseForceReplayPath = (path: string | number): {domain: string; id: string} | null => {
  if (typeof path !== "string" || !path.startsWith(PREFIX)) return null
  const segments = path.slice(PREFIX.length).split("/")
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null
  try {
    return {domain: decodeURIComponent(segments[0]), id: decodeURIComponent(segments[1])}
  } catch {
    return null
  }
}
