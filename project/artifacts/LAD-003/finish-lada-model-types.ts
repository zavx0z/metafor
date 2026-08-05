import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const address = "zavx0z/lada-model";
const before = await Bun.file("cluster/zavx0z/lada-model/actions/chat.ts").text();
const marker = "export default runOllamaChat;\n";
const start = before.indexOf(marker);
if (start < 0 || before.indexOf(marker, start + marker.length) >= 0) {
  throw new Error("Model default export marker is absent or duplicated.");
}
const after = before.slice(0, start) + `export default function runOllamaChatProcess(
  input: InferenceChatActionParams & { energy?: unknown; field?: unknown; self?: unknown },
) {
  return runOllamaChat(input);
}
` + before.slice(start + marker.length);
new Bun.Transpiler({ loader: "ts" }).transformSync(after);

const transport = new BaseMonadTransport("codex/lada", "http://127.0.0.1:4000/");
await transport.open({ waitMs: 5_000 });
const peer = new MonadRpcPeer(transport.channel);

try {
  const source = await peer.call("dark", "meta.source.revision.read", {
    contractVersion: 1,
    capability: "meta.source.read",
    addresses: [address],
  }, { waitMs: 5_000 }) as { sources: Array<{ revision: string }> };
  const result = await peer.call("dark", "meta.declaration.apply", {
    contractVersion: 1,
    operationId: "lada-model-system-persona-types-v2",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address,
    key: "обращение к модели",
    process: {
      key: "обращение к модели",
      type: "action",
      label: "Подготовить ответ локальной Ollama с system persona",
      env: ["server"],
      artifact: {
        path: "actions/chat.ts",
        revision: `sha256:${new Bun.CryptoHasher("sha256").update(before).digest("hex")}`,
        exportName: "default",
        source: after,
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
    revisions: [{ address, revision: source.sources[0]!.revision }],
  }, { waitMs: 30_000 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  peer.close();
  await transport.close();
}
