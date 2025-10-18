import { Field, type Hidden, type Values } from "./field"
import { Gravity, type Core } from "./gravity"

import { Source, type JsonPatch, type Message } from "./electromagnetic.t"
import { type Task, Tasks, clearProcessTasks } from "./src/stack"

export { Source }
export type { Message, JsonPatch }

const DEBUG_DEBUGGER = true

export abstract class Electromagnetic extends Gravity {
  static channelName = "electromagnetic"
  protected abstract hasReactions(): boolean
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void

  // -------------------------- Жизненный цикл -----------------------------------------

  protected constructor(_: unknown, id: string, meta: string, core?: Core) {
    super(_, id, meta, core)
  }

  protected connect() {
    if (this.hasReactions()) {
      Electromagnetic.charged.add(this)
      if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        Electromagnetic.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.wired = true
  }

  public override destroy(recursive = true, source = Source.Nothing) {
    Electromagnetic.charged.delete(this)
    this.requestDestroy(source)
    this.wired = false
    if (this._onBCMessage && Electromagnetic.channel)
      Electromagnetic.channel.removeEventListener("message", this._onBCMessage)
    super.destroy(recursive)
  }

  // -------------------------- Каналы -----------------------------------------

  protected wired = false
  /** Множество «заряжённых» атомов (у кого есть реакции). */
  private static charged = new Set<Electromagnetic>()
  protected static useBroadcastChannel = true
  protected static channel: BroadcastChannel = new BroadcastChannel(Electromagnetic.channelName)

  /** Обработчик BC для корректного removeEventListener. */
  private _onBCMessage?: (ev: MessageEvent<Message>) => void

  static isSelfInitMessage(message: Message): boolean {
    if (!message) return false
    for (const patch of message.patches) {
      if (patch.path === "/" && patch.op === "add") return true
    }
    return false
  }

  /** Доставка сообщения локально и (опционально) через BroadcastChannel. */
  protected sendMessage(message: Message) {
    if (!this.wired) return

    if (Electromagnetic.isSelfInitMessage(message)) {
      Field.saveAtomSnapshot(this.id, this.snapshot)
    } else
      Field.pushPatches({
        atom: message.atom,
        src: message.src,
        patches: message.patches,
        timestamp: message.timestamp,
      })

    for (const atom of Electromagnetic.charged) {
      if (atom === this) continue
      if (atom.id !== message.atom && atom.hasReactions())
        atom.handleReactionMessage({ data: message } as MessageEvent<Message>)
    }
    if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) Electromagnetic.channel.postMessage(message)
  }

  // -------------------------- Управление жизненным циклом ------------------------------

  protected static lock = false

  public static break() {
    Electromagnetic.lock = true
  }

  public static resume() {
    // Electromagnetic.queue = []
    // Electromagnetic.lock = false
  }

  public static get isLocked(): boolean {
    return Electromagnetic.lock
  }

  private static stack: Task[] = []
  private static pushTask(message: Message) {
    for (const patch of message.patches) {
      const task = {
        atom: message.atom,
        timestamp: message.timestamp,
        src: message.src,
        op: patch.op,
        path: patch.path,
        value: patch.value,
      }
      setTimeout(() => console.log("Следующий таск", Electromagnetic.taskType(task), patch.value), 100)
      this.stack.push(task)
    }
  }

  private static popTask() {
    return this.stack.pop()
  }
  private static shiftTask() {
    return this.stack.shift()
  }
  private static get lastTask(): Task {
    if (!this.stack.length) throw new Error("Stack is empty")
    return this.stack[this.stack.length - 1] as Task
  }
  private static checkType(message: Message): Tasks {
    for (const patch of message.patches) {
      const task = {
        atom: message.atom,
        timestamp: message.timestamp,
        src: message.src,
        op: patch.op,
        path: patch.path,
        value: patch.value,
      }
      return Electromagnetic.taskType(task)
    }
    return Tasks.Nothing
  }
  private static taskType(task: Task): Tasks {
    if (task.op === "add") return Tasks.AtomCreate
    if (task.op === "test") {
      const lastTask = Electromagnetic.lastTask
      if (Electromagnetic.stack[0]?.op === "add") return Tasks.ActionAfterAtomCreate
      return Tasks.Action
    }
    if (task.op === "replace") {
      if (task.path === "/state" && task.src === Source.Success) return Tasks.Success
      if (task.path === "/state" && task.src === Source.Error) return Tasks.Error
      if (task.path === "/state" && task.src === Source.Transition) return Tasks.Transition
      if (task.path === "/context" && task.src === Source.Success) return Tasks.ContextUpdateSuccess
      if (task.path === "/context" && task.src === Source.Error) return Tasks.ContextUpdateError
      if (task.path === "/context" && task.src === Source.Transition) return Tasks.ContextUpdateReaction
    }
    if (task.op === "remove") return Tasks.Destroy
    return Tasks.Nothing
  }
  private static get typeLastTask(): Tasks {
    const task = Electromagnetic.lastTask
    return Electromagnetic.taskType(task)
  }

  private static positionInStack(task: Task): boolean {
    const index = this.stack.findIndex((t) => t.atom === task.atom)
    return index !== -1
  }

  private static taskInStack(message: Message) {
    for (const task of this.stack) {
      if (task.atom !== message.atom) continue
      if (task.src !== message.src) continue
      if (task.op !== message.patches[0]!.op) continue
      if (task.path !== message.patches[0]!.path) continue
      return true
    }
    return false
  }
  public static step() {
    DEBUG_DEBUGGER && console.log("resume", Electromagnetic.typeLastTask)

    const task = Electromagnetic.lastTask
    const atom = Field.getAtom(task.atom)

    switch (Electromagnetic.typeLastTask) {
      case Tasks.AtomCreate:
        atom.transit()
        break
      case Tasks.ActionAfterAtomCreate: // (первичный, после попадает в Action)
        Electromagnetic.shiftTask()
        // @ts-expect-error
        atom.collapse(atom.processes.getProcess(atom.state.current))
        break
      case Tasks.Action:
        if (atom.process) {
          // @ts-expect-error
          atom.collapse(atom.process, task.value)
          break
        }
        // запуск для получения процесса (первичный)
        atom.measurement()
        console.log("")
        break
      case Tasks.Success:
        // @ts-expect-error
        atom.resolve()
        break
      case Tasks.Error:
        // @ts-expect-error
        atom.reject()
        break
      case Tasks.Transition:
        atom.measurement()
        break
      case Tasks.ContextUpdateSuccess:
        atom.update(task.value, task.src)
        break
      case Tasks.ContextUpdateError:
        atom.update(task.value, task.src)
        break
      case Tasks.ContextUpdateReaction:
        atom.transit()
        break
      case Tasks.Destroy:
        atom.destroy()
        break
    }
  }

  // ---------------------------- сообщения ------------------------------------

  protected requestInit(): boolean {
    const value = this.snapshot
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Nothing,
      patches: [{ op: "add", path: "/", value }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      // удалить из стека если нет переходов
      const transitions = this.state.states[this.state.current]
      if (!transitions) Electromagnetic.popTask()
      this.sendMessage(message)
      return true
    } else {
      // создается сразу без помещения в стек
      // if (Electromagnetic.stack.length > 1) {
      //   this.sendMessage(message)
      //   return true
      // }
      // при начальной инициализации помещается в стек для остановки brk сразу
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStartProcess() {
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Nothing,
      patches: [{ op: "test", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      // @ts-ignore удалить из стека если нет обработчиков success/error
      if (!(this.process?.success && this.process?.error)) Electromagnetic.popTask()
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestUpdateContext(context: Partial<Hidden<Values>>, src: Source): boolean {
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
      patches: [{ op: "replace", path: "/context", value: context }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      Electromagnetic.popTask()
      this.sendMessage(message)
      return true
    } else {
      this.rollbackContext()
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStateSuccess(): boolean {
    const value = this.state.current
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Success,
      patches: [{ op: "replace", path: "/state", value }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      clearProcessTasks(Electromagnetic.stack, value)
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStateError(): boolean {
    const value = this.state.current
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Error,
      patches: [{ op: "replace", path: "/state", value }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      clearProcessTasks(Electromagnetic.stack, value)
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestMeasure(): boolean {
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: Source.Transition,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      Electromagnetic.popTask()
      this.sendMessage(message)
      return true
    } else {
      this.rollbackState()
      Electromagnetic.pushTask(message)
      return false
    }
  }

  private requestDestroy(src: Source): boolean {
    const message: Message = {
      meta: this.meta,
      atom: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
      patches: [{ op: "remove", path: "/" }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      Electromagnetic.popTask()
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }
}
