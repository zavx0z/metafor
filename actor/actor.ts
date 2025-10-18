import { Strong } from "./strong"

export class Actor extends Strong {
  get self() {
    return {
      actor: this.id,
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
