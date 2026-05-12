import { app } from "@azure/functions";
import { createStaffMemberSchema, updateStaffMemberSchema } from "@it-helpdesk/shared";
import { handleError, json, readJsonBody } from "../middleware/http";
import { getEntraGroupStaff } from "../services/auth/graph";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminStaff", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/staff",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);

      // Sync tech/admin Entra group members into the staff table so the Team
      // tile reflects group membership without requiring a manual login first.
      try {
        const entraMembers = await getEntraGroupStaff();
        if (entraMembers.length > 0) {
          await Promise.all(
            entraMembers.map((m) =>
              getTicketRepository().upsertStaffOnLogin(m.email, m.displayName, m.role)
            )
          );
        }
      } catch (syncErr) {
        console.error("[staff sync] Entra group sync failed:", syncErr);
      }

      const activeOnly = request.query.get("active") !== "false";
      const staff = await getTicketRepository().listStaff(activeOnly);
      return json(200, staff);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("createAdminStaff", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "manage/staff",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const input = createStaffMemberSchema.parse(await readJsonBody(request));
      const member = await getTicketRepository().createStaffMember(input);
      return json(201, member);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("updateAdminStaff", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "manage/staff/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const input = updateStaffMemberSchema.parse(await readJsonBody(request));
      const member = await getTicketRepository().updateStaffMember(request.params.id, input);
      return json(200, member);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("deleteAdminStaff", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "manage/staff/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      await getTicketRepository().deleteStaffMember(request.params.id);
      return json(200, { ok: true });
    } catch (error) {
      return handleError(error);
    }
  }
});
