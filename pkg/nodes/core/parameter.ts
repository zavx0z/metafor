export type NodeJsonValue = null | boolean | number | string | readonly NodeJsonValue[] | NodeJsonObject

export type NodeJsonObject = Readonly<{
  [key: string]: NodeJsonValue
}>

export type ParameterSnapshot<
  T extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  revision: number
  value: T
  presentation: TPresentation
}>

/** Read-only Parameter surface used by NodeTree without knowing a concrete value kind. */
export type ParameterReference<
  T extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  revision: number
  value: T
  presentation: TPresentation
  snapshot(): ParameterSnapshot<T, TPresentation>
  subscribe(listener: () => void): () => void
}>

/**
 * Live, presentation-neutral value owned by one Node Parameter.
 *
 * Values and presentation metadata are copied into deeply frozen JSON data.
 * Equality is structural, so setting an equivalent immutable value is a no-op.
 */
export class Parameter<
  T extends NodeJsonValue,
  TPresentation extends NodeJsonValue = null,
> implements ParameterReference<T, TPresentation> {
  readonly #id: string
  readonly #presentation: TPresentation
  readonly #listeners = new Set<() => void>()
  #value: T
  #revision = 0

  constructor(id: string, initialValue: T, presentation: TPresentation = null as TPresentation) {
    this.#id = requireIdentifier(id, "Parameter")
    this.#value = ownNodeJsonValue(initialValue, `Parameter value: ${id}`)
    this.#presentation = ownNodeJsonValue(presentation, `Parameter presentation: ${id}`)
  }

  get id(): string {
    return this.#id
  }

  get revision(): number {
    return this.#revision
  }

  get value(): T {
    return this.#value
  }

  get presentation(): TPresentation {
    return this.#presentation
  }

  set(value: T): boolean {
    if (equalNodeJsonValue(this.#value, value)) return false
    this.#value = ownNodeJsonValue(value, `Parameter value: ${this.#id}`)
    this.#revision += 1
    const errors: unknown[] = []
    for (const listener of [...this.#listeners]) {
      try {
        listener()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `Parameter listeners failed after commit: ${this.#id}`)
    }
    return true
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  snapshot(): ParameterSnapshot<T, TPresentation> {
    return Object.freeze({
      id: this.#id,
      revision: this.#revision,
      value: this.#value,
      presentation: this.#presentation,
    })
  }

  toJSON(): ParameterSnapshot<T, TPresentation> {
    return this.snapshot()
  }
}

/** Creates an owned, deeply frozen JSON value and rejects ambiguous runtime data. */
export function ownNodeJsonValue<T extends NodeJsonValue>(value: T, label = "Node JSON value"): T {
  return ownNodeJsonValueAt(value, label, new Set<object>()) as T
}

/** Structural equality used for Parameter no-op detection. */
export function equalNodeJsonValue(left: NodeJsonValue, right: NodeJsonValue): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (isNodeJsonArray(left) || isNodeJsonArray(right)) {
    if (!isNodeJsonArray(left) || !isNodeJsonArray(right) || left.length !== right.length) return false
    return left.every((entry, index) => equalNodeJsonValue(entry, right[index]!))
  }
  if (typeof left !== "object" || typeof right !== "object") return false
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false
  for (const [key, value] of leftEntries) {
    if (!Object.hasOwn(right, key) || !equalNodeJsonValue(value, right[key]!)) return false
  }
  return true
}

function isNodeJsonArray(value: NodeJsonValue): value is readonly NodeJsonValue[] {
  return Array.isArray(value)
}

function ownNodeJsonValueAt(value: NodeJsonValue, label: string, ancestors: Set<object>): NodeJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite numbers`)
    return value
  }
  if (typeof value !== "object") throw new TypeError(`${label} must be JSON-compatible`)
  if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles`)
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((entry, index) => ownNodeJsonValueAt(entry, `${label}[${index}]`, ancestors)))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain objects`)
    }
    const entries = Object.entries(value).map(([key, entry]) => [
      key,
      ownNodeJsonValueAt(entry, `${label}.${key}`, ancestors),
    ] as const)
    return Object.freeze(Object.fromEntries(entries))
  } finally {
    ancestors.delete(value)
  }
}

function requireIdentifier(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} id must be non-empty`)
  return value
}
