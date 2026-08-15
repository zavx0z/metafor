import {build} from "../../macro" with {type: "macro"}

/** Статические HTTP responses неизменяемого browser startup. */
export const startups = {
  main: new Response(await build("@startup/main", {external: ["/import/main"]}), {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
  service: new Response(await build("@startup/service"), {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "script-src 'unsafe-eval'",
      "Content-Type": "text/javascript; charset=utf-8",
    },
  }),
}
