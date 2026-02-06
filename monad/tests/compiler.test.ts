import { describe, expect, it } from "bun:test";
import { RulesCompiler } from "../src/compiler";
import { OP } from "../src/common";

describe("RulesCompiler Compatibility", () => {
  const compiler = new RulesCompiler();
  const schema = { val: "number" };

  it("compiles atom-like numeric conditions", () => {
    const rules = {
      START: {
        END: {
          val: {
            notGt: 10,      // -> LTE 10
            notLt: 5,       // -> GTE 5
            notGte: 20,     // -> LT 20
            notLte: 0,      // -> GT 0
            between: [6, 9] // -> GTE 6, LTE 9
          }
        }
      },
      END: null
    };

    const result = compiler.compile(rules, schema);
    const code = Array.from(result.bytecode);

    // Verify OPs exist in bytecode
    // OP constants: EQ=0, NEQ=1, GT=2, LT=3, GTE=4, LTE=5
    
    // Check for OPs mapping
    expect(code.includes(OP.LTE)).toBe(true); // notGt, between(max)
    expect(code.includes(OP.GTE)).toBe(true); // notLt, between(min)
    expect(code.includes(OP.LT)).toBe(true);  // notGte
    expect(code.includes(OP.GT)).toBe(true);  // notLte
  });
});