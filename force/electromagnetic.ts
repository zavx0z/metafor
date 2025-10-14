import type { Message, Snapshot } from "../actor.t"
import { Gravity, type Core } from "./gravity"
import type { Context, Schema, Values } from "@zavx0z/context"
import type { StatesConfig } from "../schema/states.t"

export const CHANNEL = "actor-force"
export abstract class Electromagnetic extends Gravity {
  // ---------------------------------------------------------------------------------

  protected abstract ctx: Context<Schema>
  protected abstract state: { current: string; states: StatesConfig }
  protected abstract hasReactions(): boolean
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void
  protected abstract get snapshot(): Snapshot<Schema, string>

  // -------------------------- Жизненный цикл -----------------------------------------

  protected constructor(id: string, meta: string, core?: Core) {
    super(id, meta, core)
  }

  protected connected() {
    if (this.hasReactions()) {
      Electromagnetic.chargedActors.add(this)
      if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        Electromagnetic.channel.addEventListener("message", this._onBCMessage)
      }
    }
    this.wired = true
    this.sendMessage(this.msgInit)
  }

  protected disconnected() {
    this.wired = false
    if (this._onBCMessage && Electromagnetic.channel)
      Electromagnetic.channel.removeEventListener("message", this._onBCMessage)
  }

  public override destroy(recursive = true) {
    Electromagnetic.chargedActors.delete(this)
    this.sendMessage(this.msgRemove)
    this.disconnected()
    super.destroy(recursive)
  }
  // -------------------------- Управление жизненным циклом ------------------------------

  private static lock = false
  private static queue: Message[] = []

  static break() {
    Electromagnetic.lock = true
  }

  static resume() {
    for (const message of Electromagnetic.queue) {
    }
    Electromagnetic.queue = []
    Electromagnetic.lock = false
  }

  static get isLocked(): boolean {
    return Electromagnetic.lock
  }

  static step() {}

  // -------------------------- Каналы -----------------------------------------
  protected wired = false
  /** Множество «заряжённых» акторов (у кого есть реакции). */
  private static chargedActors = new Set<Electromagnetic>()

  /** Включать ли BroadcastChannel для меж-контекстной доставки. */
  protected static useBroadcastChannel = true

  /** Общий BroadcastChannel для процесса (если доступен). */
  protected static channel: BroadcastChannel = new BroadcastChannel(CHANNEL)

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
    if (Electromagnetic.lock) Electromagnetic.queue.push(message)
    if (!this.wired) return
    for (const actor of Electromagnetic.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions())
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
    }
    if (Electromagnetic.useBroadcastChannel && Electromagnetic.channel) Electromagnetic.channel.postMessage(message)
  }

  // -------- служебные билдеры системных сообщений --------

  protected msgUpdateContext(context: Partial<Values<Schema>>): Message {
    return {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "replace", path: "/context", value: context }],
    }
  }
  protected get msgStateBeforeAction(): Message {
    return {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "test", path: "/state", value: this.state.current }],
    }
  }
  protected get msgStateAfterAction(): Message {
    return {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "replace", path: "/state", value: this.state.current }],
    }
  }
  private get msgInit(): Message {
    return {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "add", path: "/", value: this.snapshot }],
    }
  }

  private get msgRemove(): Message {
    return {
      meta: this.meta,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "remove", path: "/" }],
    }
  }
}
