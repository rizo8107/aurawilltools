import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, Play, RefreshCcw, Search, AlertTriangle, Loader2, Phone, ExternalLink,
  Filter, X, ChevronLeft, ChevronRight, Info
} from 'lucide-react';
import OrderDetailsDialog from './OrderDetailsDialog';
import { SUPABASE_URL, sbHeadersObj as sbHeaders } from '../lib/supabaseClient';

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

// Feedback row (call_feedback table). Keep keys optional to be resilient to schema diff.
interface FeedbackRow {
  id?: string;
  created_at?: string;
  agent?: string | null;
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
  if (key === 'wrong number' || key === 'invalid number') return 'text-rose-700 bg-rose-50 border-rose-200';
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
  const [lastRunAt, setLastRunAt] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');

  /** Advanced filters */
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [maxOrders, setMaxOrders] = useState<string>('');

  /** View: list vs analytics */
  const [view, setView] = useState<'leads' | 'analytics'>('leads');
  // Feedback analytics state
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [fbAgent, setFbAgent] = useState<string>('all'); // 'me' | 'all'
  const [fbFrom, setFbFrom] = useState<string>('');
  const [fbTo, setFbTo] = useState<string>('');

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.assigned_to) set.add(String(r.assigned_to)); });
    return Array.from(set).sort();
  }, [rows]);

  /** Pagination */
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

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
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_team_id: Number(activeTeamId), p_agent: currentUser }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`get_repeat_orders_with_assignments ${res.status}: ${txt}`);
      }
      const data = (await res.json()) as RepeatRow[] | unknown;
      setRows(Array.isArray(data) ? (data as RepeatRow[]) : []);
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

  /** Filtering */
  const filtered = useMemo(() => {
    const baseUser = rows.filter((r) => String(r.assigned_to || '') === currentUser);

    const textFiltered = debouncedQuery
      ? baseUser.filter((r) => {
          const hay = [r.email, r.phone, ...(r.order_numbers || [])]
            .join(' ')
            .toLowerCase();
          return hay.includes(debouncedQuery);
        })
      : baseUser;

    const byStatus = filterStatus
      ? filterStatus === 'Not Called'
        ? textFiltered.filter((r) => !r.call_status)
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

    return byCount;
  }, [rows, currentUser, debouncedQuery, filterStatus, filterFrom, filterTo, minOrders, maxOrders]);

  /** Analytics */
  const stats = useMemo(() => {
    const totalCustomers = filtered.length;
    const totalOrders = filtered.reduce((s, r) => s + (r.order_count || 0), 0);
    const avgPerCust = totalCustomers ? totalOrders / totalCustomers : 0;
    const called = filtered.filter((r) => (r.call_status || '') === 'Called').length;
    const notCalled = totalCustomers - called;
    const calledPct = totalCustomers ? Math.round((called / totalCustomers) * 100) : 0;
    return { totalCustomers, totalOrders, avgPerCust, called, notCalled, calledPct };
  }, [filtered]);

  /** Pagination slice */
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const pageSlice = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

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
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            <div className="text-xs text-gray-500">Called</div>
            <div className="text-2xl font-semibold">{stats.called}</div>
          </div>
          <div className="text-emerald-500 text-xl">📞</div>
        </div>
        <div className="bg-white rounded-xl shadow p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Contacted %</div>
            <div className="text-2xl font-semibold">{stats.calledPct}%</div>
          </div>
          <div className="text-indigo-500 text-xl">ℹ️</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search */}
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email, phone, or order number"
              className="w-full pl-9 pr-3 py-2 rounded-lg border"
              aria-label="Search assigned repeat customers"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 w-full lg:w-auto">
            <div className="inline-flex items-center gap-2 text-gray-600 text-sm px-2 py-2">
              <Filter className="w-4 h-4" /> Filters
            </div>
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
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-left px-4 py-2">Orders</th>
              <th className="text-left px-4 py-2">Range</th>
              <th className="text-left px-4 py-2">Assigned</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
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
                    <div className="h-5 w-24 bg-gray-100 rounded-full border animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-8 w-40 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : pageSlice.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
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

      {/* Analytics view */}
      {view === 'analytics' && (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Analytics agent scope" value={fbAgent} onChange={(e)=>setFbAgent(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
              <option value="me">My forms</option>
              <option value="all">All agents</option>
            </select>
            <input aria-label="Analytics from date" type="date" value={fbFrom} onChange={(e)=>setFbFrom(e.target.value)} className="border rounded-lg px-2 py-2 text-sm"/>
            <input aria-label="Analytics to date" type="date" value={fbTo} onChange={(e)=>setFbTo(e.target.value)} className="border rounded-lg px-2 py-2 text-sm"/>
            <IconButton onClick={loadFeedback}><RefreshCcw className="w-4 h-4"/>Reload</IconButton>
          </div>

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

          {/* Simple bar chart for Gender */}
          <div>
            <div className="text-sm font-medium mb-2">Gender distribution</div>
            <div className="space-y-2">
              {Object.entries(fbStats.genderCounts).map(([k,v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-28 text-xs text-gray-600">{k}</div>
                  <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden"><div className="bg-indigo-500 h-3" style={{width: `${fbStats.totalForms? Math.round((Number(v)/fbStats.totalForms)*100):0}%`}}/></div>
                  <div className="w-10 text-right text-xs">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top liked features */}
          <div>
            <div className="text-sm font-medium mb-2">Top liked features</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {fbStats.featureTop.map(([label,count]) => (
                <div key={label} className="bg-gray-50 rounded p-2 text-sm flex items-center justify-between">
                  <span className="truncate pr-2" title={label}>{label}</span>
                  <span className="text-gray-600">{count}</span>
                </div>
              ))}
              {fbStats.featureTop.length === 0 && (
                <div className="text-xs text-gray-500">No feature data available in current range.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details dialog */}
      <OrderDetailsDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        orderNumber={selectedOrderNumber}
      />
    </div>
  );
}
