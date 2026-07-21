type Status = "pending" | "confirmed" | "driver_assigned" | "accepted" | "in_progress" | "completed" | "cancelled" | "rejected";

const STYLES: Record<Status, string> = {
  pending: "bg-gold/15 text-gold-soft",
  confirmed: "bg-white text-black",
  driver_assigned: "bg-white text-black",
  accepted: "bg-white text-black",
  in_progress: "bg-white text-black",
  completed: "bg-white/10 text-white/60",
  cancelled: "bg-white/10 text-white/40 line-through",
  rejected: "bg-white/10 text-white/40 line-through",
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
