import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getMyTickets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/tickets",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const tickets = await getTicketRepository().listMyTickets(user.email);

      return json(200, tickets);
    } catch (error) {
      return handleError(error);
    }
  }
});
