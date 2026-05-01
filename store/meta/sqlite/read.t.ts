import type {FieldDefinition, FieldKey, Mass, MetaDSL, NodeMeta} from "../../.."
import type {MatterRelationParticle} from "./matter.t.ts"

/**
 * Runtime-проекция канонизированной меты для потребителей Dark/Boundary/Bulk.
 * Содержит read-only снимок DSL без ORM-инстансов.
 *
 * @property src канонический SRC адрес меты
 * @property name локальное имя
 * @property fieldSchemas плоская схема полей (ключ → DSL FieldDefinition)
 * @property superposition схема переходов состояний
 * @property processes описание процессов меты
 * @property reactions описание реакций меты
 * @property matter описание topology declaration меты
 * @property bulk описание bulk-секции меты
 * @property mass канонический mass-слой
 */
export interface MetaInit {
  src: string
  name?: MetaDSL["name"]
  fieldSchemas?: Record<FieldKey, FieldDefinition>
  superposition?: MetaDSL["superposition"]
  processes?: MetaDSL["processes"]
  reactions?: MetaDSL["reactions"]
  matter?: MetaDSL["matter"]
  bulk?: MetaDSL["bulk"]
  mass?: Mass | NodeMeta["mass"]
}

export interface DarkMetaParticleModel {
  meta: MetaInit
  particles: MatterRelationParticle[]
}
