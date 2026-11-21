import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  Send,
  Clock,
  AlertTriangle,
  PenSquare,
  RefreshCw,
  Mail as MailIcon,
  MailOpen,
  Star,
  Trash2,
  Reply,
  CheckCircle2,
  Eye,
  ExternalLink,
  User,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Button, Empty, Input, Modal, PageHeader, SearchInput, Select, TableSkeleton, Textarea } from "../components/ui";

type Folder = "inbox" | "sent" | "queued" | "failed";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type Message = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  direction: "inbound" | "outbound";
  folder: Folder;
  status: "received" | "queued" | "processing" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed";
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  provider: string;
  provider_message_id: string | null;
  is_read: boolean;
  is_starred: boolean;
  created_at: string;
  contacts?: { id: string; full_name: string; primary_email: string | null; company_id: string | null } | null;
};

export function MailsPage() {
  const { org, user } = useSession();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Small screens show either the list or the reader; purely presentational.
  const [readerOpen, setReaderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Form states for compose
  const [composeTo, setComposeTo] = useState("");
  const [composeContactId, setComposeContactId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [composeSuccess, setComposeSuccess] = useState("");

  // Contacts lookup for auto-complete
  const contactsQuery = useQuery({
    queryKey: ["contacts-for-mail", orgId],
    enabled: Boolean(orgId && composeOpen),
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, full_name, primary_email")
        .eq("organization_id", orgId!)
        .not("primary_email", "is", null)
        .order("full_name");
      return data ?? [];
    },
  });

  // Query unread count for inbox
  const unreadCountQuery = useQuery({
    queryKey: ["mails-unread", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("folder", "inbox")
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  // Query messages for current folder
  const messagesQuery = useQuery({
    queryKey: ["messages", orgId, activeFolder],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `id, organization_id, contact_id, direction, folder, status, from_name, from_email, to_name, to_email, subject, body_text, body_html, provider, provider_message_id, is_read, is_starred, created_at, contacts(id, full_name, primary_email, company_id)`
        )
        .eq("organization_id", orgId!)
        .eq("folder", activeFolder)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = (data ?? []).map((row) => {
        const raw = row as unknown as Record<string, unknown> & { contacts?: unknown };
        const contacts = Array.isArray(raw.contacts) ? raw.contacts[0] : raw.contacts;
        return { ...raw, contacts } as unknown as Message;
      });
      return rows;
    },
    // The worker sends queued mail in the background and replies arrive via webhook, so
    // poll: faster while something is still queued, slower otherwise.
    refetchInterval: (query) =>
      (query.state.data as Message[] | undefined)?.some((m) => m.status === "queued" || m.status === "processing") ||
      activeFolder === "queued"
        ? 5_000
        : 30_000,
  });

  const messages = messagesQuery.data ?? [];

  // Filter messages by search query
  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from_email.toLowerCase().includes(q) ||
        m.from_name.toLowerCase().includes(q) ||
        m.to_email.toLowerCase().includes(q) ||
        m.body_text.toLowerCase().includes(q)
    );
  }, [messages, search]);

  // Selected message detail
  const selectedMessage = useMemo(() => {
    if (!filteredMessages.length) return null;
    if (!selectedId) return filteredMessages[0];
    return filteredMessages.find((m) => m.id === selectedId) ?? filteredMessages[0];
  }, [filteredMessages, selectedId]);

  // Mark as read mutation
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", orgId] });
      qc.invalidateQueries({ queryKey: ["mails-unread", orgId] });
    },
  });

  // Star message mutation
  const toggleStar = useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      await supabase.from("messages").update({ is_starred: !starred }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", orgId] });
    },
  });

  const handleSelect = (msg: Message) => {
    setSelectedId(msg.id);
    if (!msg.is_read) {
      markRead.mutate(msg.id);
    }
  };

  // Compose / Send handler (uses demo email / Resend)
  const handleSendCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !composeTo.trim()) return;
    const recipient = composeTo.trim();
    if (!/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(recipient)) {
      setComposeError("Enter a single valid email address in the To field.");
      return;
    }

    setComposeSending(true);
    setComposeError("");
    setComposeSuccess("");

    try {
      // 1. Insert into messages table as queued for worker dispatch
      const { data: newMsg, error: insertError } = await supabase
        .from("messages")
        .insert({
          organization_id: orgId,
          contact_id: composeContactId || null,
          owner_user_id: user!.id,
          direction: "outbound",
          folder: "queued",
          status: "queued",
          from_name: org?.organizations?.name || "S.M.PATEL IT HUB",
          from_email: "sales@updates.smpatelithub.in",
          to_email: recipient,
          to_name: recipient,
          subject: composeSubject.trim() || "(No Subject)",
          body_text: composeBody,
          body_html: `<div style="font-family: sans-serif; line-height: 1.5;">${escapeHtml(composeBody).replace(/\n/g, "<br/>")}</div>`,
          provider: "resend",
          is_read: true,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // 2. Also record in activities timeline if linked to contact
      if (composeContactId) {
        await supabase.from("activities").insert({
          organization_id: orgId,
          contact_id: composeContactId,
          actor_user_id: user!.id,
          activity_type: "email",
          summary: `Sent Email: ${composeSubject.trim() || "(No Subject)"}`,
          outcome: composeBody.slice(0, 500),
          occurred_at: new Date().toISOString(),
        });
      }

      setComposeSuccess("Email queued. It is usually sent within a minute; check the Sent folder.");
      qc.invalidateQueries({ queryKey: ["messages", orgId] });

      setTimeout(() => {
        setComposeOpen(false);
        setReplyOpen(false);
        setComposeTo("");
        setComposeContactId("");
        setComposeSubject("");
        setComposeBody("");
        setComposeSuccess("");
      }, 1000);
    } catch (err: unknown) {
      // Supabase errors are plain objects ({ message, details, hint }), not Error instances.
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setComposeError(msg || "Could not queue the email. Please try again.");
    } finally {
      setComposeSending(false);
    }
  };

  const handleOpenReply = () => {
    if (!selectedMessage) return;
    setComposeTo(selectedMessage.from_email);
    setComposeContactId(selectedMessage.contact_id || "");
    setComposeSubject(
      selectedMessage.subject.startsWith("Re:")
        ? selectedMessage.subject
        : `Re: ${selectedMessage.subject}`
    );
    setComposeBody(`\n\n--- On ${new Date(selectedMessage.created_at).toLocaleString()} wrote ---\n${selectedMessage.body_text}`);
    setReplyOpen(true);
  };

  const folders: { key: Folder; label: string; icon: typeof Inbox; count?: number }[] = [
    { key: "inbox", label: "Inbox", icon: Inbox, count: unreadCountQuery.data ?? 0 },
    { key: "sent", label: "Sent", icon: Send },
    { key: "queued", label: "Queued", icon: Clock },
    { key: "failed", label: "Failed / Bounced", icon: AlertTriangle },
  ];

  const statusTone = (s: Message["status"]) =>
    s === "opened" || s === "clicked"
      ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20"
      : s === "delivered" || s === "sent"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20"
        : s === "received"
          ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20"
          : s === "queued" || s === "processing"
            ? "bg-primary-50 text-primary-800 ring-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20"
            : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20";

  const initialsOf = (name: string) =>
    name
      .replace(/<.*>/, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="flex flex-col">
      {/* Page header */}
      <PageHeader
        title="Mails & Inbound Inbox"
        subtitle="Live Webmail, incoming client replies, and sent dispatch"
        icon={<MailIcon size={20} />}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["messages", org?.organization_id] });
                qc.invalidateQueries({ queryKey: ["mails-unread", org?.organization_id] });
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button
              type="button"
              onClick={() => {
                setComposeTo("");
                setComposeContactId("");
                setComposeSubject("");
                setComposeBody("");
                setComposeError("");
                setComposeSuccess("");
                setComposeOpen(true);
              }}
            >
              <PenSquare size={16} />
              Compose Mail
            </Button>
          </>
        }
      />

      {/* Mail client */}
      <div className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-card border border-ink-200/70 bg-white shadow-pop dark:border-ink-800 dark:bg-ink-900 lg:grid lg:h-[calc(100dvh-var(--topbar-height)-11rem)] lg:grid-cols-[224px_minmax(320px,380px)_minmax(0,1fr)]">
        {/* Folders: horizontal tabs below lg, sidebar column on lg+ */}
        <nav
          aria-label="Mail folders"
          className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-ink-100 bg-ink-50/40 p-2 dark:border-ink-800 dark:bg-ink-800/40 lg:min-h-0 lg:flex-col lg:overflow-visible lg:overflow-y-auto lg:border-b-0 lg:border-r lg:bg-transparent lg:p-3"
        >
          <span className="hidden px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-400 lg:block">
            Folders
          </span>
          {folders.map((f) => {
            const active = activeFolder === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setActiveFolder(f.key);
                  setSelectedId(null);
                  setReaderOpen(false);
                }}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-10 shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors lg:w-full ${
                  active
                    ? "bg-primary-50 text-primary-800 shadow-sm ring-1 ring-inset ring-primary-200"
                    : "text-ink-600 hover:bg-white hover:text-ink-900 hover:shadow-sm dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
                }`}
              >
                {active ? (
                  <span className="absolute inset-y-1.5 left-0 hidden w-[3px] rounded-full bg-primary-500 lg:block" aria-hidden />
                ) : null}
                <span className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${
                      active ? "bg-primary-100 text-primary-700" : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    <f.icon className="h-4 w-4" />
                  </span>
                  {f.label}
                </span>
                {f.count ? (
                  <span className="rounded-full bg-primary-500 px-2 py-0.5 text-2xs font-bold text-white shadow-sm">{f.count}</span>
                ) : null}
              </button>
            );
          })}
          <div className="mt-auto hidden items-center gap-1.5 border-t border-ink-100 px-2 pt-4 text-xs text-ink-400 lg:flex">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            Connected: <span className="font-semibold text-ink-600">Resend HTTPS</span>
          </div>
        </nav>

        {/* Message list (hidden on small screens while reading) */}
        <div
          className={`min-h-0 min-w-0 flex-col overflow-hidden border-ink-100 lg:flex lg:border-r ${
            readerOpen ? "hidden" : "flex flex-1"
          }`}
        >
          <div className="border-b border-ink-100 p-3">
            <SearchInput placeholder="Search mail subject, sender..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
            {messagesQuery.isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={6} />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-6">
                <Empty title={`No emails in ${activeFolder}`} icon={<MailOpen size={20} />} />
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = selectedMessage?.id === msg.id;
                const who = activeFolder === "sent" ? `To: ${msg.to_name || msg.to_email}` : msg.from_name || msg.from_email;
                const unread = !msg.is_read;
                return (
                  <div
                    key={msg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      handleSelect(msg);
                      setReaderOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleSelect(msg);
                        setReaderOpen(true);
                      }
                    }}
                    aria-current={isSelected ? "true" : undefined}
                    className={`group relative flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:bg-ink-50 focus-visible:outline-none dark:focus-visible:bg-ink-800 ${
                      isSelected
                        ? "bg-primary-50/70 dark:bg-primary-500/10"
                        : unread
                          ? "bg-white hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-ink-50/60 dark:bg-ink-900 dark:hover:bg-ink-800/60 dark:hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                          : "bg-ink-50/30 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-ink-50/60 dark:bg-ink-800/20 dark:hover:bg-ink-800/60 dark:hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    }`}
                  >
                    <span
                      className={`absolute inset-y-0 left-0 w-[3px] ${
                        isSelected ? "bg-primary-500" : unread ? "bg-sky-400" : "bg-transparent"
                      }`}
                      aria-hidden
                    />
                    <button
                      type="button"
                      aria-label={msg.is_starred ? "Unstar" : "Star"}
                      title={msg.is_starred ? "Unstar" : "Star"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar.mutate({ id: msg.id, starred: msg.is_starred });
                      }}
                      className="shrink-0 rounded p-0.5 text-ink-300 hover:text-primary-500"
                    >
                      <Star className={`h-4 w-4 ${msg.is_starred ? "fill-primary-400 text-primary-500" : ""}`} />
                    </button>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-bold ring-2 ${
                        msg.is_read ? "bg-ink-100 text-ink-500 ring-white" : "bg-primary-500 text-white ring-primary-100"
                      }`}
                      aria-hidden
                    >
                      {initialsOf(msg.to_name && activeFolder === "sent" ? msg.to_name : msg.from_name || msg.from_email)}
                    </span>
                    <span className={`w-36 shrink-0 truncate text-sm sm:w-44 ${unread ? "font-semibold text-ink-900 dark:text-white" : "text-ink-700 dark:text-ink-300"}`}>
                      {who}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className={unread ? "font-semibold text-ink-900 dark:text-white" : "text-ink-800 dark:text-ink-200"}>{msg.subject || "(No Subject)"}</span>
                      <span className="text-ink-400"> — {msg.body_text || "No preview"}</span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold capitalize ring-1 ring-inset ${statusTone(msg.status)}`}
                    >
                      {msg.status}
                    </span>
                    <span className="w-16 shrink-0 text-right text-2xs font-medium text-ink-400">
                      {new Date(msg.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Reading pane (full width on small screens when a message is open) */}
        <div className={`min-h-0 min-w-0 flex-col overflow-hidden lg:flex ${readerOpen ? "flex flex-1" : "hidden"}`}>
          {selectedMessage ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-ink-100 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => setReaderOpen(false)}
                  className="-ml-1 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-600 hover:bg-ink-100 lg:hidden"
                >
                  <ArrowLeft size={16} /> Back to {activeFolder}
                </button>
                <h2 className="max-w-full whitespace-normal break-words font-display text-xl font-bold leading-snug text-ink-900 dark:text-white [word-break:normal] [writing-mode:horizontal-tb]">
                  {selectedMessage.subject || "(No Subject)"}
                </h2>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white sm:flex"
                      aria-hidden
                    >
                      {initialsOf(selectedMessage.from_name || selectedMessage.from_email)}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="max-w-full whitespace-normal text-sm [word-break:normal] [writing-mode:horizontal-tb]">
                        <span className="font-semibold text-ink-900 dark:text-white">{selectedMessage.from_name}</span>{" "}
                        <span className="break-words text-ink-500 [overflow-wrap:anywhere]">&lt;{selectedMessage.from_email}&gt;</span>
                      </p>
                      <p className="max-w-full whitespace-normal text-xs text-ink-400 [word-break:normal] [writing-mode:horizontal-tb]">
                        to {selectedMessage.to_name} <span className="break-words [overflow-wrap:anywhere]">&lt;{selectedMessage.to_email}&gt;</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                    <span className="text-xs text-ink-400">
                      {new Date(selectedMessage.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <div className="flex items-center gap-1 rounded-lg border border-ink-200/80 bg-ink-50/60 p-1 dark:border-ink-700 dark:bg-ink-800/60">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={selectedMessage.is_starred ? "Unstar" : "Star"}
                        title={selectedMessage.is_starred ? "Unstar" : "Star"}
                        className="px-3"
                        onClick={() => toggleStar.mutate({ id: selectedMessage.id, starred: selectedMessage.is_starred })}
                      >
                        <Star className={`h-4 w-4 ${selectedMessage.is_starred ? "fill-primary-400 text-primary-500" : "text-ink-400"}`} />
                      </Button>
                      <Button type="button" variant="ghost" onClick={handleOpenReply}>
                        <Reply size={16} />
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>

                {selectedMessage.contacts ? (
                  <div className="mt-3 border-t border-ink-100 pt-3 text-xs">
                    <Link
                      to={`/app/contacts/${selectedMessage.contacts.id}`}
                      className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800"
                    >
                      <User className="h-3.5 w-3.5" />
                      View Contact ({selectedMessage.contacts.full_name})
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-ink-50/40 p-3 dark:bg-ink-800/40 sm:p-5">
                <div className="h-full rounded-xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                  {selectedMessage.body_html ? (
                    // Inbound HTML comes from arbitrary external senders: render it in a fully
                    // sandboxed iframe (no scripts, no same-origin access to the CRM session).
                    <iframe
                      title="Message body"
                      sandbox=""
                      referrerPolicy="no-referrer"
                      className="h-full min-h-[400px] w-full rounded border-0 bg-white"
                      srcDoc={selectedMessage.body_html}
                    />
                  ) : (
                    <pre className="max-w-full whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-800 dark:text-ink-200 [overflow-wrap:break-word] [word-break:normal]">{selectedMessage.body_text}</pre>
                  )}
                </div>
              </div>

              <div className="border-t border-ink-100 p-3 sm:p-4">
                <button
                  type="button"
                  onClick={handleOpenReply}
                  className="flex min-h-11 w-full items-center gap-2 rounded-control border border-ink-200 bg-white px-4 text-left text-sm text-ink-500 transition hover:border-ink-300 hover:text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400 dark:hover:border-ink-600 dark:hover:text-ink-200"
                >
                  <Reply className="h-4 w-4 shrink-0" />
                  <span className="truncate">Click here to reply to {selectedMessage.from_email}...</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MailOpen className="mb-3 h-12 w-12 text-ink-300" />
              <p className="text-sm font-medium text-ink-600">Select an email to read</p>
              <p className="mt-1 text-xs text-ink-400">Choose a message from the list</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose & Reply Modal */}
      <Modal
        size="lg"
        open={composeOpen || replyOpen}
        title={replyOpen ? `Reply to ${composeTo}` : "Compose New Email"}
        onClose={() => {
          setComposeOpen(false);
          setReplyOpen(false);
        }}
      >
          <form onSubmit={handleSendCompose} className="space-y-4">
            {composeError && (
              <div role="alert" className="rounded-control border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {composeError}
              </div>
            )}
            {composeSuccess && (
              <div role="status" className="flex items-center rounded-control border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {composeSuccess}
              </div>
            )}

            {!replyOpen && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-700 dark:text-ink-300">
                  Select CRM Contact (Optional)
                </label>
                <Select
                  value={composeContactId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setComposeContactId(cId);
                    const found = contactsQuery.data?.find((c) => c.id === cId);
                    if (found?.primary_email) setComposeTo(found.primary_email);
                  }}
                >
                  <option value="">-- Choose contact --</option>
                  {contactsQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.primary_email})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700 dark:text-ink-300">
                To Email *
              </label>
              <Input
                type="email"
                required
                placeholder="client@example.com"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700 dark:text-ink-300">
                Subject *
              </label>
              <Input
                required
                placeholder="Subject of the email..."
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700 dark:text-ink-300">
                Message *
              </label>
              <Textarea
                required
                rows={7}
                placeholder="Write your email message..."
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-ink-500">
                From: <span className="font-medium text-ink-700 dark:text-ink-200">sales@updates.smpatelithub.in</span>
              </span>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setComposeOpen(false);
                    setReplyOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={composeSending}>
                  <Send size={15} />
                  {composeSending ? "Sending..." : "Send Email"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
    </div>
  );
}
