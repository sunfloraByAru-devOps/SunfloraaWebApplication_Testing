/* Single source of truth for FAQ content.
   Consumed by src/components/landing/LandingFaq.astro, which renders both the
   compact homepage section and the full /faq page.

   The page set is deliberately deep: informational questions ("what is
   amigurumi", "do crochet flowers last forever") capture top-of-funnel search
   traffic, and each answer is written to stand alone as a search result. */

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  /** Anchor id — footer links point at /faq#<id> */
  id: string;
  title: string;
  /** Short lead-in shown under the group title on /faq. Adds crawlable context. */
  blurb?: string;
  items: FaqItem[];
}

export const faqGroups: FaqGroup[] = [
  {
    id: "shipping",
    title: "Orders & Shipping",
    blurb:
      "How long your piece takes to make, what shipping costs, and how to follow it to your door.",
    items: [
      {
        q: "How long will my order take?",
        a: "Every Sunflora piece is hooked on demand, so nothing sits waiting on a shelf. Catalogue pieces are made and dispatched within 7–10 working days. Custom pieces take 5–14 days depending on how detailed they are — and we'll always share a timeline before we start.",
      },
      {
        q: "How much is shipping?",
        a: "Nothing at all. Shipping is free on every order, anywhere in India, with no minimum cart value. The price you see on the tag is the price you pay.",
      },
      {
        q: "Where do you ship?",
        a: "Across India, to any pincode — metros, small towns and everywhere in between, via India Post or Delhivery. We're not shipping internationally just yet, but if you're abroad and your heart is set on a piece, write to us and we'll see what we can do.",
      },
      {
        q: "How do I track my order?",
        a: "You'll get a tracking link by email the moment your piece is dispatched. You can also check any time on our Track Order page with your order number (it looks like ORD-A1B2C3D4) and the email you used at checkout.",
      },
      {
        q: "I need it by a certain date — can you manage that?",
        a: "Often, yes. Tell us the date before you order and we'll tell you honestly whether it's possible rather than promising and scrambling. Birthdays, anniversaries and weddings are most of what we make, so we're used to working to a deadline — we just need to know about it early.",
      },
    ],
  },
  {
    id: "custom",
    title: "Custom Orders",
    blurb:
      "Bespoke crochet made to your reference — a character, a pet, a bouquet in someone's exact wedding colours.",
    items: [
      {
        q: "Can you make something that isn't on the site?",
        a: "That's our favourite thing to do. A specific character, your pet, a bouquet in her exact wedding colours — bring us your strangest little idea and we'll hook it from scratch. Start on our Custom Orders page.",
      },
      {
        q: "How does a custom crochet order work?",
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
      {
        q: "Can you crochet my pet or a real person?",
        a: "Yes — pet portraits and little look-alike dolls are some of the most loved things we make. Send two or three clear photos from different angles, and mention the details that matter to you: the crooked ear, the favourite jumper, the exact shade of ginger. Those small things are what make someone gasp when they open it.",
      },
      {
        q: "How much does a custom crochet piece cost?",
        a: "It depends on size and detail — how many colours, how much shaping, how many hours. For reference, our catalogue pieces run from about ₹199 for small keychains to ₹1,499 for large bouquets and bags, and custom work is quoted in that same spirit. You'll always have the quote in writing before you pay anything.",
      },
    ],
  },
  {
    id: "returns",
    title: "Payment, Returns & Care",
    blurb:
      "How to pay, what happens if something isn't right, and how to keep your piece looking new.",
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
        q: "How do I wash and care for my crochet piece?",
        a: "Spot clean only — a damp cloth and a little mild soap. Never machine wash or soak it: water gets into the stuffing, takes days to dry, and can pull the stitches out of shape. Air dry flat, away from direct sun, and give it a gentle shake to fluff it back up after travel. Every parcel comes with a care card.",
      },
      {
        q: "Will the colours fade or the yarn go fuzzy over time?",
        a: "We use good cotton yarn precisely because it holds its colour and doesn't pill the way cheap acrylic does. Keep your piece out of long hours of direct sunlight and it will look much the same in five years as it does on day one. A little softening at the edges is normal — most people think it makes a piece look more loved, not less.",
      },
      {
        q: "Can I cancel or change my order after placing it?",
        a: "If we haven't started yet, yes — just write to us quickly and we'll sort it out. Once the yarn is cut and the first rounds are stitched, a custom piece can't really be unmade, so changes after that aren't possible. When in doubt, message us: the earlier you ask, the more we can do.",
      },
    ],
  },
  {
    id: "gifting",
    title: "Gifting & Occasions",
    blurb:
      "Crochet bouquets, keepsakes and return gifts for birthdays, anniversaries and weddings.",
    items: [
      {
        q: "Do crochet flowers make a good gift?",
        a: "They're the gift people keep. A crochet bouquet says everything a real one does, except it's still on her desk three years later — no wilting, no water, no throwing it away on Sunday. For long-distance birthdays, anniversaries and 'I'm sorry' moments, it's hard to beat.",
      },
      {
        q: "Do you offer gift packaging and a handwritten note?",
        a: "Always, and at no extra cost. Every order goes out in kraft packaging with a handwritten card — that's just how we send things. If it's a gift going straight to someone else, tell us what you'd like the card to say and we'll write it in.",
      },
      {
        q: "Do you take bulk, wedding or return-gift orders?",
        a: "Yes — wedding favours, return gifts, baby showers, corporate hampers. Write to us with the quantity and the date you need them by, and we'll build a timeline that works. Bigger batches need more notice, so reach out early.",
      },
      {
        q: "How far in advance should I order for an occasion?",
        a: "For a single catalogue piece, two to three weeks before the date is comfortable. For custom work, give us three to four weeks so there's room for the design conversation and the swatch approval. For bulk and wedding orders, a month or more — and the sooner you tell us, the calmer it is for everyone.",
      },
    ],
  },
  {
    id: "craft",
    title: "About Crochet & Our Craft",
    blurb:
      "What amigurumi is, why handmade takes time, and what you're actually paying for.",
    items: [
      {
        q: "What is amigurumi?",
        a: "Amigurumi is the Japanese art of crocheting small stuffed creatures — the round-faced bunnies, bears and dinosaurs you see across our shop. It's worked in tight spirals rather than rows, which is what gives the pieces their smooth, seamless look and lets them hold their shape without a frame inside.",
      },
      {
        q: "Why do handmade crochet pieces cost more than factory toys?",
        a: "Because a machine didn't make them. A single amigurumi is thousands of individual stitches, each one pulled by hand, and a bouquet is that many times over. You're paying for hours rather than materials — plus good cotton yarn instead of the cheapest available. It's the difference between something bought and something made.",
      },
      {
        q: "How long does one piece take to make?",
        a: "A small keychain is an evening. A mid-sized amigurumi is most of a day. A large bouquet, with every petal and leaf worked separately and then assembled, can run across several days. That's why we work in small batches and why your order takes a week or two rather than shipping tomorrow.",
      },
      {
        q: "Do crochet flowers last forever?",
        a: "Effectively, yes. There's nothing in them to wilt, rot or drop petals — no water, no stems to trim, nothing to throw out. Keep them out of constant direct sun and give them an occasional dusting, and a crochet bouquet will outlast every fresh one you've ever been given.",
      },
      {
        q: "Is crochet eco-friendly?",
        a: "More than most gifting. We make to order, so nothing is mass-produced into a warehouse and later binned. We work in natural cotton, we use up leftover yarn on the small pieces, and we pack in kraft paper rather than plastic. A piece that lasts decades is the most sustainable thing we can offer.",
      },
    ],
  },
  {
    id: "about",
    title: "About Sunflora",
    blurb:
      "Who we are, what we use, and whether our pieces are safe for the smallest hands.",
    items: [
      {
        q: "What are your pieces made from?",
        a: "Soft cotton yarn and safe polyfill stuffing, chosen piece by piece. All of it stitched by hand — no machines, no shortcuts.",
      },
      {
        q: "Are crochet toys safe for babies and small children?",
        a: "Our standard pieces use securely fixed safety eyes and are best suited to ages 3+. For babies we make a fully baby-safe version with embroidered eyes and no plastic parts at all — just tell us when you order and we'll make yours that way. If it's for a newborn or a baby shower, mention it and we'll default to the safe version.",
      },
      {
        q: "Who actually makes these?",
        a: "Aru, mostly. One pair of hands, one hook, and a great many hours. Sunflora is a small studio in India — which is exactly why we work in small batches, and why your piece takes a little time.",
      },
      {
        q: "Do you have a physical store?",
        a: "Not yet — we're online only, which is part of how we keep the prices where they are. Instagram is the closest thing to a shop window: @sunfloraa.a is where new pieces go up first, usually before they reach the site.",
      },
    ],
  },
];

/* ── Homepage teaser ──────────────────────────────────────────────────────
   Four questions only, chosen because each one removes a reason not to buy:
   the wait, the cost, the risk, and "you don't have what I want". The two
   marked open are the risk-reversal pair — free shipping and returns — so
   the reassurance is visible without anyone having to click. */

export interface HomeFaqItem extends FaqItem {
  defaultOpen?: boolean;
}

const allFaqs: FaqItem[] = faqGroups.flatMap((g) => g.items);

const byQuestion = (q: string, defaultOpen = false): HomeFaqItem => {
  const found = allFaqs.find((item) => item.q === q);
  if (!found) throw new Error(`[faqs] No FAQ matching question: ${q}`);
  return { ...found, defaultOpen };
};

export const homeFaqs: HomeFaqItem[] = [
  byQuestion("How long will my order take?"),
  byQuestion("How much is shipping?", true),
  byQuestion("Can I return something?", true),
  byQuestion("Can you make something that isn't on the site?"),
];
