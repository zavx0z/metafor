<script lang="ts">
  import { TelegramClient } from "telegram"
  import { StringSession } from "telegram/sessions"

  const SESSION = new StringSession("")
  const API_ID = 21841338
  const API_HASH = "2a4ae81576e2a13adf409ee79a18956e"
  let phoneNumber = $state("")
  let password = $state("")
  let phoneCode = $state("")

  const client = new TelegramClient(SESSION, API_ID, API_HASH, { connectionRetries: 5 })
  async function sendCodeHandler(): Promise<void> {
    await client.connect()
    await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phoneNumber)
  }
  async function clientStartHandler(): Promise<void> {
    await client.start({
      phoneNumber,
      password: userAuthParamCallback(password),
      phoneCode: userAuthParamCallback(phoneCode),
      onError: () => {},
    })
    await client.sendMessage("me", { message: "You're successfully logged in!" })
  }
  function userAuthParamCallback<T>(param: T): () => Promise<T> {
    return async function () {
      return await new Promise<T>((resolve) => {
        resolve(param)
      })
    }
  }
</script>

<input class="text-surface-50" type="text" name="phoneNumber" bind:value={phoneNumber} />
<input class="text-surface-50" type="text" name="password" bind:value={password} />
<button onclick={sendCodeHandler}>Start</button>
<input class="text-surface-50" type="text" name="phoneCode" bind:value={phoneCode} />
<button onclick={clientStartHandler}>Insert code</button>
