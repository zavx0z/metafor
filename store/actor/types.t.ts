/**
 * Канонические record-типы инстансного слоя (actor).
 *
 * Один актор — это запущенный экземпляр меты со своим состоянием:
 * полями, значениями, текущей фазой FSM и связями с другими акторами.
 * Render-данные (визуализация) здесь не хранятся — они вычислимы из
 * `actor + meta + layoutConfig` и живут в render-слое.
 *
 * Все ID — TEXT-идентификаторы. Стабильные UUID-ы, генерируемые при
 * создании сущности.
 */

export type ActorScalarKind = "null" | "boolean" | "number" | "string" | "enum"
export type ActorValueKind = ActorScalarKind | "list"

/** Скалярная или enum-часть значения, заполняется одна из колонок в зависимости от kind. */
export interface ActorScalar {
  kind: ActorScalarKind
  boolean?: boolean
  number?: number
  text?: string
  /** UUID `field_enum_variant` из meta-декларации (для kind === "enum"). */
  variant?: string
}

/** Один запущенный актор — инстанс меты. */
export interface ActorRecord {
  uuid: string
  /** Канонический `src` корневой меты мира, к которому актор принадлежит. */
  world: string
  /** Канонический `src` меты, по которой актор работает. */
  metaSrc: string
  /** Порядок появления актора в мире (стабилен между запусками для детерминированной материализации). */
  position: number
}

/** Связь родитель → потомок. Одна запись на каждого ребёнка. */
export interface ActorEdgeRecord {
  /** UUID дочернего актора. */
  child: string
  /** UUID родительского актора (NULL у корневого актора мира). */
  parent: string | null
  /** Позиция среди братьев. */
  position: number
}

/** Поле-инстанс актора, соответствует одному `field` из meta-схемы. */
export interface ActorFieldRecord {
  uuid: string
  /** UUID родительского актора. */
  actor: string
  /** UUID `field` из meta-декларации. */
  metaField: string
  /** Порядок поля внутри актора (зеркалирует порядок в meta-схеме). */
  position: number
}

/** Текущее значение поля. Одна строка на одно `actor_field`. */
export interface ActorValueRecord {
  /** UUID `actor_field`. */
  field: string
  kind: ActorValueKind
  boolean?: boolean
  number?: number
  text?: string
  /** UUID `field_enum_variant` из meta. */
  variant?: string
}

/** Один элемент списочного значения (когда `value.kind === "list"`). */
export interface ActorValueItemRecord {
  /** UUID `actor_field`. */
  field: string
  position: number
  kind: ActorScalarKind
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

/** Прямая проводка значения от поля-источника к полю-получателю. */
export interface ActorSourceRecord {
  /** UUID поля-получателя. */
  childField: string
  /** UUID поля-источника. */
  parentField: string
}

/** Текущее состояние FSM актора. */
export interface ActorStateRecord {
  /** UUID актора. */
  actor: string
  /** UUID `superposition` из meta. */
  metaState: string
}

/** Семья entangled-акторов: набор инстансов, делящих корневой источник значения. */
export interface ActorEntanglementRecord {
  uuid: string
  world: string
  /** UUID корневого `actor_field`-источника, от которого расходится цепочка. */
  rootField: string
}

/** Член семьи — один из акторов в составе entanglement. */
export interface ActorEntanglementMemberRecord {
  entanglement: string
  actor: string
  position: number
}

/** Описание разделяемого поля внутри семьи. */
export interface ActorEntanglementFieldRecord {
  uuid: string
  entanglement: string
  /** UUID `field` из meta. */
  metaField: string
  position: number
}

/** Конкретное поле-инстанс одного актора в составе entangled-поля. */
export interface ActorEntanglementFieldMemberRecord {
  entanglementField: string
  actorField: string
  position: number
}

/** Полный row-group одного актора — read/write единицей. */
export interface ActorRows {
  actor: ActorRecord
  edge: ActorEdgeRecord
  fields: ActorFieldRecord[]
  values: ActorValueRecord[]
  valueItems: ActorValueItemRecord[]
  sources: ActorSourceRecord[]
  state: ActorStateRecord
}

/** Полный row-group одной entanglement-семьи. */
export interface ActorEntanglementFamilyRows {
  entanglement: ActorEntanglementRecord
  members: ActorEntanglementMemberRecord[]
  fields: ActorEntanglementFieldRecord[]
  fieldMembers: ActorEntanglementFieldMemberRecord[]
}
