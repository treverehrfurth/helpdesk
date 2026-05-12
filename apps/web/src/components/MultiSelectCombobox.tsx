import { useEffect, useRef, useState } from "react";

export type ComboboxOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type Props = {
  fieldLabel: string;
  options: ComboboxOption[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
};

export function MultiSelectCombobox({
  fieldLabel,
  options,
  selected,
  onToggle,
  placeholder = "All"
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const keyboardNav = useRef(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, query]);

  useEffect(() => {
    if (keyboardNav.current) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      keyboardNav.current = false;
    }
  }, [highlightedIndex]);

  const selectedOptions = selected
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as ComboboxOption[];

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        keyboardNav.current = true;
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        keyboardNav.current = true;
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (open && filtered[highlightedIndex]) {
          onToggle(filtered[highlightedIndex].value);
          setQuery("");
        } else {
          setOpen(true);
        }
        break;
      case "Backspace":
        if (!query && selectedOptions.length > 0) {
          onToggle(selectedOptions[selectedOptions.length - 1].value);
        }
        break;
      case "Escape":
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
        break;
    }
  }

  return (
    <div className="combobox-wrap" ref={containerRef}>
      <span className="field-label">{fieldLabel}</span>
      <div
        className={`combobox-inline-trigger${open ? " is-open" : ""}${selected.length > 0 ? " has-value" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedOptions.map((o) => (
          <span key={o.value} className="combobox-chip">
            {o.label}
            <button
              type="button"
              className="combobox-chip-remove"
              onMouseDown={(e) => {
                e.preventDefault();
                onToggle(o.value);
              }}
              aria-label={`Remove ${o.label}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="combobox-inline-input"
          type="text"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {open ? (
        <div className="combobox-dropdown">
          <div className="combobox-options">
            {filtered.length === 0 ? (
              <p className="combobox-empty">No matches</p>
            ) : (
              filtered.map((option, index) => {
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={option.value}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    className={`combobox-option${isSelected ? " is-checked" : ""}${index === highlightedIndex ? " is-highlighted" : ""}`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onToggle(option.value);
                      setQuery("");
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="combobox-checkbox"
                      tabIndex={-1}
                    />
                    <div className="combobox-option-text">
                      <span className="combobox-option-label">{option.label}</span>
                      {option.sublabel ? (
                        <span className="combobox-option-sublabel">{option.sublabel}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
