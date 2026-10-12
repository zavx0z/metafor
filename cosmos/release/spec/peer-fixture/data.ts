import {createHash} from "node:crypto"
import {publishedReleaseGraphDigest, type InstalledArtifactIdentity, type PublishedReleaseGraph} from "@metafor/tech-release/installed"

export const artifactBytes = Buffer.alloc(128 * 1024 + 37)
for (let index = 0; index < artifactBytes.length; index += 1) artifactBytes[index] = index % 251
export const artifactIdentity: InstalledArtifactIdentity = {
  name: "@fixture/release",
  version: "1.0.0",
  env: "server",
  artifact: ".",
  sha256: createHash("sha256").update(artifactBytes).digest("hex"),
  size: artifactBytes.byteLength,
}
export const releaseGraph: PublishedReleaseGraph = {
  schemaVersion: 1,
  packages: [{
    name: artifactIdentity.name,
    version: artifactIdentity.version,
    dependencies: {},
    environments: [{
      env: "server",
      publicArtifacts: {},
      outputs: [{
        artifact: ".",
        kind: "entry-point",
        type: "text/javascript",
        sha256: artifactIdentity.sha256,
        size: artifactIdentity.size,
      }],
    }],
  }],
}
export const releaseDigest = publishedReleaseGraphDigest(releaseGraph)
