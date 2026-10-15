import {expect, test} from "bun:test"
import {mkdtemp, mkdir, realpath, rm, writeFile, readFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createDevelopmentCatalog} from "../server/development-catalog"
import {createDevelopmentConversations} from "../server/development-conversations"
import {createDevelopmentMachineGrant} from "../server/development-machine"
import {createNativeReplOracle} from "../server/repl"
import type {DevelopmentConfiguration} from "../shared/development"
import {createClientRegistry, type ClientSocketData} from "../server/clients"
import type {ClientOutbound} from "../shared/clients"

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-development-")))
  const root = join(directory, "source")
  await mkdir(join(root, "plain"), {recursive: true})
  await writeFile(join(root, "package.json"), JSON.stringify({name: "metafor", workspaces: ["plain"], dependencies: {"@zavx0z/storybook": "*"}, devDependencies: {"@zavx0z/highlighter": "*"}}))
  await writeFile(join(root, "proof.ts"), "export const proof = 0")
  await writeFile(join(root, "AGENTS.md"), "Правила собственного fixture workspace")
  await writeFile(join(root, "plain", "package.json"), JSON.stringify({name: "@fixture/plain", peerDependencies: {typescript: "^7"}, optionalDependencies: {optional: "*"}}))
  const config: DevelopmentConfiguration = {version: 1, id: "own-cosmos", rootPackage: "metafor", stateDirectory: join(directory, "state"),
    roots: [{name: "metafor", directory: root, writable: true}], execution: {connectionId: "test", approvalMode: "scoped-autonomous", connections: [{id: "test", label: "Fixture", enabled: true, provider: "codex"}]}}
  return {directory, root, config, catalog: await createDevelopmentCatalog(config), close: () => rm(directory, {recursive: true, force: true})}
}

test("ordinary packages include every manifest dependency kind, retain external names and never silently grant external source", async () => {
  const f = await fixture()
  try {
    expect(f.catalog.snapshot.packages.find(pkg => pkg.name === "@fixture/plain")).toMatchObject({resolution: "source", writable: true})
    expect(new Set(f.catalog.snapshot.dependencies.map(edge => edge.kind))).toEqual(new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]))
    expect(f.catalog.snapshot.packages.find(pkg => pkg.name === "@zavx0z/storybook")).toMatchObject({resolution: "external", writable: false})
    expect(() => f.catalog.source("@zavx0z/storybook")).toThrow("outside")
    expect(JSON.stringify(f.catalog.snapshot)).not.toContain(f.directory)
  } finally {await f.close()}
})

test("shared Session persists own initial context and executes a host-granted Bun command through the existing native owner", async () => {
  const f = await fixture(), token = crypto.randomUUID(), native = createNativeReplOracle({assignment: {token, cwd: f.directory}})
  let round = 0
  const prompts: unknown[] = []
  const chats = createDevelopmentConversations(f.config, f.catalog, {
    machine: (_input, source) => createDevelopmentMachineGrant({hostId: "fixture-machine", revision: "owner-grant", repl: native, assignment: {token, cwd: f.directory}, cwd: source.directory}),
    async connect(input) {
      return {sessionId: `native-${input.localSessionId}`, capabilities: {}, configOptions: [],
        async setConfigOption() {return []}, async cancel() {}, async dispose() {},
        async prompt(content) {
          prompts.push(content)
          const index = round++
          const replies = [
            {name: "filesystem.read", arguments: {path: "proof.ts"}},
            {name: "filesystem.write", arguments: {path: "proof.ts", content: "export const proof = 42"}},
            {name: "bun.evaluate", arguments: {code: 'var imported = await import("file://" + process.cwd() + "/proof.ts"); if (imported.proof !== 42) throw new Error("target check failed"); "target-check-pass"'}},
          ]
          const text = index < replies.length ? JSON.stringify(replies[index]) : "Готово"
          await input.onUpdate({sessionUpdate: "agent_message_chunk", messageId: `message-${round}`, content: {type: "text", text}})
          return {stopReason: "end_turn"}
        }}
    },
  })
  const address = f.catalog.source("metafor").address
  let stop: (() => void) | undefined
  try {
    const finished = Promise.withResolvers<void>()
    stop = await chats.sessions.subscribe(address, snapshot => {if (round >= 4 && snapshot.status === "idle") finished.resolve()})
    await chats.sessions.prompt(address, "Сделай маленькую правку", "first-task")
    const deadline = setTimeout(() => finished.reject(new Error("Development loop did not finish")), 10000)
    try {await finished.promise} finally {clearTimeout(deadline)}
    expect(await readFile(join(f.root, "proof.ts"), "utf8")).toBe("export const proof = 42")
    expect(prompts).toHaveLength(4)
    const initial = JSON.stringify(prompts[0])
    expect(initial).toContain("Правила собственного fixture workspace")
    expect(initial).toContain("bun.evaluate")
    expect(initial).toContain("filesystem.read")
    expect(initial).not.toContain(token)
    expect(JSON.stringify(prompts[3])).toContain("target-check-pass")
    expect(JSON.stringify(prompts[3])).toContain("completed")
    const history = await chats.sessions.displayHistory(address, {limit: 20})
    expect(JSON.stringify(history)).toContain("Готово")
    expect((await chats.sessions.read(address)).status).toBe("idle")
  } finally {stop?.(); await chats.close(); await native.close(); await f.close()}
}, 15000)

test("existing Window socket pushes source Session snapshots and detaches without cancelling the model", async () => {
  const f = await fixture(), finish = Promise.withResolvers<void>()
  let cancelled = false, detached = 0, opened = 0
  const chats = createDevelopmentConversations(f.config, f.catalog, {async connect(input) {
    return {sessionId: "stream-native", capabilities: {}, configOptions: [], async setConfigOption() {return []}, async dispose() {},
      async cancel() {cancelled = true}, async prompt() {
        await input.onUpdate({sessionUpdate: "agent_message_chunk", messageId: "one", content: {type: "text", text: "Начало"}})
        await finish.promise
        await input.onUpdate({sessionUpdate: "agent_message_chunk", messageId: "one", content: {type: "text", text: " завершение"}})
        return {stopReason: "end_turn"}
      }}
  }})
  const clients = createClientRegistry({world: async () => ({root: "fixture", cutId: "cut"}), heartbeatMs: 10000,
    async observeDevelopment(scope, receive) {
      opened++
      const stop = await chats.subscribe(scope, receive)
      return () => {detached++; stop()}
    }})
  const server = Bun.serve<ClientSocketData>({hostname: "127.0.0.1", port: 0, websocket: clients.websocket, fetch: (request, host) => clients.fetch(request, host)})
  const NativeSocket = WebSocket as unknown as {new(url: string, options: {headers: Record<string, string>}): WebSocket}
  const ws = new NativeSocket(server.url.href.replace("http:", "ws:") + "clients/socket", {headers: {Origin: server.url.origin}})
  const events: ClientOutbound[] = []
  const waiters = new Set<() => void>()
  ws.addEventListener("message", event => {events.push(JSON.parse(String(event.data))); for (const notify of waiters) notify()})
  const until = (predicate: () => boolean) => new Promise<void>((resolve, reject) => {
    const done = () => {if (!predicate()) return; clearTimeout(timer); waiters.delete(done); resolve()}
    const timer = setTimeout(() => {waiters.delete(done); reject(new Error("Source stream timed out"))}, 5000)
    waiters.add(done)
    done()
  })
  const address = f.catalog.source("metafor").address
  try {
    await new Promise<void>(resolve => ws.addEventListener("open", () => resolve(), {once: true}))
    ws.send(JSON.stringify({type: "hello", version: 1, clientId: null, kind: "Window", capabilities: [], status: {visible: true, focused: false, boot: {phase: "ready", trace: []}}}))
    await until(() => events.some(event => event.type === "registered"))
    const connectionId = (events.find(event => event.type === "registered") as Extract<ClientOutbound, {type: "registered"}>).client.connectionId
    const send = (type: string, id: string, source = address) => ws.send(JSON.stringify({type, connectionId, subscriptionId: id,
      ...(type === "development.subscribe" ? {scope: {address: source}} : {})}))
    send("development.subscribe", "own")
    await until(() => events.some(event => event.type === "development.snapshot"))
    const idle = (events.find(event => event.type === "development.snapshot") as Extract<ClientOutbound, {type: "development.snapshot"}>).snapshot
    expect(idle).toMatchObject({address, status: "idle"})
    expect(opened).toBe(1)
    await chats.sessions.prompt(address, "Проверка потока", "stream")
    await until(() => events.some(event => event.type === "development.snapshot" && (event.snapshot as {status: string}).status === "running"))
    send("development.subscribe", "foreign", "/cosmos/package/foreign")
    await until(() => events.some(event => event.type === "development.error" && event.subscriptionId === "foreign"))
    send("development.unsubscribe", "own")
    const final = Promise.withResolvers<void>()
    const stop = await chats.sessions.subscribe(address, snapshot => {if (snapshot.status === "idle") final.resolve()})
    finish.resolve()
    await final.promise
    stop()
    expect(cancelled).toBe(false)
    expect(detached).toBe(1)
    send("development.subscribe", "restored")
    await until(() => events.some(event => event.type === "development.snapshot" && event.subscriptionId === "restored"))
    expect((await chats.sessions.displayHistory(address, {limit: 20})).bodies?.some(body => JSON.stringify(body).includes("завершение"))).toBe(true)
  } finally {finish.resolve(); ws.close(); clients.close(); await chats.close(); await server.stop(true); await f.close()}
}, 15000)
