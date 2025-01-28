<script lang="ts">
    import { classnames } from '$lib/util.js';
    import Portal from '$lib/Portal.svelte';
    import { afterUpdate, onMount } from 'svelte';
    import { hasOwnProperty } from '$lib/util.js';

    export let isOpen;
    export let toggle: () => void;
    export let autoFocus = true;
    export let returnFocusAfterClose = true;
    export let responsive = true;
    export let backdropClickable = false;
    let className = '';
    export { className as class };
    export let modalClass = '';

    let modalElement: HTMLDivElement;
    let triggeringElement: Element | null;
    let hasOpened = false;
    let lastIsOpen = isOpen;
    let lastHasOpened = hasOpened;

    onMount(() => {
        if (isOpen) {
            init();

            hasOpened = true;
        }

        if (hasOpened && autoFocus) {
            focusModal();
        }

        return () => {
            if (hasOpened) {
                close();
            }
        };
    });

    afterUpdate(() => {
        if (isOpen && !lastIsOpen) {
            init();

            hasOpened = true;
        }

        if (autoFocus && hasOpened && !lastHasOpened) {
            focusModal();
        }

        if (!isOpen && lastIsOpen) {
            hasOpened = false;
        }

        lastIsOpen = isOpen;
        lastHasOpened = hasOpened;
    });

    function init() {
        try {
            triggeringElement = document.activeElement;
        } catch (err) {
            triggeringElement = null;
        }
    }

    function close() {
        if (triggeringElement) {
            if (
                hasOwnProperty(triggeringElement, 'focus') &&
                typeof triggeringElement.focus === 'function' &&
                returnFocusAfterClose
            ) {
                triggeringElement.focus();
            }

            triggeringElement = null;
        }
    }

    function focusModal() {
        if (modalElement) {
            try {
                modalElement.focus();
            } catch (err) {
                console.log(err);
            }
        }
    }

    function onBackdropClick(e: MouseEvent) {
        if (e.target === modalElement && backdropClickable) {
            toggle();
        }
    }

    $: modalClasses = classnames('modal', modalClass, {
        'modal-bottom sm:modal-middle': responsive,
        'modal-open': isOpen
    });
    $: classes = classnames('modal-box', className);
</script>

<Portal role="dialog" aria-modal="true">
    <div bind:this={modalElement} tabindex="0" class={modalClasses} on:click={onBackdropClick}>
        {#if isOpen}
            <div class={classes}>
                <slot />
            </div>
        {/if}
    </div>
</Portal>
