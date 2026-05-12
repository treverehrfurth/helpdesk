/**
 * OpenAPI 3.0 specification for the Help Desk API.
 * Used by the API Portal page (/api-portal) to render interactive documentation.
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Help Desk API",
    version: "1.0.0",
    description:
      "Internal Help Desk API. All routes require authentication. Role-based access is enforced server-side — endpoints marked **Admin** or **Tech/Admin** will return 403 if the caller's role is insufficient.\n\n**Auth:** Pass your Bearer token in the Authorization header. In the API Portal, your current session token is pre-populated automatically.\n\n**Base URL:** `/api` (proxied to the Azure Functions host)."
  },
  servers: [{ url: "/api", description: "Current environment" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Entra ID Bearer token (MSAL-acquired). Pre-populated from your session in the API Portal."
      }
    },
    schemas: {
      UserProfile: {
        type: "object",
        properties: {
          email: { type: "string", example: "admin@example.com" },
          name: { type: "string", example: "Trever Ehrfurth" },
          role: { type: "string", enum: ["admin", "tech", "end_user"], example: "admin" }
        }
      },
      TicketSummary: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          ticketNumber: { type: "integer", example: 42 },
          title: { type: "string", example: "Need access to shared mailbox" },
          status: { type: "string", example: "In Progress" },
          category: { type: "string", example: "Access" },
          requesterEmail: { type: "string", example: "user@example.com" },
          requesterName: { type: "string", example: "Maya Patel" },
          assignedToEmail: { type: "string", nullable: true, example: "tech@example.com" },
          assignedToName: { type: "string", nullable: true, example: "Jordan Lee" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          deletedAt: { type: "string", format: "date-time", nullable: true }
        }
      },
      Ticket: {
        allOf: [
          { $ref: "#/components/schemas/TicketSummary" },
          {
            type: "object",
            properties: {
              description: { type: "string", example: "Please add me to the finance shared mailbox." },
              attachments: {
                type: "array",
                items: { $ref: "#/components/schemas/TicketAttachment" }
              },
              messages: {
                type: "array",
                items: { $ref: "#/components/schemas/TicketMessage" }
              }
            }
          }
        ]
      },
      TicketAttachment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fileName: { type: "string", example: "screenshot.png" },
          storageUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      TicketMessage: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          ticketId: { type: "string", format: "uuid" },
          authorEmail: { type: "string" },
          authorName: { type: "string" },
          authorRole: { type: "string", enum: ["admin", "tech", "end_user"] },
          body: { type: "string" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      CategoryRecord: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "Hardware" },
          isActive: { type: "boolean" }
        }
      },
      TicketStatusRecord: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "In Progress" },
          color: { type: "string", example: "blue" },
          sortOrder: { type: "integer", example: 2 }
        }
      },
      StaffMember: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", example: "tech@example.com" },
          displayName: { type: "string", example: "Jordan Lee" },
          role: { type: "string", enum: ["admin", "tech"] },
          isActive: { type: "boolean" }
        }
      },
      EntraUser: {
        type: "object",
        properties: {
          email: { type: "string" },
          displayName: { type: "string" }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Forbidden" }
        }
      },
      NotificationRecord: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          ticketId: { type: "string", format: "uuid" },
          actionType: { type: "string", enum: ["ticket_created", "ticket_assigned", "status_changed", "new_message"] },
          actorEmail: { type: "string", example: "tech@example.com" },
          actorName: { type: "string", example: "Jordan Lee" },
          title: { type: "string", example: "New ticket: Need access to shared mailbox" },
          message: { type: "string", nullable: true },
          isRead: { type: "boolean" },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      NotificationsResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/NotificationRecord" } },
          unreadCount: { type: "integer", example: 3 }
        }
      }
    }
  },
  security: [{ BearerAuth: [] }],
  tags: [
    { name: "Me", description: "Caller's own identity, tickets, and notifications (all authenticated users)" },
    { name: "Tickets", description: "Ticket submission and attachments (all authenticated users)" },
    { name: "Manage — Tickets", description: "Full ticket management (Tech and Admin)" },
    { name: "Manage — Recycle Bin", description: "Soft-deleted tickets (Tech and Admin; permanent delete Admin only)" },
    { name: "Manage — Categories", description: "Category management (read: Tech+Admin; write: Admin)" },
    { name: "Manage — Statuses", description: "Ticket status management (Admin only)" },
    { name: "Manage — Staff", description: "Staff directory for assignee pickers (Admin only)" },
    { name: "Manage — Entra", description: "Entra user directory lookup (Admin only)" }
  ],
  paths: {
    "/me": {
      get: {
        tags: ["Me"],
        summary: "Get current user",
        description: "Returns the signed-in caller's identity and resolved role.",
        operationId: "getCurrentUser",
        responses: {
          "200": {
            description: "User profile",
            content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/UserProfile" } } } } }
          }
        }
      }
    },
    "/me/tickets": {
      get: {
        tags: ["Me"],
        summary: "List my tickets",
        description: "Returns all active tickets where the caller is the requester.",
        operationId: "getMyTickets",
        responses: {
          "200": {
            description: "List of ticket summaries",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketSummary" } } } } } }
          }
        }
      }
    },
    "/me/tickets/{id}": {
      get: {
        tags: ["Me"],
        summary: "Get my ticket by ID",
        description: "Returns a single ticket owned by the caller. Returns 403 if the ticket belongs to someone else.",
        operationId: "getMyTicketById",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Ticket detail", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Ticket" } } } } } },
          "403": { description: "Ticket belongs to a different user", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/me/tickets/{id}/messages": {
      get: {
        tags: ["Me"],
        summary: "List messages on my ticket",
        operationId: "getMyTicketMessages",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Messages", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketMessage" } } } } } } }
        }
      },
      post: {
        tags: ["Me"],
        summary: "Post a message on my ticket",
        operationId: "createMyTicketMessage",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["body"], properties: { body: { type: "string", example: "Update — waiting on the vendor to confirm." } } } } }
        },
        responses: {
          "201": { description: "Message created", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/TicketMessage" } } } } } }
        }
      }
    },
    "/me/notifications": {
      get: {
        tags: ["Me"],
        summary: "List notifications",
        description: "Returns the caller's 50 most recent notifications, newest first, along with the total unread count.",
        operationId: "getMyNotifications",
        responses: {
          "200": { description: "Notifications", content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationsResponse" } } } }
        }
      }
    },
    "/me/notifications/read-all": {
      patch: {
        tags: ["Me"],
        summary: "Mark all notifications read",
        description: "Marks every unread notification for the caller as read.",
        operationId: "markAllNotificationsRead",
        responses: {
          "204": { description: "All notifications marked read" }
        }
      }
    },
    "/me/notifications/{id}": {
      patch: {
        tags: ["Me"],
        summary: "Mark notification read",
        description: "Marks a single notification as read. The notification must belong to the caller.",
        operationId: "markNotificationRead",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" }, description: "Notification ID" }
        ],
        responses: {
          "204": { description: "Notification marked read" },
          "404": { description: "Notification not found or belongs to a different user", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/tickets": {
      post: {
        tags: ["Tickets"],
        summary: "Create a ticket",
        description: "Creates a new ticket. `requesterEmail` and `requesterName` are always set from the caller's verified identity — they cannot be spoofed. `onBehalfOf*` and `assignedTo*` fields are silently ignored for `end_user` callers.",
        operationId: "createTicket",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "category", "description"],
                properties: {
                  title: { type: "string", example: "Need access to the shared finance mailbox" },
                  category: { type: "string", example: "Access" },
                  description: { type: "string", example: "Please add me to the finance shared mailbox before month-end close." },
                  attachments: { type: "array", items: { type: "object", properties: { fileName: { type: "string" } } } },
                  onBehalfOfEmail: { type: "string", description: "Tech/Admin only — submit on behalf of this user", example: "maya.patel@example.com" },
                  onBehalfOfName: { type: "string", example: "Maya Patel" },
                  assignedToEmail: { type: "string", description: "Tech/Admin only — pre-assign on creation", example: "jordan.lee@example.com" },
                  assignedToName: { type: "string", example: "Jordan Lee" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Ticket created", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Ticket" } } } } } }
        }
      }
    },
    "/tickets/{id}/attachments/{attachmentId}/download-url": {
      get: {
        tags: ["Tickets"],
        summary: "Get attachment download URL",
        description: "Returns a short-lived SAS URL to download an attachment. The URL expires after a few minutes.",
        operationId: "getAttachmentDownloadUrl",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "attachmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Download URL", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object", properties: { downloadUrl: { type: "string" } } } } } } } }
        }
      }
    },
    "/categories": {
      get: {
        tags: ["Manage — Categories"],
        summary: "List active categories",
        description: "Returns only active categories. Used to populate ticket submission and edit forms.",
        operationId: "getCategories",
        responses: {
          "200": { description: "Categories", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/CategoryRecord" } } } } } } }
        }
      }
    },
    "/manage/tickets": {
      get: {
        tags: ["Manage — Tickets"],
        summary: "List all active tickets",
        description: "Returns all non-deleted tickets across the org. Supports filtering and full-text search. **Requires Tech or Admin role.**",
        operationId: "getAdminTickets",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" }, description: "Filter by status name (exact match)", example: "In Progress" },
          { name: "category", in: "query", schema: { type: "string" }, description: "Filter by category name (exact match)", example: "Hardware" },
          { name: "assignee", in: "query", schema: { type: "string" }, description: "Filter by assignee email (comma-separated for multiple)", example: "jordan.lee@example.com" },
          { name: "requester", in: "query", schema: { type: "string" }, description: "Filter by requester email (comma-separated for multiple)" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Full-text search across title and description" },
          { name: "view", in: "query", schema: { type: "string", enum: ["unassigned"] }, description: "Special views: `unassigned` returns only tickets with no assignee" }
        ],
        responses: {
          "200": { description: "Ticket list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketSummary" } } } } } } },
          "403": { description: "Insufficient role", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/manage/tickets/{id}": {
      get: {
        tags: ["Manage — Tickets"],
        summary: "Get ticket by ID",
        description: "Returns any ticket by ID, including soft-deleted ones. **Requires Tech or Admin role.**",
        operationId: "getAdminTicketById",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Ticket detail", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Ticket" } } } } } },
          "403": { description: "Insufficient role" },
          "404": { description: "Not found" }
        }
      },
      patch: {
        tags: ["Manage — Tickets"],
        summary: "Update a ticket",
        description: "Updates one or more fields on any active ticket. All fields are optional — only provided fields are changed. **Requires Tech or Admin role.**",
        operationId: "updateAdminTicket",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "Resolved" },
                  category: { type: "string", example: "Hardware" },
                  assignedToEmail: { type: "string", nullable: true, example: "jordan.lee@example.com", description: "Pass `null` to unassign." },
                  assignedToName: { type: "string", nullable: true, example: "Jordan Lee" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated ticket", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Ticket" } } } } } }
        }
      },
      delete: {
        tags: ["Manage — Tickets"],
        summary: "Soft-delete a ticket",
        description: "Moves the ticket to the recycle bin by setting `deleted_at`. The ticket is excluded from all active queries. Recoverable via the recycle bin endpoints for 90 days. **Requires Tech or Admin role.**",
        operationId: "deleteAdminTicket",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Ticket soft-deleted" },
          "403": { description: "Insufficient role" },
          "404": { description: "Not found" }
        }
      }
    },
    "/manage/tickets/by-number/{number}": {
      get: {
        tags: ["Manage — Tickets"],
        summary: "Get ticket by ticket number",
        description: "Looks up a ticket by its human-readable ticket number (e.g. `0042`). Useful for integrations, reporting pipelines, and Snowflake ingestion flows where UUIDs are inconvenient. **Requires Tech or Admin role.**",
        operationId: "getAdminTicketByNumber",
        parameters: [{ name: "number", in: "path", required: true, schema: { type: "integer" }, example: 42 }],
        responses: {
          "200": { description: "Ticket detail", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Ticket" } } } } } },
          "404": { description: "No ticket with that number" }
        }
      }
    },
    "/manage/tickets/{id}/messages": {
      get: {
        tags: ["Manage — Tickets"],
        summary: "List messages on any ticket",
        operationId: "getAdminTicketMessages",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Messages", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketMessage" } } } } } } }
        }
      },
      post: {
        tags: ["Manage — Tickets"],
        summary: "Post a message on any ticket",
        operationId: "createAdminTicketMessage",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["body"], properties: { body: { type: "string", example: "Following up on this — ticket has been escalated." } } } } }
        },
        responses: {
          "201": { description: "Message posted" }
        }
      }
    },
    "/manage/recycle-bin": {
      get: {
        tags: ["Manage — Recycle Bin"],
        summary: "List deleted tickets",
        description: "Returns all soft-deleted tickets ordered by deletion date. Includes `deletedAt` timestamp. Tickets are auto-purged 90 days after deletion. **Requires Tech or Admin role.**",
        operationId: "getRecycleBin",
        responses: {
          "200": { description: "Deleted tickets", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketSummary" } } } } } } }
        }
      }
    },
    "/manage/recycle-bin/{id}/restore": {
      post: {
        tags: ["Manage — Recycle Bin"],
        summary: "Restore a deleted ticket",
        description: "Clears `deleted_at` and returns the ticket to active status. **Requires Tech or Admin role.**",
        operationId: "restoreDeletedTicket",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Ticket restored" },
          "404": { description: "Ticket not found in recycle bin" }
        }
      }
    },
    "/manage/recycle-bin/{id}": {
      delete: {
        tags: ["Manage — Recycle Bin"],
        summary: "Permanently delete a ticket",
        description: "Irreversibly deletes the ticket and all associated messages, attachments, and activity records. **Requires Admin role.**",
        operationId: "permanentlyDeleteTicket",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Ticket permanently deleted" },
          "403": { description: "Admin role required" }
        }
      }
    },
    "/manage/categories": {
      get: {
        tags: ["Manage — Categories"],
        summary: "List all categories",
        description: "Returns all categories including inactive ones. **Requires Tech or Admin role.**",
        operationId: "getAdminCategories",
        responses: {
          "200": { description: "Categories", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/CategoryRecord" } } } } } } }
        }
      },
      post: {
        tags: ["Manage — Categories"],
        summary: "Create a category",
        description: "**Requires Admin role.**",
        operationId: "createCategory",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Networking" } } } } }
        },
        responses: {
          "201": { description: "Category created", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/CategoryRecord" } } } } } }
        }
      }
    },
    "/manage/categories/{id}": {
      patch: {
        tags: ["Manage — Categories"],
        summary: "Update a category",
        description: "Renames a category. **Requires Admin role.**",
        operationId: "updateCategory",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Network Access" } } } } }
        },
        responses: {
          "200": { description: "Updated category" }
        }
      },
      delete: {
        tags: ["Manage — Categories"],
        summary: "Delete a category",
        description: "Deletes a category. If `migrateTo` is provided, all tickets using this category are re-categorized before deletion. **Requires Admin role.**",
        operationId: "deleteCategory",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { migrateTo: { type: "string", format: "uuid", nullable: true, description: "Category ID to migrate existing tickets to" } } } } }
        },
        responses: {
          "200": { description: "Deleted" }
        }
      }
    },
    "/manage/admin/statuses": {
      get: {
        tags: ["Manage — Statuses"],
        summary: "List all ticket statuses",
        description: "Returns all statuses in sort order. **Requires Admin role.**",
        operationId: "getStatuses",
        responses: {
          "200": { description: "Statuses", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TicketStatusRecord" } } } } } } }
        }
      },
      post: {
        tags: ["Manage — Statuses"],
        summary: "Create a status",
        description: "**Requires Admin role.**",
        operationId: "createStatus",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "color"],
                properties: {
                  name: { type: "string", example: "On Hold" },
                  color: { type: "string", example: "amber", description: "One of: amber, blue, green, gray, red, violet, teal, indigo" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Status created" }
        }
      }
    },
    "/manage/admin/statuses/{id}": {
      patch: {
        tags: ["Manage — Statuses"],
        summary: "Update a status",
        description: "Updates name, color, or sort order. **Requires Admin role.**",
        operationId: "updateStatus",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  color: { type: "string" },
                  sortOrder: { type: "integer" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated status" }
        }
      },
      delete: {
        tags: ["Manage — Statuses"],
        summary: "Delete a status",
        description: "Deletes a status. If `migrateTo` is provided, all tickets with this status are migrated before deletion. **Requires Admin role.**",
        operationId: "deleteStatus",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { migrateTo: { type: "string", format: "uuid", nullable: true, description: "Status ID to migrate existing tickets to" } } } } }
        },
        responses: {
          "200": { description: "Deleted" }
        }
      }
    },
    "/manage/staff": {
      get: {
        tags: ["Manage — Staff"],
        summary: "List staff members",
        description: "Returns the staff directory used to populate assignee pickers. Pass `?active=false` to include inactive staff. **Requires Admin role.**",
        operationId: "getStaff",
        parameters: [
          { name: "active", in: "query", schema: { type: "boolean" }, description: "Omit or `true` for active only; `false` to include all" }
        ],
        responses: {
          "200": { description: "Staff list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/StaffMember" } } } } } } }
        }
      },
      post: {
        tags: ["Manage — Staff"],
        summary: "Add a staff member",
        description: "Adds a user to the staff directory. **Requires Admin role.**",
        operationId: "createStaffMember",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "displayName", "role"],
                properties: {
                  email: { type: "string", example: "newtech@example.com" },
                  displayName: { type: "string", example: "Sam Rivera" },
                  role: { type: "string", enum: ["admin", "tech"] }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Staff member created" }
        }
      }
    },
    "/manage/staff/{id}": {
      patch: {
        tags: ["Manage — Staff"],
        summary: "Update a staff member",
        description: "Updates display name, role, or active status. **Requires Admin role.**",
        operationId: "updateStaffMember",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  displayName: { type: "string" },
                  role: { type: "string", enum: ["admin", "tech"] },
                  isActive: { type: "boolean" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated staff member" }
        }
      },
      delete: {
        tags: ["Manage — Staff"],
        summary: "Remove a staff member",
        description: "Removes a staff member from the directory. **Requires Admin role.**",
        operationId: "deleteStaffMember",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "204": { description: "Removed" }
        }
      }
    },
    "/manage/entra/users": {
      get: {
        tags: ["Manage — Entra"],
        summary: "List Entra directory users",
        description: "Returns all users from the Microsoft Entra ID directory. Used when adding a new staff member to pre-fill display name from the corporate directory. **Requires Admin role.**",
        operationId: "getEntraUsers",
        responses: {
          "200": { description: "Entra users", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/EntraUser" } } } } } } }
        }
      }
    }
  }
} as const;
