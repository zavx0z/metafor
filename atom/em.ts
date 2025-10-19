import { Field, type Hidden, type Values } from "./field"
import { Gravity } from "./gravity"

import { Source, type JsonPatch, type Photon } from "./em.t"
import {
  type Impulse,
  Energy,
  clearProcessImpulse,
  checkImpulseType as getImpulseType,
  impulseInStack,
} from "./src/stack"

export { Source }
export type { Photon, JsonPatch, Impulse }

export abstract class EM extends Gravity {
  static channelName = "electromagnetic"
  protected abstract hasReactions(): boolean
  protected abstract handleReaction(ev: MessageEvent<Photon>): void

  protected connect() {
    if (this.hasReactions()) {
      EM.charged.add(this)
      if (EM.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Photon>) => this.handleReaction(ev)
        EM.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.wired = true
  }

  public override destroy(recursive = true, source = Source.Nothing) {
    EM.charged.delete(this)
    this.emitDestroy(source)
    this.wired = false
    if (this._onBCMessage && EM.channel) EM.channel.removeEventListener("message", this._onBCMessage)
    EM.changeStackObservers.clear()
    super.destroy(recursive)
  }

  // -------------------------- Каналы -----------------------------------------

  protected wired = false
  /** Множество «заряжённых» атомов (у кого есть реакции). */
  private static charged = new Set<EM>()
  protected static channel: BroadcastChannel = new BroadcastChannel(EM.channelName)
  private _onBCMessage?: (ev: MessageEvent<Photon>) => void

  protected emission(photon: Photon) {
    if (!this.wired) return
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
  public static step() {
    const impulse = EM.stack[EM.stack.length - 1] as Impulse
    const atom = Field.getAtom(impulse.atom)
    const energy = getImpulseType(EM.stack, impulse)
    switch (energy) {
      case Energy.AtomCreate:
        atom.decoheredCollapse()
        break
      case Energy.ActionAfterAtomCreate: // (первичный, после попадает в Action)
        /** Удалить из стека импульс op: "add" path: "/"
        который позволил идентифицировать действие процесса как "после инициализации".
        Это необходимо 
        */
        EM.shiftImpulse()
        // @ts-expect-error
        atom.collapse(atom.processes.getProcess(atom.state.current))
        break
      case Energy.Action:
        if (atom.process) {
          // @ts-expect-error
          atom.collapse(atom.process, impulse.value)
          break
        }
        // запуск для получения процесса (первичный)
        atom.measurement()
        break
      case Energy.Success:
        // @ts-expect-error
        atom.up()
        break
      case Energy.Error:
        // @ts-expect-error
        atom.down()
        break
      case Energy.Transition:
        atom.measurement()
        break
      case Energy.ContextUpdateSuccess:
        atom.evaluate(impulse.value, impulse.src)
        break
      case Energy.ContextUpdateError:
        atom.evaluate(impulse.value, impulse.src)
        break
      case Energy.ContextUpdateReaction:
        atom.decoheredCollapse()
        break
      case Energy.Destroy:
        atom.destroy()
        break
    }
  }

  /** ---------------------------- сообщения ------------------------------------
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
      src: Source.Nothing,
      patches: [{ op: "add", path: "/", value }],
    }
    if (!EM.lock) {
      this.emission(photon)
      return true
    }
    if (impulseInStack(EM.stack, photon)) {
      // Удалить из стека если нет переходов.
      const eigenstates = this.state.states[this.state.current]
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

  protected emitProcess() {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Nothing,
      patches: [{ op: "test", path: "/state", value: this.state.current }],
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

  protected emitEvolution(value: Partial<Hidden<Values>>, src: Source): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
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
    const value = this.state.current
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Success,
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
    const value = this.state.current
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Error,
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

  protected emitMeasure(): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Transition,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
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

  private emitDestroy(src: Source): boolean {
    const photon: Photon = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
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
