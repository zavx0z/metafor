import type {AgentChildren, AgentDisplayProps, AgentElement, AgentProps} from "@metafor/types/metafor/agents"

export const Fragment = Symbol("MetaFor.agents.Fragment")
const declarations = new WeakSet<object>()

const declarationChildren = (value: unknown): boolean => value === null || value === false || isAgentElement(value) || Array.isArray(value) && value.every(declarationChildren)

/** Creates inert agent/display declarations and evaluates pure declaration components. */
export function jsx(tag: unknown, props: unknown, key?: unknown): AgentElement {
  if (key !== undefined) throw new Error("Agents JSX uses id, not key")
  if (props !== null && props !== undefined && (typeof props !== "object" || Array.isArray(props))) throw new Error("Agents JSX props must be an object")
  const attributes = Object.freeze({...props as Record<string, unknown> | undefined})
  if (typeof tag === "function") {
    const children: unknown = tag(attributes)
    if (!declarationChildren(children)) throw new Error("Agents JSX component must return synchronous declarative children")
    return jsx(Fragment, {children})
  }
  if (tag !== "agent" && tag !== "display" && tag !== Fragment) throw new Error("Agents JSX supports only agent, display, Fragment and declaration components")
  const element = Object.freeze({tag, props: attributes}) as AgentElement
  declarations.add(element)
  return element
}

export const jsxs = jsx
export const jsxDEV = jsx

export const isAgentElement = (value: unknown): value is AgentElement =>
  value !== null && typeof value === "object" && declarations.has(value)

export namespace JSX {
  export type Element = AgentElement
  export type ElementType = keyof IntrinsicElements | ((props: any) => AgentChildren)
  export interface ElementChildrenAttribute {children: unknown}
  export interface IntrinsicElements {
    agent: AgentProps
    display: AgentDisplayProps
  }
  export type Children = AgentChildren
}
