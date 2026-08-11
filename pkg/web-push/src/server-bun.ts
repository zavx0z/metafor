import {
  generateVAPIDKeys,
  sendNotification,
  type PushSubscription,
  type RequestOptions,
  type SendResult,
} from "web-push"
import {chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {dirname} from "node:path"
import {validateWebPushSubscription, validPublicId} from "./protocol.ts"
import {
  type StoredWebPushSubscription,
  type WebPushSender,
  type WebPushSubscriptionStore,
} from "./server.ts"

export interface BunWebPushVapidCredentials {
  schema: 1
  subject: string
  publicKey: string
  privateKey: string
}

export interface BunWebPushSenderOptions extends BunWebPushVapidCredentials {
  send?: ((
    subscription: PushSubscription,
    payload: string,
    options: RequestOptions,
  ) => Promise<unknown>) | undefined
}

export function loadOrCreateBunWebPushVapidCredentials(
  storagePath: string,
  subject = "mailto:web-push@localhost",
): BunWebPushVapidCredentials {
  const persisted = readVapidCredentials(storagePath)
  if (persisted) return persisted
  const credentials = createBunWebPushVapidCredentials(subject)
  writePrivateJson(storagePath, credentials)
  return credentials
}

export function createBunWebPushVapidCredentials(
  subject = "mailto:web-push@localhost",
): BunWebPushVapidCredentials {
  validateVapidSubject(subject)
  const keys = generateVAPIDKeys()
  return {
    schema: 1,
    subject,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  }
}

export function createBunWebPushSender(options: BunWebPushSenderOptions): WebPushSender {
  validateVapidCredentials(options, options.send === undefined)
  const send = options.send ?? (async (subscription, payload, requestOptions) => {
    return await sendNotification(subscription, payload, requestOptions) as SendResult
  })
  return async (subscription, payload, requestOptions) => {
    const result = await send(subscription as PushSubscription, payload, {
      ...(requestOptions.ttl === undefined ? {} : {TTL: requestOptions.ttl}),
      ...(requestOptions.urgency === undefined ? {} : {urgency: requestOptions.urgency}),
      ...(requestOptions.topic === undefined ? {} : {topic: requestOptions.topic}),
      ...(requestOptions.timeout === undefined ? {} : {timeout: requestOptions.timeout}),
      vapidDetails: {
        subject: options.subject,
        publicKey: options.publicKey,
        privateKey: options.privateKey,
      },
    })
    return statusResult(result)
  }
}

export class BunJsonWebPushSubscriptionStore implements WebPushSubscriptionStore {
  readonly #storagePath: string
  readonly #subscriptions = new Map<string, StoredWebPushSubscription>()

  constructor(storagePath: string) {
    this.#storagePath = storagePath
    for (const value of readSubscriptions(storagePath)) this.#subscriptions.set(value.subscriptionId, value)
  }

  get(subscriptionId: string): StoredWebPushSubscription | null {
    const value = this.#subscriptions.get(subscriptionId)
    return value ? cloneStored(value) : null
  }

  put(value: StoredWebPushSubscription): void {
    this.#subscriptions.set(value.subscriptionId, cloneStored(value))
    this.#persist()
  }

  delete(subscriptionId: string): boolean {
    const deleted = this.#subscriptions.delete(subscriptionId)
    if (deleted) this.#persist()
    return deleted
  }

  list(): StoredWebPushSubscription[] {
    return [...this.#subscriptions.values()].map(cloneStored)
  }

  #persist(): void {
    writePrivateJson(this.#storagePath, {
      schema: 1,
      subscriptions: [...this.#subscriptions.values()],
    })
  }
}

function readSubscriptions(storagePath: string): StoredWebPushSubscription[] {
  try {
    const value = JSON.parse(readFileSync(storagePath, "utf8")) as unknown
    if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.subscriptions)) return []
    const output: StoredWebPushSubscription[] = []
    for (const entry of value.subscriptions) {
      try {
        if (!isRecord(entry) || entry.schema !== 1 || !validPublicId(entry.subscriptionId)) continue
        if (typeof entry.registeredAt !== "number" || typeof entry.updatedAt !== "number") continue
        output.push({
          schema: 1,
          subscriptionId: entry.subscriptionId,
          subscription: validateWebPushSubscription(entry.subscription),
          ...(isRecord(entry.metadata) ? {metadata: structuredClone(entry.metadata) as import("./protocol.ts").JsonRecord} : {}),
          registeredAt: entry.registeredAt,
          updatedAt: entry.updatedAt,
        })
      } catch {
        // One corrupt record does not invalidate other subscriptions.
      }
    }
    return output
  } catch {
    return []
  }
}

function readVapidCredentials(storagePath: string): BunWebPushVapidCredentials | null {
  try {
    const value = JSON.parse(readFileSync(storagePath, "utf8")) as unknown
    if (!isRecord(value) || value.schema !== 1) return null
    validateVapidCredentials(value)
    return {
      schema: 1,
      subject: value.subject,
      publicKey: value.publicKey,
      privateKey: value.privateKey,
    }
  } catch {
    return null
  }
}

function validateVapidCredentials(
  value: unknown,
  requireGeneratedLength = true,
): asserts value is BunWebPushVapidCredentials {
  if (!isRecord(value)) throw new Error("Invalid VAPID credentials")
  validateVapidSubject(value.subject)
  const keyPattern = requireGeneratedLength ? /^[A-Za-z0-9_-]{16,512}$/ : /^[A-Za-z0-9_-]{1,512}$/
  if (typeof value.publicKey !== "string" || !keyPattern.test(value.publicKey)) {
    throw new Error("Invalid VAPID public key")
  }
  if (typeof value.privateKey !== "string" || !keyPattern.test(value.privateKey)) {
    throw new Error("Invalid VAPID private key")
  }
}

function validateVapidSubject(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > 2_048 || (!value.startsWith("mailto:") && !value.startsWith("https://"))) {
    throw new Error("Invalid VAPID subject")
  }
}

function writePrivateJson(storagePath: string, value: unknown): void {
  const temporaryPath = `${storagePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  mkdirSync(dirname(storagePath), {recursive: true})
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600})
  renameSync(temporaryPath, storagePath)
  chmodSync(storagePath, 0o600)
}

function cloneStored(value: StoredWebPushSubscription): StoredWebPushSubscription {
  return {
    schema: 1,
    subscriptionId: value.subscriptionId,
    subscription: validateWebPushSubscription(structuredClone(value.subscription)),
    ...(value.metadata === undefined ? {} : {metadata: structuredClone(value.metadata)}),
    registeredAt: value.registeredAt,
    updatedAt: value.updatedAt,
  }
}

function statusResult(value: unknown): {statusCode?: number} {
  if (!isRecord(value) || typeof value.statusCode !== "number") return {}
  return {statusCode: value.statusCode}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
