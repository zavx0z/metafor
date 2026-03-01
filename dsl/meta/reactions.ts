import type { Schema, Values } from "@zavx0z/context"
import type { ReactionsDeclaration, Reaction, ReactionsSchema, ReactionAction, ReactionFilterConditions } from "./reactions.t"
import { extractFields, normalizeFunctionString, updateAppendArg } from "./parser/func"
import { Initiator, type Mass, type Self } from "./metafor.t"
export type { ReactionsDeclaration, ReactionsSchema }

export const reactionsSchema = <ɸ extends Schema, 𝛴 extends string, m extends Mass = {}>(
  builder: ReactionsDeclaration<ɸ, 𝛴, m>
): ReactionsSchema | null => {
  const reactions: Record<string, any> = {}
  const superposition: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { label?: string; desc?: string }) => ({
    filter: (filter: (params: { self: Self; value: Values<ɸ> }) => ReactionFilterConditions) => ({
      equal: (update: ReactionAction<ɸ, 𝛴, m>) => {
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
          registerStates: (list: 𝛴[]) => {
            for (const state of list) {
              const key = state as unknown as string
              if (!superposition[key]) superposition[key] = []
              superposition[key].push(String(id))
            }
          },
        } as unknown as Reaction<ɸ, 𝛴, m> & { registerStates: (list: 𝛴[]) => void }
      },
    }),
  }))

  for (const [list, reaction] of chainResult) reaction.registerStates(list)

  if (Object.keys(reactions).length === 0) return null
  return { reactions, superposition }
}
