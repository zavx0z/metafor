import {packageArtifact} from "@metafor/tech-build"
import {
  browserPackageEnvironments,
  rootPackageArtifact,
  type BrowserPackageEnvironment,
} from "@metafor/tech-build/identity"
import type {ReleasedPackage} from "./contracts"
import {resolveVersionedPackageArtifactPath} from "./artifact-path"
import type {createReleaseComposition} from "./composition"
import type {createPublicationQueue} from "./queue"
export function createReleaseState(
  composition: ReturnType<typeof createReleaseComposition>,
  queue: ReturnType<typeof createPublicationQueue>,
) {
  const {readReleaseComposition} = composition
  const {waitForPublication} = queue
  async function releasedPackages(): Promise<ReleasedPackage[]> {
    await waitForPublication()
    return await readReleasedPackages()
  }

  async function readReleasedPackages(): Promise<ReleasedPackage[]> {
    const composition = await readReleaseComposition()
    const packages: ReleasedPackage[] = []

    for (const {name, version, owners} of composition) {
      const environments = owners.filter(({env}) =>
        browserPackageEnvironments.some((browserEnv) => browserEnv === env),
      )
      for (const environmentOwner of environments) {
        const {env} = environmentOwner
        const browserEnv = env as BrowserPackageEnvironment
        const path = await resolveVersionedPackageArtifactPath(
          environmentOwner,
          version,
          rootPackageArtifact,
        )
        if (path === null)
          throw new Error(`Released artifact ${name}:${browserEnv}@${version} is missing`)
        const artifact = await packageArtifact(path)
        if (!artifact)
          throw new Error(`Released artifact ${name}:${browserEnv}@${version} is missing`)
        packages.push({
          name,
          env: browserEnv,
          version,
          sha256: artifact.sha256,
          size: artifact.size,
        })
      }
    }

    return packages
  }
  return {releasedPackages, readReleasedPackages}
}
