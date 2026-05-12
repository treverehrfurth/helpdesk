import { app } from "@azure/functions";
import { handleError, noContent } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("deleteAdminTicket", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "manage/tickets/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      await getTicketRepository().softDeleteTicket(request.params.id, user);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});
