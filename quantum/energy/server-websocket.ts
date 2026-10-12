/** Named standalone WebSocket adapter; installed releases inject their own transport. */
import {Force} from "shared/transport/force"
import {OracleWebSocketTransport} from "shared/transport/oracle"
import {startEnergyRuntime} from "./server"
const runtime = await startEnergyRuntime({
  transport: new OracleWebSocketTransport("energy"),
  createForce: () => new Force("energy"),
})
process.once("SIGINT", () => void runtime.close())
process.once("SIGTERM", () => void runtime.close())
