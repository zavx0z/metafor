import type {BrowserPackageArtifactIdentity} from "@metafor/tech-build/identity"
import type {ReleaseRemoval} from "../server/index.ts"

/** Независимые примеры identities; файлы и работающий release не используются. */
export const visual: BrowserPackageArtifactIdentity = {
  name: "@internal/visual",
  env: "main",
  version: "1.2.3",
  sha256: "a".repeat(64),
  size: 42,
}

export const previousVisual: BrowserPackageArtifactIdentity = {...visual, version: "1.2.2"}
export const visualRemoval: ReleaseRemoval = {name: "@internal/visual", env: "main", version: "1.2.3"}
export const previousRemoval: ReleaseRemoval = {...visualRemoval, version: "1.2.2"}

export const service: BrowserPackageArtifactIdentity = {
  name: "@cosmos/release",
  env: "service",
  version: "2.0.0",
  sha256: "b".repeat(64),
  size: 84,
}

export const worker: BrowserPackageArtifactIdentity = {
  name: "@metafor/example",
  env: "worker",
  version: "1.0.0",
  sha256: "e".repeat(64),
  size: 210,
}

export const theme: BrowserPackageArtifactIdentity = {
  ...visual,
  artifact: "./theme.css",
  sha256: "c".repeat(64),
  size: 126,
}

export const lazy: BrowserPackageArtifactIdentity = {
  ...visual,
  artifact: "./.cosmos/main/components/inspector.js",
  sha256: "d".repeat(64),
  size: 168,
}

export const previousLazy: BrowserPackageArtifactIdentity = {...lazy, version: "1.2.2"}
export const previousLazyRemoval: ReleaseRemoval = {
  ...previousRemoval,
  artifact: "./.cosmos/main/components/inspector.js",
}
