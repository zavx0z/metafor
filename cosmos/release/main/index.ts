const {runtime} = await import("@internal/visual")
console.debug("[@cosmos/release:main]", "Visual runtime подключён", {
  runtime: Object.keys(runtime),
})
