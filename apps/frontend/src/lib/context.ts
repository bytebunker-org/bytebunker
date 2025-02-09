import type { UserSessionDto, SupportedLocale } from '@bytebunker/backend';
import { getContext, setContext } from 'svelte';
import type { ModalContext } from '$lib/components/modal/modalRegistry.js';

export const LOCALE_CONTEXT_KEY = 'LOCALE_CONTEXT_KEY';
export const useLocaleContext = () => getContext<SupportedLocale>(LOCALE_CONTEXT_KEY);

export const VALIDATION_RESULT_CONTEXT_KEY = 'VALIDATION_RESULT_CONTEXT_KEY';

export const USER_CONTEXT_KEY = 'USER_CONTEXT_KEY';
export const setUserContext = (user: UserSessionDto) => setContext(USER_CONTEXT_KEY, user);
export const getUserContext = () => getContext<ReturnType<typeof setUserContext>>(USER_CONTEXT_KEY);

export const MODAL_CONTEXT_KEY = 'MODAL_CONTEXT_KEY';
export const setModalContext = (modalContext: ModalContext) =>
	setContext(MODAL_CONTEXT_KEY, () => modalContext);
export const getModalContext = () => getContext<() => ModalContext>(MODAL_CONTEXT_KEY);
