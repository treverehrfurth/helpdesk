import { app } from "@azure/functions";

import { createTicketMessageSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminTicketMessages", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/tickets/{id}/messages",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const messages = await getTicketRepository().listTicketMessages(request.params.id);

      return json(200, messages);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("createAdminTicketMessage", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "manage/tickets/{id}/messages",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const payload = createTicketMessageSchema.parse(await readJsonBody(request));
      const message = await getTicketRepository().createTicketMessage(
        request.params.id,
        payload,
        user
      );

      return json(201, message);
    } catch (error) {
      return handleError(error);
    }
  }
});
