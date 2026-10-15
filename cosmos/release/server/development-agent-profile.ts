import {createHash, randomInt} from "node:crypto"
import {readFile} from "node:fs/promises"
import {join} from "node:path"
import {writeConversationRecord} from "./conversation-record"
import type {DevelopmentAgentPresentation, DevelopmentAgentScope} from "../shared/development-agent"

/**
Cosmos хранит только presentation рядом со своим state, без AtomRef и без имени-копии.
read не пишет. Явный ensure выбирает случайный вариант однажды; update требует CAS.
Имя меняет Session owner перед атомарной записью presentation. При отказе callback
revision остаётся прежней; повтор имени сохраняет своё исходное expectedName.
*/
export function createDevelopmentAgentProfiles(directory: string) {
  const pending = new Map<string, Promise<unknown>>()
  let closed = false
  const pathFor = (scope: DevelopmentAgentScope) => {
    if (!scope || typeof scope.packageName !== "string" || !scope.packageName || scope.packageName.length > 256 ||
        typeof scope.executorId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(scope.executorId)) throw new Error("Неверная identity Source агента")
    return join(directory, "source-agents", `${createHash("sha256").update(JSON.stringify([scope.packageName, scope.executorId])).digest("hex")}.json`)
  }
  const read = async (scope: DevelopmentAgentScope): Promise<DevelopmentAgentPresentation | null> => {
    let text: string
    try {text = await readFile(pathFor(scope), "utf8")} catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error}
    const value = JSON.parse(text)
    if (value.version !== 1 || value.scope?.packageName !== scope.packageName || value.scope.executorId !== scope.executorId ||
        !Number.isSafeInteger(value.revision) || value.revision < 1 || value.gender !== "male" && value.gender !== "female") throw new Error("Сохранённое представление Source агента повреждено")
    return {version: 1, scope: {...scope}, revision: value.revision, gender: value.gender}
  }
  const serial = async <T>(scope: DevelopmentAgentScope, run: () => Promise<T>): Promise<T> => {
    if (closed) throw new Error("Профили Source агентов закрыты")
    const path = pathFor(scope)
    const next = (pending.get(path) ?? Promise.resolve()).catch(() => {}).then(run)
    pending.set(path, next)
    try {return await next} finally {if (pending.get(path) === next) pending.delete(path)}
  }
  return {
    read(scope: DevelopmentAgentScope) {
      if (closed) throw new Error("Профили Source агентов закрыты")
      return read(scope)
    },
    ensure(scope: DevelopmentAgentScope) {
      return serial(scope, async () => {
        const previous = await read(scope)
        if (previous) return previous
        const next: DevelopmentAgentPresentation = {version: 1, scope: {...scope}, revision: 1, gender: randomInt(2) === 0 ? "male" : "female"}
        await writeConversationRecord(pathFor(scope), next)
        return next
      })
    },
    update(scope: DevelopmentAgentScope, value: {expectedRevision: number, gender: DevelopmentAgentPresentation["gender"]}, rename: () => Promise<void>) {
      if (value?.gender !== "male" && value?.gender !== "female") throw new Error("Неизвестный вариант гуманоида")
      return serial(scope, async () => {
        const previous = await read(scope)
        if (!previous || previous.revision !== value.expectedRevision) throw new Error("Представление агента изменилось; обновите его перед сохранением")
        await rename()
        const next: DevelopmentAgentPresentation = {...previous, revision: previous.revision + 1, gender: value.gender}
        await writeConversationRecord(pathFor(scope), next)
        return next
      })
    },
    async close() {closed = true; await Promise.allSettled([...pending.values()])},
  }
}
