import {packageHeaders} from "./headers"
import type {BrowserPackageEnvironment} from "@metafor/tech-build/identity"
import {packageArtifact, sourceMapArtifact, type BuildablePackage} from "@metafor/tech-build"
import {builder} from "../services"
const {packageOwner} = builder
import {artifactResponse} from "./artifact"
import {browserPackageSourceMapUrl} from "./source-map"

/** Возвращает env artifact, без запуска сборки при отсутствии файла. */
export async function packageResponse(
  name: BuildablePackage,
  env?: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  const artifact = await packageArtifact(owner.artifact)
  if (!artifact) return new Response(null, {status: 404})

  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
    "X-Package-Env": owner.env,
    "X-Package-SHA256": artifact.sha256,
    "X-Package-Size": String(artifact.size),
  })
  const sourceMap = await packageArtifact(sourceMapArtifact(artifact.path))
  if (sourceMap) headers.set(
    "SourceMap",
    browserPackageSourceMapUrl(name, owner.env as BrowserPackageEnvironment),
  )
  for (const [header, value] of Object.entries(packageHeaders(owner.env as BrowserPackageEnvironment))) headers.set(header, value)
  return await artifactResponse(request, artifact, headers)
}

/** Возвращает внешнюю development source map initial package. */
export async function packageSourceMapResponse(
  name: BuildablePackage,
  env: BrowserPackageEnvironment,
  request?: Request,
) {
  const owner = await packageOwner(name, env)
  const artifact = await packageArtifact(sourceMapArtifact(owner.artifact))
  if (!artifact) return new Response(null, {status: 404})
  return await artifactResponse(request, artifact, new Headers({
    "Cache-Control": "no-cache",
    "Content-Type": artifact.type,
  }))
}
