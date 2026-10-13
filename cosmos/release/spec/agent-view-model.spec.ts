import {expect, spyOn, test} from "bun:test"
import {createAgentWorkspace} from "../main/agents"
import {AGENT_UI_SCHEMA, AGENT_UI_TASK_SCHEMA, type AgentUiSnapshot} from "../shared/agents"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

const configuration = {id: "assistant", atom: {kind: "atom", scope: "owner"},
  presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
  tools: [{kind: "oracle-tool", name: "scenario.run", input: {scenario: "agent-system.integrity"}}], displays: []}
function fixture(provider = "chatgpt"): AgentUiSnapshot {
  return {schema: AGENT_UI_SCHEMA, version: 1, root: "@metafor/environment", graph: agentWorkspaceGraph(), verseId: "assigned-verse",
    observedWorld: {root: "@metafor/environment", cutId: "cut"}, revision: {cutId: "cut", throughSequence: 5, retroactiveComplete: false},
    observation: {mechanism: "public-oracle-poll", photonSubscription: false}, providerRegistries: [], providerRegistryErrors: [], agents: [{ref: "atom:2", meta: "@metafor/agent", owner: {ref: "atom:1", meta: "@metafor/environment"},
      state: "done", status: "completed", configuration: {resolution: "exact", value: configuration, issues: []},
      chat: {ref: "atom:3", meta: "@metafor/chat", session: null}, issues: [], error: null, activeTaskId: "previous", busy: false, chatError: null,
      chatSession: {contractVersion: 1, resolution: "exact", frontier: {cutId: "cut", throughSequence: 5, retroactiveComplete: false},
        atom: {root: "@metafor/environment", ref: "atom:3", meta: "@metafor/chat"}, key: "session", digest: `sha256:${"a".repeat(64)}`, bytes: 100,
        content: {format: "json", present: true, value: {version: 1, provider, sessionId: "native-session", requests: [], messages: []}}},
    }]} as unknown as AgentUiSnapshot
}
const session = (snapshot: AgentUiSnapshot) => {
  const content = snapshot.agents[0]!.chatSession!.content
  if (content.format !== "json" || !content.present) throw new Error("Missing JSON")
  return content.value as {requests: Array<{id: string; prompt: string}>; messages: Array<{requestId: string; role: string; content: string}>}
}
function host(data = fixture()) {
  const calls: Array<{method: string; input: unknown; signal: AbortSignal | undefined | null}> = []
  let latest = data
  let failure = false
  let admission: "ok" | "busy" | "conflict" = "ok"
  const model = createAgentWorkspace({taskId: () => "new-task", fetch: async (_url, init) => {
    const method = init?.method ?? "GET"
    const input: unknown = init?.body ? JSON.parse(init.body as string) : null
    calls.push({method, input, signal: init?.signal})
    if (method === "GET") return failure ? Response.json({error: {code: "world_unavailable", message: "Offline"}}, {status: 503}) : Response.json(latest)
    if (admission !== "ok") return Response.json({error: {code: admission, message: admission}}, {status: 409})
    const request = input as {agentRef: string; task: {id: string}}
    return Response.json({schema: AGENT_UI_TASK_SCHEMA, version: 1, agentRef: request.agentRef, taskId: request.task.id, receipt: {}}, {status: 202})
  }})
  return {model, calls, set(value: AgentUiSnapshot) {latest = value}, offline(value: boolean) {failure = value}, admission(value: typeof admission) {admission = value}}
}
const firstAtom = (model: ReturnType<typeof createAgentWorkspace>) => model.getSnapshot().offices[0]!.agents[0]!.atom

test("workspace exposes all public Atoms without Agents and retains Graph identity and last-good data through failure", async () => {
  const data = fixture(), f = host(data)
  data.agents = []
  expect(f.model.getSnapshot()).toMatchObject({status: "loading", graph: null, verseId: null, observedWorld: null})
  const stop = f.model.start()
  try {
    await f.model.refresh()
    const first = f.model.getSnapshot(), graph = first.graph!
    expect(first).toMatchObject({status: "ready", offices: [], verseId: "assigned-verse", observedWorld: {root: data.root, cutId: "cut"}})
    expect(graph.runtime.roots[0]!.children?.map(node => node.ref)).toEqual(["atom:2", "atom:4"])
    expect(f.calls.every(call => call.method === "GET")).toBeTrue()
    const reordered = structuredClone(data)
    reordered.graph = {runtime: reordered.graph.runtime, template: reordered.graph.template, root: reordered.graph.root, schema: reordered.graph.schema}
    f.set(reordered)
    await f.model.refresh()
    expect(f.model.getSnapshot()).toBe(first)
    expect(f.model.getSnapshot().graph).toBe(graph)
    const broken = structuredClone(data)
    broken.graph.runtime.roots[0]!.declaration = "#/template/missing"
    f.set(broken)
    await expect(f.model.refresh()).rejects.toThrow("Graph")
    expect(f.model.getSnapshot()).toMatchObject({status: "error", verseId: "assigned-verse", observedWorld: {cutId: "cut"}})
    expect(f.model.getSnapshot().graph).toBe(graph)
    f.offline(true)
    await expect(f.model.refresh()).rejects.toThrow("Offline")
    expect(f.model.getSnapshot().graph).toBe(graph)
    stop()
    f.offline(false)
    f.set(structuredClone(data))
    f.model.start()
    expect(f.model.getSnapshot().graph).toBe(graph)
    await f.model.refresh()
    expect(f.model.getSnapshot().status).toBe("ready")
    expect(f.model.getSnapshot().graph).toBe(graph)
    const next = structuredClone(data)
    next.graph.runtime.roots[0]!.kind === "atom" && (next.graph.runtime.roots[0]!.values.title = "Changed")
    next.verseId = null
    next.revision.cutId = "next-cut"
    next.observedWorld.cutId = "next-cut"
    f.set(next)
    await f.model.refresh()
    expect(f.model.getSnapshot().graph).not.toBe(graph)
    expect(f.model.getSnapshot().verseId).toBeNull()
    expect(f.model.getSnapshot().observedWorld).toEqual({root: data.root, cutId: "next-cut"})
  } finally {f.model.dispose()}
})

test("malformed host assignment and world identity never replace a valid workspace observation", async () => {
  const data = fixture(), f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    const graph = f.model.getSnapshot().graph
    const wrongCut = structuredClone(data)
    wrongCut.observedWorld.cutId = "other-world"
    const reserved = structuredClone(data)
    reserved.verseId = "oracle"
    const wrongRoot = structuredClone(data)
    wrongRoot.graph.root = parseMetaAddress("@other/world")!
    for (const invalid of [wrongCut, reserved, wrongRoot]) {
      f.set(invalid)
      await expect(f.model.refresh()).rejects.toThrow("Graph")
      expect(f.model.getSnapshot().graph).toBe(graph)
    }
    expect(f.calls.every(call => call.method === "GET")).toBeTrue()
  } finally {f.model.dispose()}
})

test("development is explicitly requested and never inferred from an ordinary chat message", async () => {
  const data = structuredClone(fixture())
  data.agents[0]!.configuration.value!.tools.push({kind: "oracle-tool", name: "bun.evaluate", input: {}, owner: {meta: "@metafor/repl"}})
  const f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    expect(atom.actions.runDevelopment).toBeDefined()
    await atom.actions.runDevelopment!("Проверь исходники и выполни тесты", new AbortController().signal)
    expect(f.calls.filter(call => call.method === "POST").map(call => call.input)).toEqual([
      {agentRef: "atom:2", task: {id: "new-task", text: "Проверь исходники и выполни тесты", mode: "development"}},
    ])
    expect(atom.actions.runDevelopment).toBeUndefined()
  } finally {f.model.dispose()}
})

test("development chat presents task, code and answer while retaining full envelopes only in Context", async () => {
  const data = fixture(), first = `model:${"a".repeat(64)}`, second = `model:${"b".repeat(64)}`
  const initial = JSON.stringify({phase: "development", instructions: "INTERNAL_INSTRUCTIONS", task: {id: "task", text: "Проверь среду"}, step: 1, environment: {graph: "FULL_GRAPH_DATA"}})
  const continued = JSON.stringify({phase: "development", instructions: "INTERNAL_INSTRUCTIONS", task: {id: "task", text: "Проверь среду"}, step: 2, result: {operation: "bun.evaluate", state: "completed", result: "42"}})
  session(data).requests.push({id: first, prompt: initial}, {id: second, prompt: continued})
  session(data).messages.push({requestId: first, role: "user", content: initial},
    {requestId: first, role: "assistant", content: JSON.stringify({operation: "bun.evaluate", code: "40 + 2"})},
    {requestId: second, role: "user", content: continued}, {requestId: second, role: "assistant", content: JSON.stringify({answer: "Проверено: 42"})},
    {requestId: "ordinary:conversation", role: "user", content: initial})
  const f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    const snapshot = firstAtom(f.model).getSnapshot()
    expect(snapshot.chat.map(message => message.content)).toEqual(["Проверь среду", "bun.evaluate", "Проверено: 42", initial])
    expect(snapshot.chat[1]?.tool).toMatchObject({name: "bun.evaluate", status: "completed", input: {code: "40 + 2"}, output: {result: "42"}, correlation: {modelRequestId: first, resultRequestId: second, taskId: "task", step: 1}})
    expect(JSON.stringify(snapshot.context)).toContain("FULL_GRAPH_DATA")
  } finally {f.model.dispose()}
})

test("ordinary polling preserves Agent context identity, own provider and fixed owner office; revision is not a cache key", async () => {
  const f = host()
  expect(f.model.getSnapshot().status).toBe("loading")
  expect(f.calls).toEqual([])
  const stop = f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    let updates = 0
    const unsubscribe = atom.subscribe(() => {updates++})
    expect(atom.ref).toBe("atom:2")
    expect(atom.getSnapshot().provider).toEqual({id: "chatgpt", sessionId: "native-session", model: null, reasoning: null, models: [], reasoningLevels: []})
    expect(atom.actions.configureProvider).toBeUndefined()
    expect(f.model.getSnapshot().offices[0]).toMatchObject({owner: "atom:1", bounds: {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}})
    const next = fixture("deepseek")
    session(next).messages.push({requestId: "hello:conversation", role: "assistant", content: "Новый ответ"})
    f.set(next)
    await f.model.refresh()
    expect(firstAtom(f.model)).toBe(atom)
    expect(atom.getSnapshot().provider?.id).toBe("deepseek")
    expect(atom.getSnapshot().chat[0]?.content).toBe("Новый ответ")
    expect(updates).toBeGreaterThan(0)
    unsubscribe()
    expect(f.calls.every(call => call.method === "GET")).toBeTrue()
  } finally {stop(); f.model.dispose()}
})

test("POST admits a conversation only; stale reads keep it blocked until its own confirmed task appears", async () => {
  const f = host()
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    await atom.actions.sendMessage!("Привет!", new AbortController().signal)
    await f.model.refresh()
    expect(f.calls.find(call => call.method === "POST")?.input).toEqual({agentRef: "atom:2", task: {id: "new-task", text: "Привет!", mode: "conversation"}})
    expect(atom.getSnapshot().chat).toEqual([])
    expect(atom.actions.sendMessage).toBeUndefined()
    const confirmed = fixture()
    confirmed.agents[0]!.activeTaskId = "new-task"
    session(confirmed).messages.push({requestId: "new-task:conversation", role: "user", content: "Привет!"}, {requestId: "new-task:conversation", role: "assistant", content: "Здравствуйте!"})
    f.set(confirmed)
    await f.model.refresh()
    expect(atom.getSnapshot().chat.map(message => message.content)).toEqual(["Привет!", "Здравствуйте!"])
    expect(atom.actions.sendMessage).toBeDefined()
    expect(f.calls.filter(call => call.method === "POST")).toHaveLength(1)
  } finally {f.model.dispose()}
})

test("delayed refresh, failure and resume retain the last workspace while unchanged polls only update Atom data", async () => {
  let data = fixture()
  let delayed: ReturnType<typeof Promise.withResolvers<Response>> | null = null
  const model = createAgentWorkspace({fetch: async () => delayed ? delayed.promise : Response.json(data)})
  let stop = model.start()
  try {
    await model.refresh()
    const initial = model.getSnapshot(), atom = firstAtom(model)
    let workspaceUpdates = 0, atomUpdates = 0
    const unsubscribe = model.subscribe(() => {workspaceUpdates++})
    const unsubscribeAtom = atom.subscribe(() => {atomUpdates++})
    await model.refresh()
    expect(model.getSnapshot()).toBe(initial)
    expect(workspaceUpdates).toBe(0)
    data = fixture()
    session(data).messages.push({requestId: "new:conversation", role: "assistant", content: "Mass changed at the same revision"})
    await model.refresh()
    expect(model.getSnapshot()).toBe(initial)
    expect(workspaceUpdates).toBe(0)
    expect(atomUpdates).toBeGreaterThan(0)
    expect(atom.getSnapshot().chat[0]?.content).toBe("Mass changed at the same revision")
    delayed = Promise.withResolvers<Response>()
    const refresh = model.refresh()
    await Promise.resolve()
    expect(model.getSnapshot()).toBe(initial)
    expect(firstAtom(model)).toBe(atom)
    delayed.resolve(Response.json({error: {message: "Temporarily offline"}}, {status: 503}))
    await expect(refresh).rejects.toThrow("Temporarily offline")
    expect(model.getSnapshot().offices).toBe(initial.offices)
    expect(firstAtom(model)).toBe(atom)
    expect(atom.actions.sendMessage).toBeUndefined()
    delayed = Promise.withResolvers<Response>()
    stop()
    stop = model.start()
    const resumed = model.refresh()
    expect(model.getSnapshot().status).toBe("error")
    expect(firstAtom(model)).toBe(atom)
    delayed.resolve(Response.json(data))
    await resumed
    expect(model.getSnapshot().status).toBe("ready")
    expect(model.getSnapshot().offices).toBe(initial.offices)
    expect(firstAtom(model)).toBe(atom)
    expect(atom.actions.sendMessage).toBeDefined()
    unsubscribe()
    unsubscribeAtom()
  } finally {stop(); model.dispose()}
})

test("scenario is explicit, unknown tools are denied, and internal envelopes become human actions with raw inspector context", async () => {
  const data = fixture()
  const plan = JSON.stringify({phase: "plan", instructions: "private technical context", task: {id: "s", text: "Проверь мир"}, tools: []})
  const answer = JSON.stringify({phase: "answer", task: {id: "s", text: "Проверь мир"}, result: {passed: true}})
  session(data).requests.push({id: "s:plan", prompt: plan}, {id: "s:answer", prompt: answer})
  session(data).messages.push({requestId: "s:plan", role: "user", content: plan},
    {requestId: "s:plan", role: "assistant", content: JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity"})},
    {requestId: "s:answer", role: "user", content: answer}, {requestId: "s:answer", role: "assistant", content: JSON.stringify({answer: "Мир согласован"})},
    {requestId: "literal:conversation", role: "user", content: JSON.stringify({phase: "plan", task: {text: "literal"}})})
  const f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    expect(atom.getSnapshot().chat.map(message => message.content)).toEqual(["Проверь мир", "scenario.run", "Мир согласован", JSON.stringify({phase: "plan", task: {text: "literal"}})])
    expect(atom.getSnapshot().chat[1]?.tool).toMatchObject({name: "scenario.run", status: "completed", output: {passed: true}})
    expect(JSON.stringify(atom.getSnapshot().context)).toContain("private technical context")
    await expect(atom.actions.invokeTool!({kind: "oracle-tool", name: "shell.run", input: {}}, new AbortController().signal)).rejects.toThrow("не поддержан")
    expect(f.calls.filter(call => call.method === "POST")).toHaveLength(0)
    await atom.actions.invokeTool!(atom.getSnapshot().configuration.tools[0]!, new AbortController().signal)
    expect(f.calls.find(call => call.method === "POST")?.input).toMatchObject({task: {mode: "scenario", scenario: "agent-system.integrity"}})
  } finally {f.model.dispose()}
})

test("busy and transport errors disable actions; ordinary recovery preserves context and empty ready is honest", async () => {
  const f = host()
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    const busy = fixture()
    busy.agents[0]!.busy = true
    f.set(busy)
    await f.model.refresh()
    expect(atom.actions.sendMessage).toBeUndefined()
    expect(atom.getSnapshot().operations).toEqual([])
    f.offline(true)
    await expect(f.model.refresh()).rejects.toThrow("Offline")
    expect(f.model.getSnapshot()).toMatchObject({status: "error", error: "Offline"})
    expect(firstAtom(f.model)).toBe(atom)
    f.offline(false)
    f.set(fixture())
    await f.model.refresh()
    expect(atom.actions.sendMessage).toBeDefined()
    const empty = fixture()
    empty.agents = []
    f.set(empty)
    await f.model.refresh()
    expect(f.model.getSnapshot()).toMatchObject({status: "ready", error: null, offices: [], connectableSlots: [], profiles: null, profileError: null})
    expect(atom.actions.sendMessage).toBeUndefined()
  } finally {f.model.dispose()}
})

test("reads coalesce, disposal aborts owned work, and a late response cannot revive the model", async () => {
  const deferred = Promise.withResolvers<Response>()
  let calls = 0
  let signal: AbortSignal | undefined | null
  const model = createAgentWorkspace({fetch: async (_input, init) => {calls++; signal = init?.signal; return await deferred.promise}})
  model.start()
  const first = model.refresh(), second = model.refresh()
  expect(second).toBe(first)
  await Promise.resolve()
  expect(calls).toBe(1)
  model.dispose()
  expect(signal?.aborted).toBeTrue()
  deferred.resolve(Response.json(fixture()))
  await expect(first).rejects.toThrow()
  expect(model.getSnapshot().offices).toEqual([])
  expect(() => model.start()).toThrow("освобождён")
})

test("active and idle polls use bounded read-only intervals, never automatic POST", async () => {
  const timer = spyOn(globalThis, "setTimeout")
  const f = host()
  f.model.start()
  try {
    await f.model.refresh()
    expect(timer.mock.calls.some(call => call[1] === 3000)).toBeTrue()
    const busy = fixture()
    busy.agents[0]!.busy = true
    f.set(busy)
    await f.model.refresh()
    expect(timer.mock.calls.some(call => call[1] === 1000)).toBeTrue()
    expect(f.calls.every(call => call.method === "GET")).toBeTrue()
  } finally {f.model.dispose(); timer.mockRestore()}
})

test("ambiguous admission is not automatically retried; a definitive busy refusal can recover by reading", async () => {
  for (const refusal of ["busy", "conflict"] as const) {
    const f = host()
    f.admission(refusal)
    f.model.start()
    try {
      await f.model.refresh()
      const atom = firstAtom(f.model)
      await expect(atom.actions.sendMessage!("Сообщение", new AbortController().signal)).rejects.toThrow(refusal)
      await f.model.refresh()
      expect(atom.actions.sendMessage === undefined).toBe(refusal === "conflict")
      expect(f.calls.filter(call => call.method === "POST")).toHaveLength(1)
    } finally {f.model.dispose()}
  }
})

test("a fast correlated planning failure releases the admission latch and exposes the actual error", async () => {
  const f = host()
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model), ready = f.model.getSnapshot()
    await atom.actions.sendMessage!("Привет", new AbortController().signal)
    await f.model.refresh()
    const failed = fixture()
    Object.assign(failed.agents[0]!, {activeTaskId: "new-task", status: "failed", state: "failed", error: "Ledger unavailable"})
    f.set(failed)
    await f.model.refresh()
    expect(f.model.getSnapshot()).toMatchObject({status: "ready", error: "assistant: Ledger unavailable"})
    expect(f.model.getSnapshot().graph).toBe(ready.graph)
    expect(f.model.getSnapshot().offices).toBe(ready.offices)
    expect(firstAtom(f.model)).toBe(atom)
    expect(atom.getSnapshot()).toMatchObject({state: "failed", context: {agent: {error: "Ledger unavailable"}}})
    expect(atom.actions.sendMessage).toBeDefined()
    expect(atom.getSnapshot().chat).toEqual([])
  } finally {f.model.dispose()}
})

test("a declared Codespace operation creates one explicit bounded Tool task without a Chat message", async () => {
  const data = fixture()
  if (data.agents[0]!.configuration.resolution !== "exact") throw new Error("Missing configuration")
  data.agents[0]!.configuration.value.tools = [{kind: "oracle-tool", name: "codespace.start", input: {}, owner: {meta: "@metafor/codespace"}}]
  const f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    const atom = firstAtom(f.model)
    expect(atom.getSnapshot().operations).toEqual(["codespace.start"])
    await atom.actions.invokeTool!(atom.getSnapshot().configuration.tools[0]!, new AbortController().signal)
    expect(f.calls.find(call => call.method === "POST")?.input).toMatchObject({agentRef: "atom:2", task: {id: "new-task", mode: "codespace", operation: "start"}})
    expect(atom.getSnapshot().chat).toEqual([])
    expect(f.calls.filter(call => call.method === "POST")).toHaveLength(1)
  } finally {f.model.dispose()}
})

test("canonical Provider projection and explicit selection remain separate from preview and never rewrite retained history", async () => {
  const {createProviderRegistry} = await import("@metafor/provider/catalog")
  const data = fixture()
  data.agents[0]!.providers = {ref: "atom:5", registry: createProviderRegistry([{id: "codespace-chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "remote", executorId: "browser",
    source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
    capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])}
  data.agents[0]!.providerBinding = {id: null, locked: false}
  const calls: Array<{url: string, input: unknown}> = []
  const model = createAgentWorkspace({fetch: async (url, init) => {
    if (init?.method === "POST") {
      const input = JSON.parse(init.body as string) as {entryId: string}
      calls.push({url: String(url), input})
      return Response.json({schema: "cosmos:agents/provider/v1", version: 1, agentRef: "atom:2", entryId: input.entryId, receipt: {}})
    }
    return Response.json(data)
  }})
  model.start()
  try {
    await model.refresh()
    const atom = firstAtom(model)
    expect(atom.getSnapshot().providers?.ref).toBe("atom:5")
    expect(atom.actions.connectBrowser).toBeDefined()
    expect(atom.actions.selectProvider).toBeDefined()
    await atom.actions.selectProvider!("codespace-chatgpt", new AbortController().signal)
    expect(calls).toEqual([{url: "/agents/provider", input: {agentRef: "atom:2", entryId: "codespace-chatgpt"}}])
    expect(atom.getSnapshot().providerBinding?.id).toBeNull()
    await model.refresh()
    data.agents[0]!.providerBinding = {id: "codespace-chatgpt", locked: true}
    await model.refresh()
    expect(atom.getSnapshot().providerBinding).toEqual({id: "codespace-chatgpt", locked: true})
    expect(atom.actions.selectProvider).toBeUndefined()
    expect(atom.actions.connectBrowser).toBeDefined()
    expect(calls).toHaveLength(1)
  } finally {model.dispose()}
})

test("empty workspace connects a declared slot and admits an exact owning profile intention only on explicit actions", async () => {
  const data = fixture()
  const slotConfiguration = data.agents[0]!.configuration
  data.agents = []
  data.connectableSlots = [{ref: "atom:8", meta: "@metafor/agent-slot", owner: {ref: "atom:1", meta: parseMetaAddress("@metafor/environment")!}, enabled: false, state: "disconnected", configuration: slotConfiguration}]
  const target = {worldIdentity: {peerId: "desktop", root: parseMetaAddress("intel-macos-chrome-studio")!, cutId: "cut"}, atomRef: "atom:1"} as const
  const expectedProfile = {name: "assigned-profile", saveId: "immutable-save"}
  data.profiles = {schema: "metafor/profile-targets/v1", version: 1, targets: [{...target, meta: parseMetaAddress("intel-macos-chrome-studio")!, expectedProfile, supportedOperations: ["profile.open", "profile.save"], state: "ready", available: true}]}
  const posts: Array<{url: string, value: unknown}> = []
  const model = createAgentWorkspace({fetch: async (url, init) => {
    if (init?.method !== "POST") return Response.json(data)
    const value = JSON.parse(init.body as string) as Record<string, unknown>
    posts.push({url: String(url), value})
    return String(url).endsWith("/connect") ? Response.json({schema: "cosmos:agents/connect/v1", version: 1, slotRef: value.slotRef, enabled: true, acceptance: "admitted", receipt: {}})
      : Response.json({schema: "metafor/profile-intent/v1", version: 1, id: value.id, operation: value.operation, target: value.target, admission: {}})
  }})
  model.start()
  try {
    await model.refresh()
    expect(model.getSnapshot().offices).toEqual([])
    expect(model.getSnapshot().connectableSlots?.[0]?.ref).toBe("atom:8")
    expect(model.getSnapshot().profiles?.targets[0]?.expectedProfile.name).toBe("assigned-profile")
    expect(posts).toEqual([])
    await model.connectSlot("atom:8", new AbortController().signal)
    await model.refresh()
    expect(posts[0]).toEqual({url: "/agents/connect", value: {slotRef: "atom:8", enabled: true}})
    expect(model.getSnapshot().offices).toEqual([])
    const intent = {id: "explicit-open", operation: "profile.open", target, expectedProfile} as const
    await model.profileIntent(intent, new AbortController().signal)
    expect(posts[1]).toEqual({url: "/agents/profile", value: intent})
    await expect(model.profileIntent({...intent, expectedProfile: {...expectedProfile, name: "other"}}, new AbortController().signal)).rejects.toThrow()
    await expect(model.connectSlot("atom:99", new AbortController().signal)).rejects.toThrow()
    expect(posts).toHaveLength(2)
    expect(model.getSnapshot().profiles?.targets[0]?.state).toBe("ready")
  } finally {model.dispose()}
})


test("canonical service feedback is visibly distinct and summarized without displaying raw JSON or changing tasks", async () => {
  const data = fixture()
  const stored = session(data) as unknown as Record<string, unknown>
  stored.feedback = [{id: "annotation-1", role: "service", includedIn: null,
    text: JSON.stringify({kind: "ui.annotation.selected", annotation: {tag: "button", ownAtomRef: "atom:9", privateExtra: "raw-envelope-marker"}}),
    correlation: {clientId: "client-1", connectionId: "connection-1", annotationId: "semantic:9"}}]
  const f = host(data)
  f.model.start()
  try {
    await f.model.refresh()
    expect(firstAtom(f.model).getSnapshot().chat).toEqual([{id: "service:annotation-1", role: "service", content: "Аннотация · button · atom:9"}])
    expect(JSON.stringify(firstAtom(f.model).getSnapshot().chat)).not.toContain("raw-envelope-marker")
    expect(f.calls.every(call => call.method === "GET")).toBe(true)
  } finally {f.model.dispose()}
})

test("existing assigned browser Chat exposes settings actions and projects real catalog through the same session and binding", async () => {
  const {createProviderRegistry} = await import("@metafor/types/metafor/provider-validation")
  const data = fixture()
  const binding = {id: "codespace-chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "peer", executorId: "browser"}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  data.agents[0]!.providers = {ref: "atom:4", registry}
  data.agents[0]!.providerBinding = {id: binding.id, locked: true}
  const posts: Array<{url: string; value: unknown}> = []
  const model = createAgentWorkspace({fetch: async (url, init) => {
    if (init?.method !== "POST") return Response.json(data)
    const value = JSON.parse(String(init.body))
    posts.push({url: String(url), value})
    return Response.json({settings: {model: "live-model", reasoning: "high", models: [{id: "live-model", label: "Live model"}], reasoningLevels: [{id: "high", label: "High"}]}})
  }})
  model.start()
  try {
    await model.refresh()
    const atom = firstAtom(model)
    expect(atom.actions.prepareProviderSettings).toBeDefined()
    expect(atom.actions.configureProvider).toBeDefined()
    await atom.actions.prepareProviderSettings!(new AbortController().signal)
    expect(posts[0]).toEqual({url: "/agents/settings", value: {agentRef: atom.ref, selection: {}}})
    expect(atom.getSnapshot().provider).toMatchObject({sessionId: "native-session", model: "live-model", reasoning: "high", models: [{id: "live-model", label: "Live model"}]})
    await atom.actions.configureProvider!({model: "live-model", reasoning: "high"}, new AbortController().signal)
    expect(posts[1]).toEqual({url: "/agents/settings", value: {agentRef: atom.ref, selection: {model: "live-model", reasoning: "high"}}})
    expect(atom.getSnapshot().providerBinding?.id).toBe(binding.id)
    expect(posts.every(row => !("task" in (row.value as object)))).toBe(true)
  } finally {model.dispose()}
})
