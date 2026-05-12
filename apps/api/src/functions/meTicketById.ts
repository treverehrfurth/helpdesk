import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getMyTicketById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/tickets/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const ticket = await getTicketRepository().getTicketForUser(
        request.params.id,
        user
      );

      return json(200, ticket);
    } catch (error) {
      return handleError(error);
    }
  }
});
