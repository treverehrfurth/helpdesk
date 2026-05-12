import { app } from "@azure/functions";
import { handleError, noContent } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getDbPool } from "../db/client";
import { markRead } from "../services/notifications/notificationService";

app.http("markNotificationRead", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "me/notifications/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const id = request.params.id;
      const pool = getDbPool();
      await markRead(pool, id, user.email);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});
