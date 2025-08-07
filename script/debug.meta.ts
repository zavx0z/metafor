import "../fixture/happydom.ts"
import { html } from "../core/html/index.ts"

const childHash = "child-243232"

const t1 = html`<div>
  <h1>Родитель: ${"message"}</h1>
  <meta-${childHash}></meta-${childHash}>
</div>`

const t2 = html`<div>
  <h1>Родитель: ${"message"}</h1>
  <meta-${childHash} context=${{ a: 1 }}></meta-${childHash}>
</div>`

function log(title: string, t: any) {
  console.log(title)
  console.log("strings:", t.strings.length)
  t.strings.forEach((s: string, i: number) => console.log(`[${i}]`, JSON.stringify(s)))
  console.log("values:", t.values.length)
}

log("no-context", t1)
log("with-context", t2)
