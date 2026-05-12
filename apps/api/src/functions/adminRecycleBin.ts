import { app } from "@azure/functions";
import { handleError, json, noContent } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminRecycleBin", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/recycle-bin",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const tickets = await getTicketRepository().listDeletedTickets();
      return json(200, tickets);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("permanentlyDeleteAdminTicket", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "manage/recycle-bin/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      await getTicketRepository().permanentlyDeleteTicket(request.params.id);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});
