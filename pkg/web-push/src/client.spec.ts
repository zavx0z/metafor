import {describe, expect, test} from "bun:test"
import {
  createWebPushClient,
  decodeApplicationServerKey,
  type WebPushClientSubscription,
} from "./client.ts"
import type {WebPushLifecycleEvent} from "./lifecycle.ts"

const PUBLIC_KEY = "BEl6D-T_hJ8YqgPp1iA"
const SUBSCRIPTION = {
  endpoint: "https://push.example.test/send/secret",
  expirationTime: null,
  keys: {p256dh: "p256dh_key", auth: "auth_key"},
}

describe("Web Push client", () => {
  test("requests browser notification permission directly and distinguishes dismissal", async () => {
    let permissionRequests = 0
    const events: WebPushLifecycleEvent[] = []
    const result = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(null),
      notifications: {
        permission: "default",
        async requestPermission() { permissionRequests += 1; return "default" },
      },
      registerSubscription: () => { throw new Error("must not register") },
      onLifecycle: (event) => { events.push(event) },
    }).enable("operation-dismissed")
    expect(result).toEqual({
      accepted: false,
      operationId: "operation-dismissed",
      reason: "permission-dismissed",
    })
    expect(permissionRequests).toBe(1)
    expect(events.map((event) => event.type)).toEqual([
      "client.supported",
      "client.permission-requested",
      "client.permission-dismissed",
    ])
  })

  test("creates a subscription and succeeds only after server acknowledgement", async () => {
    const events: WebPushLifecycleEvent[] = []
    let subscribeOptions: unknown
    const subscription = fakeSubscription(decodeApplicationServerKey(PUBLIC_KEY))
    const result = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(null, async (options) => {
        subscribeOptions = options
        return subscription
      }),
      notifications: {permission: "granted", async requestPermission() { return "granted" }},
      registerSubscription: (request) => ({
        schema: 1,
        accepted: true,
        subscriptionId: "subscription-1",
        registeredAt: 42,
        request,
      }),
      onLifecycle: (event) => { events.push(event) },
    }).enable("operation-create")
    expect(result.accepted).toBe(true)
    expect(result.accepted && result.subscriptionId).toBe("subscription-1")
    expect(subscribeOptions).toMatchObject({userVisibleOnly: true})
    expect(events.map((event) => event.type)).toEqual([
      "client.supported",
      "client.permission-granted",
      "client.subscription-created",
      "client.registration-accepted",
    ])
    expect(JSON.stringify(events)).not.toContain("push.example")
  })

  test("restores the matching subscription and rotates a mismatched key", async () => {
    const matching = fakeSubscription(decodeApplicationServerKey(PUBLIC_KEY))
    const restored = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(matching),
      notifications: {permission: "granted", async requestPermission() { return "granted" }},
      registerSubscription: () => acceptedAck("subscription-restored"),
    }).enable("operation-restore")
    expect(restored.accepted && restored.restored).toBe(true)

    const silentlyRestored = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(matching),
      notifications: {permission: "granted", async requestPermission() { throw new Error("must not prompt") }},
      registerSubscription: () => acceptedAck("subscription-restored"),
    }).restore("operation-silent-restore")
    expect(silentlyRestored?.restored).toBe(true)

    let oldUnsubscribed = false
    const old = fakeSubscription(new Uint8Array([1, 2, 3]), () => { oldUnsubscribed = true })
    const rotated = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(old, async () => fakeSubscription(decodeApplicationServerKey(PUBLIC_KEY))),
      notifications: {permission: "granted", async requestPermission() { return "granted" }},
      registerSubscription: () => acceptedAck("subscription-rotated"),
    }).enable("operation-rotate")
    expect(oldUnsubscribed).toBe(true)
    expect(rotated.accepted && rotated.rotated).toBe(true)
  })

  test("reports denied permission and rejected registration distinctly", async () => {
    const denied = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(null),
      notifications: {permission: "denied", async requestPermission() { return "denied" }},
      registerSubscription: () => acceptedAck("unused"),
    }).enable("operation-denied")
    expect(denied).toEqual({accepted: false, operationId: "operation-denied", reason: "permission-denied"})

    const events: WebPushLifecycleEvent[] = []
    const rejected = await createWebPushClient({
      applicationServerKey: PUBLIC_KEY,
      serviceWorker: container(null, async () => fakeSubscription(decodeApplicationServerKey(PUBLIC_KEY))),
      notifications: {permission: "granted", async requestPermission() { return "granted" }},
      registerSubscription: () => ({schema: 1, accepted: false, reason: "token-super-secret"}),
      onLifecycle: (event) => { events.push(event) },
    }).enable("operation-rejected")
    expect(rejected).toEqual({accepted: false, operationId: "operation-rejected", reason: "registration-rejected"})
    expect(events.at(-1)).toMatchObject({detail: {reason: "RegistrationRejected"}})
    expect(JSON.stringify(events)).not.toContain("token-super-secret")
  })
})

function container(
  existing: WebPushClientSubscription | null,
  subscribe: (options: {userVisibleOnly: true; applicationServerKey: Uint8Array<ArrayBuffer>}) => Promise<WebPushClientSubscription> = async () => {
    throw new Error("unexpected subscribe")
  },
) {
  return {
    ready: Promise.resolve({
      pushManager: {
        async getSubscription() { return existing },
        subscribe,
      },
    }),
  }
}

function fakeSubscription(key: Uint8Array<ArrayBuffer>, onUnsubscribe = () => {}): WebPushClientSubscription {
  return {
    options: {applicationServerKey: key},
    toJSON: () => SUBSCRIPTION,
    async unsubscribe() { onUnsubscribe(); return true },
  }
}

function acceptedAck(subscriptionId: string) {
  return {schema: 1, accepted: true, subscriptionId, registeredAt: 42}
}
