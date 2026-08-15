import {build} from "../../macro" with {type: "macro"}
import {sw, websocket} from "./server"

export type {RpcSocketData} from "./server"

/** Готовый HTTP response Web-реализации RPC service. */
export const rpc = {
  service: new Response(await build("@internall/rpc/service/web", {format: "iife"}), {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
  sw,
  websocket,
}
