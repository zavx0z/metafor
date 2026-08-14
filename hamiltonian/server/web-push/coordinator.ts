import {
  HamiltonianWebPush,
  validWorkerIdentity,
} from "./service.ts"
import type {WebPushLifecycleEvent, WebPushLifecycleHook} from "@metafor/web-push/lifecycle"
import {
  createHamiltonianLifecycleObservation,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
} from "../../core/lifecycle.js"
import type {HamiltonianServerLifecycle} from "../lifecycle.ts"
import type {HamiltonianServerObservation} from "../observation.ts"
import type {HamiltonianServerConfiguration} from "../configuration.ts"
import {hamiltonianSecurityHeaders} from "../browser/publication.ts"

interface PendingPushWake {
  wakeId: string
  wakeProof: string
  armedAt: number
  armedAfterConnectionGeneration: number
}

export interface HamiltonianWebPushServerOptions {
  configuration: HamiltonianServerConfiguration
  serverEntityId: string
  lifecycle: HamiltonianServerLifecycle
  observation: HamiltonianServerObservation
  controlConnectionGeneration(): number
}

/** Владеет Web Push subscription, wake admission и их таймерами. */
export class HamiltonianServerWebPush {
  readonly #options: HamiltonianWebPushServerOptions
  readonly #webPush: HamiltonianWebPush
  readonly #pendingWakes = new Map<string, PendingPushWake>()
  readonly #pendingWakeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(options: HamiltonianWebPushServerOptions) {
    this.#options = options
    let observe: WebPushLifecycleHook = () => {}
    this.#webPush = new HamiltonianWebPush({
      ...options.configuration.webPush,
      onLifecycle: (event) => observe(event),
    })
    observe = (event) => this.#observeLifecycle(event)
  }

  get publicKey(): string {
    return this.#webPush.publicKey
  }

  has(workerEntityId: string): boolean {
    return this.#webPush.has(workerEntityId)
  }

  matchesDevice(workerEntityId: string, deviceId: string): boolean {
    return this.#webPush.matchesDevice(workerEntityId, deviceId)
  }

  deviceIdFor(workerEntityId: string): string | null {
    return this.#webPush.deviceIdFor(workerEntityId)
  }

  pendingWake(workerEntityId: string): Readonly<PendingPushWake> | undefined {
    return this.#pendingWakes.get(workerEntityId)
  }

  hasPendingWake(workerEntityId: string): boolean {
    return this.#pendingWakes.has(workerEntityId)
  }

  snapshots() {
    return this.#webPush.snapshots()
  }

  pendingWakeIds(): ReadonlyArray<{workerEntityId: string; wakeId: string; armedAt: number}> {
    return [...this.#pendingWakes.entries()].map(([workerEntityId, wake]) => ({
      workerEntityId,
      wakeId: wake.wakeId,
      armedAt: wake.armedAt,
    }))
  }

  async register(
    workerEntityId: string,
    workerIdentity: string,
    deviceId: string,
    subscription: Parameters<HamiltonianWebPush["register"]>[1]["subscription"],
    registrationId: string,
  ) {
    return await this.#webPush.register(workerEntityId, {
      workerIdentity,
      deviceId,
      subscription,
    }, registrationId)
  }

  confirmWake(workerEntityId: string, wakeId: string): boolean {
    if (!this.#clearPendingWake(workerEntityId, wakeId)) return false
    this.#webPush.confirmReceipt(workerEntityId, {
      schema: 1,
      messageId: wakeId,
      operationId: wakeId,
      receivedAt: Date.now(),
    })
    return true
  }

  async handleWakeRequest(request: Request): Promise<Response> {
    let workerIdentity: string | null = null
    try {
      const input = await boundedJson(request)
      if (typeof input === "object" && input !== null && "workerIdentity" in input) {
        if (!validWorkerIdentity(input.workerIdentity)) {
          return new Response("Invalid Service Worker identity", {status: 400})
        }
        workerIdentity = input.workerIdentity
      }
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), {status: 400})
    }
    const workerEntityId = workerIdentity === null
      ? this.#webPush.onlyWorkerEntityId()
      : hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    if (!workerEntityId || !this.#webPush.has(workerEntityId)) {
      return new Response("PushSubscription not found", {status: 404})
    }
    const workerDeviceId = this.#webPush.deviceIdFor(workerEntityId)
    if (!workerDeviceId) return new Response("PushSubscription device not found", {status: 404})
    if (this.#pendingWakes.has(workerEntityId)) {
      return new Response("A Web Push wake is already pending for this Service Worker", {status: 409})
    }
    const wakeId = crypto.randomUUID()
    const wakeProof = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
    const wake: PendingPushWake = {
      wakeId,
      wakeProof,
      armedAt: Date.now(),
      armedAfterConnectionGeneration: this.#options.controlConnectionGeneration(),
    }
    this.#pendingWakes.set(workerEntityId, wake)
    this.#pendingWakeTimers.set(workerEntityId, setTimeout(() => {
      this.#pendingWakeTimers.delete(workerEntityId)
      if (this.#pendingWakes.get(workerEntityId)?.wakeId !== wakeId) return
      this.#pendingWakes.delete(workerEntityId)
      this.#options.observation.record({
        at: Date.now(), kind: "push-reconnect-timeout", detail: `${workerEntityId} ${wakeId}`,
      })
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
        state: "error", push: "reconnect-failed", wakeId, reason: "push-reconnect-timeout",
      })
    }, 90_000))
    this.#options.observation.record({at: Date.now(), kind: "push-armed", detail: `${workerEntityId} ${wakeId}`})
    this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
      state: "waking", push: "armed", wakeId,
    })
    try {
      await this.#webPush.wake(workerEntityId, {
        kind: "wake-service-worker",
        wakeId,
        wakeProof,
        token: this.#options.configuration.token,
        serverEntityId: this.#options.serverEntityId,
      })
      this.#options.observation.record({
        at: Date.now(), kind: "push-service-accepted", detail: `${workerEntityId} ${wakeId}`,
      })
      return Response.json({ok: true, workerEntityId, wakeId}, {
        headers: hamiltonianSecurityHeaders("application/json; charset=utf-8"),
      })
    } catch {
      const reason = "RedactedError"
      if (!this.#clearPendingWake(workerEntityId, wakeId)) {
        return Response.json({ok: true, workerEntityId, wakeId, delivery: "confirmed"}, {
          headers: hamiltonianSecurityHeaders("application/json; charset=utf-8"),
        })
      }
      this.#options.observation.record({
        at: Date.now(), kind: "push-send-failed", detail: `${workerEntityId} ${reason}`.slice(0, 512),
      })
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
        state: "error", push: "failed", reason,
      })
      return new Response("Web Push delivery failed", {status: 502})
    }
  }

  stop(): void {
    for (const timer of this.#pendingWakeTimers.values()) clearTimeout(timer)
    this.#pendingWakeTimers.clear()
    this.#pendingWakes.clear()
  }

  #clearPendingWake(workerEntityId: string, wakeId: string): boolean {
    if (this.#pendingWakes.get(workerEntityId)?.wakeId !== wakeId) return false
    this.#pendingWakes.delete(workerEntityId)
    const timer = this.#pendingWakeTimers.get(workerEntityId)
    if (timer) clearTimeout(timer)
    this.#pendingWakeTimers.delete(workerEntityId)
    return true
  }

  #observeLifecycle(event: WebPushLifecycleEvent): void {
    const workerEntityId = webPushWorkerEntityId(event)
    if (!workerEntityId) return
    const deviceId = this.#webPush.deviceIdFor(workerEntityId)
    if (!deviceId) return
    const transportId = hamiltonianLifecycleTransportId("web-push", workerEntityId)
    if (event.type === "server.subscription-stored" || event.type === "server.subscription-replaced") {
      this.#options.lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: transportId, subjectKind: "web-push",
        ownerId: this.#options.serverEntityId, sourceEntityId: this.#options.serverEntityId,
        targetEntityId: workerEntityId, transportId,
        attributes: {state: "ready", mediatedBy: "browser-push-service"},
      }))
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {push: "ready"})
      return
    }
    if (event.type === "server.subscription-removed") {
      this.#options.lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "transport", phase: "closed", subjectId: transportId, subjectKind: "web-push",
        ownerId: this.#options.serverEntityId, sourceEntityId: this.#options.serverEntityId,
        targetEntityId: workerEntityId, transportId,
        attributes: {reason: event.detail?.statusCode ?? "subscription-removed"},
      }))
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {push: "unavailable"})
      return
    }
    if (event.type === "server.push-queued") {
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "sending"})
      return
    }
    if (event.type === "server.push-dispatched" && event.detail?.messageId) {
      const messageId = hamiltonianLifecycleMessageId(event.detail.messageId)
      this.#options.lifecycle.observe(createHamiltonianLifecycleObservation({
        type: "message", phase: "sent", subjectId: messageId, subjectKind: "web-push-message",
        ownerId: this.#options.serverEntityId, sourceEntityId: this.#options.serverEntityId,
        targetEntityId: workerEntityId, transportId, messageId, messageClass: "web-push",
      }))
      this.#options.observation.record({
        at: event.at, kind: "push-sent", detail: `${workerEntityId} ${event.detail.messageId}`,
      })
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "sent"})
      return
    }
    if (event.type === "server.push-accepted") {
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "accepted"})
      return
    }
    if (event.type === "server.push-failed") {
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {
        state: "error", push: "failed",
        ...(event.detail?.reason === undefined ? {} : {reason: event.detail.reason}),
      })
      return
    }
    if (event.type === "server.receipt-confirmed") {
      this.#options.lifecycle.observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "active", push: "received"})
    }
  }
}

function webPushWorkerEntityId(event: WebPushLifecycleEvent): string | null {
  const detail = event.detail
  const candidate = event.subjectId ?? (detail && "subscriptionId" in detail ? detail.subscriptionId : null)
  return typeof candidate === "string" && candidate.startsWith("service-worker:") ? candidate : null
}

async function boundedJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Request body is too large")
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error("Request body is too large")
  return JSON.parse(text) as unknown
}
