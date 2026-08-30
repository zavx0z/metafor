import {
  packageIdentityHeaders,
  verifyPackageResponse,
  type BrowserPackageIdentity,
} from "../../shared/package/integrity"
import {
  packageArtifactWireValue,
  readPackageArtifactKey,
  type NonRootPackageArtifactKey,
} from "./artifact"

/** Reader-first identity: root omits `artifact`, every non-root key is exact. */
export interface BrowserPackageArtifactIdentity extends BrowserPackageIdentity {
  artifact?: NonRootPackageArtifactKey
}

/** Adds one non-root header without changing historical root response headers. */
export function packageArtifactIdentityHeaders(identity: BrowserPackageArtifactIdentity) {
  const artifact = readPackageArtifactKey(identity.artifact)
  if (artifact === null) throw new Error(`Некорректный artifact package: ${identity.name}`)
  return {
    ...packageIdentityHeaders(identity),
    ...(artifact === "." ? {} : {"X-Package-Artifact": artifact}),
  }
}

/** Verifies the root response as before and additionally binds one non-root key. */
export async function verifyPackageArtifactResponse(
  response: Response,
  expected: BrowserPackageArtifactIdentity,
) {
  const artifact = readPackageArtifactKey(expected.artifact)
  if (artifact === null) throw new Error(`Некорректный artifact package: ${expected.name}`)
  const responseArtifact = response.headers.get("X-Package-Artifact") ?? undefined
  if (responseArtifact !== packageArtifactWireValue(artifact))
    throw new Error(`Ответ принадлежит другому artifact: ${expected.name}`)
  return await verifyPackageResponse(response, expected)
}
