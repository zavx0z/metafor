import "../../bulk"

new Worker(new URL("../../dark/web.ts", import.meta.url), {
  name: "dark",
  type: "module",
})

new Worker(new URL("../../boundary/web.ts", import.meta.url), {
  name: "boundary",
  type: "module",
})
