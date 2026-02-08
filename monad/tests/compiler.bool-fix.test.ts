import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler"
import { OP, TYPE } from "../src/common"

/**
 * Тесты для исправления бага с кодированием булевых значений.
 *
 * КОНТЕКСТ ПРОБЛЕМЫ:
 * В текущей реализации компилятора булево значение `true` кодируется как 0,
 * что нарушает семантику WGSL (где true = 1, false = 0).
 *
 * ПОСЛЕДСТВИЯ:
 * - Условия вида { isAlive: { eq: true } } всегда ложны
 * - Условия { isAlive: { eq: false } } всегда истинны
 * - Логика переходов состояний нарушена для булевых полей
 *
 * ИСПРАВЛЕНИЕ:
 * В методе компилятора, отвечающем за кодирование значений (обычно `encodeValue`),
 * нужно заменить:
 *   `return value ? 0 : 1` → `return value ? 1 : 0`
 */
describe("Булевы значения — исправление кодирования", () => {
  test("булево значение 'true' ДОЛЖНО кодироваться как 1 (WGSL семантика)", () => {
    const compiler = new RulesCompiler()

    // Минимальная конфигурация с единственным булевым условием
    const statesConfig = {
      IDLE: { ACTIVE: { isAlive: { eq: true } } },
      ACTIVE: null,
    }
    const schema = { isAlive: "boolean" }

    const result = compiler.compile(statesConfig, schema)
    const bytecode = Array.from(result.bytecode)

    // Ищем условие: [type=UINT (1), fieldIdx, op=EQ (0), value]
    let trueValue = null
    for (let i = 0; i < bytecode.length - 3; i++) {
      if (bytecode[i] === TYPE.UINT && bytecode[i + 2] === OP.EQ) {
        trueValue = bytecode[i + 3]
        break
      }
    }

    console.log(`🔍 Закодированное значение 'true': ${trueValue}`)
    console.log(`✅ Ожидаемо: 1 (согласно WGSL: true = 1, false = 0)`)

    // КРИТИЧЕСКАЯ ПРОВЕРКА:
    expect(trueValue).toBe(1)
  })

  test("булево значение 'false' ДОЛЖНО кодироваться как 0 (WGSL семантика)", () => {
    const compiler = new RulesCompiler()

    const statesConfig = {
      ACTIVE: { DEAD: { isAlive: { eq: false } } },
      DEAD: null,
    }
    const schema = { isAlive: "boolean" }

    const result = compiler.compile(statesConfig, schema)
    const bytecode = Array.from(result.bytecode)

    let falseValue = null
    for (let i = 0; i < bytecode.length - 3; i++) {
      if (bytecode[i] === TYPE.UINT && bytecode[i + 2] === OP.EQ) {
        falseValue = bytecode[i + 3]
        break
      }
    }

    console.log(`🔍 Закодированное значение 'false': ${falseValue}`)
    console.log(`✅ Ожидаемо: 0 (согласно WGSL: true = 1, false = 0)`)

    expect(falseValue).toBe(0)
  })

  test("булевые значения должны кодироваться РАЗНЫМИ числами", () => {
    const compiler1 = new RulesCompiler()
    const compiler2 = new RulesCompiler()

    // true → должно быть 1
    const res1 = compiler1.compile({ IDLE: { A: { f: { eq: true } } }, A: null }, { f: "boolean" })

    // false → должно быть 0
    const res2 = compiler2.compile({ IDLE: { B: { f: { eq: false } } }, B: null }, { f: "boolean" })

    const valTrue = Array.from(res1.bytecode).find((v, i, arr) => arr[i - 2] === TYPE.UINT && arr[i - 1] === OP.EQ)

    const valFalse = Array.from(res2.bytecode).find((v, i, arr) => arr[i - 2] === TYPE.UINT && arr[i - 1] === OP.EQ)

    console.log(`🔍 true=${valTrue}, false=${valFalse}`)
    console.log(`✅ Должны отличаться: true (1) ≠ false (0)`)

    expect(valTrue).not.toBe(valFalse)
    expect(valTrue).toBe(1)
    expect(valFalse).toBe(0)
  })
})
