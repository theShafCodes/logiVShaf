"use client";

import { useEffect, useRef, useState } from "react";
import { color, font, radius } from "@/styles/tokens";

interface PlacesInputProps {
  value: string;
  /** Fires on every keystroke — value is free text, not yet a confirmed location. */
  onChange: (val: string) => void;
  /** Fires only when a suggestion is picked — value is a confirmed, correctly-spelled location. */
  onSelect: (val: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export function PlacesInput({ value, onChange, onSelect, placeholder, style }: PlacesInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const onType = (raw: string) => {
    setQuery(raw);
    onChange(raw);
    if (debounce.current) clearTimeout(debounce.current);
    if (raw.length < 2) { setSuggestions([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    setOpen(true);
    debounce.current = setTimeout(() => {
      void fetch(`/api/places?q=${encodeURIComponent(raw)}`)
        .then((r) => r.json() as Promise<{ suggestions: string[] }>)
        .then((data) => {
          setSuggestions(data.suggestions ?? []);
          setOpen(true);
        })
        .catch(() => { setSuggestions([]); })
        .finally(() => setLoading(false));
    }, 300);
  };

  const pick = (s: string) => {
    setQuery(s);
    onSelect(s);
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        style={style}
      />
      {open && (loading || suggestions.length > 0 || query.trim().length >= 2) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.card,
            marginTop: 3,
            overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}
        >
          {loading && suggestions.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: font.sm, color: color.muted }}>Searching…</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: font.sm, color: color.muted }}>No matching places</div>
          )}
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: font.sm,
                color: color.text,
                background: "none",
                border: "none",
                cursor: "pointer",
                borderBottom: `1px solid ${color.border}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
