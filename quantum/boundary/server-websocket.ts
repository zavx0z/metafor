/** Named standalone WebSocket adapter; installed releases inject their own transport. */
import {join, resolve} from "node:path"
import {Force} from "shared/transport/force"
import {OracleWebSocketTransport} from "shared/transport/oracle"
import {startBoundaryRuntime} from "./server"
const runtime = await startBoundaryRuntime({
  filename: resolve(process.argv[2]?.trim() || Bun.env.BOUNDARY_PATH?.trim() || join(import.meta.dir, "..", ".metafor", "dev.sqlite")),
  transport: new OracleWebSocketTransport("boundary"),
  createForce: () => new Force("boundary"),
})
process.once("SIGINT", () => void runtime.close())
process.once("SIGTERM", () => void runtime.close())
