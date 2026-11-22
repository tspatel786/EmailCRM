import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  RemoveFormatting,
  Type,
  Underline,
} from "lucide-react";
import { cn } from "../ui";
import { sanitizeComposerHtml } from "./mailUtils";

export type RichTextHandle = {
  getHtml: () => string;
  setHtml: (html: string) => void;
  insertHtml: (html: string) => void;
  focus: () => void;
};

type Props = {
  initialHtml: string;
  onChange?: (html: string) => void;
  onInsertImage?: (file: File) => Promise<string>;
  placeholder?: string;
  minHeight?: number;
};

const COLORS = ["#111827", "#475569", "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0284c7", "#2563eb", "#7c3aed", "#db2777"];
const SIZES: { label: string; value: string }[] = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

export const RichTextEditor = forwardRef<RichTextHandle, Props>(function RichTextEditor(
  { initialHtml, onChange, onInsertImage, placeholder = "Write your message…", minHeight = 220 },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [menu, setMenu] = useState<"color" | "size" | null>(null);
  const [empty, setEmpty] = useState(!initialHtml);
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState("");

  useEffect(() => {
    if (el.current) el.current.innerHTML = sanitizeComposerHtml(initialHtml);
    // Only on mount: later changes come from the user typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const html = el.current?.innerHTML ?? "";
    setEmpty(!el.current?.textContent?.trim() && !/<img/i.test(html));
    onChange?.(html);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0);
  };
  const restoreSelection = () => {
    el.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const run = (cmd: string, value?: string) => {
    restoreSelection();
    exec("styleWithCSS", "true");
    exec(cmd, value);
    setMenu(null);
    emit();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    exec("insertHTML", sanitizeComposerHtml(html));
    emit();
  };

  useImperativeHandle(ref, () => ({
    getHtml: () => sanitizeComposerHtml(el.current?.innerHTML ?? ""),
    setHtml: (html: string) => {
      if (el.current) el.current.innerHTML = sanitizeComposerHtml(html);
      emit();
    },
    insertHtml,
    focus: () => el.current?.focus(),
  }));

  const addLink = () => {
    saveSelection();
    const url = window.prompt("Link address (https://…)", "https://");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) {
      setImgError("Links must start with https://, http://, mailto: or tel:");
      return;
    }
    const sel = window.getSelection();
    restoreSelection();
    if (sel && sel.toString()) exec("createLink", url.trim());
    else exec("insertHTML", `<a href="${url.trim().replace(/"/g, "%22")}">${url.trim().replace(/</g, "&lt;")}</a>`);
    emit();
  };

  const onPickImage = async (file?: File | null) => {
    if (!file || !onInsertImage) return;
    setImgError("");
    setBusy(true);
    try {
      const url = await onInsertImage(file);
      insertHtml(`<img src="${url}" alt="" style="max-width:100%;height:auto">`);
    } catch (e) {
      setImgError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
    >
      {children}
    </button>
  );
  const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-ink-200 dark:bg-ink-700" aria-hidden />;

  return (
    <div className="rounded-control border border-ink-200 bg-white focus-within:border-primary-500 focus-within:ring-4 focus-within:ring-primary-500/15 dark:border-ink-700 dark:bg-ink-900">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="relative flex flex-wrap items-center gap-0.5 border-b border-ink-100 px-1.5 py-1 dark:border-ink-800"
        onMouseDown={saveSelection}
      >
        <Btn title="Bold (Ctrl+B)" onClick={() => run("bold")}><Bold size={15} /></Btn>
        <Btn title="Italic (Ctrl+I)" onClick={() => run("italic")}><Italic size={15} /></Btn>
        <Btn title="Underline (Ctrl+U)" onClick={() => run("underline")}><Underline size={15} /></Btn>
        <Sep />
        <div className="relative">
          <Btn title="Font size" onClick={() => setMenu(menu === "size" ? null : "size")}><Type size={15} /></Btn>
          {menu === "size" ? (
            <div className="absolute left-0 top-9 z-30 w-32 rounded-lg border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
              {SIZES.map((s) => (
                <button key={s.value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run("fontSize", s.value)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800">
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <Btn title="Text colour" onClick={() => setMenu(menu === "color" ? null : "color")}><Palette size={15} /></Btn>
          {menu === "color" ? (
            <div className="absolute left-0 top-9 z-30 grid w-40 grid-cols-5 gap-1.5 rounded-lg border border-ink-200 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-900">
              {COLORS.map((c) => (
                <button key={c} type="button" title={c} aria-label={`Colour ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => run("foreColor", c)}
                  className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c }} />
              ))}
            </div>
          ) : null}
        </div>
        <Sep />
        <Btn title="Align left" onClick={() => run("justifyLeft")}><AlignLeft size={15} /></Btn>
        <Btn title="Align centre" onClick={() => run("justifyCenter")}><AlignCenter size={15} /></Btn>
        <Btn title="Align right" onClick={() => run("justifyRight")}><AlignRight size={15} /></Btn>
        <Sep />
        <Btn title="Bulleted list" onClick={() => run("insertUnorderedList")}><List size={15} /></Btn>
        <Btn title="Numbered list" onClick={() => run("insertOrderedList")}><ListOrdered size={15} /></Btn>
        <Sep />
        <Btn title="Insert link" onClick={addLink}><Link2 size={15} /></Btn>
        {onInsertImage ? (
          <Btn title="Insert image" onClick={() => { saveSelection(); fileRef.current?.click(); }}><ImageIcon size={15} /></Btn>
        ) : null}
        <Btn title="Clear formatting" onClick={() => run("removeFormat")}><RemoveFormatting size={15} /></Btn>
        {busy ? <span className="ml-1 text-xs text-ink-500">Uploading image…</span> : null}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void onPickImage(e.target.files?.[0])} />
      </div>
      <div className="relative">
        {empty ? (
          <span className="pointer-events-none absolute left-3.5 top-3 select-none text-sm text-ink-400">{placeholder}</span>
        ) : null}
        <div
          ref={el}
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "crm-editor max-h-[50vh] overflow-y-auto px-3.5 py-3 text-sm leading-relaxed text-ink-900 outline-none dark:text-ink-100",
            "[&_a]:text-primary-700 [&_a]:underline [&_blockquote]:my-2 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
          )}
          style={{ minHeight }}
          onInput={emit}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          onPaste={(e) => {
            // Keep the pasted formatting (Word, Gmail, web pages) but strip scripts, event
            // handlers and anything else unsafe before it reaches the editor.
            const html = e.clipboardData.getData("text/html");
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (file && onInsertImage && !html) {
              e.preventDefault();
              void onPickImage(file);
              return;
            }
            if (html) {
              e.preventDefault();
              const clean = sanitizeComposerHtml(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<o:p>|<\/o:p>/g, ""));
              exec("insertHTML", clean);
              emit();
            }
          }}
        />
      </div>
      {imgError ? <p className="border-t border-ink-100 px-3 py-1.5 text-xs text-rose-600 dark:border-ink-800 dark:text-rose-400">{imgError}</p> : null}
    </div>
  );
});
