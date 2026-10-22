/**
 * Raw shapes of the Airbnb "Request your personal data" export (`json/*.json`). Every file is an array with a
 * single object. Only the fields bytebunker reads are typed; everything else is still present at runtime.
 */

export interface AirbnbReservation {
    confirmationCode: string;
    status: string;
    startDate: string;
    nights: number;
    hostingUrl?: string;
    hostProfileUrl?: string;
    guestProfileUrl?: string;
    guestCurrency?: string;
    guestVatCountry?: string;
    guestCheckinTimeFrom?: number;
    guestCheckinTimeTo?: number;
    numberOfGuests?: number;
    numberOfAdults?: number;
    numberOfChildren?: number;
    numberOfInfants?: number;
    numberOfPets?: number;
    isBringingPets?: boolean;
    message?: string;
    createdAt?: string;
    updatedAt?: string;
    canceledAt?: string;
    hostRespondeAt?: string;
}

export interface AirbnbReservationsFile {
    reservations?: AirbnbReservation[];
    bookingSessions?: unknown[];
}

export interface AirbnbSearch {
    timeofsearch: string;
    rawlocation?: string;
    city?: string;
    state?: string;
    country?: string;
    searchlocationlatitude?: number;
    searchlocationlongitude?: number;
    checkindate?: string;
    checkoutdate?: string;
    numberofnights?: number;
    numberofguests?: number;
}

export interface AirbnbSearchHistoryFile {
    servicedata?: AirbnbSearch[];
}

export interface AirbnbMessage {
    message: {
        id: number;
        createdAt: string;
        accountId?: number;
        accountType?: string;
        contentType?: string;
        isPrivate?: boolean;
    };
    messageContent?: {
        textContent?: { body?: string };
        textAndReferenceContent?: { text?: string; referenceId?: string; referenceType?: string };
        messageContentV2?: { content?: string };
        eventDescriptionContent?: { eventType?: string };
    };
}

export interface AirbnbMessageThread {
    id: number;
    messagesAndContents?: AirbnbMessage[];
    messageThreadParticipants?: { accountId: number; accountType?: string }[];
}

export interface AirbnbMessagesFile {
    messageThreads?: AirbnbMessageThread[];
}

export interface AirbnbReview {
    reviewCategoryRatings?: { ratingCategory: string; ratingV2: number }[];
    review: {
        reviewId: number;
        reviewerId?: number;
        revieweeId?: number;
        reviewerRole?: string;
        revieweeRole?: string;
        comment?: string;
        commentLanguage?: string;
        rating?: number;
        isEntityRecommended?: boolean;
        submittedAt?: string;
        createdAt?: string;
    };
}

export interface AirbnbReviewsFile {
    reviewsReceived?: AirbnbReview[];
    reviewsWritten?: AirbnbReview[];
}

export enum AirbnbExportFileKindEnum {
    RESERVATIONS = 'reservations',
    SEARCH_HISTORY = 'searchHistory',
    MESSAGES = 'messages',
    REVIEWS = 'reviews',
    UNSUPPORTED = 'unsupported',
}
