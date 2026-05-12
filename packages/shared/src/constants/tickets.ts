export const appRoles = ["end_user", "tech", "admin"] as const;

export const ticketStatuses = [
  "New",
  "In Progress",
  "Resolved",
  "Closed"
] as const;

export const defaultTicketCategories = [
  "Access",
  "Hardware",
  "Software",
  "Security",
  "Network",
  "Other"
] as const;
