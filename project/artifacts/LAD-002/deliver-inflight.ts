import { BaseMonadTransport } from "../../../shared/transport/monad/base.ts";
import { MonadRpcPeer } from "../../../shared/transport/monad/peer.ts";

const address = "zavx0z/lada-chat";
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
    operationId: "lada-chat-addressed-inbox-field-delivery-v1",
    capability: "meta.declaration.write",
    entity: "process",
    operation: "replace",
    address,
    key: "ожидание события",
    process: {
      key: "ожидание события",
      type: "action",
      label: "Ожидать следующее адресованное событие",
      env: ["server"],
      successSource: `({ data, update }) => {
        if (data.kind === "disconnected") {
          update({
            connected: false,
            eventReady: false,
            retryReady: false,
            error: "Realtime отключён: " + data.reason + ".",
          });
          return;
        }
        update({
          eventReady: true,
          incomingMessageKey: data.messageKey,
          incomingMessage: data.body,
          error: null,
        });
      }`,
      errorSource: `({ error, update }) => update({
        connected: false,
        eventReady: false,
        retryReady: false,
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
