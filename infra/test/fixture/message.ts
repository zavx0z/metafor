import { afterAll } from "bun:test"
import { type Photon } from "../../../atom/em"

export const messagesFixture = (options?: {
  meta: string
}): {
  messages: Photon[]
  onmessage: (cb: (message: Photon) => void) => void
  waitForMessages: (delay?: number) => Promise<Photon[]>
} => {
  const channel = new BroadcastChannel("electromagnetic")
  afterAll(() => channel.close())
  const messages: Photon[] = []

  channel.addEventListener("message", ({ data }) => {
    if (!options?.meta || data.meta === options.meta) {
      messages.push(data)
    }
  })
  const onmessage = (cb: (message: Photon) => void) => {
    channel.addEventListener("message", ({ data }) => {
      if (!options?.meta || data.meta === options.meta) {
        cb(data)
      }
    })
  }

  const waitForMessages = async (delay = 1000): Promise<Photon[]> => {
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
