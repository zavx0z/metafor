export type CommandContext = {
  text: string;
  normalizedText: string;
};

export type VoiceCommand = {
  id: string;
  phrases: readonly string[];
  run(context: CommandContext): void | Promise<void>;
};

export type CommandMatch = {
  command: VoiceCommand;
  phrase: string;
  kind: "exact" | "contains" | "fuzzy";
  distance: number;
  normalizedText: string;
  normalizedPhrase: string;
};

export type PhoneticAliases = Record<string, string>;

export type CommandRouterOptions = {
  aliases?: PhoneticAliases;
  maxRelativeDistance?: number;
  maxDistance?: number;
};

export const defaultPhoneticAliases: PhoneticAliases = {
  "гитхаб": "github",
  "гит хаб": "github",
  "бан": "bun",
  "таури": "tauri",
  "раст": "rust",
  "веб сокет": "websocket",
  "веб джи пи ю": "webgpu",
  "тайпскрипт": "typescript",
};

export function createCommandRouter(
  commands: readonly VoiceCommand[],
  options: CommandRouterOptions = {},
) {
  const aliases = options.aliases ?? defaultPhoneticAliases;
  const maxRelativeDistance = options.maxRelativeDistance ?? 0.18;
  const configuredMaxDistance = options.maxDistance ?? 3;
  const entries = commands.flatMap((command) =>
    command.phrases.map((phrase) => ({
      command,
      phrase,
      normalizedPhrase: normalizeCommandText(phrase, aliases),
    })),
  );

  return {
    phrases: entries.map((entry) => entry.phrase),
    recognitionPhrases: createRecognitionPhrases(commands, aliases),

    match(text: string): CommandMatch | null {
      const normalizedText = normalizeCommandText(text, aliases);
      const exactMatch = entries.find((entry) => normalizedText === entry.normalizedPhrase);
      if (exactMatch) {
        return toMatch(exactMatch, "exact", 0, normalizedText);
      }

      const containsMatch = entries.find(
        (entry) =>
          normalizedText.includes(entry.normalizedPhrase),
      );
      if (containsMatch) {
        return toMatch(containsMatch, "contains", 0, normalizedText);
      }

      const fuzzyMatches = entries
        .map((entry) => ({
          entry,
          distance: phraseDistance(normalizedText, entry.normalizedPhrase),
        }))
        .filter(({ entry, distance }) => {
          const maxDistance = Math.min(
            configuredMaxDistance,
            Math.max(1, Math.floor(entry.normalizedPhrase.length * maxRelativeDistance)),
          );

          return distance <= maxDistance && !hasUnsafeVerbPrefix(normalizedText, entry.normalizedPhrase);
        })
        .sort((left, right) => left.distance - right.distance);

      const fuzzyMatch = fuzzyMatches[0];
      return fuzzyMatch
        ? toMatch(fuzzyMatch.entry, "fuzzy", fuzzyMatch.distance, normalizedText)
        : null;
    },

    async dispatch(text: string): Promise<CommandMatch | null> {
      const match = this.match(text);
      if (!match) return null;

      await match.command.run({ text, normalizedText: match.normalizedText });
      return match;
    },
  };
}

export function normalizeCommandText(
  text: string,
  aliases: PhoneticAliases = defaultPhoneticAliases,
): string {
  return applyPhoneticAliases(normalizePlainText(text), aliases);
}

export function normalizePlainText(text: string): string {
  return text
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyPhoneticAliases(text: string, aliases: PhoneticAliases): string {
  let result = ` ${text} `;
  const entries = Object.entries(aliases)
    .map(([spoken, canonical]) => [normalizePlainText(spoken), normalizePlainText(canonical)])
    .sort(([left], [right]) => right.length - left.length);

  for (const [spoken, canonical] of entries) {
    result = result.replace(new RegExp(` ${escapeRegExp(spoken)} `, "gu"), ` ${canonical} `);
  }

  return normalizePlainText(result);
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    current[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + substitutionCost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[right.length];
}

export const defaultVoiceCommands: VoiceCommand[] = [
  {
    id: "lights.on",
    phrases: ["включи свет", "зажги свет"],
    run: () => {
      console.log("action: lights.on");
    },
  },
  {
    id: "door.open",
    phrases: ["открой дверь"],
    run: () => {
      console.log("action: door.open");
    },
  },
  {
    id: "github.open",
    phrases: ["открой github", "покажи github"],
    run: ({ normalizedText }) => {
      console.log(`action: github.open text="${normalizedText}"`);
    },
  },
  {
    id: "bun.run",
    phrases: ["запусти bun", "проверь bun"],
    run: ({ normalizedText }) => {
      console.log(`action: bun.run text="${normalizedText}"`);
    },
  },
  {
    id: "webgpu.check",
    phrases: ["проверь webgpu"],
    run: ({ normalizedText }) => {
      console.log(`action: webgpu.check text="${normalizedText}"`);
    },
  },
];

function createRecognitionPhrases(
  commands: readonly VoiceCommand[],
  aliases: PhoneticAliases,
): string[] {
  const phrases = new Set<string>();

  for (const command of commands) {
    for (const phrase of command.phrases) {
      for (const expanded of expandPhraseForRecognition(phrase, aliases)) {
        phrases.add(expanded);
      }
    }
  }

  return [...phrases];
}

function expandPhraseForRecognition(phrase: string, aliases: PhoneticAliases): string[] {
  const originalPhrase = normalizePlainText(phrase);
  const variants = new Set([originalPhrase]);
  const aliasesByCanonical = new Map<string, string[]>();
  let replacedCanonicalAlias = false;

  for (const [spoken, canonical] of Object.entries(aliases)) {
    const normalizedCanonical = normalizePlainText(canonical);
    const normalizedSpoken = normalizePlainText(spoken);
    aliasesByCanonical.set(normalizedCanonical, [
      ...(aliasesByCanonical.get(normalizedCanonical) ?? []),
      normalizedSpoken,
    ]);
  }

  for (const [canonical, spokenVariants] of aliasesByCanonical) {
    if (!spokenVariants.some((variant) => variant.includes(" "))) continue;
    aliasesByCanonical.set(
      canonical,
      spokenVariants.filter((variant) => variant.includes(" ")),
    );
  }

  for (const [canonical, spokenVariants] of aliasesByCanonical) {
    for (const variant of [...variants]) {
      if (!containsTokenPhrase(variant, canonical)) continue;

      for (const spoken of spokenVariants) {
        variants.add(replaceTokenPhrase(variant, canonical, spoken));
        replacedCanonicalAlias = true;
      }
    }
  }

  if (replacedCanonicalAlias) {
    variants.delete(originalPhrase);
  }

  return [...variants];
}

function phraseDistance(text: string, phrase: string): number {
  const textTokens = text.split(" ").filter(Boolean);
  const phraseTokens = phrase.split(" ").filter(Boolean);
  if (!textTokens.length || !phraseTokens.length) {
    return levenshteinDistance(text, phrase);
  }

  const candidateLengths = new Set([
    phraseTokens.length,
    phraseTokens.length - 1,
    phraseTokens.length + 1,
  ]);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateLength of candidateLengths) {
    if (candidateLength < 1 || candidateLength > textTokens.length) continue;

    for (let start = 0; start <= textTokens.length - candidateLength; start += 1) {
      const candidateTokens = textTokens.slice(start, start + candidateLength);
      const firstTokenDistance = levenshteinDistance(candidateTokens[0], phraseTokens[0]);
      if (firstTokenDistance > 1) continue;

      bestDistance = Math.min(bestDistance, levenshteinDistance(candidateTokens.join(" "), phrase));
    }
  }

  return Number.isFinite(bestDistance) ? bestDistance : levenshteinDistance(text, phrase);
}

function hasUnsafeVerbPrefix(text: string, phrase: string): boolean {
  const [textVerb] = text.split(" ");
  const [phraseVerb] = phrase.split(" ");
  if (!textVerb || !phraseVerb || textVerb === phraseVerb) return false;

  return (
    textVerb === `вы${phraseVerb}` ||
    phraseVerb === `вы${textVerb}` ||
    (phraseVerb.startsWith("в") && textVerb === `вы${phraseVerb.slice(1)}`) ||
    (textVerb.startsWith("в") && phraseVerb === `вы${textVerb.slice(1)}`)
  );
}

function toMatch(
  entry: { command: VoiceCommand; phrase: string; normalizedPhrase: string },
  kind: CommandMatch["kind"],
  distance: number,
  normalizedText: string,
): CommandMatch {
  return {
    command: entry.command,
    phrase: entry.phrase,
    kind,
    distance,
    normalizedText,
    normalizedPhrase: entry.normalizedPhrase,
  };
}

function containsTokenPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function replaceTokenPhrase(text: string, from: string, to: string): string {
  return normalizePlainText(` ${text} `.replace(new RegExp(` ${escapeRegExp(from)} `, "gu"), ` ${to} `));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
