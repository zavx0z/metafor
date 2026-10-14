import {expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, registerDocumentGeometryReader, flushDocumentLayoutObservers, Event, HTMLElement, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, InputEvent, type DOMComponentConstructor} from "@zavx0z/immersive"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import type {CosmosAgentChatProps} from "./cosmos-agent-chat"
import type {CosmosConversationSnapshot} from "./agent-workspace-types"
import {createCosmosConversationClient, createCosmosConversationDirectoryClient} from "../../../release/main/conversations"

test("cold head reads and streams without native preparation; explicit fullscreen prepares once and browser auth stays independent", async () => {
  const directory = await mkdtemp(join(import.meta.dir, ".compiled-cosmos-chat-"))
  const document = createDocument(), host = document.createElement("div")
  document.append(host)
  const root = createDomRoot(host)
  const releaseGeometry = registerDocumentGeometryReader(document, host, () => [], () => ({x: 0, y: 0, width: 1200, height: 800}))
  const scope = {verseId: "verse-test", atomRef: "atom:2", agentRef: "agent:00000000-0000-4000-8000-000000000001"}
  const connections = [{id: "one", provider: "codex" as const, label: "Provider A", enabled: true}, {id: "two", provider: "codex" as const, label: "Provider B", enabled: true}]
  const make = (id: string): CosmosConversationSnapshot => ({id, sessionId: id, sessionLabel: id === "first" ? "Первая" : "Новая беседа", executorId: "actor-executor", executorLabel: "Actor",
    address: "/cosmos/verse-test/atom:2", label: "Atom", history: {revision: 0, total: 0, lastSequence: 0}, pending: [], status: "idle", error: null, permissions: [], version: 0,
    settings: [{id: "model", category: "model", name: "Модель", value: "model", options: [{value: "model", name: "Model"}]}],
    execution: {selection: {}, executorSelection: {}, effective: {connectionId: "one"}, sources: {connectionId: "general"}, connections}})
  let sessions: CosmosConversationSnapshot[] = [{...make("first"), settings: []}]
  const subscribers = new Map<string, (value: CosmosConversationSnapshot) => void>()
  const calls: Array<{action: string; scope: unknown; sessionId?: string; label?: string; selection?: {connectionId?: string}}> = []
  const fetcher = (async (path, init) => {
    expect(path).toBe("/conversations")
    const request = JSON.parse(String(init?.body))
    calls.push(request)
    const current = () => sessions.find(value => value.id === (request.sessionId ?? sessions[0]?.id))!
    let result: unknown
    if (request.action === "list") result = sessions
    else if (request.action === "read") result = current()
    else if (request.action === "prepare") {
      result = {...current(), settings: make(current().id).settings}
      sessions = sessions.map(value => value.id === current().id ? result as CosmosConversationSnapshot : value)
    }
    else if (request.action === "create") {result = make("second"); sessions = [...sessions, result as CosmosConversationSnapshot]}
    else if (request.action === "rename") {result = {...current(), sessionLabel: request.label}; sessions = sessions.map(value => value.id === request.sessionId ? result as CosmosConversationSnapshot : value)}
    else if (request.action === "configureExecution") {
      result = {...current(), status: "running", execution: {...current().execution!, selection: request.selection, effective: {connectionId: request.selection.connectionId}, sources: {connectionId: "session"}}}
      sessions = sessions.map(value => value.id === request.sessionId ? result as CosmosConversationSnapshot : value)
    } else if (request.action === "delete") {sessions = sessions.filter(value => value.id !== request.sessionId); result = null}
    else if (request.action === "displayHistory") result = {chatId: request.sessionId, revision: 0, total: 0, start: 0, items: [], bodies: [], before: null, after: null, rawTotal: 0, projectionRevision: 0}
    else if (request.action === "agent.list") result = []
    else if (request.action === "legacy.read") result = {version: 1, scope, archivedAt: "2026-10-14T00:00:00.000Z",
      source: {root: "old-world", chat: {}, frontier: {}, digest: "a".repeat(64)},
      session: {requests: [], messages: [{requestId: "old", role: "user", content: "Старая реплика"}, {requestId: "old", role: "assistant", content: "Старый ответ"}]}}
    else throw new Error(`Unexpected fixture operation: ${request.action}`)
    return Response.json({ok: true, result})
  }) as typeof fetch
  const client = createCosmosConversationClient(scope, {fetcher, observeConversation(observedScope, id, listener) {
    expect(observedScope).toEqual(scope)
    if (!id) throw new Error("Тест требует точную беседу")
    subscribers.set(id, listener)
    listener(sessions.find(value => value.id === id)!)
    return () => {subscribers.delete(id)}
  }})
  try {
    await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
    const entrypoint = join(import.meta.dir, "cosmos-agent-chat.tsx")
    const agentRoot = resolve(import.meta.dir, "../../../../standard/agent")
    const chatRoot = resolve(dirname(Bun.resolveSync("@zavx0z/chat/composer", agentRoot)), "../../..")
    const preferencesRoot = dirname(Bun.resolveSync("@zavx0z/storybook-chat-preferences", agentRoot))
    const timelineRoot = resolve(dirname(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", agentRoot)), "..")
    const settingsRoot = dirname(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings", import.meta.dir))
    const browserRoot = dirname(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings-browser-preview", import.meta.dir))
    const built = await Bun.build({entrypoints: [entrypoint], outdir: directory, target: "bun", conditions: ["internal:main", "metafor:main"],
      external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
      plugins: [createJsxBunPlugin({cwd: resolve(import.meta.dir, ".."),
        sourceRoots: [import.meta.dir, agentRoot, chatRoot, preferencesRoot, timelineRoot, browserRoot, settingsRoot],
        styleSourceRootIds: ["@internal/visual", "@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-preferences", "@zavx0z/storybook-chat-view", "@zavx0z/storybook-app-web-page-shell-execution-settings-browser-preview", "@zavx0z/storybook-app-web-page-shell-execution-settings"]})]})
    if (!built.success) throw new AggregateError(built.logs, "Cosmos chat entry did not compile")
    const View = (await import(pathToFileURL(join(directory, "cosmos-agent-chat.js")).href)).CosmosAgentChat as DOMComponentConstructor<CosmosAgentChatProps>
    let profile: CosmosAgentChatProps["profile"] = {version: 1, scope, revision: 7, name: "Agent", gender: "male"}
    const portableClient = createCosmosConversationClient(scope, {fetcher})
    const portable = new View(document, {actorScope: scope, client: portableClient, profile, connections, visible: false})
    expect(portable).toBeInstanceOf(HTMLElement)
    if (!(portable instanceof HTMLElement)) throw new Error("Cosmos chat root must be a portable HTMLElement")
    const firstHost = document.createElement("div"), secondHost = document.createElement("div")
    host.append(firstHost, secondHost)
    firstHost.append(portable)
    const child = portable.firstChild
    secondHost.append(portable)
    expect(portable.parentElement).toBe(secondHost)
    expect(portable.firstChild).toBe(child)
    portable.dispose(); firstHost.remove(); secondHost.remove()
    let nativePreparationActive = false
    let providerAccess: CosmosAgentChatProps["providerAccess"]
    let selectedSessionId: string | undefined
    const profileWrites: unknown[] = []
    const onProfileChange: NonNullable<CosmosAgentChatProps["onProfileChange"]> = async update => {
      profileWrites.push(update)
      profile = {...profile, revision: profile.revision + 1, name: update.name, gender: update.gender}
      render()
      return profile
    }
    const render = () => root.render(View, {actorScope: scope, client, profile, connections, providerAccess, onProfileChange, visible: true, nativePreparationActive, selectedSessionId})
    const settle = async () => {for (let i = 0; i < 8; i++) {root.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)}}
    const button = (label: string) => {
      const value = [...host.querySelectorAll("button")].find(value => value.textContent === label || value.getAttribute("aria-label") === label)
      if (!(value instanceof HTMLButtonElement)) throw new Error(`Button absent: ${label}`)
      return value
    }
    render()
    await settle()
    expect(host.querySelector('[data-conversation-id="first"]')).not.toBeNull()
    expect(calls.some(value => value.action === "list")).toBe(true)
    expect(calls.some(value => value.action === "read")).toBe(true)
    expect([...subscribers.keys()]).toEqual(["first"])
    expect(calls.filter(value => value.action === "prepare")).toHaveLength(0)
    button("Настройки агента").click()
    await settle()
    expect(calls.filter(value => value.action === "prepare")).toHaveLength(0)
    button("Настройки агента").click()
    nativePreparationActive = true
    render()
    await settle()
    expect(calls.filter(value => value.action === "prepare")).toHaveLength(1)
    render()
    await settle()
    expect(calls.filter(value => value.action === "prepare")).toHaveLength(1)
    const idleReads = calls.filter(value => value.action === "read").length
    await Bun.sleep(1600)
    await settle()
    expect(calls.filter(value => value.action === "read")).toHaveLength(idleReads)
    button("Новая беседа").click()
    button("Новая беседа").click()
    await settle()
    expect(calls.filter(value => value.action === "create")).toHaveLength(1)
    expect(host.querySelector('[data-conversation-header="second"]')).not.toBeNull()
    const provider = host.querySelector("[data-chat-model-settings] select")
    if (!(provider instanceof HTMLSelectElement)) throw new Error("Public ChatView provider selector is absent")
    provider.value = "two"
    provider.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    expect(calls.find(value => value.action === "configureExecution")).toMatchObject({scope, sessionId: "second", selection: {connectionId: "two"}})
    const runningReads = calls.filter(value => value.action === "read").length
    await Bun.sleep(1600)
    await settle()
    expect(calls.filter(value => value.action === "read")).toHaveLength(runningReads)
    expect([...subscribers.keys()]).toEqual(["second"])
    const pushed: CosmosConversationSnapshot = {...sessions.find(value => value.id === "second")!, status: "idle", sessionLabel: "Ответ получен", version: 1}
    sessions = sessions.map(value => value.id === pushed.id ? pushed : value)
    subscribers.get("second")!(pushed)
    await settle()
    expect(host.textContent).toContain("Ответ получен")
    expect(calls.filter(value => value.action === "read")).toHaveLength(runningReads)
    const rename = host.querySelector('[data-conversation-header="second"] button')
    if (!(rename instanceof HTMLButtonElement)) throw new Error("Public Header rename is absent")
    rename.click()
    await settle()
    const name = host.querySelector("[data-conversation-name-editor] input")
    if (!(name instanceof HTMLInputElement)) throw new Error("Public name editor is absent")
    name.value = "Отдельная беседа"
    name.dispatchEvent(new InputEvent("input", {bubbles: true, data: name.value}))
    await settle()
    button("Сохранить").click()
    await settle()
    expect(calls.find(value => value.action === "rename")).toMatchObject({scope, sessionId: "second", label: "Отдельная беседа"})
    button("Настройки агента").click()
    await settle()
    const profileName = [...host.querySelectorAll("input")].find(value => value instanceof HTMLInputElement && value.value === "Agent")
    if (!(profileName instanceof HTMLInputElement)) throw new Error("Profile name field is absent")
    profileName.value = "Ada"
    profileName.dispatchEvent(new InputEvent("input", {bubbles: true, data: "Ada"}))
    const gender = [...host.querySelectorAll("select")].find(value => value instanceof HTMLSelectElement && value.value === "male")
    if (!(gender instanceof HTMLSelectElement)) throw new Error("Profile gender field is absent")
    gender.value = "female"
    gender.dispatchEvent(new Event("change", {bubbles: true}))
    await settle()
    button("Сохранить настройки агента").click()
    button("Сохранить настройки агента").click()
    await settle()
    expect(profileWrites).toEqual([{expectedRevision: 7, name: "Ada", gender: "female"}])
    selectedSessionId = "first"
    render()
    await settle()
    expect(host.querySelector('[data-conversation-header="first"]')).not.toBeNull()
    button("Отдельная беседа").click()
    await settle()
    expect(host.querySelector('[data-conversation-header="second"]')).not.toBeNull()
    render()
    await settle()
    expect(host.querySelector('[data-conversation-header="second"]')).not.toBeNull()
    expect(calls.every(value => JSON.stringify(value.scope) === JSON.stringify(scope))).toBe(true)
    expect(calls.some(value => value.action === "prompt")).toBe(false)
    expect(host.querySelectorAll("canvas")).toHaveLength(0)
    const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
    const registry = createProviderRegistry([{id: "native-qwen", service: "qwen", host: "ai-srv", remotePeerId: "provider-ai", executorId: "qwen",
      source: {kind: "native-bootstrap", assignmentId: "native-qwen", remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
      capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
    registry.settings = {selectedId: "native-qwen", configuration: {schemaVersion: 1, revision: 1, connections: [{id: "two", label: "Qwen", enabled: true,
      provider: "capsule", peer: {peerId: "provider-ai", executorId: "qwen"}, endpoint: {url: "", profile: "assigned", service: "qwen"}}], general: {connectionId: "two"}, types: {}},
      connectionBindings: {two: "native-qwen"}, connectionChecks: {two: {status: "unknown", checkedAt: 1, message: null}}}
    providerAccess = {atom: null, registries: [{ref: "atom:4", registry}]}
    nativePreparationActive = false
    const authentication: CosmosConversationSnapshot = {...sessions.find(value => value.id === "second")!, status: "idle", settings: [], error: "Требуется авторизация Qwen в назначенном браузере", version: 2}
    sessions = sessions.map(value => value.id === authentication.id ? authentication : value)
    subscribers.get("second")!(authentication)
    render()
    await settle()
    button("Настройки агента").click()
    await settle()
    expect(host.querySelector("[data-provider-browser-login]")).toBeNull()
    const nativePreparations = calls.filter(value => value.action === "prepare").length
    const browserRequests: unknown[] = []
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = Object.assign(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(url).toBe("/agents/browser/bootstrap")
        browserRequests.push(JSON.parse(String(init?.body)))
        return Response.json({error: "Fixture does not open a native browser"}, {status: 409})
      }, {preconnect: originalFetch.preconnect})
      button("Открыть браузер провайдера").click()
      await settle()
      expect(host.querySelectorAll("[data-provider-browser-login]")).toHaveLength(1)
      expect(host.querySelectorAll("[data-browser-preview]")).toHaveLength(1)
      expect(browserRequests).toEqual([{agentRef: null, providerRef: "atom:4", entryId: "native-qwen"}])
      const video = host.querySelector("[data-browser-video]")
      button("Открыть браузер провайдера").click()
      await settle()
      expect(host.querySelector("[data-browser-video]")).toBe(video)
      expect(browserRequests).toHaveLength(1)
      button("Закрыть браузер входа").click()
      await settle()
      expect(host.querySelector("[data-browser-preview]")).toBeNull()
      button("Открыть браузер провайдера").click()
      await settle()
      expect(host.querySelectorAll("[data-browser-preview]")).toHaveLength(1)
      expect(browserRequests).toHaveLength(2)
      expect(calls.filter(value => value.action === "prepare")).toHaveLength(nativePreparations)
      expect(calls.some(value => value.action === "prompt")).toBe(false)
      button("Настройки агента").click()
      await settle()
      button("Настройки агента").click()
      await settle()
      expect(host.querySelector("[data-browser-preview]")).toBeNull()
    } finally {globalThis.fetch = originalFetch}
    button("Архив прежней беседы").click()
    await settle()
    expect(host.querySelector("[data-cosmos-legacy-chat]")).not.toBeNull()
    expect(host.querySelector("[data-chat-compose-region]")).toBeNull()
    expect(host.querySelectorAll("textarea")).toHaveLength(0)
    expect(host.textContent).toContain("Старая реплика")
    expect(calls.some(value => value.action === "prompt")).toBe(false)
    const directoryClient = createCosmosConversationDirectoryClient({fetcher})
    await directoryClient.listAgents({verseId: scope.verseId, atomRef: scope.atomRef})
    expect(calls.at(-1)).toEqual({action: "agent.list", scope: {verseId: scope.verseId, atomRef: scope.atomRef}})
    directoryClient.dispose()
  } finally {root.unmount(); releaseGeometry(); client.dispose(); await rm(directory, {recursive: true, force: true})}
}, 35_000)
