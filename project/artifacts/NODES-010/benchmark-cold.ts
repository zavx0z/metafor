const policyId = process.argv[2]
const fixtureId = process.argv[3]
if ((policyId !== "fixed" && policyId !== "adaptive") || fixtureId === undefined) {
  throw new Error("Usage: bun benchmark-cold.ts <fixed|adaptive> <fixture-id>")
}

const startedAt = performance.now()
const {getPlaygroundFixture} = await import("../../../pkg/nodes/layout/playground/fixtures.ts")
const graph = getPlaygroundFixture(fixtureId).graph
const outcome = policyId === "fixed"
  ? {result: (await import("@nodes/layout/fixed")).layoutFixed(graph), diagnostics: {candidateCount: 1}}
  : (await import("@nodes/layout/adaptive")).layoutAdaptiveWithDiagnostics(graph)
const importLayoutMs = performance.now() - startedAt
const resultSha256 = new Bun.CryptoHasher("sha256")
  .update(JSON.stringify(outcome.result))
  .digest("hex")

process.stdout.write(JSON.stringify({importLayoutMs, resultSha256}))
