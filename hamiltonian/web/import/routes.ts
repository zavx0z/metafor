import {packageResponse} from "../../build"

/** Ленивые HTTP responses browser importer artifacts. */
export const imports = {
  main: () => packageResponse("@import/main", {"Cache-Control": "no-cache"}),
  service: () => packageResponse("@import/service", {"Cache-Control": "no-cache"}),
}
