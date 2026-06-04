import { describe, expect, test } from "bun:test";
import {
  createCommandRouter,
  defaultVoiceCommands,
  levenshteinDistance,
  normalizeCommandText,
} from "./commands";

describe("command routing", () => {
  test("normalizes Russian text", () => {
    expect(normalizeCommandText("Включи, пожалуйста, свет!")).toContain("включи");
    expect(normalizeCommandText("Ёлка")).toBe("елка");
  });

  test("normalizes phonetic English aliases", () => {
    expect(normalizeCommandText("Открой гит хаб")).toBe("открой github");
    expect(normalizeCommandText("Запусти БАН")).toBe("запусти bun");
    expect(normalizeCommandText("Проверь веб джи пи ю")).toBe("проверь webgpu");
  });

  test("calculates Levenshtein distance", () => {
    expect(levenshteinDistance("включи", "включи")).toBe(0);
    expect(levenshteinDistance("свит", "свет")).toBe(1);
    expect(levenshteinDistance("github", "gitlab")).toBe(2);
  });

  test("matches Russian commands and phonetic aliases", () => {
    const router = createCommandRouter(defaultVoiceCommands);

    expect(router.match("включи свет")?.command.id).toBe("lights.on");
    expect(router.match("открой гит хаб")?.command.id).toBe("github.open");
    expect(router.match("проверь веб джи пи ю")?.command.id).toBe("webgpu.check");
    expect(router.match("Слышь долбоёб")).toBeNull();
  });

  test("exposes Russian recognition grammar phrases for alias commands", () => {
    const router = createCommandRouter(defaultVoiceCommands);

    expect(router.recognitionPhrases).toContain("открой гит хаб");
    expect(router.recognitionPhrases).toContain("проверь веб джи пи ю");
    expect(router.recognitionPhrases).not.toContain("открой github");
    expect(router.recognitionPhrases).not.toContain("открой гитхаб");
  });

  test("matches small Vosk mistakes with Levenshtein fallback", () => {
    const router = createCommandRouter(defaultVoiceCommands);

    const match = router.match("аткрой гитхаб");

    expect(match?.command.id).toBe("github.open");
    expect(match?.kind).toBe("fuzzy");
  });

  test("does not fuzzy-match a different verb", () => {
    const router = createCommandRouter(defaultVoiceCommands);

    expect(router.match("выключи свет")).toBeNull();
    expect(router.match("свет")).toBeNull();
  });

  test("honors zero Levenshtein tolerance", () => {
    const router = createCommandRouter(
      [
        {
          id: "agent.two",
          phrases: ["агент 2"],
          run: () => {},
        },
      ],
      { maxRelativeDistance: 0 },
    );

    expect(router.match("агент 2")?.command.id).toBe("agent.two");
    expect(router.match("агент")).toBeNull();
    expect(router.match("аген 2")).toBeNull();
    expect(router.match("о агент")).toBeNull();
  });
});
