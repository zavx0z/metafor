import {build} from "../../../../macro" with {type: "macro"}

/** Готовый HTTP response Web-реализации RPC service. */
export const webRoute = new Response(await build("@internall/rpc/service/web", {
  format: "iife",
}), {
  headers: {"Content-Type": "text/javascript; charset=utf-8"},
})
