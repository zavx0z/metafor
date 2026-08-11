import {
  validateWebPushDeliveryReceipt,
  validateWebPushMessage,
  validateWebPushRegistrationRequest,
  validateWebPushSubscription,
  validPublicId,
  type WebPushDeliveryReceipt,
  type WebPushMessage,
  type WebPushRegistrationAck,
  type WebPushRegistrationRequest,
  type WebPushSubscriptionJSON,
} from "./protocol.ts"
import {
  createWebPushLifecycleEmitter,
  type WebPushLifecycleHook,
} from "./lifecycle.ts"

export interface StoredWebPushSubscription {
  schema: 1
  subscriptionId: string
  subscription: WebPushSubscriptionJSON
  metadata?: import("./protocol.ts").JsonRecord
  registeredAt: number
  updatedAt: number
}

export interface WebPushSubscriptionStore {
  get(subscriptionId: string): StoredWebPushSubscription | null | Promise<StoredWebPushSubscription | null>
  put(value: StoredWebPushSubscription): void | Promise<void>
  delete(subscriptionId: string): boolean | Promise<boolean>
  list(): StoredWebPushSubscription[] | Promise<StoredWebPushSubscription[]>
}

export interface WebPushSendOptions {
  ttl?: number
  urgency?: "very-low" | "low" | "normal" | "high"
  topic?: string
  timeout?: number
}

export interface WebPushSenderResult {
  statusCode?: number
}

export type WebPushSender = (
  subscription: WebPushSubscriptionJSON,
  payload: string,
  options: WebPushSendOptions,
) => WebPushSenderResult | Promise<WebPushSenderResult>

export interface WebPushSendAccepted {
  accepted: true
  subscriptionId: string
  messageId: string
  operationId: string
  acceptedAt: number
  statusCode?: number
}

export interface WebPushServiceOptions {
  publicKey: string
  store: WebPushSubscriptionStore
  send: WebPushSender
  onLifecycle?: WebPushLifecycleHook | undefined
  now?: (() => number) | undefined
  createId?: (() => string) | undefined
  receiptRetentionMs?: number | undefined
}

export class WebPushService {
  readonly publicKey: string
  readonly #store: WebPushSubscriptionStore
  readonly #send: WebPushSender
  readonly #now: () => number
  readonly #createId: () => string
  readonly #receiptRetentionMs: number
  readonly #lifecycle: ReturnType<typeof createWebPushLifecycleEmitter>
  readonly #receipts = new Map<string, WebPushDeliveryReceipt>()
  readonly #receiptWaiters = new Map<string, Set<(receipt: WebPushDeliveryReceipt) => void>>()

  constructor(options: WebPushServiceOptions) {
    if (options.publicKey.length === 0 || options.publicKey.length > 512 || !/^[A-Za-z0-9_-]+$/.test(options.publicKey)) {
      throw new Error("Invalid VAPID public key")
    }
    this.publicKey = options.publicKey
    this.#store = options.store
    this.#send = options.send
    this.#now = options.now ?? Date.now
    this.#createId = options.createId ?? defaultId
    this.#receiptRetentionMs = options.receiptRetentionMs ?? 5 * 60_000
    this.#lifecycle = createWebPushLifecycleEmitter({
      source: "server",
      onLifecycle: options.onLifecycle,
      now: this.#now,
      createId: this.#createId,
    })
    this.#lifecycle.emit({
      type: "server.vapid-ready",
      operationId: this.#safeId(),
    })
  }

  async register(
    subscriptionId: string,
    value: unknown,
    options: {metadata?: import("./protocol.ts").JsonRecord} = {},
  ): Promise<WebPushRegistrationAck> {
    const fallbackOperationId = this.#safeId()
    if (!validPublicId(subscriptionId)) throw new Error("Invalid subscriptionId")
    let request: WebPushRegistrationRequest
    try {
      request = validateWebPushRegistrationRequest(value)
    } catch (error) {
      const reason = publicErrorReason(error)
      this.#lifecycle.emit({
        type: "server.subscription-rejected",
        operationId: validOperationIdFrom(value) ?? fallbackOperationId,
        subjectId: subscriptionId,
        detail: {subscriptionId, reason},
      })
      return {schema: 1, accepted: false, reason}
    }

    const timestamp = this.#now()
    const previous = await this.#store.get(subscriptionId)
    const stored: StoredWebPushSubscription = {
      schema: 1,
      subscriptionId,
      subscription: request.subscription,
      ...(options.metadata === undefined ? {} : {metadata: structuredClone(options.metadata)}),
      registeredAt: previous?.registeredAt ?? timestamp,
      updatedAt: timestamp,
    }
    await this.#store.put(stored)
    this.#lifecycle.emit({
      type: previous ? "server.subscription-replaced" : "server.subscription-stored",
      operationId: request.operationId,
      subjectId: subscriptionId,
      detail: {subscriptionId},
    })
    return {
      schema: 1,
      accepted: true,
      subscriptionId,
      registeredAt: stored.registeredAt,
    }
  }

  async remove(subscriptionId: string, operationId = this.#safeId()): Promise<boolean> {
    if (!validPublicId(subscriptionId)) throw new Error("Invalid subscriptionId")
    if (!validPublicId(operationId)) throw new Error("Invalid operationId")
    const removed = await this.#store.delete(subscriptionId)
    if (removed) {
      this.#lifecycle.emit({
        type: "server.subscription-removed",
        operationId,
        subjectId: subscriptionId,
        detail: {subscriptionId},
      })
    }
    return removed
  }

  async send(
    subscriptionId: string,
    value: unknown,
    options: WebPushSendOptions = {},
  ): Promise<WebPushSendAccepted> {
    if (!validPublicId(subscriptionId)) throw new Error("Invalid subscriptionId")
    const message = validateWebPushMessage(value)
    const stored = await this.#store.get(subscriptionId)
    if (!stored) {
      this.#lifecycle.emit({
        type: "server.push-failed",
        operationId: message.operationId,
        subjectId: subscriptionId,
        detail: {subscriptionId, messageId: message.messageId, reason: "SubscriptionNotFound"},
      })
      throw new WebPushSubscriptionNotFoundError(subscriptionId)
    }
    this.#lifecycle.emit({
      type: "server.push-queued",
      operationId: message.operationId,
      subjectId: subscriptionId,
      detail: {subscriptionId, messageId: message.messageId},
    })
    try {
      const delivery = this.#send(stored.subscription, JSON.stringify(message), options)
      this.#lifecycle.emit({
        type: "server.push-dispatched",
        operationId: message.operationId,
        subjectId: subscriptionId,
        detail: {subscriptionId, messageId: message.messageId},
      })
      const result = await delivery
      const statusCode = validStatusCode(result.statusCode) ? result.statusCode : undefined
      this.#lifecycle.emit({
        type: "server.push-accepted",
        operationId: message.operationId,
        subjectId: subscriptionId,
        detail: {
          subscriptionId,
          messageId: message.messageId,
          ...(statusCode === undefined ? {} : {statusCode}),
        },
      })
      return {
        accepted: true,
        subscriptionId,
        messageId: message.messageId,
        operationId: message.operationId,
        acceptedAt: this.#now(),
        ...(statusCode === undefined ? {} : {statusCode}),
      }
    } catch (error) {
      const statusCode = webPushStatusCode(error)
      if (statusCode === 404 || statusCode === 410) {
        await this.#store.delete(subscriptionId)
        this.#lifecycle.emit({
          type: "server.subscription-removed",
          operationId: message.operationId,
          subjectId: subscriptionId,
          detail: {subscriptionId, messageId: message.messageId, statusCode},
        })
      }
      this.#lifecycle.emit({
        type: "server.push-failed",
        operationId: message.operationId,
        subjectId: subscriptionId,
        detail: {
          subscriptionId,
          messageId: message.messageId,
          ...(statusCode === null ? {} : {statusCode}),
          reason: publicErrorReason(error),
        },
      })
      throw error
    }
  }

  confirmReceipt(value: unknown, subscriptionId?: string): WebPushDeliveryReceipt {
    const receipt = validateWebPushDeliveryReceipt(value)
    if (subscriptionId !== undefined && !validPublicId(subscriptionId)) throw new Error("Invalid subscriptionId")
    this.#pruneReceipts()
    const key = receiptKey(receipt)
    this.#receipts.set(key, receipt)
    const waiters = this.#receiptWaiters.get(key)
    if (waiters) {
      for (const resolve of [...waiters]) resolve(receipt)
      if (waiters.size === 0) this.#receiptWaiters.delete(key)
    }
    this.#lifecycle.emit({
      type: "server.receipt-confirmed",
      operationId: receipt.operationId,
      ...(subscriptionId === undefined ? {} : {subjectId: subscriptionId}),
      detail: {
        messageId: receipt.messageId,
        ...(subscriptionId === undefined ? {} : {subscriptionId}),
      },
    })
    return receipt
  }

  async waitForReceipt(message: Pick<WebPushMessage, "messageId" | "operationId">, timeoutMs: number): Promise<WebPushDeliveryReceipt | null> {
    if (!validPublicId(message.messageId) || !validPublicId(message.operationId)) throw new Error("Invalid receipt identity")
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("Invalid receipt timeout")
    this.#pruneReceipts()
    const key = receiptKey(message)
    const existing = this.#receipts.get(key)
    if (existing) {
      this.#receipts.delete(key)
      return existing
    }
    return new Promise((resolve) => {
      const waiters = this.#receiptWaiters.get(key) ?? new Set()
      let settled = false
      const finish = (receipt: WebPushDeliveryReceipt | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        waiters.delete(onReceipt)
        if (waiters.size === 0) this.#receiptWaiters.delete(key)
        if (receipt) this.#receipts.delete(key)
        resolve(receipt)
      }
      const onReceipt = (receipt: WebPushDeliveryReceipt) => finish(receipt)
      waiters.add(onReceipt)
      this.#receiptWaiters.set(key, waiters)
      const timer = setTimeout(() => {
        this.#lifecycle.emit({
          type: "server.receipt-timed-out",
          operationId: message.operationId,
          detail: {messageId: message.messageId},
        })
        finish(null)
      }, timeoutMs)
    })
  }

  async subscriptions(): Promise<StoredWebPushSubscription[]> {
    return this.#store.list()
  }

  #safeId(): string {
    try {
      const value = this.#createId()
      return validPublicId(value) ? value : "web-push-operation"
    } catch {
      return "web-push-operation"
    }
  }

  #pruneReceipts(): void {
    const threshold = this.#now() - this.#receiptRetentionMs
    for (const [key, receipt] of this.#receipts) {
      if (receipt.receivedAt < threshold) this.#receipts.delete(key)
    }
  }
}

function receiptKey(message: Pick<WebPushDeliveryReceipt, "messageId" | "operationId">): string {
  return `${message.messageId}\u0000${message.operationId}`
}

export class MemoryWebPushSubscriptionStore implements WebPushSubscriptionStore {
  readonly #subscriptions = new Map<string, StoredWebPushSubscription>()

  constructor(initial: StoredWebPushSubscription[] = []) {
    for (const value of initial) this.#subscriptions.set(value.subscriptionId, cloneStoredSubscription(value))
  }

  get(subscriptionId: string): StoredWebPushSubscription | null {
    const value = this.#subscriptions.get(subscriptionId)
    return value ? cloneStoredSubscription(value) : null
  }

  put(value: StoredWebPushSubscription): void {
    this.#subscriptions.set(value.subscriptionId, cloneStoredSubscription(value))
  }

  delete(subscriptionId: string): boolean {
    return this.#subscriptions.delete(subscriptionId)
  }

  list(): StoredWebPushSubscription[] {
    return [...this.#subscriptions.values()].map(cloneStoredSubscription)
  }
}

export class WebPushSubscriptionNotFoundError extends Error {
  constructor(readonly subscriptionId: string) {
    super(`Web Push subscription not found: ${subscriptionId}`)
    this.name = "WebPushSubscriptionNotFoundError"
  }
}

function cloneStoredSubscription(value: StoredWebPushSubscription): StoredWebPushSubscription {
  return {
    schema: 1,
    subscriptionId: value.subscriptionId,
    subscription: validateWebPushSubscription(structuredClone(value.subscription)),
    ...(value.metadata === undefined ? {} : {metadata: structuredClone(value.metadata)}),
    registeredAt: value.registeredAt,
    updatedAt: value.updatedAt,
  }
}

function validOperationIdFrom(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("operationId" in value)) return null
  return validPublicId(value.operationId) ? value.operationId : null
}

function validStatusCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
}

function webPushStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null
  return validStatusCode(error.statusCode) ? error.statusCode : null
}

function publicErrorReason(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : "UnknownError"
}

let fallbackId = 0
function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  fallbackId += 1
  return `web-push-${Date.now()}-${fallbackId}`
}
