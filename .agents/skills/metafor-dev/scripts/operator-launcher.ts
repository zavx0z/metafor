import {loadOperatorInstance} from "./operator-instance"
import {runInstalledCosmos} from "../../../../cosmos/installed"
import {decodeInstalledReleaseSelection} from "../../../../cosmos/selection"

const instance = await loadOperatorInstance()
if (!instance) throw new Error("Frozen operator requires its explicit instance")
// Установочный adapter вызывает того же startup owner без source entrypoint.
await runInstalledCosmos({
  storeRoot: instance.environment.COSMOS_RELEASE_STORE!,
  port: instance.port,
  terminationTimeoutMs: 60_000,
  environment: instance.environment,
  ...(Bun.env.COSMOS_RELEASE_DIGEST ? {initialDigest: Bun.env.COSMOS_RELEASE_DIGEST} : {}),
  ...(Bun.env.COSMOS_RELEASE_SELECTION ? {selection: decodeInstalledReleaseSelection(Bun.env.COSMOS_RELEASE_SELECTION)} : {}),
  ...(Bun.env.COSMOS_STATIC_ROOT ? {staticRoot: Bun.env.COSMOS_STATIC_ROOT} : {}),
  ...(Bun.env.COSMOS_CONTROL_TOKEN ? {controlToken: Bun.env.COSMOS_CONTROL_TOKEN} : {}),
})
