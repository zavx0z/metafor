import {describe, expect, test} from "bun:test"
import {Atom, t} from "../atom.js"

describe("Синхронизация core и context", async () => {
  const atom = Atom("sync-test")
    .states("IDLE")
    .context({
      dataLength: t.number({default: 0})
    })
    .collapses([])
    .core(({update}) => ({
      data: [],
      popData() {
        update({dataLength: 0})
        this.data.splice(0, this.data.length)
      },
      pushData(data: any) {
        this.data.push(data)
        update({dataLength: this.data.length})
      }
    }))
    .actions({})
    .reactions([])
    .create({
      state: "IDLE"
    })

  let count = 50
  const delay = 100
  const interval = setInterval(() => {
    atom.core.pushData(count)
    count--
    if (count === 0) clearInterval(interval)
  }, delay)

  atom.onUpdate(values => {
    if (values.dataLength > 4) {
      test("Данные ядра синхронизируются с контекстом", () => {
        atom.core.popData()
        // Simulate heavy synchronous computation (~1 second)
        let result = 0
        for (let i = 0; i < 100_000_000; i++) {
          result += Math.sin(i) * Math.cos(i)
        }
        // console.log("values", values.dataLength, atom.context.dataLength, atom.core.data.length)
        expect(atom.context.dataLength).toBe(0)
        expect(atom.core.data.length).toBe(0)
      })
    }
  })
  await Bun.sleep(delay * count)
})
