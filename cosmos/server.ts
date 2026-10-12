import {runServerStartup} from "@cosmos/startup"

if (Bun.env.COSMOS_RELEASE_STORE) {
  const {runInstalledCosmos} = await import("./installed")
  await runInstalledCosmos({
    storeRoot: Bun.env.COSMOS_RELEASE_STORE,
    ...(Bun.env.COSMOS_RELEASE_DIGEST ? {initialDigest: Bun.env.COSMOS_RELEASE_DIGEST} : {}),
    ...(Bun.env.COSMOS_STATIC_ROOT ? {staticRoot: Bun.env.COSMOS_STATIC_ROOT} : {}),
    ...(Bun.env.COSMOS_CONTROL_TOKEN ? {controlToken: Bun.env.COSMOS_CONTROL_TOKEN} : {}),
    port: Number(Bun.env.PORT ?? Bun.env.BUN_PORT ?? 4444),
  })
} else {
  await runServerStartup({readyTimeoutMs: 120_000})
}
