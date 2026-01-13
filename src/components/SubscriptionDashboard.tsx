import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCcw, Search, Loader2, ChevronLeft, ChevronRight, X, Calendar, Package, Users, IndianRupee, MapPin, Mail, Phone, CheckCircle2, Clock, AlertCircle, Save, Edit3, Plus, BarChart3, TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react';
import { SUPABASE_URL, sbHeadersObj as sbHeaders } from '../lib/supabaseClient';

/** ---------------------------------------------------------
 * Types
 * --------------------------------------------------------- */
interface SubscriptionRow {
  Id: number;
  Agent: string | null;
  Name: string | null;
  'Contact Number': string | null;
  City: string | null;
  'Selected subscription plan': string | null;
  'Amount collected': string | null;
  'No of 450 gram packs/Month': string | null;
  'confirmed  date of Dispatch': string | null;
  'Start Date and Month': string | null;
  'End Date and Month': string | null;
  'Dispatch address': string | null;
  'Email Sent': string | null;
  'Month 1': string | null;
  'Month 2': string | null;
  'Month 3': string | null;
  'Month 4': string | null;
  'Month 5': string | null;
  'Month 6': string | null;
  'Month 7': string | null;
  'Month 8': string | null;
  'Month 9': string | null;
  'Month 10': string | null;
  'Month 11': string | null;
  'Month 12': string | null;
  Date: string | null;
}

/** ---------------------------------------------------------
 * Utilities
 * --------------------------------------------------------- */
function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const formatCurrency = (val: string | null) => {
  if (!val) return '—';
  const num = Number(val.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return val;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
};

type MonthStatus = 'delivered' | 'packed' | 'placed' | 'pending' | 'empty';

const getMonthStatus = (val: string | null): { status: MonthStatus; orderId: string } => {
  if (!val) return { status: 'empty', orderId: '' };
  const s = String(val || '').trim();
  if (!s) return { status: 'empty', orderId: '' };
  const lower = s.toLowerCase();
  if (lower.includes('delivered')) return { status: 'delivered', orderId: s.replace(/delivered\s*/i, '').trim() };
  if (lower.includes('packed')) return { status: 'packed', orderId: s.replace(/packed\s*/i, '').trim() };
  if (lower.includes('placed')) return { status: 'placed', orderId: s.replace(/placed\s*/i, '').trim() };
  if (lower.includes('pending')) return { status: 'pending', orderId: '' };
  return { status: 'placed', orderId: s };
};

const statusColors: Record<string, string> = {
  delivered: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  packed: 'bg-sky-100 text-sky-800 border-sky-300',
  placed: 'bg-amber-100 text-amber-800 border-amber-300',
  pending: 'bg-slate-100 text-slate-600 border-slate-300',
  empty: 'bg-gray-50 text-gray-400 border-gray-200',
};

const toLocalDayStartTs = (d: string) => {
  const v = String(d || '').trim();
  if (!v) return NaN;
  const dt = new Date(`${v}T00:00:00`);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : NaN;
};

const toLocalDayEndTs = (d: string) => {
  const start = toLocalDayStartTs(d);
  if (!Number.isFinite(start)) return NaN;
  return start + 24 * 60 * 60 * 1000 - 1;
};

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
export default function SubscriptionDashboard() {
  const nocoToken = 'CdD-fhN2ctMOe-rOGWY5g7ET5BisIDx5r32eJMn4';

  const [currentUser] = useState<string>(() => {
    try {
      return localStorage.getItem('ndr_user') || '';
    } catch {
      return '';
    }
  });

  // Data state
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filters
  const [q, setQ] = useState<string>('');
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [filterPlan, setFilterPlan] = useState<string>('');
  const [filterCity, setFilterCity] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Detail modal
  const [detailRow, setDetailRow] = useState<SubscriptionRow | null>(null);

  // Edit mode for months
  const [editMode, setEditMode] = useState<boolean>(false);
  const [editMonths, setEditMonths] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>('');

  const [detailsEditMode, setDetailsEditMode] = useState<boolean>(false);
  const [detailsForm, setDetailsForm] = useState<Record<string, string>>({});
  const [detailsSaving, setDetailsSaving] = useState<boolean>(false);
  const [detailsSaveError, setDetailsSaveError] = useState<string>('');
  const [detailsInitId, setDetailsInitId] = useState<number | null>(null);

  const [monthPickerKey, setMonthPickerKey] = useState<string>('');
  const [monthPickerStatus, setMonthPickerStatus] = useState<MonthStatus>('pending');
  const [monthPickerOrderId, setMonthPickerOrderId] = useState<string>('');
  const [monthPickerSaving, setMonthPickerSaving] = useState<boolean>(false);
  const [monthPickerError, setMonthPickerError] = useState<string>('');

  const [newDialogOpen, setNewDialogOpen] = useState<boolean>(false);
  const [newForm, setNewForm] = useState<Record<string, string>>({
    Date: '',
    Name: '',
    'Contact Number': '',
    City: '',
    Agent: '',
    'Selected subscription plan': '',
    'Amount collected': '',
    'No of 450 gram packs/Month': '',
    'confirmed  date of Dispatch': '',
    'Start Date and Month': '',
    'End Date and Month': '',
    'Dispatch address': '',
    'Email Sent': '',
  });
  const [newSaving, setNewSaving] = useState<boolean>(false);
  const [newError, setNewError] = useState<string>('');
  const [newPlanMode, setNewPlanMode] = useState<'select' | 'custom'>('select');
  const [newPacksMode, setNewPacksMode] = useState<'select' | 'custom'>('select');

  // Agent Analytics state
  const [orderHistory, setOrderHistory] = useState<Map<string, number>>(new Map()); // phone -> order_count
  const [orderHistoryLoading, setOrderHistoryLoading] = useState<boolean>(false);
  const [showAgentAnalytics, setShowAgentAnalytics] = useState<boolean>(true);

  // Drill-down modal state
  const [drillAgent, setDrillAgent] = useState<string>('');
  const [drillTier, setDrillTier] = useState<string>('');
  const [drillRows, setDrillRows] = useState<SubscriptionRow[]>([]);

  const closeNewDialog = useCallback(() => {
    setNewDialogOpen(false);
    setNewSaving(false);
    setNewError('');
  }, []);

  const closeDetail = useCallback(() => {
    setDetailRow(null);
    setEditMode(false);
    setSaveError('');
    setMonthPickerKey('');
    setMonthPickerError('');
    setDetailsEditMode(false);
    setDetailsSaveError('');
    setDetailsInitId(null);
  }, []);

  // Load data from NocoDB
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const base = 'https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mt68ug4tshyfwao/records';
      const limit = 500;
      let offset = 0;
      const out: SubscriptionRow[] = [];
      while (true) {
        const params = new URLSearchParams();
        params.set('offset', String(offset));
        params.set('limit', String(limit));
        params.set('viewId', 'vwlsvc5fdgucua2q');
        const url = `${base}?${params.toString()}`;
        const res = await fetch(url, { headers: { 'xc-token': nocoToken } });
        if (!res.ok) throw new Error(await res.text());
        const payload = await res.json();
        const list = Array.isArray(payload?.list) ? payload.list : [];
        out.push(...list);
        if (list.length < limit) break;
        offset += limit;
        if (offset > 100000) break;
      }
      setRows(out);
    } catch (e: unknown) {
      setRows([]);
      setError((e as Error)?.message || 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, [nocoToken]);

  const createNewSubscription = useCallback(async () => {
    try {
      setNewSaving(true);
      setNewError('');
      const url = `https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mt68ug4tshyfwao/records`;
      const payload: Record<string, string | null> = {
        Date: newForm.Date || null,
        Name: newForm.Name || null,
        'Contact Number': newForm['Contact Number'] || null,
        City: newForm.City || null,
        Agent: newForm.Agent || null,
        'Selected subscription plan': newForm['Selected subscription plan'] || null,
        'Amount collected': newForm['Amount collected'] || null,
        'No of 450 gram packs/Month': newForm['No of 450 gram packs/Month'] || null,
        'confirmed  date of Dispatch': newForm['confirmed  date of Dispatch'] || null,
        'Start Date and Month': newForm['Start Date and Month'] || null,
        'End Date and Month': newForm['End Date and Month'] || null,
        'Dispatch address': newForm['Dispatch address'] || null,
        'Email Sent': newForm['Email Sent'] || null,
      };

      const attempt = async (body: unknown) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'xc-token': nocoToken,
            'Content-Type': 'application/json',
            'accept': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
      };

      try {
        await attempt([payload]);
      } catch {
        await attempt(payload);
      }

      closeNewDialog();
      await loadData();
    } catch (e: unknown) {
      setNewError((e as Error)?.message || 'Failed to create subscription');
    } finally {
      setNewSaving(false);
    }
  }, [closeNewDialog, loadData, nocoToken, newForm]);

  // Initialize edit state when opening a different record
  useEffect(() => {
    if (!detailRow) return;
    if (detailsInitId === detailRow.Id) return;

    const months: Record<string, string> = {};
    for (let i = 1; i <= 12; i++) {
      const key = `Month ${i}`;
      months[key] = (detailRow[key as keyof SubscriptionRow] as string) || '';
    }
    setEditMonths(months);
    setEditMode(false);
    setSaveError('');

    setDetailsForm({
      City: String(detailRow.City || ''),
      'Dispatch address': String(detailRow['Dispatch address'] || ''),
      'Selected subscription plan': String(detailRow['Selected subscription plan'] || ''),
      'Amount collected': String(detailRow['Amount collected'] || ''),
      'No of 450 gram packs/Month': String(detailRow['No of 450 gram packs/Month'] || ''),
      'confirmed  date of Dispatch': String(detailRow['confirmed  date of Dispatch'] || ''),
      'Start Date and Month': String(detailRow['Start Date and Month'] || ''),
      'End Date and Month': String(detailRow['End Date and Month'] || ''),
      'Email Sent': String(detailRow['Email Sent'] || ''),
    });
    setDetailsEditMode(false);
    setDetailsSaveError('');
    setDetailsInitId(detailRow.Id);
  }, [detailRow, detailsInitId]);

  // Save months to NocoDB
  const saveMonths = useCallback(async () => {
    if (!detailRow) return;
    try {
      setSaving(true);
      setSaveError('');
      const url = `https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mt68ug4tshyfwao/records`;
      const payload = {
        Id: detailRow.Id,
        'Month 1': editMonths['Month 1'] || null,
        'Month 2': editMonths['Month 2'] || null,
        'Month 3': editMonths['Month 3'] || null,
        'Month 4': editMonths['Month 4'] || null,
        'Month 5': editMonths['Month 5'] || null,
        'Month 6': editMonths['Month 6'] || null,
        'Month 7': editMonths['Month 7'] || null,
        'Month 8': editMonths['Month 8'] || null,
        'Month 9': editMonths['Month 9'] || null,
        'Month 10': editMonths['Month 10'] || null,
        'Month 11': editMonths['Month 11'] || null,
        'Month 12': editMonths['Month 12'] || null,
      };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'xc-token': nocoToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      // Update local state
      setRows(prev => prev.map(r => r.Id === detailRow.Id ? { ...r, ...payload } : r));
      setDetailRow(prev => prev ? { ...prev, ...payload } : null);
      setEditMode(false);
    } catch (e: unknown) {
      setSaveError((e as Error)?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [detailRow, editMonths, nocoToken]);

  const saveSingleMonth = useCallback(async (monthKey: string, status: MonthStatus, orderId: string) => {
    if (!detailRow) return;
    try {
      setMonthPickerSaving(true);
      setMonthPickerError('');

      const normalizedOrderId = String(orderId || '').trim();
      let value: string | null = null;
      if (status === 'delivered') value = normalizedOrderId ? `Delivered ${normalizedOrderId}` : 'Delivered';
      else if (status === 'packed') value = normalizedOrderId ? `Packed ${normalizedOrderId}` : 'Packed';
      else if (status === 'placed') value = normalizedOrderId ? `Placed ${normalizedOrderId}` : 'Placed';
      else if (status === 'pending') value = 'Pending';
      else value = null;

      const url = `https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mt68ug4tshyfwao/records`;
      const payload: Record<string, string | number | null> = { Id: detailRow.Id };
      payload[monthKey] = value;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'xc-token': nocoToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setRows(prev => prev.map(r => (r.Id === detailRow.Id ? { ...r, ...payload } : r)));
      setDetailRow(prev => (prev ? { ...prev, ...payload } : null));
      setEditMonths(prev => ({ ...prev, [monthKey]: value || '' }));
      setMonthPickerKey('');
    } catch (e: unknown) {
      setMonthPickerError((e as Error)?.message || 'Failed to save');
    } finally {
      setMonthPickerSaving(false);
    }
  }, [detailRow, nocoToken]);

  const saveDetails = useCallback(async () => {
    if (!detailRow) return;
    try {
      setDetailsSaving(true);
      setDetailsSaveError('');
      const url = `https://app-nocodb.9krcxo.easypanel.host/api/v2/tables/mt68ug4tshyfwao/records`;
      const payload: Record<string, string | number | null> = {
        Id: detailRow.Id,
        City: detailsForm.City || null,
        'Dispatch address': detailsForm['Dispatch address'] || null,
        'Selected subscription plan': detailsForm['Selected subscription plan'] || null,
        'Amount collected': detailsForm['Amount collected'] || null,
        'No of 450 gram packs/Month': detailsForm['No of 450 gram packs/Month'] || null,
        'confirmed  date of Dispatch': detailsForm['confirmed  date of Dispatch'] || null,
        'Start Date and Month': detailsForm['Start Date and Month'] || null,
        'End Date and Month': detailsForm['End Date and Month'] || null,
        'Email Sent': detailsForm['Email Sent'] || null,
      };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'xc-token': nocoToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setRows(prev => prev.map(r => (r.Id === detailRow.Id ? { ...r, ...payload } : r)));
      setDetailRow(prev => (prev ? { ...prev, ...payload } : null));
      setDetailsEditMode(false);
    } catch (e: unknown) {
      setDetailsSaveError((e as Error)?.message || 'Failed to save');
    } finally {
      setDetailsSaving(false);
    }
  }, [detailRow, detailsForm, nocoToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load order history from Supabase to determine purchase counts
  const loadOrderHistory = useCallback(async () => {
    try {
      setOrderHistoryLoading(true);
      const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_repeat_orders_with_assignments`;
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        console.warn('Failed to load order history:', await res.text());
        return;
      }
      const data = await res.json();
      const phoneMap = new Map<string, number>();
      if (Array.isArray(data)) {
        for (const row of data) {
          const phone = String(row.phone || '').replace(/\D/g, '').slice(-10);
          if (phone.length >= 10) {
            phoneMap.set(phone, row.order_count || 1);
          }
        }
      }
      setOrderHistory(phoneMap);
    } catch (e) {
      console.warn('Failed to load order history:', e);
    } finally {
      setOrderHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrderHistory();
  }, [loadOrderHistory]);

  // Derived: unique agents, plans, cities
  const agents = useMemo(() => Array.from(new Set(rows.map(r => r.Agent || '').filter(Boolean))).sort(), [rows]);
  const plans = useMemo(() => Array.from(new Set(rows.map(r => r['Selected subscription plan'] || '').filter(Boolean))).sort(), [rows]);
  const cities = useMemo(() => Array.from(new Set(rows.map(r => r.City || '').filter(Boolean))).sort(), [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    const fromTs = filterFrom ? toLocalDayStartTs(filterFrom) : NaN;
    const toTs = filterTo ? toLocalDayEndTs(filterTo) : NaN;
    return rows.filter(r => {
      if (filterAgent && r.Agent !== filterAgent) return false;
      if (filterPlan && r['Selected subscription plan'] !== filterPlan) return false;
      if (filterCity && r.City !== filterCity) return false;

      if (filterFrom || filterTo) {
        const dRaw = String(r.Date || '').trim();
        if (!dRaw) return false;
        const rTs = new Date(dRaw).getTime();
        if (!Number.isFinite(rTs)) return false;
        if (Number.isFinite(fromTs) && rTs < fromTs) return false;
        if (Number.isFinite(toTs) && rTs > toTs) return false;
      }

      if (qLower) {
        const haystack = [
          r.Name, r['Contact Number'], r.City, r.Agent, r['Selected subscription plan'], r['Dispatch address']
        ].join(' ').toLowerCase();
        if (!haystack.includes(qLower)) return false;
      }
      return true;
    });
  }, [rows, q, filterAgent, filterPlan, filterCity, filterFrom, filterTo]);

  const planBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const p = String(r['Selected subscription plan'] || '').trim() || '(Empty)';
      m.set(p, (m.get(p) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const totalSubs = filtered.length;
    const totalRevenue = filtered.reduce((sum, r) => {
      const amt = Number((r['Amount collected'] || '').replace(/[^0-9.-]/g, ''));
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const uniqueAgents = new Set(filtered.map(r => r.Agent || '').filter(Boolean)).size;
    const uniqueCities = new Set(filtered.map(r => r.City || '').filter(Boolean)).size;
    return { totalSubs, totalRevenue, uniqueAgents, uniqueCities };
  }, [filtered]);

  // Agent-wise analytics: subscription conversions by customer purchase history
  const agentAnalytics = useMemo(() => {
    type AgentStats = {
      agent: string;
      total: number;
      t1: number;   // 1 order
      t2: number;   // 2 orders
      t3: number;   // 3 orders
      t4: number;   // 4 orders
      t5: number;   // 5 orders
      t6: number;   // 6 orders
      t7: number;   // 7 orders
      t8: number;   // 8 orders
      t9: number;   // 9 orders
      t10: number;  // 10 orders
      t11: number;  // 11 orders
      t12plus: number; // 12+ orders
      unknown: number; // not found in order history
    };
    const statsMap = new Map<string, AgentStats>();

    for (const sub of filtered) {
      const agent = String(sub.Agent || '').trim() || '(Unknown)';
      const phone = String(sub['Contact Number'] || '').replace(/\D/g, '').slice(-10);

      if (!statsMap.has(agent)) {
        statsMap.set(agent, {
          agent,
          total: 0,
          t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0,
          t7: 0, t8: 0, t9: 0, t10: 0, t11: 0, t12plus: 0,
          unknown: 0,
        });
      }
      const stats = statsMap.get(agent)!;
      stats.total++;

      if (phone.length < 10) {
        stats.unknown++;
        continue;
      }

      const orderCount = orderHistory.get(phone);
      if (orderCount === undefined) {
        stats.unknown++;
      } else if (orderCount === 1) {
        stats.t1++;
      } else if (orderCount === 2) {
        stats.t2++;
      } else if (orderCount === 3) {
        stats.t3++;
      } else if (orderCount === 4) {
        stats.t4++;
      } else if (orderCount === 5) {
        stats.t5++;
      } else if (orderCount === 6) {
        stats.t6++;
      } else if (orderCount === 7) {
        stats.t7++;
      } else if (orderCount === 8) {
        stats.t8++;
      } else if (orderCount === 9) {
        stats.t9++;
      } else if (orderCount === 10) {
        stats.t10++;
      } else if (orderCount === 11) {
        stats.t11++;
      } else {
        stats.t12plus++;
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
  }, [filtered, orderHistory]);

  // Drill-down: open modal with filtered subscriptions
  const openDrill = useCallback((agent: string, tier: string) => {
    const matchingRows = filtered.filter(sub => {
      const subAgent = String(sub.Agent || '').trim() || '(Unknown)';
      if (agent !== 'all' && subAgent !== agent) return false;

      const phone = String(sub['Contact Number'] || '').replace(/\D/g, '').slice(-10);
      const orderCount = phone.length >= 10 ? orderHistory.get(phone) : undefined;

      if (tier === 'total') return true;
      if (tier === 'unknown') return orderCount === undefined || phone.length < 10;
      if (tier === 't1') return orderCount === 1;
      if (tier === 't2') return orderCount === 2;
      if (tier === 't3') return orderCount === 3;
      if (tier === 't4') return orderCount === 4;
      if (tier === 't5') return orderCount === 5;
      if (tier === 't6') return orderCount === 6;
      if (tier === 't7') return orderCount === 7;
      if (tier === 't8') return orderCount === 8;
      if (tier === 't9') return orderCount === 9;
      if (tier === 't10') return orderCount === 10;
      if (tier === 't11') return orderCount === 11;
      if (tier === 't12plus') return orderCount !== undefined && orderCount >= 12;
      return false;
    });

    setDrillAgent(agent);
    setDrillTier(tier);
    setDrillRows(matchingRows);
  }, [filtered, orderHistory]);

  const closeDrill = useCallback(() => {
    setDrillAgent('');
    setDrillTier('');
    setDrillRows([]);
  }, []);

  const tierLabels: Record<string, string> = {
    total: 'Total Subscriptions',
    t1: '1st Time Buyers (1 order)',
    t2: '2nd Time Buyers (2 orders)',
    t3: '3rd Time Buyers (3 orders)',
    t4: '4th Time Buyers (4 orders)',
    t5: '5th Time Buyers (5 orders)',
    t6: '6th Time Buyers (6 orders)',
    t7: '7th Time Buyers (7 orders)',
    t8: '8th Time Buyers (8 orders)',
    t9: '9th Time Buyers (9 orders)',
    t10: '10th Time Buyers (10 orders)',
    t11: '11th Time Buyers (11 orders)',
    t12plus: '12+ Time Buyers (loyal customers)',
    unknown: 'New Customers (no order history)',
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSlice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  // Month columns
  const monthCols = Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);

  const agentOptions = useMemo(() => {
    const base = [...agents];
    const me = String(currentUser || '').trim();
    if (me && !base.some(a => String(a).trim().toLowerCase() === me.toLowerCase())) base.unshift(me);
    return base;
  }, [agents, currentUser]);

  const planOptions = useMemo(() => {
    const base = [...plans];
    return base;
  }, [plans]);

  const packsOptions = useMemo(() => {
    const raw = rows
      .map(r => String(r['No of 450 gram packs/Month'] || '').trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(raw));
    uniq.sort((a, b) => {
      const na = Number(a.replace(/[^0-9.-]/g, ''));
      const nb = Number(b.replace(/[^0-9.-]/g, ''));
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;
      return a.localeCompare(b);
    });
    return uniq;
  }, [rows]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Subscription Dashboard</h1>
          <p className="text-sm text-gray-500">Track and manage product subscriptions</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton onClick={() => {
            setNewDialogOpen(true);
            setNewError('');
            if (String(currentUser || '').trim()) {
              setNewForm(p => ({ ...p, Agent: p.Agent || String(currentUser || '').trim() }));
            }
            setNewPlanMode('select');
            setNewPacksMode('select');
          }} disabled={loading} title="New subscription" tone="primary">
            <Plus className="w-4 h-4" /> New
          </IconButton>
          <IconButton onClick={loadData} disabled={loading} title="Reload data">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Reload
          </IconButton>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500">Total Subscriptions</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{loading ? '…' : kpis.totalSubs}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Package className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500">Total Revenue</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{loading ? '…' : formatCurrency(String(kpis.totalRevenue))}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <IndianRupee className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500">Agents</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{loading ? '…' : kpis.uniqueAgents}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500">Cities</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{loading ? '…' : kpis.uniqueCities}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <MapPin className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Plans breakdown</div>
                <div className="text-xs text-gray-500">Top plans by subscription count</div>
              </div>
            </div>
            {!loading && (
              <div className="text-xs text-gray-500">{planBreakdown.length} plans</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(loading ? [] : planBreakdown.slice(0, 9)).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2">
                <div className="truncate text-sm text-gray-800" title={plan}>{plan}</div>
                <div className="shrink-0 rounded-lg bg-white border px-2 py-0.5 text-xs font-semibold text-gray-900">
                  {count}
                </div>
              </div>
            ))}
            {!loading && planBreakdown.length === 0 && (
              <div className="text-gray-400 text-sm">—</div>
            )}
          </div>
        </div>

        {/* Agent Analytics - Conversion by Customer Purchase History */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <button
            onClick={() => setShowAgentAnalytics(!showAgentAnalytics)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-gray-900">Agent Conversion Analytics</div>
                <div className="text-xs text-gray-500">Subscription conversions by customer purchase history</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {orderHistoryLoading && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading history...
                </span>
              )}
              {showAgentAnalytics ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>

          {showAgentAnalytics && (
            <div className="border-t">
              {agentAnalytics.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No subscription data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-gray-600 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold sticky left-0 bg-slate-50 z-10">Agent</th>
                        <th className="text-center px-2 py-2 font-semibold">Total</th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">1st</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">2nd</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">3rd</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">4th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">5th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">6th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">7th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">8th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">9th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">10th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">11th</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">12+</div></th>
                        <th className="text-center px-2 py-2 font-semibold"><div className="text-[10px]">New</div></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agentAnalytics.map((stats) => (
                        <tr key={stats.agent} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-[10px]">
                                {stats.agent.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 text-xs">{stats.agent}</span>
                            </div>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.total > 0 && openDrill(stats.agent, 'total')} disabled={stats.total === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-800 font-bold text-[10px]', stats.total > 0 && 'hover:ring-2 hover:ring-gray-300 cursor-pointer')}>{stats.total}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t1 > 0 && openDrill(stats.agent, 't1')} disabled={stats.t1 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t1 > 0 ? 'bg-blue-100 text-blue-700 hover:ring-2 hover:ring-blue-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t1}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t2 > 0 && openDrill(stats.agent, 't2')} disabled={stats.t2 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t2 > 0 ? 'bg-emerald-100 text-emerald-700 hover:ring-2 hover:ring-emerald-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t2}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t3 > 0 && openDrill(stats.agent, 't3')} disabled={stats.t3 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t3 > 0 ? 'bg-amber-100 text-amber-700 hover:ring-2 hover:ring-amber-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t3}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t4 > 0 && openDrill(stats.agent, 't4')} disabled={stats.t4 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t4 > 0 ? 'bg-purple-100 text-purple-700 hover:ring-2 hover:ring-purple-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t4}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t5 > 0 && openDrill(stats.agent, 't5')} disabled={stats.t5 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t5 > 0 ? 'bg-pink-100 text-pink-700 hover:ring-2 hover:ring-pink-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t5}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t6 > 0 && openDrill(stats.agent, 't6')} disabled={stats.t6 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t6 > 0 ? 'bg-cyan-100 text-cyan-700 hover:ring-2 hover:ring-cyan-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t6}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t7 > 0 && openDrill(stats.agent, 't7')} disabled={stats.t7 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t7 > 0 ? 'bg-orange-100 text-orange-700 hover:ring-2 hover:ring-orange-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t7}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t8 > 0 && openDrill(stats.agent, 't8')} disabled={stats.t8 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t8 > 0 ? 'bg-teal-100 text-teal-700 hover:ring-2 hover:ring-teal-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t8}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t9 > 0 && openDrill(stats.agent, 't9')} disabled={stats.t9 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t9 > 0 ? 'bg-rose-100 text-rose-700 hover:ring-2 hover:ring-rose-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t9}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t10 > 0 && openDrill(stats.agent, 't10')} disabled={stats.t10 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t10 > 0 ? 'bg-lime-100 text-lime-700 hover:ring-2 hover:ring-lime-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t10}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t11 > 0 && openDrill(stats.agent, 't11')} disabled={stats.t11 === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t11 > 0 ? 'bg-violet-100 text-violet-700 hover:ring-2 hover:ring-violet-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t11}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.t12plus > 0 && openDrill(stats.agent, 't12plus')} disabled={stats.t12plus === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.t12plus > 0 ? 'bg-indigo-100 text-indigo-700 hover:ring-2 hover:ring-indigo-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.t12plus}</button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button onClick={() => stats.unknown > 0 && openDrill(stats.agent, 'unknown')} disabled={stats.unknown === 0} className={clsx('inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-[10px] font-semibold', stats.unknown > 0 ? 'bg-slate-100 text-slate-600 hover:ring-2 hover:ring-slate-300 cursor-pointer' : 'bg-gray-50 text-gray-400')}>{stats.unknown}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td className="px-4 py-2 font-bold text-gray-900 text-xs sticky left-0 bg-slate-50 z-10">Total</td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-900 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.total, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-blue-200 text-blue-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t1, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t2, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t3, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t4, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-pink-200 text-pink-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t5, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-cyan-200 text-cyan-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t6, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t7, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-teal-200 text-teal-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t8, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t9, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-lime-200 text-lime-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t10, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-violet-200 text-violet-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t11, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-800 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.t12plus, 0)}</span></td>
                        <td className="text-center px-2 py-2"><span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px]">{agentAnalytics.reduce((s, a) => s + a.unknown, 0)}</span></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="px-4 py-2 bg-slate-50 border-t flex items-center gap-2 text-[10px] text-slate-500">
                <TrendingUp className="w-3 h-3" />
                <span>
                  <strong>1st-11th:</strong> Number of previous orders before subscription | 
                  <strong> 12+:</strong> Super loyal customers | 
                  <strong> New:</strong> No order history (new customer)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 border">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Name, phone, city, address…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Agent</label>
            <select
              value={filterAgent}
              onChange={(e) => { setFilterAgent(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm min-w-[140px]"
              title="Filter by agent"
            >
              <option value="">All Agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Plan</label>
            <select
              value={filterPlan}
              onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm min-w-[180px]"
              title="Filter by plan"
            >
              <option value="">All Plans</option>
              {plans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">City</label>
            <select
              value={filterCity}
              onChange={(e) => { setFilterCity(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm min-w-[140px]"
              title="Filter by city"
            >
              <option value="">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm min-w-[150px]"
              title="Filter from date"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm min-w-[150px]"
              title="Filter to date"
            />
          </div>
          {(filterAgent || filterPlan || filterCity || q) && (
            <button
              onClick={() => { setFilterAgent(''); setFilterPlan(''); setFilterCity(''); setFilterFrom(''); setFilterTo(''); setQ(''); setPage(1); }}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {newDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeNewDialog}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h2 className="text-lg font-bold text-gray-800">New Subscription</h2>
                <p className="text-sm text-gray-500">Create a new subscription record</p>
              </div>
              <button onClick={closeNewDialog} className="p-2 hover:bg-gray-100 rounded-full" title="Close" disabled={newSaving}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {newError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {newError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Date"
                    value={newForm.Date}
                    onChange={(e) => setNewForm(p => ({ ...p, Date: e.target.value }))}
                    disabled={newSaving}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Agent</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Agent"
                    value={newForm.Agent}
                    onChange={(e) => setNewForm(p => ({ ...p, Agent: e.target.value }))}
                    disabled={newSaving}
                  >
                    <option value="">(Select)</option>
                    {agentOptions.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Customer Name</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Customer name"
                    value={newForm.Name}
                    onChange={(e) => setNewForm(p => ({ ...p, Name: e.target.value }))}
                    disabled={newSaving}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Contact Number</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Contact number"
                    value={newForm['Contact Number']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'Contact Number': e.target.value }))}
                    disabled={newSaving}
                    placeholder="Phone"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">City</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="City"
                    value={newForm.City}
                    onChange={(e) => setNewForm(p => ({ ...p, City: e.target.value }))}
                    disabled={newSaving}
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Plan</label>
                  {newPlanMode === 'custom' ? (
                    <input
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      title="Plan"
                      value={newForm['Selected subscription plan']}
                      onChange={(e) => setNewForm(p => ({ ...p, 'Selected subscription plan': e.target.value }))}
                      disabled={newSaving}
                      placeholder="Enter custom plan"
                    />
                  ) : (
                    <select
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      title="Plan"
                      value={newForm['Selected subscription plan']}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__custom__') {
                          setNewPlanMode('custom');
                          setNewForm(p => ({ ...p, 'Selected subscription plan': '' }));
                          return;
                        }
                        setNewForm(p => ({ ...p, 'Selected subscription plan': v }));
                      }}
                      disabled={newSaving}
                    >
                      <option value="">(Select)</option>
                      {planOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Amount Collected</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Amount collected"
                    value={newForm['Amount collected']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'Amount collected': e.target.value }))}
                    disabled={newSaving}
                    placeholder="Amount"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Packs / Month</label>
                  {newPacksMode === 'custom' ? (
                    <input
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      title="Packs per month"
                      value={newForm['No of 450 gram packs/Month']}
                      onChange={(e) => setNewForm(p => ({ ...p, 'No of 450 gram packs/Month': e.target.value }))}
                      disabled={newSaving}
                      placeholder="Enter packs/month"
                    />
                  ) : (
                    <select
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      title="Packs per month"
                      value={newForm['No of 450 gram packs/Month']}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__custom__') {
                          setNewPacksMode('custom');
                          setNewForm(p => ({ ...p, 'No of 450 gram packs/Month': '' }));
                          return;
                        }
                        setNewForm(p => ({ ...p, 'No of 450 gram packs/Month': v }));
                      }}
                      disabled={newSaving}
                    >
                      <option value="">(Select)</option>
                      {packsOptions.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Dispatch Date</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Dispatch date"
                    value={newForm['confirmed  date of Dispatch']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'confirmed  date of Dispatch': e.target.value }))}
                    disabled={newSaving}
                    placeholder="Dispatch"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Start Date and Month</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Start date"
                    value={newForm['Start Date and Month']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'Start Date and Month': e.target.value }))}
                    disabled={newSaving}
                    placeholder="Start"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">End Date and Month</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="End date"
                    value={newForm['End Date and Month']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'End Date and Month': e.target.value }))}
                    disabled={newSaving}
                    placeholder="End"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Email Sent</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Email sent"
                    value={newForm['Email Sent']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'Email Sent': e.target.value }))}
                    disabled={newSaving}
                  >
                    <option value="">(Empty)</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Dispatch Address</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    title="Dispatch address"
                    value={newForm['Dispatch address']}
                    onChange={(e) => setNewForm(p => ({ ...p, 'Dispatch address': e.target.value }))}
                    disabled={newSaving}
                    rows={3}
                    placeholder="Address"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                  onClick={closeNewDialog}
                  disabled={newSaving}
                  title="Cancel"
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
                  onClick={createNewSubscription}
                  disabled={newSaving}
                  title="Create"
                >
                  {newSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {newSaving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2 whitespace-nowrap">ID</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Customer</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Contact</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">City</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Agent</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Plan</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Amount</th>
                <th className="text-center px-3 py-2 whitespace-nowrap">Packs/Mo</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Start</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">End</th>
                <th className="text-center px-3 py-2 whitespace-nowrap">Email</th>
                {/* Month columns */}
                {monthCols.map(m => (
                  <th key={m} className="text-center px-2 py-2 whitespace-nowrap text-xs">{m.replace('Month ', 'M')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11 + monthCols.length} className="text-center py-8 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading subscriptions…
                  </td>
                </tr>
              ) : pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={11 + monthCols.length} className="text-center py-8 text-gray-500">
                    No subscriptions found
                  </td>
                </tr>
              ) : (
                pageSlice.map(r => (
                  <tr
                    key={r.Id}
                    className="border-t hover:bg-indigo-50 cursor-pointer transition"
                    onClick={() => setDetailRow(r)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.Id}</td>
                    <td className="px-3 py-2 font-medium max-w-[160px] truncate" title={r.Name || ''}>{r.Name || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`tel:${r['Contact Number']}`} className="text-indigo-600 hover:underline flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {r['Contact Number'] || '—'}
                      </a>
                    </td>
                    <td className="px-3 py-2">{r.City || '—'}</td>
                    <td className="px-3 py-2">{r.Agent || '—'}</td>
                    <td className="px-3 py-2 max-w-[140px] truncate" title={r['Selected subscription plan'] || ''}>
                      {r['Selected subscription plan'] || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                      {formatCurrency(r['Amount collected'])}
                    </td>
                    <td className="px-3 py-2 text-center">{r['No of 450 gram packs/Month'] || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{r['Start Date and Month'] || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{r['End Date and Month'] || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {r['Email Sent']?.toLowerCase() === 'yes' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><Mail className="w-3 h-3" /> Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    {/* Month status cells */}
                    {monthCols.map(m => {
                      const val = r[m as keyof SubscriptionRow] as string | null;
                      const { status, orderId } = getMonthStatus(val);
                      return (
                        <td key={m} className="px-1 py-2 text-center">
                          <span
                            className={clsx(
                              'inline-block px-1.5 py-0.5 rounded text-[10px] border',
                              statusColors[status]
                            )}
                            title={val || 'Pending'}
                          >
                            {status === 'delivered' ? '✓' : status === 'packed' ? '▣' : status === 'placed' ? '◷' : '—'}
                            {orderId && <span className="ml-0.5 font-mono">{orderId.slice(-4)}</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
          <div className="text-xs text-gray-600">
            Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border rounded px-2 py-1 text-xs"
              title="Rows per page"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-40"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDetail}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detailRow.Name || 'Subscription Details'}</h2>
                <p className="text-sm text-gray-500">ID: {detailRow.Id}</p>
              </div>
              <div className="flex items-center gap-2">
                {detailsEditMode ? (
                  <>
                    <button
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
                      onClick={() => { setDetailsEditMode(false); setDetailsSaveError(''); }}
                      disabled={detailsSaving}
                      title="Cancel"
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
                      onClick={saveDetails}
                      disabled={detailsSaving}
                      title="Save"
                    >
                      {detailsSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      {detailsSaving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
                    onClick={() => { setDetailsEditMode(true); setDetailsSaveError(''); }}
                    title="Edit Details"
                  >
                    <Edit3 className="w-3 h-3" /> Edit Details
                  </button>
                )}
                <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-full" title="Close">
                <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {detailsSaveError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {detailsSaveError}
                </div>
              )}
              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Customer Name</div>
                    <div className="font-medium">{detailRow.Name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Contact Number</div>
                    <a href={`tel:${detailRow['Contact Number']}`} className="text-indigo-600 hover:underline flex items-center gap-1">
                      <Phone className="w-4 h-4" /> {detailRow['Contact Number'] || '—'}
                    </a>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">City</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="City"
                        value={detailsForm.City || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, City: e.target.value }))}
                      />
                    ) : (
                      <div className="flex items-center gap-1"><MapPin className="w-4 h-4 text-gray-400" /> {detailRow.City || '—'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Agent</div>
                    <div className="flex items-center gap-1"><Users className="w-4 h-4 text-gray-400" /> {detailRow.Agent || '—'}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Subscription Plan</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Subscription plan"
                        value={detailsForm['Selected subscription plan'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'Selected subscription plan': e.target.value }))}
                      />
                    ) : (
                      <div className="font-medium text-indigo-700">{detailRow['Selected subscription plan'] || '—'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Amount Collected</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Amount collected"
                        value={detailsForm['Amount collected'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'Amount collected': e.target.value }))}
                      />
                    ) : (
                      <div className="text-xl font-bold text-emerald-700">{formatCurrency(detailRow['Amount collected'])}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Packs per Month</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Packs per month"
                        value={detailsForm['No of 450 gram packs/Month'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'No of 450 gram packs/Month': e.target.value }))}
                      />
                    ) : (
                      <div>{detailRow['No of 450 gram packs/Month'] || '—'} × 450g</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Email Sent</div>
                    {detailsEditMode ? (
                      <select
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Email sent"
                        value={detailsForm['Email Sent'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'Email Sent': e.target.value }))}
                      >
                        <option value="">(Empty)</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <div className={detailRow['Email Sent']?.toLowerCase() === 'yes' ? 'text-emerald-600' : 'text-gray-500'}>
                        {detailRow['Email Sent'] || 'No'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="bg-slate-50 rounded-lg p-4 border">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" /> Subscription Schedule
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Dispatch Date</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Dispatch date"
                        value={detailsForm['confirmed  date of Dispatch'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'confirmed  date of Dispatch': e.target.value }))}
                      />
                    ) : (
                      <div className="font-medium">{detailRow['confirmed  date of Dispatch'] || '—'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Start</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="Start date"
                        value={detailsForm['Start Date and Month'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'Start Date and Month': e.target.value }))}
                      />
                    ) : (
                      <div className="font-medium">{detailRow['Start Date and Month'] || '—'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">End</div>
                    {detailsEditMode ? (
                      <input
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        title="End date"
                        value={detailsForm['End Date and Month'] || ''}
                        onChange={(e) => setDetailsForm(p => ({ ...p, 'End Date and Month': e.target.value }))}
                      />
                    ) : (
                      <div className="font-medium">{detailRow['End Date and Month'] || '—'}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Dispatch Address</div>
                {detailsEditMode ? (
                  <textarea
                    className="w-full bg-gray-50 rounded-lg p-3 border text-sm"
                    title="Dispatch address"
                    rows={4}
                    value={detailsForm['Dispatch address'] || ''}
                    onChange={(e) => setDetailsForm(p => ({ ...p, 'Dispatch address': e.target.value }))}
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 border text-sm whitespace-pre-wrap">
                    {detailRow['Dispatch address'] || '—'}
                  </div>
                )}
              </div>

              {/* Month-by-Month Tracking */}
              <div>
                <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" /> Monthly Delivery Tracking
                  </div>
                  <div className="flex items-center gap-2">
                    {editMode ? (
                      <>
                        <button
                          onClick={() => setEditMode(false)}
                          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveMonths}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditMode(true)}
                        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Edit Months
                      </button>
                    )}
                  </div>
                </div>

                {saveError && (
                  <div className="mb-3 p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {saveError}
                  </div>
                )}

                {editMode ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {monthCols.map((m, idx) => (
                      <div key={m} className="bg-white border rounded-lg p-3">
                        <label className="block text-xs text-gray-500 mb-1.5">Month {idx + 1}</label>
                        <input
                          type="text"
                          value={editMonths[m] || ''}
                          onChange={(e) => setEditMonths(prev => ({ ...prev, [m]: e.target.value }))}
                          placeholder="e.g. Delivered #12345"
                          className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <div className="text-[10px] text-gray-400 mt-1">
                          Format: "Delivered #OrderID" or "Placed #OrderID"
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {monthCols.map((m, idx) => {
                      const val = detailRow[m as keyof SubscriptionRow] as string | null;
                      const { status, orderId } = getMonthStatus(val);
                      return (
                        <button
                          key={m}
                          type="button"
                          title="Update month status"
                          onClick={() => {
                            setMonthPickerKey(m);
                            setMonthPickerError('');
                            const parsed = getMonthStatus(val);
                            setMonthPickerStatus(parsed.status === 'empty' ? 'pending' : parsed.status);
                            setMonthPickerOrderId(parsed.orderId);
                          }}
                          className={clsx(
                            'rounded-lg border p-3 text-center w-full hover:shadow-sm transition',
                            status === 'delivered' ? 'bg-emerald-50 border-emerald-300' :
                            status === 'packed' ? 'bg-sky-50 border-sky-300' :
                            status === 'placed' ? 'bg-amber-50 border-amber-300' :
                            status === 'pending' ? 'bg-slate-50 border-slate-300' :
                            'bg-gray-50 border-gray-200'
                          )}
                        >
                          <div className="text-xs text-gray-500 mb-1">Month {idx + 1}</div>
                          <div className="flex items-center justify-center gap-1">
                            {status === 'delivered' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : status === 'packed' ? (
                              <Package className="w-4 h-4 text-sky-600" />
                            ) : status === 'placed' ? (
                              <Clock className="w-4 h-4 text-amber-600" />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>
                          {orderId && (
                            <div className="text-[10px] font-mono text-gray-600 mt-1 truncate" title={orderId}>
                              #{orderId}
                            </div>
                          )}
                          <div className="text-[10px] mt-1 capitalize text-gray-600">
                            {status === 'empty' ? 'Pending' : status}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {monthPickerKey && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setMonthPickerKey('')}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md border" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <div className="font-semibold text-sm">Update {monthPickerKey}</div>
                      <button className="p-2 hover:bg-gray-100 rounded-full" title="Close" onClick={() => setMonthPickerKey('')}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {monthPickerError && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> {monthPickerError}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Status</label>
                        <select
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          title="Select status"
                          value={monthPickerStatus}
                          onChange={(e) => setMonthPickerStatus(e.target.value as MonthStatus)}
                          disabled={monthPickerSaving}
                        >
                          <option value="pending">Pending</option>
                          <option value="packed">Packed</option>
                          <option value="placed">Placed</option>
                          <option value="delivered">Delivered</option>
                          <option value="empty">Clear</option>
                        </select>
                      </div>

                      {(monthPickerStatus === 'packed' || monthPickerStatus === 'placed' || monthPickerStatus === 'delivered') && (
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Order ID (optional)</label>
                          <input
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                            title="Order ID"
                            value={monthPickerOrderId}
                            onChange={(e) => setMonthPickerOrderId(e.target.value)}
                            disabled={monthPickerSaving}
                            placeholder="#12345"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                          onClick={() => setMonthPickerKey('')}
                          disabled={monthPickerSaving}
                          title="Cancel"
                        >
                          Cancel
                        </button>
                        <button
                          className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
                          onClick={() => saveSingleMonth(monthPickerKey, monthPickerStatus, monthPickerOrderId)}
                          disabled={monthPickerSaving}
                          title="Save"
                        >
                          {monthPickerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {monthPickerSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Modal */}
      {drillRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDrill}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-emerald-50 to-white">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {drillAgent === 'all' ? 'All Agents' : drillAgent} — {tierLabels[drillTier] || drillTier}
                </h2>
                <p className="text-sm text-gray-500">{drillRows.length} subscription{drillRows.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={closeDrill} className="p-2 hover:bg-gray-100 rounded-full" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Name</th>
                    <th className="text-left px-3 py-3 font-semibold">Phone</th>
                    <th className="text-left px-3 py-3 font-semibold">City</th>
                    <th className="text-left px-3 py-3 font-semibold">Plan</th>
                    <th className="text-right px-3 py-3 font-semibold">Amount</th>
                    <th className="text-center px-3 py-3 font-semibold">Orders</th>
                    <th className="text-left px-3 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillRows.map((row) => {
                    const phone = String(row['Contact Number'] || '').replace(/\D/g, '').slice(-10);
                    const orderCount = phone.length >= 10 ? orderHistory.get(phone) : undefined;
                    return (
                      <tr key={row.Id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setDetailRow(row); closeDrill(); }}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{row.Name || '—'}</div>
                          <div className="text-xs text-gray-500">{row.Agent || '—'}</div>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{row['Contact Number'] || '—'}</td>
                        <td className="px-3 py-3 text-gray-700">{row.City || '—'}</td>
                        <td className="px-3 py-3">
                          <span className="inline-block max-w-[150px] truncate text-gray-700" title={row['Selected subscription plan'] || ''}>
                            {row['Selected subscription plan'] || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-gray-900">{formatCurrency(row['Amount collected'])}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={clsx(
                            'inline-flex items-center justify-center min-w-[28px] px-2 py-1 rounded-full text-xs font-bold',
                            orderCount === undefined ? 'bg-slate-100 text-slate-600' :
                            orderCount === 1 ? 'bg-blue-100 text-blue-700' :
                            orderCount === 2 ? 'bg-emerald-100 text-emerald-700' :
                            orderCount === 3 ? 'bg-amber-100 text-amber-700' :
                            'bg-purple-100 text-purple-700'
                          )}>
                            {orderCount === undefined ? 'New' : orderCount}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.Date || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 text-xs text-gray-500">
              Click on a row to view full subscription details
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
