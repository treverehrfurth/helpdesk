import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getCategories", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "categories",
  handler: async (request) => {
    try {
      await getUserContext(request);
      const categories = await getTicketRepository().listCategories();

      return json(200, categories);
    } catch (error) {
      return handleError(error);
    }
  }
});
