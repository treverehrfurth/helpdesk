import { app } from "@azure/functions";
import { getTicketRepository } from "../services/tickets/repository";

// Runs daily at midnight UTC. Permanently deletes tickets that have been in
// the recycle bin for more than 90 days.
app.timer("purgeDeletedTickets", {
  schedule: "0 0 * * *",
  handler: async () => {
    try {
      const count = await getTicketRepository().purgeExpiredTickets();
      console.log(`Purged ${count} expired ticket${count === 1 ? "" : "s"} from recycle bin.`);
    } catch (error) {
      console.error("Failed to purge expired tickets:", error);
    }
  }
});
