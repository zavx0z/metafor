import type {BrowserPackageEnvironment} from "../../../shared/package/environment"
import {
  browserPackageUrl,
  parseBrowserPackageUrl,
  type BrowserPackageUrl,
} from "../../../shared/package/url"

const sourceMapSuffix = "&source-map"

/** Возвращает development source map рядом с package artifact. */
export function sourceMapArtifact(artifact: string) {
  return `${artifact}.map`
}

/** Удаляет несемантический случайный Bun debug identity из executable bytes. */
export function canonicalExecutableSource(source: string) {
  const executable = source.trimEnd()
    .replace(/(?:^|\n)\/\/# debugId=[0-9A-Fa-f]+\s*$/, "")
    .trimEnd()
  return `${executable}\n`
}

/** Выносит Bun inline map из package-owned outfile в отдельный companion. */
export async function externalizeSourceMap(artifact: string) {
  const source = await Bun.file(artifact).text()
  const marker = "//# sourceMappingURL=data:application/json;base64,"
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1) throw new Error(`Inline source map is missing: ${artifact}`)

  const encoded = source.slice(markerIndex + marker.length).trim()
  const sourceMap = Buffer.from(encoded, "base64")
  const parsed = JSON.parse(sourceMap.toString("utf8")) as Record<string, unknown>
  if (parsed.version !== 3) throw new Error(`Source map has unsupported version: ${artifact}`)
  delete parsed.debugId

  const canonicalSourceMap = Buffer.from(JSON.stringify(parsed))

  await Promise.all([
    Bun.write(artifact, canonicalExecutableSource(source.slice(0, markerIndex))),
    Bun.write(sourceMapArtifact(artifact), canonicalSourceMap),
  ])
}

/** Keeps an inline development map while removing Bun's random debug identity. */
export async function canonicalizeInlineSourceMap(artifact: string) {
  const source = await Bun.file(artifact).text()
  const marker = "//# sourceMappingURL=data:application/json;base64,"
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1) throw new Error(`Inline source map is missing: ${artifact}`)
  const encoded = source.slice(markerIndex + marker.length).split(/\r?\n/, 1)[0]?.trim()
  if (!encoded) throw new Error(`Inline source map payload is missing: ${artifact}`)
  const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<string, unknown>
  if (parsed.version !== 3) throw new Error(`Source map has unsupported version: ${artifact}`)
  delete parsed.debugId
  const canonicalMap = Buffer.from(JSON.stringify(parsed)).toString("base64")
  const executable = canonicalExecutableSource(source.slice(0, markerIndex)).trimEnd()
  await Bun.write(artifact, `${executable}\n${marker}${canonicalMap}\n`)
}

/** Формирует canonical URL внешней source map без отдельного package slot. */
export function browserPackageSourceMapUrl(
  name: string,
  env: BrowserPackageEnvironment,
  version?: string,
) {
  return `${browserPackageUrl(name, env, version)}${sourceMapSuffix}`
}

/** Строго разбирает source map URL после canonical package parameters. */
export function parseBrowserPackageSourceMapUrl(url: URL): BrowserPackageUrl | null {
  const source = `${url.pathname}${url.search}`
  if (!source.endsWith(sourceMapSuffix)) return null

  const packageUrl = new URL(url)
  packageUrl.search = url.search.slice(0, -sourceMapSuffix.length)
  const artifact = parseBrowserPackageUrl(packageUrl)
  if (artifact === null) return null

  const canonical = browserPackageSourceMapUrl(
    artifact.name,
    artifact.env,
    artifact.version ?? undefined,
  )
  return source === canonical ? artifact : null
}
