import {
  isBulkInitialScene,
  type BulkInitialScene,
} from "./visual-initial.ts"

export const BULK_INITIAL_ELEMENT_ID = "bulk-initial"
export const BULK_INITIAL_JSON_MARKER = "__METAFOR_BULK_INITIAL_JSON__"
export const BULK_PAGE_SHELL_ROUTE = "/__metafor/bulk-page-shell"

const HTML_HAZARDS = /[<>&\u2028\u2029]/g
const HTML_HAZARD_ESCAPE: Readonly<Record<string, string>> = Object.freeze({
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
})

/** Serializes JSON without leaving tokens that can escape an inert script element. */
export const serializeBulkInitialJson = (value: unknown): string =>
  JSON.stringify(value).replace(
    HTML_HAZARDS,
    (character) => HTML_HAZARD_ESCAPE[character]!,
  )

const markerCount = (html: string): number =>
  html.split(BULK_INITIAL_JSON_MARKER).length - 1

/** Replaces the one inert placeholder in Bun's bundled HTML shell. */
export const embedBulkInitialScene = (
  html: string,
  initial: BulkInitialScene,
): string => {
  const count = markerCount(html)
  if (count !== 1) {
    throw new Error(
      `Bulk page shell must contain exactly one initial JSON marker; received ${count}`,
    )
  }
  return html.replace(
    BULK_INITIAL_JSON_MARKER,
    serializeBulkInitialJson(initial),
  )
}

const PAGE_HEADERS = Object.freeze({
  "cache-control": "private, no-store, max-age=0",
  "content-type": "text/html; charset=utf-8",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
})

const ERROR_HEADERS = Object.freeze({
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
})

export const bulkInitialPageResponse = (
  html: string,
  initial: BulkInitialScene,
): Response => new Response(embedBulkInitialScene(html, initial), {
  headers: PAGE_HEADERS,
})

export const bulkInitialPageErrorResponse = (error: unknown): Response =>
  Response.json({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, {
    status: 503,
    headers: ERROR_HEADERS,
  })

export type BulkInitialPageDependencies = Readonly<{
  openSession(): string
  cancelSession(session: string): void
  prepareInitial(session: string): Promise<BulkInitialScene>
  readShell(): Promise<string>
}>

/** Builds one personalized page response; preparation is invoked for every call. */
export const serveBulkInitialPage = async (
  dependencies: BulkInitialPageDependencies,
): Promise<Response> => {
  const session = dependencies.openSession()
  try {
    const [initial, html] = await Promise.all([
      dependencies.prepareInitial(session),
      dependencies.readShell(),
    ])
    return bulkInitialPageResponse(html, initial)
  } catch (error) {
    dependencies.cancelSession(session)
    return bulkInitialPageErrorResponse(error)
  }
}

/** Parses and validates the non-executing JSON embedded by the page GET. */
export const parseBulkInitialJson = (text: string | null): BulkInitialScene => {
  if (text === null || text.trim() === "") {
    throw new Error("Bulk page has no embedded initial package")
  }
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new Error("Bulk embedded initial package is not valid JSON")
  }
  if (!isBulkInitialScene(value)) {
    throw new Error("Bulk embedded initial package is not one complete validated Graph scene")
  }
  return value
}
