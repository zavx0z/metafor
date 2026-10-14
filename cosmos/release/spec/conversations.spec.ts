import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createCosmosConversations} from "../server/conversations"
import type {CosmosConversationRequest} from "../shared/conversations"

test("Cosmos actors и независимые беседы переживают пересоздание хоста; чтение не подключает ACP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-conversations-"))
  let connections = 0
  let prompts = 0
  let closes = 0
  const notifications: unknown[] = []
  const create = () => createCosmosConversations({directory, authorize() {}, onDirectoryChange: room => notifications.push(room),
    validAtom: scope => scope.verseId === "test-verse" && scope.atomRef === "atom:1",
    validParticipant: scope => scope.agentRef === "atom:6" ? {name: "Прежний агент"} : null,
    async resolveExecution({selection, executorSelection}) {
      return {selection, executorSelection: executorSelection ?? {}, effective: {connectionId: "test", ...selection},
        sources: {connectionId: "general"}, connections: [{id: "test", label: "Test", enabled: true, provider: "codex"}]}
    },
    async connect(input) {
      connections += 1
      return {sessionId: `native-${input.localSessionId}`, capabilities: {}, configOptions: [],
        async setConfigOption() {return []}, async cancel() {}, async dispose() {closes += 1},
        async prompt() {
          prompts += 1
          await input.onUpdate({sessionUpdate: "agent_message_chunk", content: {type: "text", text: "Ответ"}})
          return {stopReason: "end_turn"}
        }}
    }})
  let service = create()
  const send = async (value: CosmosConversationRequest) => {
    const response = await service.handleRequest(new Request("http://localhost/conversations", {
      method: "POST", body: JSON.stringify(value), headers: {"Content-Type": "application/json"}}))
    expect(response).toBeDefined()
    const reply = await response!.json() as any
    if (!reply.ok) throw new Error(reply.error.message)
    return reply.result
  }
  const atom = {verseId: "test-verse", atomRef: "atom:1"}
  try {
    expect(await send({action: "agent.list", scope: atom})).toEqual([])
    const [actor, concurrentActor] = await Promise.all([
      send({action: "agent.ensure", scope: atom, name: "Саша"}),
      send({action: "agent.ensure", scope: atom, name: "Другой default"}),
    ])
    expect(concurrentActor).toEqual(actor)
    expect(notifications).toEqual([atom])
    await send({action: "agent.ensure", scope: atom, name: "Existing"})
    expect(notifications).toHaveLength(1)
    expect((await send({action: "agent.list", scope: atom})).length).toBe(1)
    expect(actor.scope.agentRef).toMatch(/^agent:[a-f0-9-]{36}$/)
    const scope = actor.scope
    const emptyGroups = await send({action: "group.list", scope: atom})
    expect(emptyGroups.revision).toBe(0)
    const group = await send({action: "group.create", scope: atom, expectedRevision: 0, title: "Команда", members: [scope.agentRef]})
    expect(group.groups[0].members).toEqual([scope.agentRef])
    expect(notifications).toEqual([atom, atom])
    const profile = await send({action: "profile.read", scope})
    actor.profile = await send({action: "profile.update", scope, update: {expectedRevision: profile.revision, name: "Новое имя", gender: profile.gender}})
    expect(notifications).toEqual([atom, atom, atom])
    expect(connections).toBe(0)
    expect(prompts).toBe(0)
    const first = await send({action: "read", scope})
    expect(first.execution.effective.connectionId).toBe("test")
    expect(connections).toBe(0)
    expect(notifications).toHaveLength(3)
    const second = await send({action: "create", scope, label: "Вторая"})
    expect(second.id).not.toBe(first.id)
    const selected = {scope, sessionId: second.id}
    await send({action: "prompt", ...selected, text: "Вопрос", requestId: "one"})
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await send({action: "read", ...selected})).status === "idle") break
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(prompts).toBe(1)
    await send({action: "prompt", ...selected, text: "Вопрос", requestId: "one"})
    expect(prompts).toBe(1)
    expect((await send({action: "displayHistory", ...selected})).items.length).toBeGreaterThan(0)
    expect((await send({action: "displayHistory", scope, sessionId: first.id})).items).toEqual([])
    await service.dispose()
    expect(closes).toBe(1)
    service = create()
    const actors = await send({action: "agent.list", scope: atom})
    expect(actors).toEqual([actor])
    expect((await send({action: "list", scope})).map((value: any) => value.id)).toContain(second.id)
    expect((await send({action: "displayHistory", ...selected})).items.length).toBeGreaterThan(0)
    expect(connections).toBe(1)
    expect((await send({action: "group.list", scope: atom})).groups).toEqual(group.groups)
    const deniedGroup = await service.handleRequest(new Request("http://localhost/conversations", {method: "POST",
      body: JSON.stringify({action: "group.create", scope: atom, expectedRevision: 1, title: "Чужой", members: ["agent:00000000-0000-4000-8000-000000000000"]})}))
    expect(deniedGroup!.status).toBe(403)
    const denied = await service.handleRequest(new Request("http://localhost/conversations", {method: "POST",
      body: JSON.stringify({action: "agent.create", scope: {...atom, atomRef: "atom:2"}, name: "Нет"})}))
    expect(denied!.status).toBe(403)
  } finally {await service.dispose(); await rm(directory, {recursive: true, force: true})}
})
