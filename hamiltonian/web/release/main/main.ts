const {runtime} = await import("@internal/visual")
console.debug("[@release/main]", "Visual runtime подключён", {
  runtime: Object.keys(runtime),
})
