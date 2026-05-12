import { app } from "@azure/functions";

import { handleError, json } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { generateDownloadUrl } from "../services/storage/blob";
import { getTicketRepository } from "../services/tickets/repository";

app.http("getAttachmentDownloadUrl", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tickets/{ticketId}/attachments/{attachmentId}/download-url",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const { ticketId, attachmentId } = request.params;

      await getTicketRepository().getTicketForUser(ticketId, user);

      const attachment = await getTicketRepository().getAttachmentById(ticketId, attachmentId);

      if (!attachment.storageUrl) {
        return json(404, { message: "Attachment has no storage URL.", code: "no_storage_url" });
      }

      const downloadUrl = await generateDownloadUrl(attachment.storageUrl);

      return json(200, { downloadUrl });
    } catch (error) {
      return handleError(error);
    }
  }
});
