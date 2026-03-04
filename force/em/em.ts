// @ts-nocheck
import { Gravity } from "../gravity/old"
import { Initiator, type JsonPatch, type Photon, type WrappedMethod } from "./em.t"
import { type Impulse, Energy, getImpulseType, impulseInStack } from "../../old/atom/src/stack"
import type { Reactions } from "../../old/atom/src/reactions"
import type { Atom } from "../../old/atom/atom"
import { Field } from "../../old/atom/field"
import type { ImpulsesChunk } from "../gravity/old.t"
import { contextFromSchema } from "@zavx0z/context"

export { Initiator }
export type { Photon, JsonPatch, Impulse }

export abstract class EM extends Gravity {
  static CHANNEL = "electromagnetic"
  protected static channel: BroadcastChannel | null = new BroadcastChannel(EM.CHANNEL)

  protected abstract handleReaction(ev: MessageEvent<Photon>): void
  protected abstract reactions: Reactions
  private static charged = new Set<EM>()

  private static stack: Impulse[] = []
  private static emitStack = new Set<(stack: Impulse[]) => void>()

  protected connect() {
    EM.charged.add(this)
    if (EM.channel) {
      EM.channel.addEventListener("message", this.handleReaction)
    }
  }

  public override destroy() {
    // EM.emitStack.clear()
    EM.charged.delete(this)
    if (EM.channel) {
      EM.channel.removeEventListener("message", this.handleReaction)
    }
    super.destroy()
  }

  /**
   * Безопасно заменяет канал коммуникации
   * Удаляет все обработчики со старого канала перед заменой
   * @internal Используется только в тестах
   */
  protected static setChannel(newChannel: BroadcastChannel | null) {
    const oldChannel = EM.channel
    if (oldChannel) {
      // Удаляем все обработчики со старого канала
      for (const atom of EM.charged) {
        oldChannel.removeEventListener("message", atom.handleReaction)
      }
      // Закрываем старый канал
      oldChannel.close()
    }
    EM.channel = newChannel
    // Добавляем обработчики к новому каналу
    if (newChannel) {
      for (const atom of EM.charged) {
        newChannel.addEventListener("message", atom.handleReaction)
      }
    }
  }

  protected emission(photon: Photon) {
    Field.propagation(photon)
    for (const atom of EM.charged) {
      if (atom === this) continue
      atom.handleReaction({ data: photon } as MessageEvent<Photon>)
    }
    if (EM.channel) {
      EM.channel.postMessage(photon)
    }
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
    // Обрабатываем накопленные импульсы до момента, когда останется один
    while (EM.stack.length > 1) {
      EM.step()
    }
    // Убираем блокировку
    EM._lock = false
    // Запускаем последний импульс
    if (EM.stack.length === 1) {
      EM.step()
    }
  }
  private static putImpulse(photon: Photon) {
    const { impulses, meta, path, ...self } = photon
    for (const impulse of impulses) EM.stack.push({ ...self, ...impulse })
    EM.emitStack.forEach((observer) => observer(EM.stack))
  }

  private static getImpulse() {
    const impulse = EM.stack.shift() as Mmpulse

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

  public static getHistoryChunks(): Impulse[][] {
    const chunks = Field.historyChunks()
    return chunks.map((chunk: ImpulsesChunk) =>
      chunk.impulses.map((patch) => ({
        atom: chunk.atom,
        timestamp: chunk.timestamp,
        initiator: chunk.initiator,
        op: patch.op,
        path: patch.path,
        value: patch.value,
      }))
    )
  }

  public static clearHistory() {
    Field.clearGlobalHistory()
  }

  protected abstract measurement(state: string): void
  /** Выполняет импульс из стека. */
  public static step() {
    const packet = EM.getImpulse()
    if (!packet) return
    const { atom, energy, photon } = packet
    switch (energy) {
      case Energy.Init:
        atom.emission(photon)
        EM.callOriginal(atom.init, atom)
        break
      case Energy.Action: {
        const state = photon.impulses[0]!.value
        atom.emission(photon)
        EM.callOriginal(atom.action, atom, state).then(atom.up).catch(atom.down)
        break
      }
      case Energy.Success: {
        atom.emission(photon)
        EM.callOriginal(atom.up, atom)
        break
      }
      case Energy.Error: {
        atom.emission(photon)
        const next = atom.measurement(photon.impulses[0]!.value)
        next && EM.callOriginal(atom.down, atom)
        break
      }
      case Energy.Transition: {
        atom.state = photon.impulses[0]!.value
        atom.emission(photon)
        const next = atom.measurement(photon.impulses[0]!.value)
        next && atom.collapse(next)
        break
      }
      case Energy.SuccessUpdate:
      case Energy.ErrorUpdate:
        const values = photon.impulses[0]?.value
        EM.callOriginal(atom.evaluate, atom, values)
        atom.emission(photon)
        break
      case Energy.ReactionUpdate: {
        const values = photon.impulses[0]?.value
        EM.callOriginal(atom.evaluate, atom, values)
        atom.emission(photon)

        const eigenstate = atom.measurement(atom.state)
        eigenstate && atom.collapse(eigenstate)
        break
      }
      case Energy.Destroy:
        atom.emission(photon)
        EM.callOriginal(atom.destroy, atom)
        break
      default:
        break
    }
  }
  static it(target: any, name: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value
    let wrapped: Function

    switch (name) {
      case "init": {
        wrapped = function (this: Atom, ...args: any[]) {
          // const [initiator] = args
          const value = this.snapshot
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: Initiator.Nothing,
            impulses: [{ op: "add", path: "/", value }],
          }
          if (!EM._lock) {
            this.emission(photon)
            return original.apply(this, args)
          }
          EM.putImpulse(photon)
        }
        break
      }
      case "transition": {
        wrapped = function (this: Atom, ...args: any[]) {
          const [state] = args
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: Initiator.Transition,
            impulses: [{ op: "replace", path: "/state", value: state }],
          }
          if (!EM._lock) {
            this.emission(photon)
            return original.apply(this, args)
          }
          EM.putImpulse(photon)
        }
        break
      }
      case "action": {
        wrapped = function (this: Atom, ...args: any[]) {
          const [state] = args
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: Initiator.Nothing,
            impulses: [{ op: "test", path: "/state", value: state }],
          }
          if (!EM._lock) {
            this.emission(photon)
            return original.apply(this, args)
          }
          EM.putImpulse(photon)
          return Promise.resolve("$skip")
        }
        break
      }
      case "up": {
        wrapped = function (this: Atom, ...args: any[]) {
          const [result] = args
          if (result === "$skip") return
          const value = this.state
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: Initiator.Success,
            impulses: [{ op: "replace", path: "/state", value }],
          }
          if (!EM._lock) {
            original.apply(this, args)
            this.emission(photon)
            return
          }

          if (this.result && this.process?.success) {
            const λ = contextFromSchema(this.fields)
            λ.update(this.λ)

            λ.onUpdate((value) =>
              EM.putImpulse({
                ...this.self,
                timestamp: Date.now(),
                initiator: Initiator.Success,
                impulses: [{ op: "replace", path: "/context", value }],
              })
            )

            this.process.success({ update: λ.update, data: this.result })
            λ.clearSubscribers()
          }

          EM.putImpulse(photon)
        }
        break
      }
      case "down": {
        wrapped = function (this: Atom, ...args: any[]) {
          if (args[0] === "$skip") return
          const value = this.state
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: Initiator.Error,
            impulses: [{ op: "replace", path: "/state", value }],
          }
          if (!EM._lock) {
            original.apply(this, args)
            this.emission(photon)
            return
          }
          EM.putImpulse(photon)
        }
        break
      }
      case "evaluate": {
        wrapped = function (this: Atom, ...args: any[]) {
          const [values, initiator] = args
          const photon: Partial<Photon> = {
            ...this.self,
            timestamp: Date.now(),
            initiator: initiator,
          }

          if (!EM._lock) {
            const updated = original.apply(this, [values])
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
        break
      }
      case "destroy": {
        wrapped = function (this: Atom, ...args: any[]) {
          const [initiator] = args
          const photon: Photon = {
            ...this.self,
            timestamp: Date.now(),
            initiator: initiator ?? Initiator.Process,
            impulses: [{ op: "remove", path: "/" }],
          }
          if (!EM._lock) {
            original.apply(this, args)
            this.emission(photon)
            return
          }
          if (impulseInStack(EM.stack, photon)) return
          EM.putImpulse(photon)
        }
        break
      }
      default: {
        wrapped = function (this: Atom, ...args: any[]) {
          return original.apply(this, args)
        }
        break
      }
    }
    ;(wrapped as WrappedMethod<typeof original>).original = original
    descriptor.value = wrapped
  }

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
}
