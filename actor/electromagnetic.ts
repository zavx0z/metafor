import { Field, type Hidden, type Values } from "./field"
import { Gravity, type Core } from "./gravity"

import { Source, TaskType, type Message, type Task } from "./electromagnetic.t"

export { Source }
export type { Message }

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
      Electromagnetic.chargedActors.add(this)
      if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        Electromagnetic.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.wired = true
  }

  public override destroy(recursive = true, source = Source.Nothing) {
    Electromagnetic.chargedActors.delete(this)
    this.requestDestroy(source)
    this.wired = false
    if (this._onBCMessage && Electromagnetic.channel)
      Electromagnetic.channel.removeEventListener("message", this._onBCMessage)
    super.destroy(recursive)
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
  /**
   * Очищает стек процесса состояния.
   *
   * Состояние с процессом action().success().error() | action().success() | action().error() | action()
   *
   *   - срабатывает один из этапов success/error, где каждый из этапов может обновлять контекст результатом из action
   *    ```js
   *     [
   *       {path: "/state", op: "test", value: state},
   *       {path: "/context", op: "replace", src: MsgSrc.Success},
   *       {path: "/state", op: "replace", value: state}
   *     ]
   *    ```
   *    ```js
   *     [
   *       {path: "/state", op: "test", value: state},
   *       {path: "/context", op: "replace", src: MsgSrc.Error},
   *       {path: "/state", op: "replace", value: state}
   *     ]
   *    ```
   *   - может и не обновлять, тогда патч {path: "/context"} не добавляется
   *    ```js
   *     [
   *       {path: "/state", op: "test", value: state},
   *       {path: "/state", op: "replace", value: state}
   *     ]
   *    ```
   *   - еще в процессе может контекст обновиться сторонним источником через реакции
   *    ```js
   *     [
   *       {path: "/state", op: "test", value: state},
   *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
   *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
   *       {path: "/state", op: "replace", value: state}
   *     ]
   *    ```
   *   - в стеке могут храниться патчи обновления контекста вне процесса,
   *     то есть когда процесс завершается, актор может оставаться в состоянии,
   *     но контекст обновляется сторонним источником через реакции
   *     !ВАЖНО: при очистке стека, патчи обновления контекста вне процесса не удаляются!
   *    ```js
   *     [
   *       {path: "/state", op: "test", value: state},
   *       {path: "/state", op: "replace", value: state}
   *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
   *       {path: "/context", op: "replace", src: MsgSrc.Reaction},
   *     ]
   *    ```
   */
  private static clearProcessTasks(state: string) {
    let INTO = false

    this.stack = this.stack.filter((task) => {
      // НАЧАЛО ПРОЦЕССА [без процесса в состоянии отсутствует]
      if (task.path === "/state" && task.op === "test" && task.value === state) {
        INTO = true
        return false
      }
      // ОБНОВЛЕНИЕ КОНТЕКСТА ОБРАБОТЧИКОМ SUCCESS/ERROR
      // Успешное завершение процесса (обновление контекста) [без объявления в процессе этапа success - отсутствует]
      if (task.path === "/context" && task.op === "replace" && task.src === Source.Success) return false
      // Неуспешное завершение процесса (обновление контекста) [без объявления в процессе этапа error - отсутствует]
      if (task.path === "/context" && task.op === "replace" && task.src === Source.Error) return false

      // ОБРАБОТКА ВОЗМОЖНЫХ ПАТЧЕЙ ОБНОВЛЕНИЯ КОНТЕКСТА РЕАКЦИЯМИ ВНУТРИ ПРОЦЕССА
      if (INTO && task.path === "/context" && task.op === "replace" && task.src === Source.Reaction) return false

      // КОНЕЦ ПРОЦЕССА [присутствует всегда в любом переходе]
      if (task.path === "/state" && task.op === "replace" && task.value === state) {
        INTO = false
        return false
      }

      return true
    })
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
    if (task.op === "add") return TaskType.ActorCreate
    if (task.op === "test") {
      const lastTask = Electromagnetic.lastTask
      if (Electromagnetic.stack[0]?.op === "add") return TaskType.ActionAfterActorCreate
      return TaskType.Action
    }
    if (task.op === "replace") {
      if (task.path === "/state" && task.src === Source.Success) return TaskType.Success
      if (task.path === "/state" && task.src === Source.Error) return TaskType.Error
      if (task.path === "/state" && task.src === Source.Transition) return TaskType.Transition
      if (task.path === "/context" && task.src === Source.Success) return TaskType.ContextUpdateSuccess
      if (task.path === "/context" && task.src === Source.Error) return TaskType.ContextUpdateError
      if (task.path === "/context" && task.src === Source.Transition) return TaskType.ContextUpdateReaction
    }
    if (task.op === "remove") return TaskType.Destroy
    return TaskType.Nothing
  }
  private static get typeLastTask(): TaskType {
    const task = Electromagnetic.lastTask
    return Electromagnetic.taskType(task)
  }

  private static positionInStack(task: Task): boolean {
    const index = this.stack.findIndex((t) => t.actor === task.actor)
    return index !== -1
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
    DEBUG_DEBUGGER && console.log("resume", Electromagnetic.typeLastTask)

    const task = Electromagnetic.lastTask
    const actor = Field.getActor(task.actor)

    switch (Electromagnetic.typeLastTask) {
      case TaskType.ActorCreate:
        actor.transit()
        break
      case TaskType.ActionAfterActorCreate: // (первичный, после попадает в Action)
        Electromagnetic.shiftTask()
        // @ts-ignore
        actor.collapse(actor.processes.getProcess(actor.state.current))
        break
      case TaskType.Action:
        // @ts-ignore (вторичный)
        if (actor.process) {
          // @ts-ignore
          actor.collapse(actor.process, task.value)
          break
        }
        // запуск для получения процесса (первичный)
        actor.measurement()
        console.log("")
        break
      case TaskType.Success:
        // @ts-ignore
        actor.resolve()
        break
      case TaskType.Error:
        // @ts-ignore
        actor.reject()
        break
      case TaskType.Transition:
        actor.measurement()
        break
      case TaskType.ContextUpdateSuccess:
        actor.update(task.value, task.src)
        break
      case TaskType.ContextUpdateError:
        actor.update(task.value, task.src)
        break
      case TaskType.ContextUpdateReaction:
        actor.transit()
        break
      case TaskType.Destroy:
        actor.destroy()
        break
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
      actor: this.id,
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
      this.rollbackContext()
      Electromagnetic.pushTask(message)
      return false
    }
  }

  protected requestStateSuccess(): boolean {
    const value = this.state.current
    const message: Message = {
      meta: this.meta,
      actor: this.id,
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
      Electromagnetic.clearProcessTasks(value)
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
      actor: this.id,
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
      Electromagnetic.clearProcessTasks(value)
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
      actor: this.id,
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
      actor: this.id,
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
