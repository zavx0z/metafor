import "../fixture/happydom.ts"
import { MetaFor } from "../web/metafor.ts"

let countChildMount = 0
let countParentMount = 0

const childHash = MetaFor(crypto.randomUUID(), { dev: false })
  .context((types) => ({
    message: types.string.required("child message"),
    count: types.number.required(1),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    onMount: () => {
      countChildMount++
    },
    render: ({ context, html }) => html`
      <div>
        <p>Сообщение: ${context.message}</p>
        <p>Счетчик: ${context.count}</p>
      </div>
    `,
  })

const parentTag = MetaFor(crypto.randomUUID(), { dev: false })
  .context((types) => ({
    parentMessage: types.string.required("message"),
    parentCount: types.number.required(0),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    onMount: () => {
      countParentMount++
    },
    render: ({ context, html }) => html`
      <div>
        <h1>Родитель: ${context.parentMessage}</h1>
        <meta-${childHash}></meta-${childHash}>
      </div>
    `,
  })

const container = document.createElement(`meta-${parentTag}`)
document.body.appendChild(container)

setTimeout(() => {
  console.log({ countChildMount, countParentMount })
}, 500)
