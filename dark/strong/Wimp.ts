import type { Mass, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { WimpInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

/**
 * Канонический meta-узел Dark object graph.
 *
 * `Wimp` хранит локальные AST-данные и materialized ORM-поля своей meta,
 * а topology раскрывается через дочерние частицы в `children`.
 */
export class Wimp extends BaseParticle {
  /** SRC-адрес загружаемой meta. */
  src: string
  /** Локальное имя meta после загрузки AST. */
  name: MetaAST["name"] | undefined
  /** Локальный object graph полей этой meta. */
  fields: WimpInit["fields"]
  /** Локальная схема переходов состояний. */
  superposition: MetaAST["superposition"] | undefined
  /** Локальные процессы meta. */
  processes: MetaAST["processes"] | undefined
  /** Локальные реакции meta. */
  reactions: MetaAST["reactions"] | undefined
  /** Downstream bulk-описание meta. */
  bulk: MetaAST["bulk"] | undefined
  /** Runtime `mass`, принадлежащая этому `Wimp`. */
  mass: Mass | NodeMeta["mass"] | undefined

  constructor(init: WimpInit) {
    super(init)
    this.src = init.src
    this.name = init.name
    this.fields = init.fields
    this.superposition = init.superposition
    this.processes = init.processes
    this.reactions = init.reactions
    this.bulk = init.bulk
    this.mass = init.mass
  }
}
