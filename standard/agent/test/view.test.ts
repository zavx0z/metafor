import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, HTMLSelectElement, HTMLTextAreaElement, InputEvent, Event, type DOMComponentConstructor, flushDocumentLayoutObservers} from "@zavx0z/immersive"
import {createDocumentRenderer} from "@zavx0z/immersive/renderer/html"
import {createSpaceElementFactories} from "@zavx0z/immersive/space"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"
import type {AtomContext, AtomViewSnapshot, AtomBrowserConnection, AtomChatMessage} from "../atom"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {DEFAULT_AGENT_PRESENTATION} from "../presentation"
import type {ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"
import type {AtomRef, MetaAddress} from "@metafor/types/metafor/graph"
import type {StorybookChatPreferences} from "@zavx0z/storybook-chat-preferences"

let directory = ""
let View: DOMComponentConstructor<{atom: AtomContext}>
let ProviderPane: DOMComponentConstructor<{atom: AtomContext; active?: boolean}>
let ToolExtension: DOMComponentConstructor<{atom: AtomContext}>
let PreferencesFixture: DOMComponentConstructor<StorybookChatPreferences.Input>
type FixtureAtom = Omit<AtomContext, "actions"> & {actions: {-readonly [Key in keyof AtomContext["actions"]]: AtomContext["actions"][Key]}}
beforeAll(async () => {
  const owner = resolve(import.meta.dir, "..")
  directory = await mkdtemp(join(owner, ".compiled-view-"))
  await symlink(join(owner, "node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({entrypoints: [join(owner, "view.tsx"), join(owner, "provider-pane.tsx"), join(import.meta.dir, "fixture/view.tsx")], outdir: directory, target: "bun", format: "esm", splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
    plugins: [createJsxBunPlugin({cwd: owner, sourceRoots: [owner, resolve(dirname(Bun.resolveSync("@zavx0z/chat/composer", owner)), "../../.."), dirname(Bun.resolveSync("@zavx0z/storybook-chat-preferences", owner)), resolve(dirname(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", owner)), "..")], styleSourceRootIds: ["@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-preferences", "@zavx0z/storybook-chat-view"]})]})
  if (!result.success) throw new AggregateError(result.logs, "Agent view compilation failed")
  View = (await import(pathToFileURL(join(directory, "view.js")).href)).AgentView
  ProviderPane = (await import(pathToFileURL(join(directory, "provider-pane.js")).href)).AgentProviderPane
  ToolExtension = (await import(pathToFileURL(join(directory, "test/fixture/view.js")).href)).ToolExtension
  PreferencesFixture = (await import(pathToFileURL(join(directory, "test/fixture/view.js")).href)).PreferencesFixture
}, 30000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

function fixture(options: Readonly<{sendMessage?(text: string, signal: AbortSignal): Promise<void>; connectBrowser?(entryId: string, signal: AbortSignal): Promise<AtomBrowserConnection>; profileIntent?(request: ProfileIntentRequest, signal: AbortSignal): Promise<void>}> = {}) {
  const ref = "atom:owning" as AtomRef
  let snapshot: AtomViewSnapshot = {ref, revision: "r1", state: "idle", configuration: {
    id: "specialist", atom: {kind: "atom", scope: "owner"}, presentation: DEFAULT_AGENT_PRESENTATION,
    tools: [{kind: "oracle-tool", name: "sensor.read", input: {channel: 3}}, {kind: "oracle-tool", name: "disabled.write", input: null}],
    displays: [{id: "self", source: {kind: "atom", scope: "owner"}}],
  }, chat: [{id: "message-one", role: "assistant", content: "Первый ответ"}],
  provider: {id: "observed-provider", sessionId: "native-one", model: "m1", reasoning: "low",
    models: [{id: "m1", label: "Model 1"}, {id: "m2", label: "Model 2"}], reasoningLevels: [{id: "low", label: "Low"}, {id: "high", label: "High"}]},
  operations: ["sensor.read"], context: {scope: ref, revision: "r1"}}
  const listeners = new Set<() => void>()
  const calls: {ref: AtomRef; operation: string; input: unknown}[] = []
  const atom: FixtureAtom = {ref, getSnapshot() {expect(this).toBe(atom); return snapshot}, subscribe(listener) {expect(this).toBe(atom); listeners.add(listener); return () => {listeners.delete(listener)}}, actions: {
    async connectBrowser(entryId, signal) {if (!options.connectBrowser) throw new Error("Not assigned"); return options.connectBrowser(entryId, signal)},
    async profileIntent(request, signal) {signal.throwIfAborted(); calls.push({ref, operation: "profile-intent", input: request}); await options.profileIntent?.(request, signal)},
    async selectProvider(entryId, signal) {signal.throwIfAborted(); calls.push({ref, operation: "select-provider", input: entryId})},
    async sendMessage(text, signal) {signal.throwIfAborted(); calls.push({ref, operation: "message", input: text}); await options.sendMessage?.(text, signal)},
    async configureProvider(settings, signal) {signal.throwIfAborted(); calls.push({ref, operation: "provider", input: settings})},
    async invokeTool(tool, signal) {signal.throwIfAborted(); calls.push({ref, operation: "tool", input: tool})},
  }}
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html"), body = document.createElement("body"), space = document.createElement("space")
  const firstDisplay = document.createElement("display"), secondDisplay = document.createElement("display")
  document.append(html)
  html.append(body)
  body.append(space)
  space.append(document.createElement("viewpoint"), firstDisplay, secondDisplay)
  for (const display of [firstDisplay, secondDisplay]) {display.setAttribute("width", "1200"); display.setAttribute("height", "800")}
  const root = createDomRoot(firstDisplay)
  firstDisplay.setAttribute("style", "width: 1200px; height: 800px")
  const renderer = createDocumentRenderer({document, root: firstDisplay, viewport: {width: 1200, height: 800}})
  root.render(View, {atom})
  const providerHost = document.createElement("div")
  secondDisplay.append(providerHost)
  const providerRoot = createDomRoot(providerHost)
  const provider = (active: boolean) => { providerRoot.render(ProviderPane, {atom, active})}
  const settle = async () => {for (let index = 0; index < 6; index++) {root.flush(); providerRoot.flush(); renderer.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)} root.flush()}
  const button = (label: string) => [...document.querySelectorAll("button")].find(button => button.textContent === label || button.getAttribute("aria-label") === label) as HTMLButtonElement
  return {document, space, firstDisplay, secondDisplay, root: {flush: root.flush, render: root.render, unmount() {providerRoot.unmount(); root.unmount(); renderer.dispose()}}, atom, calls, listeners, settle, button, provider,
    snapshot: () => snapshot,
    publish(next: AtomViewSnapshot) {snapshot = next; for (const listener of listeners) listener()}}
}

test("compiled default Agent view монтируется в тот же Document/Space, callbacks принадлежат explicit Atom", async () => {
  const f = fixture()
  try {
    await f.settle()
    expect(f.document.querySelectorAll("space")).toHaveLength(1)
    expect(f.document.querySelectorAll("canvas")).toHaveLength(0)
    expect(f.document.querySelectorAll('[role="tab"]')).toHaveLength(0)
    expect(f.document.querySelector('[role="tabpanel"][aria-label="Беседа"]')?.hasAttribute("hidden")).toBe(false)
    const original = f.document.querySelector('[data-chat-message="message-one"]')
    expect(original?.textContent).toContain("Первый ответ")
    const input = f.document.querySelector('textarea[aria-label="Сообщение"]') as HTMLTextAreaElement
    input.value = "Задача человеку и агенту"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    f.button("Отправить").click()
    await f.settle()
    expect(f.calls).toEqual([{ref: f.atom.ref, operation: "message", input: "Задача человеку и агенту"}])
    expect(f.snapshot().chat).toHaveLength(1)
    const next = {...f.snapshot(), revision: "r2", chat: [...f.snapshot().chat, {id: "message-two", role: "user" as const, content: "Наблюдаемый turn"}]}
    f.publish(next)
    await f.settle()
    expect(f.document.querySelector('[data-chat-message="message-one"]')).toBe(original)
    expect(f.document.querySelector('[data-chat-message="message-two"]')?.textContent).toContain("Наблюдаемый turn")
    const view = f.document.querySelector(`[data-agent-atom="${f.atom.ref}"]`)!
    f.secondDisplay.append(view)
    await f.settle()
    expect(view.ownerDocument).toBe(f.document)
    expect(view.parentElement).toBe(f.secondDisplay)
    expect(f.document.querySelectorAll("space")).toHaveLength(1)
  } finally {f.root.unmount()}
  expect(f.listeners.size).toBe(0)
})

test("temporary transport unavailability keeps the same editable draft and disables only submission", async () => {
  const f = fixture()
  try {
    await f.settle()
    const input = f.document.querySelector("textarea") as HTMLTextAreaElement
    input.value = "Черновик до обновления"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    const send = f.atom.actions.sendMessage!
    delete f.atom.actions.sendMessage
    f.publish({...f.snapshot(), revision: "offline"})
    await f.settle()
    expect(f.document.querySelector("textarea")).toBe(input)
    expect(input.value).toBe("Черновик до обновления")
    expect(input.disabled).toBe(false)
    expect(f.button("Отправить").disabled).toBe(true)
    input.value += " и во время задержки"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    f.atom.actions.sendMessage = send
    f.publish({...f.snapshot(), revision: "recovered"})
    await f.settle()
    expect(f.document.querySelector("textarea")).toBe(input)
    expect(input.value).toBe("Черновик до обновления и во время задержки")
    expect(f.button("Отправить").disabled).toBe(false)
    expect(f.calls).toEqual([])
  } finally {f.root.unmount()}
})

test("development mode uses its assigned callback and retains the draft if that capability disappears", async () => {
  const f = fixture()
  f.atom.actions.runDevelopment = async text => {f.calls.push({ref: f.atom.ref, operation: "development", input: text})}
  try {
    f.publish({...f.snapshot(), revision: "development-assigned"})
    await f.settle()
    const mode = f.document.querySelector("select") as HTMLSelectElement
    mode.value = "development"
    mode.dispatchEvent(new Event("change", {bubbles: true}))
    const input = f.document.querySelector("textarea") as HTMLTextAreaElement
    input.value = "Проверь инструменты среды"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    const action = f.atom.actions.runDevelopment
    delete f.atom.actions.runDevelopment
    f.publish({...f.snapshot(), revision: "development-unavailable"})
    await f.settle()
    expect(f.button("Отправить").disabled).toBe(true)
    expect(input.value).toBe("Проверь инструменты среды")
    f.atom.actions.runDevelopment = action
    f.publish({...f.snapshot(), revision: "development-restored"})
    await f.settle()
    f.button("Отправить").click()
    await f.settle()
    expect(f.calls).toEqual([{ref: f.atom.ref, operation: "development", input: "Проверь инструменты среды"}])
  } finally {f.root.unmount()}
})

test("provider настройки и generic tools используют назначенные callbacks, а не локальные canonical записи", async () => {
  const f = fixture()
  try {
    await f.settle()
    f.provider(true)
    await f.settle()
    expect(f.document.querySelector('section[aria-label="Настройки провайдера Atom"]')).not.toBeNull()
    const provider = f.document.querySelector('[aria-label="Настройки провайдера Atom"]')!
    const model = provider.querySelectorAll("select")[1] as HTMLSelectElement
    const reasoning = provider.querySelectorAll("select")[2] as HTMLSelectElement
    model.value = "m2"
    model.dispatchEvent(new Event("change", {bubbles: true}))
    reasoning.value = "high"
    reasoning.dispatchEvent(new Event("change", {bubbles: true}))
    await f.settle()
    f.button("Применить настройки").click()
    await f.settle()
    expect(f.calls[0]).toEqual({ref: f.atom.ref, operation: "provider", input: {model: "m2", reasoning: "high"}})
    expect(f.snapshot().provider?.model).toBe("m1")
    f.button("Инструменты").click()
    await f.settle()
    expect(f.button("Вызвать disabled.write").disabled).toBe(true)
    f.button("Вызвать sensor.read").click()
    await f.settle()
    expect(f.calls[1]).toEqual({ref: f.atom.ref, operation: "tool", input: f.snapshot().configuration.tools[0]})
    f.button("Контекст").click()
    await f.settle()
    expect(f.document.querySelector('pre[aria-label="Разрешённый контекст Atom"]')?.textContent).toContain("atom:owning")
    expect(f.snapshot().configuration.displays).toEqual([{id: "self", source: {kind: "atom", scope: "owner"}}])
  } finally {f.root.unmount()}
})

test("named tools slot принимает compiled component и сохраняет его identity/state при смене tab и snapshot", async () => {
  const f = fixture()
  const content = {tools: {type: ToolExtension, props: {atom: f.atom}, key: "extension"}}
  try {
    f.root.render(View, {atom: f.atom}, {content})
    await f.settle()
    expect(View.slots).toEqual(["chat", "tools", "context"])
    expect(f.document.querySelector('[data-chat-message="message-one"]')?.textContent).toContain("Первый ответ")
    f.button("Инструменты").click()
    await f.settle()
    const extension = f.document.querySelector('[data-tools-extension="atom:owning"]') as HTMLButtonElement
    expect(extension.textContent).toBe("r1:0")
    expect([...f.document.querySelectorAll('button')].some(button => button.textContent === "Вызвать sensor.read")).toBe(false)
    extension.click()
    await f.settle()
    expect(extension.textContent).toBe("r1:1")
    f.button("Беседа").click()
    f.publish({...f.snapshot(), revision: "r2"})
    await f.settle()
    f.button("Инструменты").click()
    await f.settle()
    expect(f.document.querySelector('[data-tools-extension="atom:owning"]')).toBe(extension)
    expect(extension.textContent).toBe("r2:1")
    expect(f.snapshot().configuration.tools).toHaveLength(2)
    expect(f.calls).toEqual([])
  } finally {f.root.unmount()}
  expect(f.listeners.size).toBe(0)
})

test("смена owning Atom отменяет прежнее UI ожидание и не оставляет busy или чужой draft", async () => {
  const pending = Promise.withResolvers<void>()
  let previousSignal: AbortSignal | undefined
  const f = fixture({async sendMessage(_text, signal) {previousSignal = signal; await pending.promise}})
  try {
    await f.settle()
    const input = f.document.querySelector("textarea") as HTMLTextAreaElement
    input.value = "Old task"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    f.button("Отправить").click()
    await f.settle()
    expect(f.button("Отправить").disabled).toBe(true)
    const ref = "atom:replacement" as AtomRef
    const snapshot = {...f.snapshot(), ref, configuration: {...f.snapshot().configuration, id: "replacement"}}
    const replacement: AtomContext = {ref, getSnapshot: () => snapshot, subscribe: () => () => {}, actions: {async sendMessage() {}}}
    f.root.render(View, {atom: replacement})
    await f.settle()
    expect(previousSignal?.aborted).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.value).toBe("")
    input.value = "New draft"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    pending.resolve()
    await f.settle()
    expect(input.value).toBe("New draft")
    expect(f.document.querySelector(`[data-agent-atom="${ref}"]`)).not.toBeNull()
    expect(f.listeners.size).toBe(0)
  } finally {pending.resolve(); f.root.unmount()}
})


test("compiled Provider connections select the assigned executor, keep retained video on same-Document move, and release a late grant on tab close", async () => {
  let requested: AbortSignal | undefined
  let finish!: (value: AtomBrowserConnection) => void
  let closed = 0
  const f = fixture({connectBrowser: async (_entryId, signal) => {
    requested = signal
    return await new Promise(resolve => {finish = resolve})
  }})
  const registry = createProviderRegistry()
  const entry = {id: "assigned-browser", service: "capsule", host: "remote", remotePeerId: "peer:remote", executorId: "browser:assigned",
    source: {kind: "native-bootstrap" as const, assignmentId: "one", remoteGraph: "unknown" as const}, resolution: "exact" as const,
    connection: "connected" as const, capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown" as const, checkedAt: null, message: null}}
  registry.entries.push(entry)
  try {
    f.publish({...f.snapshot(), providers: {ref: "atom:provider" as AtomRef, registry}, providerBinding: {id: null, locked: false}})
    await f.settle()
    f.provider(true)
    await f.settle()
    const providerSelect = f.document.querySelector('[data-execution-preferences] select') as HTMLSelectElement
    providerSelect.value = entry.id
    providerSelect.dispatchEvent(new Event("change", {bubbles: true}))
    await f.settle()
    expect(f.calls.at(-1)).toEqual({ref: f.atom.ref, operation: "select-provider", input: entry.id})
    const video = f.document.querySelector('video[aria-label="WebRTC браузер Provider"]')!
    f.button("Браузер").click()
    await f.settle()
    f.button("Открыть просмотр").click()
    await f.settle()
    expect(requested?.aborted).toBe(false)
    f.secondDisplay.append(f.document.querySelector(`[data-agent-atom="${f.atom.ref}"]`)!)
    await f.settle()
    expect(f.document.querySelector('video[aria-label="WebRTC браузер Provider"]')).toBe(video)
    expect(requested?.aborted).toBe(false)
    f.provider(false)
    await f.settle()
    expect(requested?.aborted).toBe(true)
    finish({binding: entry, iceServers: [], client: {async describe() {throw new Error("must not run")}, socket() {throw new Error("must not run")}, async close() {closed++}}})
    await f.settle()
    expect(closed).toBe(1)
    f.publish({...f.snapshot(), providerBinding: {id: entry.id, locked: true}})
    f.provider(true)
    await f.settle()
    expect((f.document.querySelector('[data-execution-preferences] select') as HTMLSelectElement).disabled).toBe(true)
    expect(f.document.querySelector('section[aria-label="Подключения Provider"]')?.textContent).not.toContain("peer:remote")
  } finally {f.root.unmount()}
})


test("compiled profile Save addresses the assigned owning Root and reports admission without inventing completion", async () => {
  let accept!: () => void
  let previewSignal: AbortSignal | undefined
  const late = Promise.withResolvers<AtomBrowserConnection>()
  const f = fixture({profileIntent: () => new Promise(resolve => {accept = resolve}), connectBrowser: async (_entry, signal) => {previewSignal = signal; return late.promise}})
  const target = {worldIdentity: {peerId: "leader", root: "intel-macos-chrome-studio" as MetaAddress, cutId: "cut-one"}, atomRef: "atom:root" as AtomRef,
    meta: "intel-macos-chrome-studio" as MetaAddress, expectedProfile: {name: "saved-rtc", saveId: "save-one"}, supportedOperations: ["profile.open", "profile.save"] as ("profile.open" | "profile.save")[], state: "ready", available: true}
  try {
    const registry = createProviderRegistry()
    registry.entries.push({id: "preview", service: "capsule", host: "remote", remotePeerId: "remote", executorId: "browser", source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: null, message: null}})
    f.publish({...f.snapshot(), profileTargets: [target], providers: {ref: "atom:provider" as AtomRef, registry}})
    await f.settle()
    f.provider(true)
    await f.settle()
    f.button("Браузер").click()
    await f.settle()
    f.button("Открыть просмотр").click()
    await f.settle()
    expect(previewSignal?.aborted).toBe(false)
    f.button("Сохранить профиль").click()
    await f.settle()
    expect(f.button("Сохранить профиль").disabled).toBe(true)
    expect(f.calls.at(-1)?.input).toMatchObject({operation: "profile.save", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile})
    expect(f.snapshot().profileTargets?.[0]?.state).toBe("ready")
    expect(previewSignal?.aborted).toBe(false)
    accept()
    await f.settle()
    const panel = f.document.querySelector('section[aria-label="Сохранённые профили браузера"]')!
    expect(panel.textContent).toContain("Намерение принято")
    expect(panel.textContent).not.toContain("Сохранено")
    f.button("Открыть профиль").click()
    await f.settle()
    expect(previewSignal?.aborted).toBe(true)
    accept()
  } finally {
    late.resolve({binding: {id: "preview", service: "capsule", host: "remote", remotePeerId: "remote", executorId: "browser"}, iceServers: [], client: {async describe() {throw new Error("Closed preview")}, socket() {throw new Error("Closed preview")}, async close() {}}})
    await f.settle()
    f.root.unmount()
  }
})


test("public shared Chat renders Markdown and Inspector categories without an embedded provider tab", async () => {
  const f = fixture()
  try {
    f.publish({...f.snapshot(), chat: [{id: "markdown", role: "assistant", content: "Ответ **жирный**"}]})
    await f.settle()
    expect(f.document.querySelector('aside[aria-label="Инспектор Agent"]')).not.toBeNull()
    expect(f.document.querySelector("[data-conversation-surface]")).not.toBeNull()
    expect(f.document.querySelector("[data-chat-composer]")).not.toBeNull()
    expect(f.document.querySelector('textarea[aria-label="Сообщение"]')).not.toBeNull()
    expect(f.document.querySelector('[data-chat-message="markdown"] strong')?.textContent).toBe("жирный")
    expect([...f.document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Провайдер")).toBe(false)
  } finally {f.root.unmount()}
})

test("ready Storybook Preferences keeps its default four fields and exposes only granted fields in the MetaFor subset", async () => {
  const f = fixture(), changes: unknown[] = []
  const props: StorybookChatPreferences.Input = {selection: {connectionId: "assigned", model: "actual"},
    connections: [{id: "assigned", label: "Подключение", enabled: true}], settings: [{id: "model", category: "model", name: "Модель", value: "actual", options: [{value: "actual", name: "Наблюдаемая модель"}]}], onChange(value) {changes.push(value)}}
  try {
    f.root.render(PreferencesFixture, props)
    await f.settle()
    expect(f.firstDisplay.querySelectorAll("select")).toHaveLength(4)
    expect(f.firstDisplay.textContent).toContain("Подтверждения")
    f.root.render(PreferencesFixture, {...props, fields: ["connectionId", "model", "thoughtLevel"], disabledFields: ["connectionId"]})
    await f.settle()
    const selects = f.firstDisplay.querySelectorAll("select") as unknown as HTMLSelectElement[]
    expect(selects).toHaveLength(3)
    expect(selects[0]!.disabled).toBeTrue()
    expect(selects[1]!.disabled).toBeFalse()
    expect(selects[2]!.disabled).toBeTrue()
    expect(f.firstDisplay.textContent).not.toContain("Подтверждения")
    expect(f.firstDisplay.textContent).not.toContain("Автоматическая проверка")
    selects[1]!.value = ""
    selects[1]!.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes).toEqual([{connectionId: "assigned"}])
    expect(f.calls).toEqual([])
  } finally {f.root.unmount()}
})

test("ready Storybook tool card folds actual code/output, preserves row and draft through result update, and releases collapsed details", async () => {
  const f = fixture()
  const call: AtomChatMessage = {id: "tool-one", role: "assistant", content: "bun.evaluate", tool: {id: "decision:one", name: "bun.evaluate", status: "pending", input: {code: "const proof = 40 + 2; proof"}, correlation: {modelRequestId: "model-one", taskId: "task", step: 1}}}
  try {
    f.publish({...f.snapshot(), chat: [{id: "human-one", role: "user", content: "Проверь результат"}, call, {id: "service-one", role: "service", content: "Аннотация интерфейса"}]})
    await f.settle()
    const human = f.document.querySelector('[data-chat-message="human-one"]'), row = f.document.querySelector('[data-chat-entry="tool-one"]')
    expect(row).not.toBeNull()
    expect(row?.querySelector("[data-chat-details]")).toBeNull()
    expect(f.firstDisplay.textContent).not.toContain("const proof")
    const draft = f.document.querySelector('textarea[aria-label="Сообщение"]') as HTMLTextAreaElement
    draft.value = "Сохранённый draft"; draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    f.button("bun.evaluate · Ожидание").click()
    await f.settle()
    expect(row?.querySelector('[data-chat-data="Аргументы"]')).not.toBeNull()
    const complete: AtomChatMessage = {...call, tool: {...call.tool!, status: "completed", output: {operation: "bun.evaluate", state: "completed", result: "42", stdout: "observed stdout", stderr: ""}, correlation: {...call.tool!.correlation, resultRequestId: "model-two"}}}
    f.publish({...f.snapshot(), chat: [{id: "human-one", role: "user", content: "Проверь результат"}, complete, {id: "service-one", role: "service", content: "Аннотация интерфейса"}]})
    await f.settle()
    expect(f.document.querySelector('[data-chat-entry="tool-one"]')).toBe(row)
    expect(f.document.querySelector('[data-chat-message="human-one"]')).toBe(human)
    expect(row?.querySelector('[data-chat-terminal-stream="stdout"]')).not.toBeNull()
    expect(row?.textContent).toContain("42")
    expect(row?.textContent).toContain("observed stdout")
    expect(f.button("bun.evaluate · Готово")).toBeDefined()
    expect(draft.value).toBe("Сохранённый draft")
    f.button("bun.evaluate · Готово").click()
    await f.settle()
    expect(row?.querySelector("[data-chat-details]")).toBeNull()
    expect(row?.querySelector("[data-code-editor]")).toBeNull()
    expect(f.document.querySelector('[data-chat-message="service-one"]')?.getAttribute("data-chat-role")).toBe("system")
    expect(f.calls).toEqual([])
  } finally {f.root.unmount()}
})
