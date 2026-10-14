import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createCosmosConversationGroups} from "../server/conversation-groups"

test("группы сохраняют состав комнаты отдельно и не перезаписывают конкурентный черновик", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-room-groups-"))
  const scope = {verseId: "test-verse", atomRef: "atom:1"}
  try {
    const store = createCosmosConversationGroups(directory)
    const created = await store.create(scope, {expectedRevision: 0, title: "Разработка", members: ["atom:6", "atom:7"]})
    expect(created.groups[0]!.members).toEqual(["atom:6", "atom:7"])
    expect(await createCosmosConversationGroups(directory).read(scope)).toEqual(created)
    await expect(store.create(scope, {expectedRevision: 0, title: "Устаревшее окно", members: []})).rejects.toThrow("Группы комнаты изменились")
    expect((await store.read({...scope, atomRef: "atom:2"})).groups).toEqual([])
    const changed = await store.update(scope, {expectedRevision: 1, id: created.groups[0]!.id, title: "Проверка", members: ["atom:7"]})
    expect(changed.groups[0]!.title).toBe("Проверка")
    expect(changed.groups[0]!.members).toEqual(["atom:7"])
  } finally {await rm(directory, {recursive: true, force: true})}
})
