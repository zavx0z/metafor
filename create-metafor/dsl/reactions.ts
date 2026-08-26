/**
Builds the serializable Reaction declaration consumed by Boundary.

Source selection is data, never executable code. Field usage comes from the
Reaction function, while Mass access is explicit because filesystem operations
cannot be recovered safely from JavaScript text.

@packageDocumentation
*/

import type {Fields} from "@metafor/types/metafor/fields"
import type {
  Reaction,
  ReactionAction,
  ReactionConfig,
  ReactionsDeclaration,
  ReactionsSchema,
  ReactionSourceSelector,
} from "@metafor/types/metafor/reactions"
import type {Mass} from "@metafor/types/metafor/schema"
import {Initiator} from "@metafor/types/metafor/schema"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {extractFields, normalizeFunctionString, updateAppendArg} from "./action.ts"

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const normalizeSources = (
  sources: readonly [ReactionSourceSelector, ...ReactionSourceSelector[]],
): ReactionSourceSelector[] => sources.map((source, index) => {
  const atom = source.atom?.trim()
  const meta = source.meta?.trim()
  if (!atom && !meta && source.relation === undefined) {
    throw new Error(`Reaction source ${index} must declare atom, meta or relation`)
  }
  if (atom !== undefined && !/^atom:[1-9]\d*$/.test(atom)) {
    throw new Error(`Reaction source ${index} atom must use atom:<positive-id>`)
  }
  if (meta !== undefined && parseMetaAddress(meta) === null) {
    throw new Error(`Reaction source ${index} meta must use <owner>/<repository>`)
  }
  if (source.relation !== undefined && source.relation !== "parent" &&
      source.relation !== "child" && source.relation !== "descendant") {
    throw new Error(`Reaction source ${index} relation is unsupported`)
  }
  const states = unique(source.states.map((state) => state.trim()).filter(Boolean))
  if (states.length === 0) throw new Error(`Reaction source ${index} must declare at least one State`)
  const normalized = {
    ...(atom ? {atom: atom as `atom:${string}`} : {}),
    ...(meta ? {meta} : {}),
    ...(source.relation === undefined ? {} : {relation: source.relation}),
    states: states as [string, ...string[]],
  }
  return normalized
})

export const reactionsSchema = <ɸ extends Fields, 𝛺 extends string, m extends Mass = {}>(
  builder: ReactionsDeclaration<ɸ, 𝛺, m>,
): ReactionsSchema | null => {
  const reactions: ReactionsSchema["reactions"] = {}
  const superposition: Record<string, string[]> = {}

  const chainResult = builder((config: ReactionConfig<m>) => ({
    filter: (rawSources) => ({
      equal: (update: ReactionAction<ɸ, 𝛺, m>) => {
        const key = config.key.trim()
        if (!key) throw new Error("Reaction key is required")
        if (Object.hasOwn(reactions, key)) throw new Error(`Reaction key is duplicated: ${key}`)
        const sources = normalizeSources(rawSources)
        const {read, write} = extractFields(update)
        const massRead = unique((config.mass?.read ?? []).map(String))
        const massWrite = unique((config.mass?.write ?? []).map(String))
        const src = normalizeFunctionString(
          updateAppendArg(update.toString(), `"${Initiator.Reaction}:${key}"`),
        )

        reactions[key] = {
          label: config.label ?? "",
          ...(config.desc ? {desc: config.desc} : {}),
          sources,
          read,
          write,
          massRead,
          massWrite,
          src,
        }

        return {
          key,
          label: config.label ?? "",
          ...(config.desc ? {desc: config.desc} : {}),
          sources,
          update,
          registerStates: (list: 𝛺[]) => {
            for (const state of list) {
              const stateKey = state as string
              if (!superposition[stateKey]) superposition[stateKey] = []
              superposition[stateKey].push(key)
            }
          },
        } as Reaction<ɸ, 𝛺, m> & {registerStates(list: 𝛺[]): void}
      },
    }),
  }))

  for (const [list, reaction] of chainResult) {
    if (list.length === 0) throw new Error(`Reaction "${reaction.key}" must declare at least one target State`)
    reaction.registerStates(unique(list) as 𝛺[])
  }
  return Object.keys(reactions).length === 0 ? null : {reactions, superposition}
}
