const {runtime} = await import("@internal/visual")
console.debug("[@hamiltonian/release:main]", "Visual runtime подключён", {
  runtime: Object.keys(runtime),
})
