import type { WhatsAppMessageKind } from '@bytebunker/event-schema/extension/whatsapp';

/** Extra properties on the `Create` + `Message` activities this importer emits. */
export interface WhatsAppMessageActivityInterface {
    /** `whatsapp:<chat name>`. Groups have no `target`; the conversation id ties their messages together. */
    conversationId: string;
    chatName: string;
    isGroupChat: boolean;
    direction: 'incoming' | 'outgoing';
    messageKind: WhatsAppMessageKind;
    edited: boolean;
    deleted: boolean;
    mediaFileName?: string;
    sharedLatitude?: number;
    sharedLongitude?: number;
}
