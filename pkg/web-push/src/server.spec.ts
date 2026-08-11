import {describe, expect, test} from "bun:test"
import {
  MemoryWebPushSubscriptionStore,
  WebPushService,
  WebPushSubscriptionNotFoundError,
} from "./server.ts"
import type {WebPushLifecycleEvent} from "./lifecycle.ts"

const REGISTRATION = {
  schema: 1,
  operationId: "operation-register",
  subscription: {
    endpoint: "https://push.example.test/send/secret",
    expirationTime: null,
    keys: {p256dh: "p256dh_key", auth: "auth_key"},
  },
}
const MESSAGE = {
  schema: 1,
  messageId: "message-1",
  operationId: "operation-send",
  notification: {title: "Wake"},
  data: {kind: "wake"},
}

describe("Web Push server", () => {
  test("stores and replaces one validated subscription", async () => {
    const events: WebPushLifecycleEvent[] = []
    let now = 10
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store: new MemoryWebPushSubscriptionStore(),
      send: async () => ({}),
      onLifecycle: (event) => { events.push(event) },
      now: () => now,
    })
    const first = await service.register("subscription-1", REGISTRATION)
    now = 20
    const second = await service.register("subscription-1", {
      ...REGISTRATION,
      operationId: "operation-replace",
    })
    expect(first).toEqual({schema: 1, accepted: true, subscriptionId: "subscription-1", registeredAt: 10})
    expect(second).toEqual({schema: 1, accepted: true, subscriptionId: "subscription-1", registeredAt: 10})
    expect((await service.subscriptions())[0]?.updatedAt).toBe(20)
    expect(events.map((event) => event.type)).toEqual([
      "server.vapid-ready",
      "server.subscription-stored",
      "server.subscription-replaced",
    ])
    expect(JSON.stringify(events)).not.toContain("push.example")
  })

  test("keeps push-service acceptance distinct from device receipt", async () => {
    const events: WebPushLifecycleEvent[] = []
    const sent: string[] = []
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store: new MemoryWebPushSubscriptionStore(),
      send: async (_subscription, payload) => { sent.push(payload); return {statusCode: 201} },
      onLifecycle: (event) => { events.push(event) },
      now: () => 30,
    })
    await service.register("subscription-1", REGISTRATION)
    const accepted = await service.send("subscription-1", MESSAGE)
    expect(accepted).toMatchObject({accepted: true, statusCode: 201, acceptedAt: 30})
    expect(sent).toHaveLength(1)
    expect(events.map((event) => event.type).slice(-3)).toEqual([
      "server.push-queued",
      "server.push-dispatched",
      "server.push-accepted",
    ])
    service.confirmReceipt({
      schema: 1,
      messageId: "message-1",
      operationId: "operation-send",
      receivedAt: 31,
    })
    expect(await service.waitForReceipt(MESSAGE, 100)).toMatchObject({receivedAt: 31})
    expect(events.at(-1)?.type).toBe("server.receipt-confirmed")
  })

  test("requires both message and operation identity before completing a receipt wait", async () => {
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store: new MemoryWebPushSubscriptionStore(),
      send: async () => ({}),
      now: () => 40,
    })
    const receipt = service.waitForReceipt(MESSAGE, 100)
    service.confirmReceipt({
      schema: 1,
      messageId: MESSAGE.messageId,
      operationId: "operation-forged",
      receivedAt: 31,
    })
    service.confirmReceipt({
      schema: 1,
      messageId: MESSAGE.messageId,
      operationId: MESSAGE.operationId,
      receivedAt: 32,
    })
    expect(await receipt).toEqual({
      schema: 1,
      messageId: MESSAGE.messageId,
      operationId: MESSAGE.operationId,
      receivedAt: 32,
    })

    service.confirmReceipt({
      schema: 1,
      messageId: "message-cached",
      operationId: MESSAGE.operationId,
      receivedAt: 33,
    })
    service.confirmReceipt({
      schema: 1,
      messageId: "message-cached",
      operationId: "operation-forged",
      receivedAt: 34,
    })
    expect(await service.waitForReceipt({...MESSAGE, messageId: "message-cached"}, 100))
      .toMatchObject({operationId: MESSAGE.operationId, receivedAt: 33})
  })

  test("deletes expired subscriptions on push service 404/410", async () => {
    const store = new MemoryWebPushSubscriptionStore()
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store,
      send: async () => { throw Object.assign(new Error("gone"), {statusCode: 410}) },
    })
    await service.register("subscription-1", REGISTRATION)
    await expect(service.send("subscription-1", MESSAGE)).rejects.toThrow("gone")
    expect(await store.get("subscription-1")).toBeNull()
  })

  test("rejects malformed registration and missing subscription", async () => {
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store: new MemoryWebPushSubscriptionStore(),
      send: async () => ({}),
      createId: () => "fallback-operation",
    })
    expect(await service.register("subscription-1", {schema: 0})).toEqual({
      schema: 1,
      accepted: false,
      reason: "Error",
    })
    await expect(service.send("subscription-1", MESSAGE)).rejects.toBeInstanceOf(WebPushSubscriptionNotFoundError)
  })

  test("reports receipt timeout separately", async () => {
    const events: WebPushLifecycleEvent[] = []
    const service = new WebPushService({
      publicKey: "public_key_123456",
      store: new MemoryWebPushSubscriptionStore(),
      send: async () => ({}),
      onLifecycle: (event) => { events.push(event) },
    })
    expect(await service.waitForReceipt(MESSAGE, 0)).toBeNull()
    expect(events.at(-1)?.type).toBe("server.receipt-timed-out")
  })
})
