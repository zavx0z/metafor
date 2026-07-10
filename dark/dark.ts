import ".."
import type {MatterEdgeSlot, MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "@metafor/types/force/particle"
import {Force} from "force"
import {loadMeta} from "./load.ts"

const force = new Force("dark")

force.onImpulse = async (impulse) => {
  for (const part of impulse.parts) {
    if (part.part === "inflaton" && part.op === "test" && typeof part.path === "string") {
      await matter(part.path)
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const declaration = (src: string, dsl: MetaDSL): {parts: Particle[]; children: string[]} => {
  const fields: Record<string, Record<string, unknown>> = {}
  const variants: Record<string, Record<string, unknown>> = {}
  const states: Record<string, Record<string, unknown>> = {}
  const transitions: Record<string, Record<string, unknown>> = {}
  const conditions: Record<string, Record<string, unknown>> = {}
  const processes: Record<string, Record<string, unknown>> = {}
  const reactions: Record<string, Record<string, unknown>> = {}
  const matter: Record<string, Record<string, unknown>> = {}
  const fieldIds = new Map<string, string>()
  const stateIds = new Map<string, string>()

  let variantNumber = 0
  for (let index = 0; index < dsl.fields.length; index++) {
    const field = dsl.fields[index]!
    const id = String(index + 1)
    fieldIds.set(field.key, id)

    if (field.type === "enum") {
      const {values, ...definition} = field
      fields[id] = definition
      for (let position = 0; position < (values?.length ?? 0); position++) {
        variants[String(++variantNumber)] = {
          field: id,
          position,
          value: values![position],
        }
      }
    } else {
      fields[id] = {...field}
    }
  }

  for (let index = 0; index < dsl.superposition.length; index++) {
    const state = dsl.superposition[index]!
    const id = String(index + 1)
    stateIds.set(state.name, id)
    states[id] = {name: state.name, position: index}
  }

  let transitionNumber = 0
  let conditionNumber = 0
  for (const state of dsl.superposition) {
    const from = stateIds.get(state.name)!
    if (!isRecord(state.transitions)) continue

    let position = 0
    for (const [toName, transitionConditions] of Object.entries(state.transitions)) {
      const to = stateIds.get(toName)
      if (!to) throw new Error(`Transition from "${state.name}" references unknown state "${toName}" in "${src}"`)

      const transition = String(++transitionNumber)
      transitions[transition] = {from, to, position}
      position++

      if (!isRecord(transitionConditions)) continue
      let conditionPosition = 0
      for (const [fieldKey, predicate] of Object.entries(transitionConditions)) {
        const field = fieldIds.get(fieldKey)
        if (!field) throw new Error(`Transition from "${state.name}" references unknown field "${fieldKey}" in "${src}"`)
        conditions[String(++conditionNumber)] = {
          transition,
          field,
          position: conditionPosition,
          predicate,
        }
        conditionPosition++
      }
    }
  }

  const fieldReferences = (keys: readonly string[] | undefined, owner: string): string[] =>
    (keys ?? []).map((key) => {
      const id = fieldIds.get(key)
      if (!id) throw new Error(`${owner} references unknown field "${key}" in "${src}"`)
      return id
    })

  for (let index = 0; index < (dsl.processes?.length ?? 0); index++) {
    const process = dsl.processes![index]!
    const processDeclaration = process.declaration
    const record: Record<string, unknown> = {
      key: process.key,
      type: processDeclaration.type,
      env: [...(processDeclaration.env ?? [])],
    }
    if (processDeclaration.label !== undefined) record.label = processDeclaration.label
    if (processDeclaration.desc !== undefined) record.desc = processDeclaration.desc

    if (processDeclaration.type === "finally") {
      const {read, ...before} = processDeclaration.before
      record.before = {
        ...before,
        read: fieldReferences(read, `Process "${process.key}" before handler`),
      }
    } else {
      const {read: actionRead, ...action} = processDeclaration.action
      record.action = {
        ...action,
        read: fieldReferences(actionRead, `Process "${process.key}" action`),
      }
      if (processDeclaration.success) {
        const {read, write, ...handler} = processDeclaration.success
        record.success = {
          ...handler,
          read: fieldReferences(read, `Process "${process.key}" success handler`),
          write: fieldReferences(write, `Process "${process.key}" success handler`),
        }
      }
      if (processDeclaration.error) {
        const {read, write, ...handler} = processDeclaration.error
        record.error = {
          ...handler,
          read: fieldReferences(read, `Process "${process.key}" error handler`),
          write: fieldReferences(write, `Process "${process.key}" error handler`),
        }
      }
    }

    processes[String(index + 1)] = record
  }

  for (let index = 0; index < (dsl.reactions?.length ?? 0); index++) {
    const reaction = dsl.reactions![index]!
    reactions[String(index + 1)] = {
      key: reaction.key,
      label: reaction.label,
      desc: reaction.desc ?? null,
      cond: reaction.cond,
      src: reaction.src,
      read: fieldReferences(reaction.read, `Reaction "${reaction.key}"`),
      write: fieldReferences(reaction.write, `Reaction "${reaction.key}"`),
      states: (reaction.states ?? []).map((name) => {
        const id = stateIds.get(name)
        if (!id) throw new Error(`Reaction "${reaction.key}" references unknown state "${name}" in "${src}"`)
        return id
      }),
    }
  }

  const children: string[] = []
  let matterNumber = 0
  const addMatter = (
    particle: MatterParticle,
    parent: string | null,
    edgeSlot: MatterEdgeSlot,
    position: number,
  ): void => {
    const id = String(++matterNumber)
    const {children: particleChildren, ...definition} = particle
    matter[id] = {
      parent,
      edgeSlot,
      position,
      ...definition,
    }
    if (particle.kind === "wimp") children.push(particle.src)

    for (let index = 0; index < (particleChildren?.length ?? 0); index++) {
      const child = particleChildren![index]!
      addMatter(child.particle, id, child.edgeSlot, index)
    }
  }

  for (let index = 0; index < (dsl.matter?.length ?? 0); index++) {
    addMatter(dsl.matter![index]!, null, "root", index)
  }

  const parts: Particle[] = [
    {
      part: "inflaton",
      op: "replace",
      path: src,
      value: {meta: {name: dsl.name, desc: dsl.desc ?? null}},
    },
    {part: "inflaton", op: "replace", path: src, value: {fields}},
    {part: "inflaton", op: "replace", path: src, value: {variants}},
    {part: "inflaton", op: "replace", path: src, value: {states}},
    {part: "inflaton", op: "replace", path: src, value: {transitions}},
    {part: "inflaton", op: "replace", path: src, value: {conditions}},
    {part: "inflaton", op: "replace", path: src, value: {processes}},
    {part: "inflaton", op: "replace", path: src, value: {reactions}},
    {part: "inflaton", op: "replace", path: src, value: {matter}},
    {part: "inflaton", op: "replace", path: src, value: {mass: dsl.mass ?? null}},
    {part: "inflaton", op: "replace", path: src, value: {bulk: dsl.bulk ?? null}},
  ]

  return {parts, children}
}

/**
 * Читает root meta и все явно представленные в её matter-графе дочерние WIMP,
 * затем отправляет их declaration stream одним атомарным Force-сообщением.
 */
export async function matter(src: string): Promise<void> {
  const seen = new Set<string>()
  const parts: Particle[] = []

  const read = async (address: string): Promise<void> => {
    if (seen.has(address)) return
    seen.add(address)

    const result = declaration(address, await loadMeta(address))
    parts.push(...result.parts)
    for (const child of result.children) await read(child)
  }

  await read(src)
  force.impulse({parts})
}
