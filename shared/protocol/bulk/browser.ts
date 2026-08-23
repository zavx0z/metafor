export const BULK_BROWSER_INITIAL_METHOD = "bulk.browser.initial" as const
export const BULK_BROWSER_MESSAGE_METHOD = "bulk.browser.message" as const
export const DARK_BULK_BROWSER_BROADCAST_METHOD =
  "dark.bulk.browser.broadcast" as const
export const DARK_BULK_VIEWPORT_CAPTURE_METHOD =
  "dark.bulk.viewport.capture" as const

export type BulkBrowserInitialRequest = {
  session: string
}

export type BulkBrowserMessageRequest = {
  message: unknown
}

export type DarkBulkViewportCaptureRequest = {
  source: string
  params: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const readBulkBrowserInitialRequest = (
  value: unknown,
): BulkBrowserInitialRequest | null =>
  isRecord(value) &&
  typeof value.session === "string" &&
  value.session.length > 0 &&
  value.session.length <= 256
    ? {session: value.session}
    : null

export const readBulkBrowserMessageRequest = (
  value: unknown,
): BulkBrowserMessageRequest | null =>
  isRecord(value) && Object.prototype.hasOwnProperty.call(value, "message")
    ? {message: value.message}
    : null

export const readDarkBulkViewportCaptureRequest = (
  value: unknown,
): DarkBulkViewportCaptureRequest | null =>
  isRecord(value) &&
  typeof value.source === "string" &&
  value.source.length > 0 &&
  Object.prototype.hasOwnProperty.call(value, "params")
    ? {source: value.source, params: value.params}
    : null
