import {packageResponse} from "../../build"
import {sw, websocket} from "./server"

export type {RpcSocketData} from "./server"

/** Ленивый HTTP response Web-реализации RPC service и transport bindings. */
export const rpc = {
  service: () => packageResponse("@internal/rpc", {"Cache-Control": "no-cache"}),
  sw,
  websocket,
}
