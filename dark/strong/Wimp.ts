import type { Mass, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { WimpInit } from "@dark/types/strong"
import type { SharedDbMaterializationWriter, SharedDbWimpTrace } from "@shared/db"
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
   * Строит flat DB-shaped trace текущего fully-formed `Wimp`.
   */
  toSharedDbTrace(): SharedDbWimpTrace {
    if (!this.meta) {
      throw new Error(`Wimp ${this.id} cannot build shared/db trace before Meta is materialized`)
    }
    if (!this.fields) {
      throw new Error(`Wimp ${this.id} cannot build shared/db trace before fields are materialized`)
    }

    return {
      darkWimpId: this.id,
      src: this.src,
      ...(this.name !== undefined ? { name: this.name } : {}),
      fields: Object.values(this.fields).map((field) => ({
        darkFieldId: field.id,
        key: field.key,
        schema: cloneFieldSchema(field.schema),
        value: structuredClone(field.value),
        ...(field.source ? { sourceDarkFieldId: field.source.id } : {}),
      })),
      ...(this.superposition !== undefined ? { superposition: structuredClone(this.superposition) } : {}),
    }
  }

  /**
   * Сохраняет текущий DB-shaped trace через унифицированный shared/db writer.
   */
  save(writer: SharedDbMaterializationWriter): void {
    writer.saveWimpTrace(this.toSharedDbTrace())
  }
}
