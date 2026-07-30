import {
  sourceForceMessage,
  type ForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "shared/protocol/force/message"
import {forceCheckpointSideband} from "shared/transport/force/checkpoint"
import type {ForceChannel} from "./store.ts"

type AcceptDarkParticle = (message: SourcedForceMessage) => Promise<void>

/** In-process Dark adapter replacing the former Dark self-WebSocket. */
export class LocalDarkForce {
  readonly domain = "dark"
  readonly id = "dark-local"
  onDestroy?: () => void | Promise<void>
  readonly channel: ForceChannel
  #closed = false
  #connected = false
  #onImpulse: ((impulse: ForceMessage) => void | Promise<void>) | null = null
  #pending: ForceMessage[] = []
  #receiving: Promise<void> = Promise.resolve()

  constructor(private readonly accept: AcceptDarkParticle) {
    this.channel = {
      domain: "dark",
      send: (message) => this.#emitImpulse(message),
    }
    forceCheckpointSideband(this.domain)?.bindDrain(async () => await this.#receiving)
  }

  get connected(): boolean {
    return this.#connected
  }

  set onImpulse(handler: (impulse: ForceMessage) => void | Promise<void>) {
    this.#onImpulse = handler
    for (const impulse of this.#pending.splice(0)) this.#enqueue(handler, impulse)
  }

  activate(): void {
    if (this.#closed) throw new Error("Local Dark Force is closed")
    this.#connected = true
  }

  impulse(input: ForceMessageInput): void {
    if (this.#closed) throw new Error("Local Dark Force is closed")
    const message = sourceForceMessage(input, "dark")
    forceCheckpointSideband(this.domain)?.trackOutgoing()
    void this.accept(message).catch((error) => {
      console.error("[dark] local Force output acceptance failed", error)
    })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#connected = false
  }

  #emitImpulse(impulse: ForceMessage): void {
    const handler = this.#onImpulse
    if (!handler) {
      this.#pending.push(impulse)
      return
    }
    this.#enqueue(handler, impulse)
  }

  #enqueue(handler: (impulse: ForceMessage) => void | Promise<void>, impulse: ForceMessage): void {
    const checkpoint = forceCheckpointSideband(this.domain)
    this.#receiving = this.#receiving.then(async () => {
      if (checkpoint) {
        await checkpoint.processIncoming(impulse, handler)
      } else {
        await handler(impulse)
      }
    }).catch((error) => {
      console.error("[dark] local Force onImpulse failed", error)
    })
  }
}
