/**
 * Toronto Pearson limo tariff system, from the official GTAA
 * "Toronto Pearson Limo Tariffs" sheet (February 2024). Applies to any
 * airport booking where either endpoint is Pearson, in both directions.
 *
 * - The Executive Sedan pays the published tariff exactly; larger classes
 *   scale by TARIFF_MULTIPLIERS (ratios mirror our airport-from pricing).
 * - Named out-of-town destinations use the fixed published price.
 * - In-zone GTA trips use a distance model calibrated to the zone map:
 *   ~$28 at the airport growing at the published $2.01/km rate.
 * - Published tariffs are tax-inclusive.
 */

export const PEARSON = { lat: 43.6777, lng: -79.6248 };

/** Radius (km) around the Pearson terminals treated as "at the airport". */
const PEARSON_RADIUS_KM = 3.5;

const IN_ZONE_BASE = 28; // zone-map value adjacent to the airport
const PER_KM = 2.01; // published "trips outside zone map" rate
const MIN_TARIFF = 40;

/** Once-per-trip surcharge for >4 passengers and/or excess baggage. */
export const EXTRA_PASSENGER_SURCHARGE = 15;

/** Sedan pays the published tariff; larger classes scale by class. */
export const TARIFF_MULTIPLIERS: Record<string, number> = {
  sedan: 1.0,
  business: 1.3,
  suv: 1.3,
  limousine: 2.5,
  party_bus: 3.0,
};

type Coords = { lat: number; lng: number } | null | undefined;

/** Out-of-town destinations → published limo tariff (CAD, taxes included). */
export const OUT_OF_TOWN: Record<string, number> = {
  "Aldershot": 127, "Alliston": 168, "Alton": 127, "Ancaster": 147,
  "Angus": 205, "Arthur": 205, "Aurora": 114, "Ballantrae": 137,
  "Barrie": 194, "Beamsville": 190, "Beaverton": 258, "Beeton": 147,
  "Belleville": 415, "Bolton": 83, "Bond Head": 130, "Bowmanville": 181,
  "Bracebridge": 382, "Bradford": 135, "Brantford": 213, "Brockville": 738,
  "Brooklin": 154, "Borougham": 118, "Buffalo Airport": 345, "Buffalo": 345,
  "Burford": 229, "Caledon East": 101, "Caledon": 110, "Caledonia": 192,
  "Cambridge": 174, "Camp Borden": 206, "Campbellville": 110, "Carlisle": 130,
  "Cedar Mills": 97, "Cheltenham": 100, "Claremont": 133, "Cobourg": 279,
  "Collingwood": 291, "Cookstown": 153, "Courtice": 175, "Creemore": 213,
  "Deerhurst": 469, "Delhi": 314, "Detroit": 766, "Douglas Point": 459,
  "Dundas": 143, "Durham": 313, "Elmira": 229, "Elora": 207,
  "Ennismore": 340, "Erin": 133, "Fenelon Falls": 336, "Fergus": 192,
  "Flamboro Centre": 137, "Flamborough": 137, "Flesherton": 261, "Fort Erie": 323,
  "Freelton": 138, "Galt": 174, "Georgetown": 95, "Goderich": 432,
  "Goodwood": 147, "Gormley": 105, "Grand Valley": 178, "Gravenhurst": 346,
  "Grimsby": 171, "Guelph": 162, "Hagersville": 239, "Hamilton - DT": 140,
  "Hamilton - MTN": 154, "Hamilton": 140, "Hanover": 371, "Holland Landing": 139,
  "Horseshoe Valley": 231, "Huntsville": 453, "Ingersoll": 298, "Inglewood": 110,
  "Jarvis": 262, "Jacksons Point": 205, "Keswick": 179, "Kettleby": 102,
  "Kilbride": 124, "Kimberley": 300, "King City": 92, "Kingston": 584,
  "Kitchener": 194, "Lindsay": 304, "London": 371, "Loretto": 117,
  "Midland": 300, "Mohawk Raceway": 110, "Mono Mills": 110, "Montreal": 1202,
  "Mt. Hope Airport": 174, "Newcastle": 202, "Newmarket": 124,
  "Niagara Falls": 263, "Niagara on the Lake": 277, "Niagara-on-the-Lake": 277,
  "Nobleton": 84, "North Bay": 759, "Norval": 83, "Orangeville": 140,
  "Orillia": 273, "Ottawa": 949, "Palgrave": 102, "Paris": 229,
  "Parry Sound": 463, "Peterborough": 307, "Port Colborne": 307, "Port Hope": 248,
  "Port Perry": 194, "Quebec City": 1645, "Rockwood": 136, "Schomberg": 110,
  "Sharon": 137, "Shelburne": 179, "St. Catharines": 229, "St. Jacobs": 209,
  "St. Thomas": 386, "Stoney Creek": 147, "Stouffville": 127, "Stratford": 279,
  "Sudbury": 810, "Sutton": 194, "Talisman": 292, "Terra Cotta": 102,
  "Thorold": 243, "Tottenham": 117, "Trenton": 388, "Uxbridge": 167,
  "Wasaga Beach": 269, "Waterdown": 127, "Waterloo": 209, "Welland": 277,
  "Windsor": 751, "Woodstock": 265,
};

/** Destination names sorted longest-first so "Caledon East" beats "Caledon". */
const OUT_OF_TOWN_NAMES = Object.keys(OUT_OF_TOWN).sort((a, b) => b.length - a.length);

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function isPearson(text?: string | null, coords?: Coords): boolean {
  if (coords && haversineKm(coords, PEARSON) <= PEARSON_RADIUS_KM) return true;
  if (text && /pearson|\byyz\b/i.test(text)) return true;
  return false;
}

/** Which endpoint is Pearson — null when neither (or nonsensically both). */
export function pearsonEndpoint(opts: {
  pickup?: string | null;
  dropoff?: string | null;
  pickupCoords?: Coords;
  dropoffCoords?: Coords;
}): "pickup" | "dropoff" | null {
  const p = isPearson(opts.pickup, opts.pickupCoords);
  const d = isPearson(opts.dropoff, opts.dropoffCoords);
  if (p && !d) return "pickup";
  if (d && !p) return "dropoff";
  return null;
}

/** Match the non-Pearson endpoint's address against the out-of-town table. */
export function matchOutOfTown(address?: string | null): number | null {
  if (!address) return null;
  const addr = ` ${normalize(address)} `;
  for (const name of OUT_OF_TOWN_NAMES) {
    if (addr.includes(` ${normalize(name)} `)) return OUT_OF_TOWN[name];
  }
  return null;
}

/**
 * Resolve the published (sedan) tariff for a Pearson airport trip, or null
 * when this trip isn't tariff-priced (not a Pearson trip, or nothing to go
 * on) — callers then fall back to the standard airport formula.
 */
export function resolvePearsonTariff(opts: {
  pickup?: string | null;
  dropoff?: string | null;
  pickupCoords?: Coords;
  dropoffCoords?: Coords;
  distanceKm?: number | null;
}): number | null {
  const endpoint = pearsonEndpoint(opts);
  if (!endpoint) return null;

  const destination = endpoint === "pickup" ? opts.dropoff : opts.pickup;
  const table = matchOutOfTown(destination);
  if (table != null) return table;

  if (opts.distanceKm != null && opts.distanceKm > 0) {
    return Math.max(MIN_TARIFF, Math.round(IN_ZONE_BASE + PER_KM * opts.distanceKm));
  }
  return null;
}

/** Scale the published sedan tariff to the booked vehicle class. */
export function applyVehicleMultiplier(limoTariff: number, vehicleType?: string | null): number {
  const m = (vehicleType && TARIFF_MULTIPLIERS[vehicleType]) || 1.0;
  return Math.round(limoTariff * m);
}
