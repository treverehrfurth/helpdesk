import {
  defaultTicketCategories,
  type CategoryRecord,
  type Ticket,
  type UserProfile
} from "@it-helpdesk/shared";

function isoDaysAgo(daysAgo: number, hourOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(date.getHours() - hourOffset);
  return date.toISOString();
}

export const mockDirectory: UserProfile[] = [
  {
    email: "maya.patel@example.com",
    name: "Maya Patel",
    role: "end_user"
  },
  {
    email: "jordan.lee@example.com",
    name: "Jordan Lee",
    role: "tech"
  },
  {
    email: "chris.brennan@example.com",
    name: "Chris Brennan",
    role: "tech"
  },
  {
    email: "avery.morgan@example.com",
    name: "Avery Morgan",
    role: "admin"
  }
];

export const seedCategories: CategoryRecord[] = defaultTicketCategories.map(
  (name, index) => ({
    id: `00000000-0000-0000-0000-00000000000${index + 1}`,
    name,
    isActive: true
  })
);

const maya = mockDirectory[0];
const jordan = mockDirectory[1];
const chris = mockDirectory[2];

export const seedTickets: Ticket[] = [
  {
    id: crypto.randomUUID(),
    ticketNumber: 1,
    requesterEmail: maya.email,
    requesterName: maya.name,
    title: "Laptop docking station no longer detects monitors",
    category: "Hardware",
    description:
      "My desk setup stopped detecting both external monitors after a restart this morning. The laptop screen works, but the dock only powers USB devices.",
    status: "In Progress",
    assignedToEmail: jordan.email,
    assignedToName: jordan.name,
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
        actorEmail: maya.email,
        actorName: maya.name,
        oldValueJson: null,
        newValueJson: { status: "New" },
        createdAt: isoDaysAgo(4, 3)
      },
      {
        id: crypto.randomUUID(),
        actionType: "ticket_updated",
        actorEmail: jordan.email,
        actorName: jordan.name,
        oldValueJson: { status: "New" },
        newValueJson: { status: "In Progress", assignedToName: jordan.name },
        createdAt: isoDaysAgo(1, 2)
      }
    ]
  },
  {
    id: crypto.randomUUID(),
    ticketNumber: 2,
    requesterEmail: maya.email,
    requesterName: maya.name,
    title: "Need access to the shared finance mailbox",
    category: "Access",
    description:
      "Please add me to the finance shared mailbox before month-end close. I only need read and send-as access for the current quarter.",
    status: "In Progress",
    assignedToEmail: chris.email,
    assignedToName: chris.name,
    createdAt: isoDaysAgo(7, 5),
    updatedAt: isoDaysAgo(2, 6),
    deletedAt: null,
    attachments: [],
    activity: [
      {
        id: crypto.randomUUID(),
        actionType: "ticket_created",
        actorEmail: maya.email,
        actorName: maya.name,
        oldValueJson: null,
        newValueJson: { status: "New" },
        createdAt: isoDaysAgo(7, 5)
      },
      {
        id: crypto.randomUUID(),
        actionType: "ticket_updated",
        actorEmail: chris.email,
        actorName: chris.name,
        oldValueJson: { status: "New" },
        newValueJson: { status: "In Progress" },
        createdAt: isoDaysAgo(2, 6)
      }
    ]
  },
  {
    id: crypto.randomUUID(),
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
