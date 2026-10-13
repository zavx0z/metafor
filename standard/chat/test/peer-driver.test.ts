import {expect, test} from "bun:test"
import {agent, methods, PROTOCOL_VERSION, type AnyMessage, type SessionConfigOption} from "@agentclientprotocol/sdk"
import peer from "@zavx0z/provider-tech-peer"
import type {PeerNetwork, PeerSessionParams} from "@zavx0z/provider-tech-peer/types"
import {createPeerChatDriver, checkPeerProvider} from "@metafor/provider/peer-driver"
import {parseNativeProviderCapabilities, authorizedProviderDriver} from "@metafor/provider/driver"
import {chmod, mkdtemp, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import send from "./fixture/cycle"
import type {ChatSession} from "../types"
import type {ProviderBinding as ChatProviderBinding} from "@metafor/types/metafor/providers"
import type {ProviderEnergy as ChatEnergy} from "@metafor/provider/runtime-types"
import type {MassHandle} from "@metafor/types/metafor/mass"

const binding: ChatProviderBinding = {id: "chatgpt-codespace", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "browser", assignmentId: "approved"}
function fixture(withSettings = false) {
  type Event = {peerId: string; channel: string; data: Uint8Array | string}
  const listeners = [new Set<(event: Event) => void>(), new Set<(event: Event) => void>()]
  const states = [new Set<(value: {links: {peerId: string; state: string}[]}) => void>(), new Set<(value: {links: {peerId: string; state: string}[]}) => void>()]
  const ids = ["consumer", "host"]
  let connected = true, prompts = 0, disposals = 0, leases = 0, nativeSessions = 0
  const opened: PeerSessionParams[] = []
  let configOptions: SessionConfigOption[] = [
    {id: "browser-model", name: "Модель", type: "select", category: "model", currentValue: "a", options: [{group: "native", name: "Native", options: [{value: "a", name: "Model A"}, {value: "b", name: "Model B"}]}]},
    {id: "browser-effort", name: "Мышление", type: "select", category: "thought_level", currentValue: "high", options: [{value: "low", name: "Low"}, {value: "high", name: "High"}]},
  ]
  const configurations: Array<{configId: string; value: unknown}> = []
  let notifySettings: (options: SessionConfigOption[], sessionId?: string) => Promise<void> = async () => {throw new Error("Native session is not open")}

  const networks = ids.map((id, index): PeerNetwork => ({
    async send(peerId, data, options) {
      if (!connected || peerId !== ids[1 - index]) throw new Error("Disconnected")
      await Promise.resolve()
      for (const listener of listeners[1 - index]!) listener({peerId: id, channel: options?.channel ?? "", data})
    },
    onData(listener) {listeners[index]!.add(listener); return () => {listeners[index]!.delete(listener)}},
    subscribe(listener) {states[index]!.add(listener); return () => {states[index]!.delete(listener)}},
  }))
  const host = peer.createPeerHost({network: networks[1]!, authorize: (id, executor, params) => id === "consumer" && executor === "browser" && params.assignmentId === "approved",
    executors: {browser: {cwd: "/operator-assigned", mcpServers: [], async open(context) {
      opened.push({...context.params})
      const incoming = new TransformStream<AnyMessage, AnyMessage>(), outgoing = new TransformStream<AnyMessage, AnyMessage>()
      const server = agent({name: "fake-browser-provider"})
        .onRequest(methods.agent.initialize, () => ({protocolVersion: PROTOCOL_VERSION, agentCapabilities: {sessionCapabilities: {resume: {}}}}))
        .onRequest(methods.agent.session.new, ({params}) => {nativeSessions++; expect(params.cwd).toBe("/operator-assigned"); return {sessionId: "browser-native-session", ...(withSettings ? {configOptions} : {})}})
        .onRequest(methods.agent.session.resume, async ({params, client}) => {
          expect(params.sessionId).toBe("browser-native-session")
          await client.notify(methods.client.session.update, {sessionId: params.sessionId, update: {sessionUpdate: "agent_message_chunk", content: {type: "text", text: "old replay"}}})
          notifySettings = (configOptions, sessionId = params.sessionId) => client.notify(methods.client.session.update, {sessionId, update: {sessionUpdate: "config_option_update", configOptions}})
          return withSettings ? {configOptions} : {}
        })
        .onRequest(methods.agent.session.setConfigOption, ({params}) => {
          expect(withSettings).toBe(true)
          expect(params.sessionId).toBe("browser-native-session")
          configurations.push({configId: params.configId, value: params.value})
          configOptions = configOptions.map(option => {
            if (option.id === params.configId && option.type === "select") return {...option, currentValue: String(params.value)}
            if (params.configId === "browser-model" && option.id === "browser-effort" && option.type === "select") return {...option, currentValue: "low", options: [{value: "low", name: "Low"}]}
            return option
          })
          return {configOptions}
        })
        .onRequest(methods.agent.session.prompt, async ({params, client}) => {
          prompts++
          const permission = await client.request(methods.client.session.requestPermission, {sessionId: params.sessionId,
            toolCall: {toolCallId: "native-permission"}, options: [{optionId: "allow", name: "Allow", kind: "allow_once"}]})
          expect(permission.outcome.outcome).toBe("cancelled")
          await client.notify(methods.client.session.update, {sessionId: params.sessionId, update: {sessionUpdate: "agent_message_chunk", messageId: "reply", content: {type: "text", text: "Ответ выбранного браузерного сервиса."}}})
          return {stopReason: "end_turn"}
        }).connect({readable: incoming.readable, writable: outgoing.writable})
      return {stream: {readable: outgoing.readable, writable: incoming.writable}, closed: server.closed.then(() => {}), async dispose() {disposals++; server.close()}}
    }}}})
  const connect = async () => {leases++; return {network: networks[0]!, async close() {leases--}}}
  const driver = createPeerChatDriver({binding, connect})
  let text = ""
  const mass: MassHandle = {async readText() {return text}, async readJson() {return JSON.parse(text)}, async readBytes() {return new TextEncoder().encode(text)}, async write(value) {text = JSON.stringify(value)}}
  const energy: ChatEnergy = {}
  return {driver, mass, opened, connect, configurations, notifySettings: (options: SessionConfigOption[], sessionId?: string) => notifySettings(options, sessionId), prompts: () => prompts, disposals: () => disposals, leases: () => leases, nativeSessions: () => nativeSessions,
    session: () => JSON.parse(text) as ChatSession,
    call: (id: string, selected = driver) => send({request: JSON.stringify({id, prompt: "Обычный пользовательский текст"}), binding: selected.binding?.id ?? null, mass: {session: mass}, energy, signal: AbortSignal.timeout(5000), driver: selected}),
    disconnect() {connected = false; for (const group of states) for (const listener of group) listener({links: []})},
    async close() {await host.close()},
  }
}

test("finite Provider check performs real ACP admission and initialize without native session or model prompt", async () => {
  const f = fixture()
  try {
    await checkPeerProvider({binding, connect: f.connect}, AbortSignal.timeout(5000))
    expect(f.opened).toEqual([{assignmentId: "approved"}])
    expect(f.nativeSessions()).toBe(0)
    expect(f.prompts()).toBe(0)
    expect(f.leases()).toBe(0)
  } finally {await f.close()}
  expect(f.disposals()).toBe(1)
})

test("public Provider peer and ACP SDK preserve bound browser session across turns without replay or native permission", async () => {
  const f = fixture()
  try {
    expect((await f.call("first")).response).toBe("Ответ выбранного браузерного сервиса.")
    expect((await f.call("second")).response).toBe("Ответ выбранного браузерного сервиса.")
    expect(f.opened).toEqual([{assignmentId: "approved"}, {assignmentId: "approved", previousSessionId: "browser-native-session"}])
    expect(f.session()).toMatchObject({provider: "chatgpt", binding, sessionId: "browser-native-session"})
    expect(f.session().messages).toHaveLength(4)
    expect(f.session().messages.some(message => message.content.includes("old replay"))).toBeFalse()
    expect(f.leases()).toBe(0)
    expect(f.prompts()).toBe(2)
    expect((await f.call("second")).response).toBe("Ответ выбранного браузерного сервиса.")
    expect(f.prompts()).toBe(2)
  } finally {await f.close()}
  expect(f.disposals()).toBe(2)
})

test("service, host, assignment or executor changes refuse before another native open and preserve all history", async () => {
  const f = fixture()
  try {
    await f.call("first")
    const original = await f.mass.readText()
    for (const change of [{service: "qwen"}, {host: "mac"}, {remotePeerId: "another"}, {executorId: "deepseek"}, {assignmentId: "other"}]) {
      const driver = {...f.driver, binding: {...binding, ...change}}
      expect((await f.call("different", driver)).error).toContain("does not match")
      expect(f.session().messages.slice(0, 2)).toEqual(JSON.parse(original).messages)
    }
    expect(f.opened).toHaveLength(1)
  } finally {await f.close()}
})

test("an unavailable selected host never picks another service or native session", async () => {
  const f = fixture()
  try {
    f.disconnect()
    expect((await f.call("first")).error).not.toBeNull()
    expect(f.session().requests[0]?.state).toBe("failed")
    expect((await f.call("first")).error).not.toBeNull()
    expect(f.session().requests).toHaveLength(1)
    expect(f.opened).toHaveLength(0)
    expect(f.leases()).toBe(0)
  } finally {await f.close()}
})

test("native registry assigns independent host networks and one common service contract", () => {
  const network = {peerId: "consumer", signalingUrl: "wss://codespace.example/peer", tokenFile: "/private/codespace-token", relay: true}
  const value = {version: 1, hosts: {codespace: {peerId: "codespace-host", network}, mac: {peerId: "mac-host", network: {...network, signalingUrl: "ws://127.0.0.1:4444/peer", tokenFile: "/private/mac-token"}}},
    bindings: Object.fromEntries(["chatgpt", "deepseek", "qwen"].flatMap(service => ["mac", "codespace"].map(host => [`${host}-${service}`, {service, host, executorId: service}])))}
  expect(Object.keys(parseNativeProviderCapabilities(value).bindings)).toHaveLength(6)
  expect(() => parseNativeProviderCapabilities({...value, token: "must-not-accept"})).toThrow("Unsupported")
  expect(() => parseNativeProviderCapabilities({...value, bindings: {bad: {service: "qwen", host: "unknown", executorId: "qwen"}}})).toThrow("binding")
})

test("native registry resolution reads only an assigned private file and opens no provider before an explicit turn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-provider-binding-"))
  const path = join(directory, "provider.json"), link = join(directory, "linked.json")
  const previous = process.env.ORACLE_AGENT_PROVIDER_CONFIG
  try {
    await writeFile(path, JSON.stringify({version: 1, hosts: {codespace: {peerId: "host", network: {peerId: "consumer", signalingUrl: "wss://unused.invalid/peer", tokenFile: join(directory, "not-read-before-open")}}},
      bindings: {browser: {service: "chatgpt", host: "codespace", executorId: "browser"}}}), {mode: 0o600})
    process.env.ORACLE_AGENT_PROVIDER_CONFIG = path
    expect((await authorizedProviderDriver({id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "browser"})).binding).toMatchObject({id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "browser"})
    await chmod(path, 0o644)
    await expect(authorizedProviderDriver({id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "browser"})).rejects.toThrow("unavailable or invalid")
    await chmod(path, 0o600)
    await symlink(path, link)
    process.env.ORACLE_AGENT_PROVIDER_CONFIG = link
    await expect(authorizedProviderDriver({id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "browser"})).rejects.toThrow("unavailable or invalid")
  } finally {
    if (previous === undefined) delete process.env.ORACLE_AGENT_PROVIDER_CONFIG
    else process.env.ORACLE_AGENT_PROVIDER_CONFIG = previous
    await rm(directory, {recursive: true, force: true})
  }
})


test("owned browser ACP session retains grouped configOptions, applies issued values and consumes live updates without prompt or session creation", async () => {
  const f = fixture(true)
  try {
    const connection = await f.driver.open({sessionId: "browser-native-session", signal: AbortSignal.timeout(5000)})
    try {
      expect(await connection.settings!({}, AbortSignal.timeout(5000))).toEqual({model: "a", reasoning: "high", models: [{id: "a", label: "Model A"}, {id: "b", label: "Model B"}], reasoningLevels: [{id: "low", label: "Low"}, {id: "high", label: "High"}]})
      await expect(connection.settings!({model: "not-offered"}, AbortSignal.timeout(5000))).rejects.toMatchObject({providerEffect: "not-started"})
      expect(f.configurations).toEqual([])
      expect(await connection.settings!({model: "b", reasoning: "low"}, AbortSignal.timeout(5000))).toMatchObject({model: "b", reasoning: "low", reasoningLevels: [{id: "low", label: "Low"}]})
      expect(f.configurations).toEqual([{configId: "browser-model", value: "b"}])
      await f.notifySettings([{id: "changed-model", type: "select", name: "Live", category: "model", currentValue: "c", options: [{value: "c", name: "Live model C"}]}])
      expect(await connection.settings!({}, AbortSignal.timeout(5000))).toEqual({model: "c", reasoning: null, models: [{id: "c", label: "Live model C"}], reasoningLevels: []})
      expect(f.nativeSessions()).toBe(0)
      expect(f.prompts()).toBe(0)
    } finally {await connection.close()}
    expect(f.leases()).toBe(0)
  } finally {await f.close()}
})

test("partial browser settings retain uncertain Provider phase and prevent automatic resend without a model prompt", async () => {
  const {default: turn} = await import("@metafor/provider/turn")
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const f = fixture(true)
  let state = {version: 1, providerRef: "atom:40", binding, sessionId: "browser-native-session", requests: [] as unknown[]}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const request = {id: "configure-partially", operation: "settings", selection: {model: "b", reasoning: "high"}, prompt: "", sessionId: "browser-native-session", providerRef: "atom:40", expectedBinding: binding}
  const call = (value: typeof request) => turn({request: JSON.stringify(value), binding: binding.id, self: {atom: "40"}, signal: AbortSignal.timeout(5000), driver: f.driver, energy: {}, mass: {
    registry: {async readText() {return JSON.stringify(registry)}} as MassHandle,
    turns: {async readText() {return JSON.stringify(state)}, async write(value) {state = value as typeof state}} as MassHandle,
  }})
  try {
    expect(await call(request)).toMatchObject({outcome: "uncertain", response: null})
    expect(state.requests[0]).toMatchObject({phase: "configuring", result: null})
    expect(await call(request)).toMatchObject({outcome: "uncertain"})
    expect(await call({...request, id: "new-request"})).toMatchObject({outcome: "uncertain"})
    expect(f.configurations).toEqual([{configId: "browser-model", value: "b"}])
    expect(f.opened).toHaveLength(1)
    expect(f.nativeSessions()).toBe(0)
    expect(f.prompts()).toBe(0)
    expect(f.leases()).toBe(0)
  } finally {await f.close()}
})
