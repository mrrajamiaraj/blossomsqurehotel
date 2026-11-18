// Every editable part of the public website: its fields (grouped as the
// editor shows them) and the built-in text the site uses until an editor
// publishes a change. The defaults are the hotel's current wording, so an
// untouched section looks exactly as it did before the CMS existed.
//
// Titles marked "accent" put *words between asterisks* in the site's italic accent.

import { ICONS } from "../amenities";
import type { Field, Group, ImageValue, Values } from "./fields";

export const ICON_OPTIONS = (Object.keys(ICONS) as (keyof typeof ICONS)[]).map((k) => ({
  value: k,
  label: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
}));
export type IconKey = keyof typeof ICONS;
export const iconPath = (k: unknown): string => ICONS[(typeof k === "string" && k in ICONS ? k : "roomService") as IconKey];

const img = (src: string, alt: string): ImageValue => ({ src, alt });

/* --------------------------------------------------------- field helpers */

const text = (name: string, label: string, o: Partial<Extract<Field, { type: "text" }>> = {}): Field => ({ type: "text", name, label, max: 160, ...o });
const accent = (name: string, label: string, o: Partial<Extract<Field, { type: "text" }>> = {}): Field =>
  text(name, label, { accent: true, hint: "Put *asterisks* around the words to show in italics.", max: 140, ...o });
const area = (name: string, label: string, o: Partial<Extract<Field, { type: "textarea" }>> = {}): Field => ({ type: "textarea", name, label, max: 700, ...o });
const photoField = (name: string, label: string, hint?: string, required = false): Field => ({ type: "image", name, label, hint, required });
const icon = (name = "icon"): Field => ({ type: "select", name, label: "Icon", options: ICON_OPTIONS });

const hero = (o: { photo?: boolean; lede?: boolean } = {}): Group => ({
  title: "Top of the page",
  fields: [
    text("hero_eyebrow", "Small heading", { max: 60 }),
    accent("hero_title", "Main heading", { required: true }),
    ...(o.lede === false ? [] : [area("hero_lede", "Introduction", { max: 320, rows: 3 })]),
    ...(o.photo ? [photoField("hero_photo", "Main photo", "Wide photos work best. Leave empty to show the heading without a photo.")] : []),
  ],
});

/* ------------------------------------------------------------- sections */

export type SectionDef = {
  key: string;
  label: string;
  description: string;
  /** Page to open for a preview. */
  path: string;
  groups: Group[];
  defaults: Values;
  /** Built-in text that depends on Settings (filled in at render time). */
  dynamic?: boolean;
};

const HOME: SectionDef = {
  key: "home",
  label: "Homepage",
  description: "Headings, introduction, hero photo, amenities and the dining and events stories.",
  path: "/",
  groups: [
    {
      title: "Hero",
      fields: [
        text("hero_eyebrow", "Small heading", { max: 60 }),
        accent("hero_title", "Main heading", { required: true }),
        area("hero_lede", "Introduction", { max: 240, rows: 2 }),
        photoField("hero_photo", "Hero photograph", "Shown full width behind the heading.", true),
      ],
    },
    {
      title: "Hotel introduction",
      fields: [
        text("intro_eyebrow", "Small heading", { max: 60 }),
        accent("intro_title", "Heading"),
        area("intro_body", "Introduction", { max: 600, rows: 4 }),
        {
          type: "list", name: "intro_facts", label: "Key facts", itemLabel: "Fact", max: 4,
          fields: [text("value", "Big text", { max: 20, required: true }), text("label", "Small text", { max: 60 })], summary: "value",
        },
        photoField("intro_photo_a", "Large photo"),
        photoField("intro_photo_b", "Small photo"),
        text("intro_caption", "Photo caption", { max: 120 }),
      ],
    },
    { title: "Rooms", fields: [text("rooms_eyebrow", "Small heading", { max: 60 }), accent("rooms_title", "Heading")] },
    {
      title: "Amenities",
      fields: [
        text("amenities_eyebrow", "Small heading", { max: 60 }),
        accent("amenities_title", "Heading"),
        area("amenities_lede", "Introduction", { max: 320, rows: 3 }),
        {
          type: "list", name: "amenities", label: "Amenities", itemLabel: "Amenity", max: 12,
          fields: [text("name", "Name", { max: 40, required: true }), text("note", "Note", { max: 60 }), icon()], summary: "name",
        },
      ],
    },
    {
      title: "Sea view band",
      fields: [text("bay_eyebrow", "Small heading", { max: 60 }), accent("bay_title", "Heading"), photoField("bay_photo", "Background photo")],
    },
    {
      title: "Dining story",
      description: "The first tab of “At the table, and beyond it”.",
      fields: [
        accent("stories_title", "Section heading"),
        text("dining_tab", "Tab name", { max: 30 }),
        text("dining_eyebrow", "Small heading", { max: 60 }),
        accent("dining_title", "Heading"),
        area("dining_body", "Text", { max: 400, rows: 3 }),
        { type: "strings", name: "dining_points", label: "Points", max: 6, itemMax: 80, itemLabel: "Point" },
        photoField("dining_photo", "Photo"),
      ],
    },
    {
      title: "Events story",
      fields: [
        text("events_tab", "Tab name", { max: 30 }),
        text("events_eyebrow", "Small heading", { max: 60 }),
        accent("events_title", "Heading"),
        area("events_body", "Text", { max: 400, rows: 3 }),
        { type: "strings", name: "events_points", label: "Points", max: 6, itemMax: 80, itemLabel: "Point" },
        photoField("events_photo", "Photo"),
      ],
    },
    {
      title: "Gallery and location",
      fields: [
        text("gallery_eyebrow", "Gallery small heading", { max: 60 }),
        accent("gallery_title", "Gallery heading"),
        text("location_eyebrow", "Location small heading", { max: 60 }),
        accent("location_title", "Location heading"),
        {
          type: "list", name: "nearby", label: "Nearby places", itemLabel: "Place", max: 8,
          fields: [text("place", "Place", { max: 60, required: true }), text("note", "How far / which way", { max: 60 })], summary: "place",
        },
      ],
    },
  ],
  defaults: {
    hero_eyebrow: "Kolatoli · Cox's Bazar",
    hero_title: "A short walk from the *world's longest* sea beach.",
    hero_lede: "Sea-view suites with private balconies, a pool to come back to, and breakfast with every room.",
    hero_photo: img("DSC5566", "The Connecting King Suite in the evening, lamps lit above the bed"),
    intro_eyebrow: "The hotel",
    intro_title: "Quiet rooms on Light House Road, *the sea at the end of the street.*",
    intro_body:
      "Blossom Square sits in Kolatoli, Cox's Bazar's hotel quarter, a few minutes on foot from the sand. Come for the beach, stay in for the pool, the restaurant and round-the-clock room service, whether you're here on holiday or on business.",
    intro_facts: [
      { value: "Steps", label: "to the sea beach" },
      { value: "Included", label: "breakfast, every room" },
      { value: "24 hours", label: "room service" },
    ],
    intro_photo_a: img("DSC5562", "The upstairs corridor, with original artwork on the walls"),
    intro_photo_b: img("DSC5552", "Turn-down in a Deluxe Couple room"),
    intro_caption: "Upstairs, and a Deluxe Couple room at turn-down.",
    rooms_eyebrow: "Rooms & Suites",
    rooms_title: "A room *for every trip.*",
    amenities_eyebrow: "With every stay",
    amenities_title: "Nothing to add *at checkout.*",
    amenities_lede: "Breakfast, parking, Wi-Fi and the pool are part of the room rate. Airport pickup and drop-off can be arranged for an extra charge.",
    amenities: [
      { name: "Sea view", note: "From every room", icon: "seaView" },
      { name: "Breakfast", note: "Buffet, included", icon: "breakfast" },
      { name: "Swimming pool", note: "Open daily", icon: "pool" },
      { name: "Room service", note: "Twenty-four hours", icon: "roomService" },
      { name: "Wi-Fi", note: "High-speed, free", icon: "wifi" },
      { name: "Parking", note: "Free, on site", icon: "parking" },
      { name: "Private balcony", note: "In our suites", icon: "balcony" },
      { name: "Airport transfers", note: "On request, extra charge", icon: "airport" },
    ],
    bay_eyebrow: "From your balcony",
    bay_title: "The Bay of Bengal, *every morning.*",
    bay_photo: img("DSC5579", "A Standard Couple room, curtains drawn"),
    stories_title: "At the table, *and beyond it.*",
    dining_tab: "Dining",
    dining_eyebrow: "Restaurant & café",
    dining_title: "Seafood from these shores, *breakfast on us.*",
    dining_body:
      "The restaurant and café serve Bangladeshi and international dishes, with fish from Cox's Bazar's own catch. The lounge stays open for evening coffee.",
    dining_points: [
      "Breakfast buffet, included with every room",
      "Bangladeshi & international kitchen",
      "Fish from the morning's local catch",
      "Twenty-four-hour room service",
    ],
    dining_photo: img("RESTAURANT", "The restaurant and café"),
    events_tab: "Meetings & Events",
    events_eyebrow: "Banquet & conference",
    events_title: "From board meetings to *wedding receptions.*",
    events_body: "A conference room with high-speed Wi-Fi and a banquet hall with full catering. Our events team looks after the setup, décor and menus.",
    events_points: ["Conference room with high-speed Wi-Fi", "Banquet hall with full catering", "Setup, décor and menus arranged for you"],
    events_photo: img("BANQUET", "The banquet hall"),
    gallery_eyebrow: "Gallery",
    gallery_title: "The hotel, *as it is.*",
    location_eyebrow: "Find us",
    location_title: "In the heart *of Kolatoli.*",
    nearby: [
      { place: "Kolatoli beach", note: "A few minutes on foot" },
      { place: "Laboni Point & Burmese Market", note: "North, in town" },
      { place: "Himchari & Marine Drive", note: "South along the coast" },
      { place: "Inani Beach", note: "Further south on Marine Drive" },
    ],
  },
};

const ABOUT: SectionDef = {
  key: "about",
  label: "About the hotel",
  description: "The hotel's story, photos and key facts.",
  path: "/about",
  groups: [
    hero({ photo: true, lede: false }),
    {
      title: "The story",
      fields: [
        text("story_eyebrow", "Small heading", { max: 60 }),
        accent("story_title", "Heading"),
        { type: "strings", name: "story", label: "Paragraphs", max: 5, itemMax: 900, itemLabel: "Paragraph" },
        photoField("photo_a", "Tall photo"),
        photoField("photo_b", "Square photo"),
        text("photo_caption", "Photo caption", { max: 120 }),
      ],
    },
    {
      title: "At a glance",
      description: "The number of room types and suites is filled in automatically; add up to two more facts.",
      fields: [
        {
          type: "list", name: "facts", label: "More facts", itemLabel: "Fact", max: 2,
          fields: [text("value", "Big text", { max: 20, required: true }), text("label", "Small text", { max: 80 })], summary: "value",
        },
      ],
    },
  ],
  defaults: {
    hero_eyebrow: "About Blossom Square",
    hero_title: "Quiet rooms on Light House Road, *the sea at the end of the street.*",
    hero_photo: img("DSC5562", "The upstairs corridor, with original artwork on the walls"),
    story_eyebrow: "The hotel",
    story_title: "A calm place *to come back to.*",
    story: [
      "Blossom Square Hotel & Suites sits in Kolatoli, Cox's Bazar's hotel quarter, a few minutes on foot from the world's longest sea beach. Come for the sand, stay in for the pool, the restaurant and round-the-clock room service.",
      "Our rooms are simply and warmly done: pale tiled floors, timber headboards, woven jute and original paintings on the walls, soft light in the evenings. Whether you're here for a holiday, a honeymoon or business, the idea is the same: a quiet room, a good breakfast, and a team that looks after the details.",
    ],
    photo_a: img("DSC5575", "A Premium Twin room: queen and single beds beneath a woven jute disc"),
    photo_b: img("DSC5552", "Turn-down in a Deluxe Couple room"),
    photo_caption: "A Premium Twin room, and turn-down in a Deluxe Couple.",
    facts: [
      { value: "24 h", label: "room service and front desk" },
      { value: "Included", label: "breakfast, Wi-Fi, parking and the pool" },
    ],
  },
};

const DINING: SectionDef = {
  key: "dining",
  label: "Dining",
  description: "The restaurant page: introduction, moments through the day, reservations.",
  path: "/dining",
  groups: [
    hero({ photo: true }),
    {
      title: "Through the day",
      fields: [
        text("moments_eyebrow", "Small heading", { max: 60 }),
        accent("moments_title", "Heading"),
        {
          type: "list", name: "moments", label: "Moments", itemLabel: "Moment", max: 8,
          fields: [text("title", "Title", { max: 40, required: true }), area("note", "Text", { max: 200, rows: 2 }), icon()], summary: "title",
        },
      ],
    },
    {
      title: "Reservations",
      fields: [text("reserve_eyebrow", "Small heading", { max: 60 }), accent("reserve_title", "Heading"), area("reserve_lede", "Text", { max: 400 }), accent("cta_title", "Closing line")],
    },
  ],
  defaults: {
    hero_eyebrow: "Restaurant & café",
    hero_title: "Seafood from these shores, *breakfast on us.*",
    hero_lede: "Our restaurant and café serve Bangladeshi and international dishes, with fish from Cox's Bazar's own catch.",
    hero_photo: img("RESTAURANT", "The restaurant and café"),
    moments_eyebrow: "Through the day",
    moments_title: "From the first coffee *to the last.*",
    moments: [
      { icon: "breakfast", title: "Breakfast", note: "A buffet every morning, included with every room for every guest on the booking." },
      { icon: "seaView", title: "From the bay", note: "Fish from the morning's local catch at Cox's Bazar, on the restaurant menu." },
      { icon: "roomService", title: "Room service", note: "Meals and snacks brought to your room, twenty-four hours a day." },
      { icon: "minibar", title: "Evening coffee", note: "The lounge stays open for coffee and conversation after a day on the beach." },
    ],
    reserve_eyebrow: "Reservations",
    reserve_title: "Book a table, *or a celebration.*",
    reserve_lede:
      "Call or WhatsApp the front desk to reserve, ask for today's menu, or plan a private dinner. For larger groups, send the details and we'll suggest a menu.",
    cta_title: "Breakfast is *part of every stay.*",
  },
};

const EVENTS: SectionDef = {
  key: "events",
  label: "Meetings & events",
  description: "Event spaces, how planning works, and the closing call to action.",
  path: "/meetings-events",
  groups: [
    hero({ photo: true }),
    {
      title: "Spaces",
      fields: [
        {
          type: "list", name: "spaces", label: "Spaces", itemLabel: "Space", max: 4,
          fields: [
            text("eyebrow", "Small heading", { max: 40 }),
            text("title", "Heading", { max: 80, required: true }),
            area("body", "Text", { max: 400, rows: 3 }),
            { type: "strings", name: "points", label: "Points", max: 5, itemMax: 80, itemLabel: "Point" },
            icon(),
          ],
          summary: "title",
        },
        area("spaces_note", "Note under the spaces", { max: 200, rows: 2 }),
      ],
    },
    {
      title: "How it works",
      fields: [
        text("steps_eyebrow", "Small heading", { max: 60 }),
        accent("steps_title", "Heading"),
        {
          type: "list", name: "steps", label: "Steps", itemLabel: "Step", max: 5,
          fields: [text("title", "Step", { max: 60, required: true }), text("note", "Detail", { max: 140 })], summary: "title",
        },
      ],
    },
    { title: "Closing band", fields: [text("cta_eyebrow", "Small heading", { max: 60 }), accent("cta_title", "Heading"), area("cta_body", "Text", { max: 300, rows: 2 })] },
  ],
  defaults: {
    hero_eyebrow: "Meetings & events",
    hero_title: "From board meetings *to wedding receptions.*",
    hero_lede: "A conference room and a banquet hall in Kolatoli, with rooms upstairs for your guests and a team that arranges the setup, décor and menus.",
    hero_photo: img("BANQUET", "The banquet hall"),
    spaces: [
      {
        eyebrow: "Conference room",
        title: "For meetings that need to get done",
        body: "A private room for board meetings, trainings and presentations, with high-speed Wi-Fi. Tell us your format and we'll set it up before you arrive.",
        points: ["High-speed Wi-Fi", "Set up to your format", "Rooms for attendees in the same building"],
        icon: "desk",
      },
      {
        eyebrow: "Banquet hall",
        title: "For the celebrations that matter",
        body: "Wedding receptions, family gatherings, company dinners. Our events team looks after the setup, décor and menus, and the kitchen caters the whole occasion.",
        points: ["Full catering from our kitchen", "Setup, décor and menus arranged", "Guest rooms for family and friends"],
        icon: "roomService",
      },
    ],
    spaces_note: "Capacities and layouts depend on the occasion. Ask us and we'll confirm what fits.",
    steps_eyebrow: "How it works",
    steps_title: "Three steps *to the day itself.*",
    steps: [
      { title: "Tell us the occasion", note: "Date, number of guests and what you have in mind." },
      { title: "We come back with options", note: "Space, layout, menus and rooms, with a clear quote." },
      { title: "We set it all up", note: "On the day, our team handles the room, service and timings." },
    ],
    cta_eyebrow: "Staying over?",
    cta_title: "Rooms for every guest, *upstairs.*",
    cta_body: "Book rooms for your guests online, or ask the events team to hold a block of rooms with your event.",
  },
};

const TERMS = [
  { value: "included", label: "Included" },
  { value: "on-request", label: "On request" },
  { value: "charged", label: "Extra charge" },
];

const FACILITIES: SectionDef = {
  key: "facilities",
  label: "Hotel facilities",
  description: "The facilities list and what every room has.",
  path: "/facilities",
  groups: [
    hero(),
    {
      title: "Facilities",
      fields: [
        {
          type: "list", name: "items", label: "Facilities", itemLabel: "Facility", max: 16,
          fields: [
            text("name", "Name", { max: 40, required: true }),
            text("summary", "One line", { max: 80 }),
            area("detail", "Description", { max: 300, rows: 2 }),
            { type: "select", name: "terms", label: "Price", options: TERMS },
            icon(),
          ],
          summary: "name",
        },
      ],
    },
    {
      title: "In every room",
      fields: [
        text("room_eyebrow", "Small heading", { max: 60 }),
        accent("room_title", "Heading"),
        area("room_lede", "Text", { max: 300, rows: 2 }),
        { type: "list", name: "room_items", label: "Items", itemLabel: "Item", max: 12, fields: [text("name", "Name", { max: 40, required: true }), icon()], summary: "name" },
      ],
    },
  ],
  defaults: {
    hero_eyebrow: "Facilities",
    hero_title: "Everything close at hand, *nothing to add at checkout.*",
    hero_lede: "Breakfast, Wi-Fi, parking and the pool are part of every room rate. Room service, the restaurant and airport transfers are there when you want them.",
    items: [
      { name: "Swimming pool", summary: "Open daily for hotel guests", detail: "Come back from the beach to a swim at the hotel. The pool is open every day and is free for staying guests.", terms: "included", icon: "pool" },
      { name: "Restaurant & café", summary: "Bangladeshi and international dishes", detail: "Bangladeshi and international dishes, with fish from Cox's Bazar's own catch. The lounge stays open for evening coffee.", terms: "charged", icon: "breakfast" },
      { name: "Breakfast", summary: "Buffet, included with every room", detail: "A breakfast buffet is part of every room rate, for every guest on the booking.", terms: "included", icon: "breakfast" },
      { name: "Room service", summary: "Twenty-four hours", detail: "Meals and snacks brought to your room at any hour of the day or night.", terms: "charged", icon: "roomService" },
      { name: "Wi-Fi", summary: "High-speed, free throughout", detail: "Free high-speed internet in every room and across the hotel, around the clock.", terms: "included", icon: "wifi" },
      { name: "Parking", summary: "Free and on site", detail: "Safe on-site parking for guests, available at any time.", terms: "included", icon: "parking" },
      { name: "Conference room", summary: "Meetings with high-speed Wi-Fi", detail: "A private room for meetings, trainings and presentations, with high-speed Wi-Fi. Ask us about refreshments.", terms: "on-request", icon: "desk" },
      { name: "Banquet hall", summary: "Celebrations with full catering", detail: "For receptions, family celebrations and company dinners. Our events team arranges setup, décor and menus.", terms: "on-request", icon: "roomService" },
      { name: "Airport transfers", summary: "Pickup and drop-off on request", detail: "We can meet you at Cox's Bazar airport and take you back at the end of your stay, for an extra charge. Ask when you book.", terms: "charged", icon: "airport" },
    ],
    room_eyebrow: "In every room",
    room_title: "The essentials, *as standard.*",
    room_lede: "Each of our seven room types has these, from the Standard Couple to the Executive Family Suite.",
    room_items: [
      { name: "Private bathroom", icon: "bath" },
      { name: "Air conditioning", icon: "ac" },
      { name: "Hot water", icon: "hotWater" },
      { name: "TV", icon: "tv" },
      { name: "Work desk", icon: "desk" },
      { name: "Free Wi-Fi", icon: "wifi" },
    ],
  },
};

const FAQ: SectionDef = {
  key: "faq",
  label: "Questions & answers",
  description: "Frequently asked questions. Until you publish your own, the answers follow the policies in Settings automatically.",
  path: "/faq",
  dynamic: true,
  groups: [
    hero(),
    {
      title: "Questions",
      description: "Once you publish this section, these answers stay exactly as written (they no longer update from Settings).",
      fields: [
        {
          type: "list", name: "groups", label: "Topics", itemLabel: "Topic", max: 8, min: 1,
          fields: [
            text("title", "Topic", { max: 40, required: true }),
            {
              type: "list", name: "items", label: "Questions", itemLabel: "Question", max: 20,
              fields: [text("q", "Question", { max: 160, required: true }), area("a", "Answer", { max: 900, rows: 3, required: true })],
              summary: "q",
            },
          ],
          summary: "title",
        },
      ],
    },
  ],
  defaults: {
    hero_eyebrow: "Help",
    hero_title: "Questions, *answered.*",
    hero_lede: "Everything guests usually ask before they arrive. Can't find yours? Our front desk is a call or a WhatsApp message away.",
    groups: [],
  },
};

const OFFERS: SectionDef = {
  key: "offers",
  label: "Offers & packages",
  description: "The offers page. Promotions you create under Offers appear here automatically; add packages here too.",
  path: "/offers",
  groups: [
    hero(),
    {
      title: "Packages",
      description: "Packages are described here; to give a discount, create an offer under Offers.",
      fields: [
        {
          type: "list", name: "packages", label: "Packages", itemLabel: "Package", max: 8,
          fields: [
            text("badge", "Label", { max: 30, placeholder: "e.g. Honeymoon" }),
            text("title", "Heading", { max: 60, required: true }),
            text("accent", "Heading, in italics", { max: 60 }),
            area("summary", "Description", { max: 400, rows: 3 }),
            { type: "strings", name: "highlights", label: "Highlights", max: 5, itemMax: 120, itemLabel: "Highlight" },
            text("cta", "Button text", { max: 40 }),
            { type: "url", name: "href", label: "Button link", internal: true, hint: "A page on this site, e.g. /booking" },
            area("terms", "Small print", { max: 300, rows: 2 }),
          ],
          summary: "title",
        },
        area("empty_note", "Shown when there are no offers", { max: 200, rows: 2 }),
      ],
    },
    { title: "Group stays band", fields: [text("group_eyebrow", "Small heading", { max: 60 }), accent("group_title", "Heading"), area("group_body", "Text", { max: 300, rows: 2 })] },
  ],
  defaults: {
    hero_eyebrow: "Offers & packages",
    hero_title: "The best rate *is the direct one.*",
    hero_lede: "Every price on this page comes straight from today's room rates. No codes, no small print beyond what's written here.",
    packages: [],
    empty_note: "There are no special offers right now. Our direct rates are always on the rooms page.",
    group_eyebrow: "Groups & companies",
    group_title: "Travelling as a group? *Ask us.*",
    group_body: "For family groups, company trips and event guests, send your dates and numbers and we'll come back with a quote for the whole party.",
  },
};

const CONTACT: SectionDef = {
  key: "contact",
  label: "Contact details",
  description: "Address, phone numbers, WhatsApp, email and check-in times, used everywhere on the website and in booking emails.",
  path: "/contact",
  groups: [
    {
      title: "How to reach the hotel",
      fields: [
        text("full_name", "Hotel name", { max: 80, required: true }),
        area("address", "Full address", { max: 200, rows: 2, required: true }),
        text("short_address", "Short address", { max: 80, required: true }),
        {
          type: "list", name: "phones", label: "Phone numbers", itemLabel: "Phone", max: 4, min: 1,
          fields: [text("display", "Number, as shown", { max: 30, required: true, placeholder: "+880 1805-006900" })], summary: "display",
        },
        text("whatsapp", "WhatsApp number", { max: 30, required: true, placeholder: "+880 1805-006900" }),
        { type: "email", name: "email", label: "Email", required: true },
        { type: "url", name: "map_url", label: "Google Maps link", hint: "The hotel's own listing, starting with https://" },
        text("map_query", "Address for the map", { max: 160, hint: "What the embedded map searches for." }),
        { type: "list", name: "social", label: "Social links", itemLabel: "Link", max: 5, fields: [text("label", "Name", { max: 30, required: true }), { type: "url", name: "href", label: "Link", required: true }], summary: "label" },
      ],
    },
    {
      title: "Arrival",
      fields: [
        text("check_in", "Check-in from", { max: 20, required: true, placeholder: "1:00 PM" }),
        text("check_out", "Check-out until", { max: 20, required: true, placeholder: "11:00 AM" }),
        area("arriving", "Arriving note", { max: 200, rows: 2 }),
      ],
    },
    {
      title: "Contact page",
      fields: [
        text("hero_eyebrow", "Small heading", { max: 60 }),
        accent("hero_title", "Main heading"),
        area("hero_lede", "Introduction", { max: 320, rows: 3 }),
        accent("map_title", "Map heading"),
        area("map_lede", "Map text", { max: 200, rows: 2 }),
      ],
    },
  ],
  defaults: {
    full_name: "Blossom Square Hotel & Suites",
    address: "House 85, Block A, Light House Road, PWD R/A (Hotel Motel Zone), Kolatoli, Cox's Bazar",
    short_address: "Light House Road, Kolatoli, Cox's Bazar",
    phones: [{ display: "+880 1805-006900" }, { display: "+880 1805-006902" }],
    whatsapp: "+880 1805-006900",
    email: "blossomsquare0@gmail.com",
    map_url: "https://maps.app.goo.gl/HMQz4T5vC9o5hy1A7",
    map_query: "Blossom Square Hotel & Suites, Light House Road, Kolatoli Rd, Cox's Bazar 4700",
    social: [
      { label: "Facebook", href: "https://www.facebook.com/share/1KuAPqa9NA/" },
      { label: "WhatsApp", href: "https://wa.me/8801805006900" },
    ],
    check_in: "1:00 PM",
    check_out: "11:00 AM",
    arriving: "Airport pickup and drop-off on request, at an extra charge.",
    hero_eyebrow: "Contact & location",
    hero_title: "Speak to us, *or come and see.*",
    hero_lede: "Our front desk answers calls and WhatsApp messages around the clock. For events and group stays, send a message and we'll come back with options.",
    map_title: "In the heart *of Kolatoli.*",
    map_lede: "Cox's Bazar's hotel quarter, a few minutes on foot from the beach.",
  },
};

const POLICIES: SectionDef = {
  key: "policies",
  label: "Booking policies",
  description: "House rules shown on every room page. Cancellation, children, VAT and service charge are set in Settings.",
  path: "/rooms",
  groups: [
    {
      title: "House rules",
      fields: [
        area("check_in_note", "Check-in note", { max: 200, rows: 2, hint: "Shown after the check-in time." }),
        area("check_out_note", "Check-out note", { max: 200, rows: 2, hint: "Shown after the check-out time." }),
        {
          type: "list", name: "rules", label: "Other rules", itemLabel: "Rule", max: 8,
          fields: [text("title", "Title", { max: 40, required: true }), area("body", "Rule", { max: 400, rows: 2, required: true })], summary: "title",
        },
      ],
    },
  ],
  defaults: {
    check_in_note: "Early check-in on request, subject to availability.",
    check_out_note: "Late check-out on request.",
    rules: [{ title: "Pets", body: "We're unable to accommodate pets." }],
  },
};

const FOOTER: SectionDef = {
  key: "footer",
  label: "Footer",
  description: "The invitation and small print at the bottom of every page.",
  path: "/",
  groups: [
    {
      title: "Footer",
      fields: [
        text("invite_eyebrow", "Small heading", { max: 40 }),
        accent("invite_line", "Invitation"),
        text("button", "Button text", { max: 30 }),
        text("legal_note", "Small print", { max: 120, hint: "Shown next to the copyright line; the cancellation policy from Settings is added after it." }),
      ],
    },
  ],
  defaults: {
    invite_eyebrow: "Reservations",
    invite_line: "The sea is *a short walk* from your door.",
    button: "Reserve your stay",
    legal_note: "No pets",
  },
};

export const SEO_PAGES = [
  { id: "home", path: "/", label: "Homepage", title: "Blossom Square Hotel & Suites · Cox's Bazar", description: "Sea-view suites with private balconies in Kolatoli, Cox's Bazar, a short walk from the world's longest sea beach. Pool, 24-hour room service and breakfast included." },
  { id: "rooms", path: "/rooms", label: "Rooms & Suites", title: "Rooms & Suites", description: "Seven ways to stay at Blossom Square in Kolatoli, Cox's Bazar, from a couple's room to a family suite. Live availability and direct rates." },
  { id: "dining", path: "/dining", label: "Dining", title: "Dining", description: "Bangladeshi and international dishes with fish from Cox's Bazar's own catch, breakfast included with every room, and 24-hour room service." },
  { id: "events", path: "/meetings-events", label: "Meetings & events", title: "Meetings & events", description: "A conference room with high-speed Wi-Fi and a banquet hall with full catering in Kolatoli, Cox's Bazar. Our events team arranges setup, décor and menus." },
  { id: "facilities", path: "/facilities", label: "Facilities", title: "Hotel facilities", description: "Swimming pool, restaurant and café, 24-hour room service, free Wi-Fi and parking, a conference room and banquet hall at Blossom Square, Cox's Bazar." },
  { id: "offers", path: "/offers", label: "Offers", title: "Offers & packages", description: "Book direct for our lowest rates and stay midweek for less at Blossom Square Hotel & Suites, Cox's Bazar." },
  { id: "gallery", path: "/gallery", label: "Gallery", title: "Photo gallery", description: "Photographs of the rooms, suites and interiors at Blossom Square Hotel & Suites, Kolatoli, Cox's Bazar." },
  { id: "about", path: "/about", label: "About", title: "About the hotel", description: "Blossom Square Hotel & Suites: quiet rooms and suites on Light House Road in Kolatoli, Cox's Bazar, a short walk from the sea beach." },
  { id: "contact", path: "/contact", label: "Contact", title: "Contact & location", description: "Call, WhatsApp or email Blossom Square Hotel & Suites in Kolatoli, Cox's Bazar." },
  { id: "faq", path: "/faq", label: "Questions & answers", title: "Questions & answers", description: "Check-in times, breakfast, payment, airport transfers, parking and more at Blossom Square Hotel & Suites, Cox's Bazar." },
] as const;
export type SeoPageId = (typeof SEO_PAGES)[number]["id"];

const SEO: SectionDef = {
  key: "seo",
  label: "Search & sharing (SEO)",
  description: "Page titles and descriptions for Google, and the image shown when a page is shared.",
  path: "/",
  groups: SEO_PAGES.map((p) => ({
    title: p.label,
    description: p.path,
    fields: [
      text(`${p.id}_title`, "Title", { max: 70, hint: "About 50–60 characters works best in Google." }),
      area(`${p.id}_description`, "Description", { max: 170, rows: 2, hint: "About 150 characters." }),
      photoField(`${p.id}_image`, "Sharing image", "Shown on Facebook and WhatsApp when the page is shared."),
    ],
  })),
  defaults: Object.fromEntries(
    SEO_PAGES.flatMap((p) => [
      [`${p.id}_title`, p.title],
      [`${p.id}_description`, p.description],
      [`${p.id}_image`, null],
    ]),
  ),
};

export const SECTIONS: SectionDef[] = [HOME, ABOUT, DINING, EVENTS, FACILITIES, OFFERS, FAQ, CONTACT, POLICIES, FOOTER, SEO];

export type SectionKey = "home" | "about" | "dining" | "events" | "facilities" | "offers" | "faq" | "contact" | "policies" | "footer" | "seo";

export function sectionDef(key: string): SectionDef | null {
  return SECTIONS.find((s) => s.key === key) ?? null;
}

/* ------------------------------------------------------- typed shapes */

type Item<T> = T[];
export type HomeContent = {
  hero_eyebrow: string; hero_title: string; hero_lede: string; hero_photo: ImageValue;
  intro_eyebrow: string; intro_title: string; intro_body: string; intro_facts: Item<{ value: string; label: string }>;
  intro_photo_a: ImageValue | null; intro_photo_b: ImageValue | null; intro_caption: string;
  rooms_eyebrow: string; rooms_title: string;
  amenities_eyebrow: string; amenities_title: string; amenities_lede: string; amenities: Item<{ name: string; note: string; icon: string }>;
  bay_eyebrow: string; bay_title: string; bay_photo: ImageValue | null;
  stories_title: string;
  dining_tab: string; dining_eyebrow: string; dining_title: string; dining_body: string; dining_points: string[]; dining_photo: ImageValue | null;
  events_tab: string; events_eyebrow: string; events_title: string; events_body: string; events_points: string[]; events_photo: ImageValue | null;
  gallery_eyebrow: string; gallery_title: string; location_eyebrow: string; location_title: string; nearby: Item<{ place: string; note: string }>;
};
export type AboutContent = {
  hero_eyebrow: string; hero_title: string; hero_photo: ImageValue | null;
  story_eyebrow: string; story_title: string; story: string[]; photo_a: ImageValue | null; photo_b: ImageValue | null; photo_caption: string;
  facts: Item<{ value: string; label: string }>;
};
export type DiningContent = {
  hero_eyebrow: string; hero_title: string; hero_lede: string; hero_photo: ImageValue | null;
  moments_eyebrow: string; moments_title: string; moments: Item<{ title: string; note: string; icon: string }>;
  reserve_eyebrow: string; reserve_title: string; reserve_lede: string; cta_title: string;
};
export type EventsContent = {
  hero_eyebrow: string; hero_title: string; hero_lede: string; hero_photo: ImageValue | null;
  spaces: Item<{ eyebrow: string; title: string; body: string; points: string[]; icon: string }>; spaces_note: string;
  steps_eyebrow: string; steps_title: string; steps: Item<{ title: string; note: string }>;
  cta_eyebrow: string; cta_title: string; cta_body: string;
};
export type FacilitiesContent = {
  hero_eyebrow: string; hero_title: string; hero_lede: string;
  items: Item<{ name: string; summary: string; detail: string; terms: "included" | "on-request" | "charged"; icon: string }>;
  room_eyebrow: string; room_title: string; room_lede: string; room_items: Item<{ name: string; icon: string }>;
};
export type FaqContent = { hero_eyebrow: string; hero_title: string; hero_lede: string; groups: Item<{ title: string; items: Item<{ q: string; a: string }> }> };
export type OffersContent = {
  hero_eyebrow: string; hero_title: string; hero_lede: string;
  packages: Item<{ badge: string; title: string; accent: string; summary: string; highlights: string[]; cta: string; href: string; terms: string }>;
  empty_note: string; group_eyebrow: string; group_title: string; group_body: string;
};
export type ContactContent = {
  full_name: string; address: string; short_address: string; phones: Item<{ display: string }>; whatsapp: string; email: string;
  map_url: string; map_query: string; social: Item<{ label: string; href: string }>; check_in: string; check_out: string; arriving: string;
  hero_eyebrow: string; hero_title: string; hero_lede: string; map_title: string; map_lede: string;
};
export type PoliciesContent = { check_in_note: string; check_out_note: string; rules: Item<{ title: string; body: string }> };
export type FooterContent = { invite_eyebrow: string; invite_line: string; button: string; legal_note: string };
export type SeoContent = Record<string, string | ImageValue | null>;

export type SectionContent = {
  home: HomeContent; about: AboutContent; dining: DiningContent; events: EventsContent; facilities: FacilitiesContent;
  offers: OffersContent; faq: FaqContent; contact: ContactContent; policies: PoliciesContent; footer: FooterContent; seo: SeoContent;
};
