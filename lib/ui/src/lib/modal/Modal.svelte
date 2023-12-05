<script lang="ts">
    import {CloseIcon} from "@lib/icons"

    export let closeRedirect: string = '/'
</script>

<div class="bg-surface-900/40 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-3xl">
    <slot/>
    <a
            href={closeRedirect}
            class="bg-surface-900 text-primary-500 hover:bg-surface-800 hover:text-primary-400 fixed right-2 top-2 flex h-10 w-10 items-center justify-center rounded-3xl"
    >
        <CloseIcon/>
    </a>
</div>
