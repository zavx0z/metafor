import type { Fields, Values } from "@metafor/types/metafor/fields"
import type { ReactionsDeclaration, Reaction, ReactionsSchema, ReactionAction, ReactionFilterConditions } from "@metafor/types/metafor/reactions"
import { extractFields, normalizeFunctionString, updateAppendArg } from "./action.ts"
import { Initiator, type Mass, type Self } from "@metafor/types/metafor/schema"

export const reactionsSchema = <ɸ extends Fields, 𝛴 extends string, m extends Mass = {}>(
  builder: ReactionsDeclaration<ɸ, 𝛴, m>
): ReactionsSchema | null => {
  const reactions: Record<string, any> = {}
  const superposition: Record<string, string[]> = {}
  let reactionAutoId = 0

  const chainResult = builder((config?: { key?: string; label?: string; desc?: string }) => ({
    filter: (filter: (params: { self: Self; value: Values<ɸ> }) => ReactionFilterConditions) => ({
      equal: (update: ReactionAction<ɸ, 𝛴, m>) => {
        const { read, write } = extractFields(update)
        const label = config?.label || ""
        const desc = config?.desc
        const id = reactionAutoId++
        const reactionKey = config?.key ?? String(id)
        if (Object.hasOwn(reactions, reactionKey)) throw new Error(`Reaction key is duplicated: ${reactionKey}`)

        const src = normalizeFunctionString(updateAppendArg(update.toString(), `"${Initiator.Reaction}:${reactionKey}"`))

        reactions[reactionKey] = {
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
              const stateKey = state as unknown as string
              if (!superposition[stateKey]) superposition[stateKey] = []
              superposition[stateKey].push(reactionKey)
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
