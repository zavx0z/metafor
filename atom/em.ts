import { Gravity } from "./gravity"
import { Initiator, type JsonPatch, type Photon, type WrappedMethod } from "./em.t"
import { type Impulse, Energy, getImpulseType, impulseInStack } from "./src/stack"
import type { Reactions } from "./src/reactions"
import type { Atom } from "./atom"
import { Field } from "./field"
import { contextFromSchema } from "@zavx0z/context"

export { Initiator }
export type { Photon, JsonPatch, Impulse }

export abstract class EM extends Gravity {
  static CHANNEL = "electromagnetic"
  protected static channel: BroadcastChannel = new BroadcastChannel(EM.CHANNEL)

  /**
   * Безопасно вызывает оригинальный метод, если он обернут декоратором @it
   * @param method - метод, который может быть обернут декоратором
   * @param context - контекст для вызова (this)
   * @param args - аргументы для передачи в метод
   */
  public static callOriginal<T extends (...args: any[]) => any>(
    method: T | WrappedMethod<T>,
    context: any,
    ...args: Parameters<T>
  ): ReturnType<T> {
    const wrappedMethod = method as WrappedMethod<T>
    if ("original" in wrappedMethod && wrappedMethod.original) {
      return wrappedMethod.original.call(context, ...args)
    } else {
      return (method as T).call(context, ...args)
    }
  }

  /**
   * Правильно биндит метод с сохранением свойства original
   * @param method - метод для биндинга
   * @param context - контекст для биндинга (this)
   */
  public static bindWithOriginal<T extends (...args: any[]) => any>(
    method: T | WrappedMethod<T>,
    context: any
  ): T & { original?: T } {
    const boundMethod = method.bind(context)
    const wrappedMethod = method as WrappedMethod<T>
    if ("original" in wrappedMethod && wrappedMethod.original) {
      ;(boundMethod as any).original = wrappedMethod.original
    }
    return boundMethod as T & { original?: T }
  }

  protected abstract handleReaction(ev: MessageEvent<Photon>): void
  protected abstract reactions: Reactions
  private static charged = new Set<EM>()

  private static stack: Impulse[] = []
  private static emitStack = new Set<(stack: Impulse[]) => void>()

  protected connect() {
    EM.charged.add(this)
    EM.channel && EM.channel.addEventListener("message", this.handleReaction)
  }

  public override destroy(initiator = Initiator.Nothing) {
    // EM.emitStack.clear()
    EM.charged.delete(this)
    EM.channel && EM.channel.removeEventListener("message", this.handleReaction)
    super.destroy()
  }

  protected emission(photon: Photon) {
    Field.propagation(photon)
    for (const atom of EM.charged) {
      if (atom === this) continue
      atom.handleReaction({ data: photon } as MessageEvent<Photon>)
    }
    EM.channel && EM.channel.postMessage(photon)
  }

  // --------------------------------------------------------

  private static _lock = false
  public static get isLocked(): boolean {
    return EM._lock
  }
  public static set lock(val: boolean) {
    EM._lock = val
  }
  public static break() {
    EM._lock = true
  }
  public static resume() {
    EM._lock = false
  }
  private static putImpulse(photon: Photon) {
    const { impulses, meta, path, ...self } = photon
    for (const impulse of impulses) EM.stack.push({ ...self, ...impulse })
    EM.emitStack.forEach((observer) => observer(EM.stack))
  }

  private static getImpulse() {
    const impulse = EM.stack.shift() as Impulse

    EM.emitStack.forEach((observer) => observer(EM.stack))
    let atom: ReturnType<typeof Field.getAtom> | null = null
    try {
      atom = Field.getAtom(impulse.atom)
    } catch {
      // Атом уже удалён — считаем импульс устаревшим и пропускаем его
      return null
    }
    const energy = getImpulseType(impulse)
    const photon: Photon = {
      ...atom.self,
      timestamp: impulse.timestamp,
      initiator: impulse.initiator,
      impulses: [impulse],
    }
    return { atom, energy, photon }
  }

  public static onChangeStack(observer: (stack: Impulse[]) => void) {
    EM.emitStack.add(observer)
    return () => EM.emitStack.delete(observer)
  }

  protected abstract measurement(): void
  /** Выполняет импульс из стека. */
  public static step() {
    const packet = EM.getImpulse()
    if (!packet) return
    const { atom, energy, photon } = packet
    switch (energy) {
      case Energy.Init:
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.Action:
        atom.emission(photon)
        atom.state = photon.impulses[0]!.value
        EM.callOriginal(atom.action, atom).then(atom.up).catch(atom.down)
        break
      case Energy.Success:
        atom.process = undefined
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.Error:
        atom.process = undefined
        atom.error = null
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.Transition:
        atom.state = photon.impulses[0]!.value
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.SuccessUpdate:
        EM.callOriginal(atom.evaluate, atom, photon.impulses[0]?.value)
        atom.emission(photon)
        break
      case Energy.ErrorUpdate:
        atom.emission(photon)
        break
      case Energy.ReactionUpdate:
        EM.callOriginal(atom.evaluate, atom, photon.impulses[0]?.value)
        atom.emission(photon)
        break
      case Energy.Destroy:
        atom.emission(photon)
        EM.callOriginal(atom.destroy, atom)
        break
      default:
        break
    }
  }
  static it(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    let wrappedMethod: Function

    if (propertyKey === "destroy") {
      wrappedMethod = function (this: Atom, ...args: any[]) {
        const [initiator] = args
        const photon: Photon = {
          ...this.self,
          timestamp: Date.now(),
          initiator: initiator,
          impulses: [{ op: "remove", path: "/" }],
        }
        if (!EM._lock) {
          originalMethod.apply(this, args)
          this.emission(photon)
          return
        }
        if (impulseInStack(EM.stack, photon)) return
        EM.putImpulse(photon)
      }
    } else if (propertyKey === "action") {
      wrappedMethod = function (this: Atom, ...args: any[]) {
        const photon: Photon = {
          ...this.self,
          timestamp: Date.now(),
          initiator: Initiator.Nothing,
          impulses: [{ op: "test", path: "/state", value: this.state }],
        }
        if (!EM._lock) {
          this.emission(photon)
          return originalMethod.apply(this, args)
        }
        EM.putImpulse(photon)
        return Promise.resolve("$skip")
      }
    } else if (["up", "down"].includes(propertyKey)) {
      wrappedMethod = function (this: Atom, ...args: any[]) {
        if (args[0] === "$skip") return
        const value = this.state
        const photon: Photon = {
          ...this.self,
          timestamp: Date.now(),
          initiator: propertyKey === "up" ? Initiator.Success : Initiator.Error,
          impulses: [{ op: "replace", path: "/state", value }],
        }
        originalMethod.apply(this, args)
        if (!EM._lock) {
          this.emission(photon)
          return
        }
        EM.putImpulse(photon)
      }
    } else if (propertyKey === "evaluate") {
      wrappedMethod = function (this: Atom, ...args: any[]) {
        const [values, initiator] = args
        const photon: Partial<Photon> = {
          ...this.self,
          timestamp: Date.now(),
          initiator: initiator,
        }

        if (!EM._lock) {
          const updated = originalMethod.apply(this, args)
          if (!Object.keys(updated).length) return

          photon.impulses = [{ op: "replace", path: "/context", value: updated }]
          this.emission(photon as Photon)
          return updated
        }

        const ctx = contextFromSchema(this.fields)
        ctx.update(this.λ)
        const updated = ctx.update(values)
        if (!Object.keys(updated).length) return

        photon.impulses = [{ op: "replace", path: "/context", value: updated }]
        if (impulseInStack(EM.stack, photon as Photon)) return
        EM.putImpulse(photon as Photon)
        return updated
      }
    } else {
      wrappedMethod = function (this: Atom, ...args: any[]) {
        return originalMethod.apply(this, args)
      }
    }
    ;(wrappedMethod as WrappedMethod<typeof originalMethod>).original = originalMethod
    descriptor.value = wrappedMethod
  }
  /** ---------------------------- Обработка импульсов действий ------------------------------------
   * 1. Нормальный режим
   *    - эмит и ранний выход
   * 2. Режим EM.lock
   *    - Первый проход
   *      - помещение импульсов фотона в конец стека (обязательно)
   *    - Второй проход
   *      - удаление из стека (не обязательно)
   *      - эмит (обязательно)
   */

  protected emitInit(): boolean {
    const value = this.snapshot
    const photon: Photon = {
      ...this.self,
      timestamp: Date.now(),
      initiator: Initiator.Nothing,
      impulses: [{ op: "add", path: "/", value }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.putImpulse(photon)
    return false
  }

  protected emitMeasure(eigenstate: string): boolean {
    const photon: Photon = {
      ...this.self,
      timestamp: Date.now(),
      initiator: Initiator.Transition,
      impulses: [{ op: "replace", path: "/state", value: eigenstate }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.putImpulse(photon)
    return false
  }
}
