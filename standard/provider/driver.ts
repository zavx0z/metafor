import {createHash} from "node:crypto"
/** Native transport capabilities authorize canonical Mass assignments; credentials stay in the assigned host. @packageDocumentation */
import {open} from "node:fs/promises"
import {constants} from "node:fs"
import {isAbsolute} from "node:path"
import type {IceServer, PeerNetwork, RelaySignalTransport} from "@metafor/tech-peer"
import type {ProviderDriver as ChatDriver} from "./runtime-types"
import type {ProviderBinding as ChatProviderBinding} from "@metafor/types/metafor/providers"
import type {ProviderBinding, ProviderCapabilities, ProviderCheck, ProviderConnection, ProviderCatalogEntry} from "@metafor/types/metafor/providers"
import {parseProviderExecutionSettings} from "@metafor/types/metafor/provider-validation"
import {createOllamaDriver, readOllamaOptions, type OllamaInstallation} from "./ollama-driver"
import {codexDriver} from "./codex-driver"

type Network = {peerId: string; viewerPeerId?: string; signalingUrl: string; tokenFile: string; relay?: boolean; rtc?: {ipv4?: boolean; ipv6?: boolean}; iceServers?: IceServer[]}
type Host = {peerId: string; network: Network}
export type NativeProviderCapabilities = {version: 1; ollama?: OllamaInstallation; hosts: Record<string, Host>; bindings: Record<string, {service: string; host: string; executorId: string; assignmentId?: string; connection?: ProviderConnection}>}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
const only = (value: Record<string, unknown>, keys: string[]) => {if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unsupported native Provider configuration")}

/** Validates host-independent transports and public service assignments before any network effect. */
export function parseNativeProviderCapabilities(value: unknown): NativeProviderCapabilities {
  if (!object(value) || value.version !== 1 || !object(value.hosts) || !object(value.bindings)) throw new Error("Invalid native Provider registry")
  only(value, ["version", "hosts", "bindings", "ollama"])
  if (value.ollama !== undefined) {
    if (!object(value.ollama) || typeof value.ollama.url !== "string" || typeof value.ollama.directory !== "string" || !isAbsolute(value.ollama.directory) || /[\u0000-\u001f\u007f]/u.test(value.ollama.directory) ||
        value.ollama.model !== undefined && (typeof value.ollama.model !== "string" || !value.ollama.model || value.ollama.model.length > 256)) throw new Error("Invalid native Ollama assignment")
    only(value.ollama, ["url", "directory", "model"])
    const url = new URL(value.ollama.url)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid native Ollama URL")
  }
  if (Object.keys(value.hosts).length > 32 || Object.keys(value.bindings).length > 128) throw new Error("Native Provider registry exceeds its limit")
  for (const [name, host] of Object.entries(value.hosts)) {
    if (!id(name) || !object(host) || !id(host.peerId) || !object(host.network)) throw new Error("Invalid native Provider host")
    only(host, ["peerId", "network"])
    const network = host.network
    only(network, ["peerId", "viewerPeerId", "signalingUrl", "tokenFile", "relay", "rtc", "iceServers"])
    if (!id(network.peerId) || network.peerId === host.peerId || typeof network.tokenFile !== "string" || !isAbsolute(network.tokenFile) ||
        typeof network.signalingUrl !== "string" || network.relay !== undefined && typeof network.relay !== "boolean") throw new Error("Invalid native Provider network")
    if (network.viewerPeerId !== undefined && (!id(network.viewerPeerId) || network.viewerPeerId === network.peerId || network.viewerPeerId === host.peerId)) throw new Error("Invalid assigned native viewer identity")
    const url = new URL(network.signalingUrl)
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid native Provider signaling URL")
    if (network.rtc !== undefined) {
      if (!object(network.rtc)) throw new Error("Invalid native RTC policy")
      only(network.rtc, ["ipv4", "ipv6"])
      if (network.rtc.ipv4 !== undefined && typeof network.rtc.ipv4 !== "boolean" || network.rtc.ipv6 !== undefined && typeof network.rtc.ipv6 !== "boolean" || network.rtc.ipv4 === false && network.rtc.ipv6 === false) throw new Error("Invalid native RTC policy")
    }
    if (network.iceServers !== undefined && (!Array.isArray(network.iceServers) || network.iceServers.length > 16 || network.iceServers.some(server => !object(server) ||
        Object.keys(server).some(key => !["urls", "username", "credential"].includes(key)) ||
        !(typeof server.urls === "string" ? [server.urls] : Array.isArray(server.urls) ? server.urls : []).length ||
        !(typeof server.urls === "string" ? [server.urls] : server.urls as unknown[]).every(url => typeof url === "string" && /^(stun|stuns|turn|turns):[^\s]+$/.test(url)) ||
        server.username !== undefined && typeof server.username !== "string" || server.credential !== undefined && typeof server.credential !== "string"))) throw new Error("Invalid native ICE policy")
  }
  for (const [name, binding] of Object.entries(value.bindings)) {
    if (!id(name) || !object(binding) || !id(binding.service) || !id(binding.host) || !Object.hasOwn(value.hosts, binding.host) || !id(binding.executorId) ||
        binding.assignmentId !== undefined && !id(binding.assignmentId)) throw new Error("Invalid native Provider binding")
    only(binding, ["service", "host", "executorId", "assignmentId", "connection"])
    if (binding.connection !== undefined) {
      const validated = parseProviderExecutionSettings({schemaVersion: 1, revision: 0, connections: [binding.connection], general: {}, types: {}}).connections[0]!
      if ((validated.provider === "codex" ? "codex" : validated.provider === "ollama" ? "ollama" : validated.endpoint.service) !== binding.service) throw new Error("Native Provider descriptor differs from its assigned service")
    }
  }
  return structuredClone(value) as NativeProviderCapabilities
}

/** Reads only an assigned owner-private regular file, refusing symlinks and group/other access. */
async function privateText(path: string, maximum: number): Promise<string> {
  if (!isAbsolute(path)) throw new Error("Provider configuration requires an absolute private path")
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || typeof process.getuid === "function" && stat.uid !== process.getuid() || stat.size > maximum)
      throw new Error("Provider configuration requires an owner-private regular file")
    const text = await file.readFile("utf8")
    if (Buffer.byteLength(text) > maximum) throw new Error("Private Provider file exceeds its limit")
    return text
  } finally {await file.close()}
}

const ollamaBinding: ProviderBinding = {id: "native-ollama", service: "ollama", host: "native", remotePeerId: "native", executorId: "ollama"}
const localOllamaBinding = (installation: OllamaInstallation): ProviderBinding => ({...ollamaBinding,
  assignmentId: `ollama-${createHash("sha256").update(JSON.stringify([new URL(installation.url).href, installation.directory])).digest("hex")}`})
async function assignedOllama(binding?: ProviderBinding): Promise<OllamaInstallation> {
  const path = process.env.ORACLE_AGENT_PROVIDER_CONFIG
  if (!path) throw new Error("Хост не назначил Ollama endpoint")
  const assignment = parseNativeProviderCapabilities(JSON.parse(await privateText(path, 1024 * 1024))).ollama
  if (!assignment) throw new Error("Хост не назначил Ollama endpoint")
  const expected = localOllamaBinding(assignment)
  if (binding && ["id", "service", "host", "remotePeerId", "executorId", "assignmentId"].some(key => binding[key as keyof ProviderBinding] !== expected[key as keyof ProviderBinding])) throw new Error("Ollama binding находится вне назначения хоста")
  return assignment
}
/** Каталог только выданного native endpoint; чтение не создаёт сессию и не генерирует ответ. */
export async function readProviderOptions(binding: ProviderBinding, model: string | undefined, signal: AbortSignal) {
  if (binding.service !== "ollama") throw new Error("Подключение не предоставляет независимый каталог моделей")
  return readOllamaOptions(await assignedOllama(binding), model, signal)
}

async function openNetwork(host: Host): Promise<PeerNetwork> {
  const token = (await privateText(host.network.tokenFile, 4096)).trim()
  if (token.length < 16 || /\s/.test(token)) throw new Error("Invalid native Provider credential")
  const [{connectWebSocketSignaling}, {createRoutedPeerNetwork, createPeerNetwork}, {createWeriftPeerConnectionFactory}] = await Promise.all([
    import("@metafor/tech-peer/signaling"), import("@metafor/tech-peer"), import("@metafor/tech-peer/werift"),
  ])
  const bootstrap = await connectWebSocketSignaling({url: host.network.signalingUrl, id: host.network.peerId, token, relay: host.network.relay ?? true})
  try {
    const options = {id: host.network.peerId, bootstrap, rtc: createWeriftPeerConnectionFactory({
      ...(host.network.rtc?.ipv4 === undefined ? {} : {iceUseIpv4: host.network.rtc.ipv4}),
      ...(host.network.rtc?.ipv6 === undefined ? {} : {iceUseIpv6: host.network.rtc.ipv6}),
    }), iceServers: host.network.iceServers ?? [{urls: "stun:stun.l.google.com:19302"}]}
    return host.network.relay === false ? createPeerNetwork(options) : createRoutedPeerNetwork({...options, bootstrap: bootstrap as RelaySignalTransport})
  } catch (error) {bootstrap.close(); throw error}
}

type Pool = {users: number; ready: Promise<PeerNetwork>; closing?: Promise<void>}
const hosts = new Map<string, Pool>()
async function interrupted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {abort = () => reject(signal.reason); signal.addEventListener("abort", abort, {once: true})})
  try {return await Promise.race([work, cancelled])} finally {signal.removeEventListener("abort", abort)}
}
async function acquire(host: Host, signal: AbortSignal) {
  signal.throwIfAborted()
  const key = JSON.stringify(host.network)
  let pool = hosts.get(key)
  if (pool?.closing) {await interrupted(pool.closing, signal); return await acquire(host, signal)}
  if (!pool) {pool = {users: 0, ready: openNetwork(host)}; hosts.set(key, pool)}
  const current = pool
  current.users++
  let released = false
  const close = async () => {
    if (released) return
    released = true
    if (--current.users > 0) return
    current.closing = current.ready.then(network => network.close(), () => {}).finally(() => {if (hosts.get(key) === current) hosts.delete(key)})
    await current.closing
  }
  try {return {network: await interrupted(current.ready, signal), close}}
  catch (error) {void close(); throw error}
}

/** Authorizes an existing canonical binding against the assigned native file; never selects a catalog entry. */
async function peerOptions(binding: ProviderBinding, viewer = false) {
  const bindingId = binding.id
  if (!id(bindingId)) throw new Error("Invalid Chat provider binding ID")
  const path = process.env.ORACLE_AGENT_PROVIDER_CONFIG
  if (!path) throw new Error("Host has not assigned a native Provider registry")
  let registry: NativeProviderCapabilities
  try {registry = parseNativeProviderCapabilities(JSON.parse(await privateText(path, 1024 * 1024)))}
  catch {throw new Error("Assigned native Provider registry is unavailable or invalid")}
  const selected = registry.bindings[bindingId]
  if (!selected) throw new Error("Chat provider binding is not assigned by this host")
  let host = registry.hosts[selected.host]!
  const expected: ChatProviderBinding = {id: bindingId, service: selected.service, host: selected.host, remotePeerId: host.peerId, executorId: selected.executorId,
    ...(selected.assignmentId === undefined ? {} : {assignmentId: selected.assignmentId})}
  if (["id", "service", "host", "remotePeerId", "executorId", "assignmentId"].some(key => expected[key as keyof ProviderBinding] !== binding[key as keyof ProviderBinding])) throw new Error("Canonical Provider binding is outside its assigned native transport capability")
  if (viewer) {
    if (!host.network.viewerPeerId) throw new Error("Host has not assigned a separate native viewer identity")
    host = {...host, network: {...host.network, peerId: host.network.viewerPeerId}}
  }
  return {binding: structuredClone(binding), async connect(signal: AbortSignal) {
    const lease = await acquire(host, signal)
    try {
      await interrupted(lease.network.connect(binding.remotePeerId), signal)
      signal.throwIfAborted()
      return lease
    } catch (error) {
      await lease.close()
      throw error
    }
  }}
}

/**
Authorizes an already resolved canonical Mass binding against native transport
capabilities. Native configuration does not select, replace or refresh catalog
entries. Credentials remain native; the returned driver retains the exact
Provider-owned descriptor. Legacy Codex is an explicit native transport only.
*/
export async function authorizedProviderDriver(binding: ProviderBinding): Promise<ChatDriver> {
  if (binding.service === "ollama") return {...createOllamaDriver(await assignedOllama(binding)), binding: structuredClone(binding)}
  if (binding.id === "legacy-codex" && binding.service === "codex" && binding.host === "native" && binding.remotePeerId === "native" && binding.executorId === "codex" && binding.assignmentId === undefined) {
    if (!process.env.ORACLE_AGENT_CODEX_COMMAND || !process.env.ORACLE_AGENT_CODEX_CWD) throw new Error("Host has not assigned the legacy Codex capability")
    return {...codexDriver, binding: structuredClone(binding)}
  }
  const {createPeerChatDriver} = await import("./peer-driver")
  return createPeerChatDriver(await peerOptions(binding))
}

/** Transport admission is a current observation; it never claims a successful model response or login. */
export async function checkProviderBinding(binding: ProviderBinding, signal: AbortSignal) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  if (binding.id === "legacy-codex" || binding.service === "ollama") {
    const driver = await authorizedProviderDriver(binding)
    if (!driver.check) throw new Error("Assigned Provider has no finite check")
    await driver.check(bounded)
  } else {
    const {checkPeerProvider} = await import("./peer-driver")
    await checkPeerProvider(await peerOptions(binding), bounded)
  }
  return {connection: "connected" as const, checks: {status: "unknown" as const, checkedAt: Date.now(), message: binding.service === "ollama" ? "Installed Ollama model metadata observed; no generation was tested" : "ACP admission confirmed; no model response or login readiness was tested"}}
}

/**
 * Проверяет назначение хоста и текущий browser preview отдельно от ACP admission.
 * Describe не открывает CDP, model session или login. Lazy initialize подтверждает
 * только объявленную model operation: checks остаётся unknown. При недоступном
 * ACP уже проверенный preview сохраняется с modelTurn=false.
 * Проверка использует model lease своего Energy процесса; viewer identity
 * остаётся за HUD другого процесса. Оба протокола делят только этот model lease.
 * [Проверки](./driver.spec.ts) покрывают назначение, preview и отсутствие prompt.
 */
export async function checkProviderRegistration(binding: ProviderBinding, signal: AbortSignal): Promise<{
  connection: "connected"; checks: ProviderCheck; capabilities: ProviderCapabilities
}> {
  if (binding.id === "legacy-codex") return {...await checkProviderBinding(binding, signal), capabilities: {modelTurn: true, browserPreview: false, browserControl: false}}
  if (binding.service === "codex" || binding.service === "ollama") return {...await checkProviderBinding(binding, signal), capabilities: {modelTurn: true, browserPreview: false, browserControl: false}}
  if (!["chatgpt", "deepseek", "qwen"].includes(binding.service)) throw new Error("Explicit registration requires an assigned native browser or Codex binding")
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(20_000)])
  const lease = await assignedBrowserClient(binding, bounded, false)
  try {
    const description = await lease.client.describe({peerId: binding.remotePeerId, executorId: binding.executorId, signal: bounded})
    bounded.throwIfAborted()
    let modelTurn = false
    try {await checkProviderBinding(binding, signal); modelTurn = true}
    catch {signal.throwIfAborted()}
    return {connection: "connected", capabilities: {modelTurn, browserPreview: true, browserControl: description.controlEnabled},
      checks: {status: "unknown", checkedAt: Date.now(), message: modelTurn
        ? "Browser preview/control described; ACP admission confirmed; site login and model response remain unchecked"
        : "Browser preview/control described; ACP admission unavailable; site login and model response remain unchecked"}}
  } finally {await lease.close()}
}

/** Viewer-only native lease; its explicit identity cannot replace the model connection in another process. */
export async function authorizedProviderBrowserClient(binding: ProviderBinding, signal: AbortSignal) {
  return assignedBrowserClient(binding, signal, true)
}

async function assignedBrowserClient(binding: ProviderBinding, signal: AbortSignal, viewer: boolean) {
  const options = await peerOptions(binding, viewer)
  const lease = await options.connect(signal)
  let client: import("@zavx0z/provider-tech-peer/browser-types").BrowserPeerClient
  try {
    const {default: browserPeer} = await import("@zavx0z/provider-tech-peer/browser")
    signal.throwIfAborted()
    client = browserPeer.createBrowserPeerClient(lease.network)
  } catch (error) {await lease.close(); throw error}
  let closed = false
  return {client, async close() {
    if (closed) return
    closed = true
    try {await client.close()} finally {await lease.close()}
  }}
}

/** Сопоставляет конфигурацию с выданным native назначением; поля HUD не выдают доступ. */
export async function resolveConfiguredProvider(connection: ProviderConnection, entries: readonly ProviderCatalogEntry[]): Promise<ProviderBinding> {
  if (!connection.enabled) throw new Error("Подключение выключено")
  if (connection.provider === "ollama") {
    if (connection.peer || connection.endpoint.ssh) throw new Error("Хост не назначил удалённый Ollama transport")
    const assigned = await assignedOllama()
    if (new URL(connection.endpoint.url).href !== new URL(assigned.url).href) throw new Error("Ollama endpoint находится вне назначения хоста")
    return localOllamaBinding(assigned)
  }
  if (connection.ssh) throw new Error("Хост не предоставил native adapter для этого подключения")
  const service = connection.provider === "codex" ? "codex" : connection.endpoint.service
  const descriptors = new Map<string, ProviderConnection>()
  const candidates: ProviderBinding[] = entries.filter(entry => entry.service === service)
  if (process.env.ORACLE_AGENT_PROVIDER_CONFIG) {
    const native = parseNativeProviderCapabilities(JSON.parse(await privateText(process.env.ORACLE_AGENT_PROVIDER_CONFIG, 1024 * 1024)))
    for (const [id, value] of Object.entries(native.bindings)) {
      const host = native.hosts[value.host]!
      candidates.push({id, ...value, remotePeerId: host.peerId})
      if (value.connection) descriptors.set(id, value.connection)
    }
  }
  const matches = (descriptor: ProviderConnection) => {
    if (descriptor.provider !== connection.provider) return false
    if (connection.provider === "codex" || descriptor.provider === "codex") return JSON.stringify(connection.ssh) === JSON.stringify(descriptor.ssh)
    return (!connection.endpoint.url && connection.peer !== undefined || new URL(connection.endpoint.url).href === new URL(descriptor.endpoint.url).href) &&
      (!connection.endpoint.profile && connection.peer !== undefined || connection.endpoint.profile === descriptor.endpoint.profile) && connection.endpoint.service === descriptor.endpoint.service
  }
  const unique = [...new Map(candidates.filter(entry => entry.service === service && (!descriptors.has(entry.id) || matches(descriptors.get(entry.id)!)) && (connection.peer
    ? entry.remotePeerId === connection.peer.peerId && entry.executorId === connection.peer.executorId
    : descriptors.has(entry.id) && matches(descriptors.get(entry.id)!) || entry.id === connection.id || connection.provider === "codex" && entry.id === "legacy-codex")).map(entry => [entry.id, entry])).values()]
  if (unique.length !== 1) throw new Error("Хост не предоставил однозначное назначение для этого подключения")
  const entry = unique[0]!
  return {id: entry.id, service: entry.service, host: entry.host, remotePeerId: entry.remotePeerId, executorId: entry.executorId,
    ...(entry.assignmentId === undefined ? {} : {assignmentId: entry.assignmentId})}
}
