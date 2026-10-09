import type {BrowserPackageEnvironment} from "@metafor/tech-build/identity"
import {browserPackageArtifactUrl, parseBrowserPackageArtifactUrl, type BrowserPackageArtifactUrl} from "@metafor/tech-build/identity"
import {rootPackageArtifact, type PackageArtifactKey} from "@metafor/tech-build/identity"

const sourceMapSuffix = "&source-map"

/** Формирует canonical URL внешней source map без отдельного package slot. */
export function browserPackageSourceMapUrl(
  name: string,
  env: BrowserPackageEnvironment,
  version?: string,
  artifact: PackageArtifactKey = rootPackageArtifact,
) {
  const url = browserPackageArtifactUrl(name, env, artifact, version)
  return `${url}${url.includes("?") ? "&" : "?"}source-map`
}

/** Строго разбирает source map URL после canonical package parameters. */
export function parseBrowserPackageSourceMapUrl(url: URL): BrowserPackageArtifactUrl | null {
  const source = `${url.pathname}${url.search}`
  const suffix = url.search === "?source-map" ? "?source-map" : sourceMapSuffix
  if (!source.endsWith(suffix)) return null

  const packageUrl = new URL(url)
  packageUrl.search = url.search.slice(0, -suffix.length)
  const artifact = parseBrowserPackageArtifactUrl(packageUrl)
  if (artifact === null) return null

  const canonical = browserPackageSourceMapUrl(
    artifact.name,
    artifact.env,
    artifact.version ?? undefined,
    artifact.artifact,
  )
  return source === canonical ? artifact : null
}
