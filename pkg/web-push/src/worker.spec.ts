import {describe, expect, test} from "bun:test"
import {createWebPushWorkerHandlers, type WebPushShowNotificationOptions} from "./worker.ts"
import type {WebPushLifecycleEvent} from "./lifecycle.ts"

const MESSAGE = {
  schema: 1,
  messageId: "message-1",
  operationId: "operation-1",
  notification: {
    title: "Новое сообщение",
    body: "Открыть приложение",
    data: {route: "/chat"},
  },
  data: {kind: "chat-message"},
}

describe("Web Push worker", () => {
  test("shows a validated notification and confirms device delivery", async () => {
    const events: WebPushLifecycleEvent[] = []
    const shown: Array<{title: string; options: WebPushShowNotificationOptions}> = []
    const receipts: unknown[] = []
    let waited: PromiseLike<unknown> | undefined
    const worker = createWebPushWorkerHandlers({
      async showNotification(title, options) { shown.push({title, options}) },
      async sendDeliveryReceipt(receipt) { receipts.push(receipt) },
      onLifecycle: (event) => { events.push(event) },
      now: () => 50,
    })
    await worker.handlePush({
      data: {json: () => MESSAGE},
      waitUntil(task) { waited = task },
    })
    expect(waited).toBeDefined()
    expect(shown).toEqual([{
      title: "Новое сообщение",
      options: {
        body: "Открыть приложение",
        data: {
          webPush: {schema: 1, messageId: "message-1", operationId: "operation-1"},
          application: {route: "/chat"},
        },
      },
    }])
    expect(receipts).toEqual([{
      schema: 1,
      messageId: "message-1",
      operationId: "operation-1",
      receivedAt: 50,
    }])
    expect(events.map((event) => event.type)).toEqual([
      "worker.push-received",
      "worker.notification-shown",
      "worker.receipt-confirmed",
    ])
  })

  test("rejects malformed payload without notification or secret leakage", async () => {
    const events: WebPushLifecycleEvent[] = []
    let shown = false
    const worker = createWebPushWorkerHandlers({
      async showNotification() { shown = true },
      onLifecycle: (event) => { events.push(event) },
      createId: () => "invalid-event",
    })
    await worker.handlePush({
      data: {json: () => ({endpoint: "https://push.example/secret"})},
      waitUntil() {},
    })
    expect(shown).toBe(false)
    expect(events.map((event) => event.type)).toEqual(["worker.push-rejected"])
    expect(JSON.stringify(events)).not.toContain("push.example")
  })

  test("keeps notification success separate from receipt failure", async () => {
    const events: WebPushLifecycleEvent[] = []
    const worker = createWebPushWorkerHandlers({
      async showNotification() {},
      async sendDeliveryReceipt() { throw new Error("offline") },
      onLifecycle: (event) => { events.push(event) },
    })
    await worker.handlePush({data: {json: () => MESSAGE}, waitUntil() {}})
    expect(events.map((event) => event.type)).toEqual([
      "worker.push-received",
      "worker.notification-shown",
      "worker.receipt-failed",
    ])
  })

  test("publishes click lifecycle and delegates navigation policy", async () => {
    const clicks: unknown[] = []
    const events: WebPushLifecycleEvent[] = []
    let closed = false
    const worker = createWebPushWorkerHandlers({
      async showNotification() {},
      onNotificationClick: (input) => { clicks.push(input) },
      onLifecycle: (event) => { events.push(event) },
    })
    await worker.handleNotificationClick({
      action: "open",
      notification: {
        data: {
          webPush: {schema: 1, messageId: "message-1", operationId: "operation-1"},
          application: {route: "/chat"},
        },
        close() { closed = true },
      },
      waitUntil() {},
    })
    expect(closed).toBe(true)
    expect(clicks).toEqual([{
      messageId: "message-1",
      operationId: "operation-1",
      action: "open",
      applicationData: {route: "/chat"},
    }])
    expect(events.map((event) => event.type)).toEqual(["worker.notification-clicked"])
  })
})
