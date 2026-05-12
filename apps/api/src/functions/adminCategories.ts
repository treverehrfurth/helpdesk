import { app } from "@azure/functions";
import { createCategorySchema, deleteCategorySchema, updateCategorySchema } from "@it-helpdesk/shared";
import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAdminCategories", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "manage/categories",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["tech", "admin"]);
      const categories = await getTicketRepository().listCategories();
      return json(200, categories);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("createAdminCategory", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "manage/categories",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const { name } = createCategorySchema.parse(await readJsonBody(request));
      const category = await getTicketRepository().createCategory(name);
      return json(201, category);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("updateAdminCategory", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "manage/categories/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const { name } = updateCategorySchema.parse(await readJsonBody(request));
      const category = await getTicketRepository().updateCategory(request.params.id, name);
      return json(200, category);
    } catch (error) {
      return handleError(error);
    }
  }
});

app.http("deleteAdminCategory", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "manage/categories/{id}",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);
      const body = await readJsonBody(request).catch(() => ({}));
      const { migrateTo } = deleteCategorySchema.parse(body);
      await getTicketRepository().deleteCategory(request.params.id, migrateTo ?? null);
      return json(200, { ok: true });
    } catch (error) {
      return handleError(error);
    }
  }
});
