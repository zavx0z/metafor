import {
  type BulkStoreInitial,
} from "shared/protocol/bulk/store"
import {isBulkStoreInitial} from "./store.ts"

export const BULK_PAGE_SHELL_ROUTE = "/__metafor/bulk-page-shell"

const NO_STORE_HEADERS = Object.freeze({
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
})

const PAGE_HEADERS = Object.freeze({
  ...NO_STORE_HEADERS,
  "content-type": "text/html; charset=utf-8",
})

const INITIAL_HEADERS = Object.freeze({
  ...NO_STORE_HEADERS,
  "content-type": "application/json; charset=utf-8",
})

export const bulkPageShellResponse = (html: string): Response =>
  new Response(html, {headers: PAGE_HEADERS})

export const bulkInitialStoreResponse = (initial: BulkStoreInitial): Response =>
  new Response(JSON.stringify(initial), {headers: INITIAL_HEADERS})

export const bulkInitialPageErrorResponse = (error: unknown): Response =>
  Response.json({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, {
    status: 503,
    headers: NO_STORE_HEADERS,
  })

export type BulkPageShellDependencies = Readonly<{
  readShell(): Promise<string>
}>

/** Returns the static browser shell without waiting for a Boundary snapshot. */
export const serveBulkPageShell = async (
  dependencies: BulkPageShellDependencies,
): Promise<Response> => {
  try {
    return bulkPageShellResponse(await dependencies.readShell())
  } catch (error) {
    return bulkInitialPageErrorResponse(error)
  }
}

export type BulkInitialStoreDependencies = Readonly<{
  openSession(): string
  cancelSession(session: string): void
  prepareInitial(session: string): Promise<BulkStoreInitial>
}>

/** Opens one coherent snapshot-to-WebSocket handoff and returns its Bulk Store. */
export const serveBulkInitialStore = async (
  dependencies: BulkInitialStoreDependencies,
): Promise<Response> => {
  const session = dependencies.openSession()
  try {
    return bulkInitialStoreResponse(await dependencies.prepareInitial(session))
  } catch (error) {
    dependencies.cancelSession(session)
    return bulkInitialPageErrorResponse(error)
  }
}

/** Validates the one Bulk Store value decoded from the dedicated initial response. */
export const parseBulkInitialValue = (value: unknown): BulkStoreInitial => {
  if (!isBulkStoreInitial(value)) {
    throw new Error("Bulk initial response is not one validated Bulk Store")
  }
  return value
}

/** Reads the dedicated initial response without creating a second record model. */
export const readBulkInitialResponse = async (
  response: Response,
): Promise<BulkStoreInitial> => {
  if (!response.ok) {
    let detail = ""
    try {
      const value = await response.json() as {error?: unknown}
      if (typeof value.error === "string") detail = `: ${value.error}`
    } catch {
      // The status remains the authoritative failure when the body is malformed.
    }
    throw new Error(`Bulk initial request failed with ${response.status}${detail}`)
  }
  return parseBulkInitialValue(await response.json() as unknown)
}
