import {constants} from "node:fs"
import {open} from "node:fs/promises"
import {dirname, isAbsolute, resolve} from "node:path"
import type {ReleaseParticipant as Peer} from "./contract"
import {proxyUrl} from "./websocket"

export const MAX_PEERS = 32
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const invalid = () => new Error("Invalid private peer configuration")

export function configuration(value: unknown, baseDirectory?: string): Peer.Configuration {
  try {
    if (baseDirectory && record(value) && typeof value.tokenFile === "string" && !isAbsolute(value.tokenFile))
      value = {...value, tokenFile: resolve(baseDirectory, value.tokenFile)}
    if (!record(value) || Object.keys(value).some(key => !["id", "signalingUrl", "webSocketProxyUrl", "tokenFile", "allowedPeers", "iceServers", "rtc"].includes(key))) throw invalid()
    if (typeof value.id !== "string" || !idPattern.test(value.id)
      || typeof value.tokenFile !== "string" || !isAbsolute(value.tokenFile) || /[\u0000-\u001f\u007f]/u.test(value.tokenFile)
      || typeof value.signalingUrl !== "string") throw invalid()
    const url = new URL(value.signalingUrl)
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid()
    proxyUrl(value.webSocketProxyUrl)
    const selfId = value.id
    if (!Array.isArray(value.allowedPeers) || value.allowedPeers.length > MAX_PEERS
      || !value.allowedPeers.every(id => typeof id === "string" && idPattern.test(id) && id !== selfId)
      || new Set(value.allowedPeers).size !== value.allowedPeers.length) throw invalid()
    if (value.rtc !== undefined && (!record(value.rtc) || Object.keys(value.rtc).some(key => !["ipv4", "ipv6"].includes(key))
      || value.rtc.ipv4 !== undefined && typeof value.rtc.ipv4 !== "boolean"
      || value.rtc.ipv6 !== undefined && typeof value.rtc.ipv6 !== "boolean"
      || value.rtc.ipv4 === false && value.rtc.ipv6 === false)) throw invalid()
    if (value.iceServers !== undefined) {
      if (!Array.isArray(value.iceServers) || value.iceServers.length > 16) throw invalid()
      for (const server of value.iceServers) {
        if (!record(server) || Object.keys(server).some(key => !["urls", "username", "credential"].includes(key))) throw invalid()
        const urls = typeof server.urls === "string" ? [server.urls] : server.urls
        if (!Array.isArray(urls) || !urls.length || !urls.every(url => typeof url === "string" && /^(stun|stuns|turn|turns):[^\s]+$/.test(url))
          || server.username !== undefined && (typeof server.username !== "string" || !server.username || /[\u0000-\u001f\u007f]/u.test(server.username))
          || server.credential !== undefined && (typeof server.credential !== "string" || !server.credential || /[\u0000-\u001f\u007f]/u.test(server.credential))) throw invalid()
      }
    }
    return structuredClone(value) as unknown as Peer.Configuration
  } catch {throw invalid()}
}

async function privateBytes(path: string, limit: number): Promise<Uint8Array> {
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await file.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > limit) throw invalid()
    const bytes = Buffer.alloc(limit + 1)
    let size = 0
    while (size < bytes.byteLength) {
      const read = await file.read(bytes, size, bytes.byteLength - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size > limit) throw invalid()
    return bytes.subarray(0, size)
  } catch {throw invalid()}
  finally {await file?.close()}
}

/** Owned regular non-symlink private JSON до 64 KiB; unknown network policy fields отвергаются. */
export async function readConfiguration(path: string): Promise<Peer.Configuration> {
  try {return configuration(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(await privateBytes(path, 64 * 1024))), dirname(resolve(path)))}
  catch {throw invalid()}
}

/** Room credential доступен только локальному owner; snapshots и diagnostic errors его исключают. */
export async function readToken(config: Peer.Configuration): Promise<string> {
  const token = new TextDecoder("utf-8", {fatal: true}).decode(await privateBytes(config.tokenFile, 4096)).trim()
  if (token.length < 16 || token.length > 4096 || /\s/u.test(token)) throw invalid()
  return token
}
