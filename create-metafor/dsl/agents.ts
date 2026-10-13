import type {Fields} from "@metafor/types/metafor/fields"
import type {Mass} from "@metafor/types/metafor/schema"
import type {AgentConfiguration, AgentElement, AgentToolReference, AgentsContext, AgentsDeclaration} from "@metafor/types/metafor/agents"
import type {MatterFields, MatterSchema, MatterWimp} from "@metafor/types/metafor/matter"
import {validateMatterSchema} from "shared/metafor/matter"
import {isMetaPackageName} from "@metafor/types/metafor/graph"
import {Fragment, isAgentElement} from "./jsx-runtime.ts"

const identifier = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/
const fail = (message: string): never => {throw new Error(`Agents declaration: ${message}`)}
const keys = (props: Readonly<Record<string, unknown>>, allowed: readonly string[], required: readonly string[] = []) => {
  if (Object.keys(props).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(props, key))) fail("unsupported or missing props")
}
const id = (value: unknown): string => {
  if (typeof value !== "string" || !identifier.test(value)) return fail("id must be a bounded identifier")
  return value
}

const jsonData = (input: unknown, seen = new Set<object>(), depth = 0): import("@metafor/types/metafor/agents").AgentJsonValue => {
  if (depth > 32) return fail("tool input nesting exceeds its limit")
  if (input === null || typeof input === "string" || typeof input === "boolean") return input
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (!input || typeof input !== "object" || seen.has(input)) return fail("tool input must be acyclic JSON data")
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return fail("tool input must be plain JSON data")
  seen.add(input)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (Reflect.ownKeys(input).some(key => typeof key !== "string") || Object.values(descriptors).some(value => !Object.hasOwn(value, "value"))) return fail("tool input cannot contain accessors or symbols")
    if (Array.isArray(input)) {
      if (Object.keys(input).length !== input.length || Array.from({length: input.length}, (_value, index) => !Object.hasOwn(input, index)).some(Boolean)) return fail("tool input arrays must be dense JSON data")
      return Object.freeze(input.map(value => jsonData(value, seen, depth + 1)))
    }
    return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, jsonData(descriptor.value, seen, depth + 1)])))
  } finally {seen.delete(input)}
}

/** Lowers one inert JSX callback into existing Matter, retaining parent Field bindings. */
export function agentsSchema<ɸ extends Fields, m extends Mass>(declaration: AgentsDeclaration<ɸ, m>, fields: MatterFields, massDeclarations: readonly {key: string; format: string}[]): MatterSchema {
  if (typeof declaration !== "function") return fail("callback is required")
  const references = new WeakSet<object>()
  const tools = new WeakSet<object>()
  const ref = <T extends object>(value: T): Readonly<T> => {references.add(value); return Object.freeze(value)}
  const value = Object.fromEntries(Object.keys(fields).map(key => [key, ref({kind: "field", key})]))
  const mass = Object.fromEntries(massDeclarations.map(({key}) => [key, ref({kind: "mass", key})]))
  const atom = ref({kind: "atom" as const, scope: "owner" as const})
  const oracle = ref({kind: "oracle", tool(name: unknown, input: unknown, owner?: unknown): AgentToolReference {
    if (typeof name !== "string" || !identifier.test(name)) return fail("tool name must be a bounded identifier")
    const data = jsonData(input)
    if (JSON.stringify(data).length > 64 * 1024) return fail("tool input exceeds its size limit")
    let owningMeta: {meta: string} | undefined
    if (owner !== undefined) {
      const declaration = jsonData(owner)
      if (!declaration || typeof declaration !== "object" || Array.isArray(declaration) || Object.keys(declaration).length !== 1 ||
          !("meta" in declaration) || !isMetaPackageName(declaration.meta)) return fail("tool owner must name one public Meta")
      owningMeta = Object.freeze({meta: declaration.meta as string})
    }
    const result = Object.freeze({kind: "oracle-tool" as const, name, input: data, ...(owningMeta ? {owner: owningMeta} : {})})
    tools.add(result)
    return result
  }})
  const context = Object.freeze({atom, value: Object.freeze(value), mass: Object.freeze(mass), oracle,
    graph: ref({kind: "graph"}), force: ref({kind: "force"})}) as unknown as AgentsContext<ɸ, m>
  const flatten = (input: unknown): AgentElement[] => {
    if (input === null || input === false) return []
    if (Array.isArray(input)) return input.flatMap(flatten)
    if (!isAgentElement(input)) return fail("children must be agent/display JSX declarations")
    if (input.tag === Fragment) {keys(input.props, ["children"]); return flatten(input.props.children ?? null)}
    return [input]
  }
  const used = new Set<string>()
  const particles: MatterSchema = flatten(declaration(context)).map(element => {
    if (element.tag !== "agent") return fail("only agent is allowed at the root")
    const props = element.props
    keys(props, ["id", "enabled", "atom", "task", "answer", "status", "error", "providerBinding", "providerBootstrap", "providerRegistry", "tools", "children"], ["id", "task", "answer", "status", "error"])
    if (props.atom !== undefined && props.atom !== atom) return fail("agent must mount on its owning Atom reference")
    const agentId = id(props.id)
    if (used.has(agentId)) return fail(`duplicate agent id ${agentId}`)
    used.add(agentId)
    const requestedTools = props.tools ?? []
    if (!Array.isArray(requestedTools) || requestedTools.length > 64 || requestedTools.some(tool => !tool || typeof tool !== "object" || !tools.has(tool))) return fail("tools must come from this Oracle context within its limit")
    if (new Set(requestedTools.map(tool => JSON.stringify(tool))).size !== requestedTools.length) return fail("duplicate tools")
    const displayIds = new Set<string>()
    const displays: AgentConfiguration["displays"] = flatten(props.children ?? null).map(display => {
      if (display.tag !== "display") return fail("agent children must be displays")
      keys(display.props, ["id", "source"], ["id", "source"])
      const displayId = id(display.props.id)
      if (displayIds.has(displayId)) return fail(`duplicate display id ${displayId}`)
      displayIds.add(displayId)
      const source = display.props.source
      if (!source || typeof source !== "object" || !references.has(source)) return fail("display source must come from this context")
      const descriptor = source as {kind: unknown, key?: string}
      if (!["atom", "mass", "graph", "force", "oracle"].includes(String(descriptor.kind))) return fail("unsupported display source")
      return {id: displayId, source: descriptor.kind === "atom" ? {kind: "atom", scope: "owner"} : descriptor.kind === "mass" ? {kind: "mass", key: descriptor.key!} : {kind: descriptor.kind as "graph" | "force" | "oracle"}}
    })
    const configuration: AgentConfiguration = {id: agentId, atom: {kind: "atom", scope: "owner"},
      presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
      tools: structuredClone(requestedTools), displays}
    const dependencies: string[] = []
    const bindings = ["task", "answer", "status", "error", ...["providerBinding", "providerBootstrap"].filter(key => Object.hasOwn(props, key))].map(key => {
      const binding = props[key]
      if (binding === null || typeof binding === "string") return `${key}:${JSON.stringify(binding)}`
      if (!binding || typeof binding !== "object" || !references.has(binding)) return fail(`${key} must be a parent string Field reference or literal`)
      const field = binding as {kind: string, key: string}
      if (field.kind !== "field" || fields[field.key]?.type !== "string") return fail(`${key} must refer to a string Field`)
      let index = dependencies.indexOf(field.key)
      if (index < 0) {index = dependencies.length; dependencies.push(field.key)}
      return `${key}:_[${index}]`
    })
    bindings.push(`configuration:${JSON.stringify(JSON.stringify(configuration))}`)
    let registry: {key: string} | undefined
    if (props.providerRegistry !== undefined) {
      const source = props.providerRegistry
      if (!source || typeof source !== "object" || !references.has(source) || (source as {kind?: unknown}).kind !== "mass") return fail("providerRegistry must reference this context's JSON Mass")
      const key = (source as {key: string}).key
      if (massDeclarations.find(declaration => declaration.key === key)?.format !== "json") return fail("providerRegistry requires JSON Mass")
      registry = {key}
      bindings.push("providerRegistryShared:true")
    }
    let source = "@metafor/agent"
    if (props.enabled !== undefined && props.enabled !== true) {
      source = "@metafor/agent-slot"
      if (props.enabled === false) bindings.push("enabled:false")
      else {
        const enabled = props.enabled
        if (!enabled || typeof enabled !== "object" || !references.has(enabled)) return fail("enabled must be a boolean or this context's boolean Field")
        const field = enabled as {kind: string, key: string}
        if (field.kind !== "field" || fields[field.key]?.type !== "boolean") return fail("enabled must refer to a boolean Field")
        let index = dependencies.indexOf(field.key)
        if (index < 0) {index = dependencies.length; dependencies.push(field.key)}
        bindings.push(`enabled:_[${index}]`)
      }
    }
    const particle: MatterWimp = {kind: "wimp", src: source, fieldsBinding: {
      // Existing Matter descriptors require a dependency even for a constant
      // object. The state slot is ignored by a literal-only expression.
      data: dependencies.length ? dependencies.length === 1 ? dependencies[0]! : dependencies : "/state",
      expr: `{${bindings.join(",")}}`,
    }, ...(registry ? {massBinding: {data: `/mass/${registry.key}`, expr: "{ providerRegistry: _[0] }", directMass: {kind: "keys" as const, entries: [{target: "providerRegistry", source: registry.key}]}}} : {})}
    return particle
  })
  validateMatterSchema(particles, fields, {label: "agents"})
  return particles
}
