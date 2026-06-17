# according to — Business Plan

*Last updated: June 2026*

## One-liner

**Substack for links.** A publishing platform where curators save the best things they find on the internet, organize them into lists, and build an audience of people who trust their taste. A "find" recommended by someone you trust is worth more than ten search results.

---

## The Problem

- **Discovery is broken.** Search is SEO-gamed, social feeds are algorithmic slop, and AI answers strip away the human who vouched for the thing. The most reliable discovery channel left is *"a person I trust told me about it"* — and that channel has no platform.
- **Curation has no home.** People who find great things share them into the void: a tweet that dies in an hour, a link in a group chat, a newsletter that takes hours to write. There's no low-effort way to turn consistent good taste into a durable, followable body of work.
- **Bookmarking tools solved the wrong problem.** Pocket, Raindrop, and Pinboard treat saved links as a private filing cabinet. The value of a great find isn't storage — it's *transmission*.

## The Product

A curator saves a link in one click (Chrome extension or web). The platform does the rest:

- **Instant beautiful pages** — every save becomes a visual card (og:image or live screenshot); every curator gets a public page (`according-to.com/username`) that looks publication-quality with zero design effort.
- **Lists as the unit of publishing** — finds are organized into purposeful lists ("tools I actually use," "essays that changed my mind") with stable public URLs. Lists answer *why* this collection exists, not just what's in it.
- **AI that removes friction, not humans** — Claude suggests list names and writes first-draft bios; semantic search makes any past find recoverable. The taste is always the human's.
- **Magic-first onboarding** — a new user answers three questions and sees their page built *before* creating an account. The aha moment precedes the signup wall.
- **Subscribe/follow** — readers follow curators they trust; the relationship, not the algorithm, drives distribution.

## Market & Comparables

| Company | Lesson for us |
|---|---|
| Substack | Free publishing + 10% of paid subscriptions can build a billion-dollar network. Writers came for free tools, stayed for audience, monetized when ready. |
| Letterboxd / Goodreads | Taste-graph networks in a single vertical (film, books) sustain millions of users and exit valuations in the hundreds of millions. We are the horizontal version: links are every vertical. |
| are.na | ~$8.5/mo premium proves people pay for curation tools — but its deliberately anti-social design caps its network. We keep the soul, add the audience loop. |
| Wirecutter / Goodreads affiliate | Recommendation context is the highest-converting placement for affiliate links. |
| Pocket (shut down 2025) | Private-filing-cabinet bookmarking is a dead end. The market gap is *public* curation. |

**Why now:** AI-generated content is flooding every feed, making human-vouched recommendations scarcer and more valuable. Substack normalized "individuals as publications." The infrastructure to run this costs ~$2/month.

## Business Model

Free for readers, forever. Free for curators at the core, forever. Monetization layers on in four phases, each gated by a metric trigger — not a date.

### Phase 1 — Free everything (now)
- **Goal:** curator pages impressive enough to share; first 1,000 users.
- **Revenue:** $0 by design. Costs are ~$2/month; a pricing page today is pure friction.

### Phase 2 — Invisible monetization: affiliate links
- **Trigger:** meaningful outbound click volume (~10K clicks/month).
- **Mechanic:** product links route through an affiliate aggregator (Sovrn/Skimlinks, Amazon Associates). 1–10% of resulting purchases, disclosed in the footer. No paywall, no UX change, curators do nothing.
- **Why it fits:** the entire product is links presented in maximum-trust context. Revenue scales with traffic, not willingness to pay.
- **Build cost:** one link-rewriter function in the save pipeline + an aggregator account.

### Phase 3 — Curator Pro (~$6/mo or $50/yr)
- **Trigger:** curators organically hitting 3+ published lists and asking for audience data.
- **Free:** unlimited saves, 3 published lists, semantic search on own finds, standard page.
- **Pro:** unlimited published lists, custom domain, analytics (views, clicks, top finds), email digests to subscribers, search across followed curators, guaranteed live-screenshot cards.
- **Pricing logic:** sits in the prosumer-curation band (Raindrop ~$28/yr, are.na ~$102/yr, Readwise ~$120/yr). Annual at ~30% discount is the real revenue line.

### Phase 4 — Paid lists, 10% platform cut (the big one)
- **Trigger:** first curators with 1,000+ subscribers.
- **Mechanic:** curators charge $3–5/mo for premium lists; platform keeps ~10% + Stripe fees (Substack's model).
- **Why it's the endgame:** revenue scales with our best users' success, not our subscriber count. The only model here that gets genuinely large.

### Explicitly rejected
- **Ads / sponsored placement** — poisons the trust that is the product. "According to" only works if it's actually according to them.
- **Selling data** — same trust problem.
- **Charging readers** — kills the network effect at the root.

## Unit Economics

**Cost to run (current, ~100 active users):**

| Item | Cost |
|---|---|
| Vercel Hobby, Supabase free, Resend free, Microlink | $0 |
| Claude Haiku (tagging, list names, onboarding) | <$1/mo (~$0.001/call) |
| Voyage embeddings | ~$0 |
| ScreenshotOne | $0 (free tier) → $17/mo at scale |
| Domain | ~$2/mo amortized |
| **Total** | **~$2–19/month** |

**Marginal cost per user: effectively zero** (~$0.01/user/month in AI calls). Screenshots are captured once per link and stored permanently in Supabase — costs scale with new links, not page views.

**Scaling bills (in order of arrival):** Supabase Pro $25/mo (storage fills ~6 months after screenshot volume ramps) → Vercel Pro $20/mo (required for commercial use) → ScreenshotOne tier upgrades. Total infrastructure stays under $100/mo well past 10,000 users.

**Revenue at 1,000 users / 50 real audiences (honest math):** affiliate $50–200/mo + Pro at 3–5% conversion ≈ $200–300/mo. Break-even on infrastructure happens almost immediately; this is a low-burn network play where Phase 4 is the upside.

## Go-to-Market

1. **Curator-led seeding.** Hand-recruit 20–50 people with visible good taste (newsletter writers, "link roundup" posters, niche Discord curators). Their pages are the marketing.
2. **The page is the funnel.** Every public page and list is a shareable artifact with the brand on it. Magic-first onboarding converts visitors at the moment of intrigue — page built before account exists.
3. **Extension = retention.** One-click save from anywhere keeps curators feeding their pages daily.
4. **SEO compounding.** Public lists ("best X according to Y") are durable, indexable pages that accrete search traffic — the Goodreads/Letterboxd long game.

## Metrics That Matter

| Stage | North star | Trigger watched |
|---|---|---|
| Now | Weekly active curators (people who saved ≥1 find this week) | Pages shared organically |
| Phase 2 | Outbound clicks/month | ~10K clicks → turn on affiliate |
| Phase 3 | Curators with 3+ lists & repeat visitors | "Who's viewing my page?" asks → launch Pro |
| Phase 4 | Curators with 1K+ subscribers | First one → build paid lists |

## Risks & Honest Answers

- **Cold-start (curation needs an audience; audiences need curation).** Mitigation: the page is valuable *solo* — a beautiful self-archive — before any follower exists. Single-player utility first, network second.
- **Low willingness to pay for bookmarking.** Correct — which is why we never sell bookmarking. We sell audience (Pro) and income (paid lists), the two things curators historically pay for.
- **Platform giants copy it.** Taste networks are defensible through community, not features (Letterboxd survived Netflix; Goodreads beat Amazon's own attempts before being bought). Speed to a loyal curator base is the moat.
- **Affiliate revenue underwhelms at small scale.** Expected. It's a floor, not the model — Phases 3–4 carry the business case.
- **One founder, nights-and-weekends pace.** The phased model is sequenced so that nothing requires scale to survive: burn is ~$2/month, so the company cannot die of costs — only of stopping.

## Roadmap (next 90 days)

1. Ship affiliate-link rewriter behind a flag (ready for Phase 2 the moment traffic justifies it).
2. Add event tracking now — page views, outbound clicks, per-find clicks — so Phase 3 analytics has months of data on day one.
3. Verify Resend domain → subscriber email digests (the retention loop).
4. Recruit the first 20 curators by hand.
5. Watch the triggers, not the calendar.
