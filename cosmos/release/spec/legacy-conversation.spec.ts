import {expect, test} from "bun:test"
import {mkdtemp, readFile, rm, truncate, writeFile, mkdir} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {readCosmosLegacyConversation} from "../server/legacy-conversation"
import {agentConversationDirectory} from "../server/agent-profile"

test("архив Quantum читается без преобразования и отказывает чужой identity либо слишком большому файлу", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-legacy-"))
  const scope = {verseId: "test-verse", atomRef: "atom:1", agentRef: "atom:6"}
  const folder = agentConversationDirectory(directory, scope)
  const path = join(folder, "legacy-quantum.json")
  const archive = {version: 1 as const, scope, archivedAt: "2026-10-14T00:00:00.000Z", source: {root: "test", chat: {ref: "atom:7"}, frontier: {cutId: "cut"}, digest: "sha256:test"},
    session: {version: 1, messages: [{role: "user", text: "Сохранённая история"}], requests: [{id: "uncertain", outcome: "pending"}]}}
  try {
    expect(await readCosmosLegacyConversation(directory, scope)).toBeNull()
    await mkdir(folder, {recursive: true})
    const original = JSON.stringify(archive)
    await writeFile(path, original)
    expect(await readCosmosLegacyConversation(directory, scope)).toEqual(archive)
    expect(await readFile(path, "utf8")).toBe(original)
    await writeFile(path, JSON.stringify({...archive, scope: {...scope, agentRef: "atom:50"}}))
    await expect(readCosmosLegacyConversation(directory, scope)).rejects.toThrow("Identity")
    await truncate(path, 16 * 1024 * 1024 + 1)
    await expect(readCosmosLegacyConversation(directory, scope)).rejects.toThrow("16 MiB")
  } finally {await rm(directory, {recursive: true, force: true})}
})
