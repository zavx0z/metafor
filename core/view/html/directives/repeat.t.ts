export type KeyFn<T> = (item: T, index: number) => unknown
export type ItemTemplate<T> = (item: T, index: number) => unknown
export interface RepeatDirectiveFn {
  <T>(items: Iterable<T>, keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>, template?: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, template: ItemTemplate<T>): unknown
  <T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): unknown
}
