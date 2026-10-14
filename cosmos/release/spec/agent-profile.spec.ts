import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createCosmosAgentProfiles} from "../server/agent-profile"

test("профиль Cosmos сохраняет случайный вариант и имя между открытиями и отклоняет устаревший черновик", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-agent-profile-"))
  const scope = {verseId: "test-verse", atomRef: "atom:1", agentRef: "atom:6"}
  try {
    const profiles = createCosmosAgentProfiles(directory)
    const [first, concurrent] = await Promise.all([profiles.ensure(scope, "Ассистент"), profiles.ensure(scope, "Другое имя")])
    expect(concurrent).toEqual(first)
    expect(["male", "female"]).toContain(first.gender)
    expect(await createCosmosAgentProfiles(directory).ensure(scope, "Новое имя по умолчанию")).toEqual(first)
    const updated = await profiles.update(scope, {expectedRevision: first.revision, name: "Саша", gender: "female"})
    expect(updated.name).toBe("Саша")
    expect(updated.gender).toBe("female")
    await expect(profiles.update(scope, {expectedRevision: first.revision, name: "Старый черновик", gender: "male"})).rejects.toThrow("Профиль изменился")
    expect(await createCosmosAgentProfiles(directory).ensure(scope, "Ассистент")).toEqual(updated)
    const other = await profiles.ensure({...scope, agentRef: "atom:7"}, "Другой агент")
    expect(other.name).toBe("Другой агент")
  } finally {await rm(directory, {recursive: true, force: true})}
})
