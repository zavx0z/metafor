import {
  currentServerProcessIdentity,
  serverProcessReady,
} from "../../shared/package/process"

const identity = currentServerProcessIdentity()
const behavior = Bun.env.COSMOS_PACKAGE_FIXTURE_BEHAVIOR ?? "ready"
const observation = Bun.env.COSMOS_PACKAGE_FIXTURE_OBSERVATION

if (observation) await Bun.write(observation, JSON.stringify({
  argv: process.argv.slice(2),
  behavior,
  identity,
  marker: Bun.env.COSMOS_PACKAGE_FIXTURE_MARKER ?? null,
}))

if (behavior === "exit-before-ready") process.exit(17)

process.send?.(serverProcessReady(behavior === "wrong-ready"
  ? {...identity, version: "9.9.9"}
  : identity))

if (behavior === "exit-after-ready") {
  setTimeout(() => process.exit(23), 10)
} else {
  await new Promise<void>((resolve) => {
    process.once("SIGTERM", resolve)
    process.once("SIGINT", resolve)
  })
}
