import { app } from "@azure/functions";

import { createTicketSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("createTicket", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tickets",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const payload = createTicketSchema.parse(await readJsonBody(request));

      // Only admin/tech may create on behalf of others or pre-assign
      const canDelegate = user.role === "admin" || user.role === "tech";
      const ticket = await getTicketRepository().createTicket(
        {
          ...payload,
          onBehalfOfEmail: canDelegate ? payload.onBehalfOfEmail : undefined,
          onBehalfOfName: canDelegate ? payload.onBehalfOfName : undefined,
          assignedToEmail: canDelegate ? payload.assignedToEmail : undefined,
          assignedToName: canDelegate ? payload.assignedToName : undefined
        },
        user
      );

      return json(201, ticket);
    } catch (error) {
      return handleError(error);
    }
  }
});
