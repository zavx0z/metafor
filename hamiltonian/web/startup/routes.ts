import {packageResponse} from "../../build"

/** Ленивые HTTP responses неизменяемого browser startup. */
export const startups = {
  main: ({method}: Request) => {
    if (method === "GET") return packageResponse("@startup/main")
    else return new Response(null, {status: 405})
  },
  service: ({method}: Request) => {
    if (method === "GET") return packageResponse("@startup/service", {
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "script-src 'unsafe-eval'",
    })
    else return new Response(null, {status: 405})
  },
}
