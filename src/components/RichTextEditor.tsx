import { useEffect, useRef } from "react";
import { Bold, Italic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

const SIZE_OPTIONS: { label: string; value: string; px: string }[] = [
  { label: "Lille", value: "sm", px: "14px" },
  { label: "Normal", value: "md", px: "16px" },
  { label: "Stor", value: "lg", px: "20px" },
  { label: "Meget stor", value: "xl", px: "26px" },
];

export function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Initialize / sync external value when it changes from outside
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const applySize = (val: string) => {
    const opt = SIZE_OPTIONS.find((o) => o.value === val);
    if (!opt) return;
    ref.current?.focus();
    // Use CSS font-size via styleWithCSS
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, "7");
    // Replace generated <font size="7"> with span style
    if (ref.current) {
      ref.current.querySelectorAll('font[size="7"]').forEach((el) => {
        const span = document.createElement("span");
        span.style.fontSize = opt.px;
        span.innerHTML = (el as HTMLElement).innerHTML;
        el.replaceWith(span);
      });
      onChange(ref.current.innerHTML);
    }
  };

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => exec("bold")}
          className="h-8 w-8 p-0"
          aria-label="Fed"
          title="Fed (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => exec("italic")}
          className="h-8 w-8 p-0"
          aria-label="Kursiv"
          title="Kursiv (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Select onValueChange={applySize}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Skriftstørrelse" />
          </SelectTrigger>
          <SelectContent>
            {SIZE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                <span style={{ fontSize: o.px }}>{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder}
        className="prose-news block w-full px-3 py-2 text-sm outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        style={{ minHeight }}
      />
    </div>
  );
}
