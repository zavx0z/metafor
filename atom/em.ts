import { Field, type Hidden, type Values } from "./field"
import { Gravity } from "./gravity"

import { Initiator, type JsonPatch, type Photon } from "./em.t"
import { type Impulse, Energy, clearProcessImpulse, getImpulseType, impulseInStack } from "./src/stack"
import type { Reactions } from "./src/reactions"

export { Initiator }
export type { Photon, JsonPatch, Impulse }

export abstract class EM extends Gravity {
  static channelName = "electromagnetic"
  protected abstract handleReaction(ev: MessageEvent<Photon>): void
  protected abstract reactions: Reactions

  protected hasReactions(): boolean {
    return this.reactions.hasReactions() ?? false
  }

  protected connect() {
    if (this.hasReactions()) {
      EM.charged.add(this)
      if (EM.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Photon>) => this.handleReaction(ev)
        EM.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.emitInit()
  }

  public override destroy(recursive = true, initiator = Initiator.Nothing) {
    EM.charged.delete(this)
    this.emitDestroy(initiator)
    if (this._onBCMessage && EM.channel) EM.channel.removeEventListener("message", this._onBCMessage)
    EM.changeStackObservers.clear()
    super.destroy(recursive)
  }

  // -------------------------- Каналы -----------------------------------------
  /** Множество «заряжённых» атомов (у кого есть реакции). */
  private static charged = new Set<EM>()
  protected static channel: BroadcastChannel = new BroadcastChannel(EM.channelName)
  private _onBCMessage?: (ev: MessageEvent<Photon>) => void

  protected emission(photon: Photon) {
    Field.propagation(photon)
    for (const atom of EM.charged) {
      if (atom === this) continue
      if (atom.id !== photon.atom && atom.hasReactions()) atom.handleReaction({ data: photon } as MessageEvent<Photon>)
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

  private static stack: Impulse[] = []
  private static pushImpulse(photon: Photon) {
    const { patches, meta, path, ...info } = photon
    for (const patch of patches) {
      const task = { ...info, ...patch }
      EM.stack.push(task)
    }
  }
  private static shiftImpulse() {
    EM.stack.shift()
    EM.changeStackObservers.forEach((observer) => observer(EM.stack))
  }
  private static popImpulse() {
    EM.stack.pop()
    EM.changeStackObservers.forEach((observer) => observer(EM.stack))
  }
  private static changeStackObservers = new Set<(stack: Impulse[]) => void>()
  public static onChangeStack(observer: (stack: Impulse[]) => void) {
    EM.changeStackObservers.add(observer)
    return () => EM.changeStackObservers.delete(observer)
  }

  /**
   * Выполняет импульс из стека.
   */
  public static step() {
    const impulse = EM.stack[EM.stack.length - 1] as Impulse
    const atom = Field.getAtom(impulse.atom)
    const energy = getImpulseType(EM.stack, impulse)
    switch (energy) {
      case Energy.Init:
        break
      case Energy.AfterInit:
        /** Удалить из стека импульс op: "add" path: "/"
        который позволил идентифицировать действие процесса как "после инициализации".
        Это необходимо 
        */
        EM.shiftImpulse()
        // atom.collapse(atom.processes.getProcess(atom.state))
        break
      case Energy.Action:
        if (atom.process) {
          // atom.collapse(atom.process, impulse.value)
          break
        }
        // запуск для получения процесса (первичный)
        atom.measurement()
        break
      case Energy.Success:
        atom.up()
        break
      case Energy.Error:
        atom.down()
        break
      case Energy.Transition:
        atom.measurement()
        break
      case Energy.SuccessUpdate:
        atom.evaluate(impulse.value, impulse.initiator)
        break
      case Energy.ErrorUpdate:
        atom.evaluate(impulse.value, impulse.initiator)
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
      patches: [{ op: "add", path: "/", value }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      // Удалить из стека если нет переходов.
      const eigenstates = this.eigenstates[this.state]
      if (!eigenstates) EM.popImpulse()
      // Остается в стеке для идентификации процесса после инициализации.
      // Инициализация импульса с введенным типом "процесса после создания",
      // необходима для передачи не следующего а текущего состояния
      this.emission(photon)
      return true
    }
    // создается сразу без помещения в стек
    // if (Electromagnetic.stack.length > 1) {
    //   this.sendMessage(message)
    //   return true
    // }
    // при начальной инициализации помещается в стек для остановки brk сразу
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
      patches: [{ op: "test", path: "/state", value: eigenstate }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      // @ts-ignore удалить из стека если нет обработчиков success/error
      if (!(this.process?.success && this.process?.error)) EM.popImpulse()
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }

  protected emitMeasure(eigenstate: string): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      initiator: Initiator.Transition,
      patches: [{ op: "replace", path: "/state", value: eigenstate }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      EM.popImpulse()
      this.emission(photon)
      return true
    }
    this.rollbackState()
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
      patches: [{ op: "replace", path: "/context", value }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      EM.popImpulse()
      this.emission(photon)
      return true
    }
    this.rollbackContext()
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
      patches: [{ op: "replace", path: "/state", value }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      EM.stack = clearProcessImpulse(EM.stack, value)
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
      patches: [{ op: "replace", path: "/state", value }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      EM.stack = clearProcessImpulse(EM.stack, value)
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
      patches: [{ op: "remove", path: "/" }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      EM.popImpulse()
      this.emission(photon)
      return true
    }
    EM.pushImpulse(photon)
    return false
  }
}
