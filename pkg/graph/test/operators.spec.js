import {describe, expect, test} from "bun:test"
import {Atom} from "../../machine/atom.js"

const atom = Atom('операторы параметров контекста').states('ОЖИДАНИЕ', 'ДОБАВИТЬ'
).context({
  size: {title: 'Размер', type: 'number', nullable: true}
}).collapses([
  {
    from: 'ОЖИДАНИЕ',
    to: [{
      state: 'ДОБАВИТЬ',
      trigger: {
        size: {
          isNull: false, gt: 4
        }
      }
    }]
  }
]).core().actions({}).create({
  state: "ОЖИДАНИЕ",
  context: {
    size: null
  }
})
await Bun.sleep(500)
describe('Операторы параметров триггера', () => {
  test('Должен выполнить переход когда значение меняется с null на не-null и соответствует условиям', () => {

    atom.update({size: 10})
    expect(atom.state).toBe('ДОБАВИТЬ')
  })
})
