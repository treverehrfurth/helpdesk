import { app } from "@azure/functions";

import { createTicketMessageSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getMyTicketMessages", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/tickets/{id}/messages",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      // Validate the user owns this ticket
      await getTicketRepository().getTicketForUser(request.params.id, user);
      const messages = await getTicketRepository().listTicketMessages(request.params.id);

      return json(200, messages);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("createMyTicketMessage", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "me/tickets/{id}/messages",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      // Validate the user owns this ticket
      await getTicketRepository().getTicketForUser(request.params.id, user);
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
