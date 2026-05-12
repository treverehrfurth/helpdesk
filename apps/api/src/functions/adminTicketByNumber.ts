import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminTicketByNumber", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/tickets/by-number/{number}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);

      const raw = request.params.number;
      const ticketNumber = parseInt(raw, 10);
      if (isNaN(ticketNumber) || ticketNumber < 1) {
        return json(400, { error: "Invalid ticket number." });
      }

      const ticket = await getTicketRepository().getAdminTicketByNumber(ticketNumber);
      return json(200, ticket);
    } catch (error) {
      return handleError(error);
    }
  }
});
