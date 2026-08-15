import {importRoutes} from "./import/routes"
import {startupRoutes} from "./startup/routes"
import {staticRoutes} from "./static/routes"

export default {
  import: importRoutes,
  static: staticRoutes,
  startup: startupRoutes,
}
