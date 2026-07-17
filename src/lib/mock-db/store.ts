/**
 * File-backed mock store (server-only).
 *
 * Persists the mock database to `<project>/.mock-db/db.json` so CRUD survives
 * reloads and restarts — it behaves like a real database during local dev.
 * Seeded from src/data/data.ts on first access. Falls back to in-memory if the
 * filesystem is read-only (e.g. serverless). Only ever imported by server code.
 */
import fs from "node:fs";
import path from "node:path";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  profiles as seedProfiles,
  user_roles as seedRoles,
  drivers as seedDrivers,
  driver_documents as seedDocs,
  vehicles as seedVehicles,
  bookings as seedBookings,
  payments as seedPayments,
  type Profile,
  type UserRole,
  type Driver,
  type DriverDocument,
  type Vehicle,
  type Booking,
  type Payment,
} from "@/data/data";

export interface MockDB {
  profiles: Profile[];
  user_roles: UserRole[];
  drivers: Driver[];
  driver_documents: DriverDocument[];
  vehicles: Vehicle[];
  bookings: Booking[];
  payments: Payment[];
}

const DIR = path.join(process.cwd(), ".mock-db");
const FILE = path.join(DIR, "db.json");

/** In-memory fallback when the filesystem can't be written. */
let memory: MockDB | null = null;

function seed(): MockDB {
  return structuredClone({
    profiles: seedProfiles,
    user_roles: seedRoles,
    drivers: seedDrivers,
    driver_documents: seedDocs,
    vehicles: seedVehicles,
    bookings: seedBookings,
    payments: seedPayments,
  });
}

/**
 * Refuse to touch the mock store when the app is wired to a real database.
 *
 * Every function in mock-db/actions.ts is exported from a "use server" module,
 * so each is a public POST endpoint in EVERY build — a production build
 * registers 25 of them, reachable on /admin, /book, /dashboard and /driver.
 * None of them authenticates or checks ownership: they take a caller-supplied
 * id and act on it (mockPayBooking marks a booking paid; mockVerifyDriver
 * verifies a driver; mockBookingOtp returns any ride's start code). /dashboard
 * and /book carry no role requirement, so any signed-in user can reach that
 * subset.
 *
 * With Supabase configured, nothing legitimate calls these — the pages all
 * branch on SUPABASE_ENABLED first — so failing loudly here costs nothing and
 * removes the surface entirely. This is the backstop for the case where mock
 * mode is reached by accident rather than intent.
 *
 * Every mock action funnels through readDB/mutateDB (mockRejectBooking via
 * patchBooking), so this one gate covers all of them.
 */
function assertMockMode(): void {
  if (SUPABASE_ENABLED) {
    throw new Error(
      "Mock DB is unavailable: the app is configured to use Supabase. " +
        "Set NEXT_PUBLIC_USE_MOCK_DB=1 to run against the mock store.",
    );
  }
}

export function readDB(): MockDB {
  assertMockMode();
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as MockDB;
  } catch {
    if (memory) return memory;
    const fresh = seed();
    writeDB(fresh);
    return fresh;
  }
}

function writeDB(db: MockDB) {
  memory = db;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch {
    /* read-only fs — keep the in-memory copy for this process */
  }
}

/** Read-modify-write helper. The callback mutates `db` in place. */
export function mutateDB<T>(fn: (db: MockDB) => T): T {
  assertMockMode(); // readDB() also asserts; explicit here so writes fail fast.
  const db = readDB();
  const result = fn(db);
  writeDB(db);
  return result;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newReference(): string {
  const s = crypto.randomUUID().replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return `SR-${s}`;
}
