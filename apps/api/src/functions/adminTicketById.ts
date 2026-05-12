import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminTicketById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/tickets/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const ticket = await getTicketRepository().getAdminTicketById(request.params.id);

      return json(200, ticket);
    } catch (error) {
      return handleError(error);
    }
  }
});
