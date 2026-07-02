type Status = "pending" | "confirmed" | "driver_assigned" | "accepted" | "in_progress" | "completed" | "cancelled" | "rejected";

const STYLES: Record<Status, string> = {
  pending: "border border-border bg-background text-ink-muted",
  confirmed: "bg-foreground text-background",
  driver_assigned: "bg-foreground text-background",
  accepted: "bg-foreground text-background",
  in_progress: "bg-foreground text-background",
  completed: "border border-border bg-background text-ink-muted",
  cancelled: "bg-muted text-ink-soft line-through",
  rejected: "bg-muted text-ink-soft line-through",
};

const LABELS: Record<Status, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  driver_assigned: "Driver Assigned",
  accepted: "Driver Accepted",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status as Status) ?? "pending";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[s] ?? STYLES.pending}`}>
      {LABELS[s] ?? status}
    </span>
  );
}
