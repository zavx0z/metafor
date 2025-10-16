import type { Schema, Values } from "@zavx0z/context"
import type { Core } from "../actor/force/gravity.t"
import type { ReactionFilterConditions } from "../actor/condition.t"
import type { ReactionsDeclaration, Reaction, ReactionsSchema, ReactionAction } from "./reactions.t"
import type { SelfInfo } from "./metafor.t"
export type { ReactionsDeclaration, ReactionsSchema }

const PATTERN_UPDATE = /\bupdate\s*\(\s*({[\s\S]*?})\s*\)/g

export const reactionsSchema = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): ReactionsSchema | null => {
  const reactions: Record<string, any> = {}
  const states: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { label?: string; desc?: string }) => ({
    filter: (filter: (params: { self: SelfInfo; context: Values<C> }) => ReactionFilterConditions) => ({
      equal: (update: ReactionAction<C, S, I>) => {
        const { read, write } = extractFields(update)
        const label = config?.label || ""
        const desc = config?.desc
        const id = reactionAutoId++

        const re = /^\s*(\([^)]+\))\s*=>/

        let src = update.toString()
        const match = src.match(re)
        if (match) {
          src = src.slice(match[0].length).trim() // остальное после =>
        }
        const out = src.replace(PATTERN_UPDATE, (m, obj) => `update(${obj}, "${id}")`)

        reactions[id] = {
          label,
          ...(desc && { desc }),
          cond: filter.toString(),
          read,
          write,
          src: out,
        }

        return {
          label,
          update,
          filter: () => true,
          ...(desc && { desc }),
          registerStates: (list: S[]) => {
            for (const state of list) {
              const key = state as unknown as string
              if (!states[key]) states[key] = []
              states[key].push(String(id))
            }
          },
        } as unknown as Reaction<C, S, I> & { registerStates: (list: S[]) => void }
      },
    }),
  }))

  for (const [list, reaction] of chainResult) reaction.registerStates(list)

  if (Object.keys(reactions).length === 0) return null
  return { reactions, states }
}
/**
 * Анализирует функцию update для извлечения полей
 */
export function extractFields<C extends Schema, S extends string, I extends Core>(reaction: ReactionAction<C, S, I>) {
  const updateStr = reaction.toString()
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
