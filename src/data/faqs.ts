/* Single source of truth for FAQ content.
   Consumed by src/components/landing/LandingFaq.astro, which renders both the
   compact homepage section and the full /faq page. */

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  /** Anchor id — footer links point at /faq#<id> */
  id: string;
  title: string;
  items: FaqItem[];
}

export const faqGroups: FaqGroup[] = [
  {
    id: "shipping",
    title: "Orders & Shipping",
    items: [
      {
        q: "How long will my order take?",
        a: "Every Sunflora piece is hooked on demand, so nothing sits waiting on a shelf. Catalogue pieces are made and dispatched within 7–10 working days. Custom pieces take 5–14 days depending on how detailed they are — and we'll always share a timeline before we start.",
      },
      {
        q: "How much is shipping?",
        a: "Nothing at all. Shipping is free on every order, anywhere in India. The price you see on the tag is the price you pay.",
      },
      {
        q: "Where do you ship?",
        a: "Across India, to any pincode. We're not shipping internationally just yet — but if you're abroad and your heart is set on a piece, write to us and we'll see what we can do.",
      },
      {
        q: "How do I track my order?",
        a: "You'll get a tracking link by email the moment your piece is dispatched. You can also check any time on our Track Order page with your order number (it looks like ORD-A1B2C3D4) and the email you used at checkout.",
      },
    ],
  },
  {
    id: "custom",
    title: "Custom Orders",
    items: [
      {
        q: "Can you make something that isn't on the site?",
        a: "That's our favourite thing to do. A specific character, your pet, a bouquet in her exact wedding colours — bring us your strangest little idea and we'll hook it from scratch.",
      },
      {
        q: "How does a custom order work?",
        a: "Four steps. You share your idea on the Custom Orders page — a photo, a doodle, a screenshot, anything helps. We come back with a design plan, a quote and a timeline. You approve and pay an advance, we make it, and the balance is due before it ships.",
      },
      {
        q: "Can I choose my own colours?",
        a: "Absolutely. Send us a reference and we'll match it from our cotton library as closely as yarn allows. You'll always see a swatch photo and approve it before the first stitch.",
      },
      {
        q: "What sizes can you make?",
        a: "Our standard sizes are 3 inch (7–8 cm), 5 inch (12–13 cm) and 12 inch (30–32 cm). Want something bigger? Just ask — more yarn and more hours, so the quote and timeline shift a little.",
      },
    ],
  },
  {
    id: "returns",
    title: "Payment, Returns & Care",
    items: [
      {
        q: "What payment methods do you accept?",
        a: "UPI, credit and debit cards, and netbanking, all through a secure payment page. Every order is prepaid — we don't offer cash on delivery, since each piece is made especially for you. Custom orders start with an advance, with the balance due before dispatch.",
      },
      {
        q: "Can I return something?",
        a: "Ready-made pieces from our catalogue can be returned within 7 days of delivery, unused and in their original packaging. Custom and personalised orders can't be returned — they were made for you, and only you.",
      },
      {
        q: "What if my piece arrives damaged?",
        a: "Send us a photo on WhatsApp or email within 48 hours of delivery (your unboxing video helps, if you have one) and we'll repair or replace it. No fuss, no arguing.",
      },
      {
        q: "How do I care for my crochet piece?",
        a: "Spot clean only — a damp cloth and a little mild soap. Never machine wash or soak it. Air dry flat, away from direct sun, and give it a gentle shake to fluff it back up after travel. Every parcel comes with a care card.",
      },
    ],
  },
  {
    id: "about",
    title: "About Sunflora",
    items: [
      {
        q: "What are your pieces made from?",
        a: "Soft cotton yarn and safe polyfill stuffing, chosen piece by piece. All of it stitched by hand — no machines, no shortcuts.",
      },
      {
        q: "Are they safe for babies and small children?",
        a: "Our standard pieces use securely fixed safety eyes and are best suited to ages 3+. For babies we make a fully baby-safe version with embroidered eyes and no plastic parts at all — just tell us when you order and we'll make yours that way.",
      },
      {
        q: "Who actually makes these?",
        a: "Aru, mostly. One pair of hands, one hook, and a great many hours. Sunflora is a small studio — which is exactly why we work in small batches, and why your piece takes a little time.",
      },
      {
        q: "Do you take bulk or gifting orders?",
        a: "Yes — wedding favours, return gifts, corporate hampers. Write to us with the quantity and the date you need them by, and we'll build a timeline that works. Bigger batches need more notice, so reach out early.",
      },
    ],
  },
];

/** Flat lookup so the homepage picks real questions, not hand-copied duplicates. */
const allFaqs: FaqItem[] = faqGroups.flatMap((g) => g.items);

const byQuestion = (q: string): FaqItem => {
  const found = allFaqs.find((item) => item.q === q);
  if (!found) throw new Error(`[faqs] No FAQ matching question: ${q}`);
  return found;
};

/** The six highest-intent questions, for the homepage teaser. */
export const homeFaqs: FaqItem[] = [
  "How long will my order take?",
  "How much is shipping?",
  "Can you make something that isn't on the site?",
  "Can I return something?",
  "How do I care for my crochet piece?",
  "Are they safe for babies and small children?",
].map(byQuestion);
