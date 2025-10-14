export abstract class Field {
  protected constructor(id: string, meta: string) {
    this.id = id
    this.meta = meta
  }

  protected abstract connected(): void
  protected abstract disconnected(): void
  protected abstract destroy(): void

  /** Имя мета-схемы (попадает в системные сообщения). */
  public readonly meta: string

  public readonly id: string
}
