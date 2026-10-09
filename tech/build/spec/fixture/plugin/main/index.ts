import {view} from "./view.tsx"
import shader from "./shader.fixture"
console.debug("build-example")
export const rendered = `${view}:${shader}`
export const builtVersion = import.meta.env.COSMOS_PACKAGE_VERSION
