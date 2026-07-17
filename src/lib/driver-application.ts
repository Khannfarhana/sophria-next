/**
 * The chauffeur application contract, shared by the form and the server action.
 *
 * This lives outside the page component on purpose. Every rule used to be
 * client-side only, and submitDriverApplicationAction — a public HTTP endpoint,
 * like every server action — did no runtime validation at all: it took a typed
 * object and upserted it. Anyone signed in could POST a 5,000-character
 * `languages`, an experience of 9999, or a null photo and have it persisted.
 * The same schema now runs on both sides.
 */

import { z } from "zod";
import { REQUIRED_DOC_KEYS } from "@/lib/driver-docs";

/**
 * Bump when the chauffeur terms text changes materially, so a later revision
 * cannot silently reinterpret consent already given. Stored per applicant.
 */
export const CHAUFFEUR_TERMS_VERSION = "2026-07-16";

/** Client requirement (13 Jul): "minimum of 3 years experience". */
export const MIN_EXPERIENCE_YEARS = 3;

export const PROVINCES = [
  "Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan",
  "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island",
  "Northwest Territories", "Yukon", "Nunavut",
];
export const WORK_AUTH = ["Canadian Citizen", "Permanent Resident", "Valid Work Permit", "Other"];
export const AVAILABILITY = ["Full-time", "Part-time", "Weekends only", "Evenings only", "Flexible"];
export const LICENCE_CLASSES = ["G", "G2", "Other / out of province"];
/** Client requirement: "Luxury Sedan or SUV with limousine plate". */
export const VEHICLE_CLASSES = [
  { value: "sedan", label: "Luxury sedan" },
  { value: "suv", label: "Luxury SUV" },
];

const CURRENT_YEAR = 2026;

export const driverApplicationSchema = z.object({
  // Personal
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(40),
  city: z.string().trim().min(1, "City of residence is required").max(100),
  province: z.string().trim().min(1, "Select your province/state").max(60),
  workAuthorization: z.string().trim().min(1, "Select your work authorization").max(60),
  languages: z.string().trim().min(1, "Languages spoken is required").max(200),
  availability: z.string().trim().min(1, "Select your availability").max(60),
  referral: z.string().trim().max(100).optional(),

  // Professional
  license: z.string().trim().min(3, "Licence number is required").max(60),
  licenceClass: z
    .string()
    .trim()
    .min(1, "Select your licence class")
    .refine((v) => v === "G", {
      message: "A full Ontario G licence is required to drive for hire.",
    }),
  experience: z.coerce
    .number({ message: "Enter your years of experience" })
    .int("Enter whole years")
    .min(MIN_EXPERIENCE_YEARS, `At least ${MIN_EXPERIENCE_YEARS} years of driving experience is required.`)
    .max(60, "Enter a realistic number of years"),

  // Vehicle — drivers bring their own; see migration 20260716150000.
  vehicleClass: z
    .string()
    .trim()
    .refine((v) => VEHICLE_CLASSES.some((c) => c.value === v), {
      message: "Select a luxury sedan or SUV",
    }),
  vehicleMake: z.string().trim().min(1, "Vehicle make is required").max(60),
  vehicleModel: z.string().trim().min(1, "Vehicle model is required").max(60),
  vehicleYear: z.coerce
    .number({ message: "Enter the vehicle year" })
    .int()
    .min(1980, "Enter a valid vehicle year")
    .max(CURRENT_YEAR + 1, "Enter a valid vehicle year"),
  limoPlate: z.string().trim().min(2, "Limousine plate is required").max(20),

  termsAccepted: z.literal(true, { message: "You must accept the chauffeur terms to apply." }),
});

export type DriverApplicationInput = z.infer<typeof driverApplicationSchema>;

/** Per-step slices, so each step validates only what it shows. */
export const stepSchemas = [
  driverApplicationSchema.pick({
    fullName: true, email: true, phone: true, city: true,
    province: true, workAuthorization: true, languages: true, availability: true,
  }),
  driverApplicationSchema.pick({ license: true, licenceClass: true, experience: true }),
  driverApplicationSchema.pick({
    vehicleClass: true, vehicleMake: true, vehicleModel: true, vehicleYear: true, limoPlate: true,
  }),
];

export const FORM_STEPS = ["Personal", "Professional", "Vehicle", "Photo & Docs"];

/**
 * Every document is mandatory, per the client. Returns the labels of anything
 * missing so the UI can name them rather than saying "something's missing".
 */
export function missingDocKeys(provided: string[]): string[] {
  const have = new Set(provided);
  return REQUIRED_DOC_KEYS.filter((k) => !have.has(k));
}
