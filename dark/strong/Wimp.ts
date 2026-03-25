import type { Mass, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { WimpInit } from "@dark/types/strong"
import type { SharedDbMaterializationWriter, SharedDbMetaBundle, SharedDbWimpBundle, SharedDbWimpFieldBundle } from "@shared/db"
import type { Meta } from "./Meta.ts"
import { BaseParticle } from "./part.ts"

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")

const cloneFieldSchema = (schema: NonNullable<Wimp["fields"]>[string]["schema"]) => ({
  type: schema.type,
  required: schema.required === true,
  topology: isTopologyFieldType(schema.type),
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const cloneDefinedValue = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error("Cannot clone undefined value in exactOptionalPropertyTypes context")
  }
  return structuredClone(value)
}

/**
 * Канонический мета-узел объектного графа Dark.
 *
 * `Wimp` остаётся полноценным particle-узлом связности,
 * но meta-level данные получает по ссылке на канонический `Meta`.
 */
export class Wimp extends BaseParticle {
  /** Внутренний SRC-адрес до привязки `Meta` либо для быстрого доступа после неё. */
  private metaSrc: string
  /** Каноническая `Meta`, описывающая этот `Wimp`. */
  meta: Meta | null
  /** Локальный объектный граф полей этой меты. */
  fields: WimpInit["fields"]
  /** Instance-level override для `mass`, если он пришёл не из meta-level source. */
  private massOverride: Mass | NodeMeta["mass"] | undefined

  /**
   * Создаёт пустой или частично materialized `Wimp`.
   *
   * @param init Начальные данные `Wimp`: src, необязательная ссылка на `Meta`, локальные instance fields и связь с родителем.
   */
  constructor(init: WimpInit) {
    super(init)
    this.metaSrc = init.meta?.src ?? init.src
    this.meta = init.meta ?? null
    this.fields = init.fields
    this.massOverride = init.mass
  }

  /**
   * SRC остаётся удобным полем particle-level API, но source of truth живёт в `Meta`.
   */
  get src(): string {
    return this.meta?.src ?? this.metaSrc
  }

  /**
   * Удобный доступ к имени меты через `Meta`.
   */
  get name(): MetaAST["name"] | undefined {
    return this.meta?.name
  }

  /**
   * Удобный доступ к state schema через `Meta`.
   */
  get superposition(): MetaAST["superposition"] | undefined {
    return this.meta?.superposition
  }

  /**
   * Удобный доступ к processes через `Meta`.
   */
  get processes(): MetaAST["processes"] | undefined {
    return this.meta?.processes
  }

  /**
   * Удобный доступ к reactions через `Meta`.
   */
  get reactions(): MetaAST["reactions"] | undefined {
    return this.meta?.reactions
  }

  /**
   * Удобный доступ к matter declaration через `Meta`.
   */
  get matter(): MetaAST["matter"] | undefined {
    return this.meta?.matter
  }

  /**
   * Удобный доступ к bulk через `Meta`.
   */
  get bulk(): MetaAST["bulk"] | undefined {
    return this.meta?.bulk
  }

  /**
   * `mass` остаётся удобным API на уровне `Wimp`,
   * но meta-level значение читается из `Meta`, а временный override остаётся particle-level.
   */
  get mass(): Mass | NodeMeta["mass"] | undefined {
    return this.massOverride ?? this.meta?.mass
  }

  set mass(value: Mass | NodeMeta["mass"] | undefined) {
    this.massOverride = value
  }

  /**
   * Instance-level override `mass`, если он задан отдельно от `Meta`.
   */
  get instanceMassOverride(): Mass | NodeMeta["mass"] | undefined {
    return this.massOverride === undefined ? undefined : structuredClone(this.massOverride)
  }

  private getParentWimpId(): string | undefined {
    let current = this.parent

    while (current) {
      if (current instanceof Wimp) return current.id
      current = current.parent
    }

    return undefined
  }

  /**
   * Строит canonical shared/db bundle meta-level описания текущего `Wimp`.
   */
  toSharedDbMetaBundle(): SharedDbMetaBundle {
    if (!this.meta) {
      throw new Error(`Wimp ${this.id} cannot build shared/db meta bundle before Meta is materialized`)
    }

    const result: SharedDbMetaBundle = {
      id: this.meta.id,
      src: this.meta.src,
      fields: Object.values(this.meta.fields).map((field) => ({
        id: field.id,
        key: field.key,
        schema: cloneFieldSchema(field.schema),
      })),
    }

    if (this.meta.name !== undefined) result.name = cloneDefinedValue(this.meta.name)
    if (this.meta.superposition !== undefined) result.superposition = cloneDefinedValue(this.meta.superposition)
    if (this.meta.processes !== undefined) result.processes = cloneDefinedValue(this.meta.processes)
    if (this.meta.reactions !== undefined) result.reactions = cloneDefinedValue(this.meta.reactions)
    if (this.meta.matter !== undefined) result.matter = cloneDefinedValue(this.meta.matter)
    if (this.meta.bulk !== undefined) result.bulk = cloneDefinedValue(this.meta.bulk)
    if (this.meta.mass !== undefined) result.mass = this.meta.mass as Mass

    return result
  }

  /**
   * Строит canonical shared/db bundle текущего fully-formed `Wimp`.
   */
  toSharedDbBundle(): SharedDbWimpBundle {
    if (!this.meta) {
      throw new Error(`Wimp ${this.id} cannot build shared/db bundle before Meta is materialized`)
    }
    if (!this.fields) {
      throw new Error(`Wimp ${this.id} cannot build shared/db bundle before fields are materialized`)
    }

    const result: SharedDbWimpBundle = {
      id: this.id,
      meta: this.toSharedDbMetaBundle(),
      fields: Object.values(this.fields).map((field, fieldOrder) => {
        const fieldBundle: SharedDbWimpFieldBundle = {
          id: field.id,
          metaFieldId: field.metaField.id,
          fieldOrder,
          key: field.key,
          schema: cloneFieldSchema(field.schema),
          value: structuredClone(field.value),
        }
        if (field.source) fieldBundle.sourceWimpFieldId = field.source.id
        return fieldBundle
      }),
    }

    const parentWimpId = this.getParentWimpId()
    if (parentWimpId !== undefined) result.parentWimpId = parentWimpId
    if (this.massOverride !== undefined) result.massOverride = cloneDefinedValue(this.massOverride)

    return result
  }

  /**
   * Сохраняет текущий canonical shared/db bundle через унифицированный writer.
   */
  save(writer: SharedDbMaterializationWriter): void {
    writer.saveMetaBundle(this.toSharedDbMetaBundle())
    writer.saveWimpBundle(this.toSharedDbBundle())
  }
}
