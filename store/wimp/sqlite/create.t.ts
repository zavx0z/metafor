import type {ParsedDestroy} from "../../../finally.t.ts"
import type {FieldDefinition, FieldKey, MetaDSL} from "../../../metafor.t.ts"
import type {ParsedProcess} from "../../../process.t.ts"

/**
 * Подготовленное описание поля для SQL-create WIMP.
 *
 * @prop key — ключ поля внутри декларации WIMP.
 */
export type WimpCreateFieldInput = FieldDefinition & {key: FieldKey}

/**
 * Подготовленное состояние WIMP вместе с сырыми переходами из DSL.
 *
 * @prop name — имя состояния внутри одного WIMP.
 * @prop transitions — описание переходов из этого состояния в другие состояния.
 */
export type WimpCreateStateInput = {
  name: string
  transitions?: unknown
}

/**
 * Подготовленное объявление процесса для SQL-create WIMP.
 *
 * @prop key — ключ процесса внутри декларации WIMP.
 * @prop declaration — уже распарсенная action/finally декларация процесса.
 */
export type WimpCreateProcessInput = {
  key: string
  declaration: ParsedProcess | ParsedDestroy
}

/**
 * Подготовленное объявление реакции для SQL-create WIMP.
 *
 * @prop key — ключ реакции внутри декларации WIMP.
 * @prop label — человекочитаемое имя реакции.
 * @prop desc — опциональное описание реакции.
 * @prop cond — исходник условия реакции.
 * @prop src — исходник update-функции реакции.
 * @prop read — ключи полей, которые реакция читает.
 * @prop write — ключи полей, которые реакция пишет.
 * @prop states — имена состояний, в которых реакция активна.
 */
export type WimpCreateReactionInput = {
  key: string
  label: string
  desc?: string | null | undefined
  cond: string
  src: string
  read?: readonly string[] | undefined
  write?: readonly string[] | undefined
  states?: readonly string[] | undefined
}

/**
 * Полный prepared input для `StoreWimpSqlite.create()`.
 *
 * @prop name — имя WIMP-декларации.
 * @prop desc — описание WIMP-декларации.
 * @prop bulk — bulk/view-настройки декларации.
 * @prop mass — mass-данные декларации, раскладываемые в `wimp_mass_value`.
 * @prop fields — подготовленные поля декларации.
 * @prop states — подготовленные состояния декларации.
 * @prop processes — подготовленные процессы декларации.
 * @prop reactions — подготовленные реакции декларации.
 */
export type WimpCreateInput = {
  name?: string | null | undefined
  desc?: string | null | undefined
  bulk?: MetaDSL["bulk"] | null | undefined
  mass?: MetaDSL["mass"]
  fields?: readonly WimpCreateFieldInput[] | undefined
  states?: readonly WimpCreateStateInput[] | undefined
  processes?: readonly WimpCreateProcessInput[] | undefined
  reactions?: readonly WimpCreateReactionInput[] | undefined
}
