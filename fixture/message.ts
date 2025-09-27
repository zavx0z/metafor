import { afterAll } from "bun:test"
import { type Message } from "../core/index.t"

export const messagesFixture = (options?: {
  meta: string
}): {
  messages: Message[]
  onmessage: (cb: (message: Message) => void) => void
  waitForMessages: (delay?: number) => Promise<Message[]>
} => {
  const channel = new BroadcastChannel("channel")
  afterAll(() => channel.close())
  const messages: Message[] = []

  channel.addEventListener("message", ({ data }) => {
    if (!options?.meta || data.meta === options.meta) {
      messages.push(data)
    }
  })
  const onmessage = (cb: (message: Message) => void) => {
    channel.addEventListener("message", ({ data }) => {
      if (!options?.meta || data.meta === options.meta) {
        cb(data)
      }
    })
  }

  const waitForMessages = async (delay = 1000): Promise<Message[]> => {
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

      channel.addEventListener("message", ({ data }: MessageEvent) => {
        if (!options?.meta || data.meta === options.meta) {
          updateLastMessageTime()
        }
      })
      checkMessages()
    })
  }

  return { messages, onmessage, waitForMessages }
}
