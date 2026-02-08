import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler"
import { OP, TYPE } from "../src/common"

/**
 * Функциональные тесты компилятора правил.
 * Проверяют правильность генерации байткода для операторов, типов данных и структуры памяти.
 * Все тесты работают без браузера и без доступа к GPU.
 * 
 * ВАЖНО: Каждый тест создаёт НОВЫЙ экземпляр компилятора, чтобы избежать загрязнения состояния между тестами.
 * ВАЖНО: Все состояния, упомянутые как цели переходов, ДОЛЖНЫ быть объявлены в корне конфигурации (например, "DEAD: null").
 */
describe("Компилятор правил — функциональные тесты", () => {
  describe("Парсинг операторов сравнения", () => {
    test("оператор 'lte' (<=) должен компилироваться в OP.LTE (5)", () => {
      // Создаём НОВЫЙ компилятор для изоляции состояния между тестами
      const compiler = new RulesCompiler()
      
      // Конфигурация: состояние IDLE может перейти в DEAD, если здоровье <= 0
      // ВАЖНО: все состояния (включая цели переходов) должны быть объявлены в корне!
      const statesConfig = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null, // ← обязательно объявляем состояние-цель!
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      // Ищем в байткоде оператор OP.LTE (значение 5)
      // Формат условия в байткоде: [type, fieldIdx, op, value]
      // Мы ищем слово со значением 5 (код оператора <=)
      const hasLTE = bytecodeArray.includes(OP.LTE)
      expect(hasLTE).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.LTE (<=)")
    })

    test("оператор 'gt' (>) должен компилироваться в OP.GT (2)", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null, // ← объявляем цель перехода
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      const hasGT = bytecodeArray.includes(OP.GT)
      expect(hasGT).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.GT (>)")
    })

    test("оператор 'gte' (>=) должен компилироваться в OP.GTE (4)", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { PATROL: { hp: { gte: 50 } } },
        PATROL: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      const hasGTE = bytecodeArray.includes(OP.GTE)
      expect(hasGTE).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.GTE (>=)")
    })

    test("оператор 'lt' (<) должен компилироваться в OP.LT (3)", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        PATROL: { IDLE: { mana: { lt: 10 } } },
        IDLE: null,
      }
      const schema = { mana: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      const hasLT = bytecodeArray.includes(OP.LT)
      expect(hasLT).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.LT (<)")
    })

    test("оператор 'eq' (==) должен компилироваться в OP.EQ (0)", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        PATROL: { COMBAT: { isAlive: { eq: true } } },
        COMBAT: null,
      }
      const schema = { isAlive: "boolean" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      const hasEQ = bytecodeArray.includes(OP.EQ)
      expect(hasEQ).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.EQ (==)")
    })

    test("оператор 'neq' (!=) должен компилироваться в OP.NEQ (1)", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        ACTIVE: { IDLE: { isAlive: { neq: false } } },
        IDLE: null,
      }
      const schema = { isAlive: "boolean" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      const hasNEQ = bytecodeArray.includes(OP.NEQ)
      expect(hasNEQ).toBe(true)
      
      console.log("✅ Байткод содержит оператор OP.NEQ (!=)")
    })
  })

  describe("Кодирование значений для разных типов данных", () => {
    test("число с плавающей точкой должно кодироваться через bitcast в u32", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { DEAD: { hp: { lte: 0.0 } } },
        DEAD: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      // Находим в байткоде закодированное значение 0.0 для типа FLOAT
      // Формат условия: [type=0 (FLOAT), fieldIdx, op=5 (LTE), value]
      // Ищем последовательность: 0, ?, 5, ?
      let encodedValue = 0
      for (let i = 0; i < bytecodeArray.length - 3; i++) {
        if (bytecodeArray[i] === TYPE.FLOAT && bytecodeArray[i + 2] === OP.LTE) {
          encodedValue = bytecodeArray[i + 3]
          break
        }
      }
      
      // Для 0.0 битовое представление в IEEE 754 = 0
      expect(encodedValue).toBe(0)
      console.log(`✅ Значение 0.0 закодировано как u32: ${encodedValue}`)
    })

    test("булево значение 'true' должно кодироваться как 1", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }
      const schema = { isAlive: "boolean" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      // Для булевых значений используется тип UINT (1)
      // Ищем последовательность: type=1 (UINT), fieldIdx, op=0 (EQ), value=1
      let encodedValue = 0
      for (let i = 0; i < bytecodeArray.length - 3; i++) {
        if (bytecodeArray[i] === TYPE.UINT && bytecodeArray[i + 2] === OP.EQ) {
          encodedValue = bytecodeArray[i + 3]
          break
        }
      }
      
      expect(encodedValue).toBe(1)
      console.log(`✅ Значение true закодировано как u32: ${encodedValue}`)
    })

    test("булево значение 'false' должно кодироваться как 0", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        ACTIVE: { DEAD: { isAlive: { eq: false } } },
        DEAD: null,
      }
      const schema = { isAlive: "boolean" }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      let encodedValue = 0
      for (let i = 0; i < bytecodeArray.length - 3; i++) {
        if (bytecodeArray[i] === TYPE.UINT && bytecodeArray[i + 2] === OP.EQ) {
          encodedValue = bytecodeArray[i + 3]
          break
        }
      }
      
      expect(encodedValue).toBe(0)
      console.log(`✅ Значение false закодировано как u32: ${encodedValue}`)
    })
  })

  describe("Структура байткода — таблица состояний", () => {
    test("таблица состояний должна содержать указатели на блоки каждого состояния", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { IDLE: { mana: { lt: 10 } } },
        DEAD: null,
      }
      const schema = { hp: "number", mana: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Таблица состояний начинается с индекса 0 и имеет длину = количеству состояний (3)
      // Каждый элемент таблицы — это смещение (указатель) на блок условий для этого состояния
      const tableSize = Object.keys(statesConfig).length
      const tableEntries = Array.from(result.bytecode).slice(0, tableSize)
      
      console.log(`📊 Таблица состояний (${tableSize} состояний):`, tableEntries)
      
      // Все указатели должны быть положительными числами (смещения в байткоде)
      for (let i = 0; i < tableSize; i++) {
        expect(tableEntries[i]).toBeGreaterThan(0)
        console.log(`  Состояние ${i}: смещение = ${tableEntries[i]}`)
      }
      
      expect(result.stateTableOffset).toBe(0)
      console.log("✅ Таблица состояний начинается с индекса 0")
    })

    test("stateMap должен корректно маппить имена состояний на числовые ID", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { IDLE: { mana: { lt: 10 } } },
        DEAD: null,
      }
      const schema = { hp: "number", mana: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // stateMap: { "IDLE": 0, "PATROL": 1, "DEAD": 2 }
      expect(result.stateMap["IDLE"]).toBe(0)
      expect(result.stateMap["PATROL"]).toBe(1)
      expect(result.stateMap["DEAD"]).toBe(2)
      
      console.log("✅ stateMap:", result.stateMap)
    })
  })

  describe("Структура байткода — блоки состояний", () => {
    test("блок состояния должен содержать количество переходов", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: null,
        DEAD: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Для состояния IDLE (индекс 0) в таблице состояний должен быть указатель на его блок
      const idleBlockPtr = result.bytecode[0]
      
      // Первое слово в блоке состояния — это количество переходов
      const transitionCount = result.bytecode[idleBlockPtr]
      
      expect(transitionCount).toBe(2)
      console.log(`✅ Состояние IDLE имеет ${transitionCount} перехода`)
    })

    test("блок состояния должен содержать пары [targetState, conditionPtr] для каждого перехода", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: null,
        DEAD: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      const idleBlockPtr = result.bytecode[0]
      const transitionCount = result.bytecode[idleBlockPtr]
      
      // После количества переходов идут пары: [цель, указатель_на_условия]
      // Каждый переход занимает 2 слова
      for (let i = 0; i < transitionCount; i++) {
        const targetState = result.bytecode[idleBlockPtr + 1 + i * 2]
        const condPtr = result.bytecode[idleBlockPtr + 1 + i * 2 + 1]
        
        expect(targetState).toBeGreaterThanOrEqual(0)
        expect(targetState).toBeLessThan(3) // IDLE=0, PATROL=1, DEAD=2
        expect(condPtr).toBeGreaterThan(idleBlockPtr)
        
        console.log(`  Переход ${i}: цель=${targetState}, условия@${condPtr}`)
      }
    })
  })

  describe("Структура байткода — блоки условий", () => {
    test("блок условий должен содержать количество условий", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
        },
        PATROL: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Находим блок условий для перехода IDLE -> PATROL
      const idleBlockPtr = result.bytecode[0]
      const condPtr = result.bytecode[idleBlockPtr + 1 + 1] // [кол-во, цель, указатель]
      
      // Первое слово в блоке условий — это количество условий
      const conditionCount = result.bytecode[condPtr]
      
      expect(conditionCount).toBe(1)
      console.log(`✅ Блок условий содержит ${conditionCount} условие`)
    })

    test("каждое условие должно быть упаковано как [type, fieldIdx, op, value]", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
        },
        PATROL: null,
      }
      const schema = { hp: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Находим блок условий для перехода IDLE -> PATROL
      const idleBlockPtr = result.bytecode[0]
      const condPtr = result.bytecode[idleBlockPtr + 1 + 1]
      
      // Каждое условие занимает 4 слова:
      // [type, fieldIdx, op, value]
      const type = result.bytecode[condPtr + 1]
      const fieldIdx = result.bytecode[condPtr + 2]
      const op = result.bytecode[condPtr + 3]
      const value = result.bytecode[condPtr + 4]
      
      expect(type).toBe(TYPE.FLOAT) // hp — это число с плавающей точкой (0)
      expect(fieldIdx).toBe(0) // hp — первое поле в схеме (индекс 0)
      expect(op).toBe(OP.GT) // оператор > (2)
      
      console.log(`✅ Условие упаковано:`)
      console.log(`   type=${type} (FLOAT)`) 
      console.log(`   fieldIdx=${fieldIdx} (hp)`) 
      console.log(`   op=${op} (GT >)`) 
      console.log(`   value=${value} (50 закодировано)`) 
    })

    test("условие с несколькими операторами должно генерировать несколько инструкций", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          COMBAT: {
            hp: { gt: 50 },
            mana: { gt: 20 },
          },
        },
        COMBAT: null,
      }
      const schema = { hp: "number", mana: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Находим блок условий для перехода IDLE -> COMBAT
      const idleBlockPtr = result.bytecode[0]
      const condPtr = result.bytecode[idleBlockPtr + 1 + 1]
      
      const conditionCount = result.bytecode[condPtr]
      
      // Два условия: hp > 50 И mana > 20
      expect(conditionCount).toBe(2)
      
      // Первое условие: hp > 50
      const type1 = result.bytecode[condPtr + 1]
      const fieldIdx1 = result.bytecode[condPtr + 2]
      const op1 = result.bytecode[condPtr + 3]
      
      // Второе условие: mana > 20
      const type2 = result.bytecode[condPtr + 5]
      const fieldIdx2 = result.bytecode[condPtr + 6]
      const op2 = result.bytecode[condPtr + 7]
      
      expect(type1).toBe(TYPE.FLOAT)
      expect(fieldIdx1).toBe(0) // hp — индекс 0 (первое поле)
      expect(op1).toBe(OP.GT)
      
      expect(type2).toBe(TYPE.FLOAT)
      expect(fieldIdx2).toBe(1) // mana — индекс 1 (второе поле)
      expect(op2).toBe(OP.GT)
      
      console.log(`✅ Два условия упакованы:`)
      console.log(`   Условие 1: hp > 50 [type=${type1}, field=${fieldIdx1}, op=${op1}]`)
      console.log(`   Условие 2: mana > 20 [type=${type2}, field=${fieldIdx2}, op=${op2}]`)
    })
  })

  describe("Маппинг полей контекста", () => {
    test("fieldMap должен корректно маппить имена полей на тип и индекс", () => {
      const compiler = new RulesCompiler()
      
      const schema = {
        hp: "number",
        mana: "number",
        isAlive: "boolean",
      }
      
      // Минимальная конфигурация для компиляции (нужны хотя бы 2 состояния)
      const statesConfig = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }
      
      const result = compiler.compile(statesConfig, schema)
      
      // fieldMap: { hp: { type: 0, index: 0 }, mana: { type: 0, index: 1 }, isAlive: { type: 1, index: 0 } }
      expect(result.fieldMap["hp"]).toEqual({ type: TYPE.FLOAT, index: 0 })
      expect(result.fieldMap["mana"]).toEqual({ type: TYPE.FLOAT, index: 1 })
      expect(result.fieldMap["isAlive"]).toEqual({ type: TYPE.UINT, index: 0 }) // boolean → UINT
      
      console.log("✅ fieldMap:", result.fieldMap)
    })

    test("поля типа 'number' должны маппиться на тип FLOAT (0)", () => {
      const compiler = new RulesCompiler()
      
      const schema = { hp: "number", mana: "number" }
      const statesConfig = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }
      
      const result = compiler.compile(statesConfig, schema)
      
      expect(result.fieldMap["hp"].type).toBe(TYPE.FLOAT)
      expect(result.fieldMap["mana"].type).toBe(TYPE.FLOAT)
      
      console.log("✅ Поля 'number' → FLOAT (0)")
    })

    test("поля типа 'boolean' должны маппиться на тип UINT (1)", () => {
      const compiler = new RulesCompiler()
      
      const schema = { isAlive: "boolean" }
      const statesConfig = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }
      
      const result = compiler.compile(statesConfig, schema)
      
      expect(result.fieldMap["isAlive"].type).toBe(TYPE.UINT)
      
      console.log("✅ Поля 'boolean' → UINT (1)")
    })
  })

  describe("Atom-like условия (расширенный синтаксис)", () => {
    test("условие 'notGt: 10' должно компилироваться как 'lte: 10'", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        START: { END: { val: { notGt: 10 } } },
        END: null,
      }
      const schema = { val: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // notGt: 10 → !> 10 → <= 10 → OP.LTE
      const bytecodeArray = Array.from(result.bytecode)
      const hasLTE = bytecodeArray.includes(OP.LTE)
      expect(hasLTE).toBe(true)
      
      console.log("✅ notGt: 10 → OP.LTE (<=)")
    })

    test("условие 'notLt: 5' должно компилироваться как 'gte: 5'", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        START: { END: { val: { notLt: 5 } } },
        END: null,
      }
      const schema = { val: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // notLt: 5 → !< 5 → >= 5 → OP.GTE
      const bytecodeArray = Array.from(result.bytecode)
      const hasGTE = bytecodeArray.includes(OP.GTE)
      expect(hasGTE).toBe(true)
      
      console.log("✅ notLt: 5 → OP.GTE (>=)")
    })

    test("условие 'notGte: 20' должно компилироваться как 'lt: 20'", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        START: { END: { val: { notGte: 20 } } },
        END: null,
      }
      const schema = { val: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // notGte: 20 → !>= 20 → < 20 → OP.LT
      const bytecodeArray = Array.from(result.bytecode)
      const hasLT = bytecodeArray.includes(OP.LT)
      expect(hasLT).toBe(true)
      
      console.log("✅ notGte: 20 → OP.LT (<)")
    })

    test("условие 'notLte: 0' должно компилироваться как 'gt: 0'", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        START: { END: { val: { notLte: 0 } } },
        END: null,
      }
      const schema = { val: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      // notLte: 0 → !<= 0 → > 0 → OP.GT
      const bytecodeArray = Array.from(result.bytecode)
      const hasGT = bytecodeArray.includes(OP.GT)
      expect(hasGT).toBe(true)
      
      console.log("✅ notLte: 0 → OP.GT (>)")
    })

    test("условие 'between: [6, 9]' должно компилироваться как 'gte: 6, lte: 9'", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        START: { END: { val: { between: [6, 9] } } },
        END: null,
      }
      const schema = { val: "number" }
      
      const result = compiler.compile(statesConfig, schema)
      
      const bytecodeArray = Array.from(result.bytecode)
      
      // between: [6, 9] → >= 6 И <= 9 → два оператора: OP.GTE и OP.LTE
      const hasGTE = bytecodeArray.includes(OP.GTE)
      const hasLTE = bytecodeArray.includes(OP.LTE)
      
      expect(hasGTE).toBe(true)
      expect(hasLTE).toBe(true)
      
      console.log("✅ between: [6, 9] → OP.GTE (>=) и OP.LTE (<=)")
    })
  })

  describe("Полная структура байткода", () => {
    test("байткод должен быть валидным Uint32Array", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: {
          IDLE: { mana: { lt: 10 } },
          COMBAT: { isAlive: { eq: true } },
        },
        COMBAT: {
          DEAD: { hp: { lte: 0 } },
        },
        DEAD: null,
      }
      const schema = {
        hp: "number",
        mana: "number",
        isAlive: "boolean",
      }
      
      const result = compiler.compile(statesConfig, schema)
      
      // Проверяем тип результата
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      
      // Проверяем, что байткод не пустой
      expect(result.bytecode.length).toBeGreaterThan(0)
      
      // Проверяем, что все значения валидны (не NaN, не бесконечность)
      const bytecodeArray = Array.from(result.bytecode)
      for (let i = 0; i < bytecodeArray.length; i++) {
        expect(bytecodeArray[i]).not.toBeNaN()
        expect(bytecodeArray[i]).toBeGreaterThanOrEqual(0)
      }
      
      console.log(`✅ Байткод валиден: ${result.bytecode.length} слов (u32)`)
    })

    test("байткод должен содержать все необходимые операторы для полного примера", () => {
      const compiler = new RulesCompiler()
      
      const statesConfig = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: {
          IDLE: { mana: { lt: 10 } },
          COMBAT: { isAlive: { eq: true } },
        },
        COMBAT: {
          DEAD: { hp: { lte: 0 } },
        },
        DEAD: null,
      }
      const schema = {
        hp: "number",
        mana: "number",
        isAlive: "boolean",
      }
      
      const result = compiler.compile(statesConfig, schema)
      const bytecodeArray = Array.from(result.bytecode)
      
      // Проверяем наличие всех операторов из конфигурации
      expect(bytecodeArray.includes(OP.GT)).toBe(true) // hp > 50
      expect(bytecodeArray.includes(OP.LTE)).toBe(true) // hp <= 0
      expect(bytecodeArray.includes(OP.LT)).toBe(true) // mana < 10
      expect(bytecodeArray.includes(OP.EQ)).toBe(true) // isAlive == true
      
      console.log("✅ Байткод содержит все операторы:")
      console.log(`   OP.GT (>): ${bytecodeArray.includes(OP.GT)}`)
      console.log(`   OP.LTE (<=): ${bytecodeArray.includes(OP.LTE)}`)
      console.log(`   OP.LT (<): ${bytecodeArray.includes(OP.LT)}`)
      console.log(`   OP.EQ (==): ${bytecodeArray.includes(OP.EQ)}`)
    })
  })
})
