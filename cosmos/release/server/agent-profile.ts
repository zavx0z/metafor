import {randomInt} from "node:crypto"
import {readFile} from "node:fs/promises"
import {join, resolve} from "node:path"
import {isAgentUiVerseId} from "../shared/agents"
import type {CosmosAgentProfile, CosmosAgentProfileUpdate, CosmosAgentScope} from "../shared/agent-profile"
import {writeConversationRecord} from "./conversation-record"

/** Отдельный каталог Cosmos. Scope проверяется по живому Graph вызывающим HTTP-владельцем. */
export function atomConversationDirectory(directory: string, scope: Pick<CosmosAgentScope, "verseId" | "atomRef">): string {
  if (!scope || !scope.verseId || !isAgentUiVerseId(scope.verseId) || !/^atom:[1-9][0-9]*$/.test(scope.atomRef)) throw Error("Неверный адрес Atom")
  return join(resolve(directory), encodeURIComponent(scope.verseId), scope.atomRef.slice(5))
}

/** Профиль legacy Agent либо созданного в Cosmos участника той же комнаты. */
export function agentConversationDirectory(directory: string, scope: CosmosAgentScope): string {
  if (!scope || !/^(?:atom:[1-9][0-9]*|agent:[a-f0-9-]{36})$/.test(scope.agentRef)) throw Error("Неверный адрес агента")
  return join(atomConversationDirectory(directory, scope), encodeURIComponent(scope.agentRef))
}

const name = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) throw Error("Имя должно содержать от 1 до 160 символов")
  return value.trim()
}
const gender = (value: unknown): CosmosAgentProfile["gender"] => {
  if (value !== "male" && value !== "female") throw Error("Неизвестный вариант гуманоида")
  return value
}

/**
 * Профиль представления сохраняется рядом с беседами Cosmos, отдельно от Quantum.
 * Случайный вариант выбирается только при первой записи. Один владелец runtime
 * сериализует операции профиля; revision защищает черновик другого окна.
 * Замена файла атомарна, повреждённый существующий профиль не пересоздаётся.
 * @see ../spec/agent-profile.spec.ts
 */
export function createCosmosAgentProfiles(directory: string) {
  const pending = new Map<string, Promise<unknown>>()
  const serial = async <T>(path: string, operation: () => Promise<T>): Promise<T> => {
    const before = pending.get(path) ?? Promise.resolve()
    const current = before.catch(() => {}).then(operation)
    pending.set(path, current)
    try {return await current} finally {if (pending.get(path) === current) pending.delete(path)}
  }
  const read = async (path: string, scope: CosmosAgentScope): Promise<CosmosAgentProfile | null> => {
    let text: string
    try {text = await readFile(path, "utf8")} catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error}
    const value = JSON.parse(text)
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
        value.scope?.verseId !== scope.verseId || value.scope.atomRef !== scope.atomRef || value.scope.agentRef !== scope.agentRef)
      throw Error("Сохранённый профиль агента повреждён")
    return {version: 1, scope: {...scope}, revision: value.revision, name: name(value.name), gender: gender(value.gender)}
  }
  return {
    async ensure(scope: CosmosAgentScope, defaultName: string): Promise<CosmosAgentProfile> {
      const folder = agentConversationDirectory(directory, scope), path = join(folder, "profile.json")
      return serial(path, async () => {
        const previous = await read(path, scope)
        if (previous) return previous
        const created: CosmosAgentProfile = {version: 1, scope: {...scope}, revision: 1,
          name: name(defaultName), gender: randomInt(2) === 0 ? "male" : "female"}
        await writeConversationRecord(path, created)
        return created
      })
    },
    async update(scope: CosmosAgentScope, update: CosmosAgentProfileUpdate): Promise<CosmosAgentProfile> {
      const folder = agentConversationDirectory(directory, scope), path = join(folder, "profile.json")
      const displayName = name(update?.name), variant = gender(update?.gender)
      return serial(path, async () => {
        const previous = await read(path, scope)
        if (!previous || previous.revision !== update.expectedRevision) throw Error("Профиль изменился; обновите его перед сохранением")
        const next: CosmosAgentProfile = {...previous, revision: previous.revision + 1, name: displayName, gender: variant}
        await writeConversationRecord(path, next)
        return next
      })
    },
  }
}
