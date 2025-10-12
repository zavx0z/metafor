import type { Message } from "../actor.t"
import { Fields } from "./fields"

/**
 * ElectromagneticField — калибровочное поле обмена «квантами» (сообщениями) между акторами.
 * Сообщение играет роль фотона; акторы с реакциями — «заряжённые» частицы.
 */
export abstract class ElectromagneticField extends Fields {
  protected static useBroadcastChannel = true
  protected static channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("actor-force") : null

  private static chargedActors = new Set<ElectromagneticField>()

  public abstract readonly id: string
  public abstract readonly path: string

  private _onBCMessage?: (ev: MessageEvent<Message>) => void

  static setBroadcastChannel(enabled: boolean) {
    ElectromagneticField.useBroadcastChannel = enabled
  }
  static isBroadcastChannelEnabled(): boolean {
    return ElectromagneticField.useBroadcastChannel
  }

  protected initializeCommunication() {
    if (this.hasReactions()) {
      ElectromagneticField.chargedActors.add(this)
      if (ElectromagneticField.useBroadcastChannel && ElectromagneticField.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        ElectromagneticField.channel.addEventListener("message", this._onBCMessage as EventListener)
      }
    }
  }

  protected destroyCommunication() {
    ElectromagneticField.chargedActors.delete(this)
    if (this._onBCMessage && ElectromagneticField.channel) {
      ElectromagneticField.channel.removeEventListener("message", this._onBCMessage as EventListener)
    }
  }

  protected sendMessage(message: Message) {
    for (const actor of ElectromagneticField.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions()) {
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
      }
    }
    if (ElectromagneticField.useBroadcastChannel && ElectromagneticField.channel) {
      ElectromagneticField.channel.postMessage(message)
    }
  }

  protected abstract hasReactions(): boolean
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void
}
