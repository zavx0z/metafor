const PREFIX = "force/replay/"
const BEGIN_PREFIX = `${PREFIX}begin/`
const END_PREFIX = `${PREFIX}end/`
const REQUEST_PREFIX = `${PREFIX}request/`

export type ForceReplayAddress = {
  domain: string
  id: string
}

const encodeAddress = ({domain, id}: ForceReplayAddress): string =>
  `${encodeURIComponent(domain)}/${encodeURIComponent(id)}`

const parseAddress = (path: string, prefix: string): ForceReplayAddress | null => {
  if (!path.startsWith(prefix)) return null
  const segments = path.slice(prefix.length).split("/")
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null
  try {
    return {domain: decodeURIComponent(segments[0]), id: decodeURIComponent(segments[1])}
  } catch {
    return null
  }
}

/** Ordinary z/test request emitted by a runtime after register/reconnect. */
export const forceReplayPath = (domain: string, id: string): string =>
  `${REQUEST_PREFIX}${encodeAddress({domain, id})}`

export const forceReplayBeginPath = (domain: string, id: string): string =>
  `${BEGIN_PREFIX}${encodeAddress({domain, id})}`

export const forceReplayEndPath = (domain: string, id: string): string =>
  `${END_PREFIX}${encodeAddress({domain, id})}`

export const parseForceReplayPath = (path: string | number): ForceReplayAddress | null =>
  typeof path === "string" ? parseAddress(path, REQUEST_PREFIX) : null

export const parseForceReplayBeginPath = (path: string | number): ForceReplayAddress | null =>
  typeof path === "string" ? parseAddress(path, BEGIN_PREFIX) : null

export const parseForceReplayEndPath = (path: string | number): ForceReplayAddress | null =>
  typeof path === "string" ? parseAddress(path, END_PREFIX) : null

export const isForceReplayPath = (path: string | number): boolean =>
  parseForceReplayPath(path) !== null || parseForceReplayBeginPath(path) !== null || parseForceReplayEndPath(path) !== null

export const isReplayAddressedTo = (
  path: string | number,
  domain: string,
  id: string,
): boolean => {
  const address = parseForceReplayPath(path) ?? parseForceReplayBeginPath(path) ?? parseForceReplayEndPath(path)
  return address?.domain === domain && address.id === id
}
