/** Named standalone WebSocket adapter; installed releases inject their own transport. */
import {Force} from "shared/transport/force"
import {OracleWebSocketTransport} from "shared/transport/oracle"
import {startMatrixRuntime} from "./server"
const runtime = await startMatrixRuntime({
  transport: new OracleWebSocketTransport("matrix"),
  createForce: () => new Force("matrix"),
})
process.once("SIGINT", () => void runtime.close())
process.once("SIGTERM", () => void runtime.close())
