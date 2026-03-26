import "../../bulk"
import { initProtocolLogger } from "./protocol-logger"

const darkWorkerUrl = new URL("../../dark/web.ts", import.meta.url)
darkWorkerUrl.searchParams.set("src", "github/zavx0z/git")
darkWorkerUrl.searchParams.set("dev", location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "1" : "0")

new Worker(darkWorkerUrl, {
  name: "dark",
  type: "module",
})

new Worker(new URL("../../boundary/web.ts", import.meta.url), {
  name: "boundary",
  type: "module",
})

initProtocolLogger()
