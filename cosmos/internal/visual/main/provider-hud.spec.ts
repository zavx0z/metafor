import {expect, test, beforeAll, afterAll} from "bun:test"
import {mkdtemp, symlink, rm} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, type DOMComponentConstructor} from "@zavx0z/immersive"
import {createSpaceElementFactories} from "@zavx0z/immersive/space"
import plugin from "../build/template.plugin"

let compiledDirectory = ""
let compiledHUD: typeof import("./provider-hud")
beforeAll(async () => {
  compiledDirectory = await mkdtemp(join(import.meta.dir, ".compiled-provider-hud-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(compiledDirectory, "node_modules"), "dir")
  const built = await Bun.build({entrypoints: [join(import.meta.dir, "provider-hud.tsx")], outdir: compiledDirectory, target: "bun", conditions: ["metafor:main"],
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [plugin]})
  if (!built.success) throw new AggregateError(built.logs, "Provider HUD did not compile")
  compiledHUD = await import(pathToFileURL(join(compiledDirectory, "provider-hud.js")).href)
}, 30000)
afterAll(async () => {if (compiledDirectory) await rm(compiledDirectory, {recursive: true, force: true})})

test("public provider HUD keeps one Document, uses shared Window/Settings/dock and performs no implicit environment action", async () => {
  const HUD = compiledHUD.ProviderHUD as unknown as DOMComponentConstructor<{atom: null; open: boolean; onOpenChange(open: boolean): void}>
    const document = createDocument({elementFactories: createSpaceElementFactories()})
    const html = document.createElement("html"), body = document.createElement("body"), space = document.createElement("space"), hud = document.createElement("hud")
    document.append(html); html.append(body); body.append(space); space.append(hud)
    const root = createDomRoot(hud)
    let open = false
    const render = () => root.render(HUD, {atom: null, open, onOpenChange(value) {open = value; render()}})
    try {
      render(); root.flush(); await Bun.sleep(0); root.flush()
      const button = [...document.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === "Настройки") as HTMLButtonElement
      expect(button).toBeDefined()
      button.click(); root.flush(); await Bun.sleep(0); root.flush()
      expect(open).toBe(true)
      expect(document.querySelectorAll("hud")).toHaveLength(1)
      expect(document.querySelectorAll("canvas")).toHaveLength(0)
      expect(document.getElementById("storybook-execution-settings")?.textContent).toContain("Модели по умолчанию")
      expect(document.getElementById("storybook-execution-settings")?.textContent).toContain("Реестр Provider ещё не получен")
    } finally {root.unmount()}
}, 30000)

test("ExecutionSettings adapter saves complete CRUD drafts through Provider, restores Mass and checks assigned connections without model turns", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const {default: discover} = await import("../../../../standard/provider/discover")
  const originalFetch = globalThis.fetch
  try {
    const {createProviderSettingsClient} = compiledHUD
    let registry = createProviderRegistry(), probes = 0
    const requests: Array<{providerRef: string; configure?: unknown; check?: string}> = []
    globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(input).toBe("/agents/connections")
      const operation = JSON.parse(String(init?.body))
      requests.push(operation)
      expect(operation.providerRef).toBe("atom:4")
      const result = await discover({request: JSON.stringify({id: `ui-${requests.length}`, ...(operation.configure ? {configure: operation.configure} : {check: operation.check})}), signal: init!.signal!,
        mass: {registry: {async readText() {return JSON.stringify(registry)}, async write(value) {registry = value as typeof registry}}},
        resolveConnection: async () => ({id: "assigned", service: "codex", host: "server", remotePeerId: "peer", executorId: "codex"}),
        registrationCheck: async () => {probes++; return {connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: 1, message: "Admission only"}}}})
      return Response.json(result.discoveryError ? {error: {message: result.discoveryError}} : {ref: "atom:4", registry}, {status: result.discoveryError ? 409 : 200})
    }, {preconnect: originalFetch.preconnect}) as typeof fetch
    const props = () => ({atom: null, open: true, onOpenChange() {}, registries: [{ref: "atom:4" as const, registry}]})
    const client = createProviderSettingsClient(props, new AbortController().signal)
    const empty = await client.read()
    expect(requests).toHaveLength(0)
    const draft = {...empty, connections: [{id: "user-connection", label: "Рабочий Codex", enabled: true, provider: "codex" as const, peer: {peerId: "peer", executorId: "codex"}}], general: {connectionId: "user-connection"}, types: {Component: {model: "model-a"}}}
    const saved = await client.save(draft)
    expect(saved).toEqual({...draft, revision: 1})
    expect(requests[0]).toEqual({providerRef: "atom:4", configure: draft})
    expect(probes).toBe(0)
    expect(await client.options("user-connection")).toEqual([])
    expect(probes).toBe(1)
    expect((await client.read()).revision).toBe(1)
    const restored = createProviderSettingsClient(props, new AbortController().signal)
    expect(await restored.read()).toEqual(saved)
    const renamed = await restored.save({...saved, connections: [{...saved.connections[0]!, label: "Переименованное"}]})
    expect(renamed.connections[0]?.label).toBe("Переименованное")
    expect(probes).toBe(1)
    const removed = await restored.save({...renamed, connections: [], general: {}, types: {}})
    expect(removed.connections).toEqual([])
    await expect(restored.options("user-connection")).rejects.toThrow("удалено")
    expect(requests).toHaveLength(4)
  } finally {globalThis.fetch = originalFetch}
}, 30000)

test("shared settings HUD prepares real model and reasoning catalog for the existing browser Chat without a prompt", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const binding = {id: "codespace-chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "peer", executorId: "browser"}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const originalFetch = globalThis.fetch
  let prepared = 0, requests = 0
  let provider = {id: "chatgpt", sessionId: "browser-native", model: null as string | null, reasoning: null as string | null, models: [] as Array<{id: string; label: string}>, reasoningLevels: [] as Array<{id: string; label: string}>}
  const atom = {ref: "atom:13", getSnapshot: () => ({provider, providerBinding: {id: binding.id, locked: true}, providers: {ref: "atom:4", registry}}), actions: {
    async prepareProviderSettings(signal: AbortSignal) {
      signal.throwIfAborted()
      prepared++
      provider = {...provider, model: "native-model", reasoning: "high", models: [{id: "native-model", label: "Native model"}], reasoningLevels: [{id: "high", label: "High"}]}
    },
  }} as unknown as import("@metafor/agent/atom").AtomContext
  try {
    globalThis.fetch = Object.assign(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("/agents/connections")
      expect(JSON.parse(String(init?.body))).toEqual({providerRef: "atom:4", check: binding.id})
      requests++
      return Response.json({ref: "atom:4", registry})
    }, {preconnect: originalFetch.preconnect}) as typeof fetch
    let selectedAtom: import("@metafor/agent/atom").AtomContext | null = null
    const client = compiledHUD.createProviderSettingsClient(() => ({atom: selectedAtom, open: true, onOpenChange() {}}), new AbortController().signal)
    selectedAtom = atom
    expect(await client.options(binding.id)).toEqual([
      {id: "model", category: "model", name: "Модель", value: "native-model", options: [{value: "native-model", name: "Native model"}]},
      {id: "reasoning", category: "thought_level", name: "Мышление", value: "high", options: [{value: "high", name: "High"}]},
    ])
    expect(prepared).toBe(1)
    expect(requests).toBe(1)
    expect(provider.sessionId).toBe("browser-native")
  } finally {globalThis.fetch = originalFetch}
})

test("HUD passes an explicit PNG capability with the exact browser ticket/profile and omits it when unavailable", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const binding = {id: "codespace-chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "peer", executorId: "browser"}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const originalFetch = globalThis.fetch
  try {
    for (const screenshotProvider of [true, false]) {
      const scope = new AbortController(), viewerScope = new AbortController()
      const requests: unknown[] = []
      globalThis.fetch = Object.assign(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(url).toBe("/agents/browser/bootstrap")
        if (init?.method === "POST") requests.push(JSON.parse(String(init.body)))
        return Response.json({ticket: "grant-1", description: {instanceId: "instance-1", profile: "assigned-profile", controlEnabled: true}, iceServers: [], screenshotProvider})
      }, {preconnect: originalFetch.preconnect}) as typeof fetch
      const client = compiledHUD.createProviderSettingsClient(() => ({atom: null, open: true, onOpenChange() {}, registries: [{ref: "atom:4", registry}]}), scope.signal)
      const descriptor = await client.openBrowserViewer(binding.id, viewerScope.signal)
      expect(requests).toEqual([{agentRef: null, providerRef: "atom:4", entryId: binding.id}])
      expect(descriptor).toMatchObject({instanceId: "instance-1", profile: "assigned-profile", socketPath: "/agents/browser/socket?ticket=grant-1&instanceId=instance-1"})
      expect(descriptor.screenshotSocketPath).toBe(screenshotProvider ? "/agents/browser/screenshot?ticket=grant-1&instanceId=instance-1&profile=assigned-profile" : undefined)
      viewerScope.abort()
    }
  } finally {globalThis.fetch = originalFetch}
}, 30000)

test("HUD renews only its owned browser ticket, validates the receipt and aborts the HTTP request without creating another viewer", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const binding = {id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "peer", executorId: "browser"}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const originalFetch = globalThis.fetch
  const scope = new AbortController(), viewerScope = new AbortController()
  let opens = 0, renews = 0, closes = 0, wrongTicket = false, pending = false
  let pendingSignal: AbortSignal | null | undefined
  try {
    globalThis.fetch = Object.assign(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (init?.method === "DELETE") {closes++; return new Response(null, {status: 204})}
      if (url === "/agents/browser/bootstrap") {opens++; return Response.json({ticket: "owned-grant", description: {instanceId: "instance", profile: "profile", controlEnabled: true}, iceServers: []})}
      expect(url).toBe("/agents/browser/renew")
      expect(JSON.parse(String(init?.body))).toEqual({ticket: "owned-grant"})
      renews++
      if (pending) {
        pendingSignal = init?.signal
        await new Promise<void>((_resolve, reject) => {init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), {once: true})})
      }
      return Response.json({schema: "cosmos:agents/browser-renewal/v1", version: 1, ticket: wrongTicket ? "another-grant" : "owned-grant", expiresAt: Date.now() + 900000})
    }, {preconnect: originalFetch.preconnect}) as typeof fetch
    const client = compiledHUD.createProviderSettingsClient(() => ({atom: null, open: true, onOpenChange() {}, registries: [{ref: "atom:4", registry}]}), scope.signal)
    const descriptor = await client.openBrowserViewer(binding.id, viewerScope.signal)
    await client.renewBrowserViewer!(descriptor, viewerScope.signal)
    wrongTicket = true
    await expect(client.renewBrowserViewer!(descriptor, viewerScope.signal)).rejects.toThrow("неверное продление")
    wrongTicket = false
    pending = true
    const renewScope = new AbortController()
    const renewing = client.renewBrowserViewer!(descriptor, renewScope.signal)
    await Bun.sleep(0)
    renewScope.abort(new Error("Renewal cancelled"))
    await expect(renewing).rejects.toThrow("Renewal cancelled")
    expect(pendingSignal?.aborted).toBe(true)
    expect(opens).toBe(1)
    expect(renews).toBe(3)
    viewerScope.abort()
    scope.abort()
    await Bun.sleep(0)
    expect(closes).toBe(1)
    await expect(client.renewBrowserViewer!(descriptor, new AbortController().signal)).rejects.toBeDefined()
    expect(renews).toBe(3)
  } finally {viewerScope.abort(); scope.abort(); globalThis.fetch = originalFetch}
}, 30000)

test("Ollama HUD retains the assigned server and requests real per-model options without an Agent session or invented thinking levels", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const binding = {id: "native-ollama", service: "ollama", host: "native", remotePeerId: "native", executorId: "ollama"}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  registry.revision = 1
  registry.settings = {selectedId: binding.id, configuration: {schemaVersion: 1, revision: 1,
    connections: [{id: "my-ollama", label: "Assigned server", enabled: true, provider: "ollama", endpoint: {url: "http://127.0.0.1:11434"}}], general: {connectionId: "my-ollama"}, types: {}},
    connectionBindings: {"my-ollama": binding.id}, connectionChecks: {"my-ollama": {status: "unknown", checkedAt: 1, message: null}}}
  const originalFetch = globalThis.fetch
  const requests: any[] = []
  let unavailable = false
  try {
    globalThis.fetch = Object.assign(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(url).toBe("/agents/connections")
      const input = JSON.parse(String(init?.body))
      requests.push(input)
      expect(input.providerRef).toBe("atom:4")
      if (input.check) return Response.json({ref: "atom:4", registry})
      if (unavailable) return Response.json({error: {message: "Assigned Ollama is unavailable"}}, {status: 409})
      return Response.json({ref: "atom:4", registry, options: {model: input.options.model, reasoning: input.options.model === "fixture-a" ? "low" : null,
        models: [{id: "fixture-a", label: "Fixture installed A"}, {id: "fixture-b", label: "Fixture installed B"}],
        reasoningLevels: input.options.model === "fixture-a" ? [{id: "low", label: "Low"}, {id: "high", label: "High"}] : []}})
    }, {preconnect: originalFetch.preconnect}) as typeof fetch
    const client = compiledHUD.createProviderSettingsClient(() => ({atom: null, open: true, onOpenChange() {}, registries: [{ref: "atom:4", registry}]}), new AbortController().signal)
    expect((await client.read()).connections).toEqual(registry.settings.configuration!.connections)
    expect(await client.options("my-ollama", "fixture-a")).toEqual([
      {id: "model", category: "model", name: "Модель", value: "fixture-a", options: [{value: "fixture-a", name: "Fixture installed A"}, {value: "fixture-b", name: "Fixture installed B"}]},
      {id: "reasoning", category: "thought_level", name: "Мышление", value: "low", options: [{value: "low", name: "Low"}, {value: "high", name: "High"}]},
    ])
    expect(requests[1]).toEqual({providerRef: "atom:4", options: {connectionId: "my-ollama", model: "fixture-a"}})
    expect(await client.options("my-ollama", "fixture-b")).toHaveLength(1)
    unavailable = true
    await expect(client.options("my-ollama", "fixture-a")).rejects.toThrow("unavailable")
    expect(requests.every(row => !row.agentRef && !row.task && !row.prompt)).toBe(true)
  } finally {globalThis.fetch = originalFetch}
}, 30000)
