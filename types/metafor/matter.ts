import type { Fields, Update, Values } from "./fields.ts"
import type { Energy, Mass } from "./schema.ts"

export type MatterDirectMassBinding =
  | {kind: "whole"}
  | {kind: "keys"; entries: readonly {target: string; source: string}[]}

export type MatterBindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
      directMass?: MatterDirectMassBinding
    }

export type TopologyBasis = "state" | "enum" | "array" | "ordinary" | "mass" | "energy" | "unknown"

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
  energyBinding?: MatterBindingValue
  children?: MatterChild[]
}

export interface MatterFuzzy {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta"
  predicateBinding: MatterBindingValue
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
    parentAtomId: number
    parentFieldKey: string
  }
}

export interface Continuation {
  fieldInits?: FieldInit[]
  massBinding?: MatterBindingValue
  energyBinding?: MatterBindingValue
}

/** Runtime storage reference. `atom` currently identifies a materialized Atom. */
export type ParticleRef = { kind: "atom"; id: number } | { kind: "topology"; id: number }

export interface BfsEntry {
  plan: MatterParticle
  parent: ParticleRef
}

export interface PendingChildWimp {
  src: string
  parent: ParticleRef
  continuation: Continuation
}

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
 * Предназначены для декларирования materialization дочерних Atom через `<meta-for>`.
 *
 * ## API
 * - `state` — текущее состояние для условий matter
 * - `html` — шаблонизация для `<meta-for>` элементов
 * - `value` — данные Atom для передачи дочерним Atom
 * - `update` — функция обновления контекста
 * - `mass` — handles объявленных Mass key-files
 * - `energy` — живые runtime-сущности Energy
 *
 * Matter описывает только порождение и topology Atom.
 * State-условия создают Axion, dynamic enum src создаёт Fuzzy, array map создаёт Macho.
 * Обычные HTML-элементы и текст должны жить вне matter.
 *
 * @example
 * ```ts
 * // Иерархия Atom на основе состояния
 * matter: ({ state, html }) => html`
 *   ${state === "коммит" && html`<meta-for src="demo/app-status" fields=${{ message: "В процессе..." }} />`}
 *   ${state === "завершено" && html`<meta-for src="demo/app-success" fields=${{ message: "Готово!" }} />`}
 *   ${state === "ошибка" && html`<meta-for src="demo/app-error" fields=${{ message: "Ошибка" }} />`}
 * `
 *
 * // Передача данных дочернему Atom
 * matter: ({ value, html }) => html`
 *   <meta-for src="demo/app-child" fields=${{ data: value.data }} />
 * `
 *
 * // Несколько Atom в topology
 * matter: ({ html }) => html`
 *   <meta-for src="demo/app-header" />
 *   <meta-for src="demo/app-content" />
 *   <meta-for src="demo/app-footer" />
 * `
 * ```
 */
export type MatterDefinitionParams<
  ɸ extends Fields = Fields,
  m extends Mass = Mass,
  𝛴 extends string = string,
  e extends Energy = Energy,
> = {
  /**
   * Функция для обновления контекста Atom.
   * Используется в обработчиках событий для изменения состояния.
   */
  update: Update<ɸ>
  /**
   * Текущие значения полей.
   * Содержит все значения полей, определённых в `.fields(...)`.
   * Используется для передачи данных дочерним Atom.
   * @example
   * ```ts
   * matter: ({ value, html }) => html`
   *   <meta-for src="demo/app-child" fields=${{ value: value.data }} />
   * `
   */
  value: Values<ɸ>
  /**
   * Проекция объявленных Mass key-files на `MassHandle`.
   * Matter использует её только как источник `mass=${...}` binding.
   */
  mass: m
  /**
   * Постоянно типизированные живые сущности Energy родительского Atom.
   * Используются только как источник `energy=${...}` binding для дочернего Atom.
   */
  energy: e
  /**
   * Текущее состояние автомата Atom.
   * Строка из `.superposition(...)`, используется для условий matter.
   * @example
   * ```ts
   * matter: ({ state, html }) => html`
   *   ${state === "loading" && html`<meta-for src="demo/app-spinner" />`}
   * `
   */
  state: 𝛴
  /**
   * Функция шаблонизации для создания Matter declaration.
   * Используется для декларирования дочерних Atom через `<meta-for>`.
   *
   * @example
   * ```ts
   * matter: ({ html }) => html`
   *   <meta-for src="demo/app-header" />
   *   <meta-for src="demo/app-content" />
   * `
   * ```
   *
   * @remarks
   * Атрибут `src` задаёт ровно двухсегментный адрес `owner/repository` —
   * канонический идентификатор независимого peer Meta-репозитория, который
   * loader резолвит в meta-модуль. Вложенность runtime topology выражается
   * occurrence и Meta/Matter/Oracle references, а не третьим сегментом адреса или
   * вложением репозитория. Каждый occurrence materializes отдельный Atom.
   */
  html: (strings: TemplateStringsArray, ...values: any[]) => void
}

/**
 * Тип matter-декларации для topology и порождения Atom.
 */
export type MatterDeclaration<
  ɸ extends Fields = Fields,
  m extends Mass = Mass,
  𝛴 extends string = string,
  e extends Energy = Energy,
> = (
  params: MatterDefinitionParams<ɸ, m, 𝛴, e>,
) => void
