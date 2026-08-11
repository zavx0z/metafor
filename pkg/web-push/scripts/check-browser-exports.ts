const browserEntries = [
  "src/index.ts",
  "src/protocol.ts",
  "src/lifecycle.ts",
  "src/client.ts",
  "src/worker.ts",
]

const result = await Bun.build({
  entrypoints: browserEntries,
  target: "browser",
  format: "esm",
  minify: false,
  throw: false,
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) {
  const source = await output.text()
  if (/from\s+["'](?:node:|bun:|web-push)/.test(source)) {
    throw new Error(`Server-only dependency leaked into browser export ${output.path}`)
  }
  if (output.path.endsWith("index.js") && /WebPushService|MemoryWebPushSubscriptionStore/.test(source)) {
    throw new Error("Root export must remain runtime-neutral")
  }
}

console.log(`browser exports clean: ${result.outputs.length}`)
