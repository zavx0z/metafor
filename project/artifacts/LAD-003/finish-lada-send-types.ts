import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const ROOT = "zavx0z/lada";
const MODEL = "zavx0z/lada-model";

const digest = (source: string): string =>
  `sha256:${new Bun.CryptoHasher("sha256").update(source).digest("hex")}`;

const replaceExact = (source: string, before: string, after: string): string => {
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one source range: ${before}`);
  }
  return source.slice(0, start) + after + source.slice(start + before.length);
};

const considerBefore = await Bun.file("cluster/zavx0z/lada/actions/consider-message.ts").text();
const considerAfter = replaceExact(
  considerBefore,
  "export default considerIncomingMessage;\n",
  `export default function considerIncomingMessageProcess(
  input: Params & { energy?: unknown; field?: unknown; mass?: unknown; self?: unknown },
) {
  return considerIncomingMessage(input);
}
`,
);

const modelBefore = await Bun.file("cluster/zavx0z/lada-model/actions/chat.ts").text();
const modelAfter = replaceExact(
  modelBefore,
  "export default runOllamaChat;\n",
  `export default function runOllamaChatProcess(
  input: InferenceChatActionParams & { energy?: unknown; field?: unknown; self?: unknown },
) {
  return runOllamaChat(input);
}
`,
);

for (const source of [considerAfter, modelAfter]) {
  new Bun.Transpiler({ loader: "ts" }).transformSync(source);
}

if (process.env.LADA_SEND_DRY_RUN === "1") {
  console.log(JSON.stringify({
    consider: { before: digest(considerBefore), after: digest(considerAfter) },
    model: { before: digest(modelBefore), after: digest(modelAfter) },
  }, null, 2));
  process.exit(0);
}

const transport = new BaseMonadTransport("codex/lada", "http://127.0.0.1:4000/");
await transport.open({ waitMs: 5_000 });
const peer = new MonadRpcPeer(transport.channel);

const revision = async (address: string): Promise<string> => {
  const result = await peer.call("dark", "meta.source.revision.read", {
    contractVersion: 1,
    capability: "meta.source.read",
    addresses: [address],
  }, { waitMs: 5_000 }) as { sources: Array<{ revision: string }> };
  return result.sources[0]!.revision;
};

const apply = async (request: Record<string, unknown>): Promise<void> => {
  const result = await peer.call("dark", "meta.declaration.apply", request, { waitMs: 30_000 });
  console.log(JSON.stringify({ operationId: request.operationId, result }, null, 2));
};

try {
  await apply({
    contractVersion: 1,
    operationId: "lada-reply-cause-consider-types-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: ROOT,
    key: "осмысление сообщения",
    process: {
      key: "осмысление сообщения",
      type: "action",
      label: "Сформулировать намерение подготовить ответ",
      env: ["server"],
      artifact: {
        path: "actions/consider-message.ts",
        revision: digest(considerBefore),
        exportName: "default",
        source: considerAfter,
      },
      successSource: `({ data, update }) => update({
        incomingMessageKey: null,
        incomingMessage: null,
        replyToMessageKey: data.messageKey,
        modelPrompt: data.prompt,
        modelError: null,
      })`,
      errorSource: `({ error, update }) => update({
        incomingMessageKey: null,
        incomingMessage: null,
        replyToMessageKey: null,
        modelError: error.message,
      })`,
    },
    revisions: [{ address: ROOT, revision: await revision(ROOT) }],
  });

  await apply({
    contractVersion: 1,
    operationId: "lada-model-system-persona-types-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address: MODEL,
    key: "обращение к модели",
    process: {
      key: "обращение к модели",
      type: "action",
      label: "Подготовить ответ локальной Ollama-моделью",
      env: ["server"],
      artifact: {
        path: "actions/chat.ts",
        revision: digest(modelBefore),
        exportName: "default",
        source: modelAfter,
      },
      successSource: `({ data, update }) => update({
        prompt: null,
        response: data.assistantContent,
        lastMessageId: data.assistantMessageId,
        error: null,
      })`,
      errorSource: `({ error, update }) => update({
        prompt: null,
        error: error.message,
      })`,
    },
    revisions: [{ address: MODEL, revision: await revision(MODEL) }],
  });
} finally {
  peer.close();
  await transport.close();
}
