import {expect, test} from "bun:test"
import {mkdtemp, mkdir, readdir, readFile, realpath, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createDevelopmentAgentProfiles} from "../server/development-agent-profile"
import {createDevelopmentCatalog} from "../server/development-catalog"
import {createDevelopmentConversations} from "../server/development-conversations"
import type {DevelopmentConfiguration} from "../shared/development"
import type {DevelopmentAgentProfile} from "../shared/development-agent"

test("Source gender сохраняется один раз; чтение не пишет, restart и конкурентный ensure сохраняют вариант", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-agent-profile-"))
  const scope = {packageName: "@fixture/package", executorId: crypto.randomUUID()}
  try {
    const profiles = createDevelopmentAgentProfiles(directory)
    expect(await profiles.read(scope)).toBeNull()
    expect(await readdir(directory)).toEqual([])
    const values = await Promise.all(Array.from({length: 12}, () => profiles.ensure(scope)))
    expect(new Set(values.map(value => JSON.stringify(value))).size).toBe(1)
    expect(["male", "female"]).toContain(values[0]!.gender)
    expect(values[0]!.revision).toBe(1)
    const restored = createDevelopmentAgentProfiles(directory)
    expect(await restored.read(scope)).toEqual(values[0]!)
    const file = join(directory, "source-agents", (await readdir(join(directory, "source-agents")))[0]!)
    const bytes = await readFile(file, "utf8")
    for (let index = 0; index < 10; index++) await restored.read(scope)
    expect(await readFile(file, "utf8")).toBe(bytes)
    expect(bytes).not.toContain('"name"')
    let renames = 0
    const saved = await restored.update(scope, {expectedRevision: 1, gender: "female"}, async () => {renames++})
    expect(saved).toMatchObject({gender: "female", revision: 2})
    await expect(restored.update(scope, {expectedRevision: 1, gender: "male"}, async () => {renames++})).rejects.toThrow("изменилось")
    expect(renames).toBe(1)
    await expect(restored.update(scope, {expectedRevision: 2, gender: "male"}, async () => {throw new Error("partial rename")})).rejects.toThrow("partial rename")
    expect(await restored.read(scope)).toEqual(saved)
    await writeFile(file, "broken")
    await expect(restored.ensure(scope)).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("broken")
  } finally {await rm(directory, {recursive: true, force: true})}
})

test("Source adapter сохраняет имя у Session и gender у Cosmos, list не создаёт legacy profiles", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "source-agent-profile-api-")))
  const source = join(directory, "source"), state = join(directory, "state")
  let chats: ReturnType<typeof createDevelopmentConversations> | undefined
  try {
    await mkdir(source)
    await writeFile(join(source, "package.json"), JSON.stringify({name: "@fixture/source"}))
    const config: DevelopmentConfiguration = {version: 1, id: "profiles", rootPackage: "@fixture/source", roots: [{name: "@fixture/source", directory: source, writable: true}],
      stateDirectory: state, execution: {connectionId: "fixture", connections: [{id: "fixture", label: "Fixture", provider: "codex", enabled: true}]}}
    const catalog = await createDevelopmentCatalog(config), address = catalog.source("@fixture/source").address
    const create = () => createDevelopmentConversations(config, catalog, {async connect() {throw new Error("Profile changes must not connect")}})
    chats = create()
    const legacy = await chats.sessions.create({address, label: "Прежний"})
    expect((await chats.request("list", {address}) as any[])[0]).not.toHaveProperty("sourceProfile")
    expect(await readdir(join(state, "source-agents")).catch(() => [])).toEqual([])
    const profile = await chats.request("agent-profile-prepare", {address, executorId: legacy.executorId}) as DevelopmentAgentProfile
    const session = await chats.sessions.createSession({address, executorId: legacy.executorId}, "Не переименовывать беседу")
    const update = {expectedRevision: profile.revision, expectedName: profile.name, name: "Ада", gender: "female"}
    const saved = await chats.request("agent-profile-update", {address, executorId: legacy.executorId, profile: update}) as DevelopmentAgentProfile
    expect(saved).toMatchObject({name: "Ада", gender: "female", revision: profile.revision + 1})
    expect((await chats.sessions.listSessions({address, executorId: legacy.executorId})).find(value => value.id === session.id))
      .toMatchObject({executorLabel: "Ада", sessionLabel: "Не переименовывать беседу"})
    await expect(chats.request("agent-profile-update", {address, executorId: legacy.executorId, profile: {...update, name: "Устаревшее"}})).rejects.toThrow("изменилось")
    expect((await chats.sessions.list(address))[0]?.executorLabel).toBe("Ада")
    const created = await chats.request("create", {address, label: "Новый"}) as {sourceProfile: DevelopmentAgentProfile}
    expect(created.sourceProfile.revision).toBe(1)
    await chats.close()
    chats = create()
    const listed = await chats.request("list", {address}) as {executorId: string, sourceProfile: DevelopmentAgentProfile}[]
    expect(listed.find(value => value.executorId === legacy.executorId)?.sourceProfile).toEqual(saved)
    expect(await readdir(join(state, "source-agents"))).toHaveLength(2)
  } finally {await chats?.close(); await rm(directory, {recursive: true, force: true})}
})

test("закрытие Source profiles ждёт принятую запись перед завершением владельца", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-profile-close-"))
  const scope = {packageName: "@fixture/source", executorId: crypto.randomUUID()}
  const release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
  try {
    const profiles = createDevelopmentAgentProfiles(directory)
    await profiles.ensure(scope)
    const update = profiles.update(scope, {expectedRevision: 1, gender: "female"}, async () => {entered.resolve(); await release.promise})
    await entered.promise
    let closed = false
    const close = profiles.close().then(() => {closed = true})
    await Bun.sleep(0)
    expect(closed).toBeFalse()
    await expect(profiles.ensure(scope)).rejects.toThrow("закрыты")
    release.resolve()
    await update
    await close
    expect(await createDevelopmentAgentProfiles(directory).read(scope)).toMatchObject({revision: 2, gender: "female"})
  } finally {release.resolve(); await rm(directory, {recursive: true, force: true})}
})
