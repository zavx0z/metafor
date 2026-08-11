import {
  WebPushService,
  type StoredWebPushSubscription,
  type WebPushSubscriptionStore,
} from "@metafor/web-push/server"
import {
  createBunWebPushSender,
  createBunWebPushVapidCredentials,
} from "@metafor/web-push/server/bun"
import {
  validateWebPushSubscription,
  validPublicId,
  type WebPushDeliveryReceipt,
  type WebPushMessage,
  type WebPushSubscriptionJSON,
} from "@metafor/web-push/protocol"
import type {WebPushLifecycleHook} from "@metafor/web-push/lifecycle"
import type {PushSubscription, RequestOptions} from "web-push"
import {chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"

export interface HamiltonianPushSubscriptionInput {
  workerIdentity: string
  deviceId: string
  subscription: WebPushSubscriptionJSON
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
  onLifecycle?: WebPushLifecycleHook
}

interface StoredWebPushState {
  schema: 1
  publicKey: string
  privateKey: string
  subject?: string
  subscriptions: LegacyStoredSubscription[]
}

interface LegacyStoredSubscription extends HamiltonianPushSubscriptionSnapshot {
  subscription: WebPushSubscriptionJSON
}

export class HamiltonianWebPush {
  readonly publicKey: string
  readonly #privateKey: string
  readonly #subject: string
  readonly #storagePath: string | null
  readonly #store: HamiltonianSubscriptionStore
  readonly #service: WebPushService
  readonly #knownDeviceIds = new Map<string, string>()

  constructor(options: HamiltonianWebPushOptions = {}) {
    if ((options.publicKey && !options.privateKey) || (!options.publicKey && options.privateKey)) {
      throw new Error("Both Hamiltonian VAPID keys must be provided together")
    }
    this.#storagePath = options.storagePath ?? null
    const persisted = this.#storagePath === null ? null : readStoredState(this.#storagePath)
    const credentials = options.publicKey && options.privateKey
      ? {
          schema: 1 as const,
          subject: options.subject ?? "mailto:hamiltonian@localhost",
          publicKey: options.publicKey,
          privateKey: options.privateKey,
        }
      : persisted
        ? {
            schema: 1 as const,
            subject: options.subject ?? persisted.subject ?? "mailto:hamiltonian@localhost",
            publicKey: persisted.publicKey,
            privateKey: persisted.privateKey,
          }
        : createBunWebPushVapidCredentials(options.subject ?? "mailto:hamiltonian@localhost")
    this.publicKey = credentials.publicKey
    this.#privateKey = credentials.privateKey
    this.#subject = credentials.subject
    const initial = persisted &&
      persisted.publicKey === this.publicKey &&
      persisted.privateKey === this.#privateKey
      ? persisted.subscriptions.flatMap(toStoredSubscription)
      : []
    this.#store = new HamiltonianSubscriptionStore(initial, () => this.#persist())
    for (const stored of initial) {
      const deviceId = metadataString(stored.metadata, "deviceId")
      if (deviceId) this.#knownDeviceIds.set(stored.subscriptionId, deviceId)
    }
    this.#service = new WebPushService({
      publicKey: this.publicKey,
      store: this.#store,
      send: createBunWebPushSender({
        ...credentials,
        ...(options.send === undefined ? {} : {send: options.send}),
      }),
      onLifecycle: options.onLifecycle,
    })
    this.#persist()
  }

  async register(
    workerEntityId: string,
    input: HamiltonianPushSubscriptionInput,
    operationId: string = crypto.randomUUID(),
  ): Promise<HamiltonianPushSubscriptionSnapshot> {
    if (!workerEntityId.startsWith("service-worker:") || !validPublicId(input.workerIdentity) || !validPublicId(input.deviceId)) {
      throw new Error("Invalid Hamiltonian PushSubscription identity")
    }
    const expectedWorkerEntityId = `service-worker:${input.workerIdentity}`
    if (workerEntityId !== expectedWorkerEntityId) {
      throw new Error("PushSubscription worker identity does not match its entity")
    }
    const acknowledgement = await this.#service.register(workerEntityId, {
      schema: 1,
      operationId,
      subscription: validateWebPushSubscription(input.subscription),
    }, {
      metadata: {
        deviceId: input.deviceId,
        workerIdentity: input.workerIdentity,
      },
    })
    if (!acknowledgement.accepted) throw new Error(acknowledgement.reason)
    this.#knownDeviceIds.set(workerEntityId, input.deviceId)
    const stored = this.#store.get(workerEntityId)
    if (!stored) throw new Error("Stored PushSubscription disappeared")
    return publicSnapshot(stored)
  }

  has(workerEntityId: string): boolean {
    return this.#store.has(workerEntityId)
  }

  deviceIdFor(workerEntityId: string): string | null {
    return metadataString(this.#store.get(workerEntityId)?.metadata, "deviceId") ??
      this.#knownDeviceIds.get(workerEntityId) ??
      null
  }

  matchesDevice(workerEntityId: string, deviceId: string): boolean {
    return metadataString(this.#store.get(workerEntityId)?.metadata, "deviceId") === deviceId
  }

  onlyWorkerEntityId(): string | null {
    const subscriptions = this.#store.list()
    return subscriptions.length === 1 ? subscriptions[0]!.subscriptionId : null
  }

  snapshots(): HamiltonianPushSubscriptionSnapshot[] {
    return this.#store.list().map(publicSnapshot)
  }

  async wake(workerEntityId: string, payload: HamiltonianPushWakePayload): Promise<void> {
    const message: WebPushMessage = {
      schema: 1,
      messageId: payload.wakeId,
      operationId: payload.wakeId,
      notification: {
        title: "Hamiltonian",
        body: "Service Worker восстановил связь с сервером",
        tag: "hamiltonian-service-worker",
        data: {wakeId: payload.wakeId},
      },
      data: {...payload},
    }
    await this.#service.send(workerEntityId, message, {
      ttl: 60,
      urgency: "high",
      topic: "hamiltonian-wake",
      timeout: 10_000,
    })
  }

  confirmReceipt(workerEntityId: string, receipt: WebPushDeliveryReceipt): void {
    this.#service.confirmReceipt(receipt, workerEntityId)
  }

  #persist(): void {
    if (this.#storagePath === null || !this.#store) return
    const state: StoredWebPushState = {
      schema: 1,
      publicKey: this.publicKey,
      privateKey: this.#privateKey,
      subject: this.#subject,
      subscriptions: this.#store.list().map((stored) => ({
        workerEntityId: stored.subscriptionId,
        deviceId: metadataString(stored.metadata, "deviceId") ?? "unknown-device",
        endpointOrigin: new URL(stored.subscription.endpoint).origin,
        registeredAt: stored.registeredAt,
        subscription: stored.subscription,
      })),
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
  if (!validPublicId(value.workerIdentity) || !validPublicId(value.deviceId)) return false
  try {
    validateWebPushSubscription(value.subscription)
    return true
  } catch {
    return false
  }
}

export function isHamiltonianPushSubscription(value: unknown): value is WebPushSubscriptionJSON {
  try {
    validateWebPushSubscription(value)
    return true
  } catch {
    return false
  }
}

export function validWorkerIdentity(value: unknown): value is string {
  return validPublicId(value)
}

class HamiltonianSubscriptionStore implements WebPushSubscriptionStore {
  readonly #subscriptions = new Map<string, StoredWebPushSubscription>()
  readonly #onChange: () => void

  constructor(initial: StoredWebPushSubscription[], onChange: () => void) {
    this.#onChange = onChange
    for (const value of initial) this.#subscriptions.set(value.subscriptionId, structuredClone(value))
  }

  has(subscriptionId: string): boolean {
    return this.#subscriptions.has(subscriptionId)
  }

  get(subscriptionId: string): StoredWebPushSubscription | null {
    const value = this.#subscriptions.get(subscriptionId)
    return value ? structuredClone(value) : null
  }

  put(value: StoredWebPushSubscription): void {
    this.#subscriptions.set(value.subscriptionId, structuredClone(value))
    this.#onChange()
  }

  delete(subscriptionId: string): boolean {
    const deleted = this.#subscriptions.delete(subscriptionId)
    if (deleted) this.#onChange()
    return deleted
  }

  list(): StoredWebPushSubscription[] {
    return [...this.#subscriptions.values()].map((value) => structuredClone(value))
  }
}

function publicSnapshot(value: StoredWebPushSubscription): HamiltonianPushSubscriptionSnapshot {
  return {
    workerEntityId: value.subscriptionId,
    deviceId: metadataString(value.metadata, "deviceId") ?? "unknown-device",
    endpointOrigin: new URL(value.subscription.endpoint).origin,
    registeredAt: value.registeredAt,
  }
}

function metadataString(
  metadata: StoredWebPushSubscription["metadata"],
  key: string,
): string | null {
  const value = metadata?.[key]
  return typeof value === "string" ? value : null
}

function toStoredSubscription(value: LegacyStoredSubscription): StoredWebPushSubscription[] {
  try {
    const subscription = validateWebPushSubscription(value.subscription)
    if (!value.workerEntityId.startsWith("service-worker:") || !validPublicId(value.deviceId)) return []
    return [{
      schema: 1,
      subscriptionId: value.workerEntityId,
      subscription,
      metadata: {
        deviceId: value.deviceId,
        workerIdentity: value.workerEntityId.slice("service-worker:".length),
      },
      registeredAt: value.registeredAt,
      updatedAt: value.registeredAt,
    }]
  } catch {
    return []
  }
}

function readStoredState(storagePath: string): StoredWebPushState | null {
  try {
    const value = JSON.parse(readFileSync(storagePath, "utf8")) as unknown
    if (
      !isRecord(value) ||
      value.schema !== 1 ||
      typeof value.publicKey !== "string" ||
      typeof value.privateKey !== "string" ||
      (value.subject !== undefined && typeof value.subject !== "string") ||
      !Array.isArray(value.subscriptions)
    ) return null
    const subscriptions = value.subscriptions.filter((entry): entry is LegacyStoredSubscription =>
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
      ...(value.subject === undefined ? {} : {subject: value.subject}),
      subscriptions,
    }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
