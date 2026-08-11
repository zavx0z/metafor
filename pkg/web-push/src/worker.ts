import {
  isRecord,
  validateWebPushMessage,
  type JsonRecord,
  type WebPushDeliveryReceipt,
  type WebPushMessage,
} from "./protocol.ts"
import {
  createWebPushLifecycleEmitter,
  type WebPushLifecycleHook,
} from "./lifecycle.ts"

export interface WebPushDataLike {
  json(): unknown
}

export interface WebPushEventLike {
  readonly data?: WebPushDataLike | null
  waitUntil(task: PromiseLike<unknown>): void
}

export interface WebPushNotificationLike {
  readonly data?: unknown
  close(): void
}

export interface WebPushNotificationClickEventLike {
  readonly action?: string
  readonly notification: WebPushNotificationLike
  waitUntil(task: PromiseLike<unknown>): void
}

export interface WebPushShowNotificationOptions {
  body?: string
  icon?: string
  badge?: string
  tag?: string
  data: {
    webPush: {
      schema: 1
      messageId: string
      operationId: string
    }
    application?: JsonRecord
  }
}

export interface WebPushWorkerHandlers {
  handlePush(event: WebPushEventLike): Promise<void>
  handleNotificationClick(event: WebPushNotificationClickEventLike): Promise<void>
}

export interface WebPushWorkerOptions {
  beforeNotification?: ((message: WebPushMessage) => unknown | Promise<unknown>) | undefined
  showNotification(title: string, options: WebPushShowNotificationOptions): Promise<void>
  sendDeliveryReceipt?: ((receipt: WebPushDeliveryReceipt) => unknown | Promise<unknown>) | undefined
  onNotificationClick?: ((input: {
    messageId: string
    operationId: string
    action: string
    applicationData?: JsonRecord
  }) => unknown | Promise<unknown>) | undefined
  onLifecycle?: WebPushLifecycleHook | undefined
  now?: (() => number) | undefined
  createId?: (() => string) | undefined
}

export function createWebPushWorkerHandlers(options: WebPushWorkerOptions): WebPushWorkerHandlers {
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultId
  const lifecycle = createWebPushLifecycleEmitter({
    source: "worker",
    onLifecycle: options.onLifecycle,
    now,
    createId,
  })

  return {
    handlePush(event) {
      const task = (async () => {
        let message: WebPushMessage
        try {
          message = validateWebPushMessage(event.data?.json())
        } catch (error) {
          lifecycle.emit({
            type: "worker.push-rejected",
            operationId: createSafeOperationId(createId),
            detail: {reason: publicErrorReason(error)},
          })
          return
        }

        lifecycle.emit({
          type: "worker.push-received",
          operationId: message.operationId,
          detail: {messageId: message.messageId},
        })
        try {
          await options.beforeNotification?.(message)
          await options.showNotification(message.notification.title, notificationOptions(message))
          lifecycle.emit({
            type: "worker.notification-shown",
            operationId: message.operationId,
            detail: {messageId: message.messageId},
          })
        } catch (error) {
          lifecycle.emit({
            type: "worker.notification-failed",
            operationId: message.operationId,
            detail: {messageId: message.messageId, reason: publicErrorReason(error)},
          })
          throw error
        }

        if (!options.sendDeliveryReceipt) return
        const receipt: WebPushDeliveryReceipt = {
          schema: 1,
          messageId: message.messageId,
          operationId: message.operationId,
          receivedAt: now(),
        }
        try {
          await options.sendDeliveryReceipt(receipt)
          lifecycle.emit({
            type: "worker.receipt-confirmed",
            operationId: message.operationId,
            detail: {messageId: message.messageId},
          })
        } catch (error) {
          lifecycle.emit({
            type: "worker.receipt-failed",
            operationId: message.operationId,
            detail: {messageId: message.messageId, reason: publicErrorReason(error)},
          })
        }
      })()
      event.waitUntil(task)
      return task
    },

    handleNotificationClick(event) {
      const task = (async () => {
        event.notification.close()
        const metadata = clickMetadata(event.notification.data)
        if (!metadata) return
        lifecycle.emit({
          type: "worker.notification-clicked",
          operationId: metadata.operationId,
          detail: {messageId: metadata.messageId},
        })
        await options.onNotificationClick?.({
          messageId: metadata.messageId,
          operationId: metadata.operationId,
          action: event.action ?? "",
          ...(metadata.applicationData === undefined ? {} : {applicationData: metadata.applicationData}),
        })
      })()
      event.waitUntil(task)
      return task
    },
  }
}

function notificationOptions(message: WebPushMessage): WebPushShowNotificationOptions {
  const source = message.notification
  return {
    ...(source.body === undefined ? {} : {body: source.body}),
    ...(source.icon === undefined ? {} : {icon: source.icon}),
    ...(source.badge === undefined ? {} : {badge: source.badge}),
    ...(source.tag === undefined ? {} : {tag: source.tag}),
    data: {
      webPush: {
        schema: 1,
        messageId: message.messageId,
        operationId: message.operationId,
      },
      ...(source.data === undefined ? {} : {application: source.data}),
    },
  }
}

function clickMetadata(value: unknown): {
  messageId: string
  operationId: string
  applicationData?: JsonRecord
} | null {
  if (!isRecord(value) || !isRecord(value.webPush)) return null
  try {
    const parsed = validateWebPushMessage({
      schema: 1,
      messageId: value.webPush.messageId,
      operationId: value.webPush.operationId,
      notification: {title: "click"},
    })
    const applicationData = isRecord(value.application) ? value.application as JsonRecord : undefined
    return {
      messageId: parsed.messageId,
      operationId: parsed.operationId,
      ...(applicationData === undefined ? {} : {applicationData}),
    }
  } catch {
    return null
  }
}

function createSafeOperationId(createId: () => string): string {
  try {
    const value = createId()
    return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : "invalid-push"
  } catch {
    return "invalid-push"
  }
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
