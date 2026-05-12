import { z } from "zod";

import { appRoles } from "../constants/tickets";

export const userRoleSchema = z.enum(appRoles);

export const ticketStatusSchema = z.string().trim().min(1).max(50);
export const ticketCategorySchema = z.string().trim().min(1).max(50);

export const ticketAttachmentCreateSchema = z.object({
  fileName: z.string().trim().min(1).max(255)
});

export const createAttachmentUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(255).optional()
});

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, { message: "Please enter a more descriptive title." })
    .max(120, { message: "Title must be 120 characters or fewer." }),
  category: ticketCategorySchema,
  description: z
    .string()
    .trim()
    .min(20, { message: "Please describe the issue in more detail (at least 20 characters)." })
    .max(4000, { message: "Description must be 4000 characters or fewer." }),
  attachments: z.array(ticketAttachmentCreateSchema).max(5).default([]),
  onBehalfOfEmail: z.string().trim().email().optional(),
  onBehalfOfName: z.string().trim().min(1).max(120).optional(),
  assignedToEmail: z.string().trim().email().optional(),
  assignedToName: z.string().trim().min(1).max(120).optional()
});

export const updateTicketSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.optional(),
    assignedToEmail: z.string().trim().email().nullable().optional(),
    assignedToName: z.string().trim().min(1).max(120).nullable().optional()
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.category !== undefined ||
      value.assignedToEmail !== undefined ||
      value.assignedToName !== undefined,
    {
      message: "At least one updatable field is required."
    }
  );

export const ticketFiltersSchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  assignee: z.string().trim().min(1).optional(),
  requester: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional()
});

export const createTicketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const createStatusSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().min(1).max(20).optional()
});

export const updateStatusSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().min(1).max(20).optional()
});

export const deleteStatusSchema = z.object({
  migrateTo: z.string().trim().min(1).max(50).optional()
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50)
});
export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(50)
});
export const deleteCategorySchema = z.object({
  migrateTo: z.string().trim().min(1).max(50).optional()
});

export const staffRoleSchema = z.enum(["tech", "admin"]);

export const createStaffMemberSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  role: staffRoleSchema,
  isActive: z.boolean().optional().default(true)
});

export const updateStaffMemberSchema = z
  .object({
    role: staffRoleSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine(
    (v) => v.role !== undefined || v.isActive !== undefined,
    { message: "At least one field is required." }
  );
