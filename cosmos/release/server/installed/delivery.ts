import {
  isBrowserPackageEnvironment,
  packageArtifactIdentityHeaders,
  parseBrowserPackageArtifactUrl,
  type BrowserPackageArtifactIdentity,
  type BrowserPackageEnvironment,
  type BrowserPackageIdentity,
  type PackageArtifactKey,
} from "@metafor/tech-build/identity"
import type {
  createInstalledReleaseStore,
  InstalledArtifactIdentity,
  InstalledReleaseCandidate,
  PublishedReleaseOutput,
} from "@metafor/tech-release/installed"
import {artifactResponse} from "../http/artifact"
import {packageHeaders} from "../http/headers"
import {browserPackageSourceMapUrl, parseBrowserPackageSourceMapUrl} from "../http/source-map"

export interface InstalledReleaseDeliveryOptions {
  readonly store: Pick<ReturnType<typeof createInstalledReleaseStore>, "verifyCandidate" | "listCandidates" | "artifactPath">
  readonly digest: string
}

/**
Подключает установленный [готовый состав](../../README.md) к действующему
browser HTTP contract без source manifests, builder или изменения browser.
Stable URLs относятся только к выбранному составу; exact URLs продолжают
обслуживаться из сохранённых ready candidates. Root/eager identities образуют
desired projection, lazy outputs и maps остаются доступными по запросу.
Повреждение storage отклоняет операцию без fallback к исходникам.
Проверки: `cosmos/tests/installed-delivery.spec.ts`.
*/
export async function createInstalledReleaseDelivery(options: InstalledReleaseDeliveryOptions) {
  const selected = await options.store.verifyCandidate(options.digest)
  const retained = await options.store.listCandidates()
  const graph = selected.graph

  function browserArtifacts(): BrowserPackageArtifactIdentity[] {
    return graph.packages.flatMap(member => member.environments.flatMap(part => {
      if (!isBrowserPackageEnvironment(part.env)) return []
      const env = part.env
      return part.outputs.flatMap(output => output.kind === "sourcemap" || (output.artifact !== "." && output.load !== "eager")
        ? []
        : [browserIdentity(member.name, member.version, env, output)])
    }))
  }

  /** Startup доставляется отдельно и не участвует в смене release composition. */
  function desiredBrowserArtifacts(): BrowserPackageArtifactIdentity[] {
    return browserArtifacts().filter(identity => identity.name !== "@cosmos/startup")
  }

  function releasedBrowserRoots(): BrowserPackageIdentity[] {
    return browserArtifacts().filter(identity => identity.artifact === undefined)
  }

  async function fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response(null, {status: 405, headers: {Allow: "GET"}})
    const url = new URL(request.url)
    if (url.pathname === "/code") {
      return url.search === ""
        ? Response.json({packages: releasedBrowserRoots()}, {headers: {"Cache-Control": "no-cache"}})
        : new Response(null, {status: 404})
    }
    const mapRequest = parseBrowserPackageSourceMapUrl(url)
    const artifactRequest = mapRequest === null ? parseBrowserPackageArtifactUrl(url) : null
    const requested = mapRequest ?? artifactRequest
    if (!requested) return new Response(null, {status: 404})
    const artifact = requested.artifact ?? "."
    const candidates = requested.version === null ? [selected] : [selected, ...retained.filter(candidate => candidate.digest !== selected.digest)]
    for (const candidate of candidates) {
      const target = findOutput(candidate, requested.name, requested.env, requested.version, artifact, mapRequest !== null)
      if (!target) continue
      const {output, identity} = target
      const path = await options.store.artifactPath(candidate.digest, identity)
      const isMap = output.kind === "sourcemap"
      const headers = new Headers({
        "Cache-Control": "no-cache",
        "Content-Type": output.type,
        ...(isMap ? {} : packageArtifactIdentityHeaders(browserIdentity(identity.name, identity.version, requested.env, output))),
        ...(isMap ? {} : packageHeaders(requested.env)),
      })
      if (!isMap && target.maps.some(map => map.sourceMapFor === output.artifact))
        headers.set("SourceMap", browserPackageSourceMapUrl(identity.name, requested.env, identity.version, output.artifact))
      return await artifactResponse(request, {...identity, path, type: output.type}, headers)
    }
    return new Response(null, {status: 404})
  }

  return Object.freeze({graph, desiredBrowserArtifacts, releasedBrowserRoots, fetch})
}

function browserIdentity(name: string, version: string, env: BrowserPackageEnvironment, output: PublishedReleaseOutput): BrowserPackageArtifactIdentity {
  return {
    name, version, env,
    ...(output.artifact === "." ? {} : {artifact: output.artifact}),
    sha256: output.sha256,
    size: output.size,
  }
}

function findOutput(
  candidate: InstalledReleaseCandidate,
  name: string,
  env: BrowserPackageEnvironment,
  version: string | null,
  artifact: PackageArtifactKey,
  map: boolean,
) {
  const member = candidate.graph.packages.find(member => member.name === name && (version === null || member.version === version))
  const part = member?.environments.find(part => part.env === env)
  if (!member || !part) return null
  const output = part.outputs.find(output => map ? output.kind === "sourcemap" && output.sourceMapFor === artifact : output.artifact === artifact)
  if (!output) return null
  const identity: InstalledArtifactIdentity = {name, version: member.version, env, artifact: output.artifact, sha256: output.sha256, size: output.size}
  return {output, identity, maps: part.outputs.filter(output => output.kind === "sourcemap")}
}
