import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { formatShortDate, formatTicketNumber, type TicketStatus, type TicketSummary } from "@it-helpdesk/shared";
import { EmptyState } from "@it-helpdesk/ui";

import { StatusBadge } from "./StatusBadge";

function StatusPickerCell({
  statusVal,
  statusColor,
  statusOptions,
  ticketId,
  onFieldChange,
}: {
  statusVal: string;
  statusColor: string | undefined;
  statusOptions: { name: string; color?: string }[];
  ticketId: string;
  onFieldChange: (id: string, field: keyof TicketPendingChange, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number | "auto"; bottom: number | "auto"; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
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
      setPopoverPos({ top: "auto", bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width });
    } else {
      setPopoverPos({ top: rect.bottom + 6, bottom: "auto", left: rect.left, width: rect.width });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="status-picker">
      <button
        ref={triggerRef}
        type="button"
        className="picker-btn status-picker-trigger"
        data-color={statusColor || undefined}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <StatusBadge status={statusVal as TicketStatus} color={statusColor} />
        <span className="picker-chevron">▾</span>
      </button>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="picker-popover"
          role="listbox"
          style={{ position: "fixed", top: popoverPos.top, bottom: popoverPos.bottom, left: popoverPos.left, width: "max-content" }}
        >
          {statusOptions.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`picker-btn picker-option${s.name === statusVal ? " picker-option-active" : ""}`}
              role="option"
              aria-selected={s.name === statusVal}
              onClick={() => {
                onFieldChange(ticketId, "status", s.name);
                setOpen(false);
              }}
            >
              <StatusBadge status={s.name as TicketStatus} color={s.color} />
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function CategoryPickerCell({
  categoryVal,
  categoryOptions,
  ticketId,
  onFieldChange,
}: {
  categoryVal: string;
  categoryOptions: { name: string }[];
  ticketId: string;
  onFieldChange: (id: string, field: keyof TicketPendingChange, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number | "auto"; bottom: number | "auto"; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
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

  // Size the trigger to the longest option so all rows stay the same width.
  // ~7.5px per char for Inter 13px + 40px for padding + chevron.
  const triggerMinWidth = categoryOptions.length > 0
    ? `${Math.round(Math.max(...categoryOptions.map((c) => c.name.length)) * 7.5 + 40)}px`
    : undefined;

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

  return (
    <div className="category-picker">
      <button
        ref={triggerRef}
        type="button"
        className="picker-btn category-picker-trigger"
        style={triggerMinWidth ? { minWidth: triggerMinWidth } : undefined}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="chip-label">{categoryVal}</span>
        <span className="picker-chevron">▾</span>
      </button>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className="picker-popover"
          role="listbox"
          style={{ position: "fixed", top: popoverPos.top, bottom: popoverPos.bottom, left: popoverPos.left, width: "max-content" }}
        >
          {categoryOptions.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`picker-btn picker-option${c.name === categoryVal ? " picker-option-active" : ""}`}
              role="option"
              aria-selected={c.name === categoryVal}
              onClick={() => {
                onFieldChange(ticketId, "category", c.name);
                setOpen(false);
              }}
            >
              <span className="chip-label">{c.name}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function AssigneePickerCell({
  assigneeVal,
  staffOptions,
  fallbackName,
  ticketId,
  onFieldChange,
}: {
  assigneeVal: string;
  staffOptions: { email: string; displayName: string }[];
  fallbackName: string | null | undefined;
  ticketId: string;
  onFieldChange: (id: string, field: keyof TicketPendingChange, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number | "auto"; bottom: number | "auto"; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
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

  // First-name-only, with "First L." disambiguation when two share a first name
  const firstNameCount = new Map<string, number>();
  for (const s of staffOptions) {
    const first = s.displayName.trim().split(/\s+/)[0];
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }
  function shortName(displayName: string): string {
    const parts = displayName.trim().split(/\s+/);
    const first = parts[0];
    const isDup = (firstNameCount.get(first) ?? 0) > 1 && parts.length > 1;
    return isDup ? `${first} ${parts[parts.length - 1][0]}.` : first;
  }

  const longestChars = Math.max(
    "Unassigned".length,
    ...staffOptions.map((s) => shortName(s.displayName).length),
  );
  const triggerMinWidth = `${Math.round(longestChars * 7.5 + 40)}px`;

  const triggerLabel = assigneeVal
    ? (staffOptions.find((s) => s.email === assigneeVal) != null
        ? shortName(staffOptions.find((s) => s.email === assigneeVal)!.displayName)
        : fallbackName ?? assigneeVal)
    : null;

  // Fallback entry: current assignee email not yet in the loaded staff list
  const hasFallback = assigneeVal && !staffOptions.some((s) => s.email === assigneeVal);
  const fallbackLabel = fallbackName ?? assigneeVal;

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

  return (
    <div className="assignee-picker-custom">
      <button
        ref={triggerRef}
        type="button"
        className="picker-btn category-picker-trigger"
        style={{ minWidth: triggerMinWidth }}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerLabel
          ? <span className="chip-label">{triggerLabel}</span>
          : <span className="chip-label chip-label--empty">Unassigned</span>
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
          <button
            type="button"
            className={`picker-btn picker-option${!assigneeVal ? " picker-option-active" : ""}`}
            role="option"
            aria-selected={!assigneeVal}
            onClick={() => { onFieldChange(ticketId, "assignedToEmail", ""); setOpen(false); }}
          >
            <span className="chip-label chip-label--empty">Unassigned</span>
          </button>
          {hasFallback && (
            <button
              type="button"
              className="picker-btn picker-option picker-option-active"
              role="option"
              aria-selected={true}
              onClick={() => setOpen(false)}
            >
              <span className="chip-label">{fallbackLabel}</span>
            </button>
          )}
          {staffOptions.map((s) => {
            return (
              <button
                key={s.email}
                type="button"
                className={`picker-btn picker-option${s.email === assigneeVal ? " picker-option-active" : ""}`}
                role="option"
                aria-selected={s.email === assigneeVal}
                onClick={() => { onFieldChange(ticketId, "assignedToEmail", s.email); setOpen(false); }}
              >
                <span className="chip-label">{shortName(s.displayName)}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Build a display-name map for staff: first name only by default.
 * If two people share a first name, both get "First L." to distinguish them.
 */
export function buildStaffDisplayNames(
  staff: { email: string; displayName: string }[],
): Map<string, string> {
  const firstNameCount = new Map<string, number>();
  for (const s of staff) {
    const first = s.displayName.trim().split(/\s+/)[0];
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }
  const map = new Map<string, string>();
  for (const s of staff) {
    const parts = s.displayName.trim().split(/\s+/);
    const first = parts[0];
    const isDup = (firstNameCount.get(first) ?? 0) > 1 && parts.length > 1;
    map.set(s.email, isDup ? `${first} ${parts[parts.length - 1][0]}.` : first);
  }
  return map;
}

export type TicketPendingChange = {
  status?: string;
  category?: string;
  assignedToEmail?: string;
};

type TicketTableProps = {
  tickets: TicketSummary[];
  showRequester?: boolean;
  emptyTitle: string;
  emptyBody: string;
  editable?: boolean;
  statusOptions?: { name: string; color?: string }[];
  categoryOptions?: { name: string }[];
  staffOptions?: { email: string; displayName: string }[];
  pendingChanges?: Record<string, TicketPendingChange>;
  onFieldChange?: (ticketId: string, field: keyof TicketPendingChange, value: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, selected: boolean) => void;
  onSelectAllChange?: (allSelected: boolean) => void;
};

export function TicketTable({
  tickets,
  showRequester = false,
  emptyTitle,
  emptyBody,
  editable = false,
  statusOptions = [],
  categoryOptions = [],
  staffOptions = [],
  pendingChanges = {},
  onFieldChange,
  selectable = false,
  selectedIds = new Set(),
  onSelectChange,
  onSelectAllChange,
}: TicketTableProps) {
  if (tickets.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));
  const someSelected = tickets.some((t) => selectedIds.has(t.id));

  return (
    <div className="table-shell">
      <table className="ticket-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="ticket-select-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => onSelectAllChange?.(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
            ) : null}
            <th className="col-title">Title</th>
            <th className="col-status">Status</th>
            <th className="col-category">Category</th>
            <th className="col-assigned">Assigned</th>
            {showRequester ? <th className="col-requester">Requester</th> : null}
            <th className="col-created">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const pending = pendingChanges[ticket.id];
            const statusVal = pending?.status ?? ticket.status;
            const categoryVal = pending?.category ?? ticket.category;
            const assigneeVal =
              pending?.assignedToEmail !== undefined
                ? pending.assignedToEmail
                : (ticket.assignedToEmail ?? "");

            const statusColor = statusOptions.find((s) => s.name === statusVal)?.color;
            const isSelected = selectedIds.has(ticket.id);

            let rowClass = pending ? "ticket-row-pending" : "";
            if (isSelected) rowClass = (rowClass ? rowClass + " " : "") + "ticket-row-selected";

            return (
              <tr key={ticket.id} className={rowClass || undefined}>
                {selectable ? (
                  <td className="ticket-select-col">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onSelectChange?.(ticket.id, e.target.checked)}
                      aria-label={`Select ticket #${formatTicketNumber(ticket.ticketNumber)}`}
                    />
                  </td>
                ) : null}
                <td className="ticket-title-cell">
                  <Link className="ticket-link" to={`/tickets/${ticket.id}`}>
                    <span className="ticket-link-title">{ticket.title}</span>
                    <span className="ticket-link-meta">
                      #{formatTicketNumber(ticket.ticketNumber)}
                    </span>
                  </Link>
                </td>
                <td className="col-status">
                  {editable && onFieldChange ? (
                    <StatusPickerCell
                      statusVal={statusVal}
                      statusColor={statusColor}
                      statusOptions={statusOptions}
                      ticketId={ticket.id}
                      onFieldChange={onFieldChange}
                    />
                  ) : (
                    <StatusBadge status={ticket.status as TicketStatus} />
                  )}
                </td>
                <td className="col-category">
                  {editable && onFieldChange ? (
                    <CategoryPickerCell
                      categoryVal={categoryVal}
                      categoryOptions={categoryOptions}
                      ticketId={ticket.id}
                      onFieldChange={onFieldChange}
                    />
                  ) : (
                    ticket.category
                  )}
                </td>
                <td className="ticket-person col-assigned">
                  {editable && onFieldChange ? (
                    <AssigneePickerCell
                      assigneeVal={assigneeVal}
                      staffOptions={staffOptions}
                      fallbackName={ticket.assignedToName}
                      ticketId={ticket.id}
                      onFieldChange={onFieldChange}
                    />
                  ) : (
                    <>
                      <div>{ticket.assignedToName ?? "Unassigned"}</div>
                      <small>{ticket.assignedToEmail ?? "Awaiting assignment"}</small>
                    </>
                  )}
                </td>
                {showRequester ? (
                  <td className="ticket-person col-requester">
                    <div>{ticket.requesterName}</div>
                    <small>{ticket.requesterEmail}</small>
                  </td>
                ) : null}
                <td className="col-created">{formatShortDate(ticket.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
