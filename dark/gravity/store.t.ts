/**
 * Состояние `@dark/gravity/store`.
 *
 * Хранит данные, используемые несколькими пакетами:
 * - {@link Store.meta | meta} — для meta-атомов
 * - {@link Store.atom | atom} — для tree instances
 */

/** Лексикографический ключ порядка среди siblings одного родителя. */
export type OrderKey = Uint8Array

/** Публичный structural atom contract домена Dark. */
export interface Atom {
  path: string
  meta: string
  address: string
}

/** Вход создания атома: `path` игнорируется и выводится из структуры. */
export type AtomInput = Readonly<Pick<Atom, "meta" | "address"> & Partial<Pick<Atom, "path">>>

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
