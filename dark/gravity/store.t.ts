/**
 * Типы assembly-слоя `@dark/gravity/store`.
 */

/** Лексикографический ключ порядка среди siblings одного родителя. */
export type OrderKey = Uint8Array

/** Публичный structural atom contract домена Dark. */
export interface Atom {
  path: string
  meta: string
  address: string
}

/** Сериализуемое ядро атома без производного `path`. */
export interface AtomSeed {
  meta: string
  address: string
}

/** Вход создания атома: `path` игнорируется и выводится из структуры. */
export type AtomInput = Readonly<AtomSeed & Partial<Pick<Atom, "path">>>

/** Dumb store shape: meta-addressed declarations + atom-addressed tree instances. */
export interface Store<Meta = unknown> {
  meta: Map<string, Meta>
  atom: Map<string, Atom>
}

export interface AtomTreeMeta {
  parent: string | null
  orderKey: OrderKey
  seq: number
}

export type Reservation = {
  parent: string | null
  orderKey: OrderKey
}

/**
 * Временное рабочее состояние gravity assembly.
 *
 * Это не top-level domain store. Оно существует отдельно от `dark$`.
 */
export interface GravityState<Meta = unknown> extends Store<Meta> {
  tree: Map<string, AtomTreeMeta>
  childrenView: Map<string, string[]>
  reservations: Map<string, Reservation>
  nextSeq: number
}

export interface GravitySnapshot<Meta = unknown> {
  meta: Map<string, Meta>
  atom: Map<string, AtomSeed>
  tree: Map<string, AtomTreeMeta>
  childrenView: Map<string, string[]>
  nextSeq: number
}

/**
 * Gravity store — singleton объект методов над конкретным `GravityState`.
 *
 * Если `state` не передан, используется внутренний singleton-state самого `gravity$`.
 */
export interface GravityStore {
  meta: Map<string, unknown>
  atom: Map<string, Atom>
  createState<Meta = unknown>(): GravityState<Meta>
  reset<Meta = unknown>(state?: GravityState<Meta>): void
  restore<Meta = unknown>(snapshot: GravitySnapshot<Meta>, state?: GravityState<Meta>): GravityState<Meta>
  snapshot<Meta = unknown>(state?: GravityState<Meta>): GravitySnapshot<Meta>
  getAtom<Meta = unknown>(address: string, state?: GravityState<Meta>): Atom | null
  getParent<Meta = unknown>(address: string, state?: GravityState<Meta>): string | null
  getPath<Meta = unknown>(address: string, state?: GravityState<Meta>): string
  getChildren<Meta = unknown>(parent: string | null, state?: GravityState<Meta>): readonly Atom[]
  getNode<Meta = unknown>(path: string, state?: GravityState<Meta>): Atom | null
  createChildren<Meta = unknown>(parent: string | null, input: AtomInput, state?: GravityState<Meta>): Atom
  createBetween<Meta = unknown>(
    left: string | null,
    right: string | null,
    input: AtomInput,
    state?: GravityState<Meta>,
  ): Atom
  createBefore<Meta = unknown>(neighbor: string, input: AtomInput, state?: GravityState<Meta>): Atom
  createAfter<Meta = unknown>(neighbor: string, input: AtomInput, state?: GravityState<Meta>): Atom
  createNode<Meta = unknown>(path: string, input: AtomInput, state?: GravityState<Meta>): Atom
  reserveSibling<Meta = unknown>(
    address: string,
    target: string,
    at?: "before" | "after",
    state?: GravityState<Meta>,
  ): void
  reserveByIndexPath<Meta = unknown>(address: string, path: string, state?: GravityState<Meta>): void
  attachReserved<Meta = unknown>(input: AtomInput, state?: GravityState<Meta>): Atom
}
