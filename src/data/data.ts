/**
 * ============================================================================
 *  SophRia — Mock Database  (src/data/data.ts)
 * ============================================================================
 *  An in-memory stand-in for the Supabase Postgres database. It mirrors the
 *  real schema 1:1 so it can run the app without a live connection AND be
 *  pushed to Supabase later (see `supabase/seed.sql`).
 *
 *  Conventions (kept Postgres / Supabase friendly):
 *   - snake_case column names
 *   - UUID primary keys (string)
 *   - ISO-8601 timestamptz strings for created_at / updated_at
 *   - foreign keys reference the parent row's `id`
 *   - enums modelled as string unions (match the DB enum types)
 *
 *  Row types are imported from the generated Supabase types, so any schema
 *  drift surfaces as a TypeScript error here.
 * ============================================================================
 */

import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type Profile = Tables["profiles"]["Row"];
export type UserRole = Tables["user_roles"]["Row"];
export type Driver = Tables["drivers"]["Row"];
export type DriverDocument = Tables["driver_documents"]["Row"];
export type Vehicle = Tables["vehicles"]["Row"];
export type Booking = Tables["bookings"]["Row"];
export type Payment = Tables["payments"]["Row"];

export type AppRole = Database["public"]["Enums"]["app_role"];
export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type DocStatus = Database["public"]["Enums"]["doc_status"];
export type VehicleType = Database["public"]["Enums"]["vehicle_type"];

/** Fixed clock so seed data is deterministic. */
const NOW = "2026-06-30T12:00:00.000Z";
const iso = (d: string) => new Date(d).toISOString();

/* ------------------------------------------------------------------ *
 *  Stable UUIDs (so foreign keys line up across tables)
 * ------------------------------------------------------------------ */
const ID = {
  // profiles / users
  admin: "00000000-0000-4000-a000-000000000001",
  customer1: "00000000-0000-4000-a000-000000000002",
  customer2: "00000000-0000-4000-a000-000000000003",
  driverUser1: "00000000-0000-4000-a000-000000000011",
  driverUser2: "00000000-0000-4000-a000-000000000012",
  driverUser3: "00000000-0000-4000-a000-000000000013",
  // drivers
  driver1: "00000000-0000-4000-b000-000000000011",
  driver2: "00000000-0000-4000-b000-000000000012",
  driver3: "00000000-0000-4000-b000-000000000013",
  // vehicles
  vSedan: "00000000-0000-4000-c000-000000000001",
  vBusiness: "00000000-0000-4000-c000-000000000002",
  vSuv: "00000000-0000-4000-c000-000000000003",
  vLimo: "00000000-0000-4000-c000-000000000004",
  vSprinter: "00000000-0000-4000-c000-000000000005",
  // bookings
  b1: "00000000-0000-4000-d000-000000000001",
  b2: "00000000-0000-4000-d000-000000000002",
  b3: "00000000-0000-4000-d000-000000000003",
  b4: "00000000-0000-4000-d000-000000000004",
  b5: "00000000-0000-4000-d000-000000000005",
} as const;

/* ================================================================== *
 *  profiles
 * ================================================================== */
export const profiles: Profile[] = [
  { id: ID.admin, full_name: "SophRia Operations", email: "ops@sophria.example", phone: "+1 (416) 555-0188", created_at: NOW, updated_at: NOW },
  { id: ID.customer1, full_name: "Jordan Avery", email: "jordan.avery@example.com", phone: "+1 (416) 555-0123", created_at: NOW, updated_at: NOW },
  { id: ID.customer2, full_name: "Priya Nair", email: "priya.nair@example.com", phone: "+1 (647) 555-0456", created_at: NOW, updated_at: NOW },
  { id: ID.driverUser1, full_name: "Marcus Bennett", email: "marcus.bennett@example.com", phone: "+1 (416) 555-0777", created_at: NOW, updated_at: NOW },
  { id: ID.driverUser2, full_name: "Elena Rossi", email: "elena.rossi@example.com", phone: "+1 (647) 555-0888", created_at: NOW, updated_at: NOW },
  { id: ID.driverUser3, full_name: "Sam Okafor", email: "sam.okafor@example.com", phone: "+1 (905) 555-0999", created_at: NOW, updated_at: NOW },
];

/* ================================================================== *
 *  user_roles   (a user can hold multiple roles)
 * ================================================================== */
export const user_roles: UserRole[] = [
  { id: "00000000-0000-4000-e000-000000000001", user_id: ID.admin, role: "admin", created_at: NOW },
  { id: "00000000-0000-4000-e000-000000000002", user_id: ID.customer1, role: "customer", created_at: NOW },
  { id: "00000000-0000-4000-e000-000000000003", user_id: ID.customer2, role: "customer", created_at: NOW },
  { id: "00000000-0000-4000-e000-000000000004", user_id: ID.driverUser1, role: "driver", created_at: NOW },
  { id: "00000000-0000-4000-e000-000000000005", user_id: ID.driverUser2, role: "driver", created_at: NOW },
  { id: "00000000-0000-4000-e000-000000000006", user_id: ID.driverUser3, role: "driver", created_at: NOW },
];

/* ================================================================== *
 *  vehicles
 *  NOTE: `type` is constrained to the `vehicle_type` enum
 *        (sedan | business | suv | limousine | party_bus).
 *        Expanding the fleet (Sprinter/coach/bus as first-class types)
 *        needs a migration to extend that enum — see plan §4 / Phase 2.
 * ================================================================== */
export const vehicles: Vehicle[] = [
  {
    id: ID.vSedan,
    name: "Luxury Sedan",
    type: "sedan",
    capacity: 3,
    luggage: 2,
    base_rate: 95,
    hourly_rate: 75,
    features: ["Mercedes E-Class / Cadillac CT6", "Leather interior", "Bottled water", "Phone chargers"],
    description: "Refined executive sedan for airport transfers, corporate travel, and private city rides.",
    image_url: "/vehicles/sedan.jpg",
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.vBusiness,
    name: "Business Class",
    type: "business",
    capacity: 3,
    luggage: 3,
    base_rate: 130,
    hourly_rate: 95,
    features: ["Mercedes S-Class", "Extra legroom", "Privacy partition", "Onboard Wi-Fi"],
    description: "First-class comfort for executives and VIP airport coordination.",
    image_url: "/vehicles/business.jpg",
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.vSuv,
    name: "Luxury SUV",
    type: "suv",
    capacity: 6,
    luggage: 5,
    base_rate: 145,
    hourly_rate: 110,
    features: ["Cadillac Escalade / GMC Yukon", "Seats up to 6", "Ample luggage", "Winter-ready"],
    description: "Spacious luxury SUV for family transfers, group travel, and extra luggage capacity.",
    image_url: "/vehicles/suv.jpg",
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.vLimo,
    name: "Stretch Limousine",
    type: "limousine",
    capacity: 8,
    luggage: 4,
    base_rate: 260,
    hourly_rate: 180,
    features: ["Lincoln Stretch", "Mood lighting", "Premium sound", "Champagne service"],
    description: "Elegant stretch limousine — the ultimate statement for weddings and special events.",
    image_url: "/vehicles/limo.jpg",
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.vSprinter,
    name: "Executive Sprinter",
    type: "party_bus",
    capacity: 14,
    luggage: 10,
    base_rate: 320,
    hourly_rate: 220,
    features: ["Mercedes-Benz Sprinter", "Standing room", "Group transport", "Event-ready"],
    description: "Corporate shuttle and group transport for airport groups and private event transfers.",
    image_url: "/vehicles/sprinter.jpg",
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  },
];

/* ================================================================== *
 *  drivers
 * ================================================================== */
export const drivers: Driver[] = [
  { id: ID.driver1, user_id: ID.driverUser1, license_number: "ON-DR-44821", experience_years: 8, rating: 4.9, total_earnings: 18250, is_available: true, is_verified: true, created_at: NOW, updated_at: NOW },
  { id: ID.driver2, user_id: ID.driverUser2, license_number: "ON-DR-77310", experience_years: 5, rating: 4.8, total_earnings: 12940, is_available: false, is_verified: true, created_at: NOW, updated_at: NOW },
  { id: ID.driver3, user_id: ID.driverUser3, license_number: "ON-DR-90155", experience_years: 3, rating: 0, total_earnings: 0, is_available: false, is_verified: false, created_at: NOW, updated_at: NOW },
];

/* ================================================================== *
 *  driver_documents
 * ================================================================== */
export const driver_documents: DriverDocument[] = [
  { id: "00000000-0000-4000-f000-000000000001", driver_id: ID.driver3, doc_type: "drivers_license", file_url: "/docs/sam-license.pdf", status: "pending", notes: null, created_at: NOW, updated_at: NOW },
  { id: "00000000-0000-4000-f000-000000000002", driver_id: ID.driver3, doc_type: "insurance", file_url: "/docs/sam-insurance.pdf", status: "pending", notes: null, created_at: NOW, updated_at: NOW },
  { id: "00000000-0000-4000-f000-000000000003", driver_id: ID.driver1, doc_type: "drivers_license", file_url: "/docs/marcus-license.pdf", status: "approved", notes: "Verified 2025", created_at: NOW, updated_at: NOW },
];

/* ================================================================== *
 *  bookings   (variety across statuses + trip types)
 * ================================================================== */
export const bookings: Booking[] = [
  {
    id: ID.b1,
    reference: "SR-7F3A2K",
    customer_id: ID.customer1,
    driver_id: null,
    vehicle_id: ID.vSedan,
    trip_type: "one_way",
    pickup_location: "100 Front St W, Toronto",
    dropoff_location: "Toronto Pearson (YYZ)",
    pickup_datetime: iso("2026-07-02T09:30:00-04:00"),
    duration_hours: null,
    flight_number: null,
    passenger_count: 1,
    luggage_count: 2,
    fare_estimate: 95,
    passenger_name: "Jordan Avery",
    passenger_phone: "+1 (416) 555-0123",
    special_requests: "Meet at the lobby.",
    status: "pending",
    payment_status: "pending",
    stripe_payment_id: null,
    rejection_reason: null,
    rejection_notes: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.b2,
    reference: "SR-K92BX1",
    customer_id: ID.customer2,
    driver_id: null,
    vehicle_id: ID.vBusiness,
    trip_type: "airport",
    pickup_location: "Toronto Pearson (YYZ), Terminal 1",
    dropoff_location: "Ritz-Carlton, 181 Wellington St W",
    pickup_datetime: iso("2026-07-03T18:15:00-04:00"),
    duration_hours: null,
    flight_number: "AC 118",
    passenger_count: 2,
    luggage_count: 3,
    fare_estimate: 145,
    passenger_name: "Priya Nair",
    passenger_phone: "+1 (647) 555-0456",
    special_requests: "Flight from Vancouver — please track.",
    status: "confirmed",
    payment_status: "pending",
    stripe_payment_id: null,
    rejection_reason: null,
    rejection_notes: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.b3,
    reference: "SR-M5QD7P",
    customer_id: ID.customer1,
    driver_id: ID.driver1,
    vehicle_id: ID.vSuv,
    trip_type: "hourly",
    pickup_location: "King West, Toronto",
    dropoff_location: "As directed (hourly)",
    pickup_datetime: iso("2026-07-05T11:00:00-04:00"),
    duration_hours: 4,
    flight_number: null,
    passenger_count: 4,
    luggage_count: 2,
    fare_estimate: 440,
    passenger_name: "Jordan Avery",
    passenger_phone: "+1 (416) 555-0123",
    special_requests: "Multi-stop: showroom visits.",
    status: "driver_assigned",
    payment_status: "pending",
    stripe_payment_id: null,
    rejection_reason: null,
    rejection_notes: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: ID.b4,
    reference: "SR-T1W8RC",
    customer_id: ID.customer2,
    driver_id: ID.driver2,
    vehicle_id: ID.vLimo,
    trip_type: "one_way",
    pickup_location: "Casa Loma, 1 Austin Terrace",
    dropoff_location: "The Carlu, 444 Yonge St",
    pickup_datetime: iso("2026-06-20T16:00:00-04:00"),
    duration_hours: null,
    flight_number: null,
    passenger_count: 6,
    luggage_count: 0,
    fare_estimate: 260,
    passenger_name: "Priya Nair",
    passenger_phone: "+1 (647) 555-0456",
    special_requests: "Wedding party.",
    status: "completed",
    payment_status: "paid",
    stripe_payment_id: "pi_mock_3a91",
    rejection_reason: null,
    rejection_notes: null,
    created_at: iso("2026-06-18T10:00:00-04:00"),
    updated_at: iso("2026-06-20T18:30:00-04:00"),
  },
  {
    id: ID.b5,
    reference: "SR-Z0H4VN",
    customer_id: ID.customer1,
    driver_id: null,
    vehicle_id: ID.vSedan,
    trip_type: "one_way",
    pickup_location: "Union Station, Toronto",
    dropoff_location: "Mississauga, ON",
    pickup_datetime: iso("2026-06-25T08:00:00-04:00"),
    duration_hours: null,
    flight_number: null,
    passenger_count: 1,
    luggage_count: 1,
    fare_estimate: 95,
    passenger_name: "Jordan Avery",
    passenger_phone: "+1 (416) 555-0123",
    special_requests: null,
    status: "cancelled",
    payment_status: "refunded",
    stripe_payment_id: null,
    rejection_reason: null,
    rejection_notes: null,
    created_at: iso("2026-06-22T09:00:00-04:00"),
    updated_at: iso("2026-06-24T09:00:00-04:00"),
  },
];

/* ================================================================== *
 *  payments
 * ================================================================== */
export const payments: Payment[] = [
  { id: "00000000-0000-4000-a100-000000000001", booking_id: ID.b4, amount: 260, currency: "CAD", status: "paid", stripe_id: "pi_mock_3a91", created_at: iso("2026-06-20T18:30:00-04:00"), updated_at: iso("2026-06-20T18:30:00-04:00") },
  { id: "00000000-0000-4000-a100-000000000002", booking_id: ID.b5, amount: 95, currency: "CAD", status: "refunded", stripe_id: "pi_mock_8b22", created_at: iso("2026-06-22T09:05:00-04:00"), updated_at: iso("2026-06-24T09:00:00-04:00") },
];

/* ================================================================== *
 *  CONTENT COLLECTIONS
 *  Not yet Supabase tables — modelled with proper schema (slug PK,
 *  sort_order) so they can graduate to tables later. See plan §4.
 * ================================================================== */

export interface Service {
  slug: string;
  title: string;
  blurb: string;
  /** lucide icon name, resolved in the UI */
  icon: string;
  from_price: number | null;
  sort_order: number;
  is_active: boolean;
}

export const services: Service[] = [
  { slug: "airport-transfers", title: "Airport Transfers", blurb: "Stress-free Pearson & Billy Bishop pickups with live flight tracking, professional greet service, and complimentary wait time.", icon: "Plane", from_price: 95, sort_order: 1, is_active: true },
  { slug: "city-to-city", title: "City-to-City Transfers", blurb: "Reliable long-distance transfers — Toronto to Niagara, Muskoka, and beyond — with fixed pricing and premium comfort.", icon: "Route", from_price: 220, sort_order: 2, is_active: true },
  { slug: "hourly", title: "Hourly Car Service", blurb: "A dedicated chauffeur on standby for meetings, retail trips, events, and multi-stop itineraries.", icon: "Clock", from_price: 95, sort_order: 3, is_active: true },
  { slug: "limousine", title: "Limousine Service", blurb: "Traditional elegance for weddings, corporate events, proms, and VIP celebrations.", icon: "Sparkles", from_price: 260, sort_order: 4, is_active: true },
  { slug: "corporate", title: "Corporate Travel", blurb: "One polished booking experience for executives, business events, and VIP airport coordination.", icon: "Briefcase", from_price: 130, sort_order: 5, is_active: true },
];

/** Small extras advertised alongside services. */
export const serviceExtras: string[] = [
  "Airport pickups", "Airport drop-off", "Special events", "Sightseeing tours",
  "Wine tours", "Group transportation", "Wedding events", "Business pickups",
  "Baby seat available", "Cold water provided", "Meet & greet", "Flight tracking",
];

export interface ServiceArea {
  slug: string;
  name: string;
  region: string;
  is_featured: boolean;
}

/** GTA-focused coverage (plan decision: Toronto / GTA). */
export const serviceAreas: ServiceArea[] = [
  { slug: "toronto", name: "Toronto", region: "GTA", is_featured: true },
  { slug: "mississauga", name: "Mississauga", region: "GTA", is_featured: true },
  { slug: "brampton", name: "Brampton", region: "GTA", is_featured: true },
  { slug: "vaughan", name: "Vaughan", region: "GTA", is_featured: true },
  { slug: "markham", name: "Markham", region: "GTA", is_featured: true },
  { slug: "richmond-hill", name: "Richmond Hill", region: "GTA", is_featured: false },
  { slug: "oakville", name: "Oakville", region: "Halton", is_featured: true },
  { slug: "burlington", name: "Burlington", region: "Halton", is_featured: false },
  { slug: "pickering", name: "Pickering", region: "Durham", is_featured: false },
  { slug: "ajax", name: "Ajax", region: "Durham", is_featured: false },
  { slug: "scarborough", name: "Scarborough", region: "Toronto", is_featured: false },
  { slug: "etobicoke", name: "Etobicoke", region: "Toronto", is_featured: false },
  { slug: "north-york", name: "North York", region: "Toronto", is_featured: false },
  { slug: "niagara", name: "Niagara-on-the-Lake", region: "Day trips", is_featured: true },
  { slug: "muskoka", name: "Muskoka", region: "Day trips", is_featured: false },
];

export interface Testimonial {
  id: string;
  author: string;
  source: string;
  rating: number;
  quote: string;
  sort_order: number;
}

export const testimonials: Testimonial[] = [
  { id: "t1", author: "Daniel R.", source: "Google", rating: 5, quote: "Vehicle was spotless, comfortable and smoke-free. Driver was early and professional.", sort_order: 1 },
  { id: "t2", author: "Aisha K.", source: "Google", rating: 5, quote: "Excellent service. Top notch. Super clean vehicle and a courteous chauffeur.", sort_order: 2 },
  { id: "t3", author: "Michael T.", source: "Google", rating: 5, quote: "Flawless airport pickup — they tracked my delayed flight and were waiting when I landed.", sort_order: 3 },
  { id: "t4", author: "Sophie L.", source: "Google", rating: 5, quote: "Booked the limousine for our wedding. Punctual, elegant, and beyond accommodating.", sort_order: 4 },
  { id: "t5", author: "Raj P.", source: "Google", rating: 5, quote: "Use them for every corporate roadshow now. Reliable, discreet, always on time.", sort_order: 5 },
];

/* ================================================================== *
 *  DB facade + tiny query helpers
 *  Lets callers treat this like a database while we have no live
 *  Supabase. Mirrors a subset of common access patterns.
 * ================================================================== */
export const db = {
  profiles,
  user_roles,
  drivers,
  driver_documents,
  vehicles,
  bookings,
  payments,
  // content
  services,
  serviceExtras,
  serviceAreas,
  testimonials,
} as const;

export const queries = {
  activeVehicles: () =>
    [...vehicles].filter((v) => v.is_active).sort((a, b) => Number(a.base_rate) - Number(b.base_rate)),
  vehicleById: (id: string) => vehicles.find((v) => v.id === id) ?? null,
  vehicleByType: (type: VehicleType) => vehicles.find((v) => v.type === type) ?? null,
  bookingsByCustomer: (customerId: string) =>
    bookings
      .filter((b) => b.customer_id === customerId)
      .sort((a, b) => +new Date(b.pickup_datetime) - +new Date(a.pickup_datetime)),
  bookingsByDriver: (driverId: string) =>
    bookings.filter((b) => b.driver_id === driverId),
  rolesForUser: (userId: string) =>
    user_roles.filter((r) => r.user_id === userId).map((r) => r.role),
  profileById: (id: string) => profiles.find((p) => p.id === id) ?? null,
  driverById: (id: string) => drivers.find((d) => d.id === id) ?? null,
  availableDrivers: () =>
    drivers
      .filter((d) => d.is_verified && d.is_available)
      .sort((a, b) => Number(b.rating) - Number(a.rating)),
  activeServices: () => [...services].filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order),
  serviceBySlug: (slug: string) => services.find((s) => s.slug === slug) ?? null,
  featuredAreas: () => serviceAreas.filter((a) => a.is_featured),
};

export default db;
