import type { Schema, Values } from "@zavx0z/context"
import type { Mass } from "../atom/gravity.t"
import type { ReactionFilterConditions } from "../atom/src/condition.t"
import type { ReactionsDeclaration, Reaction, ReactionsSchema, ReactionAction } from "./reactions.t"
import type { Self } from "./metafor"
import { extractFields, normalizeFunctionString, updateAppendArg } from "./parser/func"
import { Initiator } from "../atom/em.t"
export type { ReactionsDeclaration, ReactionsSchema }

export const reactionsSchema = <C extends Schema, 𝛴 extends string, m extends Mass = {}>(
  builder: ReactionsDeclaration<C, S, M>
): ReactionsSchema | null => {
  const reactions: Record<string, any> = {}
  const superposition: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { label?: string; desc?: string }) => ({
    filter: (filter: (params: { self: Self; fields: Values<ɸ> }) => ReactionFilterConditions) => ({
      equal: (update: ReactionAction<C, S, M>) => {
        const { read, write } = extractFields(update)
        const label = config?.label || ""
        const desc = config?.desc
        const id = reactionAutoId++

        // const fnTrim = trimArrow(update.toString()) // FIXME: или не обрезать или проверять на rest
        const src = normalizeFunctionString(updateAppendArg(update.toString(), `"${Initiator.Reaction}:${id}"`))

        reactions[id] = {
          label,
          ...(desc && { desc }),
          cond: normalizeFunctionString(filter.toString()),
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
              if (!superposition[key]) superposition[key] = []
              superposition[key].push(String(id))
            }
          },
        } as unknown as Reaction<C, S, M> & { registerStates: (list: S[]) => void }
      },
    }),
  }))

  for (const [list, reaction] of chainResult) reaction.registerStates(list)

  if (Object.keys(reactions).length === 0) return null
  return { reactions, superposition }
}
