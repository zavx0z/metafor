import type { Snapshot } from "../actor.t"
import { MsgSrc, type Message } from "./electromagnetic.t"
import { Gravity, type Core } from "./gravity"
import type { Schema, Values } from "@zavx0z/context"
import { Field } from "../field/field"

export { MsgSrc }
export type { Message }

export abstract class Electromagnetic extends Gravity {
  static channelName = "electromagnetic"
  protected abstract hasReactions(): boolean
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void
  protected abstract get snapshot(): Snapshot<Schema, string>

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
    this.requestRemove(src)
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

  /** Доставка сообщения локально и (опционально) через BroadcastChannel. */
  protected sendMessage(message: Message) {
    if (!this.wired) return
    for (const actor of Electromagnetic.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions())
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
    }
    if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) Electromagnetic.channel.postMessage(message)
  }

  // -------------------------- Управление жизненным циклом ------------------------------

  protected static lock = false
  protected static queue: Message[] = []

  public static break() {
    Electromagnetic.lock = true
  }

  public static resume() {
    for (const message of Electromagnetic.queue) {
      console.log(message.actor.split("-").pop(), message.patches[0], message.meta, message.path, message.timestamp)
    }
    // Electromagnetic.queue = []
    // Electromagnetic.lock = false
  }

  public static get isLocked(): boolean {
    return Electromagnetic.lock
  }

  private static currentTask: Message | undefined

  public static step() {
    const message = Electromagnetic.queue.shift()
    if (!message) {
      console.warn("resume message not found")
      return
    }
    const actor = Field.getActor(message.actor)
    if (!actor) {
      console.error("resume actor not found", message.meta, message.actor, message.path)
      return
    }

    for (const patch of message.patches) {
      switch (patch.op) {
        case "add":
          console.log("resume transit")
          actor.transit()
          break
        case "replace":
          if (patch.path === "/context") {
            console.log("resume update context")
            actor.update(patch.value, message.src)
          }
          console.log("resume update")
          // actor.update(patch.value)
          break
        case "remove":
          console.log("resume destroy")
          // actor.destroy()
          break
        case "test":
          console.log("resume transition")
          // @ts-ignore
          actor.recursive(actor.processes.getProcess(actor.state.current))
          break
      }
    }
  }

  // ---------------------------- сообщения ------------------------------------
  private compareMessages(msg1: Message, msg2: Message): boolean {
    if (msg1.actor !== msg2.actor) return false
    if (msg1.patches.length !== msg2.patches.length) return false
    for (let i = 0; i < msg1.patches.length; i++) {
      if (msg1.patches[i]!.op !== msg2.patches[i]!.op) return false
      if (msg1.patches[i]!.path !== msg2.patches[i]!.path) return false
    }
    return true
  }

  private debugMessage(msg: Message): boolean {
    if (Electromagnetic.currentTask) {
      const isSame = this.compareMessages(Electromagnetic.currentTask, msg)
      if (isSame) {
        this.sendMessage(msg)
        Electromagnetic.currentTask = undefined
        return true
      }
    } else {
      console.log(msg.actor.split("-").pop(), msg.patches[0], msg.meta, msg.path, msg.timestamp, Electromagnetic.queue)
      Electromagnetic.currentTask = msg
    }
    Electromagnetic.queue.push(msg)
    return false
  }

  /**
   * 
   * При дебаге
   * 1. Инициализация актора
   
   */
  protected requestInit(): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Nothing,
      patches: [{ op: "add", path: "/", value: this.snapshot }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    return this.debugMessage(msg)
  }

  protected requestStartProcess() {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Nothing,
      patches: [{ op: "test", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    return this.debugMessage(msg)
  }

  protected requestUpdateContext(context: Partial<Values<Schema>>, src: MsgSrc): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src,
      patches: [{ op: "replace", path: "/context", value: context }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    if (src === MsgSrc.Success && msg.actor === this.id) {
      this.sendMessage(msg)
      return true
    } else {
      return this.debugMessage(msg)
    }
  }

  protected requestStateSuccess(): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Success,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    return this.debugMessage(msg)
  }

  protected requestStateError(): boolean {
    const msg: Message = {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      src: MsgSrc.Error,
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
    if (!Electromagnetic.lock) {
      this.sendMessage(msg)
      return true
    }
    return this.debugMessage(msg)
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
    return this.debugMessage(msg)
  }

  private requestRemove(src: MsgSrc): boolean {
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
    return this.debugMessage(msg)
  }
}
