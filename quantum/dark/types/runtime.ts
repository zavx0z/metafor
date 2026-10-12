import type {OracleWebSocketData} from "shared/transport/oracle"
import type {ForceSocketData} from "../force/websocket"

/** Dark-owned WebSocket data union for composition in the release listener. */
export type DarkRuntimeSocketData = (ForceSocketData & {kind: "force"}) | OracleWebSocketData
