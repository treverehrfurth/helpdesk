import { app } from "@azure/functions";
import { handleError, noContent } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("restoreAdminTicket", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "manage/recycle-bin/{id}/restore",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      await getTicketRepository().restoreTicket(request.params.id, user);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});
