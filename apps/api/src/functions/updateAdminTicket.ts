import { app } from "@azure/functions";

import { updateTicketSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("updateAdminTicket", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "manage/tickets/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const payload = updateTicketSchema.parse(await readJsonBody(request));
      const ticket = await getTicketRepository().updateAdminTicket(
        request.params.id,
        payload,
        user
      );

      return json(200, ticket);
    } catch (error) {
      return handleError(error);
    }
  }
});
