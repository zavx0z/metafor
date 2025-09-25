import type { Schema } from "@zavx0z/context"
import type { Core } from "../core/index.t"
import type { ReactionsDeclaration } from "./reactions.t"
import type { ReactionFilterConditions } from "../core/react/condition.t"
import type { SnapshotReactions, ReactionUpdate, Reaction } from "../core/react/index.t"
export type { ReactionsDeclaration }

export const serializeReaction = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): SnapshotReactions | null => {
  const reactions: Record<string, any> = {}
  const states: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { title?: string; description?: string }) => ({
    filter: (conditions: ReactionFilterConditions) => ({
      equal: (update: ReactionUpdate<C, S, I>) => {
        const { read, write } = extractFields(update)
        const title = config?.title || ""
        const desc = config?.description
        const id = `${title}_${reactionAutoId++}`

        reactions[id] = {
          title,
          ...(desc && { desc }),
          cond: conditions,
          read,
          write,
          src: update.toString(),
        }

        return {
          title,
          update,
          filter: () => true,
          ...(desc && { description: desc }),
          registerStates: (list: S[]) => {
            for (const state of list) {
              const key = state as unknown as string
              if (!states[key]) states[key] = []
              states[key].push(id)
            }
          },
        } as unknown as Reaction<C, S, I> & { registerStates: (list: S[]) => void }
      },
    }),
  }))

  for (const [list, reaction] of chainResult) reaction.registerStates(list)

  if (Object.keys(reactions).length === 0) return null
  return { reactions, states }
} /**
 * Анализирует функцию update для извлечения полей
 */
export function extractFields<C extends Schema, S extends string, I extends Core>(update: ReactionUpdate<C, S, I>) {
  const updateStr = update.toString()
  const read: string[] = []
  const write: string[] = []

  // Извлекаем поля, которые читаются из контекста
  const contextMatches = updateStr.match(/context\.(\w+)/g)
  if (contextMatches) {
    for (const match of contextMatches) {
      const field = match.replace("context.", "")
      if (!read.includes(field)) {
        read.push(field)
      }
    }
  }

  // Извлекаем поля, которые записываются через update
  const updateMatches = updateStr.match(/update\(\s*\{\s*(\w+):/g)
  if (updateMatches) {
    for (const match of updateMatches) {
      const fieldMatch = match.match(/update\(\s*\{\s*(\w+):/)
      if (fieldMatch && fieldMatch[1]) {
        const field = fieldMatch[1]
        if (!write.includes(field)) {
          write.push(field)
        }
      }
    }
  }

  // Согласно тесту, если поле записывается, то оно также читается
  for (const writeField of write) {
    if (!read.includes(writeField)) {
      read.push(writeField)
    }
  }

  return { read, write }
}
