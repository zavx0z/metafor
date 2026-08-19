import {writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {getPlaygroundFixture} from "../../../pkg/nodes/layout/playground/fixtures.ts"
import {runPlaygroundLayout} from "../../../pkg/nodes/layout/playground/runner.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const cases = [
  {policy: "fixed", fixture: "fixed-baseline-right", output: "fixed-right.svg"},
  {policy: "fixed", fixture: "fixed-baseline-down", output: "fixed-down.svg"},
  {policy: "adaptive", fixture: "adaptive-shared-right", output: "adaptive-right.svg"},
  {policy: "adaptive", fixture: "adaptive-shared-down", output: "adaptive-down.svg"},
] as const

const evidence = cases.map(({policy, fixture, output}) => {
  const run = runPlaygroundLayout(policy, getPlaygroundFixture(fixture).graph)
  writeFileSync(join(directory, output), `${run.svg}\n`)
  return {
    policy,
    fixture,
    output,
    direction: run.result.direction,
    inputSha256: hash(JSON.stringify(run.input)),
    resultSha256: hash(JSON.stringify(run.result)),
    svgSha256: hash(`${run.svg}\n`),
    diagnostics: run.policyDiagnostics,
  }
})

const output = `${JSON.stringify({schemaVersion: 1, task: "NODES-010", evidence}, null, 2)}\n`
writeFileSync(join(directory, "svg-evidence.json"), output)
process.stdout.write(output)

function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}
