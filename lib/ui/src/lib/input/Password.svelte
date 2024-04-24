<script context="module">
    let counter = 0
</script>

<script>

    import {NotVisibleIcon, VisibleIcon} from "@lib/icons"

    export let visible = false
    export let password = ''
    let eltId = 'password_' + counter++
</script>

<fieldset>
    <label for={eltId}>Пароль</label>
    <span class="relative">
		<div class="absolute inset-y-0 right-0 flex items-center pr-2">
			<button
                    tabindex="-1"
                    title={visible ? 'скрыть пароль' : 'показать пароль'}
                    type={'button'}
                    on:click|preventDefault={() => (visible = !visible)}
                    class="focus:shadow-outline text-primary-700 hover:text-primary-500 p-1 transition-colors focus:outline-none"
            >
				{#if visible}
					<span class="h-6 w-6 stroke-current">
						<NotVisibleIcon/>
					</span>
				{:else}
					<span class="h-6 w-6 stroke-current">
						<VisibleIcon/>
					</span>
				{/if}
			</button>
		</div>
		<input
                id={eltId}
                placeholder="пароль"
                {...{type: visible ? 'text' : 'password'}}
                name="password"
                bind:value={password}
                required
                class="mb-4"
        />
	</span>
</fieldset>
