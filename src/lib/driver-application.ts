/**
 * The chauffeur application contract, shared by the form and the server action.
 *
 * This lives outside the page component on purpose. Every rule used to be
 * client-side only, and submitDriverApplicationAction — a public HTTP endpoint,
 * like every server action — did no runtime validation at all: it took a typed
 * object and upserted it. Anyone signed in could POST a 5,000-character
 * `languages`, an experience of 9999, or a null photo and have it persisted.
 * The same schema now runs on both sides.
 *
 * Two application types (23 Jul):
 *   owner_operator — brings their own vehicle. The client's 14 Jul "nothing is
 *     optional" instruction applies in full: vehicle details and every vehicle
 *     document stay mandatory.
 *   fleet_driver — applies to drive a SophRia fleet car. No vehicle to declare
 *     or document, so the vehicle step and vehicle paperwork don't exist for
 *     them. Person-proving requirements are identical for both.
 */

import { z } from "zod";
import { requiredDocKeysFor, type ApplicationType } from "@/lib/driver-docs";

export type { ApplicationType };

/**
 * Bump when the chauffeur terms text changes materially, so a later revision
 * cannot silently reinterpret consent already given. Stored per applicant.
 */
export const CHAUFFEUR_TERMS_VERSION = "2026-07-16";

/** Client requirement (13 Jul): "minimum of 3 years experience". */
export const MIN_EXPERIENCE_YEARS = 3;

export const APPLICATION_TYPES: {
  value: ApplicationType;
  label: string;
  description: string;
}[] = [
  {
    value: "fleet_driver",
    label: "Drive a SophRia vehicle",
    description:
      "You're a professional chauffeur without your own car. Drive one of our fleet vehicles — no vehicle paperwork needed.",
  },
  {
    value: "owner_operator",
    label: "Bring your own vehicle",
    description:
      "You own a luxury sedan or SUV on a limousine plate and want to onboard it with you. Vehicle documents required.",
  },
];

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

/** Fields that vouch for the person — identical for both application types. */
const personFields = {
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

  termsAccepted: z.literal(true, { message: "You must accept the chauffeur terms to apply." }),
};

/** Fields that describe the applicant's own car — owner-operators only. */
const vehicleFields = {
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
};

const fleetDriverSchema = z.object({
  applicationType: z.literal("fleet_driver"),
  ...personFields,
});

const ownerOperatorSchema = z.object({
  applicationType: z.literal("owner_operator"),
  ...personFields,
  ...vehicleFields,
});

export const driverApplicationSchema = z.discriminatedUnion("applicationType", [
  ownerOperatorSchema,
  fleetDriverSchema,
]);

export type DriverApplicationInput = z.infer<typeof driverApplicationSchema>;

/**
 * Wizard stages. Keys are persisted in driver_application_drafts.stage (and
 * filtered on by the admin funnel), so treat them as a stable vocabulary.
 */
export type ApplicationStage = "personal" | "professional" | "vehicle" | "documents";

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  personal: "Personal details",
  professional: "Professional details",
  vehicle: "Vehicle",
  documents: "Photo & documents",
};

export interface WizardStep {
  key: ApplicationStage;
  title: string;
  /** Validates just the fields this step shows; the last step has none (docs are checked separately). */
  schema: z.ZodType | null;
}

const personalStep: WizardStep = {
  key: "personal",
  title: "Personal",
  schema: z.object({
    fullName: personFields.fullName,
    email: personFields.email,
    phone: personFields.phone,
    city: personFields.city,
    province: personFields.province,
    workAuthorization: personFields.workAuthorization,
    languages: personFields.languages,
    availability: personFields.availability,
  }),
};

const professionalStep: WizardStep = {
  key: "professional",
  title: "Professional",
  schema: z.object({
    license: personFields.license,
    licenceClass: personFields.licenceClass,
    experience: personFields.experience,
  }),
};

const vehicleStep: WizardStep = {
  key: "vehicle",
  title: "Vehicle",
  schema: z.object(vehicleFields),
};

const documentsStep: WizardStep = { key: "documents", title: "Photo & Docs", schema: null };

/** The steps an application of this type walks through, in order. */
export function wizardStepsFor(type: ApplicationType): WizardStep[] {
  return type === "owner_operator"
    ? [personalStep, professionalStep, vehicleStep, documentsStep]
    : [personalStep, professionalStep, documentsStep];
}

/**
 * Every document required FOR THE GIVEN TYPE is mandatory. Returns the keys of
 * anything missing so the UI can name them rather than saying "something's
 * missing".
 */
export function missingDocKeys(provided: string[], type: ApplicationType): string[] {
  const have = new Set(provided);
  return requiredDocKeysFor(type).filter((k) => !have.has(k));
}
