import {
  createCategorySchema,
  createStaffMemberSchema,
  createStatusSchema,
  createTicketMessageSchema,
  createTicketSchema,
  deleteCategorySchema,
  deleteStatusSchema,
  ticketFiltersSchema,
  updateCategorySchema,
  updateStaffMemberSchema,
  updateStatusSchema,
  updateTicketSchema,
  type ApiErrorPayload,
  type CategoryRecord,
  type CreateStaffMemberInput,
  type CreateTicketInput,
  type CreateTicketMessageInput,
  type EntraUser,
  type NotificationsResponse,
  type StaffMember,
  type Ticket,
  type TicketFilters,
  type TicketMessage,
  type TicketStatusRecord,
  type TicketSummary,
  type UpdateStaffMemberInput,
  type UpdateTicketInput,
  type UserProfile
} from "@it-helpdesk/shared";

import { apiBaseUrl, useMockApi } from "../auth/config";
import { mockApi } from "./mockApi";

type RequestHeaders = Record<string, string>;

async function request<T>(
  path: string,
  init: RequestInit,
  headers: RequestHeaders
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json()) as { data?: T } & ApiErrorPayload;

  if (!response.ok) {
    throw new Error(payload.message || "The request failed.");
  }

  return payload.data as T;
}

async function requestVoid(
  path: string,
  init: RequestInit,
  headers: RequestHeaders
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
    throw new Error(payload.message || "The request failed.");
  }
}

export const apiClient = {
  async getCurrentUser(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getCurrentUser(headers)
      : request<UserProfile>("/me", { method: "GET" }, headers);
  },

  async getMyTickets(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getMyTickets(headers)
      : request<TicketSummary[]>("/me/tickets", { method: "GET" }, headers);
  },

  async getTicketById(
    id: string,
    headers: RequestHeaders,
    role: UserProfile["role"] = (headers["x-dev-role"] as UserProfile["role"]) ?? "end_user"
  ) {
    return useMockApi
      ? mockApi.getTicketById(id, headers)
      : request<Ticket>(
          role === "end_user" ? `/me/tickets/${id}` : `/manage/tickets/${id}`,
          { method: "GET" },
          headers
        );
  },

  async createTicket(input: CreateTicketInput, headers: RequestHeaders) {
    const validated = createTicketSchema.parse(input);

    return useMockApi
      ? mockApi.createTicket(validated, headers)
      : request<Ticket>(
          "/tickets",
          {
            method: "POST",
            body: JSON.stringify(validated)
          },
          headers
        );
  },

  async getTicketByNumber(ticketNumber: number, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getTicketByNumber(ticketNumber, headers)
      : request<Ticket>(`/manage/tickets/by-number/${ticketNumber}`, { method: "GET" }, headers);
  },

  async getAdminTickets(filters: TicketFilters, headers: RequestHeaders) {
    const validated = ticketFiltersSchema.parse(filters);
    const params = new URLSearchParams();

    Object.entries(validated).forEach(([key, value]) => {
      if (value) {
        params.set(key, String(value));
      }
    });

    return useMockApi
      ? mockApi.getAdminTickets(validated, headers)
      : request<TicketSummary[]>(
          `/manage/tickets${params.size ? `?${params.toString()}` : ""}`,
          { method: "GET" },
          headers
        );
  },

  async updateAdminTicket(
    id: string,
    input: UpdateTicketInput,
    headers: RequestHeaders
  ) {
    const validated = updateTicketSchema.parse(input);

    return useMockApi
      ? mockApi.updateAdminTicket(id, validated, headers)
      : request<Ticket>(
          `/manage/tickets/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(validated)
          },
          headers
        );
  },

  async getCategories(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getCategories()
      : request<CategoryRecord[]>(
          "/categories",
          { method: "GET" },
          headers
        );
  },

  async createCategory(name: string, headers: RequestHeaders) {
    const validated = createCategorySchema.parse({ name });
    return useMockApi
      ? mockApi.createCategory(validated.name)
      : request<CategoryRecord>("/manage/categories", { method: "POST", body: JSON.stringify(validated) }, headers);
  },

  async updateCategory(id: string, name: string, headers: RequestHeaders) {
    const validated = updateCategorySchema.parse({ name });
    return useMockApi
      ? mockApi.updateCategory(id, validated.name)
      : request<CategoryRecord>(`/manage/categories/${id}`, { method: "PATCH", body: JSON.stringify(validated) }, headers);
  },

  async deleteCategory(id: string, migrateTo: string | null, headers: RequestHeaders) {
    const validated = deleteCategorySchema.parse({ migrateTo: migrateTo ?? undefined });
    return useMockApi
      ? mockApi.deleteCategory(id, migrateTo)
      : request<{ ok: boolean }>(`/manage/categories/${id}`, { method: "DELETE", body: JSON.stringify(validated) }, headers);
  },

  async getTicketMessages(
    ticketId: string,
    headers: RequestHeaders,
    role: UserProfile["role"]
  ) {
    return useMockApi
      ? mockApi.getTicketMessages(ticketId, headers)
      : request<TicketMessage[]>(
          role === "end_user"
            ? `/me/tickets/${ticketId}/messages`
            : `/manage/tickets/${ticketId}/messages`,
          { method: "GET" },
          headers
        );
  },

  async createTicketMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    headers: RequestHeaders,
    role: UserProfile["role"]
  ) {
    const validated = createTicketMessageSchema.parse(input);

    return useMockApi
      ? mockApi.createTicketMessage(ticketId, validated, headers)
      : request<TicketMessage>(
          role === "end_user"
            ? `/me/tickets/${ticketId}/messages`
            : `/manage/tickets/${ticketId}/messages`,
          { method: "POST", body: JSON.stringify(validated) },
          headers
        );
  },

  async getStatuses(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getStatuses()
      : request<TicketStatusRecord[]>("/manage/admin/statuses", { method: "GET" }, headers);
  },

  async createStatus(name: string, color: string, headers: RequestHeaders) {
    const validated = createStatusSchema.parse({ name, color });
    return useMockApi
      ? mockApi.createStatus(validated.name, validated.color)
      : request<TicketStatusRecord>(
          "/manage/admin/statuses",
          { method: "POST", body: JSON.stringify(validated) },
          headers
        );
  },

  async updateStatus(id: string, name: string, color: string, headers: RequestHeaders) {
    const validated = updateStatusSchema.parse({ name, color });
    return useMockApi
      ? mockApi.updateStatus(id, validated.name, validated.color)
      : request<TicketStatusRecord>(
          `/manage/admin/statuses/${id}`,
          { method: "PATCH", body: JSON.stringify(validated) },
          headers
        );
  },

  async deleteStatus(id: string, migrateTo: string | null, headers: RequestHeaders) {
    const validated = deleteStatusSchema.parse({ migrateTo: migrateTo ?? undefined });
    return useMockApi
      ? mockApi.deleteStatus(id, migrateTo)
      : request<{ ok: boolean }>(
          `/manage/admin/statuses/${id}`,
          { method: "DELETE", body: JSON.stringify(validated) },
          headers
        );
  },

  async getAttachmentDownloadUrl(
    ticketId: string,
    attachmentId: string,
    headers: RequestHeaders
  ) {
    if (useMockApi) {
      return mockApi.getAttachmentDownloadUrl(ticketId, attachmentId);
    }

    const result = await request<{ downloadUrl: string }>(
      `/tickets/${ticketId}/attachments/${attachmentId}/download-url`,
      { method: "GET" },
      headers
    );

    return result.downloadUrl;
  },

  async getEntraUsers(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getEntraUsers()
      : request<EntraUser[]>("/manage/entra/users", { method: "GET" }, headers);
  },

  async getStaff(headers: RequestHeaders, activeOnly = true) {
    return useMockApi
      ? mockApi.getStaff(activeOnly)
      : request<StaffMember[]>(
          `/manage/staff${activeOnly ? "" : "?active=false"}`,
          { method: "GET" },
          headers
        );
  },

  async createStaffMember(input: CreateStaffMemberInput, headers: RequestHeaders) {
    const validated = createStaffMemberSchema.parse(input);
    return useMockApi
      ? mockApi.createStaffMember(validated)
      : request<StaffMember>("/manage/staff", { method: "POST", body: JSON.stringify(validated) }, headers);
  },

  async updateStaffMember(id: string, input: UpdateStaffMemberInput, headers: RequestHeaders) {
    const validated = updateStaffMemberSchema.parse(input);
    return useMockApi
      ? mockApi.updateStaffMember(id, validated)
      : request<StaffMember>(`/manage/staff/${id}`, { method: "PATCH", body: JSON.stringify(validated) }, headers);
  },

  async deleteStaffMember(id: string, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.deleteStaffMember(id)
      : request<{ ok: boolean }>(`/manage/staff/${id}`, { method: "DELETE" }, headers);
  },

  async deleteTicket(id: string, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.deleteTicket(id)
      : requestVoid(`/manage/tickets/${id}`, { method: "DELETE" }, headers);
  },

  async getRecycleBin(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getRecycleBin()
      : request<TicketSummary[]>("/manage/recycle-bin", { method: "GET" }, headers);
  },

  async restoreDeletedTicket(id: string, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.restoreDeletedTicket(id)
      : requestVoid(`/manage/recycle-bin/${id}/restore`, { method: "POST" }, headers);
  },

  async permanentlyDeleteTicket(id: string, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.permanentlyDeleteTicket(id)
      : requestVoid(`/manage/recycle-bin/${id}`, { method: "DELETE" }, headers);
  },

  async getMyNotifications(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.getMyNotifications(headers)
      : request<NotificationsResponse>("/me/notifications", { method: "GET" }, headers);
  },

  async markNotificationRead(id: string, headers: RequestHeaders) {
    return useMockApi
      ? mockApi.markNotificationRead(id)
      : requestVoid(`/me/notifications/${id}`, { method: "PATCH" }, headers);
  },

  async markAllNotificationsRead(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.markAllNotificationsRead()
      : requestVoid("/me/notifications/read-all", { method: "PATCH" }, headers);
  },

  async clearReadNotifications(headers: RequestHeaders) {
    return useMockApi
      ? mockApi.clearReadNotifications()
      : requestVoid("/me/notifications/read", { method: "DELETE" }, headers);
  },

  async uploadAttachment(ticketId: string, file: File, headers: RequestHeaders) {
    if (useMockApi) {
      return null;
    }

    // Upload through the API server so CORS configuration on blob storage is not needed.
    const params = new URLSearchParams({ fileName: file.name });
    const response = await fetch(
      `${apiBaseUrl}/tickets/${ticketId}/attachments/upload?${params}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(payload.message ?? "Attachment upload failed.");
    }

    return ((await response.json()) as { data: unknown }).data;
  }
};
