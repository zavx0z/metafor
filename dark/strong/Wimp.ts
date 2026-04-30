import type {Mass, MetaDSL, NodeMeta} from "../../index.ts"
import type {WimpInit} from "@dark/types/strong"
import type {Meta} from "./Meta.ts"
import {BaseParticle} from "./part.ts"

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

  constructor(init: WimpInit) {
    super(init)
    this.metaSrc = init.meta?.src ?? init.src
    this.meta = init.meta ?? null
    this.fields = init.fields
    this.massOverride = init.mass
  }

  get src(): string {
    return this.meta?.src ?? this.metaSrc
  }

  get name(): MetaDSL["name"] | undefined {
    return this.meta?.name
  }

  get superposition(): MetaDSL["superposition"] | undefined {
    return this.meta?.superposition
  }

  get processes(): MetaDSL["processes"] | undefined {
    return this.meta?.processes
  }

  get reactions(): MetaDSL["reactions"] | undefined {
    return this.meta?.reactions
  }

  get matter(): MetaDSL["matter"] | undefined {
    return this.meta?.matter
  }

  get bulk(): MetaDSL["bulk"] | undefined {
    return this.meta?.bulk
  }

  get mass(): Mass | NodeMeta["mass"] | undefined {
    return this.massOverride ?? this.meta?.mass
  }

  set mass(value: Mass | NodeMeta["mass"] | undefined) {
    this.massOverride = value
  }

  /** Instance-level override `mass`, если он задан отдельно от `Meta`. */
  get instanceMassOverride(): Mass | NodeMeta["mass"] | undefined {
    return this.massOverride === undefined ? undefined : structuredClone(this.massOverride)
  }
}
