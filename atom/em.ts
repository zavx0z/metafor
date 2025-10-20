import { Field, type Hidden, type Values } from "./field"
import { Gravity } from "./gravity"

import { Initiator, type JsonPatch, type Photon } from "./em.t"
import { type Impulse, Energy, clearProcessImpulse, getImpulseType, impulseInStack } from "./src/stack"
import type { Reactions } from "./src/reactions"

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

  public override destroy(recursive = true, initiator = Initiator.Nothing) {
    EM.emitStack.clear()
    EM.charged.delete(this)
    this.emitDestroy(initiator)
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

  private static lock = false
  public static get isLocked(): boolean {
    return EM.lock
  }
  public static break() {
    EM.lock = true
  }
  public static resume() {
    EM.lock = false
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
  private static popImpulse() {
    const impulse = EM.stack.pop() as Impulse
    EM.emitStack.forEach((observer) => observer(EM.stack))
    const atom = Field.getAtom(impulse.atom)
    const energy = getImpulseType(EM.stack, impulse)
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
    const { atom, energy, photon } = EM.popImpulse()
    switch (energy) {
      case Energy.Init:
        atom.emission(photon)
        atom.measurement()
        break
      case Energy.AfterInit:
        // EM.shiftImpulse()
        break
      case Energy.Action:
        atom.emission(photon)
        atom.state = photon.impulses[0]!.value
        atom.action().then(atom.up).catch(atom.down)
        break
      case Energy.Success:
        if (EM.stack.length && EM.stack.at(-1)?.atom === atom.id) {
          const { photon: ctxPhoton } = EM.popImpulse()
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
        // atom.evaluate(impulse.value, impulse.initiator)
        break
      case Energy.ErrorUpdate:
        // atom.evaluate(impulse.value, impulse.initiator)
        break
      case Energy.ReactionUpdate:
        break
      case Energy.Destroy:
        atom.destroy()
        break
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
    if (!EM.lock) {
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
    if (!EM.lock) {
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
    if (!EM.lock) {
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
    if (!EM.lock) {
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
    if (!EM.lock) {
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
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  private emitDestroy(initiator: Initiator): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: initiator,
      impulses: [{ op: "remove", path: "/" }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }
}
