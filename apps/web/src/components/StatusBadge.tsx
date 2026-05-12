import type { TicketStatus } from "@it-helpdesk/shared";

type StatusBadgeProps = {
  status: TicketStatus;
  color?: string;
};

export function StatusBadge({ status, color }: StatusBadgeProps) {
  if (color) {
    return (
      <span className="status-badge" data-color={color}>
        <span className="status-dot" />
        {status}
      </span>
    );
  }

  const statusClassName = `status-badge status-${status
    .toLowerCase()
    .replace(/\s+/g, "-")}`;

  return (
    <span className={statusClassName}>
      <span className="status-dot" />
      {status}
    </span>
  );
}
