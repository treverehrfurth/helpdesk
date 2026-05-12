import { app } from "@azure/functions";

import { createStatusSchema, deleteStatusSchema, updateStatusSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("listAdminStatuses", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/admin/statuses",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const statuses = await getTicketRepository().listStatuses();
      return json(200, statuses);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("createAdminStatus", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "manage/admin/statuses",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const { name, color } = createStatusSchema.parse(await readJsonBody(request));
      const status = await getTicketRepository().createStatus(name, color ?? "slate");
      return json(201, status);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("updateAdminStatus", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "manage/admin/statuses/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const { name, color } = updateStatusSchema.parse(await readJsonBody(request));
      const status = await getTicketRepository().updateStatus(request.params.id, name, color ?? "slate");
      return json(200, status);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("deleteAdminStatus", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "manage/admin/statuses/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const body = await readJsonBody(request).catch(() => ({}));
      const { migrateTo } = deleteStatusSchema.parse(body);
      await getTicketRepository().deleteStatus(request.params.id, migrateTo ?? null);
      return json(200, { ok: true });
    } catch (error) {
      return handleError(error);
    }
  }
});
