import {open} from "node:fs/promises"
import {constants} from "node:fs"
import {join} from "node:path"
import type {CosmosConversationScope as CosmosAgentScope, CosmosLegacyConversation} from "../shared/conversations"
import {agentConversationDirectory} from "./agent-profile"

const limit = 16 * 1024 * 1024
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** Читает только уже созданный архив после host-проверки участника; не импортирует его в Session и не возобновляет задачи. */
export async function readCosmosLegacyConversation(directory: string, scope: CosmosAgentScope): Promise<CosmosLegacyConversation | null> {
  const path = join(agentConversationDirectory(directory, scope), "legacy-quantum.json")
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  })
  if (!file) return null
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > limit) throw Error("Архив беседы превышает 16 MiB")
    const bytes = Buffer.alloc(Math.min(stat.size + 1, limit + 1))
    let offset = 0
    while (offset < bytes.length) {
      const {bytesRead} = await file.read(bytes, offset, bytes.length - offset, null)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset > stat.size) throw Error("Архив беседы изменился во время чтения")
    const value: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes.subarray(0, offset)))
    if (!object(value) || value.version !== 1 || !object(value.scope) ||
      Object.keys(value.scope).length !== 3 || value.scope.verseId !== scope.verseId || value.scope.atomRef !== scope.atomRef || value.scope.agentRef !== scope.agentRef ||
      typeof value.archivedAt !== "string" || !Number.isFinite(Date.parse(value.archivedAt)) || !object(value.source) ||
      typeof value.source.root !== "string" || !object(value.source.chat) || !object(value.source.frontier) || typeof value.source.digest !== "string" ||
      !Object.hasOwn(value, "session")) throw Error("Identity архива беседы не совпадает с участником")
    return value as CosmosLegacyConversation
  } finally {await file.close()}
}
