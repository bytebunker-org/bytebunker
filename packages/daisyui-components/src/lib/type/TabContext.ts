import type { Readable } from 'svelte/store';

export interface TabContext {
    activeTabId: Readable<string | undefined>;
    setActiveTab: (tabId: string) => void;
    tabStyle: {
        bordered: boolean;
        lifted: boolean;
        boxed: boolean;
        size: 'xs' | 'sm' | 'md' | 'lg';
    };
}
