import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { uploadBlobData } from "../services/storage/blob";
import { getTicketRepository } from "../services/tickets/repository";

app.http("uploadTicketAttachment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tickets/{id}/attachments/upload",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const ticketId = request.params.id;

      await getTicketRepository().getTicketForUser(ticketId, user);

      const fileName = request.query.get("fileName") ?? "attachment";
      const contentType =
        request.headers.get("content-type") ?? "application/octet-stream";

      const arrayBuffer = await request.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      const blobUrl = await uploadBlobData(ticketId, fileName, contentType, data);

      const attachment = await getTicketRepository().createAttachment(
        ticketId,
        { fileName, storageUrl: blobUrl },
        user
      );

      return json(201, { attachment });
    } catch (error) {
      return handleError(error);
    }
  }
});
