import {randomUUID} from "node:crypto"
import {readFile} from "node:fs/promises"
import {join} from "node:path"
import type {CosmosConversationGroup, CosmosRoomGroups, CosmosRoomScope} from "@metafor/types/cosmos/conversation-groups"
import {atomConversationDirectory} from "./agent-profile"
import {writeConversationRecord} from "./conversation-record"

const participant = /^(?:atom:[1-9][0-9]*|agent:[a-f0-9-]{36})$/
const groupValue = (id: string, title: string, members: readonly string[]): CosmosConversationGroup => {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160 || !Array.isArray(members) ||
      members.length > 128 || members.some(value => typeof value !== "string" || !participant.test(value)) || new Set(members).size !== members.length)
    throw Error("Нужны имя группы и различные участники комнаты")
  return {id, title: title.trim(), members: [...members]}
}

/**
 * Состав групп хранится у комнаты Cosmos, отдельно от сессий участников.
 * HTTP-владелец проверяет принадлежность участников живой комнате до записи.
 * Редактирование использует revision всего списка; создание не начинает модельных ходов.
 * @see ../spec/conversation-groups.spec.ts
 */
export function createCosmosConversationGroups(directory: string) {
  const pending = new Map<string, Promise<unknown>>()
  const path = (scope: CosmosRoomScope) => join(atomConversationDirectory(directory, scope), "groups.json")
  const read = async (scope: CosmosRoomScope): Promise<CosmosRoomGroups> => {
    let text: string
    try {text = await readFile(path(scope), "utf8")} catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {version: 1, scope: {...scope}, revision: 0, groups: []}
      throw error
    }
    const value = JSON.parse(text)
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.scope?.verseId !== scope.verseId ||
        value.scope.atomRef !== scope.atomRef || !Array.isArray(value.groups)) throw Error("Сохранённый список групп повреждён")
    const ids = new Set<string>()
    const groups = value.groups.map((group: CosmosConversationGroup) => {
      if (typeof group.id !== "string" || !/^[a-f0-9-]{36}$/.test(group.id) || ids.has(group.id)) throw Error("Сохранённая группа повреждена")
      ids.add(group.id)
      return groupValue(group.id, group.title, group.members)
    })
    return {version: 1, scope: {...scope}, revision: value.revision, groups}
  }
  const mutate = async (scope: CosmosRoomScope, revision: number, change: (groups: readonly CosmosConversationGroup[]) => readonly CosmosConversationGroup[]) => {
    const file = path(scope), previous = pending.get(file) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const current = await read(scope)
      if (current.revision !== revision) throw Error("Группы комнаты изменились; обновите список")
      const updated: CosmosRoomGroups = {...current, revision: current.revision + 1, groups: change(current.groups)}
      await writeConversationRecord(file, updated)
      return updated
    })
    pending.set(file, next)
    try {return await next} finally {if (pending.get(file) === next) pending.delete(file)}
  }
  return {
    read,
    create(scope: CosmosRoomScope, input: {expectedRevision: number; title: string; members: readonly string[]}) {
      const group = groupValue(randomUUID(), input.title, input.members)
      return mutate(scope, input.expectedRevision, groups => [...groups, group])
    },
    update(scope: CosmosRoomScope, input: {expectedRevision: number; id: string; title: string; members: readonly string[]}) {
      const next = groupValue(input.id, input.title, input.members)
      return mutate(scope, input.expectedRevision, groups => {
        if (!groups.some(group => group.id === input.id)) throw Error("Группа отсутствует")
        return groups.map(group => group.id === input.id ? next : group)
      })
    },
  }
}
