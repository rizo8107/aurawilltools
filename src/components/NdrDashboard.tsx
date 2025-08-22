import React, { useEffect, useMemo, useState } from "react";
import RepeatCampaign from "./RepeatCampaign";
import { Download, RefreshCw, Search, ExternalLink, Filter, Edit3, CheckCircle2, AlertTriangle, XCircle, Clock, Truck, Info, ClipboardCopy, Columns } from "lucide-react";

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

// Email preview modal (inline in component for simplicity)
// Rendered conditionally inside NdrActionsPanel return

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
      title={checked ? "Toggle off" : "Toggle on"}
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
  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<NdrRow | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editIssue, setEditIssue] = useState("");
  const [editAction, setEditAction] = useState("");
  const [otherAction, setOtherAction] = useState("");
  const [editCalled, setEditCalled] = useState(false);
  const [editStatus, setEditStatus] = useState("Open");
  // repeat campaign drawer state
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatOrderId, setRepeatOrderId] = useState<string>("");
  const [repeatRow, setRepeatRow] = useState<NdrRow | null>(null);

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

  // reset to first page when filters/search change
  useEffect(() => {
    setPage(1);
  }, [q, courier, bucket]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize) as any[];
  }, [filtered, page, pageSize]);

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
        // CSV escape by doubling quotes per RFC 4180
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
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
          <span className="text-xs text-slate-500">Monitor & resolve non-delivery shipments</span>
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
            <select aria-label="Filter by courier" value={courier} onChange={(e) => setCourier(e.target.value)} className="bg-transparent text-sm outline-none">
              <option>All</option>
              {couriers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2">
            <Columns className="w-4 h-4 text-slate-400" />
            <select aria-label="Filter by bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} className="bg-transparent text-sm outline-none">
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
          <TableView
            rows={pageRows as any[]}
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onEdit={openEditor}
            onQuickUpdate={quickUpdate}
            onOpenRepeat={(orderId) => {
              try {
                const idStr = String(orderId);
                setRepeatOrderId(idStr);
                setRepeatOpen(true);
              } catch (err) {
                console.error('Failed to open embedded Repeat Campaign', err);
              }
            }}
            onOpenRepeatRow={(row) => {
              try {
                const idStr = String(row.order_id);
                setRepeatOrderId(idStr);
                setRepeatRow(row);
                setRepeatOpen(true);
              } catch (err) {
                console.error('Failed to open embedded Repeat Campaign', err);
              }
            }}
          />
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
      {/* Repeat Campaign Drawer */}
      <Drawer open={repeatOpen} onClose={() => setRepeatOpen(false)} title={repeatOrderId ? `Repeat Campaign • Order #${repeatOrderId}` : "Repeat Campaign"}>
        {repeatOpen && (
          <div className="-mx-2 space-y-4">{/* slight edge breathing room */}
            {/* Embedded NDR actions panel */}
            {repeatRow && (
              <NdrActionsPanel 
                row={repeatRow} 
                onQuickUpdate={async (updates) => {
                  await quickUpdate(repeatRow.id, updates);
                  setRepeatRow((prev) => (prev ? ({ ...prev, ...updates } as NdrRow) : prev));
                }}
              />
            )}
            <RepeatCampaign initialOrderNumber={repeatOrderId} hideFeedback={true} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ---- Table View -------------------------------------------
type TableViewProps = {
  rows: (NdrRow & any)[];
  onEdit: (r: NdrRow) => void;
  onQuickUpdate: (id: number, updates: Partial<NdrRow>) => Promise<void>;
  // pagination
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onOpenRepeat: (orderId: number) => void;
  onOpenRepeatRow: (row: NdrRow) => void;
};

function TableView({ rows, onEdit: _onEdit, onQuickUpdate, total, page, pageSize, totalPages, onPageChange, onPageSizeChange, onOpenRepeat: _onOpenRepeat, onOpenRepeatRow }: TableViewProps) {

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
            <th>Email Sent</th>
            <th>Called</th>
            <th>EDD</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const url = trackingUrl(r);
            const tone = r.__edd?.tone as any;
            const rowTone = tone === "late" ? "bg-rose-50/40" : tone === "warn" ? "bg-amber-50/30" : "";
            return (
              <tr key={r.id} className={`*:px-3 *:py-2 hover:bg-slate-50 ${rowTone} cursor-pointer`} onClick={() => onOpenRepeatRow(r)}>
                <td>
                  <div className="font-medium">{fmtIST(r.event_time)}</div>
                  <div className="text-xs text-slate-500">{r.location || "—"}</div>
                </td>
                <td className="font-medium">
                  <button
                    className="text-blue-600 hover:underline"
                    title="Open in Repeat Campaign"
                    onClick={(e) => { e.stopPropagation(); onOpenRepeatRow(r); }}
                  >
                    {r.order_id}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{r.waybill}</span>
                    <button title="Copy AWB" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(r.waybill)); }} className="p-1 rounded hover:bg-slate-100">
                      <ClipboardCopy className="w-4 h-4" />
                    </button>
                    {url && (
                      <a href={url} target="_blank" onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-slate-100" title="Open tracking">
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
                <td>
                  {(r as any).email_sent ? (
                    <button
                      className="px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 cursor-default"
                      disabled
                      title="Email already sent"
                    >
                      Sent
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenRepeatRow(r); }}
                      className="px-2 py-1 rounded-full text-xs ring-1 ring-slate-200 hover:bg-slate-50"
                      title="Open to compose and send email"
                    >
                      Send Email
                    </button>
                  )}
                </td>
                <td>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await onQuickUpdate(r.id, { called: !r.called });
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ring-1 ${r.called ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}
                    title={r.called ? "Called: Yes" : "Called: No"}
                  >
                    {r.called ? "Yes" : "No"}
                  </button>
                </td>
                <td>
                  <Pill {...(r.__edd as any)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-slate-500">No results</div>}
      {/* Pagination controls */}
      {rows.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3">
          <div className="text-sm text-slate-600">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-lg ring-1 ring-slate-200 disabled:opacity-50"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              title="Previous page"
            >
              Prev
            </button>
            <span className="text-sm">Page {page} / {totalPages}</span>
            <button
              className="px-3 py-1 rounded-lg ring-1 ring-slate-200 disabled:opacity-50"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              title="Next page"
            >
              Next
            </button>
            <select
              className="ml-2 ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
              title="Rows per page"
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Compact NDR actions panel (used inside Repeat drawer) ----
function NdrActionsPanel({ row, onQuickUpdate }: { row: NdrRow; onQuickUpdate: (updates: Partial<NdrRow>) => Promise<void> }) {
  const initial = parseNotes(row.notes);
  const [phone, setPhone] = useState<string>(initial.phone || "");
  const [issue, setIssue] = useState<string>(initial.customer_issue || "");
  const isPreset = ACTION_OPTIONS.includes(String(initial.action_taken || ""));
  const [action, setAction] = useState<string>(isPreset ? String(initial.action_taken) : (initial.action_taken ? "Other" : ""));
  const [other, setOther] = useState<string>(!isPreset ? String(initial.action_taken || "") : "");
  const [called, setCalled] = useState<boolean>(!!row.called);
  const [remark, setRemark] = useState<string>(row.remark || "");
  const [correctedPhone, setCorrectedPhone] = useState<string>((row as any).corrected_phone || "");
  const [correctedAddress, setCorrectedAddress] = useState<string>((row as any).corrected_address || "");
  const [showEmail, setShowEmail] = useState<boolean>(false);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailBody, setEmailBody] = useState<string>("");
  const [emailCourier, setEmailCourier] = useState<string>(courierName(row.courier_account || ""));

  async function save() {
    const chosenAction = action === "Other" ? (other.trim() || "Other") : (action || "");
    const notes = { phone: phone || undefined, customer_issue: issue || undefined, action_taken: chosenAction || undefined } as any;
    await onQuickUpdate({ called, remark: remark || null, corrected_phone: correctedPhone || null, corrected_address: correctedAddress || null, notes: JSON.stringify(notes) } as any);
  }

  // Draft builder and flags for email compose
  const isAddressIssue = /address/i.test(issue) || /address/i.test(row.delivery_status || "") || initial.bucket_override === "Address Issue" || toBucket(row) === "Address Issue";
  // Build a simple ASCII table for better readability across mail clients
  function buildTable(entries: Array<[string, string]>) {
    const keyWidth = 22; // label column width
    const sep = "+" + "-".repeat(keyWidth + 2) + "+" + "-".repeat(78) + "+"; // approx 80 chars value col
    const header =
      sep + "\n" +
      "| " + "Field".padEnd(keyWidth) + " | " + "Value".padEnd(78) + "|\n" +
      sep;
    const rows = entries.map(([k, v]) => {
      const val = (v ?? "—").toString();
      return "| " + k.padEnd(keyWidth) + " | " + val.padEnd(78).slice(0, 78) + "|";
    }).join("\n");
    return header + "\n" + rows + "\n" + sep;
  }
  // Build HTML table for webhook email (rich formatting)
  function buildHtmlTable(entries: Array<[string, string]>) {
    const escape = (s: string) => (s ?? "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const rows = entries.map(([k, v]) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #dbe0e6;background:#f8fafc;font-weight:600;white-space:nowrap;">${escape(k)}</td>
        <td style="padding:8px 10px;border:1px solid #dbe0e6;">${escape(v || '—')}</td>
      </tr>
    `).join("");
    return `
      <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid #dbe0e6;border-radius:8px;overflow:hidden;width:100%;max-width:680px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;">
        <thead>
          <tr>
            <th align="left" style="padding:10px;border:1px solid #dbe0e6;background:#e2e8f0;font-weight:700;">Field</th>
            <th align="left" style="padding:10px;border:1px solid #dbe0e6;background:#e2e8f0;font-weight:700;">Value</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }
  function getEmailDraft() {
    const subject = `Address Issue: Order #${row.order_id} – AWB ${row.waybill}`;
    const track = trackingUrl(row);
    const entries: Array<[string, string]> = [
      ["Courier Partner", emailCourier || courierName(row.courier_account || '')],
      ["Order ID", String(row.order_id)],
      ["AWB", String(row.waybill || '—')],
      ["Courier", courierName(row.courier_account || '')],
      ["Current Status", row.delivery_status || '—'],
      ["Location (last scan)", row.location || '—'],
      ["Customer Phone", phone || '—'],
      ["Tracking Link", track || '—'],
    ];
    const table = buildTable(entries);
    const bodyText = [
      `Hello Team,`,
      ``,
      `We are observing an address-related issue for the following shipment. Kindly assist with resolution or guide on next steps.`,
      ``,
      `Shipping Details`,
      table,
      ``,
      (correctedPhone || correctedAddress) ? `Corrections` : undefined,
      correctedPhone ? `- Corrected Phone: ${correctedPhone}` : undefined,
      correctedAddress ? `- Corrected Address: ${correctedAddress}` : undefined,
      (correctedPhone || correctedAddress) ? `` : undefined,
      `Notes`,
      issue ? `- Customer Issue: ${issue}` : undefined,
      remark ? `- Internal Remarks: ${remark}` : undefined,
      ``,
      `Requested action:`,
      `- Please correct the address and/or attempt delivery as appropriate.`,
      `- Update the shipment status accordingly.`,
      ``,
      `Thank you,`,
      `Support`,
      ``,
      `--`,
      `This email was sent automatically with n8n`,
    ].filter(Boolean).join("\n");

    // HTML body for richer formatting (used by webhook). We keep a clean, minimal style for compatibility.
    const htmlTable = buildHtmlTable(entries);
    const esc = (s: string) => (s ?? "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    const notesList = [
      issue ? `<li><strong>Customer Issue:</strong> ${esc(issue)}</li>` : "",
      remark ? `<li><strong>Internal Remarks:</strong> ${esc(remark)}</li>` : "",
    ].join("");
    const correctionsBox = (correctedPhone || correctedAddress) ? `
      <div style="border:1px solid #16a34a33;background:#f0fdf4;color:#166534;padding:12px 14px;border-radius:8px;margin:16px 0;">
        <div style="font-weight:700;margin-bottom:6px;">Corrections</div>
        <ul style="margin:0 0 0 18px;padding:0;">
          ${correctedPhone ? `<li><strong>Corrected Phone:</strong> ${esc(correctedPhone)}</li>` : ""}
          ${correctedAddress ? `<li><strong>Corrected Address:</strong> ${esc(correctedAddress)}</li>` : ""}
        </ul>
      </div>
    ` : "";
    const bodyHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;">
        <p>Hello Team,</p>
        <p>We are observing an address-related issue for the following shipment. Kindly assist with resolution or guide on next steps.</p>
        <h3 style="margin:16px 0 8px 0;font-size:15px;">Shipping Details</h3>
        ${htmlTable}
        ${correctionsBox}
        ${(issue || remark) ? `<h3 style="margin:16px 0 8px 0;font-size:15px;">Notes</h3><ul style="margin:0 0 16px 20px;padding:0;">${notesList}</ul>` : ""}
        <h3 style="margin:16px 0 8px 0;font-size:15px;">Requested action</h3>
        <ul style="margin:0 0 16px 20px;padding:0;">
          <li>Please correct the address and/or attempt delivery as appropriate.</li>
          <li>Update the shipment status accordingly.</li>
        </ul>
        <p>Thank you,<br/>Support</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"/>
        <p style="color:#475569;">This email was sent automatically with n8n</p>
      </div>
    `;
    return { subject, bodyText, bodyHtml };
  }

  function openEmailEditor() {
    const { subject, bodyText } = getEmailDraft();
    setEmailSubject(subject);
    setEmailBody(bodyText);
    setShowEmail(true);
  }

  async function sendMail() {
    const draftBuilt = getEmailDraft();
    const draft = { subject: emailSubject || draftBuilt.subject, bodyText: emailBody || draftBuilt.bodyText, bodyHtml: draftBuilt.bodyHtml };
    const payload = {
      order_id: row.order_id,
      waybill: row.waybill,
      courier_account: row.courier_account,
      courier_partner: emailCourier || courierName(row.courier_account || ''),
      subject: draft.subject,
      text_body: draft.bodyText,
      html_body: draft.bodyHtml,
      content_type: 'text/html',
      corrected_phone: correctedPhone || null,
      corrected_address: correctedAddress || null,
      phone: phone || null,
      issue: issue || null,
      remark: remark || null,
      tracking: trackingUrl(row) || null,
      called,
      timestamp: new Date().toISOString(),
    };
    try {
      const resp = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/ndrmailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        await onQuickUpdate({ corrected_phone: correctedPhone || null, corrected_address: correctedAddress || null, email_sent: true } as any);
      }
    } catch {}
    // Mailto cannot send HTML; we provide plaintext fallback to user's client
    const url = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.bodyText)}`;
    try { window.location.href = url; } catch {}
    setShowEmail(false);
  }

  async function copyEmail() {
    const { subject, bodyText } = {
      subject: emailSubject || getEmailDraft().subject,
      bodyText: emailBody || getEmailDraft().bodyText,
    } as { subject: string; bodyText: string };
    const full = `Subject: ${subject}\n\n${bodyText}`;
    try {
      await navigator.clipboard.writeText(full);
      alert("Email content copied to clipboard.");
    } catch {
      alert("Unable to copy automatically. Please select and copy manually:\n\n" + full);
    }
  }

  return (
    <div className="p-3 space-y-3 rounded-2xl ring-1 ring-slate-200 bg-white">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm block">
          Phone
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Customer phone" />
        </label>
        <div className="text-sm">
          <div>Called?</div>
          <div className="mt-1">
            <Toggle checked={called} onChange={setCalled} />
          </div>
        </div>
      </div>

      <label className="text-sm block">
        Issue from the customer
        <textarea className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[90px]" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g., Asked for delivery tomorrow; landmark missing; wants address change…" />
      </label>

      <label className="text-sm block">
        Action taken
        <div className="mt-1 grid grid-cols-1 gap-2">
          <select className="w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Select action…</option>
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {action === "Other" && (
            <input className="w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describe action taken" />
          )}
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm block">
          Corrected phone (if any)
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={correctedPhone} onChange={(e) => setCorrectedPhone(e.target.value)} placeholder="Updated phone number" />
        </label>
        <label className="text-sm block">
          Corrected address (if any)
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={correctedAddress} onChange={(e) => setCorrectedAddress(e.target.value)} placeholder="Updated address" />
        </label>
      </div>

      <label className="text-sm block">
        Remarks
        <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Internal remarks" />
      </label>

      <div className="mt-1 flex flex-wrap gap-2">
        <button onClick={save} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800" title="Save NDR actions">
          <CheckCircle2 className="w-4 h-4" />
          Save
        </button>
        <button
          type="button"
          onClick={openEmailEditor}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl ring-1 ring-slate-200 text-sm hover:bg-slate-50"
          title={isAddressIssue ? "Compose email to courier about address issue" : "Compose email to courier"}
        >
          Compose email to courier
        </button>
        <button
          type="button"
          onClick={copyEmail}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl ring-1 ring-slate-200 text-sm hover:bg-slate-50"
          title="Copy the composed email content"
        >
          Copy email content
        </button>
      </div>

      {showEmail && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4" onClick={() => setShowEmail(false)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Compose email to courier</div>
              <button className="px-2 py-1 text-sm text-slate-500 hover:text-slate-700" title="Close" onClick={() => setShowEmail(false)}>Close</button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-sm">
                Courier partner
                <select
                  className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2"
                  value={emailCourier}
                  onChange={(e) => setEmailCourier(e.target.value)}
                >
                  {["Delhivery","Xpressbees","Bluedart","DTDC","Ecom Express","Shadowfax","Amazon","Ekart","Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Subject
                <input
                  className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                />
              </label>
              <label className="block text-sm">
                Body
                <textarea
                  className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[240px] font-mono text-sm"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Email body"
                />
              </label>
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">Tip: You can edit the subject and body before sending.</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl ring-1 ring-slate-200 text-sm hover:bg-slate-50"
                  title="Copy to clipboard"
                >
                  Copy content
                </button>
                <button
                  type="button"
                  onClick={sendMail}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  title="Send mail and log to webhook"
                >
                  Send Mail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
              <div className="p-3 space-y-3 min-h-[100px]">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl ring-1 ring-slate-200 p-3 bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/ndr-id", String(r.id));
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">#{r.order_id} • <span className="font-mono">{r.waybill}</span></div>
                        <div className="text-xs text-slate-500">{fmtIST(r.event_time)} • {courierName(r.courier_account)}</div>
                      </div>
                      <button onClick={() => onEdit(r)} className="p-1 rounded-lg hover:bg-slate-100">
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2 text-sm">
                      <div className="text-slate-700">{r.delivery_status || "—"}</div>
                      <div className="text-xs text-slate-500">{r.location || "—"}</div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Pill {...(r.__edd as any)} />
                      <span className="text-xs text-slate-500">{r.__action_taken || "No action"}</span>
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
