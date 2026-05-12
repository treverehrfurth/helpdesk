import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MoreHorizontal,
  Quote
} from "lucide-react";

import { MarkdownBody } from "./MarkdownBody";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** Hide the formatting toolbar (e.g. for compact composers). */
  hideToolbar?: boolean;
}

type Mode = "write" | "preview";

interface SelectionTransform {
  newValue: string;
  newStart: number;
  newEnd: number;
}

export function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
  required,
  className,
  hideToolbar = false
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>("write");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const wrapperClass = className ? `markdown-editor ${className}` : "markdown-editor";

  function toggleOverflow() {
    if (overflowOpen) {
      setOverflowOpen(false);
      return;
    }
    const button = overflowButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right
      });
    }
    setOverflowOpen(true);
  }

  useEffect(() => {
    if (!overflowOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOverflowOpen(false);
    }
    function close() {
      setOverflowOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [overflowOpen]);

  function applyTransform(transform: (v: string, s: number, e: number) => SelectionTransform) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value: current } = ta;
    const result = transform(current, selectionStart, selectionEnd);
    onChange(result.newValue);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.newStart, result.newEnd);
    });
  }

  function wrapSelection(prefix: string, suffix: string = prefix) {
    applyTransform((v, s, e) => {
      const inner = v.slice(s, e);
      const newValue = v.slice(0, s) + prefix + inner + suffix + v.slice(e);
      const start = s + prefix.length;
      const end = start + inner.length;
      return { newValue, newStart: start, newEnd: end };
    });
  }

  function applyLinePrefix(prefix: string) {
    applyTransform((v, s, e) => {
      const lineStart = v.lastIndexOf("\n", Math.max(0, s - 1)) + 1;
      const lineEndRaw = v.indexOf("\n", e);
      const lineEnd = lineEndRaw === -1 ? v.length : lineEndRaw;
      const block = v.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const allPrefixed = lines.length > 0 && lines.every((line) => line.startsWith(prefix));
      const updated = allPrefixed
        ? lines.map((line) => line.slice(prefix.length))
        : lines.map((line) => prefix + line);
      const newBlock = updated.join("\n");
      const newValue = v.slice(0, lineStart) + newBlock + v.slice(lineEnd);
      const delta = newBlock.length - block.length;
      const startDelta = allPrefixed ? -prefix.length : prefix.length;
      return {
        newValue,
        newStart: Math.max(lineStart, s + startDelta),
        newEnd: e + delta
      };
    });
  }

  function insertLink() {
    applyTransform((v, s, e) => {
      const selected = v.slice(s, e);
      const looksLikeUrl = /^https?:\/\//i.test(selected.trim());
      if (looksLikeUrl) {
        const inner = `[](${selected.trim()})`;
        const newValue = v.slice(0, s) + inner + v.slice(e);
        const cursor = s + 1;
        return { newValue, newStart: cursor, newEnd: cursor };
      }
      if (selected) {
        const inner = `[${selected}](url)`;
        const newValue = v.slice(0, s) + inner + v.slice(e);
        const urlStart = s + 2 + selected.length;
        return { newValue, newStart: urlStart, newEnd: urlStart + 3 };
      }
      const inner = `[](url)`;
      const newValue = v.slice(0, s) + inner + v.slice(e);
      const cursor = s + 1;
      return { newValue, newStart: cursor, newEnd: cursor };
    });
  }

  return (
    <div className={wrapperClass}>
      <div className="markdown-editor-header">
        <div className="markdown-editor-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            className={`markdown-editor-tab${mode === "write" ? " is-active" : ""}`}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            className={`markdown-editor-tab${mode === "preview" ? " is-active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setMode("preview");
              (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            Preview
          </button>
        </div>

        {mode === "write" && !hideToolbar && (
          <div className="markdown-editor-toolbar" role="toolbar" aria-label="Formatting">
            <ToolbarButton title="Heading" className="is-extra" onClick={() => applyLinePrefix("## ")}>
              <Heading2 size={16} strokeWidth={2} />
            </ToolbarButton>
            <ToolbarButton title="Bold" className="is-base" onClick={() => wrapSelection("**")}>
              <Bold size={16} strokeWidth={2} />
            </ToolbarButton>
            <ToolbarButton title="Italic" className="is-base" onClick={() => wrapSelection("*")}>
              <Italic size={16} strokeWidth={2} />
            </ToolbarButton>
            <span className="markdown-editor-toolbar-sep is-base" aria-hidden />
            <ToolbarButton title="Link" className="is-base" onClick={insertLink}>
              <LinkIcon size={16} strokeWidth={2} />
            </ToolbarButton>
            <ToolbarButton title="Inline code" className="is-extra" onClick={() => wrapSelection("`")}>
              <Code size={16} strokeWidth={2} />
            </ToolbarButton>

            {/* Secondary group: visible on wide viewports, collapsed into the
                overflow menu below at narrow widths. */}
            <div className="markdown-editor-toolbar-secondary">
              <span className="markdown-editor-toolbar-sep" aria-hidden />
              <ToolbarButton title="Bulleted list" onClick={() => applyLinePrefix("- ")}>
                <List size={16} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton title="Numbered list" onClick={() => applyLinePrefix("1. ")}>
                <ListOrdered size={16} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton title="Quote" onClick={() => applyLinePrefix("> ")}>
                <Quote size={16} strokeWidth={2} />
              </ToolbarButton>
            </div>

            {/* Overflow menu: hidden on wide viewports, shown when the
                secondary group is collapsed. */}
            <div className="markdown-editor-toolbar-overflow" ref={overflowRef}>
              <button
                ref={overflowButtonRef}
                type="button"
                className="markdown-editor-toolbar-btn"
                title="More"
                aria-label="More formatting"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleOverflow}
              >
                <MoreHorizontal size={16} strokeWidth={2} />
              </button>
              {overflowOpen && (
                <div
                  className="markdown-editor-overflow-menu"
                  role="menu"
                  style={{ position: "fixed", top: menuPosition.top, right: menuPosition.right }}
                >
                  <OverflowMenuItem
                    className="is-base"
                    icon={<Bold size={14} strokeWidth={2} />}
                    label="Bold"
                    onClick={() => {
                      wrapSelection("**");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    className="is-base"
                    icon={<Italic size={14} strokeWidth={2} />}
                    label="Italic"
                    onClick={() => {
                      wrapSelection("*");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    className="is-base"
                    icon={<LinkIcon size={14} strokeWidth={2} />}
                    label="Link"
                    onClick={() => {
                      insertLink();
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    className="is-extra"
                    icon={<Heading2 size={14} strokeWidth={2} />}
                    label="Heading"
                    onClick={() => {
                      applyLinePrefix("## ");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    className="is-extra"
                    icon={<Code size={14} strokeWidth={2} />}
                    label="Inline code"
                    onClick={() => {
                      wrapSelection("`");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    icon={<List size={14} strokeWidth={2} />}
                    label="Bulleted list"
                    onClick={() => {
                      applyLinePrefix("- ");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    icon={<ListOrdered size={14} strokeWidth={2} />}
                    label="Numbered list"
                    onClick={() => {
                      applyLinePrefix("1. ");
                      setOverflowOpen(false);
                    }}
                  />
                  <OverflowMenuItem
                    icon={<Quote size={14} strokeWidth={2} />}
                    label="Quote"
                    onClick={() => {
                      applyLinePrefix("> ");
                      setOverflowOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          className="markdown-editor-textarea"
          rows={rows}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        />
      ) : (
        <div className="markdown-editor-preview" style={{ minHeight: `${rows * 1.5}rem` }}>
          {value.trim() ? (
            <MarkdownBody source={value} />
          ) : (
            <span className="markdown-editor-empty">Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  title: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

function ToolbarButton({ title, onClick, children, className }: ToolbarButtonProps) {
  const classes = className
    ? `markdown-editor-toolbar-btn ${className}`
    : "markdown-editor-toolbar-btn";
  return (
    <button
      type="button"
      className={classes}
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

interface OverflowMenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

function OverflowMenuItem({ icon, label, onClick, className }: OverflowMenuItemProps) {
  const classes = className
    ? `markdown-editor-overflow-menu-item ${className}`
    : "markdown-editor-overflow-menu-item";
  return (
    <button
      type="button"
      role="menuitem"
      className={classes}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span className="markdown-editor-overflow-menu-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

