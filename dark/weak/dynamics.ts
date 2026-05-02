import type { MetaDSL } from "../.."
import type { Wimp } from "@store/wimp/sqlite"
import type { ParsedProcess } from "../../process.t.ts"
import type { ParsedDestroy } from "../../finally.t.ts"
import type { ReactionsSchema } from "../../reactions.t.ts"

const normalizePredicate = (predicate: unknown): Record<string, unknown> | undefined => {
  if (predicate === null) return { null: true }
  if (typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string") {
    return { eq: predicate }
  }
  if (predicate && typeof predicate === "object") return predicate as Record<string, unknown>
  return undefined
}

export async function fillWeakDynamics(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  const superposition = (dsl.superposition ?? {}) as Record<string, unknown>

  // 1. States — порядок по Object.keys (как было в старом bulk-create).
  for (const stateName of Object.keys(superposition)) {
    await wimp.superposition.add(stateName)
  }

  // 2. Transitions + Conditions + Predicates
  for (const [fromName, transitions] of Object.entries(superposition)) {
    if (!transitions || typeof transitions !== "object") continue
    const fromState = await wimp.superposition.get({ name: fromName })
    if (!fromState) continue

    for (const [toName, cond] of Object.entries(transitions as Record<string, unknown>)) {
      const toState = await wimp.superposition.get({ name: toName })
      if (!toState) continue
      const transition = await fromState.transitions.add(toName)

      if (!cond || typeof cond !== "object") continue

      for (const [fieldKey, predicate] of Object.entries(cond as Record<string, unknown>)) {
        const condition = await transition.conditions.add(fieldKey)
        if (!condition) continue

        const normalized = normalizePredicate(predicate)
        if (normalized) {
          for (const [op, val] of Object.entries(normalized)) {
            await condition.predicates.add(op, val)
          }
        }
      }
    }
  }

  // 3. Processes (action + finally)
  for (const [key, raw] of Object.entries(dsl.processes ?? {})) {
    const proc = raw as ParsedProcess | ParsedDestroy
    const process = await wimp.processes.add({
      key,
      type: proc.type === "finally" ? "finally" : "action",
      label: proc.label ?? null,
      desc: proc.desc ?? null,
    })

    for (const env of proc.env ?? []) {
      await process.env.add(env)
    }

    if (proc.type === "finally") {
      const destroy = proc as ParsedDestroy
      await process.finally.setBefore(destroy.before.src)
      for (const fieldKey of destroy.before.read ?? []) {
        await process.finally.read.add(fieldKey)
      }
      continue
    }

    const action = proc as ParsedProcess
    await process.action.set({
      src: action.action.src,
      importSpecifier: action.action.importSpecifier ?? null,
      wrapperSrc: action.action.wrapperSrc ?? null,
      success: action.success?.src ?? null,
      error: action.error?.src ?? null,
    })

    for (const fieldKey of action.action.read ?? []) {
      await process.action.read.add("action", fieldKey)
    }
    for (const fieldKey of action.success?.read ?? []) {
      await process.action.read.add("success", fieldKey)
    }
    for (const fieldKey of action.error?.read ?? []) {
      await process.action.read.add("error", fieldKey)
    }
    for (const fieldKey of action.success?.write ?? []) {
      await process.action.write.add("success", fieldKey)
    }
    for (const fieldKey of action.error?.write ?? []) {
      await process.action.write.add("error", fieldKey)
    }
  }

  // 4. Reactions
  const rs = dsl.reactions as ReactionsSchema | undefined
  if (rs) {
    for (const [id, r] of Object.entries(rs.reactions)) {
      const reaction = await wimp.reactions.add({
        key: id,
        label: r.label,
        desc: r.desc ?? null,
        cond: r.cond,
        src: r.src,
      })
      for (const fieldKey of r.read ?? []) await reaction.read.add(fieldKey)
      for (const fieldKey of r.write ?? []) await reaction.write.add(fieldKey)
      for (const [state, reactionIds] of Object.entries(rs.superposition)) {
        if (reactionIds.includes(id)) await reaction.states.add(state)
      }
    }
  }
}
