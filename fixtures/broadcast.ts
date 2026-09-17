import {afterAll} from "bun:test"

export const messagesFixture = (options?: {atom: string}): {
  messages: BroadcastMessage[]
  onmessage: (cb: (message: BroadcastMessage) => void) => void
  waitForMessages: (delay?: number) => Promise<BroadcastMessage[]>
} => {
  const channel = new BroadcastChannel("channel")
  afterAll(() => channel.close())
  const messages: BroadcastMessage[] = []
  
  channel.addEventListener("message", ({data}) => {
    if (!options?.atom || data.meta?.atom === options.atom) {
      messages.push(data)
    }
  })
  
  const onmessage = (cb: (message: BroadcastMessage) => void) => {
    channel.addEventListener("message", ({data}) => {
      if (!options?.atom || data.meta?.atom === options.atom) {
        cb(data)
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
        setTimeout(checkMessages, 100)
      }

      const messageHandler = ({data}: MessageEvent) => {
        if (!options?.atom || data.meta?.atom === options.atom) {
          lastMessageTime = Date.now()
        }
      }
      
      channel.addEventListener("message", messageHandler)
      checkMessages()
    })
  }

  return {messages, onmessage, waitForMessages}
}
