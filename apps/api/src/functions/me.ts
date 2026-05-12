import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      if (user.role === "tech" || user.role === "admin") {
        getTicketRepository()
          .upsertStaffOnLogin(user.email, user.name, user.role)
          .catch(console.error);
      }
      return json(200, user);
    } catch (error) {
      return handleError(error);
    }
  }
});
