import {describe, expect, test} from "bun:test"
import {
  composeWebPushLifecycleHooks,
  createWebPushLifecycleEmitter,
  isWebPushLifecycleEvent,
  type WebPushLifecycleEvent,
} from "./lifecycle.ts"

describe("Web Push lifecycle", () => {
  test("does nothing when no hook is connected", () => {
    const event = createWebPushLifecycleEmitter({
      source: "client",
      now: () => 10,
      createId: () => "event-1",
    }).emit({type: "client.supported", operationId: "operation-1"})
    expect(event).toEqual({
      schema: 1,
      eventId: "event-1",
      operationId: "operation-1",
      at: 10,
      source: "client",
      type: "client.supported",
    })
  })

  test("delivers one safe event to the optional hook", () => {
    const events: WebPushLifecycleEvent[] = []
    createWebPushLifecycleEmitter({
      source: "server",
      onLifecycle: (event) => { events.push(event) },
      now: () => 20,
      createId: () => "event-2",
    }).emit({
      type: "server.push-accepted",
      operationId: "operation-2",
      subjectId: "subscription-1",
      detail: {subscriptionId: "subscription-1", messageId: "message-1", statusCode: 201},
    })
    expect(events).toHaveLength(1)
    expect(isWebPushLifecycleEvent(events[0])).toBe(true)
    expect(JSON.stringify(events[0])).not.toContain("endpoint")
    expect(JSON.stringify(events[0])).not.toContain("auth")
  })

  test("isolates throwing and rejecting hooks", async () => {
    const delivered: string[] = []
    const hook = composeWebPushLifecycleHooks(
      () => { throw new Error("observer failed") },
      async () => { throw new Error("async observer failed") },
      (event) => { delivered.push(event.eventId) },
    )
    expect(() => createWebPushLifecycleEmitter({
      source: "worker",
      onLifecycle: hook,
      createId: () => "event-3",
    }).emit({
      type: "worker.push-received",
      operationId: "operation-3",
      detail: {messageId: "message-3"},
    })).not.toThrow()
    await Promise.resolve()
    expect(delivered).toEqual(["event-3"])
  })

  test("rejects secret-shaped or unknown lifecycle details", () => {
    const lifecycle = createWebPushLifecycleEmitter({source: "client"})
    expect(() => lifecycle.emit({
      type: "client.registration-accepted",
      operationId: "operation-4",
      detail: {endpoint: "https://push.example/secret"} as never,
    })).toThrow("Invalid lifecycle detail")
    const event = lifecycle.emit({
      type: "client.registration-rejected",
      operationId: "operation-5",
      detail: {reason: "token-super-secret"},
    })
    expect(event.detail?.reason).toBe("RedactedError")
    expect(JSON.stringify(event)).not.toContain("token-super-secret")
    expect(isWebPushLifecycleEvent(event)).toBeTrue()
    expect(isWebPushLifecycleEvent({...event, detail: {reason: "token-super-secret"}})).toBeFalse()
    expect(isWebPushLifecycleEvent({...event, token: "token-super-secret"})).toBeFalse()
    expect(isWebPushLifecycleEvent({...event, source: "server"})).toBeFalse()
    expect(isWebPushLifecycleEvent({...event, type: "client.supported"})).toBeFalse()
    expect(() => lifecycle.emit({
      type: "server.vapid-ready",
      operationId: "operation-6",
    } as never)).toThrow("does not belong to client")
  })
})
