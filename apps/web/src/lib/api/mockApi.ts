import {
  createCategorySchema,
  createStaffMemberSchema,
  createTicketSchema,
  defaultTicketCategories,
  ticketStatuses,
  type CategoryRecord,
  type CreateStaffMemberInput,
  type CreateTicketInput,
  type CreateTicketMessageInput,
  type EntraUser,
  type NotificationRecord,
  type StaffMember,
  type Ticket,
  type TicketFilters,
  type TicketMessage,
  type TicketStatusRecord,
  type TicketSummary,
  type UpdateStaffMemberInput,
  type UpdateTicketInput,
  type UserProfile
} from "@it-helpdesk/shared";

import { assignableUsers, directoryUsers } from "../auth/mockDirectory";

const SESSION_KEY = "helpdesk-demo-state";

type DemoState = {
  tickets: Ticket[];
  messages: TicketMessage[];
  deletedTickets: TicketSummary[];
  notifications: NotificationRecord[];
  categories: CategoryRecord[];
  statuses: TicketStatusRecord[];
  staff: StaffMember[];
  ticketCounter: number;
};

function isoDaysAgo(daysAgo: number, hourOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(date.getHours() - hourOffset);
  return date.toISOString();
}

function buildSeedState(): DemoState {
  const defaultRequester = directoryUsers.find((u) => u.role === "end_user")!;
  const techJordan = directoryUsers.find((u) => u.email === "jordan.lee@example.com")!;
  const techChris = directoryUsers.find((u) => u.email === "chris.brennan@example.com")!;

  const seedIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const defaultColors = ["amber", "blue", "green", "gray"] as const;

  const tickets: Ticket[] = [
    {
      id: seedIds[0],
      ticketNumber: 1,
      requesterEmail: defaultRequester.email,
      requesterName: defaultRequester.name,
      title: "Laptop docking station no longer detects monitors",
      category: "Hardware",
      description:
        "My desk setup stopped detecting both external monitors after a restart this morning. The laptop screen works, but the dock only powers USB devices.",
      status: "In Progress",
      assignedToEmail: techJordan.email,
      assignedToName: techJordan.name,
      createdAt: isoDaysAgo(4, 3),
      updatedAt: isoDaysAgo(1, 2),
      deletedAt: null,
      attachments: [
        {
          id: crypto.randomUUID(),
          fileName: "dock-photo.jpg",
          storageUrl: null,
          createdAt: isoDaysAgo(4, 3)
        }
      ],
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_created",
          actorEmail: defaultRequester.email,
          actorName: defaultRequester.name,
          oldValueJson: null,
          newValueJson: { status: "New" },
          createdAt: isoDaysAgo(4, 3)
        },
        {
          id: crypto.randomUUID(),
          actionType: "ticket_updated",
          actorEmail: techJordan.email,
          actorName: techJordan.name,
          oldValueJson: { status: "New", assignedToName: null },
          newValueJson: { status: "In Progress", assignedToName: techJordan.name },
          createdAt: isoDaysAgo(1, 2)
        }
      ]
    },
    {
      id: seedIds[1],
      ticketNumber: 2,
      requesterEmail: defaultRequester.email,
      requesterName: defaultRequester.name,
      title: "Need access to the shared finance mailbox",
      category: "Access",
      description:
        "Please add me to the finance shared mailbox before month-end close. I only need read and send-as access for the current quarter.",
      status: "In Progress",
      assignedToEmail: techChris.email,
      assignedToName: techChris.name,
      createdAt: isoDaysAgo(7, 5),
      updatedAt: isoDaysAgo(2, 6),
      deletedAt: null,
      attachments: [],
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_created",
          actorEmail: defaultRequester.email,
          actorName: defaultRequester.name,
          oldValueJson: null,
          newValueJson: { status: "New" },
          createdAt: isoDaysAgo(7, 5)
        },
        {
          id: crypto.randomUUID(),
          actionType: "ticket_updated",
          actorEmail: techChris.email,
          actorName: techChris.name,
          oldValueJson: { status: "New" },
          newValueJson: { status: "Waiting on User" },
          createdAt: isoDaysAgo(2, 6)
        }
      ]
    },
    {
      id: seedIds[2],
      ticketNumber: 3,
      requesterEmail: "nina.garcia@example.com",
      requesterName: "Nina Garcia",
      title: "Teams calls are dropping on office Wi-Fi",
      category: "Network",
      description:
        "Calls disconnect after 10 to 15 minutes only when I am in the third floor conference area. Ethernet is stable, Wi-Fi is not.",
      status: "New",
      assignedToEmail: null,
      assignedToName: null,
      createdAt: isoDaysAgo(1, 1),
      updatedAt: isoDaysAgo(1, 1),
      deletedAt: null,
      attachments: [],
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_created",
          actorEmail: "nina.garcia@example.com",
          actorName: "Nina Garcia",
          oldValueJson: null,
          newValueJson: { status: "New" },
          createdAt: isoDaysAgo(1, 1)
        }
      ]
    }
  ];

  const messages: TicketMessage[] = [
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[0],
      authorEmail: defaultRequester.email,
      authorName: defaultRequester.name,
      authorRole: "end_user",
      body: "Just to clarify — both monitors were working fine yesterday before I shut down. This morning after powering back on through the dock, neither monitor comes on.",
      createdAt: isoDaysAgo(3, 5)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[0],
      authorEmail: techJordan.email,
      authorName: techJordan.name,
      authorRole: "tech",
      body: "Thanks for the details. Can you try unplugging the dock from power for 30 seconds and plugging it back in? Also, which dock model do you have — is it the Dell WD19 or the Lenovo?",
      createdAt: isoDaysAgo(2, 8)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[0],
      authorEmail: defaultRequester.email,
      authorName: defaultRequester.name,
      authorRole: "end_user",
      body: "It's the Dell WD19. I tried the power cycle — still no monitors detected.",
      createdAt: isoDaysAgo(1, 6)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[1],
      authorEmail: techChris.email,
      authorName: techChris.name,
      authorRole: "tech",
      body: "I've started the access provisioning. Can you confirm your employee ID so I can verify you're in the correct security group before granting send-as rights?",
      createdAt: isoDaysAgo(3, 2)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[1],
      authorEmail: defaultRequester.email,
      authorName: defaultRequester.name,
      authorRole: "end_user",
      body: "My employee ID is 104821. Let me know if you need anything else.",
      createdAt: isoDaysAgo(2, 9)
    }
  ];

  const notifications: NotificationRecord[] = [
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[0],
      actionType: "ticket_assigned",
      actorEmail: techJordan.email,
      actorName: techJordan.name,
      title: "Ticket assigned to you: Laptop docking station no longer detects monitors",
      message: null,
      isRead: false,
      readAt: null,
      createdAt: isoDaysAgo(0, 2)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[1],
      actionType: "new_message",
      actorEmail: defaultRequester.email,
      actorName: defaultRequester.name,
      title: `New reply from ${defaultRequester.name}: Need access to the shared finance mailbox`,
      message: null,
      isRead: false,
      readAt: null,
      createdAt: isoDaysAgo(1, 4)
    },
    {
      id: crypto.randomUUID(),
      ticketId: seedIds[0],
      actionType: "status_changed",
      actorEmail: techChris.email,
      actorName: techChris.name,
      title: "Your ticket status changed to In Progress: Laptop docking station no longer detects monitors",
      message: null,
      isRead: true,
      readAt: isoDaysAgo(1, 0),
      createdAt: isoDaysAgo(1, 2)
    }
  ];

  return {
    tickets,
    messages,
    deletedTickets: [],
    notifications,
    categories: defaultTicketCategories.map((name, index) => ({
      id: `category-${index + 1}`,
      name,
      isActive: true
    })),
    statuses: ticketStatuses.map((name, index) => ({
      id: `status-${index + 1}`,
      name,
      color: defaultColors[index] ?? "slate",
      sortOrder: index + 1
    })),
    staff: assignableUsers.map((u, index) => ({
      id: `staff-seed-${index + 1}`,
      email: u.email,
      displayName: u.name,
      role: u.role as "tech" | "admin",
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    })),
    ticketCounter: 3
  };
}

function loadState(): DemoState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // unavailable (SSR, private browsing quota, corrupted)
  }
  const seed = buildSeedState();
  saveState(seed);
  return seed;
}

function saveState(s: DemoState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // storage quota exceeded or restricted
  }
}

let state = loadState();

function getUserFromHeaders(headers: Record<string, string>): UserProfile {
  const role = headers["x-dev-role"];
  const email = headers["x-dev-email"];
  const name = headers["x-dev-name"];

  if (!role || !email || !name) {
    return directoryUsers.find((u) => u.role === "end_user")!;
  }

  return { role: role as UserProfile["role"], email, name };
}

function summarize(ticket: Ticket): TicketSummary {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    category: ticket.category,
    status: ticket.status,
    requesterEmail: ticket.requesterEmail,
    requesterName: ticket.requesterName,
    assignedToEmail: ticket.assignedToEmail,
    assignedToName: ticket.assignedToName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    deletedAt: ticket.deletedAt
  };
}

function sortByUpdated(items: Ticket[]) {
  return [...items].sort(
    (l, r) => new Date(r.updatedAt).getTime() - new Date(l.updatedAt).getTime()
  );
}

function assertAdminRole(user: UserProfile) {
  if (user.role === "end_user") {
    throw new Error("This action requires technician or admin access.");
  }
}

export const mockApi = {
  async getCurrentUser(headers: Record<string, string>) {
    return getUserFromHeaders(headers);
  },

  async getMyTickets(headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    return sortByUpdated(
      state.tickets.filter((t) => t.requesterEmail === user.email && !t.deletedAt)
    ).map(summarize);
  },

  async getTicketById(id: string, headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    const ticket = state.tickets.find(
      (t) => t.id === id && (user.role !== "end_user" || !t.deletedAt)
    );

    if (!ticket) throw new Error("Ticket not found.");
    if (user.role === "end_user" && ticket.requesterEmail !== user.email) {
      throw new Error("You do not have access to this ticket.");
    }

    return ticket;
  },

  async createTicket(input: CreateTicketInput, headers: Record<string, string>) {
    const validated = createTicketSchema.parse(input);
    const user = getUserFromHeaders(headers);
    const canDelegate = user.role === "admin" || user.role === "tech";
    const now = new Date().toISOString();

    const requesterEmail = canDelegate && validated.onBehalfOfEmail ? validated.onBehalfOfEmail : user.email;
    const requesterName = canDelegate && validated.onBehalfOfName ? validated.onBehalfOfName : user.name;
    const assignedToEmail = canDelegate && validated.assignedToEmail ? validated.assignedToEmail : null;
    const assignedToName = canDelegate && validated.assignedToName ? validated.assignedToName : null;
    const onBehalfOf = canDelegate && validated.onBehalfOfEmail ? requesterName : null;

    const ticket: Ticket = {
      id: crypto.randomUUID(),
      ticketNumber: ++state.ticketCounter,
      requesterEmail,
      requesterName,
      title: validated.title,
      category: validated.category,
      description: validated.description,
      status: "New",
      assignedToEmail,
      assignedToName,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      attachments: validated.attachments.map((a) => ({
        id: crypto.randomUUID(),
        fileName: a.fileName,
        storageUrl: null,
        createdAt: now
      })),
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_created",
          actorEmail: user.email,
          actorName: user.name,
          oldValueJson: null,
          newValueJson: onBehalfOf ? { status: "New", onBehalfOf } : { status: "New" },
          createdAt: now
        }
      ]
    };

    state.tickets = [ticket, ...state.tickets];
    saveState(state);
    return ticket;
  },

  async getTicketByNumber(ticketNumber: number, headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    assertAdminRole(user);
    const ticket = state.tickets.find((t) => t.ticketNumber === ticketNumber);
    if (!ticket) throw new Error("Ticket not found.");
    return ticket;
  },

  async getAdminTickets(filters: TicketFilters, headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    assertAdminRole(user);

    return sortByUpdated(
      state.tickets.filter((ticket) => {
        if (ticket.deletedAt) return false;
        if (filters.status) {
          const allowed = filters.status.split(",").map((s) => s.trim());
          if (!allowed.includes(ticket.status)) return false;
        }
        if (filters.category) {
          const allowed = filters.category.split(",").map((s) => s.trim());
          if (!allowed.includes(ticket.category)) return false;
        }
        if (filters.assignee) {
          const emails = filters.assignee.split(",").map((s) => s.trim());
          if (!emails.includes(ticket.assignedToEmail ?? "")) return false;
        }
        if (filters.requester) {
          const emails = filters.requester.split(",").map((s) => s.trim());
          if (!emails.includes(ticket.requesterEmail)) return false;
        }
        if (filters.search) {
          const searchTarget = [ticket.title, ticket.description, ticket.requesterName, ticket.requesterEmail]
            .join(" ")
            .toLowerCase();
          if (!searchTarget.includes(filters.search.toLowerCase())) return false;
        }
        return true;
      })
    ).map(summarize);
  },

  async updateAdminTicket(id: string, input: UpdateTicketInput, headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    assertAdminRole(user);

    const ticket = state.tickets.find((t) => t.id === id);
    if (!ticket) throw new Error("Ticket not found.");

    const nextStatus = input.status ?? ticket.status;
    const nextAssignedToEmail = input.assignedToEmail === undefined ? ticket.assignedToEmail : input.assignedToEmail;
    const nextAssignedToName = input.assignedToName === undefined ? ticket.assignedToName : input.assignedToName;
    const now = new Date().toISOString();

    const nextTicket: Ticket = {
      ...ticket,
      status: nextStatus,
      assignedToEmail: nextAssignedToEmail,
      assignedToName: nextAssignedToName,
      updatedAt: now,
      activity: [
        {
          id: crypto.randomUUID(),
          actionType: "ticket_updated",
          actorEmail: user.email,
          actorName: user.name,
          oldValueJson: {
            status: ticket.status,
            assignedToEmail: ticket.assignedToEmail,
            assignedToName: ticket.assignedToName
          },
          newValueJson: {
            status: nextStatus,
            assignedToEmail: nextAssignedToEmail,
            assignedToName: nextAssignedToName
          },
          createdAt: now
        },
        ...ticket.activity
      ]
    };

    state.tickets = state.tickets.map((t) => (t.id === id ? nextTicket : t));
    saveState(state);
    return nextTicket;
  },

  async getCategories() {
    return state.categories;
  },

  async createCategory(name: string) {
    if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A category named "${name}" already exists.`);
    }
    const newCategory: CategoryRecord = { id: crypto.randomUUID(), name, isActive: true };
    state.categories = [...state.categories, newCategory];
    saveState(state);
    return newCategory;
  },

  async updateCategory(id: string, name: string) {
    const existing = state.categories.find((c) => c.id === id);
    if (!existing) throw new Error("Category not found.");
    if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A category named "${name}" already exists.`);
    }
    const updated = { ...existing, name };
    state.categories = state.categories.map((c) => (c.id === id ? updated : c));
    saveState(state);
    return updated;
  },

  async deleteCategory(id: string, _migrateTo: string | null) {
    const category = state.categories.find((c) => c.id === id);
    if (!category) throw new Error("Category not found.");
    state.categories = state.categories.filter((c) => c.id !== id);
    saveState(state);
    return { ok: true };
  },

  async getStatuses() {
    return [...state.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createStatus(name: string, color = "slate") {
    if (state.statuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A status named "${name}" already exists.`);
    }
    const newStatus: TicketStatusRecord = {
      id: crypto.randomUUID(),
      name,
      color,
      sortOrder: state.statuses.length + 1
    };
    state.statuses = [...state.statuses, newStatus];
    saveState(state);
    return newStatus;
  },

  async updateStatus(id: string, name: string, color = "slate") {
    const existing = state.statuses.find((s) => s.id === id);
    if (!existing) throw new Error("Status not found.");
    if (state.statuses.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`A status named "${name}" already exists.`);
    }
    const updated = { ...existing, name, color };
    state.statuses = state.statuses.map((s) => (s.id === id ? updated : s));
    saveState(state);
    return updated;
  },

  async deleteStatus(id: string, migrateTo: string | null) {
    const status = state.statuses.find((s) => s.id === id);
    if (!status) throw new Error("Status not found.");
    state.statuses = state.statuses.filter((s) => s.id !== id);
    saveState(state);
    return { deletedName: status.name, migrateTo };
  },

  async getEntraUsers(): Promise<EntraUser[]> {
    const staffEmails = new Set(state.staff.map((s) => s.email.toLowerCase()));
    return assignableUsers
      .filter((u) => !staffEmails.has(u.email.toLowerCase()))
      .map((u, i) => ({ id: `entra-${i}`, email: u.email, displayName: u.name }));
  },

  async getStaff(activeOnly = true) {
    return state.staff
      .filter((s) => !activeOnly || s.isActive)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  async createStaffMember(input: CreateStaffMemberInput) {
    const validated = createStaffMemberSchema.parse(input);
    if (state.staff.some((s) => s.email === validated.email)) {
      throw new Error(`A staff member with email "${validated.email}" already exists.`);
    }
    const now = new Date().toISOString();
    const member: StaffMember = {
      id: crypto.randomUUID(),
      email: validated.email,
      displayName: validated.displayName,
      role: validated.role,
      isActive: validated.isActive,
      createdAt: now,
      updatedAt: now
    };
    state.staff = [...state.staff, member];
    saveState(state);
    return member;
  },

  async updateStaffMember(id: string, input: UpdateStaffMemberInput) {
    const existing = state.staff.find((s) => s.id === id);
    if (!existing) throw new Error("Staff member not found.");
    const updated: StaffMember = {
      ...existing,
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date().toISOString()
    };
    state.staff = state.staff.map((s) => (s.id === id ? updated : s));
    saveState(state);
    return updated;
  },

  async deleteStaffMember(id: string) {
    const existing = state.staff.find((s) => s.id === id);
    if (!existing) throw new Error("Staff member not found.");
    state.staff = state.staff.filter((s) => s.id !== id);
    saveState(state);
    return { ok: true };
  },

  async getTicketMessages(ticketId: string, headers: Record<string, string>) {
    const user = getUserFromHeaders(headers);
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found.");
    if (user.role === "end_user" && ticket.requesterEmail !== user.email) {
      throw new Error("You do not have access to this ticket.");
    }
    return state.messages
      .filter((m) => m.ticketId === ticketId)
      .sort((l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime());
  },

  async getAttachmentDownloadUrl(_ticketId: string, _attachmentId: string) {
    return null;
  },

  async createTicketMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    headers: Record<string, string>
  ) {
    const user = getUserFromHeaders(headers);
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found.");
    if (user.role === "end_user" && ticket.requesterEmail !== user.email) {
      throw new Error("You do not have access to this ticket.");
    }

    const message: TicketMessage = {
      id: crypto.randomUUID(),
      ticketId,
      authorEmail: user.email,
      authorName: user.name,
      authorRole: user.role,
      body: input.body,
      createdAt: new Date().toISOString()
    };

    state.messages = [...state.messages, message];
    saveState(state);
    return message;
  },

  async deleteTicket(id: string) {
    const ticket = state.tickets.find((t) => t.id === id && !t.deletedAt);
    if (!ticket) throw new Error("Ticket not found.");
    const now = new Date().toISOString();
    const deleted = { ...ticket, deletedAt: now, updatedAt: now };
    state.tickets = state.tickets.map((t) => (t.id === id ? deleted : t));
    state.deletedTickets = [summarize(deleted), ...state.deletedTickets];
    saveState(state);
  },

  async getRecycleBin() {
    return state.deletedTickets;
  },

  async restoreDeletedTicket(id: string) {
    const ticket = state.tickets.find((t) => t.id === id && t.deletedAt);
    if (!ticket) throw new Error("Ticket not found.");
    const now = new Date().toISOString();
    const restored = { ...ticket, deletedAt: null, updatedAt: now };
    state.tickets = state.tickets.map((t) => (t.id === id ? restored : t));
    state.deletedTickets = state.deletedTickets.filter((t) => t.id !== id);
    saveState(state);
  },

  async permanentlyDeleteTicket(id: string) {
    const exists = state.tickets.some((t) => t.id === id) || state.deletedTickets.some((t) => t.id === id);
    if (!exists) throw new Error("Ticket not found.");
    state.tickets = state.tickets.filter((t) => t.id !== id);
    state.deletedTickets = state.deletedTickets.filter((t) => t.id !== id);
    saveState(state);
  },

  async getMyNotifications(_headers: Record<string, string>) {
    const unreadCount = state.notifications.filter((n) => !n.isRead).length;
    return { items: [...state.notifications], unreadCount };
  },

  async markNotificationRead(id: string) {
    state.notifications = state.notifications.map((n) =>
      n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
    );
    saveState(state);
  },

  async markAllNotificationsRead() {
    const now = new Date().toISOString();
    state.notifications = state.notifications.map((n) =>
      n.isRead ? n : { ...n, isRead: true, readAt: now }
    );
    saveState(state);
  },

  async clearReadNotifications() {
    state.notifications = state.notifications.filter((n) => !n.isRead);
    saveState(state);
  }
};
