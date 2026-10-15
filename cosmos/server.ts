import {runServerStartup} from "@cosmos/startup"
import {decodeInstalledReleaseSelection} from "./selection"

if (Bun.env.COSMOS_RELEASE_STORE) {
  const {runInstalledCosmos} = await import("./installed")
  await runInstalledCosmos({
    storeRoot: Bun.env.COSMOS_RELEASE_STORE,
    // Тот же бюджет причинного native stopping, что и у portable bootstrap.
    terminationTimeoutMs: 60_000,
    ...(Bun.env.COSMOS_RELEASE_DIGEST ? {initialDigest: Bun.env.COSMOS_RELEASE_DIGEST} : {}),
    ...(Bun.env.COSMOS_RELEASE_SELECTION ? {selection: decodeInstalledReleaseSelection(Bun.env.COSMOS_RELEASE_SELECTION)} : {}),
    ...(Bun.env.COSMOS_STATIC_ROOT ? {staticRoot: Bun.env.COSMOS_STATIC_ROOT} : {}),
    ...(Bun.env.COSMOS_CONTROL_TOKEN ? {controlToken: Bun.env.COSMOS_CONTROL_TOKEN} : {}),
    port: Number(Bun.env.PORT ?? Bun.env.BUN_PORT ?? 4444),
  })
} else {
  await runServerStartup({readyTimeoutMs: 120_000})
}
