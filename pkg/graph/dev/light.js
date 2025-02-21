import {Atom, t} from "../../machine/atom.js"

const channel = new BroadcastChannel("channel")
channel.onmessage = /** @param {MessageEvent<BroadcastMessage>} event */ ({data}) => {
  console.log(data.meta.target, data.meta.func, data.patch.value)
}

const atom = Atom("layout-test")
  .states("state1", "state2")
  .context({
    param1: t.string({title: "Param 1"}),
    param2: t.string({title: "Param 2"})
  })
  .collapses([
    {
      from: "state1",
      action: "first",
      to: [{state: "state2", trigger: {param1: "value1"}}]
    },
    {
      from: "state2",
      to: [{state: "state1", trigger: {param2: "value2"}}]
    }
  ])
  .core()
  .actions({})
  .create({state: "state1", graph: true})

const component = await atom.graph()
const viewport = component.viewport
await viewport.centerOnElement(component)
