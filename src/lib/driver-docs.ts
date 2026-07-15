/**
 * The documents a chauffeur applicant must provide, shared by the application
 * form, the server action that validates it, and the admin review dialog.
 *
 * Client instruction (14 Jul): the vehicle-for-hire licence, four-side vehicle
 * photos with the limo plate visible at the front, commercial insurance, proof
 * of the right to work in Canada, vehicle safety and vehicle ownership — and
 * "nothing is optional, this part is all mandatory".
 *
 * Doc keys used to be invented at each call site: the form wrote
 * `license_doc`/`background` while the seed wrote `drivers_license`/`insurance`,
 * and the review dialog mapped all four to paper over it. `doc_type` is bare
 * text with no constraint, so both vocabularies are already in the live table —
 * hence LEGACY_DOC_LABELS below, which keeps old rows readable rather than
 * rewriting history.
 */

export interface DriverDoc {
  key: string;
  label: string;
  hint: string;
}

/** Paperwork. All required. */
export const DRIVER_DOCS: DriverDoc[] = [
  {
    key: "drivers_license",
    label: "Driver's Licence",
    hint: "Valid Ontario G licence, front and back",
  },
  {
    key: "vehicle_for_hire_licence",
    label: "Vehicle for Hire Licence",
    hint: "Your municipal licence to drive passengers for hire",
  },
  {
    key: "commercial_insurance",
    label: "Commercial Insurance",
    hint: "Current policy showing commercial coverage in good standing",
  },
  {
    key: "vehicle_safety",
    label: "Vehicle Safety Certificate",
    hint: "Safety standards certificate for the vehicle you'll drive",
  },
  {
    key: "vehicle_ownership",
    label: "Vehicle Ownership",
    hint: "Ownership permit showing the vehicle is registered to you",
  },
  {
    key: "right_to_work",
    label: "Right to Work in Canada",
    hint: "Work permit, PR card, or Canadian passport",
  },
  {
    key: "background_check",
    label: "Background Check Consent",
    hint: "Signed consent, plus a clean driver's abstract",
  },
];

/** The four vehicle angles. The front shot must show the limo plate. */
export const VEHICLE_PHOTOS: DriverDoc[] = [
  { key: "vehicle_photo_front", label: "Front", hint: "Limo plate must be clearly visible" },
  { key: "vehicle_photo_rear", label: "Rear", hint: "Full rear of the vehicle" },
  { key: "vehicle_photo_left", label: "Left side", hint: "Full driver's side" },
  { key: "vehicle_photo_right", label: "Right side", hint: "Full passenger's side" },
];

/** Every doc key an application must supply, in submission order. */
export const REQUIRED_DOC_KEYS: string[] = [
  ...DRIVER_DOCS.map((d) => d.key),
  ...VEHICLE_PHOTOS.map((d) => d.key),
];

/** Keys written by earlier versions of the form and the seed data. */
const LEGACY_DOC_LABELS: Record<string, string> = {
  license_doc: "Driver's Licence (legacy)",
  background: "Background Check Consent (legacy)",
  insurance: "Insurance (legacy)",
};

/** Display label for any doc_type, including rows written before this list existed. */
export const DOC_LABELS: Record<string, string> = {
  ...Object.fromEntries([...DRIVER_DOCS, ...VEHICLE_PHOTOS].map((d) => [d.key, d.label])),
  ...LEGACY_DOC_LABELS,
  photo: "Driver photo",
};

/** 10 MB — comfortably above a phone photo, well below a storage bill. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPTED_DOC_MIME = [...ACCEPTED_IMAGE_MIME, "application/pdf"];

/** Human-readable size, for error messages. */
export const formatBytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Validate a file before upload. The `accept` attribute is only a picker
 * filter — it is trivially bypassed, and nothing else checked size or type:
 * the storage bucket sets no file_size_limit and no allowed_mime_types.
 */
export function validateUpload(file: File, allowed: string[] = ACCEPTED_DOC_MIME): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  // Some browsers report an empty type for HEIC; fall back to the extension.
  if (file.type && !allowed.includes(file.type.toLowerCase())) {
    return `${file.name} isn't an accepted file type.`;
  }
  return null;
}
