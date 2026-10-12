/** Explicit WebSocket adapter retained for isolated Matrix development fixtures. */
import {Force} from "shared/transport/force"
import {startMatrixForce} from "./matrix"
export * from "./matrix"
await startMatrixForce(() => new Force("matrix"))
