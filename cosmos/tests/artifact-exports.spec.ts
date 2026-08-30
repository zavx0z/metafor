import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  isPackageArtifactKey,
  isPackageExportSubpath,
  readPackageArtifactKey,
} from "../release/shared/artifact"
import {
  artifactIntegrity,
} from "../shared/package/integrity"
import {
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../shared/package/url"
import {
  packageArtifactIdentityHeaders,
  verifyPackageArtifactResponse,
  type BrowserPackageArtifactIdentity,
} from "../release/shared/artifact-integrity"
import {
  browserPackageArtifactSlot,
  browserPackageArtifactUrl,
  browserPackageGeneratedPublicPath,
  browserPackageIdentityUrl,
  parseBrowserPackageArtifactUrl,
} from "../release/shared/artifact-url"
import {
  parseReleaseCurrentMessage,
  parseReleaseDeltaMessage,
} from "../release/shared/protocol"
import {packageExportGraph} from "../release/server/package/export-graph"

const origin = "https://example.test"
const sha256 = "a".repeat(64)

test("root identity remains omitted while public artifact keys stay canonical", () => {
  expect(readPackageArtifactKey(undefined)).toBe(".")
  expect(readPackageArtifactKey(".")).toBeNull()
  expect(readPackageArtifactKey("./theme.css")).toBe("./theme.css")
  expect(isPackageArtifactKey(".")).toBeTrue()
  expect(isPackageExportSubpath("./components/button")).toBeTrue()
  expect(isPackageExportSubpath("./.cosmos/chunks/a.js")).toBeFalse()
  expect(isPackageArtifactKey("./.cosmos/chunks/a.js")).toBeTrue()

  for (const value of [
    "./node_modules/private.js",
    "./../private.js",
    "./icons//add.svg",
    "./icons/%2e%2e/add.svg",
    "./icons/add.svg?raw",
  ]) expect(isPackageExportSubpath(value)).toBeFalse()
})

test("artifact URLs preserve old root bytes and add one canonical public path", () => {
  const stableRoot = browserPackageUrl("@internal/visual", "main")
  const exactRoot = browserPackageUrl("@internal/visual", "main", "0.1.18")
  expect(stableRoot).toBe("/@internal/visual?env=main")
  expect(exactRoot).toBe("/@internal/visual?env=main&version=0.1.18")
  expect(browserPackageArtifactUrl("@internal/visual", "main", ".", "0.1.18")).toBe(exactRoot)
  expect(parseBrowserPackageUrl(new URL(exactRoot, origin))).toEqual({
    name: "@internal/visual",
    env: "main",
    version: "0.1.18",
  })
  expect(parseBrowserPackageArtifactUrl(new URL(exactRoot, origin))).toEqual({
    name: "@internal/visual",
    env: "main",
    version: "0.1.18",
  })

  const theme = browserPackageArtifactUrl(
    "@internal/visual",
    "main",
    "./theme.css",
    "0.1.18",
  )
  expect(theme).toBe("/@internal/visual/theme.css?env=main&version=0.1.18")
  expect(parseBrowserPackageUrl(new URL(theme, origin))).toBeNull()
  expect(parseBrowserPackageArtifactUrl(new URL(theme, origin))).toEqual({
    name: "@internal/visual",
    env: "main",
    artifact: "./theme.css",
    version: "0.1.18",
  })
  expect(browserPackageArtifactSlot("@internal/visual", "main", "./theme.css"))
    .toBe("/@internal/visual/theme.css?env=main")

  const publicPath = browserPackageGeneratedPublicPath("@internal/visual", "main", "0.1.18")
  expect(publicPath).toBe("/@internal/visual/.cosmos/main/0.1.18/")
  const chunk = browserPackageArtifactUrl(
    "@internal/visual",
    "main",
    "./.cosmos/chunks/chunk-a1b2.js",
    "0.1.18",
  )
  expect(chunk).toBe("/@internal/visual/.cosmos/main/0.1.18/chunks/chunk-a1b2.js")
  expect(parseBrowserPackageUrl(new URL(chunk, origin))).toBeNull()
  expect(parseBrowserPackageArtifactUrl(new URL(chunk, origin))).toEqual({
    name: "@internal/visual",
    env: "main",
    artifact: "./.cosmos/chunks/chunk-a1b2.js",
    version: "0.1.18",
  })
  expect(() => browserPackageArtifactUrl(
    "@internal/visual",
    "main",
    "./.cosmos/chunks/chunk-a1b2.js",
  )).toThrow("requires an exact version")
  expect(() => browserPackageArtifactSlot(
    "@internal/visual",
    "main",
    "./.cosmos/chunks/chunk-a1b2.js",
  )).toThrow("no stable URL")

  for (const invalid of [
    "/@internal/visual/theme.css?version=0.1.18&env=main",
    "/@internal/visual/theme.css/?env=main&version=0.1.18",
    "/@internal/visual/.cosmos/chunk.js?env=main&version=0.1.18",
    "/@internal/visual/theme%2Ecss?env=main&version=0.1.18",
    "/@internal/visual/.cosmos/main/0.1.18/chunks/%2Froot.js",
    "/@internal/visual/.cosmos/main/0.1.18/chunks/chunk.js?env=main",
    "/@internal/visual/.cosmos/Main/0.1.18/chunks/chunk.js",
    "/@internal/visual/.cosmos/main/01.1.18/chunks/chunk.js",
  ]) expect(parseBrowserPackageArtifactUrl(new URL(invalid, origin))).toBeNull()
})

test("identity headers are reader-first for root and exact for non-root", async () => {
  const root = await identity(undefined, "root")
  const rootHeaders = packageArtifactIdentityHeaders(root)
  expect(rootHeaders).not.toHaveProperty("X-Package-Artifact")
  await expect(verifyPackageArtifactResponse(new Response("root", {headers: rootHeaders}), root))
    .resolves.toBeInstanceOf(Response)

  const theme = await identity("./theme.css", "theme")
  const themeHeaders = packageArtifactIdentityHeaders(theme)
  expect(themeHeaders["X-Package-Artifact"]).toBe("./theme.css")
  await expect(verifyPackageArtifactResponse(new Response("theme", {headers: themeHeaders}), theme))
    .resolves.toBeInstanceOf(Response)
  await expect(verifyPackageArtifactResponse(new Response("theme", {
    headers: {...themeHeaders, "X-Package-Artifact": "./other.css"},
  }), theme)).rejects.toThrow("другому artifact")
})

test("wire readers accept omitted root and exact non-root without a protocol version", () => {
  const root = wireIdentity(undefined)
  const theme = wireIdentity("./theme.css")
  const chunk = wireIdentity("./.cosmos/chunks/chunk-a1b2.js")
  expect(parseReleaseCurrentMessage({
    type: "release-current",
    current: [root, theme, chunk],
  })).toEqual({type: "release-current", current: [root, theme, chunk]})
  expect(parseReleaseCurrentMessage({
    type: "release-current",
    current: [{...root, artifact: "."}],
  })).toBeNull()
  expect(parseReleaseCurrentMessage({
    type: "release-current",
    current: [theme, {...theme}],
  })).toBeNull()

  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [theme],
    remove: [{name: theme.name, env: theme.env, artifact: "./old.css", version: "0.1.17"}],
  })).toEqual({
    type: "release-delta",
    update: [theme],
    remove: [{name: theme.name, env: theme.env, artifact: "./old.css", version: "0.1.17"}],
  })
  expect(parseReleaseDeltaMessage({
    type: "release-delta",
    update: [theme],
    remove: [{name: theme.name, env: theme.env, artifact: theme.artifact, version: theme.version}],
  })).toBeNull()
  expect(browserPackageIdentityUrl(theme)).toBe(
    "/@internal/visual/theme.css?env=main&version=0.1.18",
  )
  expect(browserPackageIdentityUrl(chunk)).toBe(
    "/@internal/visual/.cosmos/main/0.1.18/chunks/chunk-a1b2.js",
  )
})

test("export graph expands env conditions and conditionless shared exports deterministically", async () => {
  await withPackage(async (root) => {
    await Promise.all([
      write(root, "main/index.ts", "export const environment = 'main'\n"),
      write(root, "server/index.ts", "export const environment = 'server'\n"),
      write(root, "main/widget.tsx", "export const Widget = () => null\n"),
      write(root, "shared.tsx", "export const shared = true\n"),
      write(root, "theme.css", ":root { --space: 4px; }\n"),
      write(root, "kernel.wasm", "wasm"),
      write(root, "icons/add.svg", "<svg/>"),
      write(root, "icons/nested/remove.svg", "<svg/>"),
      write(root, "icons/private/secret.svg", "<svg/>"),
    ])

    const graph = await packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {
          "internal:main": "./main/index.ts",
          "internal:server": "./server/index.ts",
        },
        "./widget": {"internal:main": "./main/widget.tsx"},
        "./shared": "./shared.tsx",
        "./theme.css": "./theme.css",
        "./kernel.wasm": "./kernel.wasm",
        "./icons/*.svg": "./icons/*.svg",
        "./icons/private/*": null,
      },
    })

    expect(graph.map(({artifact, env, condition, source}) => ({artifact, env, condition, source}))).toEqual([
      {artifact: ".", env: "main", condition: "internal:main", source: "./main/index.ts"},
      {artifact: ".", env: "server", condition: "internal:server", source: "./server/index.ts"},
      {artifact: "./icons/add.svg", env: "main", condition: null, source: "./icons/add.svg"},
      {artifact: "./icons/add.svg", env: "server", condition: null, source: "./icons/add.svg"},
      {
        artifact: "./icons/nested/remove.svg",
        env: "main",
        condition: null,
        source: "./icons/nested/remove.svg",
      },
      {
        artifact: "./icons/nested/remove.svg",
        env: "server",
        condition: null,
        source: "./icons/nested/remove.svg",
      },
      {artifact: "./kernel.wasm", env: "main", condition: null, source: "./kernel.wasm"},
      {artifact: "./kernel.wasm", env: "server", condition: null, source: "./kernel.wasm"},
      {artifact: "./shared", env: "main", condition: null, source: "./shared.tsx"},
      {artifact: "./shared", env: "server", condition: null, source: "./shared.tsx"},
      {artifact: "./theme.css", env: "main", condition: null, source: "./theme.css"},
      {artifact: "./theme.css", env: "server", condition: null, source: "./theme.css"},
      {artifact: "./widget", env: "main", condition: "internal:main", source: "./main/widget.tsx"},
    ])
  })
})

test("export graph fails closed for root environment, traversal, symlinks and collisions", async () => {
  await withPackage(async (root) => {
    await Promise.all([
      write(root, "main/index.ts", "export {}\n"),
      write(root, "shared.tsx", "export {}\n"),
      write(root, "assets/add.svg", "<svg/>"),
    ])

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": "./main/index.ts",
      },
    })).rejects.toThrow("Root package export must declare exact environments")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/*.ts"},
      },
    })).rejects.toThrow("must target one exact source")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        "./shared": {"internal:main": "./shared.tsx"},
      },
    })).rejects.toThrow('must define root subpath "."')

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./shared": {"internal:server": "./shared.tsx"},
      },
    })).rejects.toThrow("uses undeclared environment server")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./alias": {"internal:main": "./main/index.ts"},
      },
    })).rejects.toThrow("has multiple artifact identities")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./.cosmos/private.css": "./assets/add.svg",
      },
    })).rejects.toThrow("Invalid package export subpath")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./private.css": "./../private.css",
      },
    })).rejects.toThrow("stay inside package root")

    await expect(packageExportGraph(root, {
      name: "@internal/fixture",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./icons/*": {"internal:main": "./assets/*"},
        "./icons/*.svg": {"internal:main": "./assets/*.svg"},
      },
    })).rejects.toThrow("Package export collision ./icons/add.svg:main")

    const outside = join(root, "..", "outside.css")
    await Bun.write(outside, "body {}\n")
    await symlink(outside, join(root, "linked.css"))
    try {
      await expect(packageExportGraph(root, {
        name: "@internal/fixture",
        exports: {
          ".": {"internal:main": "./main/index.ts"},
          "./linked.css": "./linked.css",
        },
      })).rejects.toThrow("symbolic link")
    } finally {
      await rm(outside, {force: true})
    }
  })
})

async function identity(
  artifact: "./theme.css" | undefined,
  source: string,
): Promise<BrowserPackageArtifactIdentity> {
  const bytes = new TextEncoder().encode(source)
  return {
    name: "@internal/visual",
    env: "main",
    ...(artifact === undefined ? {} : {artifact}),
    version: "0.1.18",
    ...await artifactIntegrity(bytes.buffer as ArrayBuffer),
  }
}

function wireIdentity(
  artifact: "./theme.css" | "./.cosmos/chunks/chunk-a1b2.js" | undefined,
): BrowserPackageArtifactIdentity {
  return {
    name: "@internal/visual",
    env: "main",
    ...(artifact === undefined ? {} : {artifact}),
    version: "0.1.18",
    sha256,
    size: 1,
  }
}

async function withPackage(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "cosmos-package-exports-"))
  try {
    await run(root)
  } finally {
    await rm(root, {recursive: true, force: true})
  }
}

async function write(root: string, path: string, source: string) {
  const target = join(root, path)
  await mkdir(join(target, ".."), {recursive: true})
  await Bun.write(target, source)
}
