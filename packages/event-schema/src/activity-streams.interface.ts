/**
 * Activity Streams 2.0
 * Extended Activity Streams 2.0 Vocabulary
 *
 * @generator Gemini AI, based on https://www.w3.org/ns/activitystreams-owl
 * @see https://www.w3.org/ns/activitystreams
 */

/**
 * Datatypes
 */
// rdf:langString is mapped to string
// xsd:duration is mapped to string (ISO 8601 duration format)

import type { DateTime, Duration } from 'luxon';

/**
 * Union Types
 */
export type ObjectOrLink = ASObject | Link;
export type ImageOrLink = Image | Link;
export type CollectionOrLink = Collection | Link;
export type CollectionPageOrLink = CollectionPage | Link;
export type CollectionPageOrCollectionPageLink = CollectionPage | Link; // Corrected union name
export type ObjectOrLinkOrOrderedItems = ObjectOrLink | OrderedItems;
export type ImageOrLinkOrThing = Image | Link | Thing; // Thing from owl:Thing, assuming it's a basic type if needed
export type LinkOrThing = Link | Thing; // Thing from owl:Thing
export type LangStringOrString = string; // rdf:langString or xsd:string

/**
 * Classes
 */

/**
 * Represents a Social Graph relationship between two Individuals (indicated by the 'a' and 'b' properties)
 * @see https://www.w3.org/ns/activitystreams#Relationship
 */
export interface Relationship extends ASObject {
    '@type': 'Relationship' | string;

    /**
     * On a Relationship object, identifies the subject. e.g. when saying "John is connected to Sally", 'subject' refers to 'John'
     * @see https://www.w3.org/ns/activitystreams#subject
     */
    subject?: ObjectOrLink;

    /**
     * On a Relationship object, describes the type of relationship
     * @see https://www.w3.org/ns/activitystreams#relationship
     */
    relationship?: string; // Assuming rdf:Property is a string URI for property type
}

/**
 * A placeholder for a deleted object
 * @see https://www.w3.org/ns/activitystreams#Tombstone
 */
export interface Tombstone extends ASObject {
    '@type': 'Tombstone' | string;

    /**
     * Specifies the date and time the object was deleted
     * @see https://www.w3.org/ns/activitystreams#deleted
     */
    deleted?: DateTime; // xsd:dateTime

    /**
     * On a Tombstone object, describes the former type of the deleted object
     * @see https://www.w3.org/ns/activitystreams#formerType
     */
    formerType?: ASObject;
}

/**
 * A Profile Document
 * @see https://www.w3.org/ns/activitystreams#Profile
 */
export interface Profile extends ASObject {
    '@type': 'Profile' | string;

    /**
     * On a Profile object, describes the object described by the profile
     * @see https://www.w3.org/ns/activitystreams#describes
     */
    describes?: ASObject;
}

/**
 * An ordered or unordered collection of Objects or Links
 * @see https://www.w3.org/ns/activitystreams#Collection
 */
export interface Collection extends ASObject {
    '@type': 'Collection' | 'CollectionPage' | 'OrderedCollection' | string;

    /**
     * Identifies the current page of a Collection.
     * @see https://www.w3.org/ns/activitystreams#current
     */
    current?: CollectionPageOrLink;

    /**
     * Identifies the first page of the collection.
     * @see https://www.w3.org/ns/activitystreams#first
     */
    first?: CollectionPageOrLink;

    /**
     * Specifies the items contained in a collection.
     * @see https://www.w3.org/ns/activitystreams#items
     */
    items?: ObjectOrLinkOrOrderedItems[]; // Assuming an array for items

    /**
     * Identifies the last page of the collection.
     * @see https://www.w3.org/ns/activitystreams#last
     */
    last?: CollectionPageOrLink;

    /**
     * The total number of items in a logical collection
     * @see https://www.w3.org/ns/activitystreams#totalItems
     */
    totalItems?: number; // xsd:nonNegativeInteger
}

/**
 * A subset of items from a Collection
 * @see https://www.w3.org/ns/activitystreams#CollectionPage
 */
export interface CollectionPage extends Collection {
    '@type': 'CollectionPage' | 'OrderedCollectionPage' | string;

    /**
     * Identifies the next page of a CollectionPage.
     * @see https://www.w3.org/ns/activitystreams#next
     */
    next?: CollectionPageOrCollectionPageLink;

    /**
     * Indicates the page that precedes the current page.
     * @see https://www.w3.org/ns/activitystreams#prev
     */
    prev?: CollectionPageOrCollectionPageLink;

    /**
     * Identifies the Collection to which a CollectionPage objects items belong.
     * @see https://www.w3.org/ns/activitystreams#partOf
     */
    partOf?: CollectionOrLink; // Corrected type to CollectionOrLink
}

/**
 * An ordered subset of items from an OrderedCollection
 * @see https://www.w3.org/ns/activitystreams#OrderedCollectionPage
 */
export interface OrderedCollectionPage extends OrderedCollection, CollectionPage {
    '@type': 'OrderedCollectionPage' | string;

    /**
     * In a strictly ordered logical collection, specifies the index position of the first item in the items list
     * @see https://www.w3.org/ns/activitystreams#startIndex
     */
    startIndex?: number; // xsd:nonNegativeInteger
}

/**
 * A variation of Collection in which items are strictly ordered
 * @see https://www.w3.org/ns/activitystreams#OrderedCollection
 */
export interface OrderedCollection extends Collection {
    '@type': 'OrderedCollection' | 'OrderedCollectionPage' | string;
    // Items is inherited from Collection
}

/**
 * A rdf:List variant for Objects and Links
 * @see https://www.w3.org/ns/activitystreams#OrderedItems
 */
export interface OrderedItems extends Array<ObjectOrLink> {
    // Assuming it's conceptually an array of ObjectOrLink
    '@type'?: 'OrderedItems' | string; // Optional as it's more of a structure than a type with a fixed name.
    // No specific properties defined in RDF, using Array<ObjectOrLink> for representation
}

/**
 * Represents a qualified reference to another resource. Patterned after the RFC5988 Web Linking Model
 * @see https://www.w3.org/ns/activitystreams#Link
 */
export interface Link {
    '@type': 'Link' | 'Mention' | string;

    /**
     * The display height expressed as device independent pixels
     * @see https://www.w3.org/ns/activitystreams#height
     */
    height?: number; // xsd:nonNegativeInteger

    /**
     * The target URI of the Link
     * @see https://www.w3.org/ns/activitystreams#href
     */
    href?: string; // xsd:anyURI

    /**
     * A hint about the language of the referenced resource
     * @see https://www.w3.org/ns/activitystreams#hreflang
     */
    hreflang?: string; // xsd:language

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#id
     */
    id?: string; // xsd:anyURI

    /**
     * The MIME Media Type
     * @see https://www.w3.org/ns/activitystreams#mediaType
     */
    mediaType?: string; // xsd:string

    /**
     * The RFC 5988 or HTML5 Link Relation associated with the Link
     * @see https://www.w3.org/ns/activitystreams#rel
     */
    rel?: string; // xsd:string

    /**
     * Specifies a link to a specific representation of the Object
     * @see https://www.w3.org/ns/activitystreams#url
     */
    url?: LinkOrThing; // as:Link or owl:Thing

    /**
     * Specifies the preferred display width of the content, expressed in terms of device independent pixels.
     * @see https://www.w3.org/ns/activitystreams#width
     */
    width?: number; // xsd:nonNegativeInteger

    /**
     * The default, plain-text display name of the object or link.
     * @see https://www.w3.org/ns/activitystreams#name
     */
    name?: LangStringOrString;
}

/**
 * A specialized Link that represents an @mention
 * @see https://www.w3.org/ns/activitystreams#Mention
 */
export interface Mention extends Link {
    '@type': 'Mention';
}

/**
 * Represents a digital document/file of any sort
 * @see https://www.w3.org/ns/activitystreams#Document
 */
export interface Document extends ASObject {
    '@type': 'Document' | 'Audio' | 'Image' | 'Video' | string;
}

/**
 * An audio file
 * @see https://www.w3.org/ns/activitystreams#Audio
 */
export interface Audio extends Document {
    '@type': 'Audio';
}

/**
 * An Image file
 * @see https://www.w3.org/ns/activitystreams#Image
 */
export interface Image extends Document {
    '@type': 'Image';
}

/**
 * A Video document of any kind.
 * @see https://www.w3.org/ns/activitystreams#Video
 */
export interface Video extends Document {
    '@type': 'Video';
}

/**
 * A Web Page
 * @see https://www.w3.org/ns/activitystreams#Page
 */
export interface Page extends ASObject {
    '@type': 'Page' | string;
}

/**
 * A written work. Typically several paragraphs long. For example, a blog post or a news article.
 * @see https://www.w3.org/ns/activitystreams#Article
 */
export interface Article extends ASObject {
    '@type': 'Article' | string;
}

/**
 * A Short note, typically less than a single paragraph. A "tweet" is an example, or a "status update"
 * @see https://www.w3.org/ns/activitystreams#Note
 */
export interface Note extends ASObject {
    '@type': 'Note' | string;
}

/**
 * A physical or logical location
 * @see https://www.w3.org/ns/activitystreams#Place
 */
export interface Place extends ASObject {
    '@type': 'Place' | string;

    /**
     * Specifies the accuracy around the point established by the longitude and latitude
     * @see https://www.w3.org/ns/activitystreams#accuracy
     * MinInclusive: 0.0
     */
    accuracy?: number; // xsd:float

    /**
     * The altitude of a place
     * @see https://www.w3.org/ns/activitystreams#altitude
     */
    altitude?: number; // xsd:float

    /**
     * The latitude
     * @see https://www.w3.org/ns/activitystreams#latitude
     */
    latitude?: number; // xsd:float

    /**
     * The longitude
     * @see https://www.w3.org/ns/activitystreams#longitude
     */
    longitude?: number; // xsd:float

    /**
     * Specifies a radius around the point established by the longitude and latitude
     * @see https://www.w3.org/ns/activitystreams#radius
     * MinInclusive: 0.0
     */
    radius?: number; // xsd:float

    /**
     * Identifies the unit of measurement used by the radius, altitude and accuracy properties. The value can be expressed either as one of a set of predefined units or as a well-known common URI that identifies units.
     * @see https://www.w3.org/ns/activitystreams#units
     */
    units?: 'inches' | 'feet' | 'miles' | 'cm' | 'm' | 'km' | string; // Union of literals and xsd:anyURI
}

/**
 * An Event of any kind
 * @see https://www.w3.org/ns/activitystreams#Event
 */
export interface Event extends ASObject {
    '@type': 'Event' | string;

    /**
     * The ending time of the object
     * @see https://www.w3.org/ns/activitystreams#endTime
     */
    endTime?: DateTime; // xsd:dateTime

    /**
     * The duration of the object
     * @see https://www.w3.org/ns/activitystreams#duration
     */
    duration?: Duration; // xsd:duration (ISO 8601 duration)

    /**
     * The starting time of the object
     * @see https://www.w3.org/ns/activitystreams#startTime
     */
    startTime?: DateTime; // xsd:dateTime
}

/**
 * A Group of any kind.
 * @see https://www.w3.org/ns/activitystreams#Group
 */
export interface Group extends ASObject {
    '@type': 'Group' | string;
}

/**
 * An Organization
 * @see https://www.w3.org/ns/activitystreams#Organization
 */
export interface Organization extends ASObject {
    '@type': 'Organization' | string;
}

/**
 * A Person
 * @see https://www.w3.org/ns/activitystreams#Person
 */
export interface Person extends ASObject {
    '@type': 'Person' | string;
}

/**
 * Represents a software application of any sort
 * @see https://www.w3.org/ns/activitystreams#Application
 */
export interface Application extends ASObject {
    '@type': 'Application' | string;
}

/**
 * A service provided by some entity
 * @see https://www.w3.org/ns/activitystreams#Service
 */
export interface Service extends ASObject {
    '@type': 'Service' | string;
}

/**
 * The most generic of RDF classes.
 * @see https://www.w3.org/ns/activitystreams#Object
 */
export interface ASObject {
    '@type':
        | 'Object'
        | 'Activity'
        | 'IntransitiveActivity'
        | 'Accept'
        | 'TentativeAccept'
        | 'Add'
        | 'Announce'
        | 'Arrive'
        | 'Block'
        | 'Create'
        | 'Delete'
        | 'Dislike'
        | 'Flag'
        | 'Follow'
        | 'Ignore'
        | 'Invite'
        | 'Join'
        | 'Leave'
        | 'Like'
        | 'Listen'
        | 'Move'
        | 'Offer'
        | 'Question'
        | 'Read'
        | 'Reject'
        | 'TentativeReject'
        | 'Remove'
        | 'Travel'
        | 'Undo'
        | 'Update'
        | 'View'
        | 'Document'
        | 'Audio'
        | 'Image'
        | 'Video'
        | 'Note'
        | 'Article'
        | 'Page'
        | 'Place'
        | 'Event'
        | 'Group'
        | 'Organization'
        | 'Person'
        | 'Application'
        | 'Service'
        | 'Collection'
        | 'CollectionPage'
        | 'OrderedCollectionPage'
        | 'Relationship'
        | 'Tombstone'
        | 'Profile'
        | 'Link'
        | string;

    /**
     * `@type` is not allowed to be an array, to objects to graph database nodes. To still allow extending
     * objects with other jsonld types, use the `@secondaryTypes` field.
     */
    '@secondaryTypes'?: string[];

    /**
     * Subproperty of as:attributedTo that identifies the primary actor
     * @see https://www.w3.org/ns/activitystreams#actor
     */
    actor?: ObjectOrLink | ObjectOrLink[]; // Expecting single or array based on context

    /**
     * Identifies an entity to which an object is attributed
     * @see https://www.w3.org/ns/activitystreams#attributedTo
     */
    attributedTo?: ObjectOrLink | ObjectOrLink[];

    /**
     * Identifies an attached resource
     * @see https://www.w3.org/ns/activitystreams#attachment
     * @see https://www.w3.org/ns/activitystreams#attachments
     */
    attachment?: ObjectOrLink | ObjectOrLink[];
    attachments?: ObjectOrLink | ObjectOrLink[]; // Deprecated equivalent

    /**
     * @deprecated Deprecated. Use as:attributedTo instead
     * Identifies the author of an object.
     * @see https://www.w3.org/ns/activitystreams#author
     */
    author?: ObjectOrLink | ObjectOrLink[];

    /**
     * Identifies recipients of the object who are not primary recipients.
     * @see https://www.w3.org/ns/activitystreams#bcc
     */
    bcc?: ObjectOrLink | ObjectOrLink[];

    /**
     * Identifies primary recipients of the object that would not be exposed to anyone besides the sender and the recipients.
     * @see https://www.w3.org/ns/activitystreams#bto
     */
    bto?: ObjectOrLink | ObjectOrLink[];

    /**
     * Identifies recipients who are primarily responsible aside from the sender.
     * @see https://www.w3.org/ns/activitystreams#cc
     */
    cc?: ObjectOrLink | ObjectOrLink[];

    /**
     * The content of the object.
     * @see https://www.w3.org/ns/activitystreams#content
     */
    content?: LangStringOrString;

    /**
     * Specifies the context within which an object exists or an activity was performed
     * @see https://www.w3.org/ns/activitystreams#context
     */
    context?: ObjectOrLink;

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#downstreamDuplicates
     */
    downstreamDuplicates?: string | string[]; // xsd:anyURI

    /**
     * The duration of the object
     * @see https://www.w3.org/ns/activitystreams#duration
     */
    duration?: Duration; // xsd:duration (ISO 8601 duration)

    /**
     * The ending time of the object
     * @see https://www.w3.org/ns/activitystreams#endTime
     */
    endTime?: DateTime; // xsd:dateTime

    /**
     * Identifies the entity (e.g. an application) that generated the object.
     * @see https://www.w3.org/ns/activitystreams#generator
     */
    generator?: ObjectOrLink;

    /**
     * An icon associated with the object.
     * @see https://www.w3.org/ns/activitystreams#icon
     */
    icon?: ImageOrLink | ImageOrLink[];

    /**
     * An image associated with the object.
     * @see https://www.w3.org/ns/activitystreams#image
     */
    image?: ImageOrLink | ImageOrLink[];

    /**
     * Specifies the object or link in reply to.
     * @see https://www.w3.org/ns/activitystreams#inReplyTo
     */
    inReplyTo?: ObjectOrLink;

    /**
     * Specifies the location of the object.
     * @see https://www.w3.org/ns/activitystreams#location
     */
    location?: ObjectOrLink;

    /**
     * The default, plain-text display name of the object or link.
     * @see https://www.w3.org/ns/activitystreams#name
     */
    name?: LangStringOrString;

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#objectType
     */
    objectType?: string; // xsd:anyURI

    /**
     * Specifies the date and time the object was published
     * @see https://www.w3.org/ns/activitystreams#published
     */
    published?: DateTime; // xsd:dateTime

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#provider
     */
    provider?: ObjectOrLink;

    /**
     * Specifies a preview of the object.
     * @see https://www.w3.org/ns/activitystreams#preview
     */
    preview?: ObjectOrLink;

    /**
     * @deprecated Deprecated
     * A numeric rating (>= 0.0, <= 5.0) for the object
     * @see https://www.w3.org/ns/activitystreams#rating
     * MinInclusive: 0.0
     * MaxInclusive: 5.0
     */
    rating?: number; // xsd:float

    /**
     * Identifies the Collection containing objects replied to by the object
     * @see https://www.w3.org/ns/activitystreams#replies
     */
    replies?: Collection;

    /**
     * A short summary of the object
     * @see https://www.w3.org/ns/activitystreams#summary
     */
    summary?: LangStringOrString;

    /**
     * Tags of the object
     * @see https://www.w3.org/ns/activitystreams#tag
     * @see https://www.w3.org/ns/activitystreams#tags
     */
    tag?: ObjectOrLink | ObjectOrLink[];
    tags?: ObjectOrLink | ObjectOrLink[]; // Deprecated equivalent

    /**
     * Specifies the date and time the object was updated
     * @see https://www.w3.org/ns/activitystreams#updated
     */
    updated?: DateTime; // xsd:dateTime

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#upstreamDuplicates
     */
    upstreamDuplicates?: string | string[]; // xsd:anyURI

    /**
     * Specifies the intended audience(s) of the object
     * @see https://www.w3.org/ns/activitystreams#audience
     */
    audience?: ObjectOrLink | ObjectOrLink[];

    /**
     * Identifies recipients of the object.
     * @see https://www.w3.org/ns/activitystreams#to
     */
    to?: ObjectOrLink | ObjectOrLink[];

    /**
     * Specifies a link to a specific representation of the Object
     * @see https://www.w3.org/ns/activitystreams#url
     */
    url?: LinkOrThing | LinkOrThing[]; // Expecting single or array based on context
}

/**
 * An Object representing some form of Action that has been taken
 * @see https://www.w3.org/ns/activitystreams#Activity
 */
export interface Activity extends ASObject {
    '@type':
        | 'Activity'
        | 'IntransitiveActivity'
        | 'Accept'
        | 'Add'
        | 'Announce'
        | 'Arrive'
        | 'Block'
        | 'Create'
        | 'Delete'
        | 'Dislike'
        | 'Flag'
        | 'Follow'
        | 'Ignore'
        | 'Invite'
        | 'Join'
        | 'Leave'
        | 'Like'
        | 'Listen'
        | 'Move'
        | 'Offer'
        | 'Question'
        | 'Read'
        | 'Reject'
        | 'Remove'
        | 'Travel'
        | 'Undo'
        | 'Update'
        | 'View'
        | string;

    /**
     * Subproperty of as:attributedTo that identifies the primary actor
     * @see https://www.w3.org/ns/activitystreams#actor
     */
    actor?: ObjectOrLink | ObjectOrLink[]; // Overriding to specify it's required for Activity? Or inherited.

    /**
     * Indentifies an object used (or to be used) to complete an activity
     * @see https://www.w3.org/ns/activitystreams#instrument
     */
    instrument?: ObjectOrLink;

    /**
     * For certain activities, specifies the entity from which the action is directed.
     * @see https://www.w3.org/ns/activitystreams#origin
     */
    origin?: ObjectOrLink;

    /**
     * Describes the direct object of the activity. For instance, in the activity "John liked a photo of a cat", the object is "a photo of a cat".
     * @see https://www.w3.org/ns/activitystreams#object
     */
    object?: ObjectOrLink;

    /**
     * Describes the result of performing the object
     * @see https://www.w3.org/ns/activitystreams#result
     */
    result?: ObjectOrLink;

    /**
     * Describes the indirect object, or target of the activity.
     * @see https://www.w3.org/ns/activitystreams#target
     */
    target?: ObjectOrLink;

    /**
     * @deprecated Deprecated
     * @see https://www.w3.org/ns/activitystreams#verb
     */
    verb?: string; // xsd:anyURI
}

/**
 * An Activity that has no direct object
 * @see https://www.w3.org/ns/activitystreams#IntransitiveActivity
 */
export interface IntransitiveActivity extends Activity {
    '@type': 'IntransitiveActivity' | 'Arrive' | 'Question' | 'Travel' | string;
    // object property is restricted to maxCardinality 0, so no 'object' property should be here.
}

/**
 * Actor accepts the Object
 * @see https://www.w3.org/ns/activitystreams#Accept
 */
export interface Accept extends Activity {
    '@type': 'Accept' | 'TentativeAccept' | string;
}

/**
 * Actor tentatively accepts the Object
 * @see https://www.w3.org/ns/activitystreams#TentativeAccept
 */
export interface TentativeAccept extends Accept {
    '@type': 'TentativeAccept';
}

/**
 * To Add an Object or Link to Something
 * @see https://www.w3.org/ns/activitystreams#Add
 */
export interface Add extends Activity {
    '@type': 'Add';
}

/**
 * Actor announces the object to the target
 * @see https://www.w3.org/ns/activitystreams#Announce
 */
export interface Announce extends Activity {
    '@type': 'Announce';
}

/**
 * To Arrive Somewhere (can be used, for instance, to indicate that a particular entity is currently located somewhere, e.g. a "check-in")
 * @see https://www.w3.org/ns/activitystreams#Arrive
 */
export interface Arrive extends IntransitiveActivity {
    '@type': 'Arrive';
}

/**
 * Actor is ignoring the Object
 * @see https://www.w3.org/ns/activitystreams#Ignore
 */
export interface Ignore extends Activity {
    '@type': 'Ignore' | 'Block' | string;
}

/**
 * Actor is blocking the Object
 * @see https://www.w3.org/ns/activitystreams#Block
 */
export interface Block extends Ignore {
    '@type': 'Block';
}

/**
 * To Create Something
 * @see https://www.w3.org/ns/activitystreams#Create
 */
export interface Create extends Activity {
    '@type': 'Create';
}

/**
 * To Delete Something
 * @see https://www.w3.org/ns/activitystreams#Delete
 */
export interface Delete extends Activity {
    '@type': 'Delete';
}

/**
 * The actor dislikes the object
 * @see https://www.w3.org/ns/activitystreams#Dislike
 */
export interface Dislike extends Activity {
    '@type': 'Dislike';
}

/**
 * To Express Interest in Something
 * @see https://www.w3.org/ns/activitystreams#Follow
 */
export interface Follow extends Activity {
    '@type': 'Follow';
}

/**
 * To flag something (e.g. flag as inappropriate, flag as spam, etc)
 * @see https://www.w3.org/ns/activitystreams#Flag
 */
export interface Flag extends Activity {
    '@type': 'Flag';
}

/**
 * To invite someone or something to something
 * @see https://www.w3.org/ns/activitystreams#Invite
 */
export interface Invite extends Offer {
    '@type': 'Invite';
}

/**
 * To Join Something
 * @see https://www.w3.org/ns/activitystreams#Join
 */
export interface Join extends Activity {
    '@type': 'Join';
}

/**
 * To Leave Something
 * @see https://www.w3.org/ns/activitystreams#Leave
 */
export interface Leave extends Activity {
    '@type': 'Leave';
}

/**
 * To Like Something
 * @see https://www.w3.org/ns/activitystreams#Like
 */
export interface Like extends Activity {
    '@type': 'Like';
}

/**
 * The actor listened to the object
 * @see https://www.w3.org/ns/activitystreams#Listen
 */
export interface Listen extends Activity {
    '@type': 'Listen';
}

/**
 * The actor is moving the object. The target specifies where the object is moving to. The origin specifies where the object is moving from.
 * @see https://www.w3.org/ns/activitystreams#Move
 */
export interface Move extends Activity {
    '@type': 'Move';
    /**
     * For certain activities, specifies the entity from which the action is directed.
     * @see https://www.w3.org/ns/activitystreams#origin
     */
    origin?: ObjectOrLink;

    /**
     * Describes the indirect object, or target of the activity.
     * @see https://www.w3.org/ns/activitystreams#target
     */
    target?: ObjectOrLink;
}

/**
 * To Offer something to someone or something
 * @see https://www.w3.org/ns/activitystreams#Offer
 */
export interface Offer extends Activity {
    '@type': 'Offer' | 'Invite' | string;
}

/**
 * A question of any sort.
 * @see https://www.w3.org/ns/activitystreams#Question
 */
export interface Question extends IntransitiveActivity {
    '@type': 'Question';

    /**
     * Describes a possible exclusive answer or option for a question.
     * @see https://www.w3.org/ns/activitystreams#oneOf
     */
    oneOf?: ObjectOrLink | ObjectOrLink[];

    /**
     * Describes a possible inclusive answer or option for a question.
     * @see https://www.w3.org/ns/activitystreams#anyOf
     */
    anyOf?: ObjectOrLink | ObjectOrLink[];
}

/**
 * The actor read the object
 * @see https://www.w3.org/ns/activitystreams#Read
 */
export interface Read extends Activity {
    '@type': 'Read';
}

/**
 * Actor rejects the Object
 * @see https://www.w3.org/ns/activitystreams#Reject
 */
export interface Reject extends Activity {
    '@type': 'Reject' | 'TentativeReject' | string;
}

/**
 * Actor tentatively rejects the object
 * @see https://www.w3.org/ns/activitystreams#TentativeReject
 */
export interface TentativeReject extends Reject {
    '@type': 'TentativeReject';
}

/**
 * To Remove Something
 * @see https://www.w3.org/ns/activitystreams#Remove
 */
export interface Remove extends Activity {
    '@type': 'Remove';
}

/**
 * The actor is traveling to the target. The origin specifies where the actor is traveling from.
 * @see https://www.w3.org/ns/activitystreams#Travel
 */
export interface Travel extends IntransitiveActivity {
    '@type': 'Travel';

    /**
     * For certain activities, specifies the entity from which the action is directed.
     * @see https://www.w3.org/ns/activitystreams#origin
     */
    origin?: ObjectOrLink;

    /**
     * Describes the indirect object, or target of the activity.
     * @see https://www.w3.org/ns/activitystreams#target
     */
    target?: ObjectOrLink;
}

/**
 * To Undo Something. This would typically be used to indicate that a previous Activity has been undone.
 * @see https://www.w3.org/ns/activitystreams#Undo
 */
export interface Undo extends Activity {
    '@type': 'Undo';
}

/**
 * To Update/Modify Something
 * @see https://www.w3.org/ns/activitystreams#Update
 */
export interface Update extends Activity {
    '@type': 'Update';
}

/**
 * The actor viewed the object
 * @see https://www.w3.org/ns/activitystreams#View
 */
export interface View extends Activity {
    '@type': 'View';
}

/**
 * Represents the concept of "owl:Thing" if needed explicitly.
 * In many cases, 'string' or 'any' might suffice for generic RDF resources.
 */
export interface Thing {
    '@id'?: string; // Optional ID if needed
    '@type'?: string | string[]; // Optional type if needed
    [key: string]: unknown; // To allow for other properties
}

// Exporting all interfaces and types for use in other modules if needed.
export {};
