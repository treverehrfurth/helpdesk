/**
 * Formats a ticket number for display. Zero-pads to 4 digits for numbers below 10,000;
 * renders as-is above that so it scales naturally beyond 9999.
 */
export function formatTicketNumber(n: number): string {
  return String(n).padStart(4, "0");
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
