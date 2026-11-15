import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";

export function formatMoneyInput(raw: string) {
  return /^\d+$/.test(raw)
    ? raw.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : raw;
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onValueChange: (raw: string) => void;
};

export function MoneyInput({
  value,
  onValueChange,
  onKeyDown,
  min,
  max,
  ...props
}: Props) {
  const ref = useRef<HTMLInputElement>(null),
    caret = useRef<number | null>(null);
  const shown = formatMoneyInput(value);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.setCustomValidity(
      value &&
        (!/^\d+$/.test(value) ||
          (min !== undefined && Number(value) < Number(min)) ||
          (max !== undefined && Number(value) > Number(max)))
        ? "Isi nominal rupiah bulat sesuai batas yang diizinkan."
        : "",
    );
    if (caret.current !== null) {
      let count = 0,
        pos = 0;
      while (pos < shown.length && count < caret.current) {
        if (/\d/.test(shown[pos])) count++;
        pos++;
      }
      input.setSelectionRange(pos, pos);
      caret.current = null;
    }
  });
  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={shown}
      onPaste={(e) => {
        const pasted = e.clipboardData.getData("text").trim();
        if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(pasted)) {
          e.preventDefault();
          e.currentTarget.setCustomValidity(
            "Tempel angka bulat, misalnya 1000000 atau 1.000.000.",
          );
          e.currentTarget.reportValidity();
        }
      }}
      onChange={(e) => {
        const text = e.target.value;
        if (!/^[\d.]*$/.test(text)) return;
        caret.current = (
          text.slice(0, e.target.selectionStart ?? text.length).match(/\d/g) ||
          []
        ).length;
        onValueChange(text.replaceAll(".", "").replace(/^0+(?=\d)/, ""));
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget,
          pos = el.selectionStart ?? 0;
        if (el.selectionStart === el.selectionEnd) {
          if (e.key === "Backspace" && el.value[pos - 1] === ".")
            el.setSelectionRange(pos - 1, pos - 1);
          if (e.key === "Delete" && el.value[pos] === ".")
            el.setSelectionRange(pos + 1, pos + 1);
        }
        if (e.key === "." || e.key === ",") e.preventDefault();
        onKeyDown?.(e);
      }}
    />
  );
}
