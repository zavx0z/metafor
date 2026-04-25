import type { MetaDSL } from "../../index.ts"
import type { MetaInit, MetaFields } from "@dark/types/strong"
import { MetaField } from "./MetaField.ts"

const cloneDefined = <T>(value: T | undefined): T | undefined =>
  value === undefined ? undefined : structuredClone(value)

const materializeMetaFields = (
  ownerMeta: Meta,
  fields: MetaInit["fieldSchemas"] | undefined,
): MetaFields =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, schema]) => [key, new MetaField({ ownerMeta, key, schema })]),
  )

/**
 * Каноническая ORM/object model описания меты.
 *
 * `Meta` владеет только meta-level содержимым и не хранит materialized particle graph.
 */
export class Meta {
  /** Канонический идентификатор меты равен её `src`. */
  readonly id: string
  /** Канонический SRC-адрес меты. */
  readonly src: MetaInit["src"]
  /** Локальное имя меты. */
  readonly name: MetaDSL["name"] | undefined
  /** Канонический набор meta-полей. */
  readonly fields: MetaFields
  /** Каноническая схема переходов состояний. */
  readonly superposition: MetaDSL["superposition"] | undefined
  /** Канонические процессы меты. */
  readonly processes: MetaDSL["processes"] | undefined
  /** Канонические реакции меты. */
  readonly reactions: MetaDSL["reactions"] | undefined
  /** Каноническое topology/matter-описание меты. */
  readonly matter: MetaDSL["matter"] | undefined
  /** Канонический bulk-слой меты. */
  readonly bulk: MetaDSL["bulk"] | undefined
  /** Канонический mass-слой меты. */
  readonly mass: MetaInit["mass"]

  constructor(init: MetaInit) {
    this.id = init.src
    this.src = init.src
    this.name = init.name
    this.superposition = structuredClone(init.superposition)
    this.processes = cloneDefined(init.processes)
    this.reactions = cloneDefined(init.reactions)
    this.matter = cloneDefined(init.matter)
    this.bulk = cloneDefined(init.bulk)
    this.mass = cloneDefined(init.mass)
    this.fields = init.fields ?? materializeMetaFields(this, init.fieldSchemas)
  }
}
