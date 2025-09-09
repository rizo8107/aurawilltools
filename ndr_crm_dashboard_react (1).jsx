import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Phone, MessageSquare, ExternalLink, Filter, Edit3, CheckCircle2, AlertTriangle, XCircle, Clock, Truck, Info, ClipboardCopy, Columns } from "lucide-react";

/**
 * NDR CRM Dashboard
 * ------------------------------------------------------------
 * ⚠️ SECURITY NOTE
 * The keys below are SERVICE ROLE tokens pasted from your message.
 * Do NOT ship them to any public client. In production, proxy requests
 * through a server route (e.g. /api/ndr) that injects these headers.
 * For quick internal testing, you can keep as-is.
 */
const SUPABASE_URL = "https://app-supabase.9krcxo.easypanel.host/rest/v1";
const SUPABASE_TABLE = "ndr";
const SUPABASE_HEADERS: Record<string, string> = {
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  Authorization:
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  "Content-Type": "application/json",
};

// ---- Types -------------------------------------------------
export type NdrRow = {
  id: number;
  created_at: string;
  order_id: number;
  waybill: string | number;
  courier_account: string | null;
  delivery_status: string | null;
  ndr_desc: string | null;
  remark: string | null;
  location: string | null;
  event_time: string | null;
  rto_awb: string | null;
  called: boolean | null;
  notes: string | null; // JSON { phone, customer_issue, action_taken, bucket_override? }
  status: string | null; // Open | In Progress | Resolved | Escalated
  Partner_EDD: string | null;
};

// ---- Helpers ----------------------------------------------
const IST_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function fmtIST(dateLike?: string | number | Date | null) {
  if (!dateLike) return "—";
  try {
    return new Date(dateLike).toLocaleString("en-IN", IST_OPTIONS);
  } catch {
    return String(dateLike);
  }
}

function courierName(s?: string | null) {
  if (!s) return "—";
  if (s.toLowerCase().includes("bluedart")) return "Bluedart";
  if (s.toLowerCase().includes("delhivery")) return "Delhivery";
  return s;
}

function toBucket(row: NdrRow): string {
  const s = (row.delivery_status || "").toUpperCase();
  const r = (row.remark || "").toUpperCase();
  if (r.includes("DELIVERED")) return "Delivered";
  if (s.includes("CONSIGNEE NOT AVAILABLE")) return "CNA";
  if (s.includes("PREMISES CLOSED")) return "Premises Closed";
  if (s.includes("ADDRESS") || s.includes("NEED DEPARTMENT")) return "Address Issue";
  if (s.includes("PENDING") || (row.ndr_desc || "").toLowerCase().includes("no attempt")) return "Pending";
  if (row.rto_awb) return "RTO";
  return "Other";
}

function parseNotes(
  notes: string | null
): { phone?: string; customer_issue?: string; action_taken?: string; bucket_override?: string } {
  if (!notes) return {};
  try {
    const obj = JSON.parse(notes);
    if (obj && typeof obj === "object") return obj;
  } catch {
    /* ignore */
  }
  return {};
}

function eddStatus(
  eddISO: string | null
): { label: string; tone: "ok" | "warn" | "late" | "na"; diff?: number } {
  if (!eddISO) return { label: "—", tone: "na" };
  const today = new Date();
  const edd = new Date(eddISO);
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const eddStart = new Date(edd.getFullYear(), edd.getMonth(), edd.getDate());
  const diffDays = Math.round((eddStart.getTime() - todayStart.getTime()) / dayMs);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: "late", diff: diffDays };
  if (diffDays === 0) return { label: "Due today", tone: "warn", diff: diffDays };
  return { label: `In ${diffDays}d`, tone: "ok", diff: diffDays };
}

function trackingUrl(row: NdrRow): string | null {
  const awb = String(row.waybill || "").trim();
  const c = courierName(row.courier_account);
  if (!awb) return null;
  if (c === "Bluedart") return `https://www.bluedart.com/tracking?awb=${encodeURIComponent(awb)}`;
  if (c === "Delhivery") return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`;
  return null;
}

function classNames(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ---- API ---------------------------------------------------
async function fetchNdr(): Promise<NdrRow[]> {
  const search = new URLSearchParams();
  search.set("select", "*");
  search.set("order", "event_time.desc");
  const url = `${SUPABASE_URL}/${SUPABASE_TABLE}?${search.toString()}`;
  const res = await fetch(url, { headers: SUPABASE_HEADERS });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} — ${txt}`);
  }
  const data: NdrRow[] = await res.json();
  return data;
}

async function patchNdr(id: number, updates: Partial<NdrRow>) {
  const url = `${SUPABASE_URL}/${SUPABASE_TABLE}?id=eq.${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: SUPABASE_HEADERS,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Update failed: ${res.status} ${res.statusText} — ${txt}`);
  }
}

// ---- UI Bits ----------------------------------------------
// Predefined actions for NDR resolution (used in editor + table inline)
const ACTION_OPTIONS = [
  "Requested reattempt",
  "Address updated",
  "Asked customer to collect from hub",
  "Asked courier to reattempt tomorrow",
  "Raised ticket with courier",
  "Requested RTO",
  "Left voicemail/SMS",
  "Wrong address - requested confirmation",
  "Other",
];

function Pill({ tone, label }: { tone: "ok" | "warn" | "late" | "na"; label: string }) {
  const map: any = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    late: "bg-rose-50 text-rose-700",
    na: "bg-slate-100 text-slate-500",
  };
  return <span className={classNames("px-2.5 py-1 rounded-full text-xs font-medium", map[tone])}>{label}</span>;
}

function StatusBadge({ bucket }: { bucket: string }) {
  const map: Record<string, string> = {
    Delivered: "bg-emerald-50 text-emerald-700",
    CNA: "bg-rose-50 text-rose-700",
    "Premises Closed": "bg-amber-50 text-amber-700",
    "Address Issue": "bg-violet-50 text-violet-700",
    Pending: "bg-blue-50 text-blue-700",
    RTO: "bg-fuchsia-50 text-fuchsia-700",
    Other: "bg-slate-100 text-slate-600",
  };
  return <span className={classNames("px-2.5 py-1 rounded-full text-xs font-medium", map[bucket] || map.Other)}>{bucket}</span>;
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone?: "ok" | "warn" | "late" }) {
  const toneClass =
    tone === "late"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <div className={classNames("flex items-center gap-3 rounded-2xl p-4 ring-1", toneClass)}>
      <div className="p-2 rounded-xl bg-white/70 ring-1 ring-black/5">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50 active:scale-[.98] transition">
      {children}
    </button>
  );
}

function TextInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={classNames("flex items-center gap-2 rounded-xl ring-1 ring-slate-200 bg-white px-3 py-2", className)}>
      <Search className="w-4 h-4 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent outline-none text-sm" />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 items-center rounded-full transition ring-1",
        checked ? "bg-emerald-500 ring-emerald-400" : "bg-slate-200 ring-slate-300"
      )}
      aria-pressed={checked}
    >
      <span className={classNames("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", checked ? "translate-x-5" : "translate-x-1")} />
    </button>
  );
}

function Drawer({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  return (
    <div className={classNames("fixed inset-0 z-50", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div className={classNames("absolute inset-0 bg-black/30 transition", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <div className={classNames("absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-2xl transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">{title}</div>
          <button className="p-2 rounded-lg hover:bg-slate-100" onClick={onClose}>
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-56px)]">{children}</div>
      </div>
    </div>
  );
}

// ---- Main Component ---------------------------------------
export default function NdrDashboard() {
  const [rows, setRows] = useState<NdrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [courier, setCourier] = useState("All");
  const [bucket, setBucket] = useState("All");
  const [view, setView] = useState<"table" | "kanban">("table");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<NdrRow | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editIssue, setEditIssue] = useState("");
  const [editAction, setEditAction] = useState("");
  const [otherAction, setOtherAction] = useState("");
  const [editCalled, setEditCalled] = useState(false);
  const [editStatus, setEditStatus] = useState("Open");

  async function load() {
    try {
      setLoading(true);
      const data = await fetchNdr();
      setRows(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // polling every 5 minutes
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const notes = parseNotes(r.notes);
        const derivedBucket = toBucket(r);
        const finalBucket = (notes.bucket_override as string) || derivedBucket;
        const edd = eddStatus(r.Partner_EDD);
        return {
          ...r,
          __bucket: finalBucket,
          __edd: edd,
          __phone: notes.phone || "",
          __customer_issue: notes.customer_issue || "",
          __action_taken: notes.action_taken || "",
          __bucket_override: notes.bucket_override,
        } as any;
      }),
    [rows]
  );

  const filtered = useMemo(() => {
    const QQ = q.trim().toLowerCase();
    return enriched.filter((r: any) => {
      if (courier !== "All" && courierName(r.courier_account) !== courier) return false;
      if (bucket !== "All" && r.__bucket !== bucket) return false;
      if (!QQ) return true;
      const hay = [r.order_id, r.waybill, r.delivery_status, r.remark, r.location, r.__phone, r.__customer_issue, r.__action_taken].join(" ").toLowerCase();
      return hay.includes(QQ);
    });
  }, [enriched, q, courier, bucket]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const late = (enriched as any[]).filter((r) => r.__edd.tone === "late").length;
    const today = (enriched as any[]).filter((r) => r.__edd.tone === "warn").length;
    const cna = (enriched as any[]).filter((r) => r.__bucket === "CNA").length;
    const addr = (enriched as any[]).filter((r) => r.__bucket === "Address Issue").length;
    return { total, late, today, cna, addr };
  }, [enriched]);

  const couriers = useMemo(() => Array.from(new Set(enriched.map((r: any) => courierName(r.courier_account)))).filter(Boolean), [enriched]);
  const buckets = ["All", "Pending", "CNA", "Premises Closed", "Address Issue", "RTO", "Delivered", "Other"];

  function openEditor(row: NdrRow) {
    setEditing(row);
    const notes = parseNotes(row.notes);
    setEditPhone(notes.phone || "");
    setEditIssue(notes.customer_issue || "");
    const actionVal = notes.action_taken || "";
    if (ACTION_OPTIONS.includes(actionVal)) {
      setEditAction(actionVal);
      setOtherAction("");
    } else if (actionVal) {
      setEditAction("Other");
      setOtherAction(String(actionVal));
    } else {
      setEditAction("");
      setOtherAction("");
    }
    setEditCalled(!!row.called);
    setEditStatus(row.status || "Open");
    setEditorOpen(true);
  }

  async function saveEditor() {
    if (!editing) return;
    const chosenAction = editAction === "Other" ? otherAction?.trim() || "Other" : editAction || "";
    const notes = { phone: editPhone?.trim() || undefined, customer_issue: editIssue?.trim() || undefined, action_taken: chosenAction || undefined };
    const updates: Partial<NdrRow> = {
      called: editCalled,
      status: editStatus,
      notes: JSON.stringify(notes),
    };
    await patchNdr(editing.id, updates);
    setRows((prev) => prev.map((r) => (r.id === editing.id ? ({ ...r, ...updates } as any) : r)));
    setEditorOpen(false);
  }

  async function quickUpdate(id: number, updates: Partial<NdrRow>) {
    await patchNdr(id, updates);
    setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...updates } as any) : r)));
  }

  async function moveToBucket(rowId: number, targetBucket: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const notes = parseNotes(row.notes);
    notes.bucket_override = targetBucket;
    await quickUpdate(rowId, { notes: JSON.stringify(notes) });
  }

  function exportCSV() {
    const head = [
      "Date (IST)",
      "Order ID",
      "AWB",
      "Current Status",
      "Courier",
      "Mobile",
      "Called",
      "Issue (Customer)",
      "Action Taken",
      "EDD",
      "Remarks",
      "Location",
    ];
    const lines = filtered.map((r: any) =>
      [
        fmtIST(r.event_time),
        r.order_id,
        r.waybill,
        r.delivery_status || "",
        courierName(r.courier_account),
        r.__phone,
        r.called ? "Yes" : "No",
        r.__customer_issue,
        r.__action_taken,
        eddStatus(r.Partner_EDD).label,
        r.remark || "",
        r.location || "",
      ]
        .map((x) => `"${String(x ?? "").replaceAll('"', '\\"')}"`)
        .join(",")
    );
    const csv = [head.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ndr_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Tiny sanity tests (dev) --------------------------------
  if (typeof window !== "undefined") {
    try {
      const fake: NdrRow = {
        id: 1,
        created_at: new Date().toISOString(),
        order_id: 123,
        waybill: "WB1",
        courier_account: "Bluedart Prepaid",
        delivery_status: "CONSIGNEE NOT AVAILABLE",
        ndr_desc: "Customer unavailable",
        remark: "CONSIGNEE NOT AVAILABLE",
        location: "Test",
        event_time: new Date().toISOString(),
        rto_awb: null,
        called: null,
        notes: null,
        status: null,
        Partner_EDD: new Date().toISOString(),
      };
      console.assert(toBucket(fake) === "CNA", "toBucket CNA test");
      console.assert(typeof eddStatus(fake.Partner_EDD).label === "string", "eddStatus label test");
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Truck className="w-6 h-6" />
          <h1 className="text-lg font-semibold">NDR CRM Dashboard</h1>
          <div className="ml-auto flex items-center gap-2">
            <IconButton title="Refresh" onClick={load}>
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </IconButton>
            <IconButton title="Export CSV" onClick={exportCSV}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </IconButton>
            <div className="hidden sm:flex items-center gap-2 rounded-xl ring-1 ring-slate-200 px-1 py-1">
              <button onClick={() => setView("table")} className={classNames("px-3 py-1 rounded-lg text-sm", view === "table" ? "bg-slate-100" : "hover:bg-slate-50")}>Table</button>
              <button onClick={() => setView("kanban")} className={classNames("px-3 py-1 rounded-lg text-sm", view === "kanban" ? "bg-slate-100" : "hover:bg-slate-50")}>Kanban</button>
            </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3">
        <TextInput value={q} onChange={setQ} placeholder="Search order id, awb, status, location, phone, issue..." />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select value={courier} onChange={(e) => setCourier(e.target.value)} className="bg-transparent text-sm outline-none">
              <option>All</option>
              {couriers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2">
            <Columns className="w-4 h-4 text-slate-400" />
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="bg-transparent text-sm outline-none">
              {buckets.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total Shipments" value={stats.total} icon={Info} />
        <Stat label="EDD Overdue" value={stats.late} icon={AlertTriangle} tone="late" />
        <Stat label="Due Today" value={stats.today} icon={Clock} tone="warn" />
        <Stat label="CNA | Address Issues" value={`${stats.cna} | ${stats.addr}`} icon={Truck} />
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {error && <div className="p-4 rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200">{error}</div>}
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading NDR data…</div>
        ) : view === "table" ? (
          <TableView rows={filtered as any[]} onEdit={openEditor} onQuickUpdate={quickUpdate} />
        ) : (
          <KanbanView rows={filtered as any[]} onEdit={openEditor} onMove={moveToBucket} />
        )}
      </main>

      {/* Drawer Editor */}
      <Drawer open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? `Update #${editing.order_id} • AWB ${editing.waybill}` : "Update"}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Courier</div>
                <div className="font-medium">{courierName(editing.courier_account)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Event Time</div>
                <div className="font-medium">{fmtIST(editing.event_time)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Phone
                <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Customer phone" />
              </label>
              <div className="text-sm">
                <div>Called?</div>
                <div className="mt-1">
                  <Toggle checked={editCalled} onChange={setEditCalled} />
                </div>
              </div>
            </div>

            <label className="text-sm block">
              Issue from the customer
              <textarea className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[90px]" value={editIssue} onChange={(e) => setEditIssue(e.target.value)} placeholder="e.g., Asked for delivery tomorrow; landmark missing; wants address change…" />
            </label>

            <label className="text-sm block">
              Action taken
              <div className="mt-1 grid grid-cols-1 gap-2">
                <select className="w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={editAction} onChange={(e) => setEditAction(e.target.value)}>
                  <option value="">Select action…</option>
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {editAction === "Other" && (
                  <input className="w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={otherAction} onChange={(e) => setOtherAction(e.target.value)} placeholder="Describe action taken" />
                )}
              </div>
            </label>

            <label className="text-sm block">
              Internal status
              <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option>Open</option>
                <option>In Progress</option>
                <option>Resolved</option>
                <option>Escalated</option>
              </select>
            </label>

            <div className="flex gap-2">
              <button onClick={saveEditor} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                <CheckCircle2 className="w-4 h-4" />
                Save
              </button>
              <button onClick={() => setEditorOpen(false)} className="px-4 py-2 rounded-xl ring-1 ring-slate-200">
                Cancel
              </button>
            </div>

            <div className="pt-4 border-t text-xs text-slate-500">
              Tip: All updates (Phone, Called, Issue, Action, Status) are saved to the same row using a PATCH. Phone/Issue/Action are stored in <code>notes</code> as JSON.
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ---- Table View -------------------------------------------
function TableView({ rows, onEdit, onQuickUpdate }: { rows: (NdrRow & any)[]; onEdit: (r: NdrRow) => void; onQuickUpdate: (id: number, updates: Partial<NdrRow>) => Promise<void> }) {
  return (
    <div className="overflow-auto rounded-2xl ring-1 ring-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left sticky top-0 z-10">
          <tr className="*:px-3 *:py-2 *:whitespace-nowrap">
            <th className="min-w-[160px]">Date (IST)</th>
            <th>Order ID</th>
            <th className="min-w-[140px]">AWB</th>
            <th className="min-w-[220px]">Current status</th>
            <th>Courier</th>
            <th>Mobile</th>
            <th>Called</th>
            <th className="min-w-[220px] hidden md:table-cell">Issue (Customer)</th>
            <th className="min-w-[200px]">Action taken</th>
            <th>EDD</th>
            <th className="min-w-[220px] hidden lg:table-cell">Remarks</th>
            <th className="min-w-[180px]">Quick</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const url = trackingUrl(r);
            const tone = r.__edd?.tone as any;
            const rowTone = tone === "late" ? "bg-rose-50/40" : tone === "warn" ? "bg-amber-50/30" : "";
            return (
              <tr key={r.id} className={`*:px-3 *:py-2 hover:bg-slate-50 ${rowTone}`}>
                <td>
                  <div className="font-medium">{fmtIST(r.event_time)}</div>
                  <div className="text-xs text-slate-500">{r.location || "—"}</div>
                </td>
                <td className="font-medium">{r.order_id}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{r.waybill}</span>
                    <button title="Copy AWB" onClick={() => navigator.clipboard.writeText(String(r.waybill))} className="p-1 rounded hover:bg-slate-100">
                      <ClipboardCopy className="w-4 h-4" />
                    </button>
                    {url && (
                      <a href={url} target="_blank" className="p-1 rounded hover:bg-slate-100" title="Open tracking">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
                <td>
                  <div className="font-medium">{r.delivery_status || "—"}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <StatusBadge bucket={r.__bucket} /> <span>{r.rto_awb ? `RTO: ${r.rto_awb}` : ""}</span>
                  </div>
                </td>
                <td>{courierName(r.courier_account)}</td>
                <td>{r.__phone || "—"}</td>
                <td>
                  <button
                    onClick={async () => {
                      await onQuickUpdate(r.id, { called: !r.called });
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ring-1 ${r.called ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}
                    title={r.called ? "Called: Yes" : "Called: No"}
                  >
                    {r.called ? "Yes" : "No"}
                  </button>
                </td>
                <td className="max-w-[320px] hidden md:table-cell">
                  <div className="truncate" title={r.__customer_issue}>
                    {r.__customer_issue || "—"}
                  </div>
                </td>
                <td className="max-w-[280px]">
                  <select
                    className="w-full truncate ring-1 ring-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                    value={r.__action_taken || ""}
                    onChange={async (e) => {
                      const notes = parseNotes(r.notes);
                      notes.action_taken = e.target.value;
                      await onQuickUpdate(r.id, { notes: JSON.stringify(notes) });
                    }}
                  >
                    <option value="">Select action…</option>
                    {ACTION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Pill {...(r.__edd as any)} />
                </td>
                <td className="max-w-[280px] hidden lg:table-cell">
                  <div className="truncate" title={r.remark || ""}>
                    {r.remark || "—"}
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <a
                      href={r.__phone ? `tel:${r.__phone}` : "#"}
                      onClick={(e) => {
                        if (!r.__phone) e.preventDefault();
                      }}
                      className={classNames(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-lg ring-1 text-xs",
                        r.__phone ? "ring-slate-200 hover:bg-slate-50" : "ring-slate-100 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </a>
                    <a
                      href={r.__phone ? `https://wa.me/91${r.__phone.replace(/\D/g, "")}` : "#"}
                      target="_blank"
                      onClick={(e) => {
                        if (!r.__phone) e.preventDefault();
                      }}
                      className={classNames(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-lg ring-1 text-xs",
                        r.__phone ? "ring-slate-200 hover:bg-slate-50" : "ring-slate-100 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    <button onClick={() => onEdit(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ring-1 ring-slate-200 text-xs hover:bg-slate-50">
                      <Edit3 className="w-3.5 h-3.5" />
                      Update
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-slate-500">No results</div>}
    </div>
  );
}

// ---- Kanban View ------------------------------------------
function KanbanView({ rows, onEdit, onMove }: { rows: (NdrRow & any)[]; onEdit: (r: NdrRow) => void; onMove: (rowId: number, targetBucket: string) => Promise<void> }) {
  const groups = useMemo(() => {
    const g: Record<string, (NdrRow & any)[]> = {};
    for (const r of rows) {
      const k = (r as any).__bucket || "Other";
      if (!g[k]) g[k] = [] as any;
      g[k].push(r);
    }
    return g;
  }, [rows]);

  const orderColumns = ["Pending", "CNA", "Premises Closed", "Address Issue", "RTO", "Delivered", "Other"];

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {orderColumns
        .filter((col) => (groups[col] || []).length)
        .map((col) => {
          const items = groups[col] || [];
          return (
            <div
              key={col}
              className="rounded-2xl ring-1 ring-slate-200 bg-white"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/ndr-id"));
                if (!id) return;
                await onMove(id, col);
              }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="font-semibold flex items-center gap-2">
                  <StatusBadge bucket={col} />
                  <span className="text-xs text-slate-500">{items.length}</span>
                </div>
              </div>
              <div className="p-3 space-y-3 max-h-[70vh] overflow-auto">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl ring-1 ring-slate-200 p-3 bg-white/50"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/ndr-id", String(r.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">#{r.order_id}</div>
                      <Pill {...(r.__edd as any)} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{courierName(r.courier_account)} • {fmtIST(r.event_time)}</div>
                    <div className="mt-2 text-sm">
                      <span className="font-medium">{r.delivery_status}</span>
                      {r.remark ? ` — ${r.remark}` : ""}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      AWB: <span className="font-mono">{r.waybill}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => onEdit(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ring-1 ring-slate-200 text-xs hover:bg-slate-50">
                        <Edit3 className="w-3.5 h-3.5" />
                        Update
                      </button>
                      {trackingUrl(r) && (
                        <a href={trackingUrl(r)!} target="_blank" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg ring-1 ring-slate-200 text-xs hover:bg-slate-50">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Track
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
