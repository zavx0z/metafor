import type { Schema, Values } from "@zavx0z/context"
import type { Core } from "../atom/gravity.t"
import type { ReactionFilterConditions } from "../atom/src/condition.t"
import type { ReactionsDeclaration, Reaction, ReactionsSchema, ReactionAction } from "./reactions.t"
import type { Self } from "./metafor"
import { destroyAppendArg, extractFields, updateAppendArg } from "./parser/func"
import { Source } from "../atom/electromagnetic.t"
export type { ReactionsDeclaration, ReactionsSchema }

export const reactionsSchema = <C extends Schema, S extends string, I extends Core = {}>(
  builder: ReactionsDeclaration<C, S, I>
): ReactionsSchema | null => {
  const reactions: Record<string, any> = {}
  const states: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { label?: string; desc?: string }) => ({
    filter: (filter: (params: { self: Self; context: Values<C> }) => ReactionFilterConditions) => ({
      equal: (update: ReactionAction<C, S, I>) => {
        const { read, write } = extractFields(update)
        const label = config?.label || ""
        const desc = config?.desc
        const id = reactionAutoId++

        // const fnTrim = trimArrow(update.toString()) // FIXME: или не обрезать или проверять на rest
        const destroySrc = destroyAppendArg(update.toString(), `"${Source.Reaction}:${id}"`)
        const src = updateAppendArg(destroySrc, `"${Source.Reaction}:${id}"`)

        reactions[id] = {
          label,
          ...(desc && { desc }),
          cond: filter.toString(),
          read,
          write,
          src,
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
