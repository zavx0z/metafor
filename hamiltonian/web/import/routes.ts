import {build} from "../../macro" with {type: "macro"}

/** Статические HTTP responses browser importer artifacts. */
export const importRoutes = {
  main: new Response(await build("@import/main"), {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
  service: new Response(await build("@import/service", {format: "cjs", minify: true}), {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
}
