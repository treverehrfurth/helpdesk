import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";

import {
  formatShortDate,
  formatShortDateTime,
  formatTicketNumber,
  type CategoryRecord,
  type DashboardMetrics,
  type StaffMember,
  type Ticket,
  type TicketFilters,
  type TicketMessage,
  type TicketStatus,
  type TicketStatusRecord,
  type TicketSummary,
  type UserRole
} from "@it-helpdesk/shared";

import { AppShell } from "../components/AppShell";
import { MarkdownBody } from "../components/MarkdownBody";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MultiSelectCombobox } from "../components/MultiSelectCombobox";
import { SingleSelectCombobox } from "../components/SingleSelectCombobox";
import { StatusBadge } from "../components/StatusBadge";
import { buildStaffDisplayNames, TicketTable, type TicketPendingChange } from "../components/TicketTable";
import { AuthProvider, useSession } from "../features/auth/AuthProvider";
import { TeamsAuthStart } from "../features/auth/TeamsAuthStart";
import { TeamsAuthEnd } from "../features/auth/TeamsAuthEnd";
import { apiClient } from "../lib/api/http";
import { isEntraConfigured, useMockApi } from "../lib/auth/config";
import { directoryUsers } from "../lib/auth/mockDirectory";

type TeamLoad = {
  name: string;
  email: string;
  role: UserRole;
  active: number;
  resolved: number;
};

type QueueView = "" | "open" | "unassigned";
type Period = "weekly" | "monthly" | "quarterly" | "yearly";

function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "weekly":   return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "monthly":  return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "quarterly":return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "yearly":   return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

function getAttachmentType(fileName: string): "image" | "video" | "pdf" | "other" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

type ActivityItem = {
  id: string;
  actionType: string;
  actorEmail: string;
  actorName: string;
  oldValueJson: Record<string, unknown> | null;
  newValueJson: Record<string, unknown> | null;
  createdAt: string;
  _collapseCount?: number;
  _collapsedItems?: ActivityItem[];
};

function formatActivityLabel(item: ActivityItem): string {
  const { actionType, actorName, oldValueJson, newValueJson } = item;

  switch (actionType) {
    case "ticket_created": {
      const onBehalfOf = newValueJson?.onBehalfOf as string | undefined;
      return onBehalfOf
        ? `${actorName} created ticket on behalf of ${onBehalfOf}`
        : `${actorName} created ticket`;
    }

    case "attachment_added":
      return `${actorName} added attachments`;

    case "ticket_updated": {
      const oldStatus = oldValueJson?.status as string | undefined;
      const newStatus = newValueJson?.status as string | undefined;
      const oldCategory = oldValueJson?.category as string | undefined;
      const newCategory = newValueJson?.category as string | undefined;
      const oldAssigneeEmail = oldValueJson?.assignedToEmail as string | null | undefined;
      const newAssigneeEmail = newValueJson?.assignedToEmail as string | null | undefined;
      const newAssigneeName = newValueJson?.assignedToName as string | null | undefined;

      if (oldStatus !== newStatus && newStatus) {
        if (newStatus === "Resolved") return `Ticket resolved by ${actorName}`;
        if (newStatus === "Closed") return `Ticket closed by ${actorName}`;
        return `Status changed to ${newStatus} by ${actorName}`;
      }

      if (oldCategory !== newCategory && newCategory) {
        return `Category changed to ${newCategory} by ${actorName}`;
      }

      if (oldAssigneeEmail !== newAssigneeEmail) {
        if (item._collapseCount && item._collapseCount > 1) {
          return `Assignment changes by ${actorName}`;
        }
        if (!newAssigneeEmail) return `Ticket unassigned by ${actorName}`;
        return `Ticket assigned to ${newAssigneeName ?? newAssigneeEmail}`;
      }

      return `Ticket updated by ${actorName}`;
    }

    default:
      return `${actorName} ${actionType.replaceAll("_", " ")}`;
  }
}

function hasAssignmentChange(item: ActivityItem): boolean {
  if (item.actionType !== "ticket_updated") return false;
  const oldAssignee = item.oldValueJson?.assignedToEmail;
  const newAssignee = item.newValueJson?.assignedToEmail;
  // Must have actually changed — key being present but same value (e.g. status-only saves) doesn't count
  return oldAssignee !== newAssignee;
}

function collapseActivity(activity: ActivityItem[]): ActivityItem[] {
  const result: ActivityItem[] = [];
  for (const item of activity) {
    const prev = result[result.length - 1];
    const withinWindow =
      prev &&
      prev.actorEmail === item.actorEmail &&
      Math.abs(
        new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime()
      ) < 10_000;

    // Collapse parallel batch uploads (same actor, within 10s) into one entry
    if (
      withinWindow &&
      prev.actionType === "attachment_added" &&
      item.actionType === "attachment_added"
    ) {
      continue;
    }

    // Always absorb attachment_added into ticket_created from the same actor —
    // attachments uploaded alongside ticket creation are part of that single event
    if (
      prev &&
      prev.actorEmail === item.actorEmail &&
      prev.actionType === "attachment_added" &&
      item.actionType === "ticket_created"
    ) {
      result[result.length - 1] = item;
      continue;
    }

    // Collapse consecutive assignment bouncing by the same actor into one entry.
    // Activity is sorted newest-first, so we're building the result newest-first too.
    // Store each sub-item so the user can drill in and see individual changes.
    if (prev && prev.actorEmail === item.actorEmail && hasAssignmentChange(prev) && hasAssignmentChange(item)) {
      const prevClean: ActivityItem = {
        id: prev.id, actionType: prev.actionType, actorEmail: prev.actorEmail,
        actorName: prev.actorName, oldValueJson: prev.oldValueJson,
        newValueJson: prev.newValueJson, createdAt: prev.createdAt
      };
      const existingChildren = prev._collapsedItems ?? [prevClean];
      result[result.length - 1] = {
        ...prev,
        _collapseCount: (prev._collapseCount ?? 1) + 1,
        _collapsedItems: [...existingChildren, item]
      };
      continue;
    }

    result.push(item);
  }
  return result;
}

function formatUpdatedAt(value: string): string {
  // Keep "4:00 PM" together — replace the space before AM/PM with a non-breaking space
  return formatShortDateTime(value).replace(/ (?=[AP]M$)/, "\u00a0");
}

function formatActivityTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(isoDate);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

function formatErrorMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return "An unexpected error occurred.";

  try {
    const issues = JSON.parse(reason.message) as Array<{
      message: string;
      path?: string[];
    }>;

    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .map((issue) => {
          const field = issue.path?.[0];
          return field
            ? `${String(field).charAt(0).toUpperCase() + String(field).slice(1)}: ${issue.message.toLowerCase()}`
            : issue.message;
        })
        .join(". ");
    }
  } catch {
    // not a Zod error format — fall through
  }

  return reason.message;
}

function buildMetrics(tickets: TicketSummary[], statuses: TicketStatusRecord[], categories: CategoryRecord[]): DashboardMetrics {
  const byStatus: Record<string, number> = Object.fromEntries(statuses.map((s) => [s.name, 0]));
  const byCategory: Record<string, number> = Object.fromEntries(categories.map((c) => [c.name, 0]));

  tickets.forEach((ticket) => {
    byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1;
    byCategory[ticket.category] = (byCategory[ticket.category] ?? 0) + 1;
  });

  return {
    totalOpenTickets: tickets.filter((ticket) => ticket.status !== "Resolved" && ticket.status !== "Closed").length,
    byStatus,
    byCategory,
    recentTickets: [...tickets].slice(0, 5)
  };
}

function buildTeamLoad(tickets: TicketSummary[], staff: StaffMember[]): TeamLoad[] {
  return staff
    .map((member) => {
      const owned = tickets.filter((ticket) => ticket.assignedToEmail === member.email);

      return {
        name: member.displayName,
        email: member.email,
        role: member.role,
        active: owned.filter(
          (ticket) => ticket.status !== "Resolved" && ticket.status !== "Closed"
        ).length,
        resolved: owned.filter((ticket) => ticket.status === "Resolved").length
      };
    })
    .sort((left, right) => right.active - left.active);
}

function buildQueuePath(params: Record<string, string | undefined>, base = "/queue") {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `${base}?${query}` : base;
}

function applyQueueView(tickets: TicketSummary[], view: QueueView) {
  if (view === "open") {
    return tickets.filter(
      (ticket) => ticket.status !== "Resolved" && ticket.status !== "Closed"
    );
  }

  if (view === "unassigned") {
    return tickets.filter((ticket) => !ticket.assignedToEmail);
  }

  return tickets;
}

function HomeRedirect() {
  const { user, isHydratingUser } = useSession();

  if (isHydratingUser) {
    return (
      <section className="auth-screen-shell">
        <div className="auth-screen-card panel">
          <p className="section-eyebrow">Loading workspace</p>
          <h2>Restoring your session</h2>
          <p>Finishing role and access checks before routing you back into the app.</p>
        </div>
      </section>
    );
  }

  if (user.role === "end_user") {
    return <Navigate replace to="/submit" />;
  }

  return <Navigate replace to="/dashboard" />;
}

function RoleGate({
  children,
  allowedRoles
}: {
  children: React.ReactElement;
  allowedRoles: UserRole[];
}) {
  const { user, isHydratingUser } = useSession();

  if (isHydratingUser) {
    return (
      <section className="screen-stack">
        <ScreenHeader
          title="Loading workspace"
          body="Restoring your signed-in view before checking route access."
        />
      </section>
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate replace to="/tickets" />;
  }

  return children;
}

function ScreenHeader({
  title,
  body,
  eyebrow,
  action
}: {
  title: string;
  body: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="screen-header">
      <div>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {action ? <div className="screen-header-actions">{action}</div> : null}
    </div>
  );
}

function EntraSignInState() {
  const { isReady, signIn } = useSession();

  return (
    <section className="auth-screen-shell">
      <div className="auth-screen-card panel">
        <p className="section-eyebrow">Microsoft Entra ID</p>
        <h2>{isReady ? "Sign in required" : "Preparing Microsoft sign-in"}</h2>
        <p>
          {isEntraConfigured
            ? "This workspace is running in Entra mode. Use your Microsoft 365 identity to continue into the help desk."
            : "Entra mode is enabled, but the required Vite Entra variables are not configured yet."}
        </p>
        {isReady && isEntraConfigured ? (
          <button type="button" onClick={() => void signIn()}>
            Sign in with Microsoft
          </button>
        ) : null}
      </div>
    </section>
  );
}

const allOrgUsers = [...directoryUsers].sort((a, b) => a.name.localeCompare(b.name));

function SubmitTicketPage() {
  const navigate = useNavigate();
  const { user, requestHeaders, isPreviewingRole } = useSession();
  const canDelegate = user?.role === "admin" || user?.role === "tech";
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryRecord["name"]>("Hardware");
  const [description, setDescription] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [onBehalfOfEmail, setOnBehalfOfEmail] = useState("");
  const [assignedToEmail, setAssignedToEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const [requesterPickerOpen, setRequesterPickerOpen] = useState(false);
  const [requesterQuery, setRequesterQuery] = useState("");
  const requesterPickerRef = useRef<HTMLDivElement>(null);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const [orgUsers, setOrgUsers] = useState<{ email: string; name: string }[]>([]);
  const [orgUsersLoaded, setOrgUsersLoaded] = useState(false);

  // In Entra mode, use the fetched group members once loaded (even if empty — no mock fallback).
  // In mock mode the fetch returns mock data so orgUsersLoaded will be true with results.
  const baseOrgUsers = (canDelegate && orgUsersLoaded) ? orgUsers : allOrgUsers;
  const requesterOptions = user
    ? [
        ...(baseOrgUsers.some((u) => u.email === user.email)
          ? []
          : [{ value: user.email, label: user.name, sublabel: user.email }]),
        ...baseOrgUsers.map((u) => ({ value: u.email, label: u.name, sublabel: u.email }))
      ]
    : baseOrgUsers.map((u) => ({ value: u.email, label: u.name, sublabel: u.email }));

  // Default requester to the signed-in user once available (user loads async)
  useEffect(() => {
    if (user?.email && !onBehalfOfEmail) {
      setOnBehalfOfEmail(user.email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  useEffect(() => {
    let active = true;

    apiClient
      .getCategories(requestHeaders)
      .then((records) => {
        if (active) {
          setCategories(records);
          if (records[0]) {
            setCategory(records[0].name);
          }
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load categories.");
        }
      });

    apiClient.getStaff(requestHeaders).then((members) => {
      if (active) setStaffMembers(members);
    }).catch(() => {});

    if (canDelegate) {
      apiClient.getEntraUsers(requestHeaders).then((users) => {
        if (active) {
          setOrgUsers(users.map((u) => ({ email: u.email, name: u.displayName })));
          setOrgUsersLoaded(true);
        }
      }).catch(() => {
        if (active) setOrgUsersLoaded(true);
      });
    }

    return () => {
      active = false;
    };
  }, [requestHeaders, canDelegate]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) {
        setCategoryPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [categoryPickerOpen]);

  useEffect(() => {
    if (!requesterPickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (requesterPickerRef.current && !requesterPickerRef.current.contains(e.target as Node)) {
        setRequesterPickerOpen(false);
        setRequesterQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [requesterPickerOpen]);

  useEffect(() => {
    if (!assigneePickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setAssigneePickerOpen(false);
        setAssigneeQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [assigneePickerOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const isOnBehalf = canDelegate && onBehalfOfEmail && onBehalfOfEmail !== user?.email;
      const selectedRequester = isOnBehalf
        ? allOrgUsers.find((u) => u.email === onBehalfOfEmail)
        : undefined;
      const selectedAssignee = canDelegate && assignedToEmail
        ? staffMembers.find((u) => u.email === assignedToEmail)
        : undefined;

      const ticket = await apiClient.createTicket(
        {
          title,
          category,
          description,
          attachments: useMockApi
            ? attachmentFiles.map((file) => ({ fileName: file.name }))
            : [],
          onBehalfOfEmail: selectedRequester?.email,
          onBehalfOfName: selectedRequester?.name,
          assignedToEmail: selectedAssignee?.email,
          assignedToName: selectedAssignee?.displayName
        },
        requestHeaders
      );

      if (attachmentFiles.length) {
        await Promise.all(
          attachmentFiles.map((file) =>
            apiClient.uploadAttachment(ticket.id, file, requestHeaders)
          )
        );
      }

      navigate(`/tickets/${ticket.id}`);
    } catch (reason) {
      setError(formatErrorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="screen-stack">
      <ScreenHeader
        title="Submit Ticket"
        body="Submit a request for help, access, or anything you need support with."
        action={
          <Link className="ghost-link-button" to="/tickets">
            View my tickets
          </Link>
        }
      />

      <div className="panel form-panel">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field field-span-2">
            <span className="field-label">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Brief summary of your request"
              required
            />
          </label>

          <div className="field">
            <span className="field-label">Category</span>
            <div className="assignee-picker" ref={categoryPickerRef}>
              <button
                type="button"
                className="picker-btn assignee-picker-trigger"
                onClick={() => setCategoryPickerOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={categoryPickerOpen}
              >
                <span className="picker-trigger-text">{category}</span>
                <span className="picker-chevron">▾</span>
              </button>
              {categoryPickerOpen && (
                <div className="picker-popover" role="listbox">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`picker-btn picker-option${category === c.name ? " picker-option-active" : ""}`}
                      role="option"
                      aria-selected={category === c.name}
                      onClick={() => { setCategory(c.name); setCategoryPickerOpen(false); }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {canDelegate ? (
            <div className="field-span-2 delegate-row">
              <div className="field">
                <span className="field-label">Requester</span>
                <div className="assignee-picker" ref={requesterPickerRef}>
                  <button
                    type="button"
                    className="picker-btn assignee-picker-trigger"
                    onClick={() => { setRequesterPickerOpen((o) => !o); setRequesterQuery(""); }}
                    aria-haspopup="listbox"
                    aria-expanded={requesterPickerOpen}
                  >
                    <span className="picker-trigger-text">
                      {requesterOptions.find((o) => o.value === onBehalfOfEmail)?.label ?? "Select requester"}
                    </span>
                    <span className="picker-chevron">▾</span>
                  </button>
                  {requesterPickerOpen && (
                    <div className="picker-popover picker-popover--searchable" role="listbox">
                      <div className="picker-search-wrap">
                        <input
                          className="picker-search-input"
                          type="text"
                          value={requesterQuery}
                          onChange={(e) => setRequesterQuery(e.target.value)}
                          placeholder="Search..."
                          autoFocus
                        />
                      </div>
                      <div className="picker-options-scroll">
                        {(requesterQuery
                          ? requesterOptions.filter((o) =>
                              o.label.toLowerCase().includes(requesterQuery.toLowerCase()) ||
                              o.sublabel?.toLowerCase().includes(requesterQuery.toLowerCase())
                            )
                          : requesterOptions
                        ).map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className={`picker-btn picker-option${onBehalfOfEmail === o.value ? " picker-option-active" : ""}`}
                            role="option"
                            aria-selected={onBehalfOfEmail === o.value}
                            onClick={() => { setOnBehalfOfEmail(o.value); setRequesterPickerOpen(false); setRequesterQuery(""); }}
                          >
                            <div className="picker-option-with-sub">
                              <span>{o.label}</span>
                              {o.sublabel && <span className="picker-option-sub">{o.sublabel}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="field">
                <span className="field-label">Assign To</span>
                <div className="assignee-picker" ref={assigneePickerRef}>
                  <button
                    type="button"
                    className="picker-btn assignee-picker-trigger"
                    onClick={() => { setAssigneePickerOpen((o) => !o); setAssigneeQuery(""); }}
                    aria-haspopup="listbox"
                    aria-expanded={assigneePickerOpen}
                  >
                    <span className="picker-trigger-text">
                      {assignedToEmail
                        ? (staffMembers.find((u) => u.email === assignedToEmail)?.displayName ?? assignedToEmail)
                        : "Unassigned"}
                    </span>
                    <span className="picker-chevron">▾</span>
                  </button>
                  {assigneePickerOpen && (
                    <div className="picker-popover picker-popover--searchable" role="listbox">
                      <div className="picker-search-wrap">
                        <input
                          className="picker-search-input"
                          type="text"
                          value={assigneeQuery}
                          onChange={(e) => setAssigneeQuery(e.target.value)}
                          placeholder="Search..."
                          autoFocus
                        />
                      </div>
                      <div className="picker-options-scroll">
                        {[
                          { value: "", label: "Unassigned", sublabel: undefined },
                          ...staffMembers.map((u) => ({ value: u.email, label: u.displayName, sublabel: u.email }))
                        ]
                          .filter((o) =>
                            !assigneeQuery ||
                            o.label.toLowerCase().includes(assigneeQuery.toLowerCase()) ||
                            o.sublabel?.toLowerCase().includes(assigneeQuery.toLowerCase())
                          )
                          .map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              className={`picker-btn picker-option${assignedToEmail === o.value ? " picker-option-active" : ""}`}
                              role="option"
                              aria-selected={assignedToEmail === o.value}
                              onClick={() => { setAssignedToEmail(o.value); setAssigneePickerOpen(false); setAssigneeQuery(""); }}
                            >
                              <div className="picker-option-with-sub">
                                <span>{o.label}</span>
                                {o.sublabel && <span className="picker-option-sub">{o.sublabel}</span>}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">Attachments</span>
            <label className="attach-add-btn-full">
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  const newFiles = Array.from(event.target.files ?? []);
                  setAttachmentFiles((prev) => {
                    const existingNames = new Set(prev.map((f) => f.name));
                    return [...prev, ...newFiles.filter((f) => !existingNames.has(f.name))];
                  });
                  event.target.value = "";
                }}
              />
              + Add attachments
            </label>
          </div>

          <div className="field field-span-2">
            <span className="field-label">Description</span>
            <MarkdownEditor
              rows={8}
              value={description}
              onChange={setDescription}
              placeholder="Provide any details that will help resolve your request."
              required
            />
          </div>

          {attachmentFiles.length ? (
            <div className="attachment-list field-span-2">
              {attachmentFiles.map((file) => (
                <span key={file.name} className="attachment-chip">
                  {file.name}
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    onClick={() => setAttachmentFiles((prev) => prev.filter((f) => f.name !== file.name))}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {error ? <p className="error-text field-span-2">{error}</p> : null}

          <div className="field-span-2 action-row">
            <button type="submit" disabled={isSaving || isPreviewingRole}>
              {isSaving ? "Submitting..." : "Submit ticket"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// Module-level caches — survive navigation within the session so filter
// options are available immediately on subsequent page visits.
let _statusCache: TicketStatusRecord[] = [];
let _categoryCache: CategoryRecord[] = [];
let _staffCache: StaffMember[] = [];

function MyTicketsPage() {
  const { user, requestHeaders, isPreviewingRole } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = user.role !== "end_user" && !isPreviewingRole;
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>(_statusCache);
  const [categories, setCategories] = useState<CategoryRecord[]>(_categoryCache);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(_staffCache);
  const [pendingChanges, setPendingChanges] = useState<Record<string, TicketPendingChange>>({});
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const hasPending = Object.keys(pendingChanges).length > 0;

  const statusParam = searchParams.get("status") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const assigneeParam = searchParams.get("assignee") ?? "";
  const search = searchParams.get("search") ?? "";

  const selectedStatuses = statusParam ? statusParam.split(",").map((s) => s.trim()) : [];
  const selectedCategories = categoryParam ? categoryParam.split(",").map((s) => s.trim()) : [];
  const selectedAssignees = assigneeParam ? assigneeParam.split(",").map((s) => s.trim()) : [];
  const hasFilters = Boolean(statusParam || categoryParam || assigneeParam || search);

  const categoryOptions = categories.map((c) => ({ value: c.name, label: c.name }));
  const staffDisplayNames = buildStaffDisplayNames(staffMembers);
  const assigneeOptions = [
    { value: "__unassigned__", label: "Unassigned" },
    ...staffMembers.map((s) => ({
      value: s.email,
      label: staffDisplayNames.get(s.email) ?? s.displayName,
      sublabel: s.email,
    })),
  ];

  // Reset to page 1 whenever filters change
  const prevFiltersRef = useRef("");
  const filtersKey = [statusParam, categoryParam, assigneeParam, search].join("|");
  if (prevFiltersRef.current !== filtersKey) {
    prevFiltersRef.current = filtersKey;
    if (page !== 1) setPage(1);
  }

  function updateParams(nextValues: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(nextValues).forEach(([key, value]) => {
          if (value) { next.set(key, value); } else { next.delete(key); }
        });
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  function toggleStatus(name: string) {
    const next = selectedStatuses.includes(name)
      ? selectedStatuses.filter((s) => s !== name)
      : [...selectedStatuses, name];
    updateParams({ status: next.length > 0 ? next.join(",") : undefined });
  }

  function toggleCategory(name: string) {
    const next = selectedCategories.includes(name)
      ? selectedCategories.filter((s) => s !== name)
      : [...selectedCategories, name];
    updateParams({ category: next.length > 0 ? next.join(",") : undefined });
  }

  function toggleAssignee(email: string) {
    const next = selectedAssignees.includes(email)
      ? selectedAssignees.filter((s) => s !== email)
      : [...selectedAssignees, email];
    updateParams({ assignee: next.length > 0 ? next.join(",") : undefined });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
  }

  function handleFieldChange(ticketId: string, field: keyof TicketPendingChange, value: string) {
    setPendingChanges((prev) => ({ ...prev, [ticketId]: { ...prev[ticketId], [field]: value } }));
  }

  async function applyPendingChanges() {
    await Promise.all(
      Object.entries(pendingChanges).map(([id, changes]) => {
        const staff = staffMembers.find((s) => s.email === changes.assignedToEmail);
        return apiClient.updateAdminTicket(
          id,
          {
            ...(changes.status ? { status: changes.status as TicketStatus } : {}),
            ...(changes.category ? { category: changes.category as TicketFilters["category"] } : {}),
            ...(changes.assignedToEmail !== undefined
              ? {
                  assignedToEmail: changes.assignedToEmail || null,
                  assignedToName: changes.assignedToEmail ? (staff?.displayName ?? null) : null,
                }
              : {}),
          },
          requestHeaders
        );
      })
    );
    setPendingChanges({});
    setRefreshKey((k) => k + 1);
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      await applyPendingChanges();
    } catch {
      // leave pending so user can retry
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let active = true;

    apiClient
      .getMyTickets(requestHeaders)
      .then((result) => {
        if (active) {
          setTickets(result);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load tickets.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestHeaders, refreshKey]);

  useEffect(() => {
    apiClient.getStatuses(requestHeaders).then((s) => { _statusCache = s; setStatuses(s); }).catch(() => {});
    apiClient.getCategories(requestHeaders).then((c) => { _categoryCache = c; setCategories(c); }).catch(() => {});
    if (canEdit) {
      apiClient.getStaff(requestHeaders).then((s) => { _staffCache = s; setStaffMembers(s); }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestHeaders]);

  // Client-side filtering
  const filteredTickets = tickets.filter((t) => {
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(t.status)) return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(t.category)) return false;
    if (selectedAssignees.length > 0) {
      const email = t.assignedToEmail ?? "";
      const matchesUnassigned = selectedAssignees.includes("__unassigned__") && !email;
      const matchesEmail = selectedAssignees.some((a) => a !== "__unassigned__" && a === email);
      if (!matchesUnassigned && !matchesEmail) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <section className="screen-stack">
      <ScreenHeader
        title="My Tickets"
        body="Your submitted requests and their current status."
        action={
          <Link className="ghost-link-button" to="/submit">
            Open new request
          </Link>
        }
      />

      <div className="panel filter-panel">
        {hasFilters ? (
          <button type="button" className="ghost-button filter-panel-reset" onClick={clearFilters}>
            Reset filters
          </button>
        ) : null}
        <div className="filter-grid">
          <div className="field filter-field-full">
            <span className="field-label">Status</span>
            <div className="status-filter-pills">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`status-filter-pill${selectedStatuses.includes(s.name) ? " selected" : ""}`}
                  data-color={s.color}
                  onClick={() => toggleStatus(s.name)}
                >
                  <span className="status-dot" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <MultiSelectCombobox
            fieldLabel="Category"
            options={categoryOptions}
            selected={selectedCategories}
            onToggle={toggleCategory}
            placeholder="All categories"
          />

          {canEdit ? (
            <MultiSelectCombobox
              fieldLabel="Assignee"
              options={assigneeOptions}
              selected={selectedAssignees}
              onToggle={toggleAssignee}
              placeholder="All assignees"
            />
          ) : null}

          <label className="field">
            <span className="field-label">Search</span>
            <input
              value={search}
              onChange={(e) => updateParams({ search: e.target.value || undefined })}
              placeholder="Mailbox, docking station, Wi-Fi..."
            />
          </label>
        </div>
      </div>

      <div className="panel">
        {canEdit && hasPending && (
          <div className="panel-header">
            <h3>{Object.keys(pendingChanges).length} unsaved {Object.keys(pendingChanges).length === 1 ? "change" : "changes"}</h3>
            <div className="panel-header-actions">
              <button type="button" className="panel-save-btn" onClick={() => void handleSaveAll()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="panel-discard-btn" onClick={() => setPendingChanges({})} disabled={saving}>
                Discard
              </button>
            </div>
          </div>
        )}
        {loading ? <p>Loading tickets...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          <>
            <FadeList className="ticket-fade-list">
              <TicketTable
                tickets={filteredTickets.slice((page - 1) * pageSize, page * pageSize)}
                emptyTitle={hasFilters ? "No matching tickets" : "No tickets yet"}
                emptyBody={hasFilters ? "Try adjusting or clearing your filters." : "Once a request is submitted it will appear here with its status and assigned technician."}
                editable={canEdit}
                statusOptions={canEdit ? statuses : []}
                categoryOptions={canEdit ? categories : []}
                staffOptions={canEdit ? staffMembers : []}
                pendingChanges={canEdit ? pendingChanges : {}}
                onFieldChange={canEdit ? handleFieldChange : undefined}
              />
            </FadeList>
            <PaginationBar
              total={filteredTickets.length}
              pageSize={pageSize}
              page={page}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : null}
      </div>
      {canEdit && (
        <ConfirmNavModal
          when={hasPending}
          onSave={applyPendingChanges}
          onDiscard={() => setPendingChanges({})}
        />
      )}
    </section>
  );
}

function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, requestHeaders, isPreviewingRole } = useSession();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<TicketStatus>("New");
  const [category, setCategory] = useState("");
  const [assignedToEmail, setAssignedToEmail] = useState("");
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityAllVisible, setActivityAllVisible] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string | null>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const statusPickerRef = useRef<HTMLDivElement>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const assigneePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.getStatuses(requestHeaders).then(setStatuses).catch(() => {});
    apiClient.getCategories(requestHeaders).then(setCategories).catch(() => {});
    apiClient.getStaff(requestHeaders).then(setStaffMembers).catch(() => {});
  }, [requestHeaders]);

  // Pre-fetch signed URLs for all attachments once the ticket loads.
  // attachmentUrls values: undefined = not yet resolved, null = unavailable, string = signed URL
  useEffect(() => {
    if (!ticket || !id || !ticket.attachments.length) return;
    let active = true;
    ticket.attachments.forEach(async (attachment) => {
      try {
        const url = await apiClient.getAttachmentDownloadUrl(id, attachment.id, requestHeaders);
        if (active) {
          setAttachmentUrls((prev) => ({ ...prev, [attachment.id]: url ?? null }));
        }
      } catch {
        if (active) {
          setAttachmentUrls((prev) => ({ ...prev, [attachment.id]: null }));
        }
      }
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  useEffect(() => {
    if (!statusPickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setStatusPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [statusPickerOpen]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) {
        setCategoryPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [categoryPickerOpen]);

  useEffect(() => {
    if (!assigneePickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setAssigneePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [assigneePickerOpen]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null || !ticket) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i !== null ? Math.min(i + 1, ticket!.attachments.length - 1) : null));
      if (e.key === "ArrowLeft")
        setLightboxIndex((i) => (i !== null ? Math.max(i - 1, 0) : null));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, ticket]);

  useEffect(() => {
    if (!id) {
      return;
    }

    let active = true;

    apiClient
      .getTicketById(id, requestHeaders, user.role)
      .then((result) => {
        if (active) {
          setTicket(result);
          setStatus(result.status);
          setCategory(result.category);
          setAssignedToEmail(result.assignedToEmail ?? "");
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load ticket.");
          setLoading(false);
        }
      });

    apiClient
      .getTicketMessages(id, requestHeaders, user.role)
      .then((result) => {
        if (active) {
          setMessages(result);
        }
      })
      .catch(() => {
        // Messages are non-critical; ticket still renders if this endpoint is unavailable
      });

    return () => {
      active = false;
    };
  }, [id, requestHeaders]);

  async function saveTicketChanges() {
    if (!ticket || !id) return;
    setIsSaving(true);
    setSaveError(null);
    const selectedAssignee = staffMembers.find((c) => c.email === assignedToEmail);
    try {
      const updated = await apiClient.updateAdminTicket(
        id,
        {
          status,
          category,
          assignedToEmail: assignedToEmail || null,
          assignedToName: selectedAssignee?.displayName ?? null,
        },
        requestHeaders
      );
      setTicket(updated);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Ticket update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveTicketChanges();
  }

  function handleDiscardTicketChanges() {
    if (!ticket) return;
    setStatus(ticket.status as TicketStatus);
    setCategory(ticket.category);
    setAssignedToEmail(ticket.assignedToEmail ?? "");
    setSaveError(null);
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!id || !messageBody.trim()) {
      return;
    }

    setIsSendingMessage(true);
    setMessageError(null);

    try {
      const newMessage = await apiClient.createTicketMessage(
        id,
        { body: messageBody.trim() },
        requestHeaders,
        user.role
      );

      setMessages((prev) => [...prev, newMessage]);
      setMessageBody("");
    } catch (reason) {
      setMessageError(reason instanceof Error ? reason.message : "Failed to send message.");
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleAddAttachment(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 5);
    event.target.value = "";
    if (!files.length || !id || !ticket) return;

    setIsAddingAttachment(true);
    try {
      await Promise.all(files.map((file) => apiClient.uploadAttachment(ticket.id, file, requestHeaders)));
      const updated = await apiClient.getTicketById(id, requestHeaders, user.role);
      setTicket(updated);
      const newAttachments = updated.attachments.filter((a) => !(a.id in attachmentUrls));
      await Promise.all(
        newAttachments.map(async (a) => {
          try {
            const url = await apiClient.getAttachmentDownloadUrl(id, a.id, requestHeaders);
            setAttachmentUrls((prev) => ({ ...prev, [a.id]: url ?? null }));
          } catch {
            setAttachmentUrls((prev) => ({ ...prev, [a.id]: null }));
          }
        })
      );
    } catch {
      // upload errors are surfaced by the individual file calls
    } finally {
      setIsAddingAttachment(false);
    }
  }

  if (loading) {
    return (
      <section className="screen-stack">
        <ScreenHeader title="Ticket Detail" body="Loading the selected request." />
      </section>
    );
  }

  if (error || !ticket) {
    return (
      <section className="screen-stack">
        <ScreenHeader
          title="Ticket Detail"
          body="The ticket could not be loaded with the current access context."
        />
        <div className="panel">
          <p className="error-text">{error ?? "Ticket not found."}</p>
        </div>
      </section>
    );
  }

  const isDeleted = !!ticket.deletedAt;
  const canEdit = user.role !== "end_user" && !isPreviewingRole && !isDeleted;
  const canRestore = isDeleted && user.role !== "end_user" && !isPreviewingRole;
  // For deleted tickets only admins can permanently delete; for active tickets any tech/admin can soft-delete
  const canDelete = isDeleted
    ? user.role === "admin" && !isPreviewingRole
    : user.role !== "end_user" && !isPreviewingRole;

  return (
    <section className="screen-stack">
      <ScreenHeader
        title={ticket.title}
        body={`#${formatTicketNumber(ticket.ticketNumber)} · Opened by ${ticket.requesterName} on ${formatShortDateTime(ticket.createdAt)}`}
        action={
          <Link
            className="ghost-link-button"
            to={isDeleted ? "/recycle-bin" : canEdit ? "/queue" : "/tickets"}
          >
            Back to {isDeleted ? "recycle bin" : canEdit ? "queue" : "my tickets"}
          </Link>
        }
      />

      {isDeleted && (
        <div className="deleted-ticket-banner">
          This ticket is in the recycle bin. Restore it to make changes, or delete it permanently.
        </div>
      )}
      <div className="detail-grid">
        {/* Left column: ticket overview */}
        <article className="panel detail-card">
          {(canDelete || canRestore) && !!ticket && (
            <div className="detail-card-actions">
              {status !== ticket.status || category !== ticket.category || assignedToEmail !== (ticket.assignedToEmail ?? "") ? (
                <>
                  {saveError ? <span className="error-text" style={{ fontSize: "0.8125rem" }}>{saveError}</span> : null}
                  <button
                    type="button"
                    className="panel-save-btn"
                    onClick={() => void saveTicketChanges()}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="panel-discard-btn"
                    onClick={handleDiscardTicketChanges}
                    disabled={isSaving}
                  >
                    Discard
                  </button>
                </>
              ) : null}
              {canRestore && (
                <button
                  type="button"
                  className="recycle-restore-btn"
                  onClick={() => setRestoreConfirmOpen(true)}
                >
                  Restore
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="panel-delete-btn"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  {ticket.deletedAt ? "Delete permanently" : "Delete"}
                </button>
              )}
            </div>
          )}
          {canEdit ? (
            <form className="detail-meta-form" onSubmit={handleUpdate}>
              <div className="detail-meta-grid">
                <div className="dma-pickers">
                  <div className="dma-status">
                    <p className="detail-label">Status</p>
                    <div className="status-picker" ref={statusPickerRef}>
                      <button
                        type="button"
                        className="picker-btn status-picker-trigger"
                        data-color={statuses.find((s) => s.name === status)?.color || undefined}
                        onClick={() => setStatusPickerOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={statusPickerOpen}
                      >
                        <StatusBadge
                          status={status}
                          color={statuses.find((s) => s.name === status)?.color}
                        />
                        <span className="picker-chevron">▾</span>
                      </button>
                      {statusPickerOpen && (
                        <div className="picker-popover" role="listbox">
                          {statuses.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`picker-btn picker-option${s.name === status ? " picker-option-active" : ""}`}
                              role="option"
                              aria-selected={s.name === status}
                              onClick={() => {
                                setStatus(s.name as TicketStatus);
                                setStatusPickerOpen(false);
                              }}
                            >
                              <StatusBadge status={s.name as TicketStatus} color={s.color} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dma-category">
                    <p className="detail-label">Category</p>
                    <div className="assignee-picker" ref={categoryPickerRef}>
                      <button
                        type="button"
                        className="picker-btn assignee-picker-trigger"
                        onClick={() => setCategoryPickerOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={categoryPickerOpen}
                      >
                        <span className="picker-trigger-text">{category}</span>
                        <span className="picker-chevron">▾</span>
                      </button>
                      {categoryPickerOpen && (
                        <div className="picker-popover" role="listbox">
                          {categories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`picker-btn picker-option${category === c.name ? " picker-option-active" : ""}`}
                              role="option"
                              aria-selected={category === c.name}
                              onClick={() => { setCategory(c.name); setCategoryPickerOpen(false); }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dma-assignee">
                    <p className="detail-label">Assigned technician</p>
                    <div className="assignee-picker" ref={assigneePickerRef}>
                      <button
                        type="button"
                        className="picker-btn assignee-picker-trigger"
                        onClick={() => setAssigneePickerOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={assigneePickerOpen}
                      >
                        <span className="picker-trigger-text">
                          {assignedToEmail
                            ? (staffMembers.find((u) => u.email === assignedToEmail)?.displayName ?? assignedToEmail)
                            : "Unassigned"}
                        </span>
                        <span className="picker-chevron">▾</span>
                      </button>
                      {assigneePickerOpen && (
                        <div className="picker-popover" role="listbox">
                          <button
                            type="button"
                            className={`picker-btn picker-option${!assignedToEmail ? " picker-option-active" : ""}`}
                            role="option"
                            aria-selected={!assignedToEmail}
                            onClick={() => { setAssignedToEmail(""); setAssigneePickerOpen(false); }}
                          >
                            Unassigned
                          </button>
                          {staffMembers.map((assignee) => (
                            <button
                              key={assignee.email}
                              type="button"
                              className={`picker-btn picker-option${assignedToEmail === assignee.email ? " picker-option-active" : ""}`}
                              role="option"
                              aria-selected={assignedToEmail === assignee.email}
                              onClick={() => { setAssignedToEmail(assignee.email); setAssigneePickerOpen(false); }}
                            >
                              {assignee.displayName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="dma-info">
                  <div className="dma-requester">
                    <p className="detail-label">Requester</p>
                    <div className="ticket-identity-block">
                      <strong>{ticket.requesterName}</strong>
                      <small>{ticket.requesterEmail}</small>
                    </div>
                  </div>
                  <div className="dma-updated">
                    <p className="detail-label">Updated</p>
                    <strong>{formatUpdatedAt(ticket.updatedAt)}</strong>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="detail-meta-grid">
              <div className="dma-pickers">
                <div className="dma-status">
                  <p className="detail-label">Status</p>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="dma-category">
                  <p className="detail-label">Category</p>
                  <strong>{ticket.category}</strong>
                </div>
                <div className="dma-assignee">
                  <p className="detail-label">Assigned technician</p>
                  <strong>{ticket.assignedToName ?? "Unassigned"}</strong>
                </div>
              </div>
              <div className="dma-info">
                <div className="dma-requester">
                  <p className="detail-label">Requester</p>
                  <div className="ticket-identity-block">
                    <strong>{ticket.requesterName}</strong>
                    <small>{ticket.requesterEmail}</small>
                  </div>
                </div>
                <div className="dma-updated">
                  <p className="detail-label">Updated</p>
                  <strong>{formatUpdatedAt(ticket.updatedAt)}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="detail-section">
            <p className="detail-label">Description</p>
            <MarkdownBody source={ticket.description} />
          </div>

          <div className="detail-section">
            <div className="detail-section-header">
              <p className="detail-label">Attachments</p>
              {!useMockApi && !isPreviewingRole && (
                <label className="attach-add-btn">
                  <input
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    disabled={isAddingAttachment}
                    onChange={handleAddAttachment}
                  />
                  {isAddingAttachment ? "Uploading…" : "+ Add files"}
                </label>
              )}
            </div>
            {ticket.attachments.length ? (
              <div className="attachment-gallery">
                {ticket.attachments.map((attachment, index) => {
                  const url = attachmentUrls[attachment.id];
                  const type = getAttachmentType(attachment.fileName);
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      className="gallery-thumb"
                      onClick={() => setLightboxIndex(index)}
                      title={attachment.fileName}
                    >
                      {url && type === "image" ? (
                        <img src={url} alt={attachment.fileName} className="gallery-thumb-img" />
                      ) : (
                        <div className="gallery-thumb-placeholder">
                          <span className="gallery-thumb-type">
                            {type === "pdf" ? "PDF" : type === "video" ? "Video" : "File"}
                          </span>
                          <span className="gallery-thumb-name">{attachment.fileName}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="subtle-copy">No attachments were included with this ticket.</p>
            )}
          </div>

          <div className="detail-section">
            {(() => {
              const collapsed = collapseActivity(ticket.activity);
              const COMPACT = 7;
              const visible = activityAllVisible ? collapsed : collapsed.slice(0, COMPACT);
              const canExpand = collapsed.length > 0;
              const totalRows = collapsed.reduce((n, item) => {
                const isOpen = Boolean(item._collapsedItems) && expandedGroups.has(item.id);
                return n + 1 + (isOpen ? (item._collapsedItems?.length ?? 0) : 0);
              }, 0);
              const canExpandFeed = collapsed.length > COMPACT || totalRows > COMPACT;
              return (
                <>
                  <button
                    type="button"
                    className="activity-section-toggle"
                    onClick={() => setActivityOpen((o) => !o)}
                    aria-expanded={activityOpen}
                  >
                    <span>
                      Activity
                      {collapsed.length > 0 && (
                        <span className="activity-section-count">{collapsed.length}</span>
                      )}
                    </span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: activityOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {activityOpen && (
                    <>
                      <FadeList className={activityAllVisible ? "activity-feed-tall" : "activity-feed-default"}>
                        <ul className="activity-list">
                          {visible.map((item) => {
                            const isGrouped = Boolean(item._collapsedItems);
                            const groupOpen = expandedGroups.has(item.id);
                            return (
                              <Fragment key={item.id}>
                                <li
                                  className={`activity-item${isGrouped ? " activity-item-group" : ""}`}
                                  onClick={isGrouped ? () => {
                                    setExpandedGroups((prev) => {
                                      const next = new Set(prev);
                                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                      return next;
                                    });
                                  } : undefined}
                                >
                                  {isGrouped ? (
                                    <svg
                                      width="7" height="10"
                                      viewBox="6 3 12 18"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="activity-disclosure"
                                      style={{ transform: groupOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                                      aria-hidden="true"
                                    >
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  ) : (
                                    <span className="activity-dot" aria-hidden="true" />
                                  )}
                                  <span className="activity-text">
                                    {formatActivityLabel(item)}
                                    {isGrouped && (
                                      <span className="activity-group-badge" aria-label={`${item._collapseCount} changes`}>
                                        {item._collapseCount}
                                      </span>
                                    )}
                                  </span>
                                  <time className="activity-time" data-full={formatShortDateTime(item.createdAt)}>
                                    {formatActivityTime(item.createdAt)}
                                  </time>
                                </li>
                                {isGrouped && groupOpen && item._collapsedItems?.map((sub, subIdx, subArr) => (
                                  <li key={sub.id} className="activity-item activity-item-sub" data-sub-last={subIdx === subArr.length - 1 ? "true" : undefined}>
                                    <span className="activity-dot activity-dot-sub" aria-hidden="true" />
                                    <span className="activity-text">{formatActivityLabel(sub)}</span>
                                    <time className="activity-time" data-full={formatShortDateTime(sub.createdAt)}>
                                      {formatActivityTime(sub.createdAt)}
                                    </time>
                                  </li>
                                ))}
                              </Fragment>
                            );
                          })}
                        </ul>
                      </FadeList>
                      {canExpandFeed && (
                        <button
                          type="button"
                          className="activity-expand-icon-btn"
                          onClick={() => setActivityAllVisible((e) => !e)}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {activityAllVisible
                              ? <polyline points="18 15 12 9 6 15" />
                              : <polyline points="6 9 12 15 18 9" />}
                          </svg>
                          {activityAllVisible ? "Show less" : "Show more"}
                        </button>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </article>

        {/* Right column: Discussion */}
        <aside className="panel message-thread detail-discussion">
          <div className="panel-header">
            <h3>Discussion</h3>
          </div>

          <div className="message-list">
            {messages.length === 0 ? (
              <p className="subtle-copy">No messages yet.<br />Start the conversation below.</p>
            ) : (
              messages.map((message) => {
                const isMe = message.authorEmail === user.email;
                const initials = message.authorName
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                const roleLabel =
                  message.authorRole === "admin"
                    ? "Admin"
                    : message.authorRole === "tech"
                      ? "Tech"
                      : "User";

                return (
                  <div key={message.id} className={`message-row${isMe ? " message-row-mine" : ""}`}>
                    {!isMe && (
                      <div className="message-avatar" title={message.authorName}>
                        {initials}
                      </div>
                    )}
                    <div className="message-bubble-group">
                      {!isMe && (
                        <div className="message-sender">
                          <strong>{message.authorName}</strong>
                          {roleLabel && (
                            <span className={`message-role-chip role-${message.authorRole}`}>
                              {roleLabel}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="message-bubble">
                        <MarkdownBody source={message.body} className="message-body" />
                      </div>
                      <time className="message-time">{formatShortDateTime(message.createdAt)}</time>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!isPreviewingRole && (
          <form className="message-compose" onSubmit={handleSendMessage}>
            <MarkdownEditor
              placeholder="Write a message..."
              value={messageBody}
              onChange={setMessageBody}
              rows={3}
            />
            {messageError ? <p className="error-text">{messageError}</p> : null}
            <div className="action-row">
              <button type="submit" disabled={isSendingMessage || !messageBody.trim()}>
                {isSendingMessage ? "Sending..." : "Send message"}
              </button>
            </div>
          </form>
          )}
        </aside>
      </div>

      <ConfirmDeleteModal
        count={1}
        open={deleteConfirmOpen}
        permanent={!!ticket?.deletedAt}
        onConfirm={async () => {
          if (!id) return;
          if (ticket?.deletedAt) {
            await apiClient.permanentlyDeleteTicket(id, requestHeaders);
            navigate("/recycle-bin");
          } else {
            await apiClient.deleteTicket(id, requestHeaders);
            navigate(-1);
          }
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <ConfirmRestoreModal
        count={1}
        open={restoreConfirmOpen}
        onConfirm={async () => {
          if (!id) return;
          await apiClient.restoreDeletedTicket(id, requestHeaders);
          navigate("/recycle-bin");
        }}
        onCancel={() => setRestoreConfirmOpen(false)}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && ticket.attachments[lightboxIndex] ? (() => {
        const attachment = ticket.attachments[lightboxIndex];
        const url = attachmentUrls[attachment.id];
        const type = getAttachmentType(attachment.fileName);
        const total = ticket.attachments.length;
        return (
          <div
            className="lightbox-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setLightboxIndex(null)}
          >
            <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
              <div className="lightbox-header">
                <span className="lightbox-filename">{attachment.fileName}</span>
                {total > 1 && (
                  <span className="lightbox-count">{lightboxIndex + 1} / {total}</span>
                )}
                <button
                  type="button"
                  className="lightbox-close"
                  aria-label="Close"
                  onClick={() => setLightboxIndex(null)}
                >
                  ✕
                </button>
              </div>

              <div className="lightbox-media-row">
                {total > 1 && (
                  <button
                    type="button"
                    className="lightbox-nav"
                    disabled={lightboxIndex === 0}
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                )}
                <div className="lightbox-media">
                  {!(attachment.id in attachmentUrls) ? (
                    <p className="lightbox-loading">Loading…</p>
                  ) : !url ? (
                    <div className="lightbox-unsupported">
                      <p className="detail-label">{attachment.fileName}</p>
                      <p className="subtle-copy">Preview is not available for this attachment.</p>
                    </div>
                  ) : type === "image" ? (
                    <img src={url} alt={attachment.fileName} className="lightbox-image" />
                  ) : type === "video" ? (
                    <video key={url} src={url} controls autoPlay className="lightbox-video" />
                  ) : type === "pdf" ? (
                    <iframe src={url} title={attachment.fileName} className="lightbox-pdf" />
                  ) : (
                    <div className="lightbox-unsupported">
                      <p className="detail-label">{attachment.fileName}</p>
                      <p className="subtle-copy">Preview not available for this file type.</p>
                    </div>
                  )}
                </div>
                {total > 1 && (
                  <button
                    type="button"
                    className="lightbox-nav"
                    disabled={lightboxIndex === total - 1}
                    onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                    aria-label="Next"
                  >
                    ›
                  </button>
                )}
              </div>

              {total > 1 && (
                <div className="lightbox-thumbstrip">
                  {ticket.attachments.map((att, i) => {
                    const thumbUrl = attachmentUrls[att.id];
                    const thumbType = getAttachmentType(att.fileName);
                    return (
                      <button
                        key={att.id}
                        type="button"
                        className={`lightbox-thumbstrip-item${i === lightboxIndex ? " lightbox-thumbstrip-active" : ""}`}
                        onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                        title={att.fileName}
                      >
                        {thumbUrl && thumbType === "image" ? (
                          <img src={thumbUrl} alt={att.fileName} />
                        ) : (
                          <span className="lightbox-thumbstrip-label">
                            {thumbType === "pdf" ? "PDF" : thumbType === "video" ? "▶" : String(i + 1)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })() : null}
    </section>
  );
}

function DashboardPage() {
  const { requestHeaders, user } = useSession();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesterPeriod, setRequesterPeriod] = useState<Period>("monthly");
  const [resolverPeriod, setResolverPeriod] = useState<Period>("monthly");
  const [oldestPending, setOldestPending] = useState<Record<string, TicketPendingChange>>({});
  const [oldestSaving, setOldestSaving] = useState(false);
  const [oldestSelectedIds, setOldestSelectedIds] = useState<Set<string>>(new Set());
  const [oldestDeleteConfirmOpen, setOldestDeleteConfirmOpen] = useState(false);
  const [oldestBulkResetKey, setOldestBulkResetKey] = useState(0);
  const [recentPending, setRecentPending] = useState<Record<string, TicketPendingChange>>({});
  const [recentSaving, setRecentSaving] = useState(false);
  const [recentSelectedIds, setRecentSelectedIds] = useState<Set<string>>(new Set());
  const [recentDeleteConfirmOpen, setRecentDeleteConfirmOpen] = useState(false);
  const [recentBulkResetKey, setRecentBulkResetKey] = useState(0);
  const [dashRefreshKey, setDashRefreshKey] = useState(0);
  const [ticketView, setTicketView] = useState<"oldest" | "recent">("oldest");
  const [teamTab, setTeamTab] = useState<"admin" | "tech">("tech");

  useEffect(() => {
    let active = true;

    Promise.all([
      apiClient.getAdminTickets({}, requestHeaders),
      apiClient.getStatuses(requestHeaders),
      apiClient.getCategories(requestHeaders),
      apiClient.getStaff(requestHeaders)
    ])
      .then(([result, statusRecords, categoryRecords, staffRecords]) => {
        if (active) {
          setTickets(result);
          setStatuses(statusRecords);
          setCategories(categoryRecords);
          setStaffMembers(staffRecords);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load dashboard.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestHeaders, dashRefreshKey]);

  const hasOldestPending = Object.keys(oldestPending).length > 0;
  const hasRecentPending = Object.keys(recentPending).length > 0;

  async function savePendingChanges(pending: Record<string, TicketPendingChange>) {
    await Promise.all(
      Object.entries(pending).map(([id, changes]) => {
        const staff = staffMembers.find((s) => s.email === changes.assignedToEmail);
        return apiClient.updateAdminTicket(
          id,
          {
            ...(changes.status ? { status: changes.status as TicketStatus } : {}),
            ...(changes.category ? { category: changes.category as TicketFilters["category"] } : {}),
            ...(changes.assignedToEmail !== undefined
              ? {
                  assignedToEmail: changes.assignedToEmail || null,
                  assignedToName: changes.assignedToEmail ? (staff?.displayName ?? null) : null,
                }
              : {}),
          },
          requestHeaders
        );
      })
    );
  }

  function handleOldestSelectChange(id: string, selected: boolean) {
    setOldestSelectedIds((prev) => { const next = new Set(prev); if (selected) next.add(id); else next.delete(id); return next; });
  }
  async function handleOldestBulkDelete() {
    await Promise.all([...oldestSelectedIds].map((id) => apiClient.deleteTicket(id, requestHeaders)));
    setOldestSelectedIds(new Set());
    setDashRefreshKey((k) => k + 1);
  }

  function handleRecentSelectChange(id: string, selected: boolean) {
    setRecentSelectedIds((prev) => { const next = new Set(prev); if (selected) next.add(id); else next.delete(id); return next; });
  }
  async function handleRecentBulkDelete() {
    await Promise.all([...recentSelectedIds].map((id) => apiClient.deleteTicket(id, requestHeaders)));
    setRecentSelectedIds(new Set());
    setDashRefreshKey((k) => k + 1);
  }

  function handleOldestFieldChange(ticketId: string, field: keyof TicketPendingChange, value: string) {
    setOldestPending((prev) => ({ ...prev, [ticketId]: { ...prev[ticketId], [field]: value } }));
  }

  async function handleOldestSaveAll() {
    setOldestSaving(true);
    try {
      await savePendingChanges(oldestPending);
      setOldestPending({});
      setOldestSelectedIds(new Set());
      setDashRefreshKey((k) => k + 1);
    } catch { } finally { setOldestSaving(false); }
  }

  function handleRecentFieldChange(ticketId: string, field: keyof TicketPendingChange, value: string) {
    setRecentPending((prev) => ({ ...prev, [ticketId]: { ...prev[ticketId], [field]: value } }));
  }

  function handleOldestBulkFieldChange(field: keyof TicketPendingChange, value: string) {
    setOldestPending((prev) => {
      const next = { ...prev };
      for (const id of oldestSelectedIds) next[id] = { ...next[id], [field]: value };
      return next;
    });
  }

  function handleRecentBulkFieldChange(field: keyof TicketPendingChange, value: string) {
    setRecentPending((prev) => {
      const next = { ...prev };
      for (const id of recentSelectedIds) next[id] = { ...next[id], [field]: value };
      return next;
    });
  }

  async function handleRecentSaveAll() {
    setRecentSaving(true);
    try {
      await savePendingChanges(recentPending);
      setRecentPending({});
      setRecentSelectedIds(new Set());
      setDashRefreshKey((k) => k + 1);
    } catch { } finally { setRecentSaving(false); }
  }

  // For the nav modal — saves everything that's pending, propagates errors
  async function handleAllDashSaveForNav() {
    const ops: Promise<void>[] = [];
    if (hasOldestPending) ops.push(savePendingChanges(oldestPending).then(() => setOldestPending({})));
    if (hasRecentPending) ops.push(savePendingChanges(recentPending).then(() => setRecentPending({})));
    await Promise.all(ops);
    setDashRefreshKey((k) => k + 1);
  }

  const metrics = buildMetrics(tickets, statuses, categories);
  const teamLoad = buildTeamLoad(tickets, staffMembers);
  const unassignedCount = tickets.filter((ticket) => !ticket.assignedToEmail).length;

  const myQueueTickets = tickets
    .filter((t) => t.assignedToEmail === user.email)
    .slice(0, 5);

  const oldestOpen = [...tickets]
    .filter((t) => t.status !== "Resolved" && t.status !== "Closed")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5);

  type PerfEntry = { name: string; count: number };

  const topRequesters: PerfEntry[] = Object.values(
    tickets
      .filter((t) => new Date(t.createdAt) >= getPeriodStart(requesterPeriod))
      .reduce((acc, t) => {
        if (!acc[t.requesterEmail]) acc[t.requesterEmail] = { name: t.requesterName, count: 0 };
        acc[t.requesterEmail].count++;
        return acc;
      }, {} as Record<string, PerfEntry>)
  ).sort((a, b) => b.count - a.count).slice(0, 5);

  const resolvedByTech: PerfEntry[] = Object.values(
    tickets
      .filter(
        (t) =>
          (t.status === "Resolved" || t.status === "Closed") &&
          t.assignedToEmail &&
          new Date(t.updatedAt) >= getPeriodStart(resolverPeriod)
      )
      .reduce((acc, t) => {
        const key = t.assignedToEmail!;
        if (!acc[key]) acc[key] = { name: t.assignedToName ?? key, count: 0 };
        acc[key].count++;
        return acc;
      }, {} as Record<string, PerfEntry>)
  ).sort((a, b) => b.count - a.count);

  const ticketsBase = "/all-tickets";
  const openStatusParam = statuses
    .filter((s) => s.name !== "Resolved" && s.name !== "Closed")
    .map((s) => s.name)
    .join(",");

  const dashboardTiles = [
    { label: "Open", value: metrics.totalOpenTickets, tone: "open", href: buildQueuePath({ status: openStatusParam || undefined }, ticketsBase) },
    { label: "New", value: metrics.byStatus["New"] ?? 0, tone: "new", href: buildQueuePath({ status: "New" }, ticketsBase) },
    { label: "In Progress", value: metrics.byStatus["In Progress"] ?? 0, tone: "progress", href: buildQueuePath({ status: "In Progress" }, ticketsBase) },
    { label: "Resolved", value: metrics.byStatus["Resolved"] ?? 0, tone: "resolved", href: buildQueuePath({ status: "Resolved" }, ticketsBase) }
  ];

  if (user.role === "admin") {
    dashboardTiles.splice(1, 0, { label: "Unassigned", value: unassignedCount, tone: "alert", href: buildQueuePath({ view: "unassigned" }, ticketsBase) });
  }

  const title = user.role === "admin" ? "Dashboard" : "Dashboard";
  const body =
    user.role === "admin"
      ? "Queue health, ownership gaps, and category coverage."
      : "Queue volume and recent activity.";

  return (
    <section className="screen-stack">
      <ScreenHeader
        title={title}
        body={body}
        action={
          <div className="button-row">
            <Link className="ghost-link-button" to={ticketsBase}>
              All tickets
            </Link>
            <Link className="primary-link-button" to="/submit">
              New ticket
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="panel">
          <p>Loading dashboard...</p>
        </div>
      ) : null}

      {error ? (
        <div className="panel">
          <p className="error-text">{error}</p>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className={`metric-grid${dashboardTiles.length === 4 ? " metric-grid-4" : ""}`}>
            {dashboardTiles.map((tile) => (
              <Link key={tile.label} className="metric-tile metric-tile-link" data-tone={tile.tone} to={tile.href}>
                <span className="metric-label">{tile.label}</span>
                <strong className="metric-value">{tile.value ?? 0}</strong>
              </Link>
            ))}
          </div>

          {user.role === "admin" ? (
            <div className="panel command-ribbon">
              <div>
                <p className="section-eyebrow">Attention needed</p>
                <h3>{unassignedCount} unassigned tickets</h3>
              </div>
              <Link
                className="ghost-link-button"
                to={buildQueuePath({ view: "unassigned" }, ticketsBase)}
              >
                Review gaps
              </Link>
            </div>
          ) : null}

          {user.role === "tech" ? (
            <div className="panel">
              <div className="panel-header">
                <h3>My queue</h3>
                <Link className="text-link" to="/queue">
                  Open my queue
                </Link>
              </div>
              <TicketTable
                tickets={myQueueTickets}
                showRequester
                emptyTitle="No tickets assigned to you"
                emptyBody="Tickets assigned to you will appear here once work is distributed."
              />
            </div>
          ) : null}

          {user.role === "tech" ? (
            <div className="panel">
              <div className="panel-header">
                <h3>Recently updated</h3>
                <div className="panel-header-actions">
                  {hasRecentPending && (
                    <>
                      <button
                        type="button"
                        className="panel-save-btn"
                        onClick={() => void handleRecentSaveAll()}
                        disabled={recentSaving}
                      >
                        {recentSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="panel-discard-btn"
                        onClick={() => { setRecentPending({}); setRecentSelectedIds(new Set()); setRecentBulkResetKey((k) => k + 1); }}
                        disabled={recentSaving}
                      >
                        Discard
                      </button>
                    </>
                  )}
                  <Link className="text-link" to={ticketsBase}>View all</Link>
                </div>
              </div>
              {(recentSelectedIds.size > 0 || hasRecentPending) && (
                <BulkEditBar
                  key={recentBulkResetKey}
                  selectedCount={recentSelectedIds.size}
                  pendingCount={Object.keys(recentPending).length}
                  statusOptions={statuses}
                  categoryOptions={categories}
                  staffOptions={staffMembers}
                  onBulkChange={handleRecentBulkFieldChange}
                  onDelete={() => setRecentDeleteConfirmOpen(true)}
                />
              )}
              <TicketTable
                tickets={metrics.recentTickets}
                showRequester
                emptyTitle="No recent tickets"
                emptyBody="Recent updates will appear here as the queue becomes active."
                editable
                statusOptions={statuses}
                categoryOptions={categories}
                staffOptions={staffMembers}
                pendingChanges={recentPending}
                onFieldChange={handleRecentFieldChange}
                selectable
                selectedIds={recentSelectedIds}
                onSelectChange={handleRecentSelectChange}
                onSelectAllChange={(allSelected) => { setRecentSelectedIds(allSelected ? new Set(metrics.recentTickets.map((t) => t.id)) : new Set()); }}
              />
            </div>
          ) : null}

          {user.role === "tech" ? (
            <div className="panel">
              <div className="panel-header">
                <h3>Categories</h3>
              </div>
              <FadeList className="dash-category-fade">
                <div className="category-dash-list">
                  {categories.map((cat) => {
                    const open = tickets.filter(
                      (t) =>
                        t.category === cat.name &&
                        t.status !== "Resolved" &&
                        t.status !== "Closed"
                    ).length;
                    const total = metrics.byCategory[cat.name] ?? 0;
                    return (
                      <div key={cat.id} className="category-dash-row">
                        <Link
                          className="category-dash-name"
                          to={buildQueuePath({ category: cat.name }, "/all-tickets")}
                        >
                          {cat.name}
                        </Link>
                        <span className="category-dash-stats">
                          {open > 0 ? (
                            <Link
                              className="category-dash-open"
                              to={buildQueuePath({ category: cat.name, status: openStatusParam || undefined }, "/all-tickets")}
                            >
                              {open} open
                            </Link>
                          ) : null}
                          <Link
                            className="category-dash-total"
                            to={buildQueuePath({ category: cat.name }, "/all-tickets")}
                          >
                            {total} total
                          </Link>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </FadeList>
            </div>
          ) : null}

          {user.role === "admin" ? (
            <>
              <div className="panel">
                <div className="panel-header">
                  <div className="dash-view-tabs">
                    <button
                      type="button"
                      className={`dash-tab${ticketView === "oldest" ? " dash-tab--active" : ""}`}
                      onClick={() => setTicketView("oldest")}
                    >
                      Oldest open
                    </button>
                    <button
                      type="button"
                      className={`dash-tab${ticketView === "recent" ? " dash-tab--active" : ""}`}
                      onClick={() => setTicketView("recent")}
                    >
                      Recently updated
                    </button>
                  </div>
                  <div className="panel-header-actions">
                    {ticketView === "oldest" ? (
                      <Link className="text-link" to={buildQueuePath({ status: openStatusParam || undefined }, ticketsBase)}>
                        View all
                      </Link>
                    ) : (
                      <Link className="text-link" to={ticketsBase}>View all</Link>
                    )}
                  </div>
                </div>
                {ticketView === "oldest" ? (
                  <>
                    {(oldestSelectedIds.size > 0 || hasOldestPending) && (
                      <BulkEditBar
                        key={oldestBulkResetKey}
                        selectedCount={oldestSelectedIds.size}
                        pendingCount={Object.keys(oldestPending).length}
                        statusOptions={statuses}
                        categoryOptions={categories}
                        staffOptions={staffMembers}
                        onBulkChange={handleOldestBulkFieldChange}
                        onDelete={() => setOldestDeleteConfirmOpen(true)}
                        saveActions={hasOldestPending ? (
                          <>
                            <button type="button" className="panel-save-btn" onClick={() => void handleOldestSaveAll()} disabled={oldestSaving}>
                              {oldestSaving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" className="panel-discard-btn" onClick={() => { setOldestPending({}); setOldestSelectedIds(new Set()); setOldestBulkResetKey((k) => k + 1); }} disabled={oldestSaving}>
                              Discard
                            </button>
                          </>
                        ) : undefined}
                      />
                    )}
                    <TicketTable
                      tickets={oldestOpen}
                      showRequester
                      emptyTitle="No open tickets"
                      emptyBody="All tickets are resolved or closed."
                      editable
                      statusOptions={statuses}
                      categoryOptions={categories}
                      staffOptions={staffMembers}
                      pendingChanges={oldestPending}
                      onFieldChange={handleOldestFieldChange}
                      selectable
                      selectedIds={oldestSelectedIds}
                      onSelectChange={handleOldestSelectChange}
                      onSelectAllChange={(allSelected) => { setOldestSelectedIds(allSelected ? new Set(oldestOpen.map((t) => t.id)) : new Set()); }}
                    />
                  </>
                ) : (
                  <>
                    {(recentSelectedIds.size > 0 || hasRecentPending) && (
                      <BulkEditBar
                        key={recentBulkResetKey}
                        selectedCount={recentSelectedIds.size}
                        pendingCount={Object.keys(recentPending).length}
                        statusOptions={statuses}
                        categoryOptions={categories}
                        staffOptions={staffMembers}
                        onBulkChange={handleRecentBulkFieldChange}
                        onDelete={() => setRecentDeleteConfirmOpen(true)}
                        saveActions={hasRecentPending ? (
                          <>
                            <button type="button" className="panel-save-btn" onClick={() => void handleRecentSaveAll()} disabled={recentSaving}>
                              {recentSaving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" className="panel-discard-btn" onClick={() => { setRecentPending({}); setRecentSelectedIds(new Set()); setRecentBulkResetKey((k) => k + 1); }} disabled={recentSaving}>
                              Discard
                            </button>
                          </>
                        ) : undefined}
                      />
                    )}
                    <TicketTable
                      tickets={metrics.recentTickets}
                      showRequester
                      emptyTitle="No recent tickets"
                      emptyBody="Recent updates will appear here as the queue becomes active."
                      editable
                      statusOptions={statuses}
                      categoryOptions={categories}
                      staffOptions={staffMembers}
                      pendingChanges={recentPending}
                      onFieldChange={handleRecentFieldChange}
                      selectable
                      selectedIds={recentSelectedIds}
                      onSelectChange={handleRecentSelectChange}
                      onSelectAllChange={(allSelected) => { setRecentSelectedIds(allSelected ? new Set(metrics.recentTickets.map((t) => t.id)) : new Set()); }}
                    />
                  </>
                )}
              </div>

              <div className="dashboard-quad">
                <div className="panel">
                  <div className="panel-header">
                    <h3>Categories</h3>
                    <Link className="text-link" to="/admin/panel">
                      Manage
                    </Link>
                  </div>
                  <FadeList className="dash-category-fade">
                    <div className="category-dash-list">
                      {categories.map((cat) => {
                        const total = metrics.byCategory[cat.name] ?? 0;
                        const open = tickets.filter(
                          (t) =>
                            t.category === cat.name &&
                            t.status !== "Resolved" &&
                            t.status !== "Closed"
                        ).length;
                        return (
                          <div key={cat.id} className="category-dash-row">
                            <Link
                              className="category-dash-name"
                              to={buildQueuePath({ category: cat.name }, ticketsBase)}
                            >
                              {cat.name}
                            </Link>
                            <span className="category-dash-stats">
                              {open > 0 ? (
                                <Link
                                  className="category-dash-open"
                                  to={buildQueuePath({ category: cat.name, status: openStatusParam || undefined }, ticketsBase)}
                                >
                                  {open} open
                                </Link>
                              ) : null}
                              <Link
                                className="category-dash-total"
                                to={buildQueuePath({ category: cat.name }, ticketsBase)}
                              >
                                {total} total
                              </Link>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </FadeList>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Top requesters</h3>
                    <div className="period-selector">
                      {(["weekly", "monthly", "quarterly", "yearly"] as Period[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`period-btn${requesterPeriod === p ? " period-btn-active" : ""}`}
                          onClick={() => setRequesterPeriod(p)}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FadeList className="dash-perf-fade">
                    <div className="perf-list">
                      {topRequesters.length === 0 ? (
                        <p className="perf-empty">No tickets in this period.</p>
                      ) : (
                        topRequesters.map((entry, i) => (
                          <div key={i} className="perf-row">
                            <span className="perf-rank">{i + 1}</span>
                            <span className="perf-name">{entry.name}</span>
                            <span className="perf-count">{entry.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </FadeList>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Top resolvers</h3>
                    <div className="period-selector">
                      {(["weekly", "monthly", "quarterly", "yearly"] as Period[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`period-btn${resolverPeriod === p ? " period-btn-active" : ""}`}
                          onClick={() => setResolverPeriod(p)}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FadeList className="dash-perf-fade">
                    <div className="perf-list">
                      {resolvedByTech.length === 0 ? (
                        <p className="perf-empty">No resolved tickets in this period.</p>
                      ) : (
                        resolvedByTech.map((entry, i) => (
                          <div key={i} className="perf-row">
                            <span className="perf-rank">{i + 1}</span>
                            <span className="perf-name">{entry.name}</span>
                            <span className="perf-count">{entry.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </FadeList>
                </div>

                <div className="panel">
                  <div className="admin-panel-section-header">
                    <h3 className="admin-panel-section-title">Team</h3>
                    <div className="dash-view-tabs">
                      <button
                        type="button"
                        className={`dash-tab${teamTab === "tech" ? " dash-tab--active" : ""}`}
                        onClick={() => setTeamTab("tech")}
                      >
                        Techs
                      </button>
                      <button
                        type="button"
                        className={`dash-tab${teamTab === "admin" ? " dash-tab--active" : ""}`}
                        onClick={() => setTeamTab("admin")}
                      >
                        Admins
                      </button>
                    </div>
                  </div>
                  <FadeList className="dash-team-fade">
                    <ul className="team-member-list">
                      {teamLoad.filter((m) => m.role === teamTab).map((member) => {
                        const initials = member.name.trim().split(/\s+/).map((p) => p[0].toUpperCase()).slice(0, 2).join("");
                        return (
                          <li key={member.email} className="team-member-card">
                            <div className="team-member-avatar">{initials}</div>
                            <div className="team-member-info">
                              <span className="team-member-name">{member.name}</span>
                              <span className="team-member-email">{member.email}</span>
                            </div>
                            <div className="team-member-stats">
                              <Link
                                className="team-member-stat team-member-stat--link"
                                to={buildQueuePath({ assignee: member.email, view: "open" }, ticketsBase)}
                              >
                                <span className="team-member-stat-value">{member.active}</span>
                                <span className="team-member-stat-label">Queue</span>
                              </Link>
                              <Link
                                className="team-member-stat team-member-stat--link"
                                to={buildQueuePath({ assignee: member.email, status: "Resolved" }, ticketsBase)}
                              >
                                <span className="team-member-stat-value">{member.resolved}</span>
                                <span className="team-member-stat-label">Resolved</span>
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </FadeList>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}
      <ConfirmDeleteModal
        count={oldestSelectedIds.size}
        open={oldestDeleteConfirmOpen}
        onConfirm={handleOldestBulkDelete}
        onCancel={() => setOldestDeleteConfirmOpen(false)}
      />
      <ConfirmDeleteModal
        count={recentSelectedIds.size}
        open={recentDeleteConfirmOpen}
        onConfirm={handleRecentBulkDelete}
        onCancel={() => setRecentDeleteConfirmOpen(false)}
      />
      <ConfirmNavModal
        when={hasOldestPending || hasRecentPending}
        onSave={handleAllDashSaveForNav}
        onDiscard={() => { setOldestPending({}); setRecentPending({}); }}
      />
    </section>
  );
}

function QueuePage({ personalQueue = false }: { personalQueue?: boolean }) {
  const { requestHeaders, user } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>(_statusCache);
  const [categories, setCategories] = useState<CategoryRecord[]>(_categoryCache);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(_staffCache);
  const [requesterOptions, setRequesterOptions] = useState<{ value: string; label: string; sublabel: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);
  const [pendingChanges, setPendingChanges] = useState<Record<string, TicketPendingChange>>({});
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bulkResetKey, setBulkResetKey] = useState(0);

  const hasPending = Object.keys(pendingChanges).length > 0;

  function handleSelectChange(id: string, selected: boolean) {
    setSelectedIds((prev) => { const next = new Set(prev); if (selected) next.add(id); else next.delete(id); return next; });
  }

  async function handleBulkDelete() {
    await Promise.all([...selectedIds].map((id) => apiClient.deleteTicket(id, requestHeaders)));
    setSelectedIds(new Set());
    setRefreshKey((k) => k + 1);
  }

  function handleBulkFieldChange(field: keyof TicketPendingChange, value: string) {
    setPendingChanges((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = { ...next[id], [field]: value };
      return next;
    });
  }

  function handleFieldChange(ticketId: string, field: keyof TicketPendingChange, value: string) {
    setPendingChanges((prev) => ({
      ...prev,
      [ticketId]: { ...prev[ticketId], [field]: value },
    }));
  }

  async function applyPendingChanges() {
    await Promise.all(
      Object.entries(pendingChanges).map(([id, changes]) => {
        const staff = staffMembers.find((s) => s.email === changes.assignedToEmail);
        return apiClient.updateAdminTicket(
          id,
          {
            ...(changes.status ? { status: changes.status as TicketStatus } : {}),
            ...(changes.category ? { category: changes.category as TicketFilters["category"] } : {}),
            ...(changes.assignedToEmail !== undefined
              ? {
                  assignedToEmail: changes.assignedToEmail || null,
                  assignedToName: changes.assignedToEmail ? (staff?.displayName ?? null) : null,
                }
              : {}),
          },
          requestHeaders
        );
      })
    );
    setPendingChanges({});
    setSelectedIds(new Set());
    setRefreshKey((k) => k + 1);
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      await applyPendingChanges();
    } catch {
      // leave pending so user can retry
    } finally {
      setSaving(false);
    }
  }

  // Capture requestHeaders in a ref so the one-time options fetch always uses

  // the current value without making requestHeaders a useEffect dependency.
  // (MockAuthProvider creates a new object on every render, which would cause
  // the effect to re-run and race with the filtered ticket fetch.)
  const requestHeadersRef = useRef(requestHeaders);
  requestHeadersRef.current = requestHeaders;

  useEffect(() => {
    const headers = requestHeadersRef.current;
    apiClient.getStatuses(headers).then((s) => { _statusCache = s; setStatuses(s); }).catch(() => {});
    apiClient.getCategories(headers).then((c) => { _categoryCache = c; setCategories(c); }).catch(() => {});
    apiClient.getStaff(headers).then((s) => { _staffCache = s; setStaffMembers(s); }).catch(() => {});
    apiClient
      .getAdminTickets({}, headers)
      .then((all) => {
        const seen = new Set<string>();
        const opts: { value: string; label: string; sublabel: string }[] = [];
        all.forEach((t) => {
          if (!seen.has(t.requesterEmail)) {
            seen.add(t.requesterEmail);
            opts.push({ value: t.requesterEmail, label: t.requesterName, sublabel: t.requesterEmail });
          }
        });
        setRequesterOptions(opts.sort((a, b) => a.label.localeCompare(b.label)));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusParam = searchParams.get("status") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const assigneeParam = searchParams.get("assignee") ?? "";
  const requesterParam = searchParams.get("requester") ?? "";
  const search = searchParams.get("search") ?? "";
  const view = (searchParams.get("view") ?? "") as QueueView;

  // Reset to page 1 whenever filters change
  const prevFiltersRef = useRef("");
  const filtersKey = [assigneeParam, categoryParam, requesterParam, search, statusParam, view].join("|");
  if (prevFiltersRef.current !== filtersKey) {
    prevFiltersRef.current = filtersKey;
    if (page !== 1) setPage(1);
  }

  const selectedStatuses = statusParam ? statusParam.split(",").map((s) => s.trim()) : [];
  const selectedCategories = categoryParam ? categoryParam.split(",").map((s) => s.trim()) : [];
  // realAssignees = only actual email values (no special tokens)
  const realAssignees = assigneeParam ? assigneeParam.split(",").map((s) => s.trim()) : [];
  // selectedAssignees includes the synthetic "__unassigned__" chip when view=unassigned
  const selectedAssignees = view === "unassigned" ? ["__unassigned__", ...realAssignees] : realAssignees;
  const selectedRequesters = requesterParam ? requesterParam.split(",").map((s) => s.trim()) : [];

  function updateParams(nextValues: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(nextValues).forEach(([key, value]) => {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        });
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  function toggleStatus(name: string) {
    const next = selectedStatuses.includes(name)
      ? selectedStatuses.filter((s) => s !== name)
      : [...selectedStatuses, name];
    updateParams({ status: next.length > 0 ? next.join(",") : undefined, view: undefined });
  }

  function toggleCategory(name: string) {
    const next = selectedCategories.includes(name)
      ? selectedCategories.filter((s) => s !== name)
      : [...selectedCategories, name];
    updateParams({ category: next.length > 0 ? next.join(",") : undefined });
  }

  function toggleAssignee(email: string) {
    if (email === "__unassigned__") {
      // Toggle the unassigned view filter; clear specific assignees for simplicity
      updateParams({
        view: view === "unassigned" ? undefined : "unassigned",
        assignee: undefined
      });
      return;
    }
    const next = realAssignees.includes(email)
      ? realAssignees.filter((s) => s !== email)
      : [...realAssignees, email];
    const nextView =
      next.length === 0
        ? undefined // no assignees left — clear view
        : view === "unassigned"
          ? undefined // switching from unassigned to a real assignee — clear unassigned view
          : view || undefined; // preserve "open" queue toggle if active
    updateParams({
      assignee: next.length > 0 ? next.join(",") : undefined,
      view: nextView
    });
  }

  function toggleRequester(email: string) {
    const next = selectedRequesters.includes(email)
      ? selectedRequesters.filter((s) => s !== email)
      : [...selectedRequesters, email];
    updateParams({ requester: next.length > 0 ? next.join(",") : undefined });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    let active = true;
    setLoading(true);

    const headers = requestHeadersRef.current;
    const apiFilters: TicketFilters = {
      status: (statusParam || undefined) as TicketStatus | undefined,
      category: (categoryParam || undefined) as TicketFilters["category"] | undefined,
      assignee: personalQueue ? user.email : (realAssignees.length > 0 ? realAssignees.join(",") : undefined),
      requester: requesterParam || undefined,
      search: search || undefined
    };

    apiClient
      .getAdminTickets(apiFilters, headers)
      .then((result) => {
        if (active) {
          setTickets(applyQueueView(result, personalQueue && !statusParam ? "open" : view));
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load the queue.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeParam, categoryParam, requesterParam, search, statusParam, view, refreshKey]);

  const hasFilters = Boolean(
    statusParam || categoryParam || requesterParam || search || view ||
    (!personalQueue && assigneeParam)
  );
  const queueBody = personalQueue
    ? "Tickets assigned to you."
    : "All tickets across the organization.";

  const assigneeOptions = [
    { value: "__unassigned__", label: "Unassigned", sublabel: "" },
    ...staffMembers.map((u) => ({
      value: u.email,
      label: u.displayName,
      sublabel: u.email
    }))
  ];

  const categoryOptions = categories.map((c) => ({
    value: c.name,
    label: c.name
  }));

  return (
    <section className="screen-stack">
      <ScreenHeader
        title={personalQueue ? "Queue" : "All Tickets"}
        body={queueBody}
        action={
          <Link className="ghost-link-button" to="/dashboard">
            Back to dashboard
          </Link>
        }
      />

      <div className="panel filter-panel">
        {hasFilters ? (
          <button type="button" className="ghost-button filter-panel-reset" onClick={clearFilters}>
            Reset filters
          </button>
        ) : null}
        <div className="filter-grid">
          <div className="field filter-field-full">
            <span className="field-label">Status</span>
            <div className="status-filter-pills">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`status-filter-pill${selectedStatuses.includes(s.name) ? " selected" : ""}`}
                  data-color={s.color}
                  onClick={() => toggleStatus(s.name)}
                >
                  <span className="status-dot" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <MultiSelectCombobox
            fieldLabel="Category"
            options={categoryOptions}
            selected={selectedCategories}
            onToggle={toggleCategory}
            placeholder="All categories"
          />

          {!personalQueue ? (
            <div className="assignee-queue-field">
              <MultiSelectCombobox
                fieldLabel="Assignee"
                options={assigneeOptions}
                selected={selectedAssignees}
                onToggle={toggleAssignee}
                placeholder="All assignees"
              />
              <button
                type="button"
                className={`queue-toggle-btn${view === "open" && realAssignees.length > 0 ? " queue-toggle-active" : ""}`}
                disabled={realAssignees.length === 0}
                onClick={() => updateParams({ view: view === "open" ? undefined : "open", status: undefined })}
                title={realAssignees.length === 0 ? "Select an assignee to enable queue filter" : "Show open tickets only — excludes resolved and closed"}
              >
                Queue
              </button>
            </div>
          ) : null}

          <MultiSelectCombobox
            fieldLabel="Requester"
            options={requesterOptions}
            selected={selectedRequesters}
            onToggle={toggleRequester}
            placeholder="All requesters"
          />

          <label className="field">
            <span className="field-label">Search</span>
            <input
              value={search}
              onChange={(event) =>
                updateParams({
                  search: event.target.value || undefined
                })
              }
              placeholder="Mailbox, docking station, Wi-Fi..."
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}</h3>
        </div>
        {(selectedIds.size > 0 || hasPending) && (
          <BulkEditBar
            key={bulkResetKey}
            selectedCount={selectedIds.size}
            pendingCount={Object.keys(pendingChanges).length}
            statusOptions={statuses}
            categoryOptions={categories}
            staffOptions={staffMembers}
            onBulkChange={handleBulkFieldChange}
            onDelete={() => setDeleteConfirmOpen(true)}
            saveActions={hasPending ? (
              <>
                <button type="button" className="panel-save-btn" onClick={() => void handleSaveAll()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" className="panel-discard-btn" onClick={() => { setPendingChanges({}); setSelectedIds(new Set()); setBulkResetKey((k) => k + 1); }} disabled={saving}>
                  Discard
                </button>
              </>
            ) : undefined}
          />
        )}

        {error ? <p className="error-text">{error}</p> : null}
        {!error ? (
          <div style={{ opacity: loading ? 0.4 : 1, transition: "opacity 150ms" }}>
            <FadeList className="ticket-fade-list">
              <TicketTable
                tickets={tickets.slice((page - 1) * pageSize, page * pageSize)}
                showRequester
                emptyTitle="No matching tickets"
                emptyBody="Adjust the filters or wait for new requests to enter the queue."
                editable
                statusOptions={statuses}
                categoryOptions={categories}
                staffOptions={staffMembers}
                pendingChanges={pendingChanges}
                onFieldChange={handleFieldChange}
                selectable
                selectedIds={selectedIds}
                onSelectChange={handleSelectChange}
                onSelectAllChange={(allSelected) => { setSelectedIds(allSelected ? new Set(tickets.slice((page - 1) * pageSize, page * pageSize).map((t) => t.id)) : new Set()); }}
              />
            </FadeList>
            <PaginationBar
              total={tickets.length}
              pageSize={pageSize}
              page={page}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        ) : null}
      </div>
      <ConfirmDeleteModal
        count={selectedIds.size}
        open={deleteConfirmOpen}
        onConfirm={handleBulkDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <ConfirmNavModal
        when={hasPending}
        onSave={applyPendingChanges}
        onDiscard={() => setPendingChanges({})}
      />
    </section>
  );
}

function RecycleBinPage() {
  const { user, requestHeaders } = useSession();
  const isAdmin = user.role === "admin";
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkRestoreConfirmOpen, setBulkRestoreConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);

  function daysLeft(deletedAt: string | null): number {
    if (!deletedAt) return 90;
    const daysSince = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.floor(90 - daysSince));
  }

  useEffect(() => {
    let active = true;
    apiClient.getRecycleBin(requestHeaders)
      .then((result) => { if (active) { setTickets(result); setLoading(false); } })
      .catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : "Unable to load recycle bin."); setLoading(false); } });
    return () => { active = false; };
  }, [requestHeaders]);

  function handleSelectChange(id: string, selected: boolean) {
    setSelectedIds((prev) => { const next = new Set(prev); if (selected) next.add(id); else next.delete(id); return next; });
  }

  function handleSelectAllChange(allSelected: boolean) {
    setSelectedIds(allSelected ? new Set(tickets.map((t) => t.id)) : new Set());
  }

  async function handleBulkRestore() {
    await Promise.all([...selectedIds].map((id) => apiClient.restoreDeletedTicket(id, requestHeaders)));
    setTickets((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
  }

  async function handleBulkPermanentDelete() {
    await Promise.all([...selectedIds].map((id) => apiClient.permanentlyDeleteTicket(id, requestHeaders)));
    setTickets((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
  }

  async function handleSingleRestore(id: string) {
    await apiClient.restoreDeletedTicket(id, requestHeaders);
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function handleSinglePermanentDelete(id: string) {
    await apiClient.permanentlyDeleteTicket(id, requestHeaders);
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setSingleDeleteId(null);
  }

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));
  const someSelected = tickets.some((t) => selectedIds.has(t.id));
  const hasSelection = selectedIds.size > 0;

  return (
    <section className="screen-stack">
      <ScreenHeader
        title="Recycle Bin"
        body="Deleted tickets are kept for 90 days before being permanently removed."
      />
      <div className="panel">
        {loading ? <p>Loading...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          tickets.length === 0 ? (
            <p className="subtle-copy">Recycle bin is empty. Deleted tickets appear here for 90 days before being permanently removed.</p>
          ) : (
            <>
              <div className="panel-header">
                <h3>{tickets.length} deleted {tickets.length === 1 ? "ticket" : "tickets"}</h3>
                {hasSelection && (
                  <div className="panel-header-actions">
                    <button type="button" className="panel-save-btn" onClick={() => setBulkRestoreConfirmOpen(true)}>
                      Restore selected ({selectedIds.size})
                    </button>
                    {isAdmin && (
                      <button type="button" className="panel-delete-btn" onClick={() => setBulkDeleteConfirmOpen(true)}>
                        Delete permanently ({selectedIds.size})
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="table-shell">
                <table className="ticket-table">
                  <thead>
                    <tr>
                      <th className="ticket-select-col">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={(e) => handleSelectAllChange(e.target.checked)}
                          aria-label="Select all"
                        />
                      </th>
                      <th>Title</th>
                      <th className="recycle-col-status">Status</th>
                      <th className="col-requester">Requester</th>
                      <th className="recycle-col-deleted">Deleted</th>
                      <th className="recycle-col-expires">Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => {
                      const days = daysLeft(ticket.deletedAt);
                      const isSelected = selectedIds.has(ticket.id);
                      return (
                        <tr key={ticket.id} className={isSelected ? "ticket-row-selected" : undefined}>
                          <td className="ticket-select-col">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectChange(ticket.id, e.target.checked)}
                              aria-label={`Select ticket #${formatTicketNumber(ticket.ticketNumber)}`}
                            />
                          </td>
                          <td className="ticket-title-cell">
                            <Link className="ticket-link" to={`/tickets/${ticket.id}`}>
                              <span className="ticket-link-title">{ticket.title}</span>
                              <span className="ticket-link-meta">#{formatTicketNumber(ticket.ticketNumber)}</span>
                              <span className="recycle-mobile-meta">
                                {ticket.status}
                                {" · "}
                                {ticket.deletedAt ? formatShortDate(ticket.deletedAt) : "—"}
                                {" · "}
                                <span className={days <= 3 ? "expires-critical" : days <= 14 ? "expires-warning" : undefined}>
                                  {days}d left
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="recycle-col-status"><StatusBadge status={ticket.status} /></td>
                          <td className="ticket-person col-requester">
                            <div>{ticket.requesterName}</div>
                            <small>{ticket.requesterEmail}</small>
                          </td>
                          <td className="recycle-col-deleted">{ticket.deletedAt ? formatShortDate(ticket.deletedAt) : "—"}</td>
                          <td className="recycle-col-expires">
                            <span className={days <= 3 ? "expires-critical" : days <= 14 ? "expires-warning" : undefined}>
                              {days} day{days !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td>
                            <div className="recycle-actions">
                              <button
                                type="button"
                                className="recycle-restore-btn"
                                onClick={() => void handleSingleRestore(ticket.id)}
                              >
                                Restore
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="panel-delete-btn"
                                  onClick={() => setSingleDeleteId(ticket.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : null}
      </div>

      <ConfirmDeleteModal
        count={selectedIds.size}
        open={bulkDeleteConfirmOpen}
        onConfirm={handleBulkPermanentDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        permanent
      />
      <ConfirmRestoreModal
        count={selectedIds.size}
        open={bulkRestoreConfirmOpen}
        onConfirm={handleBulkRestore}
        onCancel={() => setBulkRestoreConfirmOpen(false)}
      />
      {singleDeleteId && (
        <ConfirmDeleteModal
          count={1}
          open
          onConfirm={() => handleSinglePermanentDelete(singleDeleteId)}
          onCancel={() => setSingleDeleteId(null)}
          permanent
        />
      )}
    </section>
  );
}

const STATUS_COLOR_OPTIONS = [
  { key: "slate",  label: "Slate" },
  { key: "blue",   label: "Blue" },
  { key: "green",  label: "Green" },
  { key: "gray",   label: "Gray" },
  { key: "amber",  label: "Amber" },
  { key: "violet", label: "Violet" },
  { key: "red",    label: "Red" },
  { key: "teal",   label: "Teal" }
] as const;

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-picker">
      {STATUS_COLOR_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.key}
          data-color={option.key}
          className={`color-swatch${value === option.key ? " color-swatch-selected" : ""}`}
          onClick={() => onChange(option.key)}
        />
      ))}
    </div>
  );
}

function ConfirmNavModal({
  when,
  onSave,
  onDiscard,
}: {
  when: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
}) {
  const blocker = useBlocker(when);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  if (blocker.state !== "blocked") return null;

  async function handleSave() {
    setSaving(true);
    setSaveError(false);
    try {
      await onSave();
      blocker.proceed!();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    onDiscard();
    blocker.proceed!();
  }

  return (
    <div className="confirm-nav-overlay" onClick={() => blocker.reset!()}>
      <div className="confirm-nav-card" onClick={(e) => e.stopPropagation()}>
        <h2>Unsaved changes</h2>
        <p>
          {saveError
            ? "Something went wrong while saving. Please try again or discard your changes."
            : "You have unsaved changes that will be lost if you leave this page."}
        </p>
        <div className="confirm-nav-actions">
          <button type="button" className="confirm-stay-btn" onClick={() => blocker.reset!()}>
            Stay
          </button>
          <button type="button" className="confirm-discard-btn" onClick={handleDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="confirm-save-btn"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save & leave"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmActionModal({
  title,
  body,
  confirmLabel,
  confirmClass,
  open,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmClass: string;
  open: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setRunning(true);
    setActionError(false);
    try {
      await onConfirm();
      onCancel();
    } catch {
      setActionError(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="confirm-nav-overlay" onClick={onCancel}>
      <div className="confirm-nav-card" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{actionError ? "Something went wrong. Please try again." : body}</p>
        <div className="confirm-nav-actions">
          <button type="button" className="confirm-stay-btn" onClick={onCancel} disabled={running}>
            Cancel
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={() => void handleConfirm()}
            disabled={running}
          >
            {running ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkPicker({
  value,
  placeholder,
  options,
  onChange,
  renderTrigger,
  renderOption,
  triggerClassName = "",
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string; color?: string }[];
  onChange: (value: string) => void;
  renderTrigger?: (opt: { value: string; label: string; color?: string }) => React.ReactNode;
  renderOption?: (opt: { value: string; label: string; color?: string }) => React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number | "auto"; bottom: number | "auto"; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open]);

  function handleOpen() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 240 && rect.top > spaceBelow) {
      setPopoverPos({ top: "auto", bottom: window.innerHeight - rect.top + 6, left: rect.left });
    } else {
      setPopoverPos({ top: rect.bottom + 6, bottom: "auto", left: rect.left });
    }
    setOpen((o) => !o);
  }

  const selectedOpt = options.find((o) => o.value === value);

  return (
    <div className="bulk-picker">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName || "bulk-picker-trigger"}
        data-color={selectedOpt?.color || undefined}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedOpt
          ? (renderTrigger ? renderTrigger(selectedOpt) : <span className="chip-label">{selectedOpt.label}</span>)
          : <span className="bulk-field-placeholder">{placeholder}</span>
        }
        <span className="picker-chevron">▾</span>
      </button>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="picker-popover"
          role="listbox"
          style={{ position: "fixed", top: popoverPos.top, bottom: popoverPos.bottom, left: popoverPos.left, width: "max-content" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`picker-btn picker-option${opt.value === value ? " picker-option-active" : ""}`}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {renderOption ? renderOption(opt) : <span className="chip-label">{opt.label}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function BulkEditBar({
  selectedCount,
  pendingCount,
  statusOptions,
  categoryOptions,
  staffOptions,
  onBulkChange,
  onDelete,
  saveActions,
}: {
  selectedCount: number;
  pendingCount?: number;
  statusOptions: { name: string; color?: string }[];
  categoryOptions: { name: string }[];
  staffOptions: { email: string; displayName: string }[];
  onBulkChange: (field: keyof TicketPendingChange, value: string) => void;
  onDelete: () => void;
  saveActions?: React.ReactNode;
}) {
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const showFields = selectedCount >= 1;

  useEffect(() => {
    if (selectedCount === 0) {
      setBulkStatus("");
      setBulkCategory("");
      setBulkAssignee("");
    }
  }, [selectedCount]);

  // First-name-only with disambiguation (matches AssigneePickerCell logic)
  const firstNameCount = new Map<string, number>();
  for (const s of staffOptions) {
    const first = s.displayName.trim().split(/\s+/)[0];
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }
  function shortStaffName(displayName: string): string {
    const parts = displayName.trim().split(/\s+/);
    const first = parts[0];
    const isDup = (firstNameCount.get(first) ?? 0) > 1 && parts.length > 1;
    return isDup ? `${first} ${parts[parts.length - 1][0]}.` : first;
  }

  function applyStatus(value: string) {
    if (!value) return;
    onBulkChange("status", value);
    setBulkStatus(value);
  }

  function applyCategory(value: string) {
    if (!value) return;
    onBulkChange("category", value);
    setBulkCategory(value);
  }

  function applyAssignee(value: string) {
    if (value === "") return;
    onBulkChange("assignedToEmail", value === "__unassign__" ? "" : value);
    setBulkAssignee(value);
  }

  return (
    <div className="bulk-edit-bar">
      <div className="bulk-edit-left">
        {selectedCount > 0
          ? <span className="bulk-count"><strong>{selectedCount}</strong> selected</span>
          : <span className="bulk-count"><strong>{pendingCount ?? 0}</strong> {(pendingCount ?? 0) === 1 ? "ticket" : "tickets"} with unsaved changes</span>
        }
        {showFields && (
          <div className="bulk-edit-fields">
            {statusOptions.length > 0 && (
              <BulkPicker
                value={bulkStatus}
                placeholder="Status"
                options={statusOptions.map((s) => ({ value: s.name, label: s.name, color: s.color }))}
                onChange={applyStatus}
                triggerClassName="bulk-picker-ghost"
                renderTrigger={(opt) => <StatusBadge status={opt.value as TicketStatus} color={opt.color} />}
                renderOption={(opt) => <StatusBadge status={opt.value as TicketStatus} color={opt.color} />}
              />
            )}
            {categoryOptions.length > 0 && (
              <BulkPicker
                value={bulkCategory}
                placeholder="Category"
                options={categoryOptions.map((c) => ({ value: c.name, label: c.name }))}
                onChange={applyCategory}
                triggerClassName="bulk-picker-ghost"
              />
            )}
            {staffOptions.length > 0 && (
              <BulkPicker
                value={bulkAssignee}
                placeholder="Assignee"
                options={[
                  { value: "__unassign__", label: "Unassign" },
                  ...staffOptions.map((s) => ({ value: s.email, label: shortStaffName(s.displayName) })),
                ]}
                onChange={applyAssignee}
                triggerClassName="bulk-picker-ghost"
                renderTrigger={(opt) =>
                  opt.value === "__unassign__"
                    ? <span className="chip-label chip-label--empty">Unassign</span>
                    : <span className="chip-label">{opt.label}</span>
                }
                renderOption={(opt) =>
                  opt.value === "__unassign__"
                    ? <span className="chip-label chip-label--empty">Unassign</span>
                    : <span className="chip-label">{opt.label}</span>
                }
              />
            )}
          </div>
        )}
      </div>
      <div className="bulk-edit-right">
        {saveActions}
        {selectedCount > 0 && (
          <button type="button" className="panel-delete-btn" onClick={onDelete}>
            Delete ({selectedCount})
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  count,
  open,
  onConfirm,
  onCancel,
  permanent = false,
}: {
  count: number;
  open: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  permanent?: boolean;
}) {
  return (
    <ConfirmActionModal
      title={`Delete ${count} ticket${count !== 1 ? "s" : ""}?`}
      body={permanent ? "This cannot be undone." : `This will move ${count !== 1 ? "them" : "it"} to the recycle bin.`}
      confirmLabel="Delete"
      confirmClass="confirm-delete-btn"
      open={open}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function ConfirmRestoreModal({
  count,
  open,
  onConfirm,
  onCancel,
}: {
  count: number;
  open: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <ConfirmActionModal
      title={`Restore ${count} ticket${count !== 1 ? "s" : ""}?`}
      body={`This will move ${count !== 1 ? "them" : "it"} back to the active queue.`}
      confirmLabel="Restore"
      confirmClass="confirm-save-btn"
      open={open}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function PaginationBar({
  total,
  pageSize,
  page,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  pageSize: number;
  page: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const showPageSize = total > 10;
  const showPaging = totalPages > 1;
  if (!showPageSize && !showPaging) return null;

  return (
    <div className="pagination-bar">
      {showPaging && (
        <div className="pagination-nav">
          <button
            type="button"
            className="pagination-chevron"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          <select
            className="pagination-select"
            value={page}
            onChange={(e) => onPageChange(Number(e.target.value))}
            aria-label="Page"
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <span className="pagination-of">of {totalPages}</span>
          <button
            type="button"
            className="pagination-chevron"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
      {showPageSize && (
        <select
          className="pagination-select"
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          aria-label="Tickets per page"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function FadeList({ children, className }: { children: React.ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  function check() {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollHeight - el.scrollTop > el.clientHeight + 2);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    check();
    const ro = new ResizeObserver(() => { check(); });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`fade-list-wrap${showFade ? " has-fade" : ""}${className ? ` ${className}` : ""}`}>
      <div ref={scrollRef} className="fade-list-scroll" onScroll={check}>
        {children}
      </div>
    </div>
  );
}

function AdminPanelPage() {
  const { requestHeaders } = useSession();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statuses, setStatuses] = useState<TicketStatusRecord[]>([]);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [addStatusName, setAddStatusName] = useState("");
  const [addStatusColor, setAddStatusColor] = useState("slate");
  const [addStatusError, setAddStatusError] = useState<string | null>(null);
  const [isSavingAddStatus, setIsSavingAddStatus] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editStatusName, setEditStatusName] = useState("");
  const [editStatusColor, setEditStatusColor] = useState("slate");
  const [editStatusError, setEditStatusError] = useState<string | null>(null);
  const [isSavingEditStatus, setIsSavingEditStatus] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);
  const [statusMigrateTo, setStatusMigrateTo] = useState("");
  const [isDeletingStatus, setIsDeletingStatus] = useState(false);
  const [deleteStatusError, setDeleteStatusError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState("");
  const [addCategoryError, setAddCategoryError] = useState<string | null>(null);
  const [isSavingAddCategory, setIsSavingAddCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryError, setEditCategoryError] = useState<string | null>(null);
  const [isSavingEditCategory, setIsSavingEditCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [categoryMigrateTo, setCategoryMigrateTo] = useState("");
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [deleteCategoryError, setDeleteCategoryError] = useState<string | null>(null);

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.getStatuses(requestHeaders),
      apiClient.getCategories(requestHeaders),
      apiClient.getAdminTickets({}, requestHeaders),
      apiClient.getStaff(requestHeaders, false)
    ])
      .then(([statusRecords, categoryRecords, adminTickets, staffRecords]) => {
        if (active) {
          setStatuses(statusRecords);
          setCategories(categoryRecords);
          setTickets(adminTickets);
          setStaffMembers(staffRecords);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load data.");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [requestHeaders]);

  function countForStatus(name: string) {
    return tickets.filter((t) => t.status === name).length;
  }

  async function handleAddStatus(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingAddStatus(true);
    setAddStatusError(null);
    try {
      const created = await apiClient.createStatus(addStatusName.trim(), addStatusColor, requestHeaders);
      setStatuses((prev) => [...prev, created]);
      setAddStatusName("");
      setIsAddingStatus(false);
    } catch (reason) {
      setAddStatusError(reason instanceof Error ? reason.message : "Failed to add status.");
    } finally {
      setIsSavingAddStatus(false);
    }
  }

  async function handleSaveEditStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStatusId) return;
    setIsSavingEditStatus(true);
    setEditStatusError(null);
    try {
      const updated = await apiClient.updateStatus(editingStatusId, editStatusName.trim(), editStatusColor, requestHeaders);
      const old = statuses.find((s) => s.id === editingStatusId);
      setStatuses((prev) => prev.map((s) => (s.id === editingStatusId ? updated : s)));
      if (old && old.name !== updated.name) {
        setTickets((prev) => prev.map((t) => (t.status === old.name ? { ...t, status: updated.name } : t)));
      }
      setEditingStatusId(null);
    } catch (reason) {
      setEditStatusError(reason instanceof Error ? reason.message : "Failed to update status.");
    } finally {
      setIsSavingEditStatus(false);
    }
  }

  async function handleDeleteStatus() {
    if (!deletingStatusId) return;
    const del = statuses.find((s) => s.id === deletingStatusId);
    if (!del) return;
    const count = countForStatus(del.name);
    setIsDeletingStatus(true);
    setDeleteStatusError(null);
    try {
      await apiClient.deleteStatus(deletingStatusId, count > 0 ? statusMigrateTo : null, requestHeaders);
      setStatuses((prev) => prev.filter((s) => s.id !== deletingStatusId));
      if (count > 0 && statusMigrateTo) {
        setTickets((prev) => prev.map((t) => (t.status === del.name ? { ...t, status: statusMigrateTo } : t)));
      }
      setDeletingStatusId(null);
    } catch (reason) {
      setDeleteStatusError(reason instanceof Error ? reason.message : "Failed to delete status.");
    } finally {
      setIsDeletingStatus(false);
    }
  }

  function countForCategory(name: string) {
    return tickets.filter((t) => t.category === name).length;
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingAddCategory(true);
    setAddCategoryError(null);
    try {
      const created = await apiClient.createCategory(addCategoryName.trim(), requestHeaders);
      setCategories((prev) => [...prev, created]);
      setAddCategoryName("");
      setIsAddingCategory(false);
    } catch (reason) {
      setAddCategoryError(reason instanceof Error ? reason.message : "Failed to add category.");
    } finally {
      setIsSavingAddCategory(false);
    }
  }

  async function handleSaveEditCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategoryId) return;
    setIsSavingEditCategory(true);
    setEditCategoryError(null);
    try {
      const updated = await apiClient.updateCategory(editingCategoryId, editCategoryName.trim(), requestHeaders);
      const old = categories.find((c) => c.id === editingCategoryId);
      setCategories((prev) => prev.map((c) => (c.id === editingCategoryId ? updated : c)));
      if (old && old.name !== updated.name) {
        setTickets((prev) => prev.map((t) => (t.category === old.name ? { ...t, category: updated.name } : t)));
      }
      setEditingCategoryId(null);
    } catch (reason) {
      setEditCategoryError(reason instanceof Error ? reason.message : "Failed to update category.");
    } finally {
      setIsSavingEditCategory(false);
    }
  }

  async function handleDeleteCategory() {
    if (!deletingCategoryId) return;
    const del = categories.find((c) => c.id === deletingCategoryId);
    if (!del) return;
    const count = countForCategory(del.name);
    setIsDeletingCategory(true);
    setDeleteCategoryError(null);
    try {
      await apiClient.deleteCategory(deletingCategoryId, count > 0 ? categoryMigrateTo : null, requestHeaders);
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategoryId));
      if (count > 0 && categoryMigrateTo) {
        setTickets((prev) => prev.map((t) => (t.category === del.name ? { ...t, category: categoryMigrateTo } : t)));
      }
      setDeletingCategoryId(null);
    } catch (reason) {
      setDeleteCategoryError(reason instanceof Error ? reason.message : "Failed to delete category.");
    } finally {
      setIsDeletingCategory(false);
    }
  }

  return (
    <section className="screen-stack">
      <ScreenHeader
        title="Admin Panel"
        body="Manage ticket statuses and categories."
        action={
          <Link className="ghost-link-button" to="/dashboard">
            Back to dashboard
          </Link>
        }
      />

      {loading ? <div className="panel"><p>Loading...</p></div> : null}
      {error ? <div className="panel"><p className="error-text">{error}</p></div> : null}

      {!loading && !error ? (
        <div className="admin-panel-grid">
          <div className="panel">
            <div className="admin-panel-section-header">
              <h2 className="admin-panel-section-title">Statuses</h2>
              {!isAddingStatus && (
                <button
                  type="button"
                  onClick={() => { setIsAddingStatus(true); setAddStatusName(""); setAddStatusError(null); }}
                >
                  Add status
                </button>
              )}
            </div>

            {isAddingStatus ? (
              <form className="admin-panel-add-form" onSubmit={(e) => void handleAddStatus(e)}>
                <div className="admin-panel-form-row">
                  <input
                    autoFocus
                    value={addStatusName}
                    onChange={(e) => setAddStatusName(e.target.value)}
                    placeholder="Status name"
                    maxLength={50}
                    className="admin-panel-name-input"
                  />
                  <ColorPicker value={addStatusColor} onChange={setAddStatusColor} />
                </div>
                {addStatusError ? <p className="error-text">{addStatusError}</p> : null}
                <div className="button-row">
                  <button type="submit" disabled={isSavingAddStatus || !addStatusName.trim()}>
                    {isSavingAddStatus ? "Adding..." : "Add"}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setIsAddingStatus(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            <FadeList>
              <ul className="status-list">
              {statuses.map((s) => {
                const count = countForStatus(s.name);
                const isEditing = editingStatusId === s.id;
                const isDeleteExpanded = deletingStatusId === s.id;
                const others = statuses.filter((o) => o.id !== s.id);
                return (
                  <li key={s.id} className="status-list-row">
                    <div className="status-list-main">
                      {isEditing ? (
                        <form className="admin-panel-edit-form" onSubmit={(e) => void handleSaveEditStatus(e)}>
                          <div className="admin-panel-form-row">
                            <input
                              autoFocus
                              value={editStatusName}
                              onChange={(e) => setEditStatusName(e.target.value)}
                              maxLength={50}
                              className="admin-panel-name-input"
                            />
                            <ColorPicker value={editStatusColor} onChange={setEditStatusColor} />
                            <button type="submit" disabled={isSavingEditStatus || !editStatusName.trim()}>
                              {isSavingEditStatus ? "Saving…" : "Save"}
                            </button>
                            <button type="button" className="ghost-button" onClick={() => setEditingStatusId(null)}>
                              Cancel
                            </button>
                          </div>
                          {editStatusError ? <p className="error-text">{editStatusError}</p> : null}
                        </form>
                      ) : (
                        <>
                          <StatusBadge status={s.name as TicketStatus} color={s.color} />
                          <span className="status-list-count">
                            {count} {count === 1 ? "ticket" : "tickets"}
                          </span>
                          <div className="status-list-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                setEditingStatusId(s.id);
                                setEditStatusName(s.name);
                                setEditStatusColor(s.color);
                                setEditStatusError(null);
                                setDeletingStatusId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost-button status-delete-btn"
                              onClick={() => {
                                setDeletingStatusId(s.id);
                                setDeleteStatusError(null);
                                setStatusMigrateTo(others[0]?.name ?? "");
                                setEditingStatusId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {isDeleteExpanded ? (
                      <div className="status-delete-confirm">
                        {count > 0 ? (
                          <label className="field">
                            <span className="field-label">
                              Move {count} {count === 1 ? "ticket" : "tickets"} to
                            </span>
                            <select value={statusMigrateTo} onChange={(e) => setStatusMigrateTo(e.target.value)}>
                              {others.map((o) => (
                                <option key={o.id} value={o.name}>{o.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <p className="subtle-copy">No tickets are currently in this status.</p>
                        )}
                        {deleteStatusError ? <p className="error-text">{deleteStatusError}</p> : null}
                        <div className="button-row">
                          <button
                            type="button"
                            className="danger-button"
                            disabled={isDeletingStatus || (count > 0 && !statusMigrateTo)}
                            onClick={() => void handleDeleteStatus()}
                          >
                            {isDeletingStatus ? "Deleting..." : "Delete status"}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setDeletingStatusId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              </ul>
            </FadeList>
          </div>

          <div className="panel">
            <div className="admin-panel-section-header">
              <h2 className="admin-panel-section-title">Categories</h2>
              {!isAddingCategory && (
                <button
                  type="button"
                  onClick={() => { setIsAddingCategory(true); setAddCategoryName(""); setAddCategoryError(null); }}
                >
                  Add category
                </button>
              )}
            </div>

            {isAddingCategory ? (
              <form className="admin-panel-add-form" onSubmit={(e) => void handleAddCategory(e)}>
                <div className="admin-panel-form-row">
                  <input
                    autoFocus
                    value={addCategoryName}
                    onChange={(e) => setAddCategoryName(e.target.value)}
                    placeholder="Category name"
                    maxLength={50}
                    className="admin-panel-name-input"
                  />
                </div>
                {addCategoryError ? <p className="error-text">{addCategoryError}</p> : null}
                <div className="button-row">
                  <button type="submit" disabled={isSavingAddCategory || !addCategoryName.trim()}>
                    {isSavingAddCategory ? "Adding..." : "Add"}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setIsAddingCategory(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            <FadeList>
              <ul className="status-list">
              {categories.map((c) => {
                const count = countForCategory(c.name);
                const isEditing = editingCategoryId === c.id;
                const isDeleteExpanded = deletingCategoryId === c.id;
                const others = categories.filter((o) => o.id !== c.id);
                return (
                  <li key={c.id} className="status-list-row">
                    <div className="status-list-main">
                      {isEditing ? (
                        <form className="admin-panel-edit-form" onSubmit={(e) => void handleSaveEditCategory(e)}>
                          <div className="admin-panel-form-row">
                            <input
                              autoFocus
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                              maxLength={50}
                              className="admin-panel-name-input"
                            />
                            <button type="submit" disabled={isSavingEditCategory || !editCategoryName.trim()}>
                              {isSavingEditCategory ? "Saving…" : "Save"}
                            </button>
                            <button type="button" className="ghost-button" onClick={() => setEditingCategoryId(null)}>
                              Cancel
                            </button>
                          </div>
                          {editCategoryError ? <p className="error-text">{editCategoryError}</p> : null}
                        </form>
                      ) : (
                        <>
                          <span className="category-list-name">{c.name}</span>
                          <span className="status-list-count">
                            {count} {count === 1 ? "ticket" : "tickets"}
                          </span>
                          <div className="status-list-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                setEditingCategoryId(c.id);
                                setEditCategoryName(c.name);
                                setEditCategoryError(null);
                                setDeletingCategoryId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost-button status-delete-btn"
                              onClick={() => {
                                setDeletingCategoryId(c.id);
                                setDeleteCategoryError(null);
                                setCategoryMigrateTo(others[0]?.name ?? "");
                                setEditingCategoryId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {isDeleteExpanded ? (
                      <div className="status-delete-confirm">
                        {count > 0 ? (
                          <label className="field">
                            <span className="field-label">
                              Move {count} {count === 1 ? "ticket" : "tickets"} to
                            </span>
                            <select value={categoryMigrateTo} onChange={(e) => setCategoryMigrateTo(e.target.value)}>
                              {others.map((o) => (
                                <option key={o.id} value={o.name}>{o.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <p className="subtle-copy">No tickets are currently in this category.</p>
                        )}
                        {deleteCategoryError ? <p className="error-text">{deleteCategoryError}</p> : null}
                        <div className="button-row">
                          <button
                            type="button"
                            className="danger-button"
                            disabled={isDeletingCategory || (count > 0 && !categoryMigrateTo)}
                            onClick={() => void handleDeleteCategory()}
                          >
                            {isDeletingCategory ? "Deleting..." : "Delete category"}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setDeletingCategoryId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              </ul>
            </FadeList>
          </div>

        </div>
      ) : null}
    </section>
  );
}

function AppRoutes() {
  const {
    user,
    authMode,
    requestHeaders,
    canSwitchRole,
    isPreviewingRole,
    setMockRole,
    signOut,
    isReady,
    isAuthenticated,
    isHydratingUser,
    isAccessDenied
  } =
    useSession();

  if (authMode === "entra" && (!isReady || isHydratingUser)) {
    return (
      <section className="auth-screen-shell">
        <div className="auth-screen-card panel">
          <p className="section-eyebrow">Microsoft Entra ID</p>
          <h2>Restoring workspace</h2>
          <p>Checking your signed-in identity, role, and API access.</p>
        </div>
      </section>
    );
  }

  if (authMode === "entra" && isAccessDenied) {
    return (
      <section className="auth-screen-shell">
        <div className="auth-screen-card panel">
          <p className="section-eyebrow">Access denied</p>
          <h2>You don't have access to this application.</h2>
          <p>Contact your administrator to request access.</p>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </section>
    );
  }

  if (authMode === "entra" && !isAuthenticated) {
    return <EntraSignInState />;
  }

  const bearerToken = requestHeaders["Authorization"]?.replace("Bearer ", "") ?? "";
  const apiPortalHref = useMockApi
    ? "/swagger.html"
    : `/api/docs${bearerToken ? `?token=${bearerToken}` : ""}`;

  const navItems =
    user.role === "end_user"
      ? [
          {
            to: "/submit",
            label: "Submit Ticket",
            detail: "Open a new request"
          },
          {
            to: "/tickets",
            label: "My Tickets",
            detail: "Track progress"
          }
        ]
      : user.role === "admin"
        ? [
            {
              to: "/dashboard",
              label: "Dashboard",
              detail: "Command center"
            },
            {
              to: "/queue",
              label: "Queue",
              detail: "Your assigned tickets"
            },
            {
              to: "/all-tickets",
              label: "All Tickets",
              detail: "Manage the queue"
            },
            {
              to: "/submit",
              label: "New Ticket",
              detail: "File on behalf of a user"
            },
            {
              to: "/tickets",
              label: "My Tickets",
              detail: "Your own requests"
            },
            {
              to: "/admin/panel",
              label: "Admin Panel",
              detail: "Statuses and categories",
              divided: true
            },
            {
              to: "/recycle-bin",
              label: "Recycle Bin",
              detail: "Soft-deleted tickets"
            },
            {
              to: apiPortalHref,
              label: "API Portal",
              detail: "Interactive API docs",
              divided: true,
              external: true
            }
          ]
        : [
            {
              to: "/dashboard",
              label: "Dashboard",
              detail: "Shared operations view"
            },
            {
              to: "/queue",
              label: "Queue",
              detail: "Your assigned tickets"
            },
            {
              to: "/all-tickets",
              label: "All Tickets",
              detail: "Browse all tickets"
            },
            {
              to: "/submit",
              label: "New Ticket",
              detail: "Open a request"
            },
            {
              to: "/tickets",
              label: "My Tickets",
              detail: "Your own requests"
            },
            {
              to: "/recycle-bin",
              label: "Recycle Bin",
              detail: "Soft-deleted tickets",
              divided: true
            }
          ];

  return (
    <AppShell
      navItems={navItems}
      userName={user.name}
      userRole={user.role}
      authMode={authMode}
      canSwitchRole={canSwitchRole}
      isPreviewingRole={isPreviewingRole}
      onRoleChange={setMockRole}
      onSignOut={() => void signOut()}
    >
      <Routes>
        {/* Teams auth popup routes — must be reachable before sign-in */}
        <Route path="/auth-start" element={<TeamsAuthStart />} />
        <Route path="/auth-end" element={<TeamsAuthEnd />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/submit" element={<SubmitTicketPage />} />
        <Route path="/tickets" element={<MyTicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route
          path="/dashboard"
          element={
            <RoleGate allowedRoles={["tech", "admin"]}>
              <DashboardPage />
            </RoleGate>
          }
        />
        <Route
          path="/queue"
          element={
            <RoleGate allowedRoles={["tech", "admin"]}>
              <QueuePage key="queue" personalQueue />
            </RoleGate>
          }
        />
        <Route
          path="/all-tickets"
          element={
            <RoleGate allowedRoles={["tech", "admin"]}>
              <QueuePage key="all-tickets" />
            </RoleGate>
          }
        />
        <Route
          path="/admin/panel"
          element={
            <RoleGate allowedRoles={["admin"]}>
              <AdminPanelPage />
            </RoleGate>
          }
        />
        <Route
          path="/recycle-bin"
          element={
            <RoleGate allowedRoles={["tech", "admin"]}>
              <RecycleBinPage />
            </RoleGate>
          }
        />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
