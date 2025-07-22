import {afterAll} from "bun:test"
import {type BroadcastMessage} from "../message/index.t"

export const messagesFixture = (options?: {
  meta: string
}): {
  messages: BroadcastMessage[]
  onmessage: (cb: (message: BroadcastMessage) => void) => void
  waitForMessages: (delay?: number) => Promise<BroadcastMessage[]>
} => {
  const channel = new BroadcastChannel("channel")
  afterAll(() => channel.close())
  const messages: BroadcastMessage[] = []

  channel.addEventListener("message", ({data}) => {
    if (!options?.meta || data.meta?.tag === options.meta) {
      messages.push(data)
    }
  })
  // @ts-ignore
  document.addEventListener('channel', ({detail}: CustomEvent) => {
    if (!options?.meta || detail.meta?.tag === options.meta) {
      messages.push(detail)
    }
  })
  const onmessage = (cb: (message: BroadcastMessage) => void) => {
    channel.addEventListener("message", ({data}) => {
      if (!options?.meta || data.meta?.tag === options.meta) {
        cb(data)
      }
    })
    // @ts-ignore
    document.addEventListener('channel', ({detail}: CustomEvent) => {
      if (!options?.meta || detail.meta?.tag === options.meta) {
        cb(detail)
      }
    })
  }

  const waitForMessages = async (delay = 1000): Promise<BroadcastMessage[]> => {
    let lastMessageTime = Date.now()

    return new Promise((resolve) => {
      const checkMessages = () => {
        const now = Date.now()
        if (now - lastMessageTime >= delay) {
          resolve(messages)
          return
        }
        setTimeout(checkMessages, 50)
      }

      const updateLastMessageTime = () => {
        lastMessageTime = Date.now()
      }

      channel.addEventListener("message", ({data}: MessageEvent) => {
        if (!options?.meta || data.meta?.tag === options.meta) {
          updateLastMessageTime()
        }
      })
      // @ts-ignore
      document.addEventListener('channel', ({detail}: CustomEvent) => {
        if (!options?.meta || detail.meta?.tag === options.meta) {
          updateLastMessageTime()
        }
      })
      checkMessages()
    })
  }

  return {messages, onmessage, waitForMessages}
}
