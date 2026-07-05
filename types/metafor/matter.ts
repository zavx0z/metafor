import type { Fields, Update, Values } from "./fields.ts"
import type { Mass } from "./schema.ts"
import type { NodeType } from "../template/node/index.ts"

export type MatterBindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

export type TopologyBasis = "state" | "enum" | "array" | "ordinary" | "mass" | "unknown"

export type MatterParticleKind = "wimp" | "fuzzy" | "axion" | "macho"

export type MatterEdgeSlot = "root" | "child" | "then" | "else" | "branch"

export type MatterChildEdgeSlot = "child" | "then" | "else" | "branch"

export interface MatterChild {
  edgeSlot: MatterChildEdgeSlot
  particle: MatterParticle
}

export interface MatterWimp {
  kind: "wimp"
  src: string
  fieldsBinding?: MatterBindingValue
  massBinding?: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta" | "cond"
  predicateBinding?: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterAxion {
  kind: "axion"
  predicateBinding: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterMacho {
  kind: "macho"
  collectionBinding: MatterBindingValue
  children?: MatterChild[]
}

export type MatterParticle = MatterWimp | MatterFuzzy | MatterAxion | MatterMacho

export interface FieldInit {
  key: string
  value: unknown
  source?: {
    parentActorId: number
    parentFieldKey: string
  }
}

export interface Continuation {
  fieldInits?: FieldInit[]
  mass?: unknown
}

export type ParticleRef = { kind: "actor"; id: number } | { kind: "topology"; id: number }

export interface BfsEntry {
  plan: MatterParticle
  parent: ParticleRef
}

export interface PendingChildWimp {
  src: string
  parent: ParticleRef
  continuation: Continuation
}

export interface MatterTemplateSchema extends Array<NodeType> {}

export interface MatterSchema extends Array<MatterParticle> {}

export interface MatterFieldDefinition {
  type: Fields[string]["type"]
  values?: Fields[string]["values"]
}

export interface MatterFields {
  [key: string]: MatterFieldDefinition
}

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
export type MatterDefinitionParams<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends string = string> = {
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
export type MatterDeclaration<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends string = string> = (
  params: MatterDefinitionParams<ɸ, m, 𝛴>,
) => void
