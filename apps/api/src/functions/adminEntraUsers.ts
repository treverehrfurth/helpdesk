import { app } from "@azure/functions";
import { handleError, json } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getStaffCandidates } from "../services/auth/graph";

app.http("getEntraUsers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/entra/users",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin", "tech"]);
      const users = await getStaffCandidates();
      return json(200, users);
    } catch (error) {
      return handleError(error);
    }
  }
});
