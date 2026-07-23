"use client";

import { ProtectedRoute } from "@/components/site/ProtectedRoute";
import { AdminShell } from "@/components/admin/AdminShell";
import { PricingConfigPanel } from "@/components/site/PricingConfigPanel";
import { TariffDestinationsPanel } from "@/components/site/TariffDestinationsPanel";
import { usePricingConfig } from "@/hooks/use-pricing-config";

export default function AdminRatesPage() {
  return (
    <ProtectedRoute role="admin">
      <Rates />
    </ProtectedRoute>
  );
}

function Rates() {
  // The live rate card — the fare engine's actual source of truth.
  const pricingConfig = usePricingConfig();
  return (
    <AdminShell
      title="Rates"
      sub="The live rate card. Every change is published as a new version with a reason — nothing is overwritten."
    >
      <PricingConfigPanel config={pricingConfig} />
      <div className="mt-6">
        <TariffDestinationsPanel />
      </div>
    </AdminShell>
  );
}
