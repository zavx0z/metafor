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

/** Выносит Bun inline map из package-owned outfile в отдельный companion. */
export async function externalizeSourceMap(artifact: string) {
  const source = await Bun.file(artifact).text()
  const marker = "//# sourceMappingURL=data:application/json;base64,"
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1) throw new Error(`Inline source map is missing: ${artifact}`)

  const encoded = source.slice(markerIndex + marker.length).trim()
  const sourceMap = Buffer.from(encoded, "base64")
  const parsed = JSON.parse(sourceMap.toString("utf8")) as {version?: unknown}
  if (parsed.version !== 3) throw new Error(`Source map has unsupported version: ${artifact}`)

  await Promise.all([
    Bun.write(artifact, `${source.slice(0, markerIndex).trimEnd()}\n`),
    Bun.write(sourceMapArtifact(artifact), sourceMap),
  ])
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
