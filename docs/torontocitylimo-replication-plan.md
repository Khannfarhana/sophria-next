# SophRia × Toronto City Limo — Replication Plan

**Goal:** Replicate the *complete flow and feature set* of [torontocitylimo.ca](https://www.torontocitylimo.ca/) inside the existing SophRia app, **without changing our design language**. We take TCL's information architecture, booking flow, and content model as inspiration; we keep our luxury monochrome theme, components, and existing Supabase/next-auth backend.

> Scope note: "Keep our design theme and view level" — every new page/section reuses existing primitives (`SiteLayout`, dark hero header pattern, `eyebrow`, `bg-card`/`border-border`, `CustomSelect`, `Dialog`, the gold accent `#e7d3a8`). No new visual system.

---

## 1. Reference: what Toronto City Limo does

**Top nav:** Home · Our Fleet · Our Services · Our Blog · About · Contact Us · Partner Application · **Book Now** + phone CTA `+1 416-856-1971`.

**Hero:** "Arrive in style." with an inline booking widget — **trip-type toggle (One way / By the hour)**, pickup, drop-off, date, time → **"View options"**.

**Booking flow (the key differentiator):** location/time → **vehicle options with live quote** → passenger/contact details → confirm. Trip mode (one-way vs hourly) drives pricing.

**Services (5 cards + extras):** Airport Transfers · City-to-City Transfers · Hourly Car Service · Limousine Service · USA–Canada Cross-Border. Extras: airport pickup/drop-off, special events, sightseeing/wine tours, group transport, weddings, business pickups, baby seat, cold water.

**Fleet (6 categories w/ pax + luggage + named models):** Sedans (4 pax / 2–3 bags) · SUVs (4–6 / 3–6) · First-Class Stretch Limos (8 / 6) · Mercedes Sprinter (15 / 12) · Mini Coach (15) · Executive Bus (15–30).

**Service areas:** Toronto, Ottawa, Montreal, Quebec, Vancouver, Calgary, Edmonton + ~45 Ontario municipalities.

**Trust signals:** NEXUS border clearance, 24/7 helpline, flight tracking, complimentary wait time, door-to-door luggage, Google 5-star testimonials, "Registered & Licensed."

**Other:** Blog, Partner Application (driver/affiliate signup), footer with quick links + service areas + contact + address.

---

## 2. Gap analysis vs. current SophRia app

| Area | TCL has | SophRia today | Action |
|---|---|---|---|
| Hero booking widget | trip-type toggle, "View options" | single mode: pickup/dropoff/datetime/vehicle → Reserve | **Enhance** — add trip-type toggle + hourly/airport fields |
| Booking flow | mode-aware quote → vehicle → details | 6-step flow (Route→Date→Vehicle→Passenger→Payment→Confirmed) | **Enhance** — add trip mode step + mode-aware pricing |
| Services | 5 categories + extras + detail | 5 cards (Airport/Corporate/Wedding/Tours/Hourly), no detail pages | **Extend + add detail pages** |
| Fleet | 6 categories, pax+luggage, models | 5 types, capacity+luggage exist in schema | **Extend data + richer fleet page** |
| Service areas | dedicated coverage + city-to-city | none | **New** — Service Areas page + home section |
| Blog | listing + posts | none | **New** — static MDX/data blog |
| Partner Application | driver/affiliate form | `/become-chauffeur` exists | **Re-map / extend** |
| Testimonials | Google reviews | none | **New** — testimonials section/component |
| Trust features | NEXUS, 24/7, flight tracking… | "Why SophRia" section | **Extend** copy + icons |
| Contact | phones, address, click-to-call, 24/7 | `/contact` exists, WhatsApp button exists | **Extend** — click-to-call, hours, map |
| Footer | quick links + areas + contact + license | exists | **Extend** — add service areas column |

**Already solid (reuse as-is):** auth (next-auth + demo mode), customer dashboard, driver portal, admin ops, Supabase `bookings`/`vehicles`/`drivers`/`profiles`, server actions for the full booking lifecycle.

---

## 3. Information architecture (target)

```
/                     Home — hero widget, services, fleet teaser, why-us, service areas, testimonials, CTA
/services             Services index (5 categories + extras grid)
/services/[slug]      Service detail (airport-transfers, city-to-city, hourly, limousine, cross-border)
/fleet                Fleet index (6 categories, pax/luggage/models)
/service-areas        Coverage map + city list + city-to-city pairs
/blog                 Blog index
/blog/[slug]          Blog post
/about                About (existing)
/contact              Contact (existing, extended)
/faq                  FAQ (existing)
/partner              Partner Application  (rename/extend of /become-chauffeur, keep redirect)
/book                 Multi-step booking (extended: trip mode aware)
/auth /dashboard /driver /admin   (existing, unchanged)
```

Nav (desktop pill + mobile drawer): **Fleet · Services · Service Areas · Blog · About · Contact** + "Partner" secondary + **Book Now** primary + phone click-to-call.

---

## 4. Data model changes (Supabase)

Minimal — the schema already covers most of it.

1. **`vehicles`** — already has `capacity`, `luggage`, `hourly_rate`, `features[]`, `description`, `image_url`, `base_rate`. **Action:** seed/extend rows to the 6 TCL-style categories (add Sprinter, Mini Coach, Executive Bus; add example models to `description`/`features`). Add optional `category` + `sort_order` columns if we want grouped display.
2. **`bookings`** — add columns:
   - `trip_type` text default `'one_way'` (`one_way` | `hourly` | `airport`)
   - `duration_hours` int null (hourly)
   - `flight_number` text null (airport)
   - `passenger_count` int null, `luggage_count` int null
   - `stops` jsonb null (multi-stop itineraries)
   - extras (`baby_seat`, `meet_greet`) → fold into existing `special_requests` or a `extras text[]`.
3. **New `blog_posts`** (optional; can start as static data file): `slug`, `title`, `excerpt`, `body`, `cover_url`, `published_at`, `tags[]`.
4. **New `service_areas`** (optional; can start static): `slug`, `name`, `region`, `is_city_to_city`.

> Migrations live in Supabase. Where a table is "content only" (blog, service areas), **start with a typed local data file** (`src/lib/blog.ts`, `src/lib/service-areas.ts`) to avoid backend round-trips, and move to tables later if CMS editing is needed.

---

## 5. Pricing model (mode-aware)

Drive quote off `vehicles` rates already present:

- **one_way:** `base_rate` + distance estimate (flat tiers per area pair to start; Google Distance Matrix later).
- **hourly:** `hourly_rate × duration_hours` (min 2–3h).
- **airport:** flat zone rate (Pearson/Billy Bishop) + flight tracking note + complimentary wait.

Keep a single `lib/pricing.ts` with `quote(tripType, vehicle, params)` so the widget, `/book`, and admin all share one source of truth.

---

## 6. Component & page work (reuse existing primitives)

**New / changed components**
- `BookingWidget` → add trip-type segmented toggle (One way / Hourly / Airport) + conditional fields (duration for hourly, flight # for airport). Submit serializes to `/book?q=`.
- `TripTypeToggle` — small segmented control matching pill styling.
- `ServiceCard`, `FleetCategoryCard` — extract from existing services/fleet markup; add pax/luggage rows.
- `Testimonials` — carousel/grid of review cards (static data; gold star row).
- `ServiceAreaList` — city chips + city-to-city pairs.
- `StatRow`/`FeatureItem` for trust signals (NEXUS, 24/7, flight tracking, wait time).
- `BlogCard` + blog detail layout.
- Extend `Footer` with a Service Areas column + phone/email/address + license line.

**Booking flow (`/book`)** — extend `State` with `tripType`, `durationHours`, `flightNumber`, `passengerCount`, `luggageCount`, `extras`. Insert a **Step 1: Trip type** (or fold into Route). Make Vehicle step show pax/luggage and the **mode-aware live quote**. Wire new fields into `createBookingAction`.

**All new pages** use `SiteLayout` with the **dark hero header** pattern (`bg-[#0d0d0e] pt-36`) used by every public page, then `bg-background` content. Public pages with dark heroes keep the transparent-nav; portal pages keep `solidNav`.

---

## 7. Phased delivery

**Phase 0 — Plan & content (this doc).** Confirm scope; gather final copy (services, fleet specs, phone numbers, service-area list, 3–6 testimonials).

**Phase 1 — Booking flow parity (highest value).**
- `lib/pricing.ts`, trip-type toggle in `BookingWidget`, `/book` mode-aware step + quote, `bookings` column migration, `createBookingAction` update.

**Phase 2 — Services & Fleet depth.**
- Add City-to-City + Cross-Border services, `/services/[slug]` detail pages, extras grid.
- Extend `vehicles` seed to 6 categories; richer `/fleet` with pax/luggage/models.

**Phase 3 — Coverage, trust, social proof.**
- `/service-areas` + home Service Areas section; city-to-city pairs.
- Testimonials section on home; extend "Why SophRia" with NEXUS/24-7/flight-tracking/wait-time.
- Extend footer + contact (click-to-call, hours, address/map).

**Phase 4 — Blog & Partner.**
- `/blog` + `/blog/[slug]` (static data first). 
- Rename/extend `/become-chauffeur` → `/partner` (keep old path as redirect), align fields with TCL partner application.

**Phase 5 — Polish.**
- Nav/footer IA update, metadata/SEO per page, mobile passes, demo-mode walkthrough of full flow.

---

## 8. Explicitly out of scope (for now)
- Real distance/Google Maps pricing (use flat tiers first).
- Live Stripe charge (existing Payment step stays as-is/simulated).
- Real CMS for blog/areas (static typed data first).
- Multi-currency / multi-language.

---

## 9. Resolved decisions (confirmed)
1. **Booking modes:** build **all three — One-way + Hourly + Airport** with mode-aware pricing and conditional fields (hourly duration, airport flight #). → Phase 1.
2. **Service areas:** **Toronto / GTA focus** — keep SophRia's "Toronto chauffeur" positioning; `/service-areas` lists GTA municipalities (no multi-province/city-to-city list). City-to-City *service* stays, scoped to GTA↔nearby (Niagara, Muskoka, etc.).
3. **Contact details:** use clearly-marked **placeholder** phone/email/address (easy to swap). Add a `src/lib/site-config.ts` single source for contact info.
4. **Blog:** **deferred to last** (Phase 4). Nav omits Blog until then.
5. **Fleet:** expand toward the richer category set (pax/luggage/models); exact count finalized during Phase 2 (lean to adding Sprinter/coach/bus since modes like group/airport need them).

*Open item:* none blocking Phase 1.

---

## 10. Locked build order
1. **Phase 1 — Booking-flow parity** ✅ *done* — `lib/pricing.ts` + `lib/site-config.ts`, `TripTypeToggle`, trip-aware `BookingWidget` ("View Options"), mode-aware `/book` (trip step + live quote), `bookings` migration (`trip_type`/`duration_hours`/`flight_number`/`passenger_count`/`luggage_count`) + types + `createBookingAction`.
2. Phase 2 — Services depth + Fleet expansion.
3. Phase 3 — Service Areas (GTA) + Testimonials + trust features + footer/contact.
4. Phase 4 — Blog + Partner Application.
5. Phase 5 — Polish (nav/footer IA, SEO, mobile, demo walkthrough).

*Next step after sign-off: begin Phase 1.*
