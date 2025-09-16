import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import RepeatCampaign from "./RepeatCampaign";
import { Download, RefreshCw, Search, ExternalLink, Filter, Edit3, CheckCircle2, AlertTriangle, XCircle, Clock, Truck, Info, ClipboardCopy, Columns, Calendar } from "lucide-react";

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

// Column keys used for sorting/filtering per column
type ColumnKey = 'order' | 'awb' | 'status' | 'courier' | 'email' | 'call' | 'edd';

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
  assigned_to?: string | null;
  assigned_at?: string | null;
  final_status?: string | null;
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
): { phone?: string; customer_issue?: string; action_taken?: string; action_to_be_taken?: string; bucket_override?: string; call_status?: string } {
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
  if (!awb) return null;
  return `https://aurawill.clickpost.ai/en?waybill=${encodeURIComponent(awb)}`;
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

// Call status options requested by user
const CALL_STATUS_OPTIONS = [
  "Yes",
  "No",
  "Didn't Pick",
  "Busy",
  "Asked to call later",
  "Wrong Number",
  "Invalid Number",
];

// Final status options for resolution
const FINAL_STATUS_OPTIONS = [
  "Delivered",
  "Fake delivery",
  "Returned",
  "Refund",
  "Damage",
  "Invalid Number",
  "Address/Number issue",
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

function Stat({ label, value, icon: Icon, tone, onClick, active }: { label: string; value: string | number; icon: any; tone?: "ok" | "warn" | "late"; onClick?: () => void; active?: boolean }) {
  const toneClass =
    tone === "late"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <button type="button" onClick={onClick} className={classNames("text-left w-full flex items-center gap-3 rounded-2xl p-4 ring-2 transition", toneClass, active ? 'ring-slate-400' : 'ring-1')}>
      <div className="p-2 rounded-xl bg-white/70 ring-1 ring-black/5">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </button>
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
  const [remark, setRemark] = useState("All");
  const [view, setView] = useState<"table" | "analytics" | "emails" | "activity">("table");
  // Emails feed (inbound/outbound across orders)
  const [emailFeed, setEmailFeed] = useState<any[]>([]);
  const [emailFeedLoading, setEmailFeedLoading] = useState<boolean>(false);
  // Activity feed (assignment and other events)
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  // dashboard stat tile filter
  const [statFilter, setStatFilter] = useState<'all' | 'edd_overdue' | 'due_today' | 'cna_addr' | 'resolved' | 'delivered'>('all');
  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // date filter (YYYY-MM-DD)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Per-column multi-select filters
  const [colFilters, setColFilters] = useState<Record<ColumnKey, string[]>>({
    order: [],
    awb: [],
    status: [],
    courier: [],
    email: [],
    call: [],
    edd: [],
  });

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
  // selection for export
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // team members for assignment
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  // save state + toast
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Persisted current user and "My NDRs" toggle
  const [currentUser, setCurrentUser] = useState<string>(() => {
    try { return localStorage.getItem('ndr_user') || ''; } catch { return ''; }
  });
  const [myOnly, setMyOnly] = useState<boolean>(() => {
    try { return (localStorage.getItem('ndr_my_only') ?? 'true') !== 'false'; } catch { return true; }
  });
  function toggleMyOnly() {
    setMyOnly((prev) => {
      const next = !prev;
      try { localStorage.setItem('ndr_my_only', String(next)); } catch {}
      return next;
    });
  }

  function switchUser() {
    const next = window.prompt('Enter your handle (team member)', currentUser || '');
    if (next == null) return;
    const handle = next.trim();
    if (!handle) { setToast({ type: 'error', message: 'User cannot be empty' }); return; }
    try {
      localStorage.setItem('ndr_user', handle);
      // allow auto-allocation to run again for the new session/user if needed
      localStorage.removeItem('ndr_auto_alloc_done');
    } catch {}
    setCurrentUser(handle);
    setToast({ type: 'success', message: `Switched user to ${handle}` });
    try { load(); } catch {}
  }

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
      // Attempt auto-allocation once per session
      try { await autoAllocateOnce(); } catch {}
    }
  }

  // Reset allocation: clear assigned_to/assigned_at for current team members
  async function resetAllocation() {
    try {
      const teamId = localStorage.getItem('ndr_active_team_id');
      if (!teamId) { setToast({ type: 'error', message: 'Select a team first' }); return; }
      const memRes = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=member&order=member.asc`, { headers: SUPABASE_HEADERS });
      if (!memRes.ok) { setToast({ type: 'error', message: 'Failed to load team members' }); return; }
      const members: Array<{ member: string }>= await memRes.json();
      const handles = members.map(m=>m.member).filter(Boolean);
      if (handles.length===0) { setToast({ type: 'error', message: 'No members in team' }); return; }
      await Promise.all(handles.map(h =>
        fetch(`${SUPABASE_URL}/${SUPABASE_TABLE}?assigned_to=eq.${encodeURIComponent(h)}`, { method: 'PATCH', headers: SUPABASE_HEADERS, body: JSON.stringify({ assigned_to: null, assigned_at: null }) })
      ));
      // Log reset event
      try {
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: null,
            waybill: null,
            actor: localStorage.getItem('ndr_user') || '',
            action: 'reset_allocation',
            details: { team_id: Number(teamId) }
          }),
        });
      } catch {}
      setToast({ type: 'success', message: 'Allocation reset for team' });
      await load();
    } catch (e:any) {
      setToast({ type: 'error', message: e?.message || 'Reset failed' });
    }
  }

  // ---- Auto-allocation (first load per session) -------------
  async function autoAllocateOnce() {
    try {
      const session = localStorage.getItem('ndr_session');
      if (!session) return; // not logged in via NDR login
      if (localStorage.getItem('ndr_auto_alloc_done')) return; // already done this session
      const teamId = localStorage.getItem('ndr_active_team_id');
      if (!teamId) return;

      // 1) Load team members
      const memRes = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=id,member&order=member.asc`, { headers: SUPABASE_HEADERS });
      if (!memRes.ok) return;
      const members: Array<{ id: number; member: string }> = await memRes.json();
      const memberHandles = members.map(m => m.member).filter(Boolean);
      if (memberHandles.length === 0) return;

      // 2) Load allocation rule
      let rule: any = { mode: 'percentage', percents: [] as Array<{ member: string; percent: number }> };
      try {
        const ruleRes = await fetch(`${SUPABASE_URL}/ndr_allocation_rules?team_id=eq.${teamId}&select=rule&limit=1`, { headers: SUPABASE_HEADERS });
        if (ruleRes.ok) {
          const [row] = await ruleRes.json();
          if (row?.rule) rule = row.rule;
        }
      } catch {}

      // 3) Build schedule
      function buildSchedule(): string[] {
        if (rule?.mode === 'percentage' && Array.isArray(rule.percents) && rule.percents.length) {
          const expanded: string[] = [];
          const normHandles = memberHandles.map(h => ({ raw: h, norm: String(h || '').trim().toLowerCase() }));
          for (const p of rule.percents) {
            const nameNorm = String(p.member || '').trim().toLowerCase();
            const pct = Math.max(0, Math.round(Number(p.percent) || 0));
            if (!nameNorm || pct <= 0) continue;
            // Find the actual handle from team members using normalized compare
            const hit = normHandles.find(h => h.norm === nameNorm);
            const actual = hit?.raw;
            if (!actual) continue;
            for (let i = 0; i < pct; i++) expanded.push(actual);
          }
          // If still empty (all mismatched), fall back
          if (expanded.length) return expanded;
        }
        // fallback: simple round-robin list
        return memberHandles;
      }
      const schedule = buildSchedule();
      if (schedule.length === 0) return;

      // 4) Fetch unassigned NDR ids (limit to a sane batch to avoid long ops)
      const unassignedRes = await fetch(`${SUPABASE_URL}/${SUPABASE_TABLE}?assigned_to=is.null&select=id,order_id,waybill&order=event_time.desc`, { headers: SUPABASE_HEADERS });
      if (!unassignedRes.ok) return;
      const unassigned: Array<{ id: number }> = await unassignedRes.json();
      if (!Array.isArray(unassigned) || unassigned.length === 0) { localStorage.setItem('ndr_auto_alloc_done', '1'); return; }

      // 5) Assign in batches
      const now = new Date().toISOString();
      const batchSize = 25;
      for (let offset = 0; offset < unassigned.length; offset += batchSize) {
        const chunk = unassigned.slice(offset, offset + batchSize);
        await Promise.all(
          chunk.map(async (row: any, idx) => {
            const assignee = schedule[(offset + idx) % schedule.length];
            const url = `${SUPABASE_URL}/${SUPABASE_TABLE}?id=eq.${row.id}`;
            await fetch(url, { method: 'PATCH', headers: SUPABASE_HEADERS, body: JSON.stringify({ assigned_to: assignee, assigned_at: now }) });
            // Log per-lead assignment with explicit columns
            try {
              await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
                method: 'POST',
                headers: SUPABASE_HEADERS,
                body: JSON.stringify({
                  ndr_id: row.id,
                  order_id: row.order_id ?? null,
                  waybill: row.waybill != null ? String(row.waybill) : null,
                  actor: localStorage.getItem('ndr_user') || '',
                  action: 'assign',
                  from_member: null,
                  to_member: assignee,
                  team_id: Number(localStorage.getItem('ndr_active_team_id') || 0) || null,
                  details: { via: 'autoAllocateOnce' },
                }),
              });
            } catch {}
          })
        );
      }

      // 6) Log one meta event per session (optional granularity: per row)
      try {
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: null,
            waybill: null,
            actor: localStorage.getItem('ndr_user') || '',
            action: 'auto_assign',
            details: { team_id: Number(teamId), rule_mode: rule?.mode || 'percentage' }
          }),
        });
      } catch {}

      localStorage.setItem('ndr_auto_alloc_done', '1');
      // reload table after allocation
      try { await load(); } catch {}
    } catch {
      // swallow
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
          // Only the explicit saved call status. If absent (null), keep empty string so 'Empty' filter matches.
          __call_status: notes.call_status || "",
        } as any;
      }),
    [rows]
  );

  const filtered = useMemo(() => {
    const QQ = q.trim().toLowerCase();
    return enriched.filter((r: any) => {
      // Show only my leads if enabled and user present
      if (myOnly && currentUser && String(r.assigned_to || '') !== currentUser) return false;
      if (courier !== "All" && courierName(r.courier_account) !== courier) return false;
      if (bucket !== "All" && r.__bucket !== bucket) return false;
      if (remark !== "All" && String(r.remark || "") !== remark) return false;
      // stat tile filter
      switch (statFilter) {
        case 'edd_overdue':
          if (r.__edd?.tone !== 'late') return false;
          break;
        case 'due_today':
          if (r.__edd?.tone !== 'warn') return false;
          break;
        case 'cna_addr':
          if (!(r.__bucket === 'CNA' || r.__bucket === 'Address Issue')) return false;
          break;
        case 'resolved':
          if (String(r.status || '').toLowerCase() !== 'resolved') return false;
          break;
        case 'delivered':
          if (r.__bucket !== 'Delivered') return false;
          break;
        case 'all':
        default:
          break;
      }
      // per-column multi-select filters
      if (colFilters.order.length && !colFilters.order.includes(String(r.order_id ?? ''))) return false;
      if (colFilters.awb.length && !colFilters.awb.includes(String(r.waybill ?? ''))) return false;
      if (colFilters.status.length && !colFilters.status.includes(String(r.delivery_status || ''))) return false;
      if (colFilters.courier.length && !colFilters.courier.includes(String(courierName(r.courier_account)))) return false;
      if (colFilters.email.length) {
        const emailVal = (r as any).email_sent ? 'Yes' : 'No';
        if (!colFilters.email.includes(emailVal)) return false;
      }
      if (colFilters.call.length) {
        const callVal = String(r.__call_status || '');
        if (!colFilters.call.includes(callVal)) return false;
      }
      if (colFilters.edd.length && !colFilters.edd.includes(String(r.__edd?.label || '—'))) return false;
      // date range filter on event_time (inclusive day bounds)
      if (fromDate || toDate) {
        const ev = r.event_time ? new Date(r.event_time) : null;
        if (!ev) return false;
        if (fromDate) {
          const start = new Date(`${fromDate}T00:00:00`);
          if (ev < start) return false;
        }
        if (toDate) {
          const end = new Date(`${toDate}T23:59:59.999`);
          if (ev > end) return false;
        }
      }
      if (!QQ) return true;
      const hay = [r.order_id, r.waybill, r.delivery_status, r.remark, r.location, r.__phone, r.__customer_issue, r.__action_taken].join(" ").toLowerCase();
      return hay.includes(QQ);
    });
  }, [enriched, q, courier, bucket, remark, fromDate, toDate, colFilters, myOnly, currentUser, statFilter]);

  // reset to first page when filters/search change
  useEffect(() => {
    setPage(1);
  }, [q, courier, bucket, remark, fromDate, toDate, colFilters]);

  // helper to update a single column filter
  function updateColFilter(key: ColumnKey, values: string[]) {
    setColFilters((prev) => ({ ...prev, [key]: values }));
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize) as any[];
  }, [filtered, page, pageSize]);

  const stats = useMemo(() => {
    // Use the fully filtered dataset so metrics reflect all active filters,
    // including column menu selections, toolbar filters, date range, and search.
    const base = filtered as any[];
    const total = base.length;
    const late = base.filter((r) => r.__edd.tone === "late").length;
    const today = base.filter((r) => r.__edd.tone === "warn").length;
    const cna = base.filter((r) => r.__bucket === "CNA").length;
    const addr = base.filter((r) => r.__bucket === "Address Issue").length;
    const delivered = base.filter((r) => r.__bucket === "Delivered").length;
    const resolved = base.filter((r) => String(r.status || '').toLowerCase() === 'resolved').length;
    return { total, late, today, cna, addr, delivered, resolved };
  }, [filtered]);

  // CSV exports (filtered and selected)
  function exportCSV() {
    const csv = buildCsvRows(filtered as any[]);
    downloadCsv(`ndr_export_${Date.now()}.csv`, csv);
  }

  function exportSelectedCSV() {
    const sel = new Set(selectedIds);
    const rowsToExport = (filtered as any[]).filter((r: any) => sel.has(r.id));
    const csv = buildCsvRows(rowsToExport);
    downloadCsv(`ndr_selected_${Date.now()}.csv`, csv);
  }

  function clearSelection() { setSelectedIds([]); }

  // ---- Emails feed (inbound from email_activity, outbound from email_messages) ----
  async function loadEmailFeed() {
    try {
      setEmailFeedLoading(true);
      // Pull latest first; we will merge and keep only necessary fields
      const [actRes, msgRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/email_activity?direction=eq.inbound&order=created_at.desc&select=*`, { headers: SUPABASE_HEADERS }),
        fetch(`${SUPABASE_URL}/email_messages?order=created_at.desc&select=*`, { headers: SUPABASE_HEADERS }),
      ]);
      const inbound = actRes.ok ? await actRes.json() : [];
      const outbound = msgRes.ok ? await msgRes.json() : [];
      const mapInbound = (inbound as any[]).map((a) => ({
        __kind: 'activity',
        id: a.id,
        created_at: a.created_at || a.activity_at,
        direction: 'inbound',
        order_id: a.order_id,
        waybill: a.waybill,
        subject: a.subject,
        from_addr: a.from_addr,
        to_addrs: a.to_addrs,
        provider_thread_id: a.provider_thread_id,
      }));
      const mapOutbound = (outbound as any[]).map((m) => ({
        __kind: 'message',
        id: m.id,
        created_at: m.created_at || m.sent_at || m.received_at,
        direction: 'outbound',
        order_id: m.order_id,
        waybill: m.waybill,
        subject: m.subject,
        from_addr: m.from_addr,
        to_addrs: m.to_addrs,
        provider_thread_id: m.provider_thread_id,
      }));
      // Restrict to orders assigned to the current team member
      let member = '';
      try { member = (localStorage.getItem('ndr_user') || '').trim().toLowerCase(); } catch {}
      const allowedOrders = new Set<number>();
      try {
        for (const r of enriched as any[]) {
          const assignee = String((r as any).assigned_to || '').trim().toLowerCase();
          if (assignee && assignee === member) {
            const oid = Number((r as any).order_id);
            if (!Number.isNaN(oid)) allowedOrders.add(oid);
          }
        }
      } catch {}

      // Build full feed and tag whether each item is assigned to current member
      const mergedAll = [...mapInbound, ...mapOutbound]
        .filter((x) => x.created_at)
        .map((x) => ({ ...x, assigned: x.order_id ? allowedOrders.has(Number(x.order_id)) : false }))
        .sort((a, b) => new Date(b.created_at as any).getTime() - new Date(a.created_at as any).getTime());
      setEmailFeed(mergedAll);
    } catch {
      setEmailFeed([]);
    } finally {
      setEmailFeedLoading(false);
    }
  }

  useEffect(() => {
    if (view === 'emails') {
      loadEmailFeed();
    }
  }, [view]);

  // Load activity feed when Activity view is open
  async function loadActivity() {
    try {
      setActivityLoading(true);
      // Fetch recent assignment-related events
      const q = encodeURIComponent("assign,reassign,unassign,reset_allocation,auto_assign,call_status_update");
      const url = `${SUPABASE_URL}/ndr_user_activity?select=*&order=created_at.desc&action=in.(${q})`;
      const res = await fetch(url, { headers: SUPABASE_HEADERS });
      const data = res.ok ? await res.json() : [];
      setActivityFeed(Array.isArray(data) ? data : []);
    } catch {
      setActivityFeed([]);
    } finally {
      setActivityLoading(false);
    }
  }
  useEffect(() => {
    if (view === 'activity') loadActivity();
  }, [view]);

  // Build CSV from given rows
  function buildCsvRows(rowsToExport: any[]) {
    const head = [
      "Date (IST)",
      "Order ID",
      "AWB",
      "Current Status",
      "Courier",
      "Mobile",
      "Call Status",
      "Issue (Customer)",
      "Action Taken",
      "EDD",
      "Remarks",
      "Location",
      "Final Status",
    ];
    const lines = rowsToExport.map((r: any) =>
      [
        fmtIST(r.event_time),
        r.order_id,
        r.waybill,
        r.delivery_status || "",
        courierName(r.courier_account),
        r.__phone,
        r.__call_status || (r.called ? "Yes" : (r.called === false ? "No" : "")),
        r.__customer_issue,
        r.__action_taken,
        eddStatus(r.Partner_EDD).label,
        r.remark || "",
        r.location || "",
        r.final_status || "",
      ]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    return [head.join(","), ...lines].join("\n");
  }

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const couriers = useMemo(() => Array.from(new Set(enriched.map((r: any) => courierName(r.courier_account)))).filter(Boolean), [enriched]);
  const buckets = ["All", "Pending", "CNA", "Premises Closed", "Address Issue", "RTO", "Delivered", "Other"];

  // Remark groups: Top N as tabs, rest under 'More'
  const remarkOrder = useMemo(() => {
    const counts = new Map<string, number>();
    (enriched as any[]).forEach((r: any) => {
      const key = String(r.remark || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }, [enriched]);
  const topRemarkTabs = useMemo(() => ["All", ...remarkOrder.slice(0, 6)], [remarkOrder]);
  const moreRemarkOptions = useMemo(() => remarkOrder.slice(6), [remarkOrder]);

  // Unique values for per-column filter dropdowns
  const columnUniques: Record<ColumnKey, string[]> = useMemo(() => {
    const uniq = (arr: any[]) => Array.from(new Set(arr))
      .filter((x) => String(x ?? '').trim() !== '')
      .map((x) => String(x));
    return {
      order: uniq((enriched as any[]).map((r: any) => r.order_id ?? '')),
      awb: uniq((enriched as any[]).map((r: any) => r.waybill ?? '')),
      status: uniq((enriched as any[]).map((r: any) => r.delivery_status || '')),
      courier: uniq((enriched as any[]).map((r: any) => courierName(r.courier_account))),
      email: uniq((enriched as any[]).map((r: any) => ((r.email_sent ? 'Yes' : 'No')))),
      // Call status options are based only on the explicit saved status (notes.call_status),
      // so 'Empty' truly reflects rows with no selected value in the UI.
      call: Array.from(new Set((enriched as any[]).map((r: any) => (r.__call_status || '')))).map((x:any) => String(x)),
      edd: uniq((enriched as any[]).map((r: any) => (r.__edd?.label || '—'))),
    } as Record<ColumnKey, string[]>;
  }, [enriched]);

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

  // Open order editor from Emails tab
  async function openOrderFromEmail(orderId: number, awb?: string) {
    try {
      // Keep current view (emails); open the EXISTING Repeat Campaign drawer with full order details
      const byOrder = (r: any) => Number(r.order_id) === Number(orderId);
      const byAwb = (r: any) => awb ? String(r.waybill || '') === String(awb) : true;
      let target = (enriched as any[]).find(r => byOrder(r) && byAwb(r)) || (enriched as any[]).find(byOrder);
      if (!target) {
        // Fallback: fetch the single order directly
        try {
          const url = `${SUPABASE_URL}/${SUPABASE_TABLE}?order_id=eq.${orderId}&select=*`;
          const res = await fetch(url, { headers: SUPABASE_HEADERS });
          if (res.ok) {
            const arr = await res.json();
            if (Array.isArray(arr) && arr.length) target = arr[0];
          }
        } catch {}
      }
      // Populate Repeat drawer state and open
      try { setRepeatOrderId(String(orderId)); } catch {}
      try { if (target) setRepeatRow(target as NdrRow); } catch {}
      try { setRepeatOpen(true); } catch {}
    } catch {}
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
    try {
      setSaving(true);
      await patchNdr(editing.id, updates);
      setRows((prev) => prev.map((r) => (r.id === editing.id ? ({ ...r, ...updates } as any) : r)));
      // Log status update activity
      try {
        const actor = localStorage.getItem('ndr_user') || '';
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: editing.order_id,
            waybill: String(editing.waybill || ''),
            actor,
            action: 'status_update',
            details: updates,
          }),
        });
      } catch {}
      setEditorOpen(false);
      setToast({ type: 'success', message: 'Saved successfully' });
    } catch (e: any) {
      setToast({ type: 'error', message: e?.message ? `Save failed: ${e.message}` : 'Save failed' });
    } finally {
      setSaving(false);
    }
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
      {/* Toast */}
      {toast && (
        <div
          className={classNames(
            'fixed right-4 top-4 z-[60] min-w-[220px] max-w-sm rounded-xl px-3 py-2 shadow-lg ring-1',
            toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'
          )}
          role="status"
          aria-live="polite"
        >
          <div className="text-sm font-medium">{toast.message}</div>
          <button className="absolute right-2 top-1.5 text-xs underline" onClick={() => setToast(null)} title="Dismiss">Close</button>
        </div>
      )}

      {/* Header (compact) */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-end gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-xl ring-1 ring-slate-200 px-1 py-1">
            <IconButton title="Refresh" onClick={load}>
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </IconButton>
            <IconButton title="Export CSV" onClick={exportCSV}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </IconButton>
            <button
              type="button"
              onClick={toggleMyOnly}
              title={myOnly ? 'Showing only my assigned NDRs' : 'Showing all NDRs'}
              className={classNames(
                'inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1',
                myOnly ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
              )}
            >
              <span className="text-sm">My NDRs</span>
              <span className={classNames('ml-1 inline-block w-2 h-2 rounded-full', myOnly ? 'bg-emerald-500' : 'bg-slate-300')} />
            </button>
            <button
              type="button"
              onClick={switchUser}
              className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1 bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              title="Switch user"
            >
              <span className="text-sm">Switch User</span>
            </button>
            <button
              type="button"
              title="Reset allocation for current team"
              onClick={resetAllocation}
              className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1 ring-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
            >
              <span className="text-xs">Reset Allocation</span>
            </button>
            <button
              type="button"
              title="Update allocation (assign untouched only)"
              onClick={async () => { try { localStorage.removeItem('ndr_auto_alloc_done'); await autoAllocateOnce(); } catch {} }}
              className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1 ring-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100"
            >
              <span className="text-xs">Update Allocation</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-xl ring-1 ring-slate-200 px-1 py-1">
              <button onClick={() => setView('table')} className={classNames('px-2.5 py-1 rounded-lg text-sm', view === 'table' ? 'bg-slate-100' : 'hover:bg-slate-50')}>Table</button>
              <button onClick={() => setView('emails')} className={classNames('px-2.5 py-1 rounded-lg text-sm', view === 'emails' ? 'bg-slate-100' : 'hover:bg-slate-50')}>Emails</button>
              <button onClick={() => setView('analytics')} className={classNames('px-2.5 py-1 rounded-lg text-sm', view === 'analytics' ? 'bg-slate-100' : 'hover:bg-slate-50')}>Analytics</button>
              <button onClick={() => setView('activity')} className={classNames('px-2.5 py-1 rounded-lg text-sm', view === 'activity' ? 'bg-slate-100' : 'hover:bg-slate-50')}>Activity</button>
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
          <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-2 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <label className="text-xs text-slate-500">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="ml-2 bg-transparent text-sm outline-none"
              />
            </label>
            <span className="text-slate-400">–</span>
            <label className="text-xs text-slate-500">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="ml-2 bg-transparent text-sm outline-none"
              />
            </label>
            {(fromDate || toDate) && (
              <button
                title="Clear date filter"
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="ml-2 px-2 py-1 text-xs rounded-lg ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Total Shipments" value={stats.total} icon={Info}
          onClick={() => { setStatFilter('all'); setView('table'); }} active={statFilter==='all'} />
        <Stat label="EDD Overdue" value={stats.late} icon={AlertTriangle} tone="late"
          onClick={() => { setStatFilter('edd_overdue'); setView('table'); }} active={statFilter==='edd_overdue'} />
        <Stat label="Due Today" value={stats.today} icon={Clock} tone="warn"
          onClick={() => { setStatFilter('due_today'); setView('table'); }} active={statFilter==='due_today'} />
        <Stat label="CNA | Address Issues" value={`${stats.cna} | ${stats.addr}`} icon={Truck}
          onClick={() => { setStatFilter('cna_addr'); setView('table'); }} active={statFilter==='cna_addr'} />
        <Stat label="Resolved" value={stats.resolved} icon={CheckCircle2}
          onClick={() => { setStatFilter('resolved'); setView('table'); }} active={statFilter==='resolved'} />
        <Stat label="Delivered" value={stats.delivered} icon={Truck}
          onClick={() => { setStatFilter('delivered'); setView('table'); }} active={statFilter==='delivered'} />
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {error && <div className="p-4 rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200">{error}</div>}
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading NDR data…</div>
        ) : view === "table" ? (
          <>
            {/* Remark Tabs (moved above TableView) */}
            <div className="mb-2 flex items-center gap-2">
              <div className="flex gap-2 overflow-x-auto py-1">
                {topRemarkTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRemark(tab)}
                    className={classNames(
                      "whitespace-nowrap px-3 py-1.5 rounded-lg text-sm ring-1",
                      remark === tab ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    )}
                    title={tab === "All" ? "Show all remarks" : `Filter by remark: ${tab}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {moreRemarkOptions.length > 0 && (
                <div className="ml-auto flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-2 py-1">
                  <label className="text-xs text-slate-500">
                    More
                    <select
                      aria-label="More remarks"
                      className="ml-2 bg-transparent text-sm outline-none"
                      value={moreRemarkOptions.includes(remark) ? remark : ""}
                      onChange={(e) => setRemark(e.target.value || "All")}
                    >
                      <option value="">Select…</option>
                      {moreRemarkOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
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
              columnUniques={columnUniques}
              colFilters={colFilters}
              onChangeColumnFilter={updateColFilter}
              selectedIds={selectedIds}
              onToggleRow={(id, checked) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id))}
              onToggleAll={(checked, idsOnPage) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, ...idsOnPage])) : prev.filter(id => !idsOnPage.includes(id)))}
              onExportFiltered={exportCSV}
              onExportSelected={exportSelectedCSV}
              onClearSelection={clearSelection}
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
          </>
        ) : view === "emails" ? (
          <EmailsView items={emailFeed} loading={emailFeedLoading} onOpenOrder={(orderId, awb) => openOrderFromEmail(orderId, awb)} />
        ) : view === "activity" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Activity</div>
              <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50" onClick={loadActivity} title="Refresh activity">Refresh</button>
            </div>
            {activityLoading ? (
              <div className="p-6 text-center text-slate-500">Loading activity…</div>
            ) : (
              <div className="overflow-auto rounded-2xl ring-1 ring-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr className="*:px-3 *:py-2 *:whitespace-nowrap">
                      <th>Date (IST)</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>From → To</th>
                      <th>Order</th>
                      <th>AWB</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activityFeed.map((a: any) => (
                      <tr key={a.id} className="*:px-3 *:py-2">
                        <td>{fmtIST(a.created_at)}</td>
                        <td>{a.actor || '—'}</td>
                        <td>{a.action}</td>
                        <td>{[a.from_member || '—', a.to_member || '—'].join(' → ')}</td>
                        <td>{a.order_id ?? '—'}</td>
                        <td className="font-mono">{a.waybill ?? '—'}</td>
                        <td className="max-w-[360px] truncate" title={typeof a.details === 'object' ? JSON.stringify(a.details) : String(a.details)}>
                          {typeof a.details === 'object' ? JSON.stringify(a.details) : String(a.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <AnalyticsView rows={filtered as any[]} allRows={enriched as any[]} />
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
              <button onClick={saveEditor} disabled={saving} aria-busy={saving} className={classNames("inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white", saving ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800") }>
                <CheckCircle2 className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save'}
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
                  setRepeatOpen(false);
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
  // column filter data
  columnUniques: Record<ColumnKey, string[]>;
  colFilters: Record<ColumnKey, string[]>;
  onChangeColumnFilter: (key: ColumnKey, values: string[]) => void;
  // selection + export
  selectedIds: number[];
  onToggleRow: (id: number, checked: boolean) => void;
  onToggleAll: (checked: boolean, idsOnPage: number[]) => void;
  onExportFiltered: () => void;
  onExportSelected: () => void;
  onClearSelection: () => void;
};

function TableView({ rows, onEdit: _onEdit, onQuickUpdate, total, page, pageSize, totalPages, onPageChange, onPageSizeChange, onOpenRepeat: _onOpenRepeat, onOpenRepeatRow, columnUniques, colFilters, onChangeColumnFilter, selectedIds, onToggleRow, onToggleAll, onExportFiltered, onExportSelected, onClearSelection }: TableViewProps) {
  type SortKey = 'date' | 'order' | 'awb' | 'status' | 'courier' | 'edd';
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // assignment state (local to table)
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [assignMember, setAssignMember] = useState<string>('');
  const [assigning, setAssigning] = useState<boolean>(false);
  const [showPctAssign, setShowPctAssign] = useState<boolean>(false);
  const [pctValues, setPctValues] = useState<Record<string, number>>({});

  // Load team members for active team into local state
  async function loadTeamMembersLocal() {
    try {
      const teamId = localStorage.getItem('ndr_active_team_id');
      if (!teamId) { setTeamMembers([]); return; }
      const memRes = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=member&order=member.asc`, { headers: SUPABASE_HEADERS });
      if (!memRes.ok) { setTeamMembers([]); return; }
      const members: Array<{ member: string }>= await memRes.json();
      setTeamMembers(members.map(m => m.member).filter(Boolean));
    } catch {
      setTeamMembers([]);
    }
  }

  useEffect(() => {
    loadTeamMembersLocal();
  }, []);

  // Percentage assignment helpers (scoped to TableView)
  function openPctPanel() {
    const members = teamMembers.filter(Boolean);
    if (members.length === 0) return;
    const per = Math.floor(100 / members.length);
    const map: Record<string, number> = {};
    members.forEach(m => { map[m] = per; });
    let sum = members.reduce((acc, m) => acc + map[m], 0);
    let i = 0;
    while (sum < 100) { map[members[i % members.length]] += 1; sum++; i++; }
    setPctValues(map);
    setShowPctAssign(true);
  }

  function updatePct(member: string, val: number) {
    setPctValues(prev => ({ ...prev, [member]: Math.max(0, Math.min(100, Math.round(val))) }));
  }

  function validatePctTotal(): { ok: boolean; total: number } {
    const total = Object.values(pctValues).reduce((a: number, b: number) => a + (Number.isFinite(b) ? b : 0), 0);
    return { ok: total === 100, total };
  }

  async function onAssignByPercentages() {
    const members = teamMembers.filter(Boolean);
    const n = selectedIds.length;
    if (members.length === 0 || n === 0) return;
    // Largest remainder method
    const ideal = members.map(m => ({ m, x: ((pctValues[m] ?? 0) / 100) * n }));
    const base = ideal.map(o => ({ m: o.m, cnt: Math.floor(o.x), frac: o.x - Math.floor(o.x) }));
    const assignedCount = base.reduce((acc, o) => acc + o.cnt, 0);
    const need = Math.max(0, n - assignedCount);
    base.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < need; i++) base[i % base.length].cnt += 1;
    // Build round-robin schedule from buckets
    const buckets: Record<string, number> = {};
    base.forEach(o => { buckets[o.m] = o.cnt; });
    const schedule: string[] = [];
    let made = 0;
    while (made < n) {
      for (const m of members) {
        if ((buckets[m] ?? 0) > 0) {
          schedule.push(m);
          buckets[m] = (buckets[m] ?? 0) - 1;
          made++;
          if (made >= n) break;
        }
      }
      if (members.every(m => (buckets[m] ?? 0) <= 0)) break;
    }
    try {
      setAssigning(true);
      const now = new Date().toISOString();
      await Promise.all(selectedIds.map((id, idx) =>
        fetch(`${SUPABASE_URL}/${SUPABASE_TABLE}?id=eq.${id}`, {
          method: 'PATCH',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({ assigned_to: schedule[idx] || members[idx % members.length], assigned_at: now })
        })
      ));
      // Log single bulk event
      try {
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: null,
            waybill: null,
            actor: localStorage.getItem('ndr_user') || '',
            action: 'assign_percentages',
            team_id: Number(localStorage.getItem('ndr_active_team_id') || 0) || null,
            details: { count: selectedIds.length, percents: pctValues }
          }),
        });
      } catch {}
    } finally {
      setAssigning(false);
      setShowPctAssign(false);
    }
  }

  async function onAssignSelected() {
    const handle = String(assignMember || '').trim();
    if (!handle) return;
    if (selectedIds.length === 0) return;
    try {
      setAssigning(true);
      const now = new Date().toISOString();
      await Promise.all(selectedIds.map(id =>
        fetch(`${SUPABASE_URL}/${SUPABASE_TABLE}?id=eq.${id}`, {
          method: 'PATCH',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({ assigned_to: handle, assigned_at: now })
        })
      ));
      // Log a single bulk assignment event
      try {
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: null,
            waybill: null,
            actor: localStorage.getItem('ndr_user') || '',
            action: 'assign',
            from_member: null,
            to_member: handle,
            team_id: Number(localStorage.getItem('ndr_active_team_id') || 0) || null,
            details: { to: handle, count: selectedIds.length, via: 'bulk_assign' },
          }),
        });
      } catch {}
    } catch {
      // swallow here; parent lacks toast in this scope
    } finally {
      setAssigning(false);
    }
  }

  const [tableFilter, setTableFilter] = useState('');
  const [openFilter, setOpenFilter] = useState<ColumnKey | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  const toggleSort = (key: SortKey) => {
    setSortKey((prev) => (prev === key ? prev : key));
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
  };

  const filteredRows = useMemo(() => {
    const qq = tableFilter.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const hay = [r.order_id, r.waybill, r.delivery_status, courierName(r.courier_account), r.location].join(' ').toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, tableFilter]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'date': {
          const va = a.event_time ? new Date(a.event_time).getTime() : 0;
          const vb = b.event_time ? new Date(b.event_time).getTime() : 0;
          return (va - vb) * dir;
        }
        case 'order': return ((a.order_id ?? 0) - (b.order_id ?? 0)) * dir;
        case 'awb': return String(a.waybill ?? '').localeCompare(String(b.waybill ?? '')) * dir;
        case 'status': return String(a.delivery_status ?? '').localeCompare(String(b.delivery_status ?? '')) * dir;
        case 'courier': return String(courierName(a.courier_account) ?? '').localeCompare(String(courierName(b.courier_account) ?? '')) * dir;
        case 'edd': {
          const da = (a.__edd?.diff ?? Number.MAX_SAFE_INTEGER);
          const db = (b.__edd?.diff ?? Number.MAX_SAFE_INTEGER);
          return (da - db) * dir;
        }
      }
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  // selection helpers for current page
  const pageIds = useMemo(() => sortedRows.map(r => r.id), [sortedRows]);
  const selectedSet = useMemo(() => new Set<number>(selectedIds), [selectedIds]);
  const allSelectedOnPage = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));

  function FilterMenu({ colKey, title }: { colKey: ColumnKey; title: string }) {
    const options = columnUniques[colKey] || [];
    const selected = new Set(colFilters[colKey] || []);
    const allSelected = selected.size === 0 || selected.size === options.length;
    const toggleValue = (v: string) => {
      const next = new Set(selected);
      if (next.has(v)) next.delete(v); else next.add(v);
      onChangeColumnFilter(colKey, Array.from(next));
    };
    const selectAll = () => onChangeColumnFilter(colKey, []);
    const clearAll = () => onChangeColumnFilter(colKey, []);
    return (
      <div className="w-64 max-h-80 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-2" role="dialog" aria-label={`${title} filter`}>
        <div className="flex items-center justify-between px-2 py-1">
          <div className="text-xs font-medium text-slate-500">{title}</div>
          <div className="flex items-center gap-1">
            <button className="text-xs px-2 py-0.5 rounded ring-1 ring-slate-200 hover:bg-slate-50" onClick={selectAll} title="Select all">All</button>
            <button className="text-xs px-2 py-0.5 rounded ring-1 ring-slate-200 hover:bg-slate-50" onClick={clearAll} title="Clear">Clear</button>
          </div>
        </div>
        <ul className="mt-1 space-y-1">
          {options.map((opt) => {
            const isEmpty = opt === '';
            const display = isEmpty ? 'Empty' : opt;
            const key = `${colKey}-${isEmpty ? 'empty' : opt}`;
            return (
              <li key={key} className="flex items-center gap-2 px-2">
                <input
                  id={key}
                  type="checkbox"
                  checked={allSelected ? true : selected.has(opt)}
                  onChange={() => toggleValue(opt)}
                />
                <label htmlFor={key} className="text-sm truncate" title={display}>{display}</label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2 px-2 py-2">
          <button className="px-3 py-1 rounded-lg ring-1 ring-slate-200" onClick={() => setOpenFilter(null)} title="Close">OK</button>
        </div>
      </div>
    );
  }

  const SortHeader = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) => (
    <button type="button" onClick={onClick} className={classNames('inline-flex items-center gap-1', active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-800')}>
      <span>{label}</span>
      <span className="text-xs">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );

  return (
    <div className="overflow-auto rounded-2xl ring-1 ring-slate-200">
      <div className="flex items-center gap-2 p-2 border-b bg-white sticky top-0 z-10">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} placeholder="Quick filter (current page)…" className="flex-1 bg-transparent outline-none text-sm" />
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50"
            onClick={onExportFiltered}
            title="Export all filtered rows"
          >
            <Download className="w-4 h-4" /> Export filtered
          </button>
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={onExportSelected}
            disabled={selectedIds.length === 0}
            title="Export selected rows"
          >
            <Download className="w-4 h-4" /> Export selected ({selectedIds.length})
          </button>
          {/* Assign to team member */}
          <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-2 py-1 bg-white">
            <select
              className="bg-transparent text-sm outline-none"
              aria-label="Assign selected to team member"
              title="Assign selected to team member"
              value={assignMember}
              onChange={(e) => setAssignMember(e.target.value)}
            >
              <option value="">Assign to…</option>
              {teamMembers.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={onAssignSelected}
              disabled={!assignMember || selectedIds.length === 0 || assigning}
              title={selectedIds.length === 0 ? 'Select rows first' : 'Assign selected rows'}
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={openPctPanel}
              disabled={teamMembers.length === 0 || selectedIds.length === 0 || assigning}
              title={selectedIds.length === 0 ? 'Select rows first' : 'Assign by percentages'}
            >
              Assign by %
            </button>
          </div>
          {selectedIds.length > 0 && (
            <button
              className="px-2 py-1 rounded-lg text-xs ring-1 ring-slate-200 hover:bg-slate-50"
              onClick={onClearSelection}
              title="Clear selection"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left sticky top-10 z-10">
          <tr className="*:px-3 *:py-2 *:whitespace-nowrap">
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelectedOnPage}
                onChange={(e) => onToggleAll(e.target.checked, pageIds)}
                aria-label="Select all on page"
                title="Select all on page"
              />
            </th>
            <th className="min-w-[160px] px-3 py-2">
              <SortHeader label="Date (IST)" active={sortKey==='date'} dir={sortDir} onClick={() => toggleSort('date')} />
            </th>

            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <SortHeader label="Order ID" active={sortKey==='order'} dir={sortDir} onClick={() => toggleSort('order')} />
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter Order ID"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'order' ? null : 'order');
                  }}
                  aria-label="Open Order ID filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>

            <th className="relative min-w-[140px] px-3 py-2">
              <div className="flex items-center gap-2">
                <SortHeader label="AWB" active={sortKey==='awb'} dir={sortDir} onClick={() => toggleSort('awb')} />
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter AWB"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'awb' ? null : 'awb');
                  }}
                  aria-label="Open AWB filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>

            <th className="relative min-w-[220px] px-3 py-2">
              <div className="flex items-center gap-2">
                <SortHeader label="Current status" active={sortKey==='status'} dir={sortDir} onClick={() => toggleSort('status')} />
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter Status"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'status' ? null : 'status');
                  }}
                  aria-label="Open Status filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>

            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <SortHeader label="Courier" active={sortKey==='courier'} dir={sortDir} onClick={() => toggleSort('courier')} />
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter Courier"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'courier' ? null : 'courier');
                  }}
                  aria-label="Open Courier filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>

            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <span>Email Sent</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter Email Sent"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'email' ? null : 'email');
                  }}
                  aria-label="Open Email Sent filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>
            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <span>Final Status</span>
              </div>
            </th>
            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <span>Call Status</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter Call Status"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'call' ? null : 'call');
                  }}
                  aria-label="Open Call Status filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>

            <th className="relative px-3 py-2">
              <div className="flex items-center gap-2">
                <SortHeader label="EDD" active={sortKey==='edd'} dir={sortDir} onClick={() => toggleSort('edd')} />
                <button
                  type="button"
                  className="p-1 rounded hover:bg-slate-100"
                  title="Filter EDD"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuPos({ left: rect.right - 16, top: rect.bottom + 6 });
                    setOpenFilter(openFilter === 'edd' ? null : 'edd');
                  }}
                  aria-label="Open EDD filter"
                >
                  <Filter className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedRows.map((r) => {
            const url = trackingUrl(r);
            const tone = r.__edd?.tone as any;
            const rowTone = tone === 'late' ? 'bg-rose-50/40' : tone === 'warn' ? 'bg-amber-50/30' : '';
            return (
              <tr key={r.id} className={`*:px-3 *:py-2 hover:bg-slate-50 ${rowTone} cursor-pointer`} onClick={() => onOpenRepeatRow(r)}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onToggleRow(r.id, e.target.checked)}
                    aria-label={`Select row ${r.order_id}`}
                    title="Select row"
                  />
                </td>
                <td>
                  <div className="font-medium">{fmtIST(r.event_time)}</div>
                  <div className="text-xs text-slate-500">{r.location || '—'}</div>
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
                  <div className="font-medium">{r.delivery_status || '—'}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <StatusBadge bucket={r.__bucket} /> <span>{r.rto_awb ? `RTO: ${r.rto_awb}` : ''}</span>
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
                  <select
                    value={r.final_status || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={async (e) => {
                      e.stopPropagation();
                      const newVal = e.target.value || null;
                      await onQuickUpdate(r.id, { final_status: newVal as any });
                      try {
                        const actor = localStorage.getItem('ndr_user') || '';
                        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
                          method: 'POST',
                          headers: SUPABASE_HEADERS,
                          body: JSON.stringify({
                            order_id: r.order_id,
                            waybill: String(r.waybill || ''),
                            actor,
                            action: 'final_status_update',
                            details: { final_status: newVal },
                          }),
                        });
                      } catch {}
                    }}
                    className="ring-1 ring-slate-200 rounded-full px-2 py-1 text-xs bg-white hover:bg-slate-50"
                    title="Update final status"
                  >
                    <option value="">Select…</option>
                    {FINAL_STATUS_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={r.__call_status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={async (e) => {
                      e.stopPropagation();
                      const newStatus = e.target.value;
                      const newCalled = newStatus === "Yes" ? true : newStatus === "No" ? false : null;
                      const notes = parseNotes(r.notes);
                      notes.call_status = newStatus || undefined;
                      try {
                        if ((r as any).__phone) {
                          await fetch(`${SUPABASE_URL}/rpc/update_call_status`, {
                            method: 'POST',
                            headers: SUPABASE_HEADERS,
                            body: JSON.stringify({ p_phone: (r as any).__phone, p_status: newStatus }),
                          });
                        }
                      } catch {}
                      await onQuickUpdate(r.id, { called: newCalled as any, notes: JSON.stringify(notes) });
                      // Log call status update
                      try {
                        const actor = localStorage.getItem('ndr_user') || '';
                        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
                          method: 'POST',
                          headers: SUPABASE_HEADERS,
                          body: JSON.stringify({
                            order_id: r.order_id,
                            waybill: String(r.waybill || ''),
                            actor,
                            action: 'call_status_update',
                            details: { called: newCalled, call_status: newStatus },
                          }),
                        });
                      } catch {}
                    }}
                    className="ring-1 ring-slate-200 rounded-full px-2 py-1 text-xs bg-white hover:bg-slate-50"
                    title="Update call status"
                  >
                    <option value="">Select…</option>
                    {CALL_STATUS_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <Pill {...(r.__edd as any)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {openFilter && menuPos && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[200]"
          onClick={() => setOpenFilter(null)}
          aria-hidden
        >
          <div
            className="pointer-events-auto"
            style={{ position: 'fixed', left: Math.max(8, menuPos.left - 256), top: menuPos.top }}
            onClick={(e) => e.stopPropagation()}
          >
            {openFilter === 'order' && <FilterMenu colKey="order" title="Order ID" />}
            {openFilter === 'awb' && <FilterMenu colKey="awb" title="AWB" />}
            {openFilter === 'status' && <FilterMenu colKey="status" title="Status" />}
            {openFilter === 'courier' && <FilterMenu colKey="courier" title="Courier" />}
            {openFilter === 'email' && <FilterMenu colKey="email" title="Email Sent" />}
            {openFilter === 'call' && <FilterMenu colKey="call" title="Call Status" />}
            {openFilter === 'edd' && <FilterMenu colKey="edd" title="EDD" />}
          </div>
        </div>,
        document.body
      )}
      {rows.length === 0 && <div className="p-8 text-center text-slate-500">No results</div>}
      {showPctAssign && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[200]" onClick={() => setShowPctAssign(false)} aria-hidden>
          <div className="pointer-events-auto" style={{ position: 'fixed', right: 16, top: 72 }} onClick={(e) => e.stopPropagation()}>
            <div className="w-80 rounded-xl bg-white shadow-xl ring-1 ring-slate-200 p-3">
              <div className="text-sm font-semibold mb-2">Assign by percentages</div>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {teamMembers.map(m => (
                  <div key={m} className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-700 truncate" title={m}>{m}</div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Number.isFinite(pctValues[m]) ? pctValues[m] : 0}
                        onChange={(e) => updatePct(m, Number(e.target.value))}
                        className="w-20 ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm text-right"
                        title={`Percentage for ${m}`}
                      />
                      <span className="text-sm text-slate-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <div>Total: {Object.values(pctValues).reduce((a: number, b: number) => a + (Number.isFinite(b) ? b : 0), 0)}%</div>
                {!validatePctTotal().ok && <div className="text-rose-600">Must total 100%</div>}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm" onClick={() => setShowPctAssign(false)}>Cancel</button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
                  disabled={!validatePctTotal().ok || selectedIds.length === 0 || assigning}
                  onClick={onAssignByPercentages}
                >
                  {assigning ? 'Assigning…' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
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
  // save button animation state
  const [savingInline, setSavingInline] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [other, setOther] = useState<string>(!isPreset ? String(initial.action_taken || "") : "");
  const [called, setCalled] = useState<boolean>(!!row.called);
  const [remark, setRemark] = useState<string>(row.remark || "");
  const [correctedPhone, setCorrectedPhone] = useState<string>((row as any).corrected_phone || "");
  const [correctedAddress, setCorrectedAddress] = useState<string>((row as any).corrected_address || "");
  const [showEmail, setShowEmail] = useState<boolean>(false);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailBody, setEmailBody] = useState<string>("");
  const [emailCourier, setEmailCourier] = useState<string>(courierName(row.courier_account || ""));
  // New: Action to be taken (for email), requested by user. Highlighted in UI and included in email.
  const [actionToBeTaken, setActionToBeTaken] = useState<string>(initial.action_to_be_taken || "");
  // New: Customer query (additional context from customer), highlighted in email
  const [customerQuery, setCustomerQuery] = useState<string>(((initial as any).customer_query) || "");
  // AI suggestions state
  const [actionSugs, setActionSugs] = useState<string[]>([]);
  const [querySugs, setQuerySugs] = useState<string[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);

  async function fetchGeminiSuggestions(kind: 'action' | 'query') {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      alert('Gemini API key missing. Please set VITE_GEMINI_API_KEY in your environment.');
      return;
    }
    const context = [
      `Courier: ${courierName(row.courier_account || '')}`,
      `Order ID: ${row.order_id}`,
      `AWB: ${row.waybill}`,
      `Status: ${row.delivery_status || '—'}`,
      row.location ? `Location: ${row.location}` : '',
      issue ? `Customer issue: ${issue}` : '',
      correctedAddress ? `Corrected address: ${correctedAddress}` : '',
      correctedPhone ? `Corrected phone: ${correctedPhone}` : '',
    ].filter(Boolean).join('\n');

    const userSeed = kind === 'action' ? (actionToBeTaken || '').trim() : (customerQuery || '').trim();
    const baseRules = `Output only 5 lines. No headers, no numbering, no bullet characters. One line per suggestion. Keep <= 14 words.`;
    const prompt = kind === 'action'
      ? (
          userSeed
            ? `${baseRules}\nRewrite the user's draft into 5 imperative, courier-facing instructions (one line each). Start with a strong verb. No IDs/metadata.\n\nUser draft:\n"${userSeed}"\n\nShipment context:\n${context}`
            : `${baseRules}\nGiven the shipment context, write 5 imperative courier instructions (one line each). Start with a verb. No extra commentary.\n\n${context}`
        )
      : (
          userSeed
            ? `${baseRules}\nRewrite the customer's words into 5 concise statements of what the customer said. Neutral tone. No IDs, no tracking numbers, no colons, no semicolons.\n\nCustomer words:\n"${userSeed}"\n\nShipment context:\n${context}`
            : `${baseRules}\nFrom the shipment context, write 5 concise statements of what the customer said over phone. No IDs/metadata, no colons/semicolons.\n\n${context}`
        );

    try {
      if (kind === 'action') setLoadingAction(true); else setLoadingQuery(true);
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}` , {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 256
          }
        }),
      });
      const data = await resp.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Split into lines, strip bullets/numbers, keep non-empty, max 8
      const rawLines = text.split(/\r?\n/)
        .map((l: string) => l.replace(/^[-*\d.).\s]+/, '').trim())
        .filter((l: string) => l.length >= 3 && l.length <= 140);
      // Remove meta/preamble and IDs/colon lines; normalize punctuation
      const lines = rawLines
        .filter((l: string) => !/^here\b/i.test(l))
        .filter((l: string) => !/^output\b/i.test(l))
        .filter((l: string) => !/\b(Order\s*ID|Courier|AWB|Tracking|Current location)\b/i.test(l) || kind === 'action')
        .filter((l: string) => !(kind === 'query' && /[:;]{1}/.test(l)))
        .map((l: string) => l.replace(/[\s.]+$/,'').trim())
        .slice(0, 8);
      if (kind === 'action') setActionSugs(lines); else setQuerySugs(lines);
    } catch {
      if (kind === 'action') setActionSugs([]); else setQuerySugs([]);
      alert('Failed to fetch suggestions.');
    } finally {
      if (kind === 'action') setLoadingAction(false); else setLoadingQuery(false);
    }
  }

  async function save() {
    const chosenAction = action === "Other" ? (other.trim() || "Other") : (action || "");
    const notes = { phone: phone || undefined, customer_issue: issue || undefined, action_taken: chosenAction || undefined, action_to_be_taken: (actionToBeTaken || undefined), customer_query: (customerQuery || undefined) } as any;
    try {
      setSavingInline(true);
      await onQuickUpdate({ called, remark: remark || null, corrected_phone: correctedPhone || null, corrected_address: correctedAddress || null, notes: JSON.stringify(notes) } as any);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);
      // Log status update from inline save
      try {
        const actor = agent || (localStorage.getItem('ndr_user') || '');
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: row.order_id,
            waybill: String(row.waybill || ''),
            actor,
            action: 'status_update',
            details: { called, remark, corrected_phone: correctedPhone || null, corrected_address: correctedAddress || null, notes },
          }),
        });
      } catch {}
    } finally {
      setSavingInline(false);
    }
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
      `>>> REQUESTED ACTION (IMPORTANT) <<<`,
      actionToBeTaken
        ? `- ${actionToBeTaken}`
        : `- Please correct the address and/or attempt delivery as appropriate.\n- Update the shipment status accordingly.`,
      ``,
      customerQuery ? `>>> CUSTOMER QUERY <<<\n- ${customerQuery}` : undefined,
      customerQuery ? `` : undefined,
      (correctedPhone || correctedAddress) ? `Corrections` : undefined,
      correctedPhone ? `- Corrected Phone: ${correctedPhone}` : undefined,
      correctedAddress ? `- Corrected Address: ${correctedAddress}` : undefined,
      (correctedPhone || correctedAddress) ? `` : undefined,
      `We are observing an address-related issue for the following shipment. Kindly assist with resolution or guide on next steps.`,
      ``,
      `Shipping Details`,
      table,
      ``,
      `Notes`,
      issue ? `- Customer Issue: ${issue}` : undefined,
      remark ? `- Internal Remarks: ${remark}` : undefined,
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
    const topRequestedActionHtml = `
      <div style="margin:0 0 16px 0;padding:14px 16px;border:2px solid #F59E0B;background:#FEF3C7;border-radius:12px;">
        <div style="font-weight:700;color:#92400E;font-size:16px;display:flex;align-items:center;gap:8px;">
          <span>⚠️ Requested action</span>
        </div>
        <ul style="margin:8px 0 0 20px;padding:0;font-size:15px;color:#7C2D12;">
          ${actionToBeTaken
            ? `<li>${esc(actionToBeTaken)}</li>`
            : `<li>Please correct the address and/or attempt delivery as appropriate.</li><li>Update the shipment status accordingly.</li>`}
        </ul>
      </div>
    `;
    const customerQueryHtml = customerQuery ? `
      <div style="margin:0 0 16px 0;padding:14px 16px;border:2px solid #3B82F6;background:#EFF6FF;border-radius:12px;">
        <div style="font-weight:700;color:#1D4ED8;font-size:16px;display:flex;align-items:center;gap:8px;">
          <span>🗣️ Customer query</span>
        </div>
        <ul style="margin:8px 0 0 20px;padding:0;font-size:15px;color:#1E3A8A;">
          <li>${esc(customerQuery)}</li>
        </ul>
      </div>
    ` : "";
    const bodyHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;">
        <p>Hello Team,</p>
        ${topRequestedActionHtml}
        ${customerQueryHtml}
        ${correctionsBox}
        <p>We are observing an address-related issue for the following shipment. Kindly assist with resolution or guide on next steps.</p>
        <h3 style="margin:16px 0 8px 0;font-size:15px;">Shipping Details</h3>
        ${htmlTable}
        
        ${(issue || remark) ? `<h3 style="margin:16px 0 8px 0;font-size:15px;">Notes</h3><ul style="margin:0 0 16px 20px;padding:0;">${notesList}</ul>` : ""}
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

  // Email activity state (threads + messages) and actions
  const [activityLoading, setActivityLoading] = useState(false);
  const [emailThread, setEmailThread] = useState<any | null>(null);
  const [emailMessages, setEmailMessages] = useState<any[]>([]);
  const [replyBody, setReplyBody] = useState<string>("");
  const [sendingReply, setSendingReply] = useState(false);
  const [expandedMsg, setExpandedMsg] = useState<Record<number, boolean>>({});
  // Lightweight login (agent identity) stored locally
  const [agent, setAgent] = useState<string>(() => {
    try { return localStorage.getItem('ndr_user') || ''; } catch { return ''; }
  });
  function saveAgent(next: string) {
    setAgent(next);
    try { localStorage.setItem('ndr_user', next || ''); } catch {}
  }

  // Assign current NDR to this agent
  const [assigning, setAssigning] = useState(false);
  async function assignToMe() {
    if (!agent) { alert('Set your user name/email first.'); return; }
    try {
      setAssigning(true);
      await onQuickUpdate({ assigned_to: agent, assigned_at: new Date().toISOString() } as any);
      // log user activity
      try {
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: row.order_id,
            waybill: String(row.waybill || ''),
            actor: agent,
            action: 'assign',
            details: { assigned_to: agent }
          }),
        });
      } catch {}
    } finally {
      setAssigning(false);
    }
  }

  async function loadEmailActivity() {
    try {
      setActivityLoading(true);
      // 1) Load outbound from email_messages by order + awb (no thread dependency)
      const obUrl = `${SUPABASE_URL}/email_messages?order_id=eq.${row.order_id}&waybill=eq.${encodeURIComponent(String(row.waybill || ''))}&direction=eq.outbound&order=sent_at.asc.nullsfirst,received_at.asc.nullsfirst,created_at.asc&select=*`;
      const obRes = await fetch(obUrl, { headers: SUPABASE_HEADERS });
      let outbound: any[] = [];
      if (obRes.ok) {
        const arr = await obRes.json();
        outbound = Array.isArray(arr) ? arr : [];
      }
      // Keep a lightweight header object for UI subtitle
      let headerSubject: string | null = outbound.length ? outbound[outbound.length - 1]?.subject || null : null;

      // 2) Load inbound from email_activity for this order/awb
      const actUrl = `${SUPABASE_URL}/email_activity?order_id=eq.${row.order_id}&waybill=eq.${encodeURIComponent(String(row.waybill || ''))}&direction=eq.inbound&order=activity_at.asc&select=*`;
      const inbRes = await fetch(actUrl, { headers: SUPABASE_HEADERS });
      let inbound: any[] = [];
      if (inbRes.ok) {
        const arr = await inbRes.json();
        inbound = Array.isArray(arr) ? arr.map((a: any) => ({
          ...a,
          // Normalize time fields so renderer can pick it up
          received_at: a.activity_at,
        })) : [];
        if (!headerSubject && inbound.length) headerSubject = inbound[inbound.length - 1]?.subject || null;
      }

      // 3) Merge both and sort chronologically by effective time
      const merged = [...outbound, ...inbound].sort((a: any, b: any) => {
        const ta = new Date(a.received_at || a.sent_at || a.created_at || a.activity_at || 0).getTime();
        const tb = new Date(b.received_at || b.sent_at || b.created_at || b.activity_at || 0).getTime();
        return ta - tb;
      });

      setEmailMessages(merged);
      const latest = merged.length ? merged[merged.length - 1] : null;
      setEmailThread(latest ? { thread_id: latest.provider_thread_id || '-', subject: headerSubject || latest.subject } : null);
    } catch {
      setEmailMessages([]);
      setEmailThread(null);
    } finally {
      setActivityLoading(false);
    }
  }

  // Auto-load activity
  useEffect(() => {
    loadEmailActivity();
  }, []);
  useEffect(() => {
    if (showEmail) loadEmailActivity();
  }, [showEmail]);

  async function sendReply() {
    if (!emailThread?.thread_id || !replyBody.trim()) return;
    const last = emailMessages.length ? emailMessages[emailMessages.length - 1] : null;
    const subject = emailThread.subject ? (emailThread.subject.startsWith('Re:') ? emailThread.subject : `Re: ${emailThread.subject}`) : `Re: Order #${row.order_id} – AWB ${row.waybill}`;
    const bodyText = replyBody.trim();
    const htmlEsc = (s: string) => (s ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const bodyHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;">${htmlEsc(replyBody)}</div>`;
    const payload = {
      order_id: row.order_id,
      waybill: row.waybill,
      subject,
      text_body: bodyText,
      html_body: bodyHtml,
      content_type: 'text/html',
      thread_id: emailThread.thread_id,
      in_reply_to: last?.message_id || null,
      timestamp: new Date().toISOString(),
      // marker fields for n8n routing
      action: 'reply_email',
      webhook_marker: 'ndr_reply',
      message_kind: 'reply',
      source: 'ndr_dashboard',
    } as any;
    try {
      setSendingReply(true);
      const resp = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/ndrmailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NDR-Action': 'reply_email', 'X-Webhook-Marker': 'ndr_reply' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        let data: any = null;
        try { data = await resp.json(); } catch {}
        // Upsert thread (keep subject/activity fresh)
        try {
          await fetch(`${SUPABASE_URL}/email_threads`, {
            method: 'POST',
            headers: { ...SUPABASE_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify({
              ndr_id: row.id,
              order_id: row.order_id,
              waybill: String(row.waybill || ''),
              thread_id: String(emailThread.thread_id),
              provider: String(data?.provider || 'gmail'),
              subject,
              last_message_id: String(data?.message_id || data?.id || ''),
              last_activity_at: new Date().toISOString(),
            }),
          });
        } catch {}
        // Insert outbound message
        try {
          await fetch(`${SUPABASE_URL}/email_messages`, {
            method: 'POST',
            headers: { ...SUPABASE_HEADERS },
            body: JSON.stringify({
              thread_id: emailThread.id || null,
              provider: String(data?.provider || 'gmail'),
              message_id: String(data?.message_id || data?.id || ''),
              in_reply_to: last?.message_id || null,
              provider_thread_id: String(emailThread.thread_id),
              direction: 'outbound',
              status: 'sent',
              order_id: row.order_id,
              waybill: String(row.waybill || ''),
              subject,
              body_text: bodyText,
              body_html: bodyHtml,
              headers: data?.headers || null,
              provider_raw: data || null,
              sent_at: new Date().toISOString(),
            }),
          });
        } catch {}
        // Log user activity for outbound email
        try {
          const actor = agent || (localStorage.getItem('ndr_user') || '');
          await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
            method: 'POST',
            headers: SUPABASE_HEADERS,
            body: JSON.stringify({
              order_id: row.order_id,
              waybill: String(row.waybill || ''),
              actor,
              action: 'email_outbound',
              details: {
                subject,
                message_id: String(data?.message_id || data?.id || ''),
                provider_thread_id: String(emailThread.thread_id)
              }
            }),
          });
        } catch {}
        setReplyBody("");
        await loadEmailActivity();
      }
    } finally {
      setSendingReply(false);
    }
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
      requested_action: actionToBeTaken || null,
      customer_query: customerQuery || null,
      tracking: trackingUrl(row) || null,
      called,
      timestamp: new Date().toISOString(),
    };
    let sentOk = false;
    try {
      const resp = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/ndrmailer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        // Expect n8n to return provider ids, e.g. { message_id, thread_id, provider, headers, raw }
        let data: any = null;
        try { data = await resp.json(); } catch {}

        // Upsert thread first (if ids available)
        let threadRowId: number | null = null;
        if (data && (data.thread_id || data.threadId)) {
          const thread_id = String(data.thread_id || data.threadId);
          const provider = String(data.provider || 'gmail');
          const subjectSnap = draft.subject || null;
          try {
            const thRes = await fetch(`${SUPABASE_URL}/email_threads`, {
              method: 'POST',
              headers: { ...SUPABASE_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
              body: JSON.stringify({
                ndr_id: row.id,
                order_id: row.order_id,
                waybill: String(row.waybill || ''),
                thread_id,
                provider,
                subject: subjectSnap,
                last_message_id: String(data.message_id || data.id || ''),
                last_activity_at: new Date().toISOString(),
              }),
            });
            if (thRes.ok) {
              const arr = await thRes.json();
              threadRowId = Array.isArray(arr) && arr[0]?.id ? Number(arr[0].id) : null;
            }
          } catch {}

          // Insert outbound message referencing the thread
          try {
            await fetch(`${SUPABASE_URL}/email_messages`, {
              method: 'POST',
              headers: { ...SUPABASE_HEADERS },
              body: JSON.stringify({
                thread_id: threadRowId,
                order_id: row.order_id,
                waybill: String(row.waybill || ''),
                provider,
                message_id: String(data.message_id || data.id || ''),
                in_reply_to: data.in_reply_to ? String(data.in_reply_to) : null,
                provider_thread_id: thread_id,
                direction: 'outbound',
                status: 'sent',
                from_addr: null,
                to_addrs: [],
                subject: draft.subject,
                body_text: draft.bodyText,
                body_html: draft.bodyHtml,
                headers: data.headers || null,
                provider_raw: data || null,
                sent_at: new Date().toISOString(),
              }),
            });
          } catch {}
        }

        // Log user activity for outbound email
        try {
          const actor = agent || (localStorage.getItem('ndr_user') || '');
          await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
            method: 'POST',
            headers: SUPABASE_HEADERS,
            body: JSON.stringify({
              order_id: row.order_id,
              waybill: String(row.waybill || ''),
              actor,
              action: 'email_outbound',
              details: {
                subject: draft.subject,
                provider_thread_id: data?.thread_id || data?.threadId || null,
                message_id: String(data?.message_id || data?.id || ''),
              }
            }),
          });
        } catch {}

        // Mark row as emailed in main NDR table
        await onQuickUpdate({ corrected_phone: correctedPhone || null, corrected_address: correctedAddress || null, email_sent: true } as any);
        sentOk = true;
        // Reload activity timeline so the new message appears immediately
        await loadEmailActivity();
        setShowEmail(false);
      }
    } catch {}
    if (!sentOk) {
      // Mailto cannot send HTML; we provide plaintext fallback to user's client
      const url = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.bodyText)}`;
      try { window.location.href = url; } catch {}
      setShowEmail(false);
    }
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

  // Mark as Resolved and log attribution for analytics
  async function resolveNow() {
    try {
      setSavingInline(true);
      const emailSent = Boolean((row as any).email_sent);
      const callUpdated = Boolean(called);
      const attribution = (emailSent && callUpdated)
        ? 'resolved_by_member'
        : ((emailSent || callUpdated) ? 'resolved_by_agent' : 'auto_resolved');
      await onQuickUpdate({ status: 'Resolved' } as any);
      try {
        const actor = agent || (localStorage.getItem('ndr_user') || '');
        await fetch(`${SUPABASE_URL}/ndr_user_activity`, {
          method: 'POST',
          headers: SUPABASE_HEADERS,
          body: JSON.stringify({
            order_id: row.order_id,
            waybill: String(row.waybill || ''),
            actor,
            action: 'resolve',
            details: { attribution, email_sent: emailSent, called: callUpdated }
          }),
        });
      } catch {}
      setToast({ type: 'success', message: 'Marked as Resolved' });
    } finally {
      setSavingInline(false);
    }
  }

  return (
    <div className="p-3 space-y-3 rounded-2xl ring-1 ring-slate-200 bg-white">
      {/* Agent login + assignment header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600">User</label>
          <input
            className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm"
            placeholder="you@company"
            value={agent}
            onChange={(e) => saveAgent(e.target.value)}
          />
          {!!(row as any).assigned_to && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-900">
              Assigned to: {(row as any).assigned_to}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={assignToMe}
            disabled={!agent || assigning}
            className={classNames('text-xs px-2 py-1 rounded-lg ring-1', (!agent || assigning) ? 'ring-slate-200 text-slate-400' : 'ring-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100')}
            title={!agent ? 'Set your user first' : 'Assign this NDR to me'}
          >
            {assigning ? 'Assigning…' : 'Assign to me'}
          </button>
          <button
            type="button"
            onClick={resolveNow}
            disabled={savingInline}
            className={classNames('text-xs px-2 py-1 rounded-lg ring-1', savingInline ? 'ring-slate-200 text-slate-400' : 'ring-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100')}
            title="Mark this NDR as Resolved"
          >
            {savingInline ? 'Saving…' : 'Resolve'}
          </button>
        </div>
      </div>
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

      {/* Email Activity moved here (outside compose modal) */}
      <div className="mt-3 p-3 rounded-xl ring-1 ring-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="font-medium">Email Activity</div>
          <button type="button" className="text-xs px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white hover:bg-slate-100" onClick={loadEmailActivity} title="Refresh email activity">
            {activityLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {emailThread ? (
          <div className="mt-2 text-xs text-slate-600">Thread: <span className="font-mono">{emailThread.thread_id}</span>{emailThread.subject ? ` • ${emailThread.subject}` : ''}</div>
        ) : (
          <div className="mt-2 text-sm text-slate-500">No thread found yet for this order/awb.</div>
        )}
        {/* Timeline rail */}
        <div className="mt-3 relative max-h-64 overflow-auto">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
          {emailMessages.length === 0 ? (
            <div className="text-sm text-slate-500 pl-8">No messages yet.</div>
          ) : emailMessages.map((m: any) => {
            const when = fmtIST(m.received_at || m.sent_at || m.created_at);
            const isInbound = String(m.direction || '').toLowerCase() === 'inbound';
            const cleanInbound = (t: string) => {
              if (!t) return '';
              const idx = t.search(/\bOn\s+.*wrote:/i);
              return idx >= 0 ? t.slice(0, idx).trim() : t.trim();
            };
            const baseText = isInbound ? cleanInbound((m.body_text || '')) : ((m.body_text || m.subject || ''));
            const snippet = baseText.toString().split(/\r?\n/)[0].slice(0, 120);
            const isOpen = !!expandedMsg[m.id as number];
            return (
              <div key={m.id} className="relative pl-8">
                {/* Node dot */}
                <span className="absolute left-2 top-3 inline-block w-3 h-3 rounded-full bg-slate-200 ring-2 ring-white" />
                {/* Card */}
                <div className={classNames(
                  'rounded-xl ring-1 p-3',
                  isInbound ? 'bg-emerald-50 ring-emerald-300' : 'bg-blue-50 ring-blue-300'
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={classNames('text-xs px-2 py-0.5 rounded-full', isInbound ? 'bg-emerald-200 text-emerald-900' : 'bg-blue-200 text-blue-900')}>{m.direction}</span>
                    </div>
                    <div className="text-[11px] text-slate-600">{when}</div>
                  </div>
                  {/* Title/snippet row */}
                  <div className="mt-2">
                    {m.subject && <div className="text-sm font-medium text-slate-800">{m.subject}</div>}
                    <div className="mt-1 text-xs text-slate-700">{snippet}{snippet.length === 120 ? '…' : ''}</div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white hover:bg-slate-100"
                      onClick={() => setExpandedMsg((prev) => ({ ...prev, [m.id]: !prev[m.id as number] }))}
                      title={isOpen ? 'Hide details' : 'View details'}
                    >
                      {isOpen ? 'Hide details' : 'View details'}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-2">
                      {isInbound
                        ? (
                          <pre className="whitespace-pre-wrap text-xs text-slate-700">{cleanInbound(String(m.body_text || ''))}</pre>
                        )
                        : (m.body_html
                          ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: m.body_html }} />
                          : <pre className="whitespace-pre-wrap text-xs text-slate-700">{m.body_text || ''}</pre>
                        )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Reply composer */}
        <div className="mt-3">
          <label className="text-sm block">
            Reply in thread
            <textarea
              className="mt-1 w-full ring-1 ring-slate-300 rounded-lg px-3 py-2 min-h-[90px]"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Type your reply..."
            />
          </label>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!emailThread?.thread_id || sendingReply || !replyBody.trim()}
              onClick={sendReply}
              className={classNames('px-3 py-1.5 rounded-lg text-white', (sendingReply || !replyBody.trim() || !emailThread?.thread_id) ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800')}
              title={!emailThread?.thread_id ? 'No thread available' : 'Send reply'}
            >
              {sendingReply ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={savingInline}
          className={classNames(
            "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white transition",
            savingInline ? "bg-slate-500 cursor-not-allowed" : (justSaved ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-800")
          )}
          title={savingInline ? "Saving…" : (justSaved ? "Saved" : "Save NDR actions")}
        >
          {savingInline ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className={classNames("w-4 h-4", justSaved && "text-emerald-200")} />
          )}
          <span>{savingInline ? "Saving…" : (justSaved ? "Saved!" : "Save")}</span>
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
                <div className="flex items-center justify-between gap-2">
                  <span>Action to be taken (for email)</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg ring-1 ring-amber-300 bg-amber-50 hover:bg-amber-100"
                    onClick={() => fetchGeminiSuggestions('action')}
                    title="Suggest with AI"
                  >{loadingAction ? 'Suggesting…' : 'Suggest'}</button>
                </div>
                <input
                  className="mt-1 w-full ring-2 ring-amber-300 rounded-lg px-3 py-2 bg-amber-50/40"
                  value={actionToBeTaken}
                  onChange={(e) => setActionToBeTaken(e.target.value)}
                  placeholder="e.g., Please reattempt delivery tomorrow and update address landmark"
                />
                {actionSugs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {actionSugs.map((s, i) => (
                      <button key={i} type="button" className="text-xs px-2 py-1 rounded-full bg-amber-100 hover:bg-amber-200 ring-1 ring-amber-200"
                        onClick={() => setActionToBeTaken(s)} title="Use this suggestion">{s}</button>
                    ))}
                  </div>
                )}
              </label>
              <label className="block text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>Customer query (optional)</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg ring-1 ring-blue-300 bg-blue-50 hover:bg-blue-100"
                    onClick={() => fetchGeminiSuggestions('query')}
                    title="Suggest with AI"
                  >{loadingQuery ? 'Suggesting…' : 'Suggest'}</button>
                </div>
                <textarea
                  className="mt-1 w-full ring-2 ring-blue-300 rounded-lg px-3 py-2 bg-blue-50/40 min-h-[80px]"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="e.g., Customer asked to hold for 2 days / wants address change / available after 6 PM"
                />
                {querySugs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {querySugs.map((s, i) => (
                      <button key={i} type="button" className="text-xs px-2 py-1 rounded-full bg-blue-100 hover:bg-blue-200 ring-1 ring-blue-200"
                        onClick={() => setCustomerQuery(s)} title="Use this suggestion">{s}</button>
                    ))}
                  </div>
                )}
              </label>
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
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  title="Send email to courier"
                  onClick={sendMail}
                >
                  Send
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl ring-1 ring-slate-300 hover:bg-slate-50"
                  title="Copy composed email"
                  onClick={copyEmail}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl ring-1 ring-slate-300 hover:bg-slate-50"
                  title="Cancel"
                  onClick={() => setShowEmail(false)}
                >
                  Cancel
                </button>
              </div>

              {/* Email Activity removed from modal */}
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

// ---- Emails View (global inbox) ---------------------------
function EmailsView({ items, loading, onOpenOrder }: { items: any[]; loading: boolean; onOpenOrder: (orderId: number, awb?: string) => void }) {
  const [tab, setTab] = React.useState<'inbound' | 'outbound' | 'all'>('inbound');
  const visible = React.useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    if (tab === 'all') {
      // show everything, including those without order_id and regardless of assignment
      return list;
    }
    const dir = tab === 'inbound' ? 'inbound' : 'outbound';
    return list.filter((m: any) =>
      m && m.order_id && m.assigned && String(m.direction || '').toLowerCase() === dir
    );
  }, [items, tab]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setTab('inbound')} className={classNames('px-3 py-1 rounded-lg text-sm ring-1', tab==='inbound' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>Inbound</button>
        <button type="button" onClick={() => setTab('outbound')} className={classNames('px-3 py-1 rounded-lg text-sm ring-1', tab==='outbound' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>Outbound</button>
        <button type="button" onClick={() => setTab('all')} className={classNames('px-3 py-1 rounded-lg text-sm ring-1', tab==='all' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>All</button>
      </div>
      {loading ? (
        <div className="p-4 text-slate-500">Loading email activity…</div>
      ) : visible.length === 0 ? (
        <div className="p-4 text-slate-500">No email activity found.</div>
      ) : (
        <div className="overflow-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white text-sm">
            <thead>
              <tr className="text-left bg-slate-50">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">AWB</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr
                  key={`${m.__kind}-${m.id}`}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => m.order_id ? onOpenOrder(Number(m.order_id), m.waybill) : undefined}
                  title={m.order_id ? `Open Order #${m.order_id}${m.waybill ? ` • AWB ${m.waybill}` : ''}` : 'No linked order'}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmtIST(m.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={classNames('px-2.5 py-0.5 rounded-full text-xs', String(m.direction).toLowerCase()==='inbound' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700')}>
                      {String(m.direction || '').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2">{m.order_id ?? '—'}</td>
                  <td className="px-3 py-2">{m.waybill ?? '—'}</td>
                  <td className="px-3 py-2 max-w-xl truncate" title={m.subject || ''}>{m.subject || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={m.from_addr || ''}>{m.from_addr || '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={Array.isArray(m.to_addrs)? m.to_addrs.join(', ') : (m.to_addrs || '')}>{Array.isArray(m.to_addrs)? m.to_addrs.join(', ') : (m.to_addrs || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Analytics View (minimal placeholder) -----------------
function AnalyticsView({ rows, allRows }: { rows: (NdrRow & any)[]; allRows: (NdrRow & any)[] }) {
  // Local filters for analytics
  const allCouriers = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) set.add(courierName(r.courier_account));
    return ["All", ...Array.from(set).filter(Boolean).sort()];
  }, [allRows]);
  const allBuckets = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) set.add((r as any).__bucket || "Other");
    return ["All", ...Array.from(set).filter(Boolean).sort()];
  }, [allRows]);

  const [aCourier, setACourier] = useState<string>("All");
  const [aBucket, setABucket] = useState<string>("All");

  const aRows = useMemo(() => {
    return rows.filter((r) => {
      const c = courierName(r.courier_account);
      const b = (r as any).__bucket || "Other";
      return (aCourier === "All" || c === aCourier) && (aBucket === "All" || b === aBucket);
    });
  }, [rows, aCourier, aBucket]);

  // KPI metrics
  const metrics = useMemo(() => {
    const total = aRows.length;
    const byCourier: Record<string, number> = {};
    const byBucket: Record<string, number> = {};
    for (const r of aRows) {
      const c = courierName(r.courier_account) || "—";
      byCourier[c] = (byCourier[c] || 0) + 1;
      const b = (r as any).__bucket || "Other";
      byBucket[b] = (byBucket[b] || 0) + 1;
    }
    return { total, byCourier, byBucket };
  }, [aRows]);

  // Time series by event day
  const lineOptions = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of aRows) {
      const d = r.event_time ? new Date(r.event_time) : null;
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      map[key] = (map[key] || 0) + 1;
    }
    const categories = Object.keys(map).sort();
    const data = categories.map((k) => map[k]);
    const opts: Highcharts.Options = {
      title: { text: "Shipments over time" },
      xAxis: { categories },
      yAxis: { title: { text: "Count" } },
      series: [{ type: "line", name: "Shipments", data }],
      credits: { enabled: false },
    };
    return opts;
  }, [aRows]);

  // Pie by bucket
  const pieOptions = useMemo(() => {
    const data = Object.entries(metrics.byBucket).map(([name, y]) => ({ name, y }));
    const opts: Highcharts.Options = {
      title: { text: "By Bucket" },
      series: [
        {
          type: "pie",
          name: "Shipments",
          data,
        },
      ],
      credits: { enabled: false },
    };
    return opts;
  }, [metrics.byBucket]);

  // Bar by courier
  const barOptions = useMemo(() => {
    const entries = Object.entries(metrics.byCourier).sort((a, b) => b[1] - a[1]);
    const categories = entries.map((e) => e[0]);
    const data = entries.map((e) => e[1]);
    const opts: Highcharts.Options = {
      chart: { type: "column" },
      title: { text: "By Courier" },
      xAxis: { categories, title: { text: "Courier" } },
      yAxis: { title: { text: "Count" } },
      series: [{ type: "column", name: "Shipments", data }],
      credits: { enabled: false },
    };
    return opts;
  }, [metrics.byCourier]);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Filtered Shipments" value={metrics.total} icon={Info} />
        <Stat label="Total (All)" value={allRows.length} icon={Columns} />
        <Stat label="Couriers" value={Object.keys(metrics.byCourier).length} icon={Truck} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2 bg-white">
          <span className="text-sm text-slate-500">Courier</span>
          <select className="bg-transparent text-sm outline-none" value={aCourier} onChange={(e) => setACourier(e.target.value)} aria-label="Analytics courier filter" title="Analytics courier filter">
            {allCouriers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2 bg-white">
          <span className="text-sm text-slate-500">Bucket</span>
          <select className="bg-transparent text-sm outline-none" value={aBucket} onChange={(e) => setABucket(e.target.value)} aria-label="Analytics bucket filter" title="Analytics bucket filter">
            {allBuckets.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={pieOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={barOptions} />
        </div>
      </div>
      <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
        <HighchartsReact highcharts={Highcharts} options={lineOptions} />
      </div>
    </div>
  );
}
