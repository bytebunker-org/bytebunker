/** Synthetic lookalikes of the Airbnb export's json/ files. Ids, names and texts are made up. */

export const OWNER_ID = '1001';

export const RESERVATIONS_FILE = [
    {
        bookingSessions: [{ createdAt: '2021-03-01T10:00:00.000Z', homeInquiries: [] }],
        reservations: [
            {
                confirmationCode: 'HMTESTAAA1',
                status: 'accepted',
                startDate: '2021-07-10',
                nights: 3,
                hostingUrl: 'https://www.airbnb.com/rooms/555001',
                hostProfileUrl: 'https://www.airbnb.com/users/show/2002',
                guestProfileUrl: 'https://www.airbnb.com/users/show/1001',
                guestCurrency: 'EUR',
                guestCheckinTimeFrom: 15,
                guestCheckinTimeTo: 20,
                numberOfGuests: 2,
                numberOfAdults: 2,
                message: 'Hello, we arrive by train.',
                createdAt: '2021-06-01T08:30:00.000Z',
            },
            {
                confirmationCode: 'HMTESTBBB2',
                status: 'cancelled',
                startDate: '2022-01-05',
                nights: 1,
                hostingUrl: 'https://www.airbnb.com/rooms/555002',
                numberOfGuests: 1,
                createdAt: '2021-12-01T08:30:00.000Z',
                canceledAt: '2021-12-20T09:00:00.000Z',
            },
            {
                confirmationCode: 'HMTESTCCC3',
                status: 'accepted',
                startDate: '2022-03-26',
                nights: 2,
                numberOfGuests: 1,
            },
        ],
    },
];

export const SEARCH_HISTORY_FILE = [
    {
        servicedata: [
            {
                timeofsearch: '2024-08-27 20:39:27',
                rawlocation: 'Testville, Exampleland',
                city: 'Testville',
                state: 'Testshire',
                country: 'Exampleland',
                searchlocationlatitude: 49.5,
                searchlocationlongitude: 6.5,
                checkindate: '2024-08-27',
                checkoutdate: '2024-08-28',
                numberofnights: 1,
                numberofguests: 2,
            },
            { timeofsearch: '2024-08-27 15:31:14', numberofnights: 0, numberofguests: 1 },
            { timeofsearch: 'not a date', rawlocation: 'Nowhere' },
        ],
    },
];

const asset = (id: number, accountId: number | undefined, createdAt: string, contentType: string) => ({
    id,
    createdAt,
    accountType: accountId === undefined ? 'service' : 'user',
    ...(accountId === undefined ? {} : { accountId }),
    contentType,
});

export const MESSAGES_FILE = [
    {
        messageThreads: [
            {
                id: 9001,
                messageThreadParticipants: [
                    { accountId: 1001, accountType: 'user' },
                    { accountId: 2002, accountType: 'user' },
                ],
                messagesAndContents: [
                    {
                        message: asset(1, 1001, '2021-06-01T08:31:00.000Z', 'TextContent'),
                        messageContent: { textContent: { body: 'Is parking available?' } },
                    },
                    {
                        message: asset(2, 2002, '2021-06-01T09:00:00.000Z', 'TextAndReferenceContent'),
                        messageContent: {
                            textAndReferenceContent: {
                                text: 'Yes, in the yard.',
                                referenceType: 'home_booking',
                                referenceId: '777',
                            },
                        },
                    },
                    {
                        message: asset(3, undefined, '2021-06-01T09:05:00.000Z', 'EventDescriptionContent'),
                        messageContent: { eventDescriptionContent: { eventType: 'trust_education' } },
                    },
                    {
                        message: asset(4, 1001, '2021-06-02T09:05:00.000Z', 'MessageContent'),
                        messageContent: { messageContentV2: { content: 'Great, thanks.' } },
                    },
                    { message: asset(5, 1001, '2021-06-02T09:06:00.000Z', 'StartAssetUploadContent') },
                    { message: asset(6, 1001, '2021-06-02T09:06:01.000Z', 'FinishAssetUploadContent') },
                    { message: asset(7, 2002, '2021-06-02T09:07:00.000Z', 'InvalidationContent') },
                    {
                        message: asset(8, 2002, '2021-06-02T09:08:00.000Z', 'TextAndReferenceContent'),
                        messageContent: {
                            textAndReferenceContent: { text: '', referenceType: 'home_booking', referenceId: '778' },
                        },
                    },
                ],
            },
            {
                id: 9002,
                messageThreadParticipants: [
                    { accountId: 1001, accountType: 'user' },
                    { accountId: 3003, accountType: 'user' },
                    { accountId: 4004, accountType: 'user' },
                ],
                messagesAndContents: [
                    {
                        message: asset(11, 3003, '2022-01-01T10:00:00.000Z', 'TextContent'),
                        messageContent: { textContent: { body: 'Group hello' } },
                    },
                    {
                        message: asset(12, 1001, '2022-01-01T10:05:00.000Z', 'TextContent'),
                        messageContent: { textContent: { body: 'Group reply' } },
                    },
                ],
            },
            {
                id: 9003,
                messageThreadParticipants: [{ accountId: 1001, accountType: 'user' }, { accountType: 'service' }],
            },
        ],
    },
];

export const SINGLE_THREAD_MESSAGES_FILE = [
    {
        messageThreads: [
            {
                id: 9100,
                messageThreadParticipants: [{ accountId: 1001 }, { accountId: 2002 }],
                messagesAndContents: [
                    {
                        message: asset(21, 1001, '2023-05-01T10:00:00.000Z', 'TextContent'),
                        messageContent: { textContent: { body: 'Only thread' } },
                    },
                ],
            },
        ],
    },
];

export const REVIEWS_FILE = [
    {
        reviewsReceived: [
            {
                reviewCategoryRatings: [
                    { ratingCategory: 'COMMUNICATION', ratingV2: 5 },
                    { ratingCategory: 'CLEANLINESS', ratingV2: 4 },
                ],
                review: {
                    reviewId: 5001,
                    reviewerId: 2002,
                    revieweeId: 1001,
                    reviewerRole: 'HOST',
                    revieweeRole: 'GUEST',
                    comment: 'Pleasant guest.',
                    commentLanguage: 'en',
                    rating: 5,
                    isEntityRecommended: true,
                    submittedAt: '2021-07-14T10:00:00.000Z',
                    createdAt: '2021-07-13T10:00:00.000Z',
                },
            },
            {
                review: {
                    reviewId: 5002,
                    reviewerId: 2002,
                    revieweeId: 1001,
                    comment: 'No submit date',
                    createdAt: '2021-08-01T10:00:00.000Z',
                },
            },
            { review: { reviewId: 5003, comment: 'No date at all' } },
        ],
        reviewsWritten: [
            {
                review: {
                    reviewId: 6001,
                    reviewerId: 1001,
                    revieweeId: 3003,
                    reviewerRole: 'GUEST',
                    revieweeRole: 'HOST',
                    comment: 'Lovely place.',
                    rating: 5,
                    submittedAt: '2021-07-15T10:00:00.000Z',
                },
            },
        ],
    },
];

export const WISHLISTS_FILE = [{ wishlistData: [{ name: 'Someday' }], proactiveWishlistUserStateData: [] }];
