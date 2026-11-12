import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  Send,
  Clock,
  AlertTriangle,
  Search,
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
  Building,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Button, Input, Modal, Select, Textarea } from "../components/ui";

type Folder = "inbox" | "sent" | "queued" | "failed";

type Message = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  direction: "inbound" | "outbound";
  folder: Folder;
  status: "received" | "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed";
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
  contacts?: { id: string; full_name: string; email: string | null; company_id: string | null } | null;
};

export function MailsPage() {
  const { org } = useSession();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        .select("id, full_name, email")
        .eq("organization_id", orgId!)
        .not("email", "is", null)
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
  });

  // Query messages for current folder
  const messagesQuery = useQuery({
    queryKey: ["messages", orgId, activeFolder],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          `id, organization_id, contact_id, direction, folder, status, from_name, from_email, to_name, to_email, subject, body_text, body_html, provider, provider_message_id, is_read, is_starred, created_at, contacts(id, full_name, email, company_id)`
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

    setComposeSending(true);
    setComposeError("");
    setComposeSuccess("");

    try {
      // 1. Insert into messages table as sent
      const { data: newMsg, error: insertError } = await supabase
        .from("messages")
        .insert({
          organization_id: orgId,
          contact_id: composeContactId || null,
          direction: "outbound",
          folder: "sent",
          status: "sent",
          from_name: org?.organizations?.name || "S.M.PATEL IT HUB",
          from_email: "sales@updates.smpatelithub.in",
          to_email: composeTo.trim(),
          to_name: composeTo.trim(),
          subject: composeSubject.trim() || "(No Subject)",
          body_text: composeBody,
          body_html: `<div style="font-family: sans-serif; line-height: 1.5;">${composeBody.replace(/\n/g, "<br/>")}</div>`,
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
          type: "email",
          title: `Sent Email: ${composeSubject.trim() || "(No Subject)"}`,
          description: composeBody.slice(0, 500),
          occurred_at: new Date().toISOString(),
        });
      }

      setComposeSuccess("Email dispatched successfully!");
      qc.invalidateQueries({ queryKey: ["messages", orgId] });

      setTimeout(() => {
        setComposeOpen(false);
        setReplyOpen(false);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        setComposeSuccess("");
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setComposeError(msg);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-50">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center space-x-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <MailIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Mails & Inbound Inbox</h1>
            <p className="text-xs text-slate-500">Live Webmail, incoming client replies, and sent dispatch</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            type="button"
            variant="secondary"
            className="py-1 px-3 text-xs"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["messages", org?.organization_id] });
              qc.invalidateQueries({ queryKey: ["mails-unread", org?.organization_id] });
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>

          <Button
            type="button"
            className="py-1 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
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
            <PenSquare className="mr-1.5 h-4 w-4" />
            Compose Mail
          </Button>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Folders */}
        <div className="w-56 border-r border-slate-200 bg-white p-3 flex flex-col space-y-1">
          <button
            type="button"
            onClick={() => {
              setActiveFolder("inbox");
              setSelectedId(null);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              activeFolder === "inbox"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Inbox className="h-4 w-4" />
              <span>Inbox</span>
            </div>
            {(unreadCountQuery.data ?? 0) > 0 && (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                {unreadCountQuery.data}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveFolder("sent");
              setSelectedId(null);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              activeFolder === "sent"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Send className="h-4 w-4" />
              <span>Sent</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveFolder("queued");
              setSelectedId(null);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              activeFolder === "queued"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Clock className="h-4 w-4" />
              <span>Queued</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveFolder("failed");
              setSelectedId(null);
            }}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              activeFolder === "failed"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="h-4 w-4" />
              <span>Failed / Bounced</span>
            </div>
          </button>

          <div className="pt-4 mt-auto border-t border-slate-100 text-xs text-slate-400 px-2">
            Connected: <span className="font-semibold text-slate-600">Resend HTTPS</span>
          </div>
        </div>

        {/* Middle Column: Email List */}
        <div className="w-80 md:w-96 border-r border-slate-200 bg-white flex flex-col">
          {/* Search box */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search mail subject, sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {messagesQuery.isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading emails...</div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No emails in {activeFolder}
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = selectedMessage?.id === msg.id;
                return (
                  <div
                    key={msg.id}
                    onClick={() => handleSelect(msg)}
                    className={`cursor-pointer p-3 transition ${
                      isSelected
                        ? "bg-indigo-50/70 border-l-4 border-indigo-600"
                        : msg.is_read
                        ? "hover:bg-slate-50"
                        : "bg-slate-50/60 font-medium hover:bg-slate-100/80"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`truncate max-w-[170px] ${!msg.is_read ? "font-bold text-slate-900" : "text-slate-700"}`}>
                        {activeFolder === "sent" ? `To: ${msg.to_name || msg.to_email}` : msg.from_name || msg.from_email}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(msg.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    <div className={`text-xs truncate ${!msg.is_read ? "font-semibold text-slate-900" : "text-slate-800"}`}>
                      {msg.subject || "(No Subject)"}
                    </div>

                    <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {msg.body_text || "No preview"}
                    </div>

                    <div className="flex items-center space-x-2 mt-2">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                          msg.status === "opened"
                            ? "bg-purple-100 text-purple-700"
                            : msg.status === "delivered" || msg.status === "sent"
                            ? "bg-green-100 text-green-700"
                            : msg.status === "received"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {msg.status}
                      </span>

                      {msg.contacts && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          • {msg.contacts.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Message Reading Pane */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          {selectedMessage ? (
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {/* Header / Actions */}
              <div className="border-b border-slate-200 p-5 bg-white">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedMessage.subject || "(No Subject)"}
                    </h2>
                    <div className="flex items-center space-x-2 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-800">From:</strong> {selectedMessage.from_name} &lt;{selectedMessage.from_email}&gt;
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      <strong className="text-slate-700">To:</strong> {selectedMessage.to_name} &lt;{selectedMessage.to_email}&gt;
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="py-1 px-2 text-xs"
                      onClick={() => toggleStar.mutate({ id: selectedMessage.id, starred: selectedMessage.is_starred })}
                    >
                      <Star className={`h-4 w-4 ${selectedMessage.is_starred ? "fill-amber-400 text-amber-500" : "text-slate-400"}`} />
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="py-1 px-3 text-xs"
                      onClick={handleOpenReply}
                    >
                      <Reply className="mr-1.5 h-3.5 w-3.5" />
                      Reply
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2">
                  <span>
                    Sent: {new Date(selectedMessage.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <div className="flex items-center space-x-3">
                    {selectedMessage.contacts && (
                      <Link
                        to={`/app/contacts/${selectedMessage.contacts.id}`}
                        className="flex items-center text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <User className="mr-1 h-3 w-3" />
                        View Contact ({selectedMessage.contacts.full_name})
                        <ExternalLink className="ml-1 h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Content Body */}
              <div className="flex-1 p-6 overflow-y-auto">
                {selectedMessage.body_html ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
                    {selectedMessage.body_text}
                  </pre>
                )}
              </div>

              {/* Bottom Quick Reply Bar */}
              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start text-xs text-slate-500 bg-white"
                  onClick={handleOpenReply}
                >
                  <Reply className="mr-2 h-3.5 w-3.5" />
                  Click here to reply to {selectedMessage.from_email}...
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <MailOpen className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">Select an email to read</p>
              <p className="text-xs text-slate-400 mt-1">Choose a message from the list on the left</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose & Reply Modal */}
      <Modal
        open={composeOpen || replyOpen}
        title={replyOpen ? `Reply to ${composeTo}` : "Compose New Email"}
        onClose={() => {
          setComposeOpen(false);
          setReplyOpen(false);
        }}
      >
          <form onSubmit={handleSendCompose} className="space-y-4">
            {composeError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                {composeError}
              </div>
            )}
            {composeSuccess && (
              <div className="rounded-lg bg-green-50 p-3 text-xs text-green-700 flex items-center">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {composeSuccess}
              </div>
            )}

            {!replyOpen && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select CRM Contact (Optional)
                </label>
                <Select
                  value={composeContactId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setComposeContactId(cId);
                    const found = contactsQuery.data?.find((c) => c.id === cId);
                    if (found?.email) setComposeTo(found.email);
                  }}
                >
                  <option value="">-- Choose contact --</option>
                  {contactsQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.email})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">
                From: <span className="font-medium text-slate-600">sales@updates.smpatelithub.in</span>
              </span>

              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="py-1 px-3 text-xs"
                  onClick={() => {
                    setComposeOpen(false);
                    setReplyOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={composeSending}
                  className="py-1 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {composeSending ? "Sending..." : "Send Email"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
    </div>
  );
}
