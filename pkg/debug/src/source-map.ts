import {SourceMapConsumer} from "source-map-js"

export type SourceLocation = {
  line: number
  column: number
}

export type SourceMapLookup = SourceLocation & {
  verified: boolean
  source?: string
  message?: string
}

export type SourceMapContent = {
  source: string
  content: string
}

export interface SourceMapMapper {
  generatedLocation(request: SourceLocation & {url?: string}): SourceMapLookup
  originalLocation(request: SourceLocation): SourceMapLookup
  sourceContent(url?: string): SourceMapContent | null
  sources(): string[]
}

class ActualSourceMapMapper implements SourceMapMapper {
  #consumer: SourceMapConsumer
  #sources: readonly string[]

  constructor(consumer: SourceMapConsumer) {
    this.#consumer = consumer
    this.#sources = consumer.sources
  }

  generatedLocation(request: SourceLocation & {url?: string}): SourceMapLookup {
    const source = this.#sourceForUrl(request.url)
    if (source.length === 0) return fallback(request)

    try {
      const mapped = this.#consumer.generatedPositionFor({
        source,
        line: toOneBasedLine(request.line),
        column: toColumn(request.column),
      })
      if (!validOneBased(mapped.line) || !validColumn(mapped.column)) return fallback(request)
      const out: SourceMapLookup = {
        line: mapped.line - 1,
        column: mapped.column,
        verified: true,
      }
      return out
    } catch (error) {
      return fallback(request, serializeUnknown(error))
    }
  }

  sourceContent(url?: string): SourceMapContent | null {
    const source = this.#sourceForUrl(url)
    if (source.length === 0) return null
    const content = this.#consumer.sourceContentFor(source, true)
    if (typeof content !== "string") return null
    return {source, content}
  }

  sources(): string[] {
    return [...this.#sources]
  }

  originalLocation(request: SourceLocation): SourceMapLookup {
    try {
      const mapped = this.#consumer.originalPositionFor({
        line: toOneBasedLine(request.line),
        column: toColumn(request.column),
      })
      if (!validOneBased(mapped.line) || !validColumn(mapped.column)) return fallback(request)
      const out: SourceMapLookup = {
        line: mapped.line - 1,
        column: mapped.column,
        verified: true,
      }
      if (typeof mapped.source === "string" && mapped.source.length > 0) out.source = mapped.source
      return out
    } catch (error) {
      return fallback(request, serializeUnknown(error))
    }
  }

  #sourceForUrl(url: string | undefined): string {
    if (this.#sources.length === 0) return ""
    if (this.#sources.length === 1) return this.#sources[0] ?? ""
    if (url === undefined || url.length === 0) return this.#sources[0] ?? ""

    const normalizedUrl = normalizeSourcePath(url)
    for (const source of this.#sources) {
      if (normalizeSourcePath(source) === normalizedUrl) return source
    }
    for (const source of this.#sources) {
      if (normalizedUrl.endsWith(normalizeSourcePath(source))) return source
    }
    return ""
  }
}

class NoopSourceMapMapper implements SourceMapMapper {
  generatedLocation(request: SourceLocation): SourceMapLookup {
    return {...request, verified: true}
  }

  originalLocation(request: SourceLocation): SourceMapLookup {
    return {...request, verified: true}
  }

  sourceContent(): SourceMapContent | null {
    return null
  }

  sources(): string[] {
    return []
  }
}

const noop = new NoopSourceMapMapper()

export function sourceMapMapper(sourceMapURL: string | undefined): SourceMapMapper {
  if (sourceMapURL === undefined || sourceMapURL.length === 0) return noop

  const dataUrl = extractDataUrl(sourceMapURL)
  if (dataUrl === undefined) return noop

  try {
    const comma = dataUrl.indexOf(",")
    if (comma < 0) return noop
    const encoded = dataUrl.slice(comma + 1)
    const decoded = Buffer.from(encoded, "base64url").toString("utf8")
    const schema = JSON.parse(decoded)
    return new ActualSourceMapMapper(new SourceMapConsumer(schema))
  } catch {
    return noop
  }
}

function extractDataUrl(value: string): string | undefined {
  if (value.startsWith("data:")) return value
  const match = value.match(/\/\/[#@]\s*sourceMappingURL=(.*)$/m)
  return match?.[1]
}

function fallback(location: SourceLocation, message?: string): SourceMapLookup {
  const out: SourceMapLookup = {
    line: toLine(location.line),
    column: toColumn(location.column),
    verified: false,
  }
  if (message !== undefined) out.message = message
  return out
}

function toOneBasedLine(value: number): number {
  return validZeroBased(value) ? value + 1 : 1
}

function toLine(value: number): number {
  return validZeroBased(value) ? value : 0
}

function toColumn(value: number): number {
  return validZeroBased(value) ? value : 0
}

function validZeroBased(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function validOneBased(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
}

function validColumn(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function normalizeSourcePath(value: string): string {
  return value.replaceAll("\\", "/")
}

function serializeUnknown(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
