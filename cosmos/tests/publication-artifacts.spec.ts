import {expect, setDefaultTimeout, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {
  readDesiredBrowserArtifacts,
  replaceDesiredBrowserArtifacts,
  replaceDesiredPackageArtifacts,
} from "../release/server/release/desired"
import {messageRpc, type RpcSocketData} from "../release/server/rpc"
import {releaseCurrentMessage} from "../release/shared/protocol"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

setDefaultTimeout(30_000)

test("publication materializes aliases, deduplicates bytes and exposes only eager browser identities", async () => {
  const result = await publicationFixture("publish")
  expect(result.success).toBeTrue()
  expect(result.packageVersion).toBe("1.0.1")
  expect(result.rootDependency).toBe("workspace:^1.0.1")
  expect(result.hardlinked).toBeTrue()
  expect(result.sharedWasmHardlinked).toBeTrue()
  expect(result.outputs.filter(({artifact}) => artifact === ".").map(({env, path}) => ({
    env,
    canonical: path.endsWith(`/dist/versions/1.0.1/${env}.js`),
  }))).toEqual([
    {env: "main", canonical: true},
    {env: "server", canonical: true},
  ])

  expect(result.outputs.map(({env, artifact, load}) => ({env, artifact, load}))).toEqual([
    {env: "main", artifact: ".", load: "eager"},
    {env: "main", artifact: expect.stringMatching(/^\.\/.cosmos\/entry\/.+\.css$/), load: "lazy"},
    {env: "main", artifact: "./kernel.wasm", load: "lazy"},
    {env: "main", artifact: "./theme.css", load: "eager"},
    {env: "server", artifact: ".", load: "eager"},
    {env: "server", artifact: "./kernel.wasm", load: "lazy"},
  ])
  expect(result.desiredAfterPublish.map(({env, artifact}) => ({env, artifact}))).toEqual([
    {env: "main", artifact: undefined},
    {env: "main", artifact: "./theme.css"},
  ])
  expect(result.desiredAfterPublish.some(({artifact}) => artifact?.startsWith("./.cosmos/")))
    .toBeFalse()
})

test("cold recovery repairs every missing lazy output and reconstructs desired in memory", async () => {
  const result = await publicationFixture("recover-missing")
  expect(result.recoveryError).toBeNull()
  expect(result.repaired).toBeTrue()
  expect(result.hardlinkedAfterRecovery).toBeTrue()
  expect(result.wasm).toBe("fixture-wasm-v1")
  expect(result.desiredAfterRecovery).toEqual(result.desiredAfterPublish)
})

test("cold recovery repairs a missing generated alias and retains eager projection", async () => {
  const result = await publicationFixture("recover-missing-generated")
  expect(result.recoveryError).toBeNull()
  expect(result.repaired).toBeTrue()
  expect(result.hardlinkedAfterRecovery).toBeTrue()
  expect(result.desiredAfterRecovery).toEqual(result.desiredAfterPublish)
})

test("cold recovery rejects immutable lazy conflicts and does not publish desired", async () => {
  const result = await publicationFixture("recover-conflict")
  expect(result.recoveryError).toContain("Immutable artifact conflict")
  expect(result.wasm).toBe("corrupt-wasm")
  expect(result.desiredAfterRecovery).toEqual([])
})

test("cold recovery rejects a public source-kind change behind the same version", async () => {
  const result = await publicationFixture("recover-path-conflict")
  expect(result.recoveryError).toContain("Immutable artifact path conflict")
  expect(result.desiredAfterRecovery).toEqual([])
})

test("cold recovery canonicalizes an equal legacy root and rejects changed bytes", async () => {
  const recovered = await publicationFixture("recover-legacy-root")
  expect(recovered.recoveryError).toBeNull()
  expect(recovered.canonicalRootExists).toBeTrue()

  const conflict = await publicationFixture("recover-legacy-root-conflict")
  expect(conflict.recoveryError).toContain("Immutable artifact conflict")
  expect(conflict.canonicalRootExists).toBeFalse()
  expect(conflict.legacyRootSource).toBe("conflicting legacy root")
  expect(conflict.desiredAfterRecovery).toEqual([])
})

test("exact predecessor public artifact survives removal from current exports", async () => {
  const result = await publicationFixture("predecessor-public")
  expect(result.predecessorPublicStatus).toBe(200)
  expect(result.predecessorPublicSource).toContain("--fixture:red")
  expect(result.stableRemovedStatus).toBe(404)
})

test("exact predecessor root and public artifact survive removal of their environment", async () => {
  const result = await publicationFixture("predecessor-env")
  expect(result.predecessorEnvRootStatus).toBe(200)
  expect(result.predecessorEnvPublicStatus).toBe(200)
  expect(result.stableRemovedEnvStatus).toBe(404)
})

test("desired projection replacement is atomic and RPC uses it by default", async () => {
  const root = identity(undefined, "a")
  const theme = identity("./theme.css", "b")
  replaceDesiredBrowserArtifacts([root, theme])
  try {
    expect(() => replaceDesiredBrowserArtifacts([theme])).toThrow("lacks matching root")
    expect(readDesiredBrowserArtifacts()).toEqual([root, theme])

    const other = {
      ...identity(undefined, "c"),
      name: "@internal/other",
    }
    replaceDesiredBrowserArtifacts([root, theme, other])
    replaceDesiredPackageArtifacts([root.name], [root])
    expect(readDesiredBrowserArtifacts()).toEqual([root, other])
    replaceDesiredBrowserArtifacts([root, theme])

    const sent: string[] = []
    const socket = {
      data: {source: "release/service" as const},
      send(message: string) {
        sent.push(message)
      },
      close() {},
    } as unknown as Bun.ServerWebSocket<RpcSocketData>
    await messageRpc(socket, JSON.stringify(releaseCurrentMessage([])))
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]!)).toEqual({
      type: "release-delta",
      update: [root, theme],
      remove: [],
    })
  } finally {
    replaceDesiredBrowserArtifacts([])
  }
})

interface PublicationFixtureResult {
  success: boolean
  outputs: Array<{
    env: "main" | "server"
    artifact: string
    kind: string
    load: "eager" | "lazy"
    path: string
    sha256: string
    size: number
  }>
  desiredAfterPublish: ReturnType<typeof readDesiredBrowserArtifacts>
  desiredAfterRecovery: ReturnType<typeof readDesiredBrowserArtifacts>
  hardlinked: boolean
  hardlinkedAfterRecovery: boolean
  sharedWasmHardlinked: boolean
  repaired: boolean
  recoveryError: string | null
  predecessorPublicStatus: number | null
  predecessorPublicSource: string | null
  stableRemovedStatus: number | null
  canonicalRootExists: boolean | null
  legacyRootSource: string | null
  predecessorEnvRootStatus: number | null
  predecessorEnvPublicStatus: number | null
  stableRemovedEnvStatus: number | null
  wasm: string
  packageVersion: string
  rootDependency: string
}

async function publicationFixture(scenario: string): Promise<PublicationFixtureResult> {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "test",
    "./tests/fixture/publication-artifact-process.ts",
  ], {
    cwd: cosmos,
    env: {...process.env, NODE_ENV: "production", ARTIFACT_PUBLICATION_SCENARIO: scenario},
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Artifact publication fixture failed: ${stderr || stdout}`)
  const source = stdout.split("\n").find((line) => line.startsWith('{"success"'))
  if (!source) throw new Error(`Artifact publication result is missing: ${stdout}`)
  return JSON.parse(source) as PublicationFixtureResult
}

function identity(artifact: "./theme.css" | undefined, digest: string) {
  return {
    name: "@internal/fixture",
    env: "main" as const,
    ...(artifact === undefined ? {} : {artifact}),
    version: "1.0.1",
    sha256: digest.repeat(64),
    size: 1,
  }
}
