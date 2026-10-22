/** Synthetic WhatsApp exports with fake names and text, one per header format. */

export const NNBSP = '\u202F';
export const LRM = '\u200E';
const BOM = '\uFEFF';

export const ANDROID_US = `1/2/26, 9:05 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.
1/2/26, 9:05 - Alice Example is a contact
1/2/26, 9:06 - Alice Example: Hello there
1/2/26, 9:07 - Bob Sample: Hi Alice
second line of Bob's message

fourth line after a blank one
1/13/26, 18:30 - Alice Example: <Media omitted>
1/13/26, 18:31 - Bob Sample: You deleted this message
1/13/26, 18:32 - Alice Example: This message was deleted
1/13/26, 18:33 - Bob Sample: Fixed the typo <This message was edited>
1/13/26, 18:34 - Alice Example: IMG-20260113-WA0001.jpg (file attached)
look at this
1/13/26, 18:35 - Alice Example: location: https://maps.google.com/?q=48.137154,11.576124
1/13/26, 18:36 - Bob Sample: Carol Contact.vcf (file attached)
1/13/26, 18:37 - Alice Example: POLL:
Lunch?
OPTION: Pizza (2 votes)
OPTION: Sushi (1 vote)
1/13/26, 18:38 - Missed voice call
1/13/26, 18:39 - Your security code with Alice Example changed. Tap to learn more.
1/13/26, 18:40 - You changed the subject to “Plans: weekend”
`;

export const ANDROID_DE = `02.01.26, 09:05 - Nachrichten und Anrufe sind Ende-zu-Ende-verschlüsselt. Niemand außerhalb dieses Chats kann sie lesen.
02.01.26, 09:06 - Alice Example: Hallo
02.01.26, 09:07 - Bob Sample: Hi Alice
zweite Zeile
13.01.26, 18:30 - Alice Example: <Medien ausgeschlossen>
13.01.26, 18:31 - Bob Sample: Du hast diese Nachricht gelöscht
13.01.26, 18:32 - Alice Example: Diese Nachricht wurde gelöscht
13.01.26, 18:33 - Bob Sample: Tippfehler korrigiert <Diese Nachricht wurde bearbeitet>
13.01.26, 18:34 - Alice Example: IMG-20260113-WA0001.jpg (Datei angehängt)
schau mal
13.01.26, 18:35 - Alice Example: Standort: https://maps.google.com/?q=48.137154,11.576124
13.01.26, 18:36 - Verpasster Sprachanruf
`;

export const IOS_DE = `${LRM}[02.01.26, 09:05:11] Alice Example: ${LRM}Hallo
[02.01.26, 09:07:40] Bob Sample: Hi Alice
zweite Zeile
[13.01.26, 18:30:02] Alice Example: ${LRM}Bild weggelassen
[13.01.26, 18:34:10] Alice Example: ${LRM}<Anhang: 00000012-PHOTO-2026-01-13-18-34-10.jpg>
[13.01.26, 18:35:00] ${LRM}Bob Sample: ${LRM}Du hast diese Nachricht gelöscht.
[13.01.26, 18:36:00] Bob Sample: Tippfehler korrigiert ${LRM}<Diese Nachricht wurde bearbeitet>
`;

export const IOS_US_12H = `${BOM}${LRM}[1/2/26, 9:05:11${NNBSP}AM] Alice Example: ${LRM}Hello there
[1/2/26, 9:07:40${NNBSP}AM] Bob Sample: Hi Alice
[1/13/26, 6:30:02${NNBSP}PM] Alice Example: ${LRM}image omitted
[1/13/26, 12:05:00${NNBSP}AM] Bob Sample: midnight
[1/13/26, 12:05:00${NNBSP}PM] Bob Sample: noon
[1/13/26, 6:34:10${NNBSP}PM] Alice Example: ${LRM}<attached: 00000012-PHOTO-2026-01-13-18-34-10.jpg>
[1/13/26, 6:36:00${NNBSP}PM] Bob Sample: ${LRM}This message was deleted.
`;

export const ANDROID_US_12H_4DIGIT_YEAR = `1/2/2026, 9:05${NNBSP}AM - Alice Example: Hello there
1/2/2026, 9:07${NNBSP}pm - Bob Sample: Hi Alice
`;

/** Both numbers are at most 12 in every header: the slash order is a guess (US default). */
export const AMBIGUOUS_SLASH = `3/4/26, 9:05 - Alice Example: one
3/4/26, 9:06 - Bob Sample: two
`;

export const NOT_A_CHAT = `just some text
with no headers
`;

/** Three senders make a group chat. */
export const GROUP_CHAT = `1/13/26, 9:06 - Alice Example: Hello group
1/13/26, 9:07 - Bob Sample: Hi
1/13/26, 9:08 - Dan Demo: Hey
1/13/26, 9:09 - +49 151 2345678: Who is this
`;

/** Identical text at the same minute from the same sender. */
export const REPEATED = `1/13/26, 9:06 - Alice Example: ok
1/13/26, 9:06 - Alice Example: ok
1/13/26, 9:06 - Bob Sample: ok
`;

/** The same messages in two locales, for key stability. Android US 24h vs German iOS with seconds. */
export const SAME_CHAT_US = `1/13/26, 9:06 - Alice Example: Hello
1/13/26, 9:07 - Bob Sample: Hi
1/13/26, 9:08 - Alice Example: <Media omitted>
1/13/26, 9:09 - Bob Sample: Fixed <This message was edited>
`;

export const SAME_CHAT_IOS_DE = `[13.01.26, 09:06:12] Alice Example: Hello
[13.01.26, 09:07:40] Bob Sample: Hi
[13.01.26, 09:08:01] Alice Example: ${LRM}Bild weggelassen
[13.01.26, 09:09:59] Bob Sample: Fixed ${LRM}<Diese Nachricht wurde bearbeitet>
`;

/** Wall times around the 2026 spring-forward (Europe/Berlin, 29 March 02:00 -> 03:00) and fall-back (25 Oct). */
export const DST_CHAT = `3/28/26, 23:59 - Alice Example: before
3/29/26, 01:59 - Alice Example: last winter minute
3/29/26, 03:00 - Alice Example: first summer minute
10/25/26, 01:30 - Alice Example: summer
10/25/26, 03:30 - Alice Example: winter
`;
