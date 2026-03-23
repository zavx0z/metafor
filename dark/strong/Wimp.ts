import type { Mass, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { WimpInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

/**
 * Канонический мета-узел объектного графа Dark.
 *
 * `Wimp` хранит локальные данные AST и собранные ORM-поля своей меты,
 * а топология раскрывается через дочерние частицы в `children`.
 */
export class Wimp extends BaseParticle {
  /** SRC-адрес загружаемой меты. */
  src: string
  /** Локальное имя меты после загрузки AST. */
  name: MetaAST["name"] | undefined
  /** Локальный объектный граф полей этой меты. */
  fields: WimpInit["fields"]
  /** Локальная схема переходов состояний. */
  superposition: MetaAST["superposition"] | undefined
  /** Локальные процессы меты. */
  processes: MetaAST["processes"] | undefined
  /** Локальные реакции меты. */
  reactions: MetaAST["reactions"] | undefined
  /** Описание `bulk`, передаваемое в следующий слой. */
  bulk: MetaAST["bulk"] | undefined
  /** Значение `mass`, принадлежащее этому `Wimp`. */
  mass: Mass | NodeMeta["mass"] | undefined

  /**
   * Создаёт пустой или частично materialized `Wimp`.
   *
   * @param init Начальные данные `Wimp`: src, необязательные локальные данные меты и связь с родителем.
   */
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
