import { Gravity } from "./gravity"

import { Initiator, type JsonPatch, type Photon } from "./em.t"
import { type Impulse, Energy, getImpulseType } from "./src/stack"
import type { Reactions } from "./src/reactions"
import type { Atom } from "./atom"
import { Field, type Hidden, type Values } from "./field"

export { Initiator }
export type { Photon, JsonPatch, Impulse }

export abstract class EM extends Gravity {
  static CHANNEL = "electromagnetic"
  protected static channel: BroadcastChannel = new BroadcastChannel(EM.CHANNEL)

  protected abstract handleReaction(ev: MessageEvent<Photon>): void
  protected abstract reactions: Reactions
  private static charged = new Set<EM>()

  private static stack: Impulse[] = []
  private static emitStack = new Set<(stack: Impulse[]) => void>()

  protected connect() {
    EM.charged.add(this)
    EM.channel && EM.channel.addEventListener("message", this.handleReaction)
  }

  private static destroy(target: EM, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    descriptor.value = function (...args: any[]) {
      const { meta, id, path, emission } = this as EM
      const photon: Photon = {
        meta,
        atom: id,
        path,
        timestamp: Date.now(),
        initiator: args[1],
        impulses: [{ op: "remove", path: "/" }],
      }
      if (!EM._lock) {
        originalMethod.apply(this, args)
        Field.propagation(photon)
        EM.channel && EM.channel.postMessage(photon)
        return
      }
      const impulse = EM.stack.at(-1)
      if (impulse && impulse.atom === id && impulse.op === "remove") {
        EM.shiftImpulse()
        Field.propagation(photon)
        EM.channel && EM.channel.postMessage(photon)
      } else {
        EM.pushImpulse(photon)
      }
    }
  }

  @EM.destroy
  public override destroy(recursive = true, initiator = Initiator.Nothing) {
    // EM.emitStack.clear()
    EM.charged.delete(this)
    EM.channel && EM.channel.removeEventListener("message", this.handleReaction)
    super.destroy(recursive)
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
  private static pushImpulse(photon: Photon) {
    const { impulses, meta, path, ...self } = photon
    for (const impulse of impulses) EM.stack.push({ ...self, ...impulse })
    EM.emitStack.forEach((observer) => observer(EM.stack))
  }
  private static shiftImpulse() {
    EM.stack.shift()
    EM.emitStack.forEach((observer) => observer(EM.stack))
  }
  private static getImpulse() {
    const impulse = EM.stack.shift() as Impulse

    EM.emitStack.forEach((observer) => observer(EM.stack))
    const atom = Field.getAtom(impulse.atom)
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
    const { atom, energy, photon } = EM.getImpulse()
    switch (energy) {
      case Energy.Init:
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.Action:
        atom.emission(photon)
        atom.state = photon.impulses[0]!.value
        atom.action().then(atom.up).catch(atom.down)
        break
      case Energy.Success:
        if (EM.stack.length && EM.stack.at(-1)?.atom === atom.id) {
          const { photon: ctxPhoton } = EM.getImpulse()
          atom.emission(ctxPhoton)
          EM.pushImpulse(photon)
          break
        }
        atom.emission(photon)
        atom.process = undefined
        atom.measurement()
        break
      case Energy.Error:
        atom.emission(photon)
        atom.down()
        break
      case Energy.Transition:
        atom.state = photon.impulses[0]!.value
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.SuccessUpdate:
        atom.emission(photon)
        break
      case Energy.ErrorUpdate:
        atom.emission(photon)
        break
      case Energy.ReactionUpdate:
        break
      case Energy.Destroy:
        atom.destroy()
        break
    }
  }
  static it(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    descriptor.value = function (this: Atom, ...args: any[]) {
      const [value, initiator] = args
      const photon: Photon = {
        meta: this.meta,
        atom: this.id,
        path: this.path,
        timestamp: Date.now(),
        initiator: initiator,
        impulses: [{ op: "replace", path: "/context", value }],
      }

      if (!EM._lock) {
        const updated = originalMethod.apply(this, args)

        if (Object.keys(updated).length > 0) {
          Field.propagation(photon)
          for (const atom of EM.charged) {
            if (atom === this) continue
            atom.handleReaction({ data: photon } as MessageEvent<Photon>)
          }
          EM.channel && EM.channel.postMessage(photon)
          return
        }
      }

      EM.pushImpulse(photon)
    }
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
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Nothing,
      impulses: [{ op: "add", path: "/", value }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  protected emitProcess(eigenstate: string) {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Nothing,
      impulses: [{ op: "test", path: "/state", value: eigenstate }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    this.measurement()
    return false
  }

  protected emitMeasure(eigenstate: string): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Transition,
      impulses: [{ op: "replace", path: "/state", value: eigenstate }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  protected emitEvolution(value: Partial<Hidden<Values>>, initiator: Initiator): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: initiator,
      impulses: [{ op: "replace", path: "/context", value }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  protected emitUp(): boolean {
    const value = this.state
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Success,
      impulses: [{ op: "replace", path: "/state", value }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  protected emitDown(): boolean {
    const value = this.state
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Error,
      impulses: [{ op: "replace", path: "/state", value }],
    }
    if (!EM._lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }
}
