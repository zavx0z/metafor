import { MsgSrc, TaskType, type Message, type Task } from "./electromagnetic.t"
import { Gravity, type Core } from "./gravity"
import type { Schema, Values } from "@zavx0z/context"
import { Field } from "./field"

export { MsgSrc }
export type { Message }

export abstract class Electromagnetic extends Gravity {
  static channelName = "electromagnetic"
  protected abstract hasReactions(): boolean
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void

  // -------------------------- Жизненный цикл -----------------------------------------

  protected constructor(id: string, meta: string, core?: Core) {
    super(id, meta, core)
  }

  protected connect() {
    if (this.hasReactions()) {
      Electromagnetic.chargedActors.add(this)
      if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        Electromagnetic.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.wired = true
  }

  protected disconnected() {
    this.wired = false
    if (this._onBCMessage && Electromagnetic.channel)
      Electromagnetic.channel.removeEventListener("message", this._onBCMessage)
  }

  public override destroy(recursive = true, src = MsgSrc.Nothing) {
    Electromagnetic.chargedActors.delete(this)
    this.requestDestroy(src)
    this.disconnected()
    super.destroy(recursive, src)
  }

  // -------------------------- Каналы -----------------------------------------

  protected wired = false
  /** Множество «заряжённых» акторов (у кого есть реакции). */
  private static chargedActors = new Set<Electromagnetic>()

  /** Включать ли BroadcastChannel для меж-контекстной доставки. */
  protected static useBroadcastChannel = true

  /** Общий BroadcastChannel для процесса (если доступен). */
  protected static channel: BroadcastChannel = new BroadcastChannel(Electromagnetic.channelName)

  /** Переключить использование BroadcastChannel. */
  static setBroadcastChannel(enabled: boolean) {
    Electromagnetic.useBroadcastChannel = enabled
  }

  static isBroadcastChannelEnabled(): boolean {
    return Electromagnetic.useBroadcastChannel
  }

  /** Получить количество зарегистрированных акторов. */
  static getRegisteredActorsCount(): number {
    return Electromagnetic.chargedActors.size
  }

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
      Field.saveActorSnapshot(this.id, this.snapshot)
    } else
      Field.pushPatches({
        actor: message.actor,
        src: message.src,
        patches: message.patches,
        timestamp: message.timestamp,
      })

    for (const actor of Electromagnetic.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions())
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
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
        actor: message.actor,
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
  private static clearStack() {
    this.stack = []
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
  private static checkType(message: Message): TaskType {
    for (const patch of message.patches) {
      const task = {
        actor: message.actor,
        timestamp: message.timestamp,
        src: message.src,
        op: patch.op,
        path: patch.path,
        value: patch.value,
      }
      return Electromagnetic.taskType(task)
    }
    return TaskType.Nothing
  }
  private static taskType(task: Task): TaskType {
    if (task.op === "add") return TaskType.Init
    if (task.op === "test") {
      const lastTask = Electromagnetic.lastTask
      if (Electromagnetic.stack[0]?.op === "add") return TaskType.InitAction
      return TaskType.Action
    }
    if (task.op === "replace") {
      if (task.path === "/state" && task.src === MsgSrc.Success) return TaskType.Success
      if (task.path === "/state" && task.src === MsgSrc.Error) return TaskType.Error
      if (task.path === "/context" && task.src === MsgSrc.Success) return TaskType.ContextUpdateSuccess
      if (task.path === "/context" && task.src === MsgSrc.Error) return TaskType.ContextUpdateError
      if (task.path === "/context" && task.src === MsgSrc.Transition) return TaskType.ContextUpdateTransition
    }
    if (task.op === "remove") return TaskType.Destroy
    return TaskType.Nothing
  }
  private static get typeLastTask(): TaskType {
    const task = Electromagnetic.lastTask
    return Electromagnetic.taskType(task)
  }
  private static taskInStack(message: Message) {
    for (const task of this.stack) {
      if (task.actor !== message.actor) continue
      if (task.src !== message.src) continue
      if (task.op !== message.patches[0]!.op) continue
      if (task.path !== message.patches[0]!.path) continue
      return true
    }
    return false
  }
  public static step() {
    const task = Electromagnetic.lastTask
    const actor = Field.getActor(task.actor)
    switch (Electromagnetic.typeLastTask) {
      case TaskType.Init: {
        console.log("resume init")
        actor.transit()
        return
      }
      case TaskType.InitAction: {
        console.log("resume test-init action")
        Electromagnetic.shiftTask()
        // @ts-ignore
        actor.recursive(actor.processes.getProcess(actor.state.current))
        return
      }
      case TaskType.Action: {
        console.log("resume action")
        // @ts-ignore
        if (actor.process) {
          // @ts-ignore
          actor.recursive(actor.process, task.value)
          return
        }
        // запуск для получения процесса
        actor.transition()
        return
      }
      case TaskType.Success: {
        console.log("resume success")
        // @ts-ignore
        actor.resolve()
        return
      }
      case TaskType.Error: {
        console.log("resume error")
        // @ts-ignore
        actor.reject()
        return
      }
      case TaskType.ContextUpdateSuccess: {
        console.log("resume success update context")
        actor.update(task.value, task.src)
        return
      }
      case TaskType.ContextUpdateError: {
        console.log("resume error update context")
        actor.update(task.value, task.src)
        return
      }
      case TaskType.ContextUpdateTransition: {
        console.log("resume transition update context")
        actor.transit()
        return
      }
      case TaskType.Destroy: {
        console.log("resume destroy")
        actor.transit()
        return
      }
    }
  }

  // ---------------------------- сообщения ------------------------------------

  protected requestInit(): boolean {
    const value = this.snapshot
    const message: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Nothing,
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
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStartProcess() {
    const message: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Nothing,
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

  protected requestUpdateContext(context: Partial<Values<Schema>>, src: MsgSrc): boolean {
    const message: Message = {
      meta: this.meta,
      actor: this.id,
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
      // откатить измененный контекст
      const snapshot = Field.getSnapshotByLastMessage()
      if (!snapshot) throw new Error("Snapshot not found")
      this.ctx.update(snapshot?.context)

      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStateSuccess(): boolean {
    const message: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Success,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      Electromagnetic.clearStack()
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStateError(): boolean {
    const message: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Error,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(message)
      return true
    }
    if (Electromagnetic.taskInStack(message)) {
      Electromagnetic.clearStack()
      this.sendMessage(message)
      return true
    } else {
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestTransition(): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Transition,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    if (Electromagnetic.taskInStack(msg)) {
      Electromagnetic.popTask()
      this.sendMessage(msg)
      return true
    } else {
      Electromagnetic.pushTask(msg)
      return false
    }
  }

  private requestDestroy(src: MsgSrc): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
      patches: [{ op: "remove", path: "/" }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    if (Electromagnetic.taskInStack(msg)) {
      Electromagnetic.popTask()
      this.sendMessage(msg)
      return true
    } else {
      Electromagnetic.pushTask(msg)
      return false
    }
  }
}
