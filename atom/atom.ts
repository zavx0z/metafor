import { Strong } from "./strong"

export class Atom extends Strong {
  get self() {
    return {
      atom: this.id,
      meta: this.meta,
      path: this.path,
    }
  }

  protected action(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (!this.process?.action) return reject(new Error("Нечего делать!"))
      try {
        const result = this.process.action({
          self: this.self,
          fields: this.fields,
          context: this.λ,
          core: this.core,
          destroy: this.destroy,
        })
        if (result instanceof Promise)
          result
            .then((success) => {
              this.result = success
              resolve(success)
            })
            .catch((error) => {
              this.error = error
              reject(error)
            })
        else {
          this.result = result
          resolve(result)
        }
      } catch (error) {
        let normError: Error
        if (error instanceof Error) normError = error
        if (typeof error === "string") normError = new Error(error)
        else {
          normError = new Error(error ? JSON.stringify(error) : "Ошибка без основания!")
          console.error(`В состоянии: ${this.state.current} - не понятно что произошло!`)
        }
        this.error = normError
        reject(normError)
      }
    })
  }
}

/**
 * Базовая информация об атоме в системе MetaFor
 *
 * Содержит основную информацию о местоположении атома в иерархии.
 * Используется в фильтрах реакций, где не требуется доступ к методу destroy.
 *
 * @example
 * ```typescript
 * const selfInfo: SelfInfo = {
 *   meta: "user-profile",
 *   atom: "user-123",
 *   path: "0/1/2"
 * }
 * ```
 */
export interface Self {
  atom: string
  meta: string
  path: string
}
