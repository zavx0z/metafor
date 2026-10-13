/**
Declarative agents lower into ordinary Matter children. References describe the
parent context without reading Graph, Mass or live resources during preparation.
The Agent Meta owns its automatic Chat and executable lifecycle.
@packageDocumentation
*/
import type {Fields, Values} from "./fields.ts"
import type {Mass} from "./schema.ts"

declare const agentFieldValue: unique symbol

export interface AgentFieldReference<T> {
  readonly kind: "field"
  readonly key: string
  readonly [agentFieldValue]?: T
}

export interface AgentMassReference {
  readonly kind: "mass"
  readonly key: string
}

export interface AgentGraphReference {readonly kind: "graph"}
export interface AgentForceReference {readonly kind: "force"}

/** The callback's owning canonical Atom; resolved by the runtime projection. */
export interface AgentAtomReference {
  readonly kind: "atom"
  readonly scope: "owner"
}

/** A tool declaration contains JSON data, never executable closures or grants. */
export type AgentJsonValue = null | string | number | boolean | readonly AgentJsonValue[] | {readonly [key: string]: AgentJsonValue}
export interface AgentToolOwner {readonly meta: string}

/** Declaration of a named tool. Its owner must resolve a real handler before use. */
export interface AgentToolReference<Name extends string = string, Input extends AgentJsonValue = AgentJsonValue> {
  readonly kind: "oracle-tool"
  readonly name: Name
  readonly input: Input
  readonly owner?: AgentToolOwner
}

export interface AgentOracleReference {
  readonly kind: "oracle"
  tool<const Name extends string, const Input extends AgentJsonValue>(name: Name, input: Input, owner?: AgentToolOwner): AgentToolReference<Name, Input>
}

export type AgentDisplaySource = AgentAtomReference | AgentMassReference | AgentGraphReference | AgentForceReference | AgentOracleReference
export type AgentFieldBinding = string | null | AgentFieldReference<string | null>

export interface AgentDisplayProps {
  id: string
  source: AgentDisplaySource
}

export interface AgentProps {
  id: string
  /** Explicit connection switch lowered to an ordinary Matter condition. Omission declares a connected agent. */
  enabled?: boolean | AgentFieldReference<boolean | null>
  atom?: AgentAtomReference
  task: AgentFieldBinding
  answer: AgentFieldBinding
  status: AgentFieldBinding
  error: AgentFieldBinding
  /** Public native assignment ID only; the Chat retains its first binding. */
  providerBinding?: AgentFieldBinding
  /** Public initial catalog seed; Provider consumes it only while its own Mass is empty. */
  providerBootstrap?: AgentFieldBinding
  /** Shares the level's canonical JSON registry; the executor's turns remain private. */
  providerRegistry?: AgentMassReference
  tools?: readonly AgentToolReference[]
  children?: AgentChildren
}

/** A JSX declaration, never a DOM Element or executable component. */
export interface AgentElement {
  readonly tag: "agent" | "display" | symbol
  readonly props: Readonly<Record<string, unknown>>
}

export type AgentChildren = AgentElement | readonly AgentChildren[] | null | false

/** Pure declaration component evaluated only while preparing its owning Meta. */
export type AgentComponent<Props> = (props: Props) => AgentChildren

export interface AgentsContext<ɸ extends Fields = Fields, m extends Mass = Mass> {
  readonly atom: AgentAtomReference
  readonly value: {[K in keyof Values<ɸ>]: AgentFieldReference<Values<ɸ>[K]>}
  readonly oracle: AgentOracleReference
  readonly mass: {[K in keyof m]: AgentMassReference}
  readonly graph: AgentGraphReference
  readonly force: AgentForceReference
}

/** Preparation invokes this callback once and serializes only its Matter result. */
export type AgentsDeclaration<ɸ extends Fields = Fields, m extends Mass = Mass> =
  (context: AgentsContext<ɸ, m>) => AgentChildren

/** Default projection declaration; concrete views and providers keep their owners. */
export interface AgentPresentation {
  readonly kind: "agent-inspector"
  readonly defaultTab: "chat"
  readonly tabs: readonly ["chat", "provider", "tools", "context"]
}

export interface AgentConfiguration {
  id: string
  atom: AgentAtomReference
  presentation: AgentPresentation
  tools: AgentToolReference[]
  displays: Array<{id: string, source: AgentAtomReference | {kind: "mass", key: string} | {kind: "graph" | "force" | "oracle"}}>
}

/** Служебное наблюдение интерфейса; оно не является новой задачей или правом исполнения. */
export interface AgentFeedbackRequest {
  readonly id: string
  readonly text: string
  /** Исходная connection identity сохраняется при повторной доставке. */
  readonly correlation: Readonly<{clientId: string; connectionId: string; annotationId: string}>
}

/** accepted подтверждает запись в Mass беседы; модель при этом не вызывается. */
export interface AgentFeedbackReceipt {readonly id: string; readonly accepted: true; readonly replayed: boolean}

/** Закрытый wire contract для служебной обратной связи выбранному Agent. */
export function parseAgentFeedbackRequest(value: unknown): AgentFeedbackRequest {
  const object = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)
  const exact = (item: Record<string, unknown>, keys: string[]) => Reflect.ownKeys(item).length === keys.length && keys.every(key => Object.hasOwn(item, key))
  const identity = (item: unknown, maximum: number): item is string => typeof item === "string" && item.length > 0 && item.length <= maximum && item.trim() === item && !/[\u0000-\u001f\u007f]/u.test(item)
  if (!object(value) || !exact(value, ["id", "text", "correlation"]) || !identity(value.id, 256) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 65536 ||
      !object(value.correlation) || !exact(value.correlation, ["clientId", "connectionId", "annotationId"]) || !identity(value.correlation.clientId, 256) || !identity(value.correlation.connectionId, 256) || !identity(value.correlation.annotationId, 2048)) throw new TypeError("Invalid Agent service feedback")
  return {id: value.id, text: value.text, correlation: {clientId: value.correlation.clientId, connectionId: value.correlation.connectionId, annotationId: value.correlation.annotationId}}
}
