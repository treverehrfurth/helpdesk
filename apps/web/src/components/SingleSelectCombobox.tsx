import { useEffect, useRef, useState } from "react";

export type SingleComboboxOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type Props = {
  options: SingleComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SingleSelectCombobox({ options, value, onChange, placeholder = "Search..." }: Props) {
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep display in sync if value changes externally
  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [value, open, selected?.label]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [selected?.label]);

  const filtered = query && query !== selected?.label
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Reset highlight to top whenever filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, query]);

  // Scroll highlighted option into view
  useEffect(() => {
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  function handleFocus() {
    setQuery("");
    setOpen(true);
    setHighlightedIndex(0);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOpen(true);
  }

  function handleSelect(option: SingleComboboxOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (filtered[highlightedIndex]) {
          handleSelect(filtered[highlightedIndex]);
        }
        break;
      case "Tab":
        // Select the highlighted option and let Tab move focus naturally
        if (filtered[highlightedIndex]) {
          handleSelect(filtered[highlightedIndex]);
        } else {
          setOpen(false);
          setQuery(selected?.label ?? "");
        }
        break;
      case "Escape":
        setOpen(false);
        setQuery(selected?.label ?? "");
        inputRef.current?.blur();
        break;
    }
  }

  return (
    <div className="single-combobox-wrap" ref={containerRef}>
      <div
        className={`single-combobox-input-wrap${open ? " is-open" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className="single-combobox-input"
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={handleFocus}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {open ? (
        <div className="single-combobox-dropdown">
          <div className="combobox-options">
            {filtered.length === 0 ? (
              <p className="combobox-empty">No matches</p>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={option.value}
                  ref={(el) => { optionRefs.current[index] = el; }}
                  className={`combobox-option${option.value === value ? " is-checked" : ""}${index === highlightedIndex ? " is-highlighted" : ""}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(option);
                  }}
                >
                  <div className="combobox-option-text">
                    <span className="combobox-option-label">{option.label}</span>
                    {option.sublabel ? (
                      <span className="combobox-option-sublabel">{option.sublabel}</span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
