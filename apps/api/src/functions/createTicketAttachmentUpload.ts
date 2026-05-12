import { app } from "@azure/functions";

import { createAttachmentUploadSchema } from "@it-helpdesk/shared";

import { handleError, json, readJsonBody } from "../middleware/http";
import { getUserContext } from "../services/auth/userContext";
import { createAttachmentUploadTarget } from "../services/storage/blob";
import { getTicketRepository } from "../services/tickets/repository";

app.http("createTicketAttachmentUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tickets/{id}/attachments/upload-url",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      const payload = createAttachmentUploadSchema.parse(await readJsonBody(request));

      await getTicketRepository().getTicketForUser(request.params.id, user);

      const uploadTarget = await createAttachmentUploadTarget(
        request.params.id,
        payload.fileName,
        payload.contentType
      );

      const attachment = await getTicketRepository().createAttachment(
        request.params.id,
        {
          fileName: payload.fileName,
          storageUrl: uploadTarget.blobUrl
        },
        user
      );

      return json(201, {
        ...uploadTarget,
        attachment
      });
    } catch (error) {
      return handleError(error);
    }
  }
});
