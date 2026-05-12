import { app } from "@azure/functions";

import { ticketFiltersSchema } from "@it-helpdesk/shared";

import { handleError, json } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminTickets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/tickets",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);

      const filters = ticketFiltersSchema.parse({
        status: request.query.get("status") ?? undefined,
        category: request.query.get("category") ?? undefined,
        assignee: request.query.get("assignee") ?? undefined,
        requester: request.query.get("requester") ?? undefined,
        search: request.query.get("search") ?? undefined
      });

      const tickets = await getTicketRepository().listAdminTickets(filters);
      return json(200, tickets);
    } catch (error) {
      return handleError(error);
    }
  }
});
