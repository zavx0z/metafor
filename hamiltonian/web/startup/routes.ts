import {buildStartup} from "./macro" with {type: "macro"}

const startup = await buildStartup()

/** Статические HTTP responses неизменяемого browser startup. */
export const startupRoutes = {
  main: new Response(startup.main, {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
  service: new Response(startup.service, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "script-src 'unsafe-eval'",
      "Content-Type": "text/javascript; charset=utf-8",
    },
  }),
}
