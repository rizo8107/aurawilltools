import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCcw, Search, Loader2, ChevronLeft, ChevronRight, X, Calendar, Package, Users, IndianRupee, MapPin, Mail, Phone, CheckCircle2, Clock, AlertCircle, Save, Edit3
} from 'lucide-react';

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

const getMonthStatus = (val: string | null): { status: 'delivered' | 'placed' | 'pending' | 'empty'; orderId: string } => {
  if (!val) return { status: 'empty', orderId: '' };
  const lower = val.toLowerCase();
  if (lower.includes('delivered')) return { status: 'delivered', orderId: val.replace(/delivered\s*/i, '').trim() };
  if (lower.includes('placed')) return { status: 'placed', orderId: val.replace(/placed\s*/i, '').trim() };
  // Just an order number
  return { status: 'placed', orderId: val.trim() };
};

const statusColors: Record<string, string> = {
  delivered: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  placed: 'bg-amber-100 text-amber-800 border-amber-300',
  pending: 'bg-slate-100 text-slate-600 border-slate-300',
  empty: 'bg-gray-50 text-gray-400 border-gray-200',
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

  // Data state
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Filters
  const [q, setQ] = useState<string>('');
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [filterPlan, setFilterPlan] = useState<string>('');
  const [filterCity, setFilterCity] = useState<string>('');

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

  // Initialize edit months when detail row changes
  useEffect(() => {
    if (detailRow) {
      const months: Record<string, string> = {};
      for (let i = 1; i <= 12; i++) {
        const key = `Month ${i}`;
        months[key] = (detailRow[key as keyof SubscriptionRow] as string) || '';
      }
      setEditMonths(months);
      setEditMode(false);
      setSaveError('');
    }
  }, [detailRow]);

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived: unique agents, plans, cities
  const agents = useMemo(() => Array.from(new Set(rows.map(r => r.Agent || '').filter(Boolean))).sort(), [rows]);
  const plans = useMemo(() => Array.from(new Set(rows.map(r => r['Selected subscription plan'] || '').filter(Boolean))).sort(), [rows]);
  const cities = useMemo(() => Array.from(new Set(rows.map(r => r.City || '').filter(Boolean))).sort(), [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filterAgent && r.Agent !== filterAgent) return false;
      if (filterPlan && r['Selected subscription plan'] !== filterPlan) return false;
      if (filterCity && r.City !== filterCity) return false;
      if (qLower) {
        const haystack = [
          r.Name, r['Contact Number'], r.City, r.Agent, r['Selected subscription plan'], r['Dispatch address']
        ].join(' ').toLowerCase();
        if (!haystack.includes(qLower)) return false;
      }
      return true;
    });
  }, [rows, q, filterAgent, filterPlan, filterCity]);

  // KPIs
  const kpis = useMemo(() => {
    const totalSubs = filtered.length;
    const totalRevenue = filtered.reduce((sum, r) => {
      const amt = Number((r['Amount collected'] || '').replace(/[^0-9.-]/g, ''));
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const uniqueAgents = new Set(filtered.map(r => r.Agent || '').filter(Boolean)).size;
    const uniqueCities = new Set(filtered.map(r => r.City || '').filter(Boolean)).size;
    // Count delivered months
    let deliveredCount = 0;
    let placedCount = 0;
    for (const r of filtered) {
      for (let m = 1; m <= 12; m++) {
        const val = r[`Month ${m}` as keyof SubscriptionRow] as string | null;
        const { status } = getMonthStatus(val);
        if (status === 'delivered') deliveredCount++;
        else if (status === 'placed') placedCount++;
      }
    }
    return { totalSubs, totalRevenue, uniqueAgents, uniqueCities, deliveredCount, placedCount };
  }, [filtered]);

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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Subscription Dashboard</h1>
          <p className="text-sm text-gray-500">Track and manage product subscriptions</p>
        </div>
        <IconButton onClick={loadData} disabled={loading} title="Reload data">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Reload
        </IconButton>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Package className="w-5 h-5" />
            <span className="text-xs text-gray-500">Total Subscriptions</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : kpis.totalSubs}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <IndianRupee className="w-5 h-5" />
            <span className="text-xs text-gray-500">Total Revenue</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : formatCurrency(String(kpis.totalRevenue))}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users className="w-5 h-5" />
            <span className="text-xs text-gray-500">Agents</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : kpis.uniqueAgents}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <MapPin className="w-5 h-5" />
            <span className="text-xs text-gray-500">Cities</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : kpis.uniqueCities}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-xs text-gray-500">Delivered</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : kpis.deliveredCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Clock className="w-5 h-5" />
            <span className="text-xs text-gray-500">Placed</span>
          </div>
          <div className="text-2xl font-bold">{loading ? '…' : kpis.placedCount}</div>
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
          {(filterAgent || filterPlan || filterCity || q) && (
            <button
              onClick={() => { setFilterAgent(''); setFilterPlan(''); setFilterCity(''); setQ(''); setPage(1); }}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

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
                            {status === 'delivered' ? '✓' : status === 'placed' ? '◷' : '—'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailRow(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detailRow.Name || 'Subscription Details'}</h2>
                <p className="text-sm text-gray-500">ID: {detailRow.Id}</p>
              </div>
              <button onClick={() => setDetailRow(null)} className="p-2 hover:bg-gray-100 rounded-full" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
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
                    <div className="flex items-center gap-1"><MapPin className="w-4 h-4 text-gray-400" /> {detailRow.City || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Agent</div>
                    <div className="flex items-center gap-1"><Users className="w-4 h-4 text-gray-400" /> {detailRow.Agent || '—'}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Subscription Plan</div>
                    <div className="font-medium text-indigo-700">{detailRow['Selected subscription plan'] || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Amount Collected</div>
                    <div className="text-xl font-bold text-emerald-700">{formatCurrency(detailRow['Amount collected'])}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Packs per Month</div>
                    <div>{detailRow['No of 450 gram packs/Month'] || '—'} × 450g</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Email Sent</div>
                    <div className={detailRow['Email Sent']?.toLowerCase() === 'yes' ? 'text-emerald-600' : 'text-gray-500'}>
                      {detailRow['Email Sent'] || 'No'}
                    </div>
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
                    <div className="font-medium">{detailRow['confirmed  date of Dispatch'] || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Start</div>
                    <div className="font-medium">{detailRow['Start Date and Month'] || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">End</div>
                    <div className="font-medium">{detailRow['End Date and Month'] || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Dispatch Address</div>
                <div className="bg-gray-50 rounded-lg p-3 border text-sm whitespace-pre-wrap">
                  {detailRow['Dispatch address'] || '—'}
                </div>
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
                        <div
                          key={m}
                          className={clsx(
                            'rounded-lg border p-3 text-center',
                            status === 'delivered' ? 'bg-emerald-50 border-emerald-300' :
                            status === 'placed' ? 'bg-amber-50 border-amber-300' :
                            'bg-gray-50 border-gray-200'
                          )}
                        >
                          <div className="text-xs text-gray-500 mb-1">Month {idx + 1}</div>
                          <div className="flex items-center justify-center gap-1">
                            {status === 'delivered' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
