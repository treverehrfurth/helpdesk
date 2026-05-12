import { app } from "@azure/functions";
import { handleError, json, noContent } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { getDbPool } from "../db/client";
import { clearReadNotifications, listNotifications, markAllRead } from "../services/notifications/notificationService";

app.http("getMyNotifications", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/notifications",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const pool = getDbPool();
      const result = await listNotifications(pool, user.email);
      return json(200, result);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("markAllNotificationsRead", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "me/notifications/read-all",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const pool = getDbPool();
      await markAllRead(pool, user.email);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("clearReadNotifications", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "me/notifications/read",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const pool = getDbPool();
      await clearReadNotifications(pool, user.email);
      return noContent();
    } catch (error) {
      return handleError(error);
    }
  }
});
