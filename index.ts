import "./server/metafor"
import { log } from "./dist/server/console"

new BroadcastChannel("channel").onmessage = log

const html = String.raw
document.body.innerHTML = html`<meta-for src="/zavx0z/app.js" id="1"></meta-for>`
