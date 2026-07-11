// `npm run dev` — starts `next dev` and, when possible, `stripe listen`
// forwarding webhooks to it. The Stripe API key is read from .env.local
// (never hardcode it here — this file is committed). If the stripe CLI or
// the key is missing, we just run Next alone: payments still complete via
// the success-redirect verification path.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let stripeKey = "";
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*STRIPE_SECRET_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
    if (m && !m[1].includes("REPLACE_ME")) stripeKey = m[1];
  }
} catch {
  /* no .env.local — run Next alone */
}

const nextBin = path.join("node_modules", ".bin", "next");
const next = spawn(nextBin, ["dev", ...process.argv.slice(2)], { stdio: "inherit" });

let stripe = null;
if (stripeKey) {
  stripe = spawn(
    "stripe",
    ["listen", "--api-key", stripeKey, "--forward-to", "localhost:3000/api/stripe/webhook"],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  stripe.on("error", () => {
    console.warn("[dev] stripe CLI not found — webhooks won't be forwarded (payments still work via the redirect path)");
    stripe = null;
  });
  stripe.on("exit", (code, signal) => {
    if (!signal && code !== 0) console.warn(`[dev] stripe listen exited (${code}) — continuing without webhook forwarding`);
  });
} else {
  console.warn("[dev] STRIPE_SECRET_KEY not set in .env.local — skipping stripe listen");
}

const shutdown = () => {
  stripe?.kill("SIGTERM");
  next.kill("SIGTERM");
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", (code) => {
  stripe?.kill("SIGTERM");
  process.exit(code ?? 0);
});
