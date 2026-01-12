import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, Play, RefreshCcw, Search, AlertTriangle, Loader2, Phone, ExternalLink,
  Filter, X, ChevronLeft, ChevronRight, Info, Download, Plus
} from 'lucide-react';
import OrderDetailsDialog from './OrderDetailsDialog';
import { SUPABASE_URL, sbHeadersObj as sbHeaders, supabase } from '../lib/supabaseClient';

/** ---------------------------------------------------------
 * Types
 * --------------------------------------------------------- */
interface RepeatRow {
  email: string;
  phone: string;
  order_count: number;
  order_ids: string[];
  order_numbers: string[];
  first_order: string;
  last_order: string;
  call_status: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  team_id: number | null;
}

// NocoDB feedback structure for repeat campaign analytics (from provided API)
interface NocoRepeatRow {
  Id?: number;
  Date?: string; // yyyy-mm-dd
  order_number?: string | null;
  customer_phone?: string | null;
  agent?: string | null;
  call_status?: string | null;
  heard_from?: string | null;
  first_time_reason?: string | null;
  reorder_reason?: string | null;
  liked_features?: string | null;
  usage_recipe?: string | null;
  usage_time?: string | null;
  monthly_subscriptions?: string | null;
  // Additional fields for extended Customer Insights
  age?: string | number | null;
  gender?: string | null;
  marital_status?: string | null;
  profession_text?: string | null;
  city?: string | null;
  new_product_expectation?: string | null;
  family_user?: string | null;
}

// Feedback row (call_feedback table). Keep keys optional to be resilient to schema diff.
interface FeedbackRow {
  id?: string;
  created_at?: string;
  agent?: string | null;
  // Optional columns we may display if present
  order_number?: string | number | null;
  customer_phone?: string | null;
  call_status?: string | null;
  heard_from?: string | null;
  gender?: string | null;
  gender_text?: string | null;
  age?: string | null;
  wouldRecommend?: string | null;
  would_recommend?: string | null;
  monthlyDelivery?: string | null;
  monthly_delivery?: string | null;
  firstTimeReason?: string | null;
  first_time_reason?: string | null;
  reorderReason?: string | null;
  reorder_reason?: string | null;
  likedFeatures?: string | null;
  liked_features?: string | null;
  userProfile?: string | null;
  user_profile?: string | null;
}

/** ---------------------------------------------------------
 * Utilities
 * --------------------------------------------------------- */
const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

const formatDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString() : '—';

const toNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const statusColor = (s?: string | null) => {
  const key = (s || 'Not Called').toLowerCase();
  if (key === 'called') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (key === 'busy') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (key === 'cancelled') return 'text-slate-700 bg-slate-50 border-slate-200';
  if (key === 'no response') return 'text-rose-700 bg-rose-50 border-rose-200';
  if (
    key === 'wrong number' || key === 'invalid number' ||
    key === 'dnp1' || key === 'dnp 1' ||
    key === 'dnp2' || key === 'dnp 2' ||
    key === 'dnp3' || key === 'dnp 3' ||
    key === 'dnp4' || key === 'dnp 4'
  ) return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-gray-700 bg-gray-50 border-gray-200'; // Not Called / default
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

/** Small primitive wrappers (optional, keep UI consistent) */
const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'default' | 'danger' }
> = ({ className, tone = 'default', children, ...props }) => {
  const styles =
    tone === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed'
      : tone === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed'
      : 'border hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed';
  return (
    <button
      {...props}
      className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-lg transition', styles, className)}
    >
      {children}
    </button>
  );
};

/** ---------------------------------------------------------
 * Component
 * --------------------------------------------------------- */
export default function RepeatDashboard() {
  /** Supabase headers are centralized */

  /** Identity (persisted by NDR app) */
  const [session] = useState<string>(() => {
    try {
      return localStorage.getItem('ndr_session') || '';
    } catch {
      return '';
    }
  });

  const [currentUser] = useState<string>(() => {
    try {
      return localStorage.getItem('ndr_user') || '';
    } catch {
      return '';
    }
  });
  // Admin flag (after currentUser)
  const isAdmin = useMemo(() => String(currentUser || '').trim().toLowerCase() === 'admin', [currentUser]);
  const [activeTeamId] = useState<string>(() => {
    try {
      return localStorage.getItem('ndr_active_team_id') || '';
    } catch {
      return '';
    }
  });

  /** UI state */
  const [rows, setRows] = useState<RepeatRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [callMsg, setCallMsg] = useState<string>('');
  const [callTone, setCallTone] = useState<'success'|'error'|'info'|''>('');
  const [q, setQ] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [maxOrders, setMaxOrders] = useState<string>('');
  const [filterFilled, setFilterFilled] = useState<string>(''); // '' | 'filled' | 'not_filled'
  // Admin-only: member filter by assigned_to
  const [memberFilter, setMemberFilter] = useState<string>('');
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  // Manual assignment
  const [assignMember, setAssignMember] = useState<string>('');
  const [assigning, setAssigning] = useState<boolean>(false);
  const [allocationType, setAllocationType] = useState<'manual' | 'percentage' | 'equally'>('manual');
  const [allocationPercent, setAllocationPercent] = useState<string>('50');
  // Misc UI state
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [lastRunAt, setLastRunAt] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');

  /** View: list vs analytics */
  const [view, setView] = useState<'leads' | 'analytics'>('leads');
  // Non-Repeated Dashboard state
  const [nrRows, setNrRows] = useState<any[]>([]);
  const [nrLoading, setNrLoading] = useState<boolean>(false);
  const [nrError, setNrError] = useState<string>('');
  const [nrFrom, setNrFrom] = useState<string>('');
  const [nrTo, setNrTo] = useState<string>('');
  // Non-Repeated pivot controls
  const [nrPivotPage, setNrPivotPage] = useState<number>(1);
  const [nrPivotPageSize, setNrPivotPageSize] = useState<number>(15);
  const [nrShowStatusTable, setNrShowStatusTable] = useState<boolean>(false);
  const [nrShowAgentTable, setNrShowAgentTable] = useState<boolean>(false);
  const [nrShowReasonTable, setNrShowReasonTable] = useState<boolean>(false);
  const [nrPivotFilterStatus, setNrPivotFilterStatus] = useState('');
  const [nrPivotSortStatus, setNrPivotSortStatus] = useState<'name'|'total'>('total');
  const [nrPivotDirStatus, setNrPivotDirStatus] = useState<'asc'|'desc'>('desc');
  const [nrPivotFilterAgent, setNrPivotFilterAgent] = useState('');
  const [nrPivotSortAgent, setNrPivotSortAgent] = useState<'name'|'total'>('total');
  const [nrPivotDirAgent, setNrPivotDirAgent] = useState<'asc'|'desc'>('desc');
  const [nrPivotFilterReason, setNrPivotFilterReason] = useState('');
  const [nrPivotSortReason, setNrPivotSortReason] = useState<'name'|'total'>('total');
  const [nrPivotDirReason, setNrPivotDirReason] = useState<'asc'|'desc'>('desc');
  const [nrPivotColsStatus, setNrPivotColsStatus] = useState<string[] | null>(null);
  const [nrPivotColsAgent, setNrPivotColsAgent] = useState<string[] | null>(null);
  const [nrPivotColsReason, setNrPivotColsReason] = useState<string[] | null>(null);
  // Non-Repeated drilldown
  const [nrDrillOpen, setNrDrillOpen] = useState(false);
  const [nrDrillTitle, setNrDrillTitle] = useState('');
  const [nrDrillRows, setNrDrillRows] = useState<any[]>([]);
  const [nrDrillPage, setNrDrillPage] = useState(1);
  const [nrDrillPageSize, setNrDrillPageSize] = useState(20);
  // Non-Repeated grouping state (for Agent Text Report Q1/Q2)
  const [nrGrouping, setNrGrouping] = useState<Record<string, Record<string, string>>>(() => {
    try { const s = localStorage.getItem('nr_grouping_v1'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [nrGroupDefs, setNrGroupDefs] = useState<Record<string, string[]>>(() => {
    try { const s = localStorage.getItem('nr_groupdefs_v1'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [nrGroupOpen, setNrGroupOpen] = useState<{ key: string | null }>({ key: null });
  const [nrGroupNewName, setNrGroupNewName] = useState<string>('');
  const [nrGroupAddInput, setNrGroupAddInput] = useState<Record<string, string>>({});
  const [nrGroupUngroupedQuery, setNrGroupUngroupedQuery] = useState<string>('');
  // Feedback analytics state
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [fbAgent, setFbAgent] = useState<string>('all'); // 'me' | 'all'
  const [fbFrom, setFbFrom] = useState<string>('');
  const [fbTo, setFbTo] = useState<string>('');
  // NocoDB analytics state (kept separate; admin-only view)
  const [ncRows, setNcRows] = useState<NocoRepeatRow[]>([]);
  const [ncFrom, setNcFrom] = useState<string>('');
  const [ncTo, setNcTo] = useState<string>('');
  const [ncLoading, setNcLoading] = useState<boolean>(false);
  const [ncError, setNcError] = useState<string>('');
  const [ncShowAll, setNcShowAll] = useState<Record<string, boolean>>({});
  // Grouping state (per table key): category -> group name
  const [ncGrouping, setNcGrouping] = useState<Record<string, Record<string, string>>>({});
  const [ncGroupOpen, setNcGroupOpen] = useState<{ key: keyof NocoRepeatRow | null } >({ key: null });
  const [ncGroupNewName, setNcGroupNewName] = useState<string>('');
  const [ncGroupAddInput, setNcGroupAddInput] = useState<Record<string, string>>({});
  // Explicit group name definitions so empty groups can exist
  const [ncGroupDefs, setNcGroupDefs] = useState<Record<string, string[]>>({});
  // Group dialog: search filter for ungrouped list
  const [ncGroupUngroupedQuery, setNcGroupUngroupedQuery] = useState<string>('');
  // NocoDB: tab + batch update state
  const [ncTab, setNcTab] = useState<'insights' | 'batch'>('insights');
  const [ncBatchInput, setNcBatchInput] = useState<string>('');
  const [ncBatchLog, setNcBatchLog] = useState<string>('');
  const [ncBatchRunning, setNcBatchRunning] = useState<boolean>(false);
  const [ncBatchStats, setNcBatchStats] = useState<{updated:number;missing:number;failed:number}>({updated:0,missing:0,failed:0});
  const [ncBatchField, setNcBatchField] = useState<string>('monthly_subscriptions');
  const [ncBatchCustomField, setNcBatchCustomField] = useState<string>('');
  const [ncBatchType, setNcBatchType] = useState<'auto'|'boolean'|'number'|'string'>('auto');
  const [ncBatchValue, setNcBatchValue] = useState<string>('true');
  // Noco token (local override or provided default)
  const nocoToken = useMemo(() => {
    try { return localStorage.getItem('nocodb_token') || 'CdD-fhN2ctMOe-rOGWY5g7ET5BisIDx5r32eJMn4'; } catch { return 'CdD-fhN2ctMOe-rOGWY5g7ET5BisIDx5r32eJMn4'; }
  }, []);

  // New Product Expectation free-text classifier
  const categorizeNPE = useCallback((raw: string): string => {
    const s0 = String(raw || '').trim();
    if (!s0) return '(Empty)';
    const s = s0.toLowerCase();
    // empties / no idea
    if (/(^|\b)(no idea|nothing|none|as of now nothing|na|n\/a)(\b|$)/.test(s)) return 'No idea';
    // fast/instant drinks
    if (/(abc\s*malt|malt|horlicks|boost|instant|ready\s*to\s*use|no\s*boil)/.test(s)) return 'Instant malt / energy drink';
    // weight
    if (/weight\s*loss|diet/.test(s)) return 'Weight loss';
    if (/weight\s*gain/.test(s)) return 'Weight gain';
    // baby/kids
    if (/(baby|babies|kids|children|cerelac|infant)/.test(s)) return 'Baby/Kids products';
    // hair/skin
    if (/(hair|shampoo|dandruff|hairfall|hair fall|hair oil|natural dye)/.test(s)) return 'Hair care';
    if (/(skin|face ?wash|serum|cosmetic|pimple|sunscreen)/.test(s)) return 'Skin care / cosmetics';
    // conditions
    if (/(diabet|sugar patient|\bbp\b|blood pressure)/.test(s)) return 'Diabetic/BP friendly';
    if (/(hemoglobin|haemoglobin|blood count|iron)/.test(s)) return 'Hemoglobin / iron';
    if (/(protein|multi ?vitamin|calcium|bone strength)/.test(s)) return 'Protein / multivitamin / calcium';
    if (/(pain|knee|joint|leg pain|nerves|thiliyam|thylam|move\b)/.test(s)) return 'Pain relief / bone & nerve';
    // food/snacks/breakfast
    if (/(snack|laddu|ladoo|choco|chocolate|candy|biscuit|sweet)/.test(s)) return 'Healthy snacks / sweets';
    if (/(breakfast|idli|dosa|puttu|kanji|saadham|rice mix|ragi malt|semiya|upma)/.test(s)) return 'Breakfast mixes';
    // sweeteners
    if (/(honey|jaggery|karupatti|brown sugar|gulkhand)/.test(s)) return 'Natural sweeteners';
    // herbal/ayurvedic
    if (/(herbal|ayur|mooligai)/.test(s)) return 'Herbal / Ayurvedic';
    // cooling/heat
    if (/(cool|heat reduce|body heat)/.test(s)) return 'Cooling / heat reduce';
    // women’s health
    if (/(women|period|menstru)/.test(s)) return "Women’s health";
    // household toiletry
    if (/(tooth\s*paste|toothpaste|soap)/.test(s)) return 'Natural soaps / toothpaste';
    // improvements
    if (/(sprout|more ingredients|improve ingredient|improve current)/.test(s)) return 'Improve current product';
    if (/(delivery\s*speed|fast delivery)/.test(s)) return 'Improve delivery';
    // quality/packaging feedback
    if (/(package|packaging|packing|cardboard|quality|damage|stone)/.test(s)) return 'Quality / packaging feedback';
    // fallback: sentence case
    return s0.charAt(0).toUpperCase() + s0.slice(1);
  }, []);

  

  // Agent filter for the filled leads table (client-side)
  const [fbAgentFilter, setFbAgentFilter] = useState<string>('');
  // Analytics: Filled leads table pagination
  const [fbListPage, setFbListPage] = useState<number>(1);
  const [fbListPageSize, setFbListPageSize] = useState<number>(50);
  // NocoDB Insights drilldown
  const [ncDrillOpen, setNcDrillOpen] = useState<boolean>(false);
  const [ncDrillTitle, setNcDrillTitle] = useState<string>('');
  const [ncDrillRows, setNcDrillRows] = useState<NocoRepeatRow[]>([]);
  const [ncDrillPage, setNcDrillPage] = useState<number>(1);
  const [ncDrillPageSize, setNcDrillPageSize] = useState<number>(20);
  // Agent-wise aggregation of feedback (current loaded scope/date)
  const fbByAgent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of feedback) {
      const a = String(f.agent || '—').trim() || '—';
      counts[a] = (counts[a] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  }, [feedback]);

  // Filtered feedback list for the table
  const filteredFeedback = useMemo(() => {
    if (!fbAgentFilter) return feedback;
    const want = fbAgentFilter.trim().toLowerCase();
    return feedback.filter(f => String(f.agent || '').trim().toLowerCase() === want);
  }, [feedback, fbAgentFilter]);

  // Export agent summary CSV
  const exportAgentSummary = useCallback(() => {
    const rows = [['Agent','Count'], ...fbByAgent.map(([a,c]) => [a, String(c)])];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent_summary_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fbByAgent]);

  // Force non-admins to stay on 'leads'
  useEffect(() => {
    if (!isAdmin && view === 'analytics') {
      setView('leads');
    }
  }, [isAdmin, view]);

  // Load Non-Repeated data from NocoDB
  const loadNonRepeated = useCallback(async () => {
    try {
      setNrLoading(true); setNrError('');
      const base = 'https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mqbw6pkcd8gxuhp/records';
      const limit = 500;
      let offset = 0; const out: any[] = [];
      while (true) {
        const params = new URLSearchParams();
        params.set('offset', String(offset));
        params.set('limit', String(limit));
        params.set('viewId', 'vww5ym2wgborsava');
        const url = `${base}?${params.toString()}`;
        const res = await fetch(url, { headers: { 'xc-token': nocoToken } });
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        const list = Array.isArray(payload?.list) ? payload.list : [];
        out.push(...list);
        if (list.length < limit) break;
        offset += limit; if (offset > 100000) break;
      }
      setNrRows(out);
    } catch (e: any) {
      setNrRows([]); setNrError(e?.message || 'Failed to load Non-Repeated data');
    } finally { setNrLoading(false); }
  }, [nocoToken]);

  useEffect(() => {
    if (isAdmin) loadNonRepeated();
  }, [isAdmin, loadNonRepeated]);

  // Quick date helpers for Non-Repeated section
  const applyNrQuick = (key: string) => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth()+1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth()-1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const minus = (n:number) => new Date(today.getFullYear(), today.getMonth(), today.getDate()-n);
    const fmt = (d: Date) => d.toISOString().slice(0,10);
    switch (key) {
      case 'today': setNrFrom(fmt(today)); setNrTo(fmt(today)); break;
      case 'yesterday': { const y=minus(1); setNrFrom(fmt(y)); setNrTo(fmt(y)); break; }
      case 'last7': setNrFrom(fmt(minus(6))); setNrTo(fmt(today)); break;
      case 'last14': setNrFrom(fmt(minus(13))); setNrTo(fmt(today)); break;
      case 'last30': setNrFrom(fmt(minus(29))); setNrTo(fmt(today)); break;
      case 'thisMonth': setNrFrom(fmt(startOfMonth)); setNrTo(fmt(endOfMonth)); break;
      case 'lastMonth': setNrFrom(fmt(startOfLastMonth)); setNrTo(fmt(endOfLastMonth)); break;
      default: setNrFrom(''); setNrTo('');
    }
  };

  // Filter Non-Repeated rows by date
  const nrFiltered = useMemo(() => {
    return nrRows.filter((r: any) => {
      // Non-repeated dataset uses 'Timestamp' (YYYY-MM-DD) for date
      const raw = (r && (r.Timestamp ?? r['Timestamp'])) || '';
      const d = String(raw).slice(0, 10);
      if (nrFrom && d < nrFrom) return false;
      if (nrTo && d > nrTo) return false;
      return true;
    });
  }, [nrRows, nrFrom, nrTo]);

  // Note: agentOptions was unused; removed to avoid lint

  /** Pagination */
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  // Analytics: selected feedback for details dialog
  const [fbDetail, setFbDetail] = useState<FeedbackRow | null>(null);

  /** Selection for export */
  const makeKey = useCallback((r: RepeatRow) => `${r.email}__${r.phone}`, []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const isSelected = useCallback((r: RepeatRow) => !!selected[makeKey(r)], [selected, makeKey]);
  const toggleRow = useCallback((r: RepeatRow) => {
    const k = makeKey(r);
    setSelected(prev => ({ ...prev, [k]: !prev[k] }));
  }, [makeKey]);
  // togglePageAll and exportLeads are declared after pageSlice/filtered are defined

  /** Debounced search */
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const qRef = useRef<number>();
  useEffect(() => {
    window.clearTimeout(qRef.current);
    qRef.current = window.setTimeout(() => setDebouncedQuery(q.trim().toLowerCase()), 250);
    return () => window.clearTimeout(qRef.current);
  }, [q]);

  /** Load assigned */
  const loadAssigned = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!session || !currentUser || !activeTeamId) {
        setRows([]);
        setError('Login via NDR and set an active team to view your assigned repeat customers.');
        return;
      }
      const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_repeat_orders_with_assignments`;
      const isAdmin = String(currentUser || '').trim().toLowerCase() === 'admin';
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: sbHeaders,
        // For admin, request all by sending nulls (RPC should treat nulls as no filter)
        body: JSON.stringify({
          p_team_id: isAdmin ? null : Number(activeTeamId),
          p_agent: isAdmin ? null : currentUser,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`get_repeat_orders_with_assignments ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as RepeatRow[] | unknown;
      const arr: RepeatRow[] = Array.isArray(data) ? (data as RepeatRow[]) : [];
      
      // Auto-populate call_status based on assigned_at
      const withStatus = arr.map(r => {
        const hasAssignedAt = String(r.assigned_at || '').trim() !== '';
        return {
          ...r,
          call_status: hasAssignedAt ? 'Called' : 'Not Called'
        };
      });
      
      if (isAdmin) {
        // Admin sees all rows returned by RPC
        setRows(withStatus);
      } else {
        // Hard agent filter on client to avoid showing others' leads even if RPC returns broader set
        const want = String(currentUser || '').trim().toLowerCase();
        const teamNum = Number(activeTeamId) || undefined;
        const mine = withStatus.filter(r => {
          const a = String(r.assigned_to || '').trim().toLowerCase();
          const tOk = teamNum ? Number(r.team_id || 0) === teamNum : true;
          return a === want && tOk;
        });
        setRows(mine);
      }
      setPage(1); // reset to first page after refresh
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Failed to load assigned repeat customers.');
    } finally {
      setLoading(false);
    }
  }, [SUPABASE_URL, sbHeaders, session, currentUser, activeTeamId]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  // Load team members for member filter (admin only)
  useEffect(() => {
    (async () => {
      if (!isAdmin) { setTeamMembers([]); return; }
      const tid = String(activeTeamId || '').trim();
      if (!tid) { setTeamMembers([]); return; }
      try {
        const url = `${SUPABASE_URL}/rest/v1/team_members?team_id=eq.${encodeURIComponent(tid)}&select=member&order=member.asc`;
        const res = await fetch(url, { headers: sbHeaders });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Array<{ member?: string }>;
        const uniq = Array.from(new Set((data || []).map(r => String(r.member || '').trim()).filter(Boolean)));
        setTeamMembers(uniq);
      } catch {
        setTeamMembers([]);
      }
    })();
  }, [isAdmin, activeTeamId, SUPABASE_URL, sbHeaders]);

  /** Allocation */
  const runAllocation = useCallback(async () => {
    if (!activeTeamId) return;
    try {
      setLoading(true);
      setError('');
      const rpc = `${SUPABASE_URL}/rest/v1/rpc/allocate_repeat_orders_percent_v1`;
      const res = await fetch(rpc, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          p_team_id: Number(activeTeamId),
          p_batch_limit: 500,
          p_tag_team_when_null: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`allocate_repeat_orders_percent_v1 ${res.status}: ${txt}`);
      }
      setLastRunAt(new Date().toISOString());
      await loadAssigned();
    } catch (e: any) {
      setError(e?.message || 'Allocation failed.');
    } finally {
      setLoading(false);
    }
  }, [SUPABASE_URL, sbHeaders, activeTeamId, loadAssigned]);

  const filledOrderNumbersSet = useMemo(() => {
    const out = new Set<string>();
    for (const r of ncRows) {
      const d = (r.Date || '').slice(0, 10);
      if (ncFrom && d < ncFrom) continue;
      if (ncTo && d > ncTo) continue;
      const n = String((r as any).order_number ?? '').trim();
      if (n) out.add(n);
    }
    return out;
  }, [ncRows, ncFrom, ncTo]);

  /** Filtering */
  const filtered = useMemo(() => {
    // Admin: see all rows. Non-admin: only their own assigned leads.
    const baseUser = isAdmin ? rows : rows.filter((r) => String(r.assigned_to || '') === currentUser);

    // Admin member filter by assigned_to
    const memberFiltered = isAdmin && memberFilter
      ? baseUser.filter(r => String(r.assigned_to || '') === memberFilter)
      : baseUser;

    const textFiltered = debouncedQuery
      ? memberFiltered.filter((r) => {
          const hay = [r.email, r.phone, ...(r.order_numbers || [])]
            .join(' ')
            .toLowerCase();
          return hay.includes(debouncedQuery);
        })
      : memberFiltered;

    const byStatus = filterStatus
      ? filterStatus === 'Not Called'
        ? textFiltered.filter((r) => !r.call_status || r.call_status === 'Not Called')
        : textFiltered.filter((r) => (r.call_status || '') === filterStatus)
      : textFiltered;

    const byFrom = filterFrom
      ? byStatus.filter(
          (r) => r.last_order && new Date(r.last_order) >= new Date(`${filterFrom}T00:00:00`)
        )
      : byStatus;

    const byTo = filterTo
      ? byFrom.filter(
          (r) => r.last_order && new Date(r.last_order) <= new Date(`${filterTo}T23:59:59.999`)
        )
      : byFrom;

    const min = minOrders ? toNumber(minOrders) : undefined;
    const max = maxOrders ? toNumber(maxOrders) : undefined;

    const byCount = byTo.filter((r) => {
      const c = r.order_count || 0;
      if (typeof min === 'number' && c < min) return false;
      if (typeof max === 'number' && c > max) return false;
      return true;
    });

    const byFilled = filterFilled
      ? byCount.filter((r) => {
          const nums = (r.order_numbers || []).map((x) => String(x).trim()).filter(Boolean);
          const isFilled = nums.some((n) => filledOrderNumbersSet.has(n));
          return filterFilled === 'filled' ? isFilled : !isFilled;
        })
      : byCount;

    return byFilled;
  }, [rows, isAdmin, memberFilter, currentUser, debouncedQuery, filterStatus, filterFrom, filterTo, minOrders, maxOrders, filterFilled, filledOrderNumbersSet]);

  /** Analytics */
  const stats = useMemo(() => {
    // Local NocoDB filter by date (avoid referencing ncFiltered before it's declared)
    const ncFilteredForStats = ncRows.filter(r => {
      const d = (r.Date || '').slice(0,10);
      if (ncFrom && d < ncFrom) return false;
      if (ncTo && d > ncTo) return false;
      return true;
    });
    const filledOrders = new Set(
      ncFilteredForStats
        .map(r => String((r as any).order_number ?? '').trim())
        .filter(Boolean)
    );

    const totalCustomers = filtered.length;
    const totalOrders = filtered.reduce((s, r) => s + (r.order_count || 0), 0);
    const avgPerCust = totalCustomers ? totalOrders / totalCustomers : 0;

    // Assigned = has assigned_at (currently represented by call_status === 'Called')
    const assigned = filtered.filter((r) => (r.call_status || '') === 'Called').length;
    const notAssigned = totalCustomers - assigned;
    const assignedPct = totalCustomers ? Math.round((assigned / totalCustomers) * 100) : 0;

    // Form filled (NocoDB) metrics - order-number based
    const filledMatchedCustomers = filtered.filter(r => {
      const nums = (r.order_numbers || []).map((x) => String(x).trim()).filter(Boolean);
      return nums.some((n) => filledOrders.has(n));
    }).length;
    const filledPct = totalCustomers ? Math.round((filledMatchedCustomers / totalCustomers) * 100) : 0;
    const notFilledCustomers = totalCustomers - filledMatchedCustomers;
    const notFilledPct = totalCustomers ? Math.round((notFilledCustomers / totalCustomers) * 100) : 0;

    return {
      totalCustomers,
      totalOrders,
      avgPerCust,
      assigned,
      notAssigned,
      assignedPct,
      filledCustomers: filledMatchedCustomers,
      notFilledCustomers,
      filledPct,
      notFilledPct,
      filledRecords: ncFilteredForStats.length,
    };
  }, [filtered, ncRows, ncFrom, ncTo]);

  /** Pagination slice */
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const pageSlice = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  const togglePageAll = useCallback(() => {
    const allSelected = pageSlice.every(isSelected);
    setSelected(prev => {
      const next = { ...prev } as Record<string, boolean>;
      pageSlice.forEach(r => { next[makeKey(r)] = !allSelected; });
      return next;
    });
  }, [pageSlice, isSelected, makeKey]);

  const exportLeads = useCallback(() => {
    const rowsToExport = filtered.filter(r => isSelected(r));
    const data = rowsToExport.length ? rowsToExport : filtered;
    const headers = [
      'email','phone','order_count','order_numbers','first_order','last_order','assigned_to','call_status','team_id'
    ];
    const lines = [headers.join(',')];
    data.forEach(r => {
      const values = [
        r.email || '',
        r.phone || '',
        String(r.order_count ?? ''),
        (r.order_numbers || []).join('|'),
        r.first_order || '',
        r.last_order || '',
        r.assigned_to || '',
        r.call_status || '',
        r.team_id != null ? String(r.team_id) : ''
      ];
      const escaped = values.map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(escaped.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repeat-leads-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filtered, isSelected]);

  /** Manual assignment of selected leads */
  const assignSelected = useCallback(async () => {
    // For Equally mode, we don't need a single agent selection
    if (allocationType !== 'equally') {
      const handle = String(assignMember || '').trim();
      if (!handle) return;
    }
    
    // Determine which rows to assign based on allocation type
    let rowsToAssign: RepeatRow[] = [];
    
    if (allocationType === 'manual') {
      // Manual: only selected rows
      rowsToAssign = filtered.filter(r => isSelected(r));
    } else if (allocationType === 'percentage') {
      // Percentage: take X% of filtered rows
      const pct = Math.max(0, Math.min(100, Number(allocationPercent) || 0));
      const count = Math.floor((filtered.length * pct) / 100);
      rowsToAssign = filtered.slice(0, count);
    } else if (allocationType === 'equally') {
      // Equally: distribute all filtered rows evenly across all team members
      rowsToAssign = filtered;
    }
    
    if (rowsToAssign.length === 0) {
      setCallMsg('No leads to assign. Please select leads or adjust allocation settings.');
      setCallTone('error');
      return;
    }
    
    try {
      setAssigning(true);
      const tid = Number(activeTeamId) || null;
      const nowIso = new Date().toISOString();
      
      if (allocationType === 'equally') {
        // Distribute leads evenly across all team members (excluding admin)
        const eligibleAgents = teamMembers.filter(m => String(m).toLowerCase() !== 'admin');
        
        if (eligibleAgents.length === 0) {
          setCallMsg('No team members available for equal distribution (admin excluded).');
          setCallTone('error');
          return;
        }
        
        let totalAssigned = 0;
        let totalFailed = 0;
        const results: string[] = [];
        
        // Distribute rows round-robin across eligible agents
        for (let i = 0; i < eligibleAgents.length; i++) {
          const memberRows = rowsToAssign.filter((_, idx) => idx % eligibleAgents.length === i);
          if (memberRows.length === 0) continue;
          
          const orderIds = Array.from(new Set(
            memberRows.flatMap(r => (r.order_numbers || []).map(n => String(n).trim()).filter(Boolean))
          ));
          
          // Debug: log sample order IDs
          if (i === 0) {
            console.log('Sample order IDs being assigned:', orderIds.slice(0, 10));
            console.log('Total order IDs for this agent:', orderIds.length);
          }
          
          const { data, error } = await supabase.rpc('assign_orders_by_number', {
            p_order_numbers: orderIds,
            p_assigned_to: eligibleAgents[i],
            p_assigned_at: nowIso,
            p_team_id: tid
          });
          
          // Debug: log response
          if (i === 0) {
            console.log('RPC response:', { data, error, dataLength: Array.isArray(data) ? data.length : 0 });
          }
          
          if (!error) {
            const count = Array.isArray(data) ? data.length : 0;
            totalAssigned += count;
            results.push(`${eligibleAgents[i]}: ${count}`);
          } else {
            console.error(`Assignment error for ${eligibleAgents[i]}:`, {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
              fullError: error
            });
            totalFailed += orderIds.length;
          }
        }
        
        await loadAssigned();
        setSelected({});
        setCallMsg(`Equally distributed ${totalAssigned} orders across ${eligibleAgents.length} agents. ${results.join(', ')}${totalFailed ? ` (${totalFailed} failed)` : ''}`);
        setCallTone('success');
      } else {
        // Manual or Percentage: assign to single selected agent
        const handle = String(assignMember || '').trim();
        const orderIds = Array.from(new Set(
          rowsToAssign.flatMap(r => (r.order_numbers || []).map(n => String(n).trim()).filter(Boolean))
        ));

        if (orderIds.length === 0) {
          setCallMsg('No order IDs found in the selected rows.');
          setCallTone('error');
          return;
        }

        const { data, error } = await supabase.rpc('assign_orders_by_number', {
          p_order_numbers: orderIds,
          p_assigned_to: handle,
          p_assigned_at: nowIso,
          p_team_id: tid
        });

        if (error) {
          throw new Error(`Assign RPC failed: ${error.message}`);
        }

        const okCount = Array.isArray(data) ? data.length : 0;
        const failCount = orderIds.length - okCount;

        if (okCount === 0) {
          const sample = orderIds.slice(0, 10).join(', ');
          throw new Error(`Assign failed: no matching orders found in orders_All for order numbers. Sample: ${sample}`);
        }

        await loadAssigned();
        setSelected({});
        setAssignMember('');
        const totalOrders = rowsToAssign.reduce((s, r) => s + ((r.order_numbers || []).length || 0), 0);
        setCallMsg(`Assigned ${okCount} / ${totalOrders} order(s) to ${handle}${failCount ? ` (${failCount} failed)` : ''}`);
        setCallTone('success');
      }
    } catch (e: any) {
      console.error('Failed to assign leads:', e);
      setCallMsg('Failed to assign selected leads. Please try again.');
      setCallTone('error');
    } finally {
      setAssigning(false);
    }
  }, [assignMember, filtered, isSelected, activeTeamId, loadAssigned, setCallMsg, setCallTone, allocationType, allocationPercent, teamMembers]);

  /** Actions */
  const handleCall = useCallback(async (custNumber: string) => {
    setCallMsg('Initiating call...');
    setCallTone('info');
    try {
      if (!session || !currentUser || !activeTeamId) {
        setCallMsg('Login and set a team to place calls.');
        setCallTone('error');
        return;
      }
      const clean = String(custNumber || '').replace(/\D/g, '');
      if (clean.length < 10) {
        setCallMsg('Invalid customer number.');
        setCallTone('error');
        return;
      }

      // Fetch agent exenumber (phone) from team_members (case-insensitive match on member)
      const tmUrl = `${SUPABASE_URL}/rest/v1/team_members?select=member,phone&team_id=eq.${encodeURIComponent(String(activeTeamId))}`;
      const tmRes = await fetch(tmUrl, { headers: sbHeaders });
      if (!tmRes.ok) {
        const t = await tmRes.text();
        throw new Error(`team_members ${tmRes.status}: ${t}`);
      }
      let tmRows = (await tmRes.json()) as Array<{ member?: string; phone?: string | number }>;
      const want = String(currentUser || '').trim().toLowerCase();
      let row = tmRows.find(r => String(r.member || '').trim().toLowerCase() === want);
      if (!row) {
        const tmAllUrl = `${SUPABASE_URL}/rest/v1/team_members?select=member,phone`;
        const tmAllRes = await fetch(tmAllUrl, { headers: sbHeaders });
        if (tmAllRes.ok) {
          tmRows = (await tmAllRes.json()) as Array<{ member?: string; phone?: string | number }>;
          row = tmRows.find(r => String(r.member || '').trim().toLowerCase() === want);
        }
      }
      const exenumber = (row?.phone ?? '').toString();
      if (!exenumber || exenumber.replace(/\D/g, '').length < 6) {
        setCallMsg(`Your agent phone (exenumber) is not configured in team_members for user "${currentUser}" (team ${activeTeamId}).`);
        setCallTone('error');
        return;
      }

      // Mcube outbound call
      const mcubeUrl = 'https://api.mcube.com/Restmcube-api/outbound-calls';
      const mcubeAuth = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJUSEVfQ0xBSU0iLCJhdWQiOiJUSEVfQVVESUVOQ0UiLCJpYXQiOjE3NTY4ODkxNjcsImV4cF9kYXRhIjoxNzg4NDI1MTY3LCJkYXRhIjp7ImJpZCI6Ijc3MjQifX0.fPDu0Kt-AbnnLGsHJ_LdJfiP970viKCD3eRSDVCSzdo';
      const mcubeRes = await fetch(mcubeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: mcubeAuth },
        body: JSON.stringify({ exenumber, custnumber: clean, refurl: '1' }),
      });
      let payload: any = null;
      try { payload = await mcubeRes.json(); } catch { /* ignore */ }
      if (mcubeRes.ok) {
        setCallMsg('Call initiated successfully.');
        setCallTone('success');
      } else {
        const txt = payload?.message || (await mcubeRes.text());
        setCallMsg(`Failed to initiate call: ${txt || mcubeRes.status}`);
        setCallTone('error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCallMsg(`Failed to initiate call: ${msg}`);
      setCallTone('error');
    }
  }, [SUPABASE_URL, sbHeaders, session, currentUser, activeTeamId]);

  const resetFilters = () => {
    setFilterStatus('');
    setFilterFrom('');
    setFilterTo('');
    setMinOrders('');
    setMaxOrders('');
    setQ('');
    setPage(1);
  };

  /** Load call_feedback for Analytics view */
  const loadFeedback = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      // Use wildcard select to be resilient to snake_case/camelCase differences
      params.set('select', '*');
      // Note: some deployments of call_feedback may not have team_id.
      // To avoid 42703 (column does not exist), we do NOT filter by team_id here.
      if (fbAgent === 'me' && currentUser) params.set('agent', `eq.${encodeURIComponent(currentUser)}`);
      if (fbFrom) params.set('created_at', `gte.${fbFrom}T00:00:00Z`);
      if (fbTo) params.append('created_at', `lte.${fbTo}T23:59:59Z`);
      const url = `${SUPABASE_URL}/rest/v1/call_feedback?${params.toString()}`;
      const res = await fetch(url, { headers: sbHeaders });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`call_feedback ${res.status}: ${t}`);
      }
      const data = await res.json();
      setFeedback(Array.isArray(data) ? data : []);
    } catch (e) {
      // Keep it silent in UI, we can add banner later
      setFeedback([]);
      console.error(e);
    }
  }, [SUPABASE_URL, sbHeaders, activeTeamId, currentUser, fbAgent, fbFrom, fbTo]);

  useEffect(() => {
    if (view === 'analytics') loadFeedback();
  }, [view, loadFeedback]);

  // Quick date helpers for NocoDB section
  const ncFmt = (d: Date) => d.toISOString().slice(0,10);
  const applyNcQuick = (key: string) => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth()+1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth()-1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const minus = (n:number) => new Date(today.getFullYear(), today.getMonth(), today.getDate()-n);
    switch (key) {
      case 'today': setNcFrom(ncFmt(today)); setNcTo(ncFmt(today)); break;
      case 'yesterday': { const y=minus(1); setNcFrom(ncFmt(y)); setNcTo(ncFmt(y)); break; }
      case 'last7': setNcFrom(ncFmt(minus(6))); setNcTo(ncFmt(today)); break;
      case 'last14': setNcFrom(ncFmt(minus(13))); setNcTo(ncFmt(today)); break;
      case 'last30': setNcFrom(ncFmt(minus(29))); setNcTo(ncFmt(today)); break;
      case 'thisMonth': setNcFrom(ncFmt(startOfMonth)); setNcTo(ncFmt(endOfMonth)); break;
      case 'lastMonth': setNcFrom(ncFmt(startOfLastMonth)); setNcTo(ncFmt(endOfLastMonth)); break;
      default: setNcFrom(''); setNcTo('');
    }
  };

  // Load NocoDB survey analytics
  const loadNocoRepeat = useCallback(async () => {
    try {
      setNcLoading(true); setNcError('');
      const base = 'https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/msq21u3ocxnx01h/records';
      const limit = 500;
      let offset = 0; const out: NocoRepeatRow[] = [];
      while (true) {
        const params = new URLSearchParams();
        params.set('offset', String(offset));
        params.set('limit', String(limit));
        params.set('viewId', 'vwa5an0z8yt3lizk');
        // We pull all and filter client-side by date to be safe with view constraints
        const url = `${base}?${params.toString()}`;
        const res = await fetch(url, { headers: { 'xc-token': nocoToken } });
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        const list = Array.isArray(payload?.list) ? payload.list : [];
        out.push(...list as NocoRepeatRow[]);
        if (list.length < limit) break;
        offset += limit; if (offset > 100000) break;
      }
      setNcRows(out);
    } catch (e: any) {
      setNcRows([]); setNcError(e?.message || 'Failed to load NocoDB analytics');
    } finally { setNcLoading(false); }
  }, []);

  useEffect(() => {
    // Load NocoDB rows so Filled/Not Filled works for all users in Leads view
    if ((view === 'analytics' || view === 'leads') && !ncLoading && ncRows.length === 0) {
      loadNocoRepeat();
    }
    // load grouping from localStorage once (admin only)
    if (isAdmin) {
      try {
        const raw = localStorage.getItem('nc_grouping_v1');
        if (raw) setNcGrouping(JSON.parse(raw));
        const defs = localStorage.getItem('nc_groupdefs_v1');
        if (defs) setNcGroupDefs(JSON.parse(defs));
      } catch (e) { console.warn('Failed to load grouping from localStorage', e); }
    }
  }, [view, isAdmin, loadNocoRepeat, ncLoading, ncRows.length]);

  // Batch update: set monthly_subscriptions=true for pasted order_numbers
  const runNcBatchUpdate = useCallback(async () => {
    if (ncBatchRunning) return;
    const baseUrl = 'https://app-nocodb.9krcxo.easypanel.host';
    const tableId = 'msq21u3ocxnx01h';
    const viewId = 'vwa5an0z8yt3lizk';
    const raw = ncBatchInput.trim();
    if (!raw) { setNcBatchLog('Paste order numbers first.'); return; }
    const targetField = (ncBatchField === '__custom__' ? ncBatchCustomField.trim() : ncBatchField).trim();
    if (!targetField) { setNcBatchLog('Select a field (or enter a custom field) to update.'); return; }
    const parseValue = () => {
      if (ncBatchType === 'boolean' || (ncBatchType === 'auto' && /^(true|false|1|0)$/i.test(ncBatchValue.trim()))) {
        const s = ncBatchValue.trim().toLowerCase();
        return s === 'true' || s === '1';
      }
      if (ncBatchType === 'number' || (ncBatchType === 'auto' && /^-?\d+(\.\d+)?$/.test(ncBatchValue.trim()))) {
        return Number(ncBatchValue.trim());
      }
      return ncBatchValue;
    };
    const valueToSet: any = parseValue();
    // parse order numbers by newline/comma/space
    const parts = raw.split(/[\s,\n\r\t]+/).map(s=>s.trim()).filter(Boolean);
    if (!parts.length) { setNcBatchLog('No valid order numbers found.'); return; }
    setNcBatchRunning(true);
    setNcBatchLog('Starting...');
    setNcBatchStats({updated:0,missing:0,failed:0});
    let updated=0, missing=0, failed=0;
    const logs: string[] = [];
    try {
      for (const num of parts) {
        // lookup
        const where = `(order_number,eq,${encodeURIComponent(num)})`;
        const url = `${baseUrl}/api/v2/tables/${tableId}/records?limit=1&viewId=${viewId}&where=${where}`;
        let recJson: any = null;
        try {
          const res = await fetch(url, { headers: { 'xc-token': nocoToken, 'accept': 'application/json' }});
          recJson = await res.json();
        } catch (e) {
          logs.push(`Lookup failed for ${num}: ${String(e)}`);
          failed++; continue;
        }
        const id = recJson?.list?.[0]?.Id ?? recJson?.list?.[0]?.id;
        if (!id) { logs.push(`Not found: ${num}`); missing++; continue; }
        // Patch each record: prefer array-payload per NocoDB docs, fallback to where(order_number)
        const patchArrayById = async (idVal: string | number) => {
          const url = `${baseUrl}/api/v2/tables/${tableId}/records`;
          const resp = await fetch(url, {
            method: 'PATCH',
            headers: { 'xc-token': nocoToken, 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify([{ Id: idVal, [targetField]: valueToSet }])
          });
          const text = await resp.text();
          return { resp, text };
        };
        const patchWhereOrder = async (orderVal: string | number) => {
          const isNum = /^\d+$/.test(String(orderVal));
          const whereRaw = isNum ? `(order_number,eq,${orderVal})` : `(order_number,eq,"${String(orderVal).replace(/"/g,'\\"')}")`;
          const url = `${baseUrl}/api/v2/tables/${tableId}/records?where=${encodeURIComponent(whereRaw)}`;
          const resp = await fetch(url, {
            method: 'PATCH',
            headers: { 'xc-token': nocoToken, 'Content-Type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify({ [targetField]: valueToSet })
          });
          const text = await resp.text();
          return { resp, text };
        };
        try {
          // 1) Preferred: PATCH by where(order_number)
          let { resp, text } = await patchWhereOrder(num);
          let method = 'where(order_number)';
          if (!resp.ok) {
            // 2) Fallback: official array PATCH by Id
            const alt = await patchArrayById(id);
            resp = alt.resp; text = alt.text; method = 'array-by-id';
          }
          if (resp.ok) { logs.push(`Updated order_number=${num} (id=${id}) via ${method} — set ${targetField}=${String(valueToSet)}`); updated++; }
          else { logs.push(`Patch failed for ${num} (id=${id}) — HTTP ${resp.status}: ${text || '(no body)'} (method tried: ${method})`); failed++; }
        } catch (e) { logs.push(`Patch error for ${num} (id=${id}): ${String(e)}`); failed++; }
        setNcBatchLog(logs.slice(-200).join('\n'));
        setNcBatchStats({updated,missing,failed});
      }
    } finally {
      setNcBatchRunning(false);
      setNcBatchLog(prev => prev + `\nDone. Updated: ${updated}, Missing: ${missing}, Failed: ${failed}`);
      setNcBatchStats({updated,missing,failed});
      await loadNocoRepeat();
    }
  }, [ncBatchInput, nocoToken, ncBatchRunning, loadNocoRepeat, ncBatchField, ncBatchCustomField, ncBatchType, ncBatchValue]);

  // Filter Noco rows by date
  const ncFiltered = useMemo(() => {
    return ncRows.filter(r => {
      const d = (r.Date || '').slice(0,10);
      if (ncFrom && d < ncFrom) return false;
      if (ncTo && d > ncTo) return false;
      return true;
    });
  }, [ncRows, ncFrom, ncTo]);

  // Drill into a grouped label by expanding its member categories
  const openNcGroupDrill = useCallback((key: keyof NocoRepeatRow, groupLabel: string, members: string[]) => {
    let rows: NocoRepeatRow[] = [];
    if (key === 'age') {
      const bucket = (raw: string | number | null | undefined) => {
        const n = Number(String(raw || '').replace(/[^0-9]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return '(Empty)';
        if (n < 20) return '<20';
        if (n < 25) return '20-25';
        if (n < 30) return '25-30';
        if (n < 35) return '30-35';
        if (n < 40) return '35-40';
        if (n < 45) return '40-45';
        if (n < 50) return '45-50';
        if (n < 60) return '50-60';
        return '60+';
      };
      rows = ncFiltered.filter(r => members.includes(bucket((r as any).age)));
    } else if (key === 'gender') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        if (['m','male','man','boy','gent'].includes(s)) return 'Male';
        if (['f','female','woman','girl','lady'].includes(s)) return 'Female';
        return s.charAt(0).toUpperCase()+s.slice(1);
      };
      rows = ncFiltered.filter(r => members.includes(norm((r as any).gender)));
    } else if (key === 'marital_status') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        if (s.includes('married')) return 'Married';
        if (s.includes('single') || s.includes('unmarried') || s.includes('not married')) return 'Unmarried';
        return s.charAt(0).toUpperCase()+s.slice(1);
      };
      rows = ncFiltered.filter(r => members.includes(norm((r as any).marital_status)));
    } else if (key === 'profession_text') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim();
        return s ? s.replace(/\s{2,}/g,' ') : '(Empty)';
      };
      rows = ncFiltered.filter(r => members.includes(norm((r as any).profession_text)));
    } else if (key === 'city') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        return s.split(' ').map(w=>w? (w[0].toUpperCase()+w.slice(1)) : w).join(' ');
      };
      rows = ncFiltered.filter(r => members.includes(norm((r as any).city)));
    } else if (key === 'new_product_expectation') {
      const norm = (v: string | null | undefined) => categorizeNPE(String(v || '').replace(/\s{2,}/g,' ').trim());
      rows = ncFiltered.filter(r => norm((r as any).new_product_expectation) === groupLabel);
    } else if (key === 'agent') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim();
        return s || '(Empty)';
      };
      rows = ncFiltered.filter(r => norm((r as any).agent) === groupLabel);
    } else {
      rows = ncFiltered.filter(r => getStableLabel(key, String((r as any)[key] ?? '')) === groupLabel);
    }
    setNcDrillRows(rows);
    setNcDrillTitle(`Group — ${groupLabel}`);
    setNcDrillOpen(true);
  }, [ncFiltered]);

  // Early catalog helper (used by stable labeler below)
  const getCatalogEarly = useCallback((key: keyof NocoRepeatRow): Array<{label: string; keys: string[]}> => {
    return {
      usage_recipe: [
        { label: 'Milk-based / Health mix drink', keys: ['milk', 'with milk', 'milk &', 'health mix drink', 'hot milk', 'milk and water'] },
        { label: 'Water-based', keys: ['water', 'with water', 'hot water', 'warm water'] },
        { label: 'Other recipes', keys: ['ladoo','laddu','dosa','pancake','chapati','roti','kozhuk','kanji','porridge','cookie','recipe','jaggery','with jaggery','with sugar','with salt'] },
        { label: 'Health mix drink', keys: ['health mix'] },
      ],
      liked_features: [
        { label: 'Taste / Flavor', keys: ['taste','flavor','flavour','good taste','aroma','smell','fresh'] },
        { label: 'Energy / Feel better', keys: ['energetic','energy','active','activeness','stamina','feel better','feeling better','no tired','no tiredness','freshness','morning'] },
        { label: 'Health / Immunity', keys: ['health','immunity','improve','improvement','benefit','benefits','digestion','constipation','acidity','gas','diabetes','sugar','cholesterol','weight'] },
        { label: 'No preservatives / Natural', keys: ['no preserv','no preservatives','no added sugar','natural','no chemicals','organic','natural ingredients'] },
        { label: 'Convenience / Easy to prepare', keys: ['easy','convenient','ready to use','prepare','time saving','instant','quick','ready mix'] },
        { label: 'Pain relief', keys: ['pain','relief'] },
        { label: 'Quality / Packaging', keys: ['quality','packaging','overall','fresh','freshness','value for money','price','cost'] },
        { label: 'Price / Value', keys: ['price','cost','value for money','affordable','worth','cheap','expensive'] },
        { label: 'No specific feature', keys: ['no specific','nothing specific'] },
      ],
      first_time_reason: [
        { label: 'Trust / Promotion / Brand', keys: ['trust','promotion','brand','aurawill','theneer','idaivalai','channel','insta','instagram','facebook','social media','offer','promo','influencer','reel','shorts','status','page'] },
        { label: 'Try new / Curiosity', keys: ['try','something new','simply tried','trial','first time','just trying','sample'] },
        { label: 'Ingredients (36) / Saw ingredients', keys: ['36 ingredient','36 ingredients','ingredients','saw ingred','36 items','36 herbs'] },
        { label: 'Advertisement seen', keys: ['advert','ad','ads','advertisement','youtube','you tube','yt','seen in','sponsored','promo','reel','shorts'] },
        { label: 'Health reasons', keys: ['health','wellness','condition','benefit','immunity','digestion','diabetes','cholesterol'] },
        { label: 'No specific reason', keys: ['no specific'] },
      ],
      reorder_reason: [
        { label: 'Health benefits / Improvement', keys: ['health','energetic','energy','improvement','benefit','benefits','improved'] },
        { label: 'Good quality / Taste', keys: ['good','quality','taste','aroma','flavor','flavour','fresh'] },
        { label: 'Replacement (tea/coffee) / Healthy alternative', keys: ['replace','tea','coffee','healthy alternative','instead of','breakfast','morning drink'] },
        { label: 'Natural / No side effects', keys: ['natural','no side','side effect','no chemicals','organic'] },
        { label: 'Ease of use / Liked by family', keys: ['family','children','kids','liked','wife','husband','parents'] },
        { label: 'Recommended / Family ordered', keys: ['recommend','recommended','family ordered','suggested','doctor','friend','relative'] },
        { label: 'Trust / Brand belief', keys: ['trust','brand'] },
        { label: 'No specific reason', keys: ['no specific','just trying'] },
      ],
      monthly_subscriptions: [
        { label: 'Yes (Interested)', keys: ['true','yes','interested','agree'] },
        { label: 'Not now / Undecided', keys: ['not now','undecided','maybe','later'] },
        { label: 'No (Not interested)', keys: ['no','not interested','decline'] },
      ],
    }[key as string] || [];
  }, []);

  // Stable labeling: build per-field label maps once per dataset
  const ncLabelMapByKey = useMemo(() => {
    const stop = new Set(['the','a','an','and','or','to','of','for','in','on','at','is','are','be','been','with','by','it','as','this','that','from','use','using','like','very','good','best','nice','also','because','but','so','i','we','he','she','they','you','my','our']);
    const normalize = (s: string) => (s||'')
      .toLowerCase()
      .replace(/\b(you\s*tube)\b/g, 'youtube')
      .replace(/[^a-z0-9\s]/g,' ')
      .replace(/\s{2,}/g,' ')
      .trim();
    const tokenize = (s: string) => normalize(s).split(' ').filter(t=>t && t.length>=3 && !stop.has(t));

    const buildForKey = (key: keyof NocoRepeatRow) => {
      const raws = ncFiltered.map(r => String(r[key] ?? ''));
      const labelMap = new Map<string,string>();
      const cat = getCatalogEarly(key);
      const catalogTerms = new Set(cat.flatMap(c=>c.keys));

      // 1) Curated pass with simple scoring: count matched phrases/tokens
      for (const raw of raws) {
        const text = normalize(raw);
        const toks = tokenize(raw);
        let bestLabel = '';
        let bestScore = 0;
        for (const rule of cat) {
          let score = 0;
          for (const k of rule.keys) {
            if (text.includes(k)) score += 2; // phrase/substring weight
            if (toks.includes(k)) score += 1; // token weight
          }
          if (score > bestScore) { bestScore = score; bestLabel = rule.label; }
        }
        if (bestScore > 0) labelMap.set(raw, bestLabel);
      }
      // Remainder pool
      const others = raws.filter(r => !labelMap.has(r));

      // 2) Dynamic phrase (bi/tri-gram) and token frequencies
      const phraseFreq = new Map<string, number>();
      const tokenFreq = new Map<string, number>();
      const ngrams = (toks: string[]) => {
        const arr: string[] = [];
        for (let i=0;i<toks.length;i++) {
          if (i+1 < toks.length) arr.push(`${toks[i]} ${toks[i+1]}`);
          if (i+2 < toks.length) arr.push(`${toks[i]} ${toks[i+1]} ${toks[i+2]}`);
        }
        return arr;
      };
      for (const raw of others) {
        const toks = tokenize(raw).filter(t => !catalogTerms.has(t));
        const tokSet = new Set(toks);
        for (const t of tokSet) tokenFreq.set(t, (tokenFreq.get(t)||0)+1);
        const phSet = new Set(ngrams(toks));
        for (const p of phSet) phraseFreq.set(p, (phraseFreq.get(p)||0)+1);
      }
      // 3) Assign dynamic labels deterministically (prefer phrases)
      for (const raw of others) {
        const toks = tokenize(raw).filter(t => !catalogTerms.has(t));
        const phs = ngrams(toks);
        let best = ''; let bestCount = 0;
        for (const p of phs) {
          const c = phraseFreq.get(p)||0;
          if (c > bestCount || (c===bestCount && p < best)) { best = p; bestCount = c; }
        }
        if (!best) {
          for (const t of toks) {
            const c = tokenFreq.get(t)||0;
            if (c > bestCount || (c===bestCount && t < best)) { best = t; bestCount = c; }
          }
        }
        const cap = (s: string) => s ? s.split(' ').map(w=>w? (w[0].toUpperCase()+w.slice(1)) : w).join(' ') : s;
        const label = best ? cap(best) : (raw.trim().slice(0,30) || 'Misc');
        labelMap.set(raw, label);
      }
      return labelMap;
    };

    return {
      first_time_reason: buildForKey('first_time_reason'),
      reorder_reason: buildForKey('reorder_reason'),
      liked_features: buildForKey('liked_features'),
      usage_recipe: buildForKey('usage_recipe'),
      monthly_subscriptions: buildForKey('monthly_subscriptions'),
    } as Record<keyof NocoRepeatRow, Map<string,string>>;
  }, [ncFiltered, getCatalogEarly]);

  const getStableLabel = useCallback((key: keyof NocoRepeatRow, raw: string): string => {
    if (key === 'call_status') {
      const s = String(raw || '').trim();
      if (!s) return 'Not Called';
      // keep canonical casing for common values
      if (s.toLowerCase() === 'not called') return 'Not Called';
      if (s.toLowerCase() === 'called') return 'Called';
      return s;
    }
    const map = (ncLabelMapByKey as any)[key] as Map<string,string> | undefined;
    const lbl = map?.get(raw);
    if (lbl && lbl.length) return lbl;
    const snip = (raw || '').trim().slice(0, 30);
    return snip || '(Empty)';
  }, [ncLabelMapByKey]);

  // Canonical category mapping by keywords (case-insensitive includes)
  const categorize = useCallback((key: keyof NocoRepeatRow, raw: string): string => {
    const sFull = (raw || '').trim().toLowerCase();
    if (!sFull || sFull === '-' || sFull === 'na' || sFull === 'n/a') return '(Empty)';
    // tokenize to catch partial matches in long sentences
    const parts = sFull
      .replace(/[,;|/]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .split(' ');
    const s = ` ${sFull} `; // pad for includes safety

    // keyword catalogs per field
    const catalogs: Record<string, Array<{label: string; keys: string[]}>> = {
      usage_recipe: [
        { label: 'Milk-based / Health mix drink', keys: ['milk', 'with milk', 'milk &', 'health mix drink', 'hot milk', 'milk and water'] },
        { label: 'Water-based', keys: ['water', 'with water', 'hot water', 'warm water'] },
        { label: 'Other recipes', keys: ['ladoo','laddu','dosa','pancake','chapati','roti','kozhuk','kanji','porridge','cookie','recipe','jaggery','with jaggery','with sugar','with salt'] },
        { label: 'Health mix drink', keys: ['health mix'] },
      ],
      liked_features: [
        { label: 'Taste / Flavor', keys: ['taste','flavor','flavour','good taste','aroma','smell','fresh'] },
        { label: 'Energy / Feel better', keys: ['energetic','energy','active','activeness','stamina','feel better','feeling better','no tired','no tiredness','freshness','morning'] },
        { label: 'Health / Immunity', keys: ['health','immunity','improve','improvement','benefit','benefits','digestion','constipation','acidity','gas','diabetes','sugar','cholesterol','weight'] },
        { label: 'No preservatives / Natural', keys: ['no preserv','no preservatives','no added sugar','natural','no chemicals','organic','natural ingredients'] },
        { label: 'Convenience / Easy to prepare', keys: ['easy','convenient','ready to use','prepare','time saving','instant','quick','ready mix'] },
        { label: 'Pain relief', keys: ['pain','relief'] },
        { label: 'Quality / Packaging', keys: ['quality','packaging','overall','fresh','freshness','value for money','price','cost'] },
        { label: 'Price / Value', keys: ['price','cost','value for money','affordable','worth','cheap','expensive'] },
        { label: 'No specific feature', keys: ['no specific','nothing specific'] },
      ],
      first_time_reason: [
        { label: 'Trust / Promotion / Brand', keys: ['trust','promotion','brand','aurawill','theneer','idaivalai','channel','insta','instagram','facebook','social media','offer','promo','influencer','reel','shorts','status','page'] },
        { label: 'Try new / Curiosity', keys: ['try','something new','simply tried','trial','first time','just trying','sample'] },
        { label: 'Ingredients (36) / Saw ingredients', keys: ['36 ingredient','36 ingredients','ingredients','saw ingred','36 items','36 herbs'] },
        { label: 'Advertisement seen', keys: ['advert','ad','ads','advertisement','youtube','you tube','yt','seen in','sponsored','promo','reel','shorts'] },
        { label: 'Health reasons', keys: ['health','wellness','condition','benefit','immunity','digestion','diabetes','cholesterol'] },
        { label: 'No specific reason', keys: ['no specific'] },
      ],
      reorder_reason: [
        { label: 'Health benefits / Improvement', keys: ['health','energetic','energy','improvement','benefit','benefits','improved'] },
        { label: 'Good quality / Taste', keys: ['good','quality','taste','aroma','flavor','flavour','fresh'] },
        { label: 'Replacement (tea/coffee) / Healthy alternative', keys: ['replace','tea','coffee','healthy alternative','instead of','breakfast','morning drink'] },
        { label: 'Natural / No side effects', keys: ['natural','no side','side effect','no chemicals','organic'] },
        { label: 'Ease of use / Liked by family', keys: ['family','children','kids','liked','wife','husband','parents'] },
        { label: 'Recommended / Family ordered', keys: ['recommend','recommended','family ordered','suggested','doctor','friend','relative'] },
        { label: 'Trust / Brand belief', keys: ['trust','brand'] },
        { label: 'No specific reason', keys: ['no specific','just trying'] },
      ],
      monthly_subscriptions: [
        { label: 'Yes (Interested)', keys: ['true','yes','interested','agree'] },
        { label: 'Not now / Undecided', keys: ['not now','undecided','maybe','later'] },
        { label: 'No (Not interested)', keys: ['no','not interested','decline'] },
      ],
    };

    const cat = catalogs[key as string];
    if (cat && cat.length) {
      for (const c of cat) {
        if (c.keys.some(k => s.includes(k))) return c.label;
        // attempt token-level match
        if (c.keys.some(k => parts.includes(k))) return c.label;
      }
      return 'Others';
    }
    return raw || '(Empty)';
  }, []);

  // Provide access to catalogs for summarization (after ncFiltered/categorize exist)
  const getCatalog = useCallback((key: keyof NocoRepeatRow): Array<{label: string; keys: string[]}> => {
    return {
      usage_recipe: [
        { label: 'Milk-based / Health mix drink', keys: ['milk', 'with milk', 'milk &', 'health mix drink'] },
        { label: 'Water-based', keys: ['water', 'with water'] },
        { label: 'Other recipes', keys: ['ladoo','dosa','pancake','chapati','kozhuk','kanji','recipe'] },
        { label: 'Health mix drink', keys: ['health mix'] },
      ],
      liked_features: [
        { label: 'Taste / Flavor', keys: ['taste','flavor','good taste'] },
        { label: 'Energy / Feel better', keys: ['energetic','energy','active','stamina','feel better','feeling better','no tired','no tiredness'] },
        { label: 'Health / Immunity', keys: ['health','immunity','improve','benefit','digestion'] },
        { label: 'No preservatives / Natural', keys: ['no preserv','no added sugar','natural'] },
        { label: 'Convenience / Easy to prepare', keys: ['easy','convenient','ready to use','prepare'] },
        { label: 'Pain relief', keys: ['pain','relief'] },
        { label: 'Quality / Packaging', keys: ['quality','packaging','overall'] },
        { label: 'No specific feature', keys: ['no specific','nothing specific'] },
      ],
      first_time_reason: [
        { label: 'Trust / Promotion / Brand', keys: ['trust','promotion','brand','aurawill','theneer','idaivalai','channel','insta','instagram','facebook','yt','youtube'] },
        { label: 'Try new / Curiosity', keys: ['try','something new','simply tried','trial'] },
        { label: 'Ingredients (36) / Saw ingredients', keys: ['36 ingredient','36 ingredients','ingredients','saw ingred'] },
        { label: 'Advertisement seen', keys: ['advert','ad','youtube','you tube','yt','seen in'] },
        { label: 'Health reasons', keys: ['health','wellness','condition','benefit'] },
        { label: 'No specific reason', keys: ['no specific'] },
      ],
      reorder_reason: [
        { label: 'Health benefits / Improvement', keys: ['health','energetic','improvement','benefit'] },
        { label: 'Good quality / Taste', keys: ['good','quality','taste'] },
        { label: 'Replacement (tea/coffee) / Healthy alternative', keys: ['replace','tea','coffee','healthy alternative'] },
        { label: 'Natural / No side effects', keys: ['natural','no side','side effect'] },
        { label: 'Ease of use / Liked by family', keys: ['family','children','liked'] },
        { label: 'Recommended / Family ordered', keys: ['recommend','family ordered','suggested'] },
        { label: 'Trust / Brand belief', keys: ['trust','brand'] },
        { label: 'No specific reason', keys: ['no specific','just trying'] },
      ],
      monthly_subscriptions: [
        { label: 'Yes (Interested)', keys: ['true','yes','interested','agree'] },
        { label: 'Not now / Undecided', keys: ['not now','undecided','maybe','later'] },
        { label: 'No (Not interested)', keys: ['no','not interested','decline'] },
      ],
    }[key as string] || [];
  }, []);

  // Compute top keyword hints for a given category label
  const summarizeCategory = useCallback((key: keyof NocoRepeatRow, label: string): string[] => {
    const cat = getCatalogEarly(key);
    const keysPool = label === 'Others'
      ? Array.from(new Set(cat.flatMap(c => c.keys)))
      : (cat.find(c => c.label === label)?.keys || []);
    if (!keysPool.length) return [];
    const freq: Record<string, number> = {};
    for (const r of ncFiltered) {
      if (categorize(key, String(r[key] ?? '')) !== label) continue;
      const s = ` ${(String(r[key] ?? '').toLowerCase())} `;
      for (const k of keysPool) {
        if (s.includes(k)) freq[k] = (freq[k] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(([k])=>k);
  }, [ncFiltered, categorize, getCatalogEarly]);

  // Generic aggregator for count and percentage
  const makeCountTable = useCallback((key: keyof NocoRepeatRow) => {
    const counts = new Map<string, number>();
    for (const r of ncFiltered) {
      const raw = String(r[key] ?? '');
      const label = getStableLabel(key, raw);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const total = ncFiltered.length || 1;
    const rows = Array.from(counts.entries())
      .sort((a,b)=>b[1]-a[1])
      .map(([name,count])=>({ name, count, pct: Math.round((count/total)*1000)/10 }));
    return { total: ncFiltered.length, rows };
  }, [ncFiltered, getStableLabel]);

  // Open drilldown for a given category
  const openNcDrill = useCallback((key: keyof NocoRepeatRow, label: string) => {
    let rows: NocoRepeatRow[];
    if (key === 'age') {
      const bucket = (raw: string | number | null | undefined) => {
        const n = Number(String(raw || '').replace(/[^0-9]/g, ''));
        if (!Number.isFinite(n) || n <= 0) return '(Empty)';
        if (n < 20) return '<20';
        if (n < 25) return '20-25';
        if (n < 30) return '25-30';
        if (n < 35) return '30-35';
        if (n < 40) return '35-40';
        if (n < 45) return '40-45';
        if (n < 50) return '45-50';
        if (n < 60) return '50-60';
        return '60+';
      };
      rows = ncFiltered.filter(r => bucket((r as any).age) === label);
    } else if (key === 'gender') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        if (['m','male','man','boy','gent'].includes(s)) return 'Male';
        if (['f','female','woman','girl','lady'].includes(s)) return 'Female';
        return s.charAt(0).toUpperCase()+s.slice(1);
      };
      rows = ncFiltered.filter(r => norm((r as any).gender) === label);
    } else if (key === 'marital_status') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        if (s.includes('married')) return 'Married';
        if (s.includes('single') || s.includes('unmarried') || s.includes('not married')) return 'Unmarried';
        return s.charAt(0).toUpperCase()+s.slice(1);
      };
      rows = ncFiltered.filter(r => norm((r as any).marital_status) === label);
    } else if (key === 'profession_text') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim();
        return s ? s.replace(/\s{2,}/g,' ') : '(Empty)';
      };
      rows = ncFiltered.filter(r => norm((r as any).profession_text) === label);
    } else if (key === 'city') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return '(Empty)';
        return s.split(' ').map(w=>w? (w[0].toUpperCase()+w.slice(1)) : w).join(' ');
      };
      rows = ncFiltered.filter(r => norm((r as any).city) === label);
    } else if (key === 'new_product_expectation') {
      const norm = (v: string | null | undefined) => categorizeNPE(String(v || '').replace(/\s{2,}/g,' ').trim());
      rows = ncFiltered.filter(r => norm((r as any).new_product_expectation) === label);
    } else if (key === 'agent') {
      const norm = (v: string | null | undefined) => {
        const s = String(v || '').trim();
        return s || '(Empty)';
      };
      rows = ncFiltered.filter(r => norm((r as any).agent) === label);
    } else {
      rows = ncFiltered.filter(r => getStableLabel(key, String((r as any)[key] ?? '')) === label);
    }
    setNcDrillRows(rows);
    const title =
      key === 'first_time_reason' ? `First Time Purchase Reason — ${label}` :
      key === 'reorder_reason' ? `Reorder Reason — ${label}` :
      key === 'liked_features' ? `Liked Feature — ${label}` :
      key === 'usage_recipe' ? `Usage / Recipe — ${label}` :
      key === 'monthly_subscriptions' ? `Subscription Status — ${label}` :
      `${String(key)} — ${label}`;
    setNcDrillTitle(title);
    setNcDrillPage(1);
    setNcDrillOpen(true);
  }, [ncFiltered, categorize, getCatalog]);

  // Feedback metrics and simple chart data
  const fbStats = useMemo(() => {
    const pick = (...vals: Array<string | null | undefined>) => {
      for (const v of vals) {
        if (v && typeof v === 'string' && v.length) return v;
      }
      return '';
    };
    const totalForms = feedback.length;
    const todayISO = new Date().toISOString().slice(0,10);
    const today = feedback.filter(f => (f.created_at||'').slice(0,10) === todayISO).length;
    const last7 = feedback.filter(f => {
      if (!f.created_at) return false;
      const d = new Date(f.created_at).getTime();
      return d >= Date.now() - 7*24*3600*1000;
    }).length;
    const recommendYes = feedback.filter(f => pick(f.wouldRecommend, f.would_recommend).toLowerCase() === 'yes').length;
    const monthlyYes = feedback.filter(f => pick(f.monthlyDelivery, f.monthly_delivery).toLowerCase() === 'yes').length;
    // Buckets for a simple bar chart: gender
    const genderCounts: Record<string, number> = {};
    feedback.forEach(f => {
      const g = pick(f.gender, f.gender_text) || 'Unknown';
      genderCounts[g] = (genderCounts[g]||0)+1;
    });
    // likedFeatures top tokens (basic split by comma)
    const featureCounts: Record<string, number> = {};
    feedback.forEach(f => {
      const s = pick(f.likedFeatures, f.liked_features);
      s.split(',').map((x: string)=>x.trim()).filter(Boolean).forEach((tok: string) => {
        featureCounts[tok] = (featureCounts[tok]||0)+1;
      });
    });
    const featureTop = Object.entries(featureCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    return { totalForms, today, last7, recommendYes, monthlyYes, genderCounts, featureTop };
  }, [feedback]);

  /** ---------------------------------------------------------
   * Render
   * --------------------------------------------------------- */
  return (
    <div className="p-3 md:p-5 space-y-4">
      {/* Header & tabs */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Repeat Dashboard</div>
          <div className="text-sm text-gray-600">
            Assigned repeat customers for the logged-in agent
          </div>

          
          <div className="mt-2 text-xs md:text-sm text-gray-700 flex flex-wrap items-center gap-3">
            <div>
              <span className="text-gray-500">User:</span>{' '}
              <strong className="font-medium">{currentUser || '—'}</strong>
            </div>
            <div>
              <span className="text-gray-500">Team:</span>{' '}
              <strong className="font-medium">{activeTeamId || '—'}</strong>
            </div>
            <div className="flex items-center gap-1 text-emerald-700">
              <ShieldCheck className="w-4 h-4" /> Session: {session ? 'active' : 'not set'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border overflow-hidden mr-2">
            <button onClick={()=>setView('leads')} className={clsx('px-3 py-2 text-sm', view==='leads' ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-gray-50')}>Leads</button>
            <button onClick={()=>setView('analytics')} className={clsx('px-3 py-2 text-sm', view==='analytics' ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-gray-50')}>Analytics</button>
          </div>
          <IconButton
            onClick={runAllocation}
            tone="primary"
            disabled={!session || !activeTeamId || loading}
            title={!session || !activeTeamId ? 'Login & set team to run' : 'Run allocation now'}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run allocation
          </IconButton>

          <IconButton onClick={loadAssigned} disabled={loading} title="Refresh">
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </IconButton>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-9 gap-3">
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Total Customers</div>
            <div className="text-2xl font-semibold">{stats.totalCustomers}</div>
          </div>
          <div className="text-blue-500 text-xl">👤</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Total Repeat Orders</div>
            <div className="text-2xl font-semibold">{stats.totalOrders}</div>
          </div>
          <div className="text-green-500 text-xl">🛒</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Avg Orders / Customer</div>
            <div className="text-2xl font-semibold">{stats.avgPerCust.toFixed(2)}</div>
          </div>
          <div className="text-amber-500 text-xl">📊</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Assigned</div>
            <div className="text-2xl font-semibold">{stats.assigned}</div>
          </div>
          <div className="text-emerald-500 text-xl">📞</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Assigned %</div>
            <div className="text-2xl font-semibold">{stats.assignedPct}%</div>
          </div>
          <div className="text-indigo-500 text-xl">ℹ️</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Filled Customers</div>
            <div className="text-2xl font-semibold">{stats.filledCustomers}</div>
          </div>
          <div className="text-sky-600 text-xl">📝</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Not Filled</div>
            <div className="text-2xl font-semibold">{stats.notFilledCustomers}</div>
          </div>
          <div className="text-gray-600 text-xl">⬜</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Not Filled %</div>
            <div className="text-2xl font-semibold">{stats.notFilledPct}%</div>
          </div>
          <div className="text-gray-600 text-xl">📉</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Filled %</div>
            <div className="text-2xl font-semibold">{stats.filledPct}%</div>
          </div>
          <div className="text-fuchsia-600 text-xl">✅</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email, phone, or order number"
              className="w-full pl-9 pr-3 py-2 rounded-lg border"
              aria-label="Search assigned repeat customers"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border" onClick={() => setShowFilters((prev) => !prev)}>
              <Filter className="w-4 h-4" /> Filters
            </button>
            {isAdmin && (
              <select
                className="px-2 py-2 rounded-lg border text-sm"
                value={memberFilter}
                onChange={(e) => { setMemberFilter(e.target.value); setPage(1); }}
                aria-label="Member"
                title="Filter by assigned member"
              >
                <option value="">All members</option>
                {teamMembers.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2 py-2 rounded-lg border text-sm"
              aria-label="Filter by call status"
            >
              <option value="">All Statuses</option>
              <option value="Called">Called</option>
              <option value="Busy">Busy</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No Response">No Response</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Invalid Number">Invalid Number</option>
              <option value="Not Called">Not Called</option>
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-2 py-2 rounded-lg border text-sm"
              aria-label="From date"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-2 py-2 rounded-lg border text-sm"
              aria-label="To date"
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="Min Orders"
              value={minOrders}
              onChange={(e) => setMinOrders(e.target.value)}
              className="px-2 py-2 rounded-lg border text-sm"
              aria-label="Min orders"
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="Max Orders"
              value={maxOrders}
              onChange={(e) => setMaxOrders(e.target.value)}
              className="px-2 py-2 rounded-lg border text-sm"
              aria-label="Max orders"
            />
            <IconButton onClick={resetFilters} className="justify-center">
              <X className="w-4 h-4" />
              Reset
            </IconButton>
            <IconButton onClick={exportLeads} className="justify-center" title="Export selected (or all filtered if none selected)">
              <ExternalLink className="w-4 h-4" />
              Export
            </IconButton>

            {/* Manual assignment controls */}
            {isAdmin && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 ring-1 ring-gray-200 rounded-lg px-2 py-1 bg-white">
                  <select
                    className="bg-transparent text-sm outline-none"
                    aria-label="Allocation type"
                    title="Allocation type"
                    value={allocationType}
                    onChange={(e) => setAllocationType(e.target.value as 'manual' | 'percentage' | 'equally')}
                  >
                    <option value="manual">Manual (Selected)</option>
                    <option value="percentage">Percentage</option>
                    <option value="equally">Equally (All Agents)</option>
                  </select>
                  {allocationType === 'percentage' && (
                    <input
                      type="number"
                      className="w-16 px-2 py-1 text-sm border rounded"
                      placeholder="%"
                      min="0"
                      max="100"
                      value={allocationPercent}
                      onChange={(e) => setAllocationPercent(e.target.value)}
                      title="Percentage of filtered leads to assign"
                    />
                  )}
                  {allocationType !== 'equally' && (
                    <select
                      className="bg-transparent text-sm outline-none"
                      aria-label="Assign to team member"
                      title="Assign to team member"
                      value={assignMember}
                      onChange={(e) => setAssignMember(e.target.value)}
                    >
                      <option value="">Assign to…</option>
                      {teamMembers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className="px-3 py-1.5 rounded-lg ring-1 ring-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={assignSelected}
                    disabled={
                      (allocationType !== 'equally' && !assignMember) ||
                      (allocationType === 'manual' && Object.values(selected).filter(Boolean).length === 0) ||
                      (allocationType === 'equally' && teamMembers.length === 0) ||
                      assigning
                    }
                    title={
                      allocationType === 'manual' && Object.values(selected).filter(Boolean).length === 0
                        ? 'Select rows first'
                        : allocationType === 'equally' && teamMembers.length === 0
                        ? 'No team members available'
                        : 'Assign leads'
                    }
                  >
                    {assigning ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
                <div className="text-xs text-gray-600 px-2">
                  {allocationType === 'manual' && (
                    <span>Will assign <strong>{Object.values(selected).filter(Boolean).length}</strong> selected lead(s)</span>
                  )}
                  {allocationType === 'percentage' && (
                    <span>Will assign <strong>{Math.floor((filtered.length * Math.max(0, Math.min(100, Number(allocationPercent) || 0))) / 100)}</strong> of {filtered.length} filtered lead(s) ({allocationPercent}%)</span>
                  )}
                  {allocationType === 'equally' && (
                    <span>
                      {(() => {
                        const eligibleAgents = teamMembers.filter(m => String(m).toLowerCase() !== 'admin');
                        return (
                          <>
                            Will distribute <strong>{filtered.length}</strong> filtered lead(s) equally across <strong>{eligibleAgents.length}</strong> agent(s)
                            {eligibleAgents.length > 0 && ` (~${Math.ceil(filtered.length / eligibleAgents.length)} each)`}
                          </>
                        );
                      })()}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs md:text-sm text-gray-600 justify-between">
            <span>
              Leads: <strong>{filtered.length}</strong>
            </span>
            <span>Last run: {lastRunAt ? formatDateTime(lastRunAt) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Something went wrong</div>
            <div className="mt-0.5">{error}</div>
            <div className="mt-2">
              <IconButton onClick={loadAssigned}>Retry</IconButton>
            </div>
          </div>
        </div>
      )}

      {/* Noco Insights drilldown dialog */}
      {ncDrillOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setNcDrillOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-auto" onClick={(e)=>e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold text-sm">{ncDrillTitle || 'Matching rows'}</div>
              <button className="text-sm px-3 py-1 border rounded-lg" onClick={() => setNcDrillOpen(false)}>Close</button>
            </div>
            <div className="p-3">
              {(() => {
                const total = ncDrillRows.length;
                const pageCount = Math.max(1, Math.ceil(total / ncDrillPageSize));
                const safePage = Math.min(Math.max(1, ncDrillPage), pageCount);
                const start = (safePage - 1) * ncDrillPageSize;
                const slice = ncDrillRows.slice(start, start + ncDrillPageSize);
                return (
                  <>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-700">
                          <tr>
                            <th className="text-left px-3 py-2">Date</th>
                            <th className="text-left px-3 py-2">Agent</th>
                            <th className="text-left px-3 py-2">Order</th>
                            <th className="text-left px-3 py-2">Phone</th>
                            <th className="text-left px-3 py-2">Call Status</th>
                            <th className="text-left px-3 py-2">Heard From</th>
                            <th className="text-left px-3 py-2">First-time Reason</th>
                            <th className="text-left px-3 py-2">Reorder Reason</th>
                            <th className="text-left px-3 py-2">Liked Features</th>
                            <th className="text-left px-3 py-2">Usage Recipe</th>
                            <th className="text-left px-3 py-2">Usage Time</th>
                            <th className="text-left px-3 py-2">Family User</th>
                            <th className="text-left px-3 py-2">Gender</th>
                            <th className="text-left px-3 py-2">Age</th>
                            <th className="text-left px-3 py-2">Profession</th>
                            <th className="text-left px-3 py-2">City</th>
                            <th className="text-left px-3 py-2">NPE</th>
                            <th className="text-left px-3 py-2">Marital</th>
                            <th className="text-left px-3 py-2">Subscription</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slice.length === 0 ? (
                            <tr><td className="px-3 py-3 text-center text-gray-600" colSpan={5}>No rows</td></tr>
                          ) : (
                            slice.map((r, i) => (
                              <tr key={`ncdr-${i}`} className="border-t">
                                <td className="px-3 py-2 whitespace-nowrap">{(r as any).Date || '—'}</td>
                                <td className="px-3 py-2">{(r as any).agent || '—'}</td>
                                <td className="px-3 py-2">{String((r as any).order_number ?? '—')}</td>
                                <td className="px-3 py-2">{(r as any).customer_phone || '—'}</td>
                                <td className="px-3 py-2">{(r as any).call_status || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[240px]" title={(r as any).heard_from || ''}>{(r as any).heard_from || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[260px]" title={(r as any).first_time_reason || (r as any).firstTimeReason || ''}>{(r as any).first_time_reason || (r as any).firstTimeReason || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[260px]" title={(r as any).reorder_reason || (r as any).reorderReason || ''}>{(r as any).reorder_reason || (r as any).reorderReason || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[260px]" title={(r as any).liked_features || (r as any).likedFeatures || ''}>{(r as any).liked_features || (r as any).likedFeatures || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[240px]" title={(r as any).usage_recipe || ''}>{(r as any).usage_recipe || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[200px]" title={(r as any).usage_time || ''}>{(r as any).usage_time || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[200px]" title={(r as any).family_user || ''}>{(r as any).family_user || '—'}</td>
                                <td className="px-3 py-2">{(r as any).gender || (r as any).gender_text || '—'}</td>
                                <td className="px-3 py-2">{(r as any).age || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[220px]" title={(r as any).profession_text || ''}>{(r as any).profession_text || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[220px]" title={(r as any).city || ''}>{(r as any).city || '—'}</td>
                                <td className="px-3 py-2 truncate max-w-[240px]" title={(r as any).new_product_expectation || ''}>{(r as any).new_product_expectation || '—'}</td>
                                <td className="px-3 py-2">{(r as any).marital_status || '—'}</td>
                                <td className="px-3 py-2">{(r as any).monthly_subscriptions || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-sm text-gray-700">
                      <div>
                        Showing <strong>{total ? start + 1 : 0}-{Math.min(start + ncDrillPageSize, total)}</strong> of <strong>{total}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <select title="Rows per page" className="border rounded px-2 py-1 text-sm" value={ncDrillPageSize} onChange={(e)=>{ setNcDrillPageSize(Number(e.target.value)); setNcDrillPage(1); }}>
                          {[20,50,100,200].map(n=> <option key={n} value={n}>{n} / page</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <IconButton onClick={()=>setNcDrillPage(p=>Math.max(1,p-1))} disabled={safePage<=1} title="Previous"><ChevronLeft className="w-4 h-4"/></IconButton>
                          <div className="min-w-[80px] text-center">Page <strong>{safePage}</strong> / {pageCount}</div>
                          <IconButton onClick={()=>setNcDrillPage(p=>Math.min(pageCount,p+1))} disabled={safePage>=pageCount} title="Next"><ChevronRight className="w-4 h-4"/></IconButton>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {callMsg && (
        <div className={clsx('text-sm p-3 rounded-lg border',
          callTone==='success' && 'text-emerald-700 bg-emerald-50 border-emerald-200',
          callTone==='error' && 'text-rose-700 bg-rose-50 border-rose-200',
          callTone==='info' && 'text-indigo-700 bg-indigo-50 border-indigo-200'
        )}>{callMsg}</div>
      )}

      {/* Table or Analytics */}
      {view === 'leads' && (
      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 sticky top-0">
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select current page"
                  onChange={togglePageAll}
                  checked={pageSlice.length>0 && pageSlice.every(isSelected)}
                />
              </th>
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-left px-4 py-2">Orders</th>
              <th className="text-left px-4 py-2">Range</th>
              <th className="text-left px-4 py-2">Assigned</th>
              <th className="text-left px-4 py-2">Form</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
            {/* Column filters */}
            <tr className="border-t text-xs bg-white/70">
              <th className="px-2 py-2"></th>
              {/* Customer filter: ties to global q */}
              <th className="px-4 py-2">
                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="Search customer (email/phone/order)"
                  value={q}
                  onChange={(e)=>setQ(e.target.value)}
                />
              </th>
              {/* Orders filter: min/max */}
              <th className="px-4 py-2">
                <div className="flex gap-1">
                  <input
                    className="w-1/2 border rounded px-2 py-1"
                    placeholder="Min"
                    value={minOrders}
                    onChange={(e)=>setMinOrders(e.target.value)}
                  />
                  <input
                    className="w-1/2 border rounded px-2 py-1"
                    placeholder="Max"
                    value={maxOrders}
                    onChange={(e)=>setMaxOrders(e.target.value)}
                  />
                </div>
              </th>
              {/* Range filter: date from/to uses last_order */}
              <th className="px-4 py-2">
                <div className="flex gap-1">
                  <input
                    type="date"
                    className="w-1/2 border rounded px-2 py-1"
                    value={filterFrom}
                    onChange={(e)=>setFilterFrom(e.target.value)}
                    title="From date"
                  />
                  <input
                    type="date"
                    className="w-1/2 border rounded px-2 py-1"
                    value={filterTo}
                    onChange={(e)=>setFilterTo(e.target.value)}
                    title="To date"
                  />
                </div>
              </th>
              {/* Assigned filter: admin can select member, others disabled */}
              <th className="px-4 py-2">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={memberFilter}
                  onChange={(e)=>setMemberFilter(e.target.value)}
                  disabled={!isAdmin}
                  title="Assigned member filter"
                >
                  <option value="">All</option>
                  {teamMembers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </th>
              {/* Form Filled filter */}
              <th className="px-4 py-2">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={filterFilled}
                  onChange={(e)=>{ setFilterFilled(e.target.value); setPage(1); }}
                  title="Form filled filter"
                >
                  <option value="">All</option>
                  <option value="filled">Filled</option>
                  <option value="not_filled">Not Filled</option>
                </select>
              </th>
              {/* Status filter */}
              <th className="px-4 py-2">
                <select
                  className="w-full border rounded px-2 py-1"
                  value={filterStatus}
                  onChange={(e)=>setFilterStatus(e.target.value)}
                  title="Status filter"
                >
                  <option value="">All</option>
                  <option value="Not Called">Not Called</option>
                  <option value="Called">Called</option>
                  <option value="Busy">Busy</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="No Response">No Response</option>
                  <option value="Wrong Number">Wrong Number</option>
                  <option value="Invalid Number">Invalid Number</option>
                  <option value="DNP1">DNP1</option>
                  <option value="DNP2">DNP2</option>
                  <option value="DNP3">DNP3</option>
                  <option value="DNP4">DNP4</option>
                </select>
              </th>
              <th className="px-4 py-2 text-right">
                <button
                  className="text-xs underline text-gray-600"
                  onClick={resetFilters}
                >Clear</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t">
                  <td className="px-4 py-3">
                    <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-32 bg-gray-100 rounded mt-2 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-48 bg-gray-100 rounded mt-2 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-28 bg-gray-100 rounded mt-2 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-36 bg-gray-100 rounded mt-2 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-20 bg-gray-100 rounded-full border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-24 bg-gray-100 rounded-full border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : pageSlice.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600">
                  <div className="flex flex-col items-center gap-2">
                    <Info className="w-5 h-5 text-gray-400" />
                    <div className="font-medium">No assigned repeat customers</div>
                    <div className="text-xs">Try adjusting filters or refreshing.</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageSlice.map((r) => (
                <tr key={`${r.email}-${r.phone}`} className="border-t">
                  <td className="px-2 py-2 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.email}`}
                      checked={isSelected(r)}
                      onChange={() => toggleRow(r)}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="font-semibold break-all">{r.email || '—'}</div>
                    <div className="text-gray-600 text-xs break-all">{r.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div>{r.order_count} orders</div>
                    <div className="text-xs text-gray-500 break-words">
                      {(r.order_numbers || []).join(', ')}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm whitespace-nowrap align-top">
                    <div>First: {formatDate(r.first_order)}</div>
                    <div>Last: {formatDate(r.last_order)}</div>
                  </td>
                  <td className="px-4 py-2 text-sm align-top">
                    <div>{r.assigned_to || '—'}</div>
                    <div className="text-xs text-gray-500">
                      {r.assigned_at ? formatDateTime(r.assigned_at) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {(() => {
                      const nums = (r.order_numbers || []).map((x) => String(x).trim()).filter(Boolean);
                      const isFilled = nums.some((n) => filledOrderNumbersSet.has(n));
                      return (
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded-full text-xs border',
                            isFilled
                              ? 'text-sky-700 bg-sky-50 border-sky-200'
                              : 'text-gray-700 bg-gray-50 border-gray-200'
                          )}
                        >
                          {isFilled ? 'Filled' : 'Not Filled'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs border', statusColor(r.call_status))}>
                      {r.call_status || 'Not Called'}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                        title="View Details"
                        onClick={() => {
                          const firstOrder =
                            r.order_numbers && r.order_numbers[0]
                              ? String(r.order_numbers[0])
                              : '';
                          if (firstOrder) {
                            setSelectedOrderNumber(firstOrder);
                            setIsDialogOpen(true);
                          }
                        }}
                      >
                        <ExternalLink className="w-4 h-4" /> Details
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                        title="Call customer"
                        onClick={() => { if (r.phone) handleCall(r.phone); }}
                      >
                        <Phone className="w-4 h-4" /> Call
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      {view === 'leads' && (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          Showing{' '}
          <strong>
            {filtered.length ? (pageSafe - 1) * pageSize + 1 : 0}–
            {Math.min(pageSafe * pageSize, filtered.length)}
          </strong>{' '}
          of <strong>{filtered.length}</strong>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-2 py-2 text-sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <IconButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </IconButton>
            <div className="min-w-[80px] text-center text-sm">
              Page <strong>{pageSafe}</strong> / {pageCount}
            </div>
            <IconButton
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={pageSafe >= pageCount}
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </div>
      )}

      {/* Admin note in Leads view */}
      {view === 'leads' && isAdmin && (
        <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-3">
          Admin mode: showing all repeat campaign leads. Use filters to narrow down.
        </div>
      )}

      {/* Analytics view */}
      {view === 'analytics' && isAdmin && (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          {/* Customer Insights (NocoDB) - analytics only */}
          <div className="rounded-xl border p-3 bg-gradient-to-br from-white to-slate-50">
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div className="text-base font-semibold">Customer Insights (NocoDB)</div>
              <div className="ml-2 inline-flex rounded-lg overflow-hidden border text-xs">
                <button className={clsx('px-2 py-1', ncTab==='insights' && 'bg-indigo-600 text-white')} onClick={()=>setNcTab('insights')}>Insights</button>
                <button className={clsx('px-2 py-1', ncTab==='batch' && 'bg-indigo-600 text-white')} onClick={()=>setNcTab('batch')}>Batch Update</button>
              </div>
              {ncLoading && <span className="text-xs text-gray-500">Loading…</span>}
              {ncError && <span className="text-xs text-rose-600">{ncError}</span>}
              <div className="ml-auto flex items-end gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-gray-600 mb-1">From</label>
                  <input type="date" value={ncFrom} onChange={(e)=>setNcFrom(e.target.value)} className="border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-1">To</label>
                  <input type="date" value={ncTo} onChange={(e)=>setNcTo(e.target.value)} className="border rounded px-2 py-1"/>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-1">Quick</label>
                  <select title="Quick range" value="" onChange={(e)=>{ applyNcQuick(e.target.value); e.currentTarget.selectedIndex=0; }} className="border rounded px-2 py-1">
                    <option value="" disabled>Select…</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last14">Last 14 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="thisMonth">This Month</option>
                    <option value="lastMonth">Last Month</option>
                    <option value="all">All Time</option>
                  </select>
                </div>
                <IconButton onClick={loadNocoRepeat} title="Reload from NocoDB"><RefreshCcw className="w-4 h-4"/>Reload</IconButton>
              </div>
            </div>

            {ncTab === 'insights' ? (() => {
              const ft = makeCountTable('first_time_reason');
              const rr = makeCountTable('reorder_reason');
              const lf = makeCountTable('liked_features');
              const ur = makeCountTable('usage_recipe');
              const cs = makeCountTable('call_status');
              const ms = makeCountTable('monthly_subscriptions');
              const renderTable = (title: string, data: { total: number; rows: Array<{ name: string; count: number; pct: number }>; }, key: keyof NocoRepeatRow) => {
                // apply grouping if exists for this key
                const gmap = ncGrouping[String(key)] || {};
                let rowsBase = data.rows;
                if (Object.keys(gmap).length) {
                  const grouped = new Map<string, { name: string; count: number }>();
                  for (const r of data.rows) {
                    const g = gmap[r.name];
                    const label = g || r.name;
                    const prev = grouped.get(label) || { name: label, count: 0 };
                    prev.count += r.count;
                    grouped.set(label, prev);
                  }
                  const total = data.total || 1;
                  rowsBase = Array.from(grouped.values())
                    .sort((a,b)=>b.count-a.count)
                    .map(({name,count})=>({ name, count, pct: Math.round((count/total)*1000)/10 }));
                }
                const showAll = !!ncShowAll[String(key)];
                const rows = showAll ? rowsBase : rowsBase.slice(0, 10);
                const canToggle = data.rows.length > 10;
                return (
                <div className="bg-white rounded-lg border shadow-sm">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <div className="text-sm font-medium">{title}</div>
                    <div className="flex items-center gap-2">
                      <button className="text-[11px] text-gray-700 hover:underline" onClick={()=>setNcGroupOpen({ key })} title="Group categories">Group</button>
                      {canToggle && (
                        <button className="text-[11px] text-indigo-700 hover:underline" onClick={()=>setNcShowAll(s=>({ ...s, [String(key)]: !showAll }))}>
                          {showAll ? 'View less' : 'View more'}
                        </button>
                      )}
                      <div className="text-[11px] text-gray-500">Total {data.total}</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[520px] text-sm">
                      <thead className="bg-slate-50 text-gray-700">
                        <tr>
                          <th className="text-left px-3 py-2">Category</th>
                          <th className="text-left px-3 py-2">Count</th>
                          <th className="text-left px-3 py-2">% (approx.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const gmapLocal = ncGrouping[String(key)] || {};
                          const members = Object.entries(gmapLocal).filter(([,grp])=>grp===r.name).map(([cat])=>cat);
                          const isGroup = members.length > 0;
                          return (
                          <tr
                            key={r.name}
                            className={`border-t cursor-pointer ${
                              isGroup 
                                ? 'bg-indigo-50 hover:bg-indigo-100 border-l-4 border-l-indigo-500' 
                                : 'hover:bg-indigo-50'
                            }`}
                            onClick={() => {
                              if (members.length) openNcGroupDrill(key, r.name, members);
                              else openNcDrill(key, r.name);
                            }}
                            title={isGroup ? `Group: ${members.length} categories` : 'Click to view matching rows'}
                          >
                            <td className="px-3 py-2 max-w-[520px]">
                              <div className="flex items-center gap-2">
                                <div className="truncate" title={r.name}>
                                  <span className={isGroup ? 'font-semibold text-indigo-900' : ''}>{r.name}</span>
                                </div>
                                {isGroup && (
                                  <span className="shrink-0 text-xs px-1.5 py-0.5 bg-indigo-600 text-white rounded-full font-medium">
                                    {members.length}
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const hints = summarizeCategory(key, r.name);
                                return hints.length ? (
                                  <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-gray-600">
                                    {hints.map(h => <span key={h} className="px-1.5 py-0.5 bg-slate-100 rounded">{h}</span>)}
                                  </div>
                                ) : null;
                              })()}
                            </td>
                            <td className="px-3 py-2">{r.count}</td>
                            <td className="px-3 py-2">{r.pct}%</td>
                          </tr>
                          );
                        })}
                        {rows.length === 0 && (
                          <tr><td className="px-3 py-3 text-gray-600" colSpan={3}>No data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ); };

              // Extra demographics/profile tables
              const makeAgeTableLocal = () => {
                const buckets = ['<20','20-25','25-30','30-35','35-40','40-45','45-50','50-60','60+'];
                const order = new Map<string, number>(buckets.map((b, i) => [b, i]));
                const counts = new Map<string, number>();
                for (const b of buckets) counts.set(b, 0);
                for (const r of ncFiltered) {
                  const num = Number(String((r as any).age ?? '').replace(/[^0-9]/g, ''));
                  let b = '(Empty)';
                  if (Number.isFinite(num) && num > 0) {
                    if (num < 20) b = '<20';
                    else if (num < 25) b = '20-25';
                    else if (num < 30) b = '25-30';
                    else if (num < 35) b = '30-35';
                    else if (num < 40) b = '35-40';
                    else if (num < 45) b = '40-45';
                    else if (num < 50) b = '45-50';
                    else if (num < 60) b = '50-60';
                    else b = '60+';
                  }
                  counts.set(b, (counts.get(b) || 0) + 1);
                }
                const total = ncFiltered.length || 1;
                const entries = Array.from(counts.entries()).filter(([,c])=>c>0);
                entries.sort((a,b) => {
                  const ia = order.has(a[0]) ? order.get(a[0])! : Number.POSITIVE_INFINITY;
                  const ib = order.has(b[0]) ? order.get(b[0])! : Number.POSITIVE_INFINITY;
                  if (ia !== ib) return ia - ib;
                  return 0;
                });
                // Ensure (Empty) appears last if present
                const empties = entries.filter(([k]) => !order.has(k));
                const nonEmpties = entries.filter(([k]) => order.has(k));
                const sorted = [...nonEmpties, ...empties];
                const rows = sorted.map(([name,count])=>({ name, count, pct: Math.round((count/total)*1000)/10 }));
                return { total: ncFiltered.length, rows };
              };
              const makeSimpleLocal = (getter: (r: any)=>string) => {
                const counts = new Map<string, number>();
                for (const r of ncFiltered) {
                  const k = getter(r) || '(Empty)';
                  counts.set(k, (counts.get(k) || 0) + 1);
                }
                const total = ncFiltered.length || 1;
                const rows = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({ name, count, pct: Math.round((count/total)*1000)/10 }));
                return { total: ncFiltered.length, rows };
              };
              const cap = (s: string) => s.split(' ').filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
              const genderT = makeSimpleLocal(r => {
                const s = String((r as any).gender || '').trim().toLowerCase();
                if (!s) return '(Empty)';
                if (['m','male','man','boy','gent'].includes(s)) return 'Male';
                if (['f','female','woman','girl','lady'].includes(s)) return 'Female';
                return cap(s);
              });
              const maritalT = makeSimpleLocal(r => {
                const s = String((r as any).marital_status || '').trim().toLowerCase();
                if (!s) return '(Empty)';
                if (s.includes('married')) return 'Married';
                if (s.includes('single') || s.includes('unmarried') || s.includes('not married')) return 'Unmarried';
                return cap(s);
              });
              const professionT = makeSimpleLocal(r => String((r as any).profession_text || '').trim().replace(/\s{2,}/g,' ') || '(Empty)');
              const cityT = makeSimpleLocal(r => {
                const s = String((r as any).city || '').trim().toLowerCase();
                if (!s) return '(Empty)';
                return cap(s);
              });
              const npeT = makeSimpleLocal(r => categorizeNPE(String((r as any).new_product_expectation || '').replace(/\s{2,}/g,' ').trim()));
              const agentT = makeSimpleLocal(r => {
                const s = String((r as any).agent || '').trim();
                return s || '(Empty)';
              });
              const usageTimeT = makeSimpleLocal(r => String((r as any).usage_time || '').trim().replace(/\s{2,}/g,' ') || '(Empty)');
              const familyUserT = makeSimpleLocal(r => String((r as any).family_user || '').trim().replace(/\s{2,}/g,' ') || '(Empty)');

              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {renderTable('Filled by agent (NocoDB)', agentT, 'agent')}
                    {renderTable('Status', cs, 'call_status')}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {renderTable('First Time Purchase Reason', ft, 'first_time_reason')}
                    {renderTable('Reorder Reason', rr, 'reorder_reason')}
                    {renderTable('Liked Feature', lf, 'liked_features')}
                    {renderTable('Usage / Recipe', ur, 'usage_recipe')}
                    {renderTable('Subscription Status', ms, 'monthly_subscriptions')}
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {renderTable('Age Group', makeAgeTableLocal(), 'age')}
                    {renderTable('Gender', genderT, 'gender')}
                    {renderTable('Marital Status', maritalT, 'marital_status')}
                    {renderTable('Profession', professionT, 'profession_text')}
                    {renderTable('City', cityT, 'city')}
                    {renderTable('New Product Expectation', npeT, 'new_product_expectation')}
                    {renderTable('Usage Time', usageTimeT, 'usage_time')}
                    {renderTable('Family User', familyUserT, 'family_user')}
                  </div>
                </>
              );
            })() : (
              <div className="bg-white rounded-lg border shadow-sm p-3 space-y-3">
                <div className="text-sm font-medium">Batch Update — set field/value for pasted orders</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Field</label>
                    <select className="border rounded px-2 py-1 w-full"
                      value={ncBatchField}
                      onChange={(e)=>setNcBatchField(e.target.value)}
                      title="Select target field">
                      <option value="monthly_subscriptions">monthly_subscriptions</option>
                      <option value="agent">agent</option>
                      <option value="call_status">call_status</option>
                      <option value="heard_from">heard_from</option>
                      <option value="first_time_reason">first_time_reason</option>
                      <option value="reorder_reason">reorder_reason</option>
                      <option value="liked_features">liked_features</option>
                      <option value="usage_recipe">usage_recipe</option>
                      <option value="usage_time">usage_time</option>
                      <option value="age">age</option>
                      <option value="gender">gender</option>
                      <option value="marital_status">marital_status</option>
                      <option value="profession_text">profession_text</option>
                      <option value="city">city</option>
                      <option value="new_product_expectation">new_product_expectation</option>
                      <option value="__custom__">Custom…</option>
                    </select>
                    {ncBatchField === '__custom__' && (
                      <input className="mt-1 border rounded px-2 py-1 w-full" placeholder="Enter custom field"
                        value={ncBatchCustomField} onChange={(e)=>setNcBatchCustomField(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Value Type</label>
                    <select className="border rounded px-2 py-1 w-full" value={ncBatchType} onChange={(e)=>setNcBatchType(e.target.value as any)} title="Interpretation of the value">
                      <option value="auto">auto</option>
                      <option value="boolean">boolean</option>
                      <option value="number">number</option>
                      <option value="string">string</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Value</label>
                    <div className="flex gap-2">
                      <input className="border rounded px-2 py-1 w-full" placeholder="Enter value (e.g., true)" value={ncBatchValue} onChange={(e)=>setNcBatchValue(e.target.value)} />
                      {ncBatchField === 'agent' && (
                        <select className="border rounded px-2 py-1" onChange={(e)=>setNcBatchValue(e.target.value)} title="Pick agent">
                          <option value="">Pick agent…</option>
                          {teamMembers.map(a=> <option key={a} value={a}>{a}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600">Paste order numbers separated by spaces, commas, or new lines.</div>
                <textarea
                  className="w-full h-40 border rounded p-2 font-mono text-xs"
                  placeholder="Paste order numbers here..."
                  value={ncBatchInput}
                  onChange={(e)=>setNcBatchInput(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <IconButton tone="primary" onClick={runNcBatchUpdate} disabled={ncBatchRunning} title="Run batch update">
                    {ncBatchRunning ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4"/>}
                    {ncBatchRunning ? 'Running…' : 'Update'}
                  </IconButton>
                  <div className="text-xs text-gray-600">Updated: {ncBatchStats.updated} · Missing: {ncBatchStats.missing} · Failed: {ncBatchStats.failed}</div>
                </div>
                <pre className="bg-gray-50 border rounded p-2 text-[11px] whitespace-pre-wrap max-h-64 overflow-auto">{ncBatchLog || 'Logs will appear here...'}</pre>
              </div>
            )}
            {/* Grouping panel */}
            {ncGroupOpen.key && (() => {
              const key = ncGroupOpen.key as keyof NocoRepeatRow;
              const gmap = ncGrouping[String(key)] || {};
              const currentData = makeCountTable(key as any);
              const allCats = currentData.rows.map(r=>r.name);
              const defsForKey = ncGroupDefs[String(key)] || [];
              const mappedGroups = Array.from(new Set(Object.values(gmap))).filter(Boolean);
              const groups = Array.from(new Set([ ...defsForKey, ...mappedGroups ]));
              const q = ncGroupUngroupedQuery.trim().toLowerCase();
              const persist = (nextMap: typeof ncGrouping, nextDefs: typeof ncGroupDefs) => {
                try {
                  localStorage.setItem('nc_grouping_v1', JSON.stringify(nextMap));
                  localStorage.setItem('nc_groupdefs_v1', JSON.stringify(nextDefs));
                } catch (e) { console.warn('Failed to save grouping to localStorage', e); }
              };
              const save = () => persist(ncGrouping, ncGroupDefs);
              const addGroup = () => {
                const name = ncGroupNewName.trim();
                if (!name) return;
                setNcGroupDefs(d => {
                  const next = { ...d, [String(key)]: Array.from(new Set([...(d[String(key)]||[]), name])) };
                  persist(ncGrouping, next);
                  return next;
                });
                setNcGroupNewName('');
              };
              const assign = (cat: string, grp: string) => {
                setNcGrouping(s=>{
                  const m = { ...(s[String(key)]||{}) };
                  m[cat]=grp;
                  const next = { ...s, [String(key)]: m };
                  persist(next, ncGroupDefs);
                  return next;
                });
              };
              const onDropTo = (grp: string) => (e: React.DragEvent<HTMLDivElement>) => { const cat = e.dataTransfer.getData('text/plain'); if (cat) assign(cat, grp); };
              const addToGroup = (grp: string) => {
                const input = (ncGroupAddInput[grp] || '').trim();
                if (!input) return;
                const cats = input.split(',').map(c => c.trim()).filter(Boolean);
                cats.forEach(cat => assign(cat, grp));
                setNcGroupAddInput(prev => ({ ...prev, [grp]: '' }));
              };
              return (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-2 md:p-4" onClick={()=>setNcGroupOpen({key:null})}>
                  <div className="bg-white rounded-lg border shadow-lg w-full max-w-4xl md:max-w-5xl p-3 md:p-4 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium">Group categories — {String(key)}</div>
                      <div className="flex items-center gap-2">
                        <IconButton onClick={()=>{ save(); setNcGroupOpen({key:null}); }}>Done</IconButton>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="border rounded p-2 h-[65vh] md:h-[60vh] flex flex-col overflow-hidden">
                        <div className="text-xs font-medium mb-2">Ungrouped</div>
                        <div className="sticky top-0 bg-white pb-2">
                          <input
                            className="border rounded px-2 py-1 text-xs w-full"
                            placeholder="Search…"
                            value={ncGroupUngroupedQuery}
                            onChange={(e)=>setNcGroupUngroupedQuery(e.target.value)}
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
                          {allCats.map(c => {
                            const isGrouped = !!gmap[c];
                            const isVisible = !q || c.toLowerCase().includes(q);
                            if (!isVisible) return null;
                            return (
                              <div 
                                key={c} 
                                className={`px-2 py-1 rounded border ${
                                  isGrouped 
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-medium' 
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                                draggable 
                                onDragStart={(e)=>e.dataTransfer.setData('text/plain', c)} 
                                title={isGrouped ? `Grouped in: ${gmap[c]}` : c}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs truncate">{c}</span>
                                  {isGrouped && (
                                    <span className="text-xs px-1.5 py-0.5 bg-indigo-200 text-indigo-700 rounded shrink-0">
                                      {gmap[c]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {allCats.filter(c => !q || c.toLowerCase().includes(q)).length===0 && (
                            <div className="text-xs text-gray-500">No matches</div>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 md:col-span-2">
                        <div className="flex items-end gap-2 mb-2">
                          <div className="text-xs">Groups</div>
                          <input className="border rounded px-2 py-1 text-sm" placeholder="New group name" value={ncGroupNewName} onChange={(e)=>setNcGroupNewName(e.target.value)} />
                          <IconButton onClick={addGroup}><Plus className="w-4 h-4"/>Add</IconButton>
                          <IconButton onClick={()=>{ setNcGrouping(s=>{ const copy = { ...s }; delete copy[String(key)]; persist(copy, { ...ncGroupDefs, [String(key)]: [] }); return copy; }); setNcGroupDefs(d=>({ ...d, [String(key)]: [] })); }}>Reset</IconButton>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {groups.map(g => (
                            <div key={g} className="border-2 border-indigo-300 rounded p-2 min-h-[100px] md:min-h-[120px]" onDragOver={(e)=>e.preventDefault()} onDrop={onDropTo(g)}>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="text-xs font-semibold text-indigo-700">{g}</div>
                                <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full font-medium">
                                  {Object.entries(gmap).filter(([,grp])=>grp===g).length}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {Object.entries(gmap).filter(([,grp])=>grp===g).map(([c])=> (
                                  <span key={c} className="px-2 py-1 bg-indigo-100 border-2 border-indigo-400 rounded text-xs font-medium text-indigo-900" draggable onDragStart={(e)=>e.dataTransfer.setData('text/plain', c)} title={c}>{c}</span>
                                ))}
                              </div>
                              <div className="flex gap-1 pt-1 border-t">
                                <input
                                  className="flex-1 border rounded px-2 py-1 text-xs"
                                  placeholder="Add items (comma-separated)"
                                  value={ncGroupAddInput[g] || ''}
                                  onChange={(e) => setNcGroupAddInput(prev => ({ ...prev, [g]: e.target.value }))}
                                  onKeyPress={(e) => { if (e.key === 'Enter') addToGroup(g); }}
                                />
                                <button
                                  className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                  onClick={() => addToGroup(g)}
                                  title="Add categories to this group"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                          {groups.length===0 && <div className="text-xs text-gray-500">No groups yet. Create one above.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Analytics agent scope" value={fbAgent} onChange={(e)=>setFbAgent(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
              <option value="me">My forms</option>
              <option value="all">All agents</option>
            </select>
            <input aria-label="Analytics from date" type="date" value={fbFrom} onChange={(e)=>setFbFrom(e.target.value)} className="border rounded-lg px-2 py-2 text-sm"/>
            <input aria-label="Analytics to date" type="date" value={fbTo} onChange={(e)=>setFbTo(e.target.value)} className="border rounded-lg px-2 py-2 text-sm"/>
            <IconButton onClick={loadFeedback}><RefreshCcw className="w-4 h-4"/>Reload</IconButton>
            <IconButton title="Export agent summary CSV" onClick={exportAgentSummary}><Download className="w-4 h-4"/>Export summary</IconButton>
          </div>

          {fbAgentFilter && (
            <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-2">
              Filtering filled leads by agent: <strong>{fbAgentFilter}</strong>
              <button className="ml-2 px-2 py-0.5 border rounded text-xs" onClick={() => setFbAgentFilter('')}>Clear</button>
            </div>
          )}

          {fbStats.totalForms === 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
              No feedback forms found for the selected scope/date range. Try:
              <ul className="list-disc ml-5 mt-1">
                <li>Switch scope to "All agents"</li>
                <li>Clear the date range and click Reload</li>
                <li>Confirm the table name is public.call_feedback and RLS allows anon read</li>
              </ul>
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Forms</div>
              <div className="text-xl font-semibold">{fbStats.totalForms}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Today</div>
              <div className="text-xl font-semibold">{fbStats.today}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Last 7 days</div>
              <div className="text-xl font-semibold">{fbStats.last7}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Would Recommend (Yes)</div>
              <div className="text-xl font-semibold">{fbStats.recommendYes}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Monthly Delivery (Yes)</div>
              <div className="text-xl font-semibold">{fbStats.monthlyYes}</div>
            </div>
          </div>

          

          {/* Filled leads list with pagination */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Filled leads ({fbAgent === 'me' ? 'My forms' : 'All agents'})</div>
              <div className="text-xs text-gray-600">Date range: {fbFrom || '—'} to {fbTo || '—'}</div>
            </div>
            {(() => {
              const sorted = [...filteredFeedback].sort((a,b)=> new Date(b.created_at||'').getTime() - new Date(a.created_at||'').getTime());
              const total = sorted.length;
              const pageCount = Math.max(1, Math.ceil(total / fbListPageSize));
              const safePage = Math.min(fbListPage, pageCount);
              const start = (safePage - 1) * fbListPageSize;
              const slice = sorted.slice(start, start + fbListPageSize);
              return (
                <>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Agent</th>
                          <th className="text-left px-3 py-2">Order</th>
                          <th className="text-left px-3 py-2">Phone</th>
                          <th className="text-left px-3 py-2">Call Status</th>
                          <th className="text-left px-3 py-2">Heard From</th>
                        </tr>
                      </thead>
                      <tbody>
                        {total === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-center text-gray-600" colSpan={6}>No filled leads</td>
                          </tr>
                        ) : (
                          slice.map((f, i) => (
                            <tr
                              key={f.id || i}
                              className="border-t hover:bg-indigo-50 cursor-pointer"
                              onClick={() => setFbDetail(f)}
                              title="Click to view full details"
                            >
                              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(f.created_at)}</td>
                              <td className="px-3 py-2">{f.agent || '—'}</td>
                              <td className="px-3 py-2">{String(f.order_number ?? '—')}</td>
                              <td className="px-3 py-2">{f.customer_phone || '—'}</td>
                              <td className="px-3 py-2">{f.call_status || '—'}</td>
                              <td className="px-3 py-2 truncate max-w-[240px]" title={f.heard_from || ''}>{f.heard_from || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm text-gray-700">
                    <div>
                      Showing <strong>{total ? start + 1 : 0}-{Math.min(start + fbListPageSize, total)}</strong> of <strong>{total}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <select title="Rows per page" className="border rounded px-2 py-1 text-sm" value={fbListPageSize} onChange={(e)=>{ setFbListPageSize(Number(e.target.value)); setFbListPage(1); }}>
                        {[25,50,100,200].map(n=> <option key={n} value={n}>{n} / page</option>)}
                      </select>
                      <div className="flex items-center gap-1">
                        <IconButton onClick={()=>setFbListPage(p=>Math.max(1,p-1))} disabled={safePage<=1} title="Previous"><ChevronLeft className="w-4 h-4"/></IconButton>
                        <div className="min-w-[80px] text-center">Page <strong>{safePage}</strong> / {pageCount}</div>
                        <IconButton onClick={()=>setFbListPage(p=>Math.min(pageCount,p+1))} disabled={safePage>=pageCount} title="Next"><ChevronRight className="w-4 h-4"/></IconButton>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="text-xs text-gray-500 mt-1">Use pagination to browse all forms in the selected scope and date range.</div>
          </div>
        </div>
      )}

      {/* Non-Repeated Dashboard view (embedded in Analytics) */}
      {view === 'analytics' && isAdmin && (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="text-base font-semibold">Non-Repeated Dashboard</div>
            {nrLoading && <span className="text-xs text-gray-500">Loading…</span>}
            {nrError && <span className="text-xs text-rose-600">{nrError}</span>}
            <div className="ml-auto flex items-end gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">From</label>
                <input type="date" value={nrFrom} onChange={(e)=>setNrFrom(e.target.value)} className="border rounded px-2 py-1" title="From date"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">To</label>
                <input type="date" value={nrTo} onChange={(e)=>setNrTo(e.target.value)} className="border rounded px-2 py-1" title="To date"/>
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Quick</label>
                <select title="Quick range" value="" onChange={(e)=>{ applyNrQuick(e.target.value); e.currentTarget.selectedIndex=0; }} className="border rounded px-2 py-1">
                  <option value="" disabled>Select…</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7">Last 7 days</option>
                  <option value="last14">Last 14 days</option>
                  <option value="last30">Last 30 days</option>
                  <option value="thisMonth">This Month</option>
                  <option value="lastMonth">Last Month</option>
                  <option value="all">All Time</option>
                </select>
              </div>
              <IconButton onClick={loadNonRepeated} title="Reload from NocoDB"><RefreshCcw className="w-4 h-4"/>Reload</IconButton>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg shadow p-4 border">
              <div className="text-xs text-gray-500">Grand Total</div>
              <div className="text-2xl font-semibold">{nrLoading ? '…' : nrFiltered.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border">
              <div className="text-xs text-gray-500">Unique Agents</div>
              <div className="text-2xl font-semibold">{nrLoading ? '…' : new Set(nrFiltered.map((r: any) => {
                const raw = r['Agent Name'] ?? r.Agent ?? r.agent;
                return String(raw ?? '').trim() || '(Unassigned)';
              })).size}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border">
              <div className="text-xs text-gray-500">Source</div>
              <div className="text-sm">Non-Repeated Calls</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border">
              <div className="text-xs text-gray-500">Range</div>
              <div className="text-sm">{nrFrom || '—'} → {nrTo || '—'}</div>
            </div>
          </div>

          {/* Question-Based Feedback Report */}
          {(() => {
            if (nrFiltered.length === 0) return <div className="bg-white rounded-lg shadow p-4 text-slate-500 text-sm">No data to display. Adjust date range or reload.</div>;
            
            const total = nrFiltered.length;
            
            // Debug: log available fields
            if (nrFiltered.length > 0) {
              console.log('Available fields in NocoDB data:', Object.keys(nrFiltered[0]));
            }
            
            // Helper: group and count responses for a question
            const groupAnswers = (fieldCandidates: string[], applyGrouping = true) => {
              // Find the first field that exists in the data
              let field: string | null = null;
              
              for (const candidate of fieldCandidates) {
                if (nrFiltered.length > 0 && candidate in nrFiltered[0]) {
                  field = candidate;
                  break;
                }
              }
              
              if (!field) {
                console.log('Field not found, tried:', fieldCandidates);
                return { field: null, answers: [], rawAnswers: [] };
              }
              
              const counts = new Map<string, number>();
              let hasData = false;
              
              for (const r of nrFiltered) {
                const raw = (r as any)[field];
                const answer = String(raw ?? '').trim();
                
                // Skip empty responses
                if (!answer || answer === 'null' || answer === 'undefined') continue;
                
                hasData = true;
                counts.set(answer, (counts.get(answer) || 0) + 1);
              }
              
              // If no data, return empty
              if (!hasData) {
                console.log(`Field "${field}" found but has no data`);
                return { field: null, answers: [], rawAnswers: [] };
              }
              
              let answers = Array.from(counts.entries())
                .map(([answer, count]) => ({ 
                  answer, 
                  count, 
                  percentage: ((count / total) * 100).toFixed(1) 
                }))
                .sort((a, b) => b.count - a.count);
              
              const rawAnswers = [...answers];
              
              // Apply grouping if enabled and definitions exist
              if (applyGrouping && nrGrouping[field]) {
                const groupDef = nrGrouping[field];
                const groupedCounts = new Map<string, number>();
                
                for (const item of answers) {
                  const category = groupDef[item.answer] || item.answer;
                  groupedCounts.set(category, (groupedCounts.get(category) || 0) + item.count);
                }
                
                answers = Array.from(groupedCounts.entries())
                  .map(([answer, count]) => ({ 
                    answer, 
                    count, 
                    percentage: ((count / total) * 100).toFixed(1) 
                  }))
                  .sort((a, b) => b.count - a.count);
              }
              
              console.log(`Field "${field}" has ${answers.length} unique answers`);
              return { field, answers, rawAnswers };
            };

            // Define feedback questions matching NocoDB structure
            const questions = [
              {
                question: 'Filled by Agent',
                fields: ['Agent Name'],
                icon: '👤'
              },
              {
                question: 'How was your experience using our health mix so far?',
                fields: ['How was your experience using our health mix so far?'],
                icon: '⭐'
              },
              {
                question: 'How was your experience using our health mix so far? (Categorized)',
                fields: ['How was your experience using our health mix so far? c'],
                icon: '📊'
              },
              {
                question: 'What stopped you from buying again after your second purchase?',
                fields: ['May I know what stopped you from buying again after your second purchase?'],
                icon: '🔄'
              },
              {
                question: 'What stopped you from buying again? (Categorized)',
                fields: ['May I know what stopped you from buying again after your second purchase? c'],
                icon: '📊'
              },
              {
                question: 'Did you face any issues with taste, results, or daily usage?',
                fields: ['Did you face any issues with the taste, results, or using the product daily?'],
                icon: '🍲'
              },
              {
                question: 'Did you face any delivery or packaging issues?',
                fields: ['Did you face any delivery or packaging issues in your earlier orders?'],
                icon: '📦'
              },
              {
                question: 'Is there anything we should improve in the product?',
                fields: ['Is there anything you feel we should improve in the product?'],
                icon: '💡'
              },
              {
                question: 'Are you interested in monthly subscription?',
                fields: ['We have introduced a subscription option for our repeat customers. Are you interested in this?'],
                icon: '📅'
              },
              {
                question: 'Last Order Date',
                fields: ['Last order date'],
                icon: '📆'
              }
            ];

            // Render question card
            const renderQuestion = (q: typeof questions[0]) => {
              const { field, answers, rawAnswers } = groupAnswers(q.fields);
              
              // Debug: log which fields are not found
              if (!field) {
                console.log(`Field not found for question: ${q.question}, tried:`, q.fields);
                return null;
              }
              
              if (answers.length === 0) {
                console.log(`No answers for question: ${q.question}, field: ${field}`);
                return null;
              }
              
              const displayAnswers = answers.slice(0, 10);
              const hasMore = answers.length > 10;
              const hasGrouping = nrGrouping[field] && Object.keys(nrGrouping[field]).length > 0;
              
              return (
                <div key={q.question} className="bg-white rounded-lg shadow border p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-xl">{q.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-800">{q.question}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {answers.length} response{answers.length !== 1 ? 's' : ''} 
                        {hasGrouping && <span className="ml-1 text-green-600">• Grouped</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => setNrGroupOpen({ key: field })}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50 flex-shrink-0"
                      title="Group similar answers"
                    >
                      Group
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {displayAnswers.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-700 break-words">{item.answer}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-medium text-gray-900">{item.count}</span>
                          <span className="text-xs text-gray-500">({item.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {hasMore && (
                    <div className="mt-3 pt-3 border-t text-center">
                      <button 
                        onClick={() => {
                          // Get all records for this field
                          const drillData = nrFiltered.map(r => ({
                            answer: String((r as any)[field] ?? '').trim(),
                            timestamp: (r as any)['Timestamp'] || '',
                            agent: (r as any)['Agent Name'] || '',
                            rawData: r
                          })).filter(d => d.answer && d.answer !== 'null' && d.answer !== 'undefined');
                          
                          setNrDrillRows(drillData);
                          setNrDrillTitle(`${q.question} - All Responses (${drillData.length})`);
                          setNrDrillOpen(true);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View all {answers.length} responses
                      </button>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">📊 Feedback Report (Question-Based)</div>
                  <div className="text-xs text-gray-500">Showing {total} total responses</div>
                </div>
                
                {/* DEBUG: Show available fields */}
                {nrFiltered.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs">
                    <div className="font-semibold mb-1">🔍 Debug: Available fields in data:</div>
                    <div className="text-gray-700 break-all">
                      {Object.keys(nrFiltered[0]).join(', ')}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {questions.map(q => renderQuestion(q))}
                </div>
                
                {/* Show message if no cards rendered */}
                {questions.every(q => {
                  const { field, answers } = groupAnswers(q.fields);
                  return !field || answers.length === 0;
                }) && (
                  <div className="bg-gray-50 border rounded p-4 text-center text-sm text-gray-600">
                    No question cards could be rendered. Check the debug info above to see available fields.
                  </div>
                )}
              </div>
            );

            // OLD PIVOT CODE REMOVED - Replaced with Customer Insights style above
          })()}
        </div>
      )}

      {/* Drill-down dialog for Non-Repeated data */}
      {nrDrillOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{nrDrillTitle}</h3>
              <button onClick={() => setNrDrillOpen(false)} className="text-gray-500 hover:text-gray-700" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {nrDrillRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No data to display
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">Answer</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">Agent</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nrDrillRows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 border-b">
                        <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                        <td className="px-4 py-3 text-gray-900">{row.answer || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{row.agent || '-'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t p-4 bg-gray-50 text-sm text-gray-600">
              Showing {nrDrillRows.length} record{nrDrillRows.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* Grouping modal for Non-Repeated questions - Drag & Drop */}
      {nrGroupOpen && (() => {
        const fieldKey = nrGroupOpen.key;
        const currentDefs = nrGrouping[fieldKey] || {};
        
        // Get all unique answers for this field
        const allAnswers = new Set<string>();
        for (const r of nrRows) {
          const val = String((r as any)[fieldKey] ?? '').trim();
          if (val && val !== 'null' && val !== 'undefined') allAnswers.add(val);
        }
        
        // Group answers by category
        const categorized = new Map<string, string[]>();
        const ungrouped: string[] = [];
        
        // First, initialize categories from placeholders
        for (const [answer, category] of Object.entries(currentDefs)) {
          if (answer.startsWith('__category_placeholder_')) {
            if (!categorized.has(category)) {
              categorized.set(category, []);
            }
          }
        }
        
        // Then, group actual answers by category
        for (const answer of Array.from(allAnswers)) {
          const category = currentDefs[answer];
          if (category) {
            if (!categorized.has(category)) categorized.set(category, []);
            categorized.get(category)!.push(answer);
          } else {
            ungrouped.push(answer);
          }
        }
        
        const filteredUngrouped = nrGroupUngroupedQuery 
          ? ungrouped.filter(a => a.toLowerCase().includes(nrGroupUngroupedQuery.toLowerCase()))
          : ungrouped;
        
        // Drag handlers
        const handleDragStart = (e: React.DragEvent, answer: string) => {
          e.dataTransfer.setData('answer', answer);
          e.dataTransfer.effectAllowed = 'move';
        };
        
        const handleDragOver = (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        };
        
        const handleDropToCategory = (e: React.DragEvent, category: string) => {
          e.preventDefault();
          const answer = e.dataTransfer.getData('answer');
          if (answer && !answer.startsWith('__category_placeholder_')) {
            const newDefs = { ...currentDefs };
            // Remove from previous category if it was in one
            if (currentDefs[answer]) {
              delete newDefs[answer];
            }
            // Add to new category
            newDefs[answer] = category;
            
            setNrGrouping((prev: any) => {
              const updated = {
                ...prev,
                [fieldKey]: newDefs
              };
              localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
              return updated;
            });
          }
        };
        
        const handleDropToUngrouped = (e: React.DragEvent) => {
          e.preventDefault();
          const answer = e.dataTransfer.getData('answer');
          if (answer && !answer.startsWith('__category_placeholder_')) {
            const newDefs = { ...currentDefs };
            // Remove from any category
            delete newDefs[answer];
            
            setNrGrouping((prev: any) => {
              const updated = {
                ...prev,
                [fieldKey]: newDefs
              };
              localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
              return updated;
            });
          }
        };
        
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 bg-white border-b p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Group Answers: {fieldKey}</h3>
                  <button onClick={() => setNrGroupOpen(null)} className="text-gray-500 hover:text-gray-700" title="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Create new category */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nrGroupNewName}
                    onChange={(e) => setNrGroupNewName(e.target.value)}
                    placeholder="New category name (e.g., 'Positive Experience')"
                    className="flex-1 px-3 py-2 border rounded text-sm"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const categoryName = nrGroupNewName.trim();
                        if (categoryName) {
                          setNrGrouping((prev: any) => {
                            const updated = {
                              ...prev,
                              [fieldKey]: { 
                                ...prev[fieldKey],
                                [`__category_placeholder_${categoryName}`]: categoryName
                              }
                            };
                            localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
                            return updated;
                          });
                          setNrGroupNewName('');
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const categoryName = nrGroupNewName.trim();
                      if (categoryName) {
                        setNrGrouping((prev: any) => {
                          const updated = {
                            ...prev,
                            [fieldKey]: { 
                              ...prev[fieldKey],
                              [`__category_placeholder_${categoryName}`]: categoryName
                            }
                          };
                          localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
                          return updated;
                        });
                        setNrGroupNewName('');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    + Create Category
                  </button>
                </div>
              </div>
              
              {/* Side-by-side drag & drop layout */}
              <div className="flex-1 overflow-hidden flex gap-4 p-4">
                {/* LEFT: Ungrouped answers */}
                <div className="w-1/3 flex flex-col border rounded-lg bg-gray-50">
                  <div className="p-3 border-b bg-white">
                    <div className="font-semibold text-sm mb-2">📋 Ungrouped Answers ({filteredUngrouped.length})</div>
                    <input
                      type="text"
                      value={nrGroupUngroupedQuery}
                      onChange={(e) => setNrGroupUngroupedQuery(e.target.value)}
                      placeholder="Search answers..."
                      className="w-full px-2 py-1 border rounded text-xs"
                    />
                  </div>
                  <div 
                    className="flex-1 overflow-auto p-3 space-y-2"
                    onDragOver={handleDragOver}
                    onDrop={handleDropToUngrouped}
                  >
                    {filteredUngrouped.length === 0 ? (
                      <div className="text-center text-gray-400 text-sm py-8">
                        {nrGroupUngroupedQuery ? 'No matches found' : 'All answers are grouped! 🎉'}
                      </div>
                    ) : (
                      filteredUngrouped.map(answer => (
                        <div
                          key={answer}
                          draggable
                          onDragStart={(e) => handleDragStart(e, answer)}
                          className="bg-white border rounded p-2 text-xs cursor-move hover:shadow-md hover:border-blue-400 transition-all"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-gray-400">⋮⋮</span>
                            <span className="flex-1">{answer}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {/* RIGHT: Categories */}
                <div className="flex-1 flex flex-col border rounded-lg bg-gray-50">
                  <div className="p-3 border-b bg-white">
                    <div className="font-semibold text-sm">📁 Categories ({categorized.size})</div>
                    <div className="text-xs text-gray-500 mt-1">Drag answers from left to categorize them</div>
                  </div>
                  <div className="flex-1 overflow-auto p-3 space-y-3">
                    {categorized.size === 0 ? (
                      <div className="text-center text-gray-400 text-sm py-8">
                        Create a category above to start grouping answers
                      </div>
                    ) : (
                      Array.from(categorized.entries()).map(([category, answers]) => (
                        <div 
                          key={category}
                          className="border rounded-lg bg-white"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDropToCategory(e, category)}
                        >
                          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
                            <div className="font-semibold text-sm">{category}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">{answers.length} items</span>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete category "${category}" and ungroup all ${answers.length} answers?`)) {
                                    const newDefs = { ...currentDefs };
                                    // Remove all answers from this category
                                    answers.forEach(a => delete newDefs[a]);
                                    // Remove placeholder entry for this category
                                    const placeholderKey = `__category_placeholder_${category}`;
                                    delete newDefs[placeholderKey];
                                    
                                    setNrGrouping((prev: any) => {
                                      const updated = {
                                        ...prev,
                                        [fieldKey]: newDefs
                                      };
                                      localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
                                      return updated;
                                    });
                                  }
                                }}
                                className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                                title="Delete category"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          <div className="p-3 space-y-2 min-h-[60px] bg-blue-50/30">
                            {answers.map(answer => (
                              <div
                                key={answer}
                                draggable
                                onDragStart={(e) => handleDragStart(e, answer)}
                                className="bg-white border rounded p-2 text-xs hover:shadow-md hover:border-blue-400 transition-all group"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-400 cursor-move">⋮⋮</span>
                                  <span className="flex-1">{answer}</span>
                                  <button
                                    onClick={() => {
                                      const newDefs = { ...currentDefs };
                                      delete newDefs[answer];
                                      setNrGrouping((prev: any) => {
                                        const updated = {
                                          ...prev,
                                          [fieldKey]: newDefs
                                        };
                                        localStorage.setItem('nr_grouping_v1', JSON.stringify(updated));
                                        return updated;
                                      });
                                    }}
                                    className="text-red-600 hover:bg-red-50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove from category"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              
              <div className="border-t p-4 bg-gray-50 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  💡 Tip: Drag answers from left to right to categorize them. Drag back to left to ungroup.
                </div>
                <button
                  onClick={() => setNrGroupOpen(null)}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
