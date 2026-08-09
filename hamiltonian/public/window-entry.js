import "/core/monitor.js"

await Promise.all([
  import("/app.js"),
  import("/orchestration.js"),
])
