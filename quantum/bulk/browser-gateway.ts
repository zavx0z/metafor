import type {
  BulkStoreApplyControl,
} from "@metafor/types/bulk/store"
import type {
  BulkViewportCaptureResult,
} from "@metafor/types/bulk/capture"
import {
  BulkViewportCaptureRegistry,
} from "./capture.ts"
import {BulkObserverHandoffs} from "./handoff.ts"

export type BulkBrowserGatewayClient = {
  readonly domain: string
  readonly id: string
  send(message: unknown): boolean
}

/**
 * Browser transport state owned by Bulk but hosted on Dark's only listener.
 *
 * The gateway knows observer sessions and capture correlations. It never reads,
 * builds or mutates the Bulk Store.
 */
export class BulkBrowserGateway {
  readonly #clients = new Set<BulkBrowserGatewayClient>()
  readonly #disconnect = new Map<BulkBrowserGatewayClient, () => void>()
  readonly #handoffs = new BulkObserverHandoffs<BulkStoreApplyControl>()
  readonly #captures = new BulkViewportCaptureRegistry()

  openSession(): string {
    return this.#handoffs.open()
  }

  cancelSession(session: string): void {
    this.#handoffs.cancel(session)
  }

  connect(client: BulkBrowserGatewayClient, session: string): boolean {
    const pending = this.#handoffs.take(session)
    if (pending === null) return false
    for (const message of pending) {
      if (!client.send(message)) return false
    }
    this.#clients.add(client)
    this.#disconnect.set(client, this.#captures.connect(client, session))
    return true
  }

  disconnect(client: BulkBrowserGatewayClient): boolean {
    this.#disconnect.get(client)?.()
    this.#disconnect.delete(client)
    return this.#clients.delete(client)
  }

  broadcast(message: BulkStoreApplyControl): void {
    this.#handoffs.buffer(message)
    for (const client of this.#clients) client.send(message)
  }

  receiveControl(client: BulkBrowserGatewayClient, value: unknown): boolean {
    return this.#captures.receive(client, value)
  }

  capture(
    params: unknown,
    source: string,
  ): Promise<BulkViewportCaptureResult> {
    return this.#captures.capture(params, {source})
  }

  close(): void {
    for (const disconnect of this.#disconnect.values()) disconnect()
    this.#disconnect.clear()
    this.#clients.clear()
    this.#handoffs.clear()
    this.#captures.close()
  }
}
