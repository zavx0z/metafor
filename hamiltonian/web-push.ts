import {
  generateVAPIDKeys,
  sendNotification,
  type PushSubscription,
  type RequestOptions,
  type SendResult,
} from "web-push"
import {chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"

export interface HamiltonianPushSubscriptionInput {
  workerIdentity: string
  deviceId: string
  subscription: PushSubscription
}

export interface HamiltonianPushWakePayload {
  kind: "wake-service-worker"
  wakeId: string
  wakeProof: string
  token: string
  serverEntityId: string
}

export interface HamiltonianPushSubscriptionSnapshot {
  workerEntityId: string
  deviceId: string
  endpointOrigin: string
  registeredAt: number
}

export interface HamiltonianWebPushOptions {
  publicKey?: string
  privateKey?: string
  subject?: string
  storagePath?: string
  send?: (
    subscription: PushSubscription,
    payload: string,
    options: RequestOptions,
  ) => Promise<unknown>
}

interface StoredSubscription extends HamiltonianPushSubscriptionSnapshot {
  subscription: PushSubscription
}

interface StoredWebPushState {
  schema: 1
  publicKey: string
  privateKey: string
  subscriptions: StoredSubscription[]
}

export class HamiltonianWebPush {
  readonly publicKey: string
  readonly #privateKey: string
  readonly #subject: string
  readonly #send: NonNullable<HamiltonianWebPushOptions["send"]>
  readonly #storagePath: string | null
  readonly #subscriptions = new Map<string, StoredSubscription>()

  constructor(options: HamiltonianWebPushOptions = {}) {
    if ((options.publicKey && !options.privateKey) || (!options.publicKey && options.privateKey)) {
      throw new Error("Both Hamiltonian VAPID keys must be provided together")
    }
    this.#storagePath = options.storagePath ?? null
    const persisted = this.#storagePath === null ? null : readStoredState(this.#storagePath)
    const keys = options.publicKey && options.privateKey
      ? {publicKey: options.publicKey, privateKey: options.privateKey}
      : persisted ?? generateVAPIDKeys()
    this.publicKey = keys.publicKey
    this.#privateKey = keys.privateKey
    this.#subject = options.subject ?? "mailto:hamiltonian@localhost"
    this.#send = options.send ?? (async (subscription, payload, requestOptions) => {
      await sendNotification(subscription, payload, requestOptions) as SendResult
    })
    const persistedSubscriptions = persisted &&
      persisted.publicKey === this.publicKey &&
      persisted.privateKey === this.#privateKey
      ? persisted.subscriptions
      : []
    for (const subscription of persistedSubscriptions) {
      try {
        this.#subscriptions.set(subscription.workerEntityId, {
          ...subscription,
          subscription: validatePushSubscription(subscription.subscription),
        })
      } catch {
        // A single stale record must not invalidate the VAPID identity or other subscriptions.
      }
    }
    this.#persist()
  }

  register(workerEntityId: string, input: HamiltonianPushSubscriptionInput): HamiltonianPushSubscriptionSnapshot {
    const subscription = validatePushSubscription(input.subscription)
    const endpointOrigin = new URL(subscription.endpoint).origin
    const stored: StoredSubscription = {
      workerEntityId,
      deviceId: input.deviceId,
      endpointOrigin,
      registeredAt: Date.now(),
      subscription,
    }
    this.#subscriptions.set(workerEntityId, stored)
    this.#persist()
    return publicSnapshot(stored)
  }

  has(workerEntityId: string): boolean {
    return this.#subscriptions.has(workerEntityId)
  }

  matchesDevice(workerEntityId: string, deviceId: string): boolean {
    return this.#subscriptions.get(workerEntityId)?.deviceId === deviceId
  }

  onlyWorkerEntityId(): string | null {
    return this.#subscriptions.size === 1
      ? this.#subscriptions.keys().next().value ?? null
      : null
  }

  snapshots(): HamiltonianPushSubscriptionSnapshot[] {
    return [...this.#subscriptions.values()].map(publicSnapshot)
  }

  async wake(workerEntityId: string, payload: HamiltonianPushWakePayload): Promise<void> {
    const stored = this.#subscriptions.get(workerEntityId)
    if (!stored) throw new Error("PushSubscription is not registered for this Service Worker")
    try {
      await this.#send(stored.subscription, JSON.stringify(payload), {
        TTL: 60,
        urgency: "high",
        topic: "hamiltonian-wake",
        timeout: 10_000,
        vapidDetails: {
          subject: this.#subject,
          publicKey: this.publicKey,
          privateKey: this.#privateKey,
        },
      })
    } catch (error) {
      const statusCode = webPushStatusCode(error)
      if (statusCode === 404 || statusCode === 410) {
        this.#subscriptions.delete(workerEntityId)
        this.#persist()
      }
      throw error
    }
  }

  #persist(): void {
    if (this.#storagePath === null) return
    const state: StoredWebPushState = {
      schema: 1,
      publicKey: this.publicKey,
      privateKey: this.#privateKey,
      subscriptions: [...this.#subscriptions.values()],
    }
    const temporaryPath = `${this.#storagePath}.${process.pid}.${crypto.randomUUID()}.tmp`
    mkdirSync(dirname(this.#storagePath), {recursive: true})
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {encoding: "utf8", mode: 0o600})
    renameSync(temporaryPath, this.#storagePath)
    chmodSync(this.#storagePath, 0o600)
  }
}

export function isHamiltonianPushSubscriptionInput(value: unknown): value is HamiltonianPushSubscriptionInput {
  if (!isRecord(value)) return false
  if (
    typeof value.workerIdentity !== "string" ||
    !validIdentity(value.workerIdentity) ||
    typeof value.deviceId !== "string" ||
    !validIdentity(value.deviceId) ||
    !isRecord(value.subscription)
  ) return false
  try {
    validatePushSubscription(value.subscription)
    return true
  } catch {
    return false
  }
}

export function isHamiltonianPushSubscription(value: unknown): value is PushSubscription {
  try {
    validatePushSubscription(value)
    return true
  } catch {
    return false
  }
}

export function validWorkerIdentity(value: unknown): value is string {
  return typeof value === "string" && validIdentity(value)
}

function validatePushSubscription(value: unknown): PushSubscription {
  if (!isRecord(value)) throw new Error("Invalid PushSubscription")
  const endpoint = value.endpoint
  const keys = value.keys
  if (typeof endpoint !== "string" || endpoint.length > 4_096) {
    throw new Error("Invalid PushSubscription endpoint")
  }
  const endpointUrl = new URL(endpoint)
  if (endpointUrl.protocol !== "https:") throw new Error("PushSubscription endpoint must use HTTPS")
  if (!isRecord(keys) || !validPushKey(keys.p256dh, 512) || !validPushKey(keys.auth, 256)) {
    throw new Error("Invalid PushSubscription keys")
  }
  const expirationTime = value.expirationTime
  if (expirationTime !== undefined && expirationTime !== null && typeof expirationTime !== "number") {
    throw new Error("Invalid PushSubscription expiration")
  }
  return {
    endpoint,
    ...(expirationTime === undefined ? {} : {expirationTime}),
    keys: {p256dh: keys.p256dh, auth: keys.auth},
  }
}

function publicSnapshot(value: StoredSubscription): HamiltonianPushSubscriptionSnapshot {
  return {
    workerEntityId: value.workerEntityId,
    deviceId: value.deviceId,
    endpointOrigin: value.endpointOrigin,
    registeredAt: value.registeredAt,
  }
}

function validIdentity(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
}

function validPushKey(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value)
}

function webPushStatusCode(error: unknown): number | null {
  return isRecord(error) && typeof error.statusCode === "number" ? error.statusCode : null
}

function readStoredState(storagePath: string): StoredWebPushState | null {
  try {
    const value = JSON.parse(readFileSync(storagePath, "utf8")) as unknown
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.publicKey !== "string" ||
      typeof value.privateKey !== "string" ||
      !Array.isArray(value.subscriptions)
    ) return null
    const subscriptions = value.subscriptions.filter((entry): entry is StoredSubscription =>
      isRecord(entry) &&
      typeof entry.workerEntityId === "string" && entry.workerEntityId.startsWith("service-worker:") &&
      typeof entry.deviceId === "string" &&
      typeof entry.endpointOrigin === "string" &&
      typeof entry.registeredAt === "number" &&
      isRecord(entry.subscription))
    return {
      schema: 1,
      publicKey: value.publicKey,
      privateKey: value.privateKey,
      subscriptions,
    }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
