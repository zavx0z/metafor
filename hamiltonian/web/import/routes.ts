import {buildImport} from "./macro" with {type: "macro"}

const code = await buildImport()

/** Статические HTTP responses browser importer artifacts. */
export const importRoutes = {
  main: new Response(code.main, {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
  service: new Response(code.service, {
    headers: {"Content-Type": "text/javascript; charset=utf-8"},
  }),
}
