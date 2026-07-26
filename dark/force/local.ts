import {
  sourceForceMessage,
  type ForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "shared/protocol/force/message"
import type {ForceChannel} from "./store.ts"

type AcceptDarkParticle = (message: SourcedForceMessage) => void

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
    this.accept(sourceForceMessage(input, "dark"))
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
    this.#receiving = this.#receiving.then(() => handler(impulse)).catch((error) => {
      console.error("[dark] local Force onImpulse failed", error)
    })
  }
}
