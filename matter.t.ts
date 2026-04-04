import type { Fields, Update, Values } from "./fields.t.ts"
import type { FieldDefinition } from "./metafor.t.ts"
import type { Mass } from "./metafor.t.ts"
import type { State } from "./superposition.t.ts"
import type { NodeType as TemplateNodeType } from "@metafor/template/node/index.t.ts"
import type { NodeMeta as TemplateNodeMeta } from "@metafor/template/node/meta.t.ts"
import type { NodeCondition as TemplateNodeCondition } from "@metafor/template/node/condition.t.ts"
import type { NodeLogical as TemplateNodeLogical } from "@metafor/template/node/logical.t.ts"
import type { NodeMap as TemplateNodeMap } from "@metafor/template/node/map.t.ts"

export type NodeType = TemplateNodeType
export type NodeMeta = TemplateNodeMeta
export type NodeCondition = TemplateNodeCondition
export type NodeLogical = TemplateNodeLogical
export type NodeMap = TemplateNodeMap

export type MatterSchema = NodeType[]

export type MatterFieldDefinition = Pick<FieldDefinition, "type">

export type MatterFields = Record<string, MatterFieldDefinition>

/**
 * Параметры функции matter атома.
 *
 * Предназначены для декларирования иерархии акторов через `<meta-for>`.
 *
 * ## API
 * - `state` — текущее состояние для условий matter
 * - `html` — шаблонизация для `<meta-for>` элементов
 * - `value` — данные атома для передачи дочерним акторам
 * - `update` — функция обновления контекста
 * - `mass` — масса для сложных данных и зависимостей от среды
 *
 * Matter описывает только иерархию акторов.
 * Выбор topology в matter допускается только по `state`, `enum` и `array`.
 * Обычные HTML-элементы и текст должны жить вне matter.
 *
 * @example
 * ```ts
 * // Иерархия акторов на основе состояния
 * matter: ({ state, html }) => html`
 *   ${state === "коммит" && html`<meta-for src="demo/status" fields=${{ message: "В процессе..." }} />`}
 *   ${state === "завершено" && html`<meta-for src="demo/success" fields=${{ message: "Готово!" }} />`}
 *   ${state === "ошибка" && html`<meta-for src="demo/error" fields=${{ message: "Ошибка" }} />`}
 * `
 *
 * // Передача данных дочернему актору
 * matter: ({ value, html }) => html`
 *   <meta-for src="demo/child" fields=${{ data: value.data }} />
 * `
 *
 * // Несколько акторов в иерархии
 * matter: ({ html }) => html`
 *   <meta-for src="demo/header" />
 *   <meta-for src="demo/content" />
 *   <meta-for src="demo/footer" />
 * `
 * ```
 */
export type MatterDefinitionParams<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends State = State> = {
  /**
   * Функция для обновления контекста атома.
   * Используется в обработчиках событий для изменения состояния.
   */
  update: Update<ɸ>
  /**
   * Текущие значения полей.
   * Содержит все значения полей, определённых в `.fields(...)`.
   * Используется для передачи данных дочерним акторам.
   * @example
   * ```ts
   * matter: ({ value, html }) => html`
   *   <meta-for src="demo/child" fields=${{ value: value.data }} />
   * `
   */
  value: Values<ɸ>
  /**
   * Масса атома для сложных данных и зависимостей от среды.
   * Содержит объекты, массивы и структуры, которые не помещаются в контекст.
   * Масса определяет локализацию процесса и не сериализуется в Boundary.
   */
  mass: m
  /**
   * Текущее состояние автомата.
   * Строка из `.superposition(...)`, используется для условий matter.
   * @example
   * ```ts
   * matter: ({ state, html }) => html`
   *   ${state === "loading" && html`<meta-for src="demo/spinner" />`}
   * `
   */
  state: 𝛴
  /**
   * Функция шаблонизации для создания HTML.
   * Используется для декларирования иерархии акторов через `<meta-for>`.
   *
   * @example
   * ```ts
   * matter: ({ html }) => html`
   *   <meta-for src="demo/header" />
   *   <meta-for src="demo/content" />
   * `
   * ```
   *
   * @remarks
   * Атрибут `src` задаёт hub-адрес вида `owner/path` — канонический идентификатор meta-сущности,
   * который loader резолвит в meta-модуль по этому адресу.
   */
  html: (strings: TemplateStringsArray, ...values: any[]) => void
}

/**
 * Тип matter-декларации для иерархии акторов.
 */
export type MatterDeclaration<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends State = State> = (
  params: MatterDefinitionParams<ɸ, m, 𝛴>,
) => void
