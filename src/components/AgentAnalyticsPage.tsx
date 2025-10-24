import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface NocoRecord {
  id?: string | number;
  [key: string]: any;
}

interface AgentAgg {
  agent: string;
  total: number;
  lastActivity?: string;
}

const NC_BASE = 'https://app-nocodb.9krcxo.easypanel.host';
// Hardcoded NocoDB API token per user request
const NC_TOKEN = 'CdD-fhN2ctMOe-rOGWY5g7ET5BisIDx5r32eJMn4';

// Known tables
const TABLES: Array<{ id: string; label: string; defaultViewId?: string }> = [
  { id: 'm135bs690ngf28r', label: 'Missed call', defaultViewId: 'vw6crj6fzeftwwwh' },
  { id: 'md2i0xibfqgmv9y', label: 'Incoming Email' },
  { id: 'mkq6wdce7yukjl9', label: 'Incoming calls' },
];

export default function AgentAnalyticsPage() {
  const [tableId, setTableId] = useState<string>(TABLES[0].id);
  const [agentField, setAgentField] = useState<string>('Agent');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [agentQuery, setAgentQuery] = useState('');
  const [minTotal, setMinTotal] = useState<number | ''>('');
  const [sortKey, setSortKey] = useState<'agent'|'total'|'lastActivity'>('total');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<NocoRecord[]>([]);
  // agent table pagination
  const [agentPage, setAgentPage] = useState<number>(1);
  const [agentPageSize, setAgentPageSize] = useState<number>(20);
  // pivot pagination (rows = days)
  const [pivotPage, setPivotPage] = useState<number>(1);
  const [pivotPageSize, setPivotPageSize] = useState<number>(15);
  // toggles to show/hide individual pivot tables (default hidden)
  const [showStatusTable, setShowStatusTable] = useState<boolean>(false);
  const [showAgentTable, setShowAgentTable] = useState<boolean>(false);
  const [showReasonTable, setShowReasonTable] = useState<boolean>(false);
  const [showFinalTable, setShowFinalTable] = useState<boolean>(false);

  // Pivot column controls (per section)
  const [pivotFilterStatus, setPivotFilterStatus] = useState('');
  const [pivotSortStatus, setPivotSortStatus] = useState<'name'|'total'>('total');
  const [pivotDirStatus, setPivotDirStatus] = useState<'asc'|'desc'>('desc');

  const [pivotFilterAgent, setPivotFilterAgent] = useState('');
  const [pivotSortAgent, setPivotSortAgent] = useState<'name'|'total'>('total');
  const [pivotDirAgent, setPivotDirAgent] = useState<'asc'|'desc'>('desc');

  const [pivotFilterReason, setPivotFilterReason] = useState('');
  const [pivotSortReason, setPivotSortReason] = useState<'name'|'total'>('total');
  const [pivotDirReason, setPivotDirReason] = useState<'asc'|'desc'>('desc');

  // Column pickers per pivot (null = all columns)
  const [pivotColsStatus, setPivotColsStatus] = useState<string[] | null>(null);
  const [pivotColsAgent, setPivotColsAgent] = useState<string[] | null>(null);
  const [pivotColsReason, setPivotColsReason] = useState<string[] | null>(null);

  // Drilldown modal state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [drillRows, setDrillRows] = useState<NocoRecord[]>([]);
  const [drillPage, setDrillPage] = useState(1);
  const [drillPageSize, setDrillPageSize] = useState(20);

  // view selection removed

  const fetchRecords = async () => {
    try {
      setLoading(true); setError('');
      const pageSize = 500;
      const acc: NocoRecord[] = [];
      for (let offset = 0; offset < 100000; offset += pageSize) {
        const params = new URLSearchParams();
        params.set('offset', String(offset));
        params.set('limit', String(pageSize));
        params.set('where', ''); // client-side date filter
        if (tableId === 'm135bs690ngf28r') {
          params.set('viewId', 'vw6crj6fzeftwwwh');
        }
        const url = `${NC_BASE}/api/v2/tables/${encodeURIComponent(tableId)}/records?${params.toString()}`;
        const res = await fetch(url, { headers: { 'xc-token': NC_TOKEN } });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('401 Unauthorized: NocoDB token rejected by server. Please verify NC_TOKEN in AgentAnalyticsPage.');
          }
          throw new Error(`${res.status} ${await res.text()}`);
        }
        const data = await res.json();
        const list: NocoRecord[] = Array.isArray(data?.list) ? data.list : (Array.isArray(data) ? data : []);
        acc.push(...list);
        const isLast = data?.pageInfo?.isLastPage === true || list.length < pageSize;
        if (isLast) break;
      }
      setRows(acc);
    } catch (e: any) {
      setError(e?.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  // Quick range helpers
  const fmt = (d: Date) => d.toISOString().slice(0,10);
  const setRange = (s?: string, e?: string) => { setStartDate(s || ''); setEndDate(e || ''); };
  const applyQuick = (key: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth()+1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth()-1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const minusDays = (n:number) => new Date(today.getFullYear(), today.getMonth(), today.getDate()-n);
    switch (key) {
      case 'today': setRange(fmt(today), fmt(today)); break;
      case 'yesterday': { const y = minusDays(1); setRange(fmt(y), fmt(y)); break; }
      case 'last7': setRange(fmt(minusDays(6)), fmt(today)); break; // inclusive 7 days
      case 'last14': setRange(fmt(minusDays(13)), fmt(today)); break;
      case 'last30': setRange(fmt(minusDays(29)), fmt(today)); break;
      case 'thisMonth': setRange(fmt(startOfMonth), fmt(endOfMonth)); break;
      case 'lastMonth': setRange(fmt(startOfLastMonth), fmt(endOfLastMonth)); break;
      default: setRange('', ''); // all time
    }
  };

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const detectDate = (r: NocoRecord): string | undefined => {
    const cand = ['created_at', 'Created At', 'createdAt', 'date', 'Date', 'timestamp', 'updated_at', 'Updated At'];
    for (const k of cand) if (k in r && r[k]) return k;
    return undefined;
  };

  // Prefer table-specific date field when available (e.g., 'Date' for Missed call)
  const getDateKey = useCallback((r: NocoRecord): string | undefined => {
    if (tableId === 'm135bs690ngf28r') {
      if ('Date' in r && r['Date']) return 'Date';
      if ('date' in r && r['date']) return 'date';
    }
    return detectDate(r);
  }, [tableId]);

  // filter by date if possible
  // Parse various date formats robustly
  const parseDateFlexible = (val: any): Date | null => {
    if (!val) return null;
    const s = String(val).trim();
    // dd/mm/yyyy or dd-mm-yyyy
    const m = s.match(/^([0-3]?\d)[\/\-]([0-1]?\d)[\/\-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      const iso = `${yyyy}-${mm}-${dd}T00:00:00`;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    }
    // ISO-like or other formats fallback
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  };

  const filtered = useMemo(() => {
    if (!rows.length || (!startDate && !endDate)) return rows;
    const sd = startDate ? new Date(`${startDate}T00:00:00`).getTime() : -Infinity;
    const ed = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Infinity;
    return rows.filter(r => {
      const dk = getDateKey(r);
      if (!dk) return true; // keep if no date
      const d = parseDateFlexible(r[dk]);
      const t = d ? d.getTime() : NaN;
      if (isNaN(t)) return true;
      return t >= sd && t <= ed;
    });
  }, [rows, startDate, endDate, getDateKey]);

  const aggs = useMemo<AgentAgg[]>(() => {
    const map = new Map<string, AgentAgg>();
    for (const r of filtered) {
      const a = String(r[agentField] ?? '').trim() || '(Unassigned)';
      const cur = map.get(a) || { agent: a, total: 0, lastActivity: undefined };
      cur.total += 1;
      // track latest date
      const dk = detectDate(r);
      if (dk) {
        const t = new Date(String(r[dk])).getTime();
        const prev = cur.lastActivity ? new Date(cur.lastActivity).getTime() : 0;
        if (!isNaN(t) && t > prev) cur.lastActivity = new Date(t).toISOString();
      }
      map.set(a, cur);
    }
    let arr = Array.from(map.values());
    // agent filters
    if (agentQuery.trim()) {
      const q = agentQuery.trim().toLowerCase();
      arr = arr.filter(x => x.agent.toLowerCase().includes(q));
    }
    if (minTotal !== '' && !Number.isNaN(Number(minTotal))) {
      arr = arr.filter(x => x.total >= Number(minTotal));
    }
    // sorting
    arr.sort((a,b)=>{
      const sign = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'agent': return sign * a.agent.localeCompare(b.agent);
        case 'lastActivity': {
          const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
          const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
          return sign * (ta - tb);
        }
        default: return sign * (a.total - b.total);
      }
    });
    return arr;
  }, [filtered, agentField, agentQuery, minTotal, sortKey, sortDir]);

  const total = filtered.length;
  const uniqueAgents = aggs.length;
  const PIVOT_TABLE_IDS = new Set<string>(['m135bs690ngf28r','mkq6wdce7yukjl9','md2i0xibfqgmv9y']);
  const isPivotMode = PIVOT_TABLE_IDS.has(tableId);
  const agentTotalPages = Math.max(1, Math.ceil(uniqueAgents / agentPageSize));
  const agentStart = (agentPage - 1) * agentPageSize;
  const agentSlice = aggs.slice(agentStart, agentStart + agentPageSize);

  return (
    <div className="p-4">
      {/* Source Tabs */}
      <div className="bg-white rounded-lg shadow p-2 mb-3">
        <div className="flex flex-wrap">
          {TABLES.map(t => (
            <button
              key={t.id}
              onClick={()=>setTableId(t.id)}
              className={`px-3 py-2 text-sm border-b-2 mr-2 ${tableId===t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
              title={`View ${t.label}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Agent Field</label>
            <input value={agentField} onChange={(e)=>setAgentField(e.target.value)} placeholder="agent" className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm w-[160px]" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Agent search</label>
            <input value={agentQuery} onChange={(e)=>setAgentQuery(e.target.value)} placeholder="type to filter" className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm w-[200px]" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Min total</label>
            <input type="number" value={minTotal} onChange={(e)=>setMinTotal(e.target.value===''? '' : Number(e.target.value))} placeholder="e.g. 5" className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm w-[100px]" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Start</label>
            <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">End</label>
            <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Quick Range</label>
            <select title="Quick Range" value="" onChange={(e)=>{ applyQuick(e.target.value); e.currentTarget.selectedIndex = 0; }} className="ring-1 ring-slate-200 rounded px-2 py-1 text-sm">
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
          <div>
            <button onClick={fetchRecords} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Refresh</button>
          </div>
          
          <div>
            <button onClick={()=>{
              // CSV export of agent aggs
              const lines = ['agent,total,lastActivity'];
              aggs.forEach(a=>lines.push(`${JSON.stringify(a.agent)},${a.total},${a.lastActivity||''}`));
              const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'agent_analytics.csv'; a.click();
              setTimeout(()=>URL.revokeObjectURL(url), 1000);
            }} className="px-3 py-1.5 bg-slate-700 text-white rounded text-sm">Export CSV</button>
          </div>
        </div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">{isPivotMode ? 'Grand Total' : 'Total Records'}</div>
          <div className="text-2xl font-semibold">{loading ? '…' : total}</div>
        </div>
        {!isPivotMode && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Unique Agents</div>
          <div className="text-2xl font-semibold">{loading ? '…' : uniqueAgents}</div>
        </div>
        )}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Source</div>
          <div className="text-sm">{TABLES.find(t=>t.id===tableId)?.label}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Range</div>
          <div className="text-sm">{startDate || '—'} → {endDate || '—'}</div>
        </div>
      </div>

      {!isPivotMode && (
      <div className="bg-white rounded-lg shadow overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="*:px-3 *:py-2 *:whitespace-nowrap text-left">
              <th>
                <button className="hover:underline" onClick={()=>{ setSortKey('agent'); setSortDir(d=> d==='asc'?'desc':'asc'); }} title="Sort by agent">Agent</button>
              </th>
              <th>
                <button className="hover:underline" onClick={()=>{ setSortKey('total'); setSortDir(d=> d==='asc'?'desc':'asc'); }} title="Sort by total">Total</button>
              </th>
              <th>
                <button className="hover:underline" onClick={()=>{ setSortKey('lastActivity'); setSortDir(d=> d==='asc'?'desc':'asc'); }} title="Sort by last activity">Last Activity</button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : agentSlice.length ? agentSlice.map(a => (
              <tr key={a.agent} className="*:px-3 *:py-2">
                <td className="font-medium">{a.agent}</td>
                <td>{a.total}</td>
                <td className="text-slate-500">{a.lastActivity ? new Date(a.lastActivity).toLocaleString() : '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No data</td></tr>
            )}
          </tbody>
        </table>
        {/* Agent pagination controls */}
        {!loading && uniqueAgents > 0 && (
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="text-slate-600">Page {agentPage} / {agentTotalPages}</div>
            <div className="flex items-center gap-2">
              <button disabled={agentPage<=1} onClick={()=>setAgentPage(p=>Math.max(1,p-1))} className={`px-2 py-1 rounded border ${agentPage<=1?'opacity-50':'hover:bg-slate-50'}`}>Prev</button>
              <button disabled={agentPage>=agentTotalPages} onClick={()=>setAgentPage(p=>Math.min(agentTotalPages,p+1))} className={`px-2 py-1 rounded border ${agentPage>=agentTotalPages?'opacity-50':'hover:bg-slate-50'}`}>Next</button>
              <select value={agentPageSize} onChange={(e)=>{ setAgentPageSize(Number(e.target.value)); setAgentPage(1); }} className="ring-1 ring-slate-200 rounded px-2 py-1">
                {[10,20,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Status Breakdown (hidden on Missed call) */}
      {!isPivotMode && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
        {/* Status breakdown (if Call Status or similar exists) */}
        <div className="bg-white rounded-lg shadow p-4 xl:col-span-1">
          <div className="text-sm font-semibold mb-2">Status Breakdown</div>
          {(() => {
            const keyCandidates = ['Call Status', 'Status', 'Call status', 'Outcome'];
            const k = filtered.length ? keyCandidates.find(x => x in filtered[0]) : undefined;
            if (!k) return <div className="text-slate-500 text-sm">No status field found</div>;
            const m = new Map<string, number>();
            for (const r of filtered) {
              const v = String(r[k] ?? '').trim() || '(Empty)';
              m.set(v, (m.get(v) || 0) + 1);
            }
            const arr = Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
            const max = arr.length ? arr[0][1] : 1;
            return (
              <div className="space-y-1">
                {arr.map(([name,count]) => {
                  const pct = Math.max(4, Math.round((count/max)*100));
                  return (
                    <div key={name} className="text-sm">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-700 truncate" title={name}>{name}</span>
                        <span className="font-medium ml-2">{count}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded">
                        <div className="h-2 bg-blue-500 rounded" style={{width: pct + '%'}}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* Daily Trend (hidden on Missed call) */}
      {!isPivotMode && (
      <div className="bg-white rounded-lg shadow p-4 mt-4">
        <div className="text-sm font-semibold mb-2">Daily Trend</div>
        {(() => {
          // bucket by yyyy-mm-dd using preferred date key for current table
          const dk = filtered.length ? getDateKey(filtered[0]) : undefined;
          if (!dk) return <div className="text-slate-500 text-sm">No date field found</div>;
          const buckets = new Map<string, number>();
          for (const r of filtered) {
            const d = parseDateFlexible(r[dk]);
            if (!d) continue;
            const key = d.toISOString().slice(0,10);
            buckets.set(key, (buckets.get(key)||0)+1);
          }
          const points = Array.from(buckets.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
          if (!points.length) return <div className="text-slate-500 text-sm">No data</div>;
          const max = Math.max(...points.map(p=>p[1]));
          const w = 600, h = 120, pad = 6;
          const step = points.length > 1 ? (w - pad*2) / (points.length - 1) : 0;
          const toY = (v:number) => h - pad - (v/max)*(h - pad*2);
          const path = points.map((p,i)=>`${i===0?'M':'L'} ${pad + i*step} ${toY(p[1])}`).join(' ');
          return (
            <div className="overflow-x-auto">
              <svg width={w} height={h} className="block">
                <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
              </svg>
              <div className="text-xs text-slate-500 mt-1">{points[0][0]} → {points[points.length-1][0]} (max {max}/day)</div>
            </div>
          );
        })()}
      </div>
      )}

      {/* Pivot Reports (Missed call & Incoming calls) */}
      {isPivotMode && (
        <div className="mt-4 space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div className="text-base font-semibold">{TABLES.find(t=>t.id===tableId)?.label} – Pivot Reports</div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Pivot Start</label>
                <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="ring-1 ring-slate-200 rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Pivot End</label>
                <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="ring-1 ring-slate-200 rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">Quick</label>
                <select title="Quick Range" value="" onChange={(e)=>{ applyQuick(e.target.value); e.currentTarget.selectedIndex = 0; }} className="ring-1 ring-slate-200 rounded px-2 py-1 text-xs">
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
            </div>
          </div>

          {(() => {
            // helpers
            const dk = filtered.length ? (['Date','date'].find(k=>k in filtered[0]) || detectDate(filtered[0])!) : undefined;
            if (!dk) return <div className="bg-white rounded-lg shadow p-4 text-slate-500 text-sm">No date field detected for pivot</div>;
            const toDay = (v:any) => {
              const d = new Date(String(v));
              return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
            };
            const uniqueSorted = (arr:string[]) => Array.from(new Set(arr)).sort();

            // generic pivot builder
            const buildPivot = (colKeyCandidates: string[]) => {
              const ck = filtered.length ? colKeyCandidates.find(k => k in filtered[0]) : undefined;
              const rowsByDay = new Map<string, NocoRecord[]>();
              for (const r of filtered) {
                const day = toDay(r[dk]);
                if (!day) continue;
                const list = rowsByDay.get(day) || [];
                list.push(r);
                rowsByDay.set(day, list);
              }
              const days = Array.from(rowsByDay.keys()).sort();
              const cols = ck ? uniqueSorted(days.flatMap(day => rowsByDay.get(day)!.map(r => String(r[ck] ?? '').trim() || '(Empty)'))) : [];
              // compute matrix counts
              const matrix = days.map(day => {
                const counts = new Map<string, number>();
                for (const r of rowsByDay.get(day)!) {
                  const val = ck ? (String(r[ck] ?? '').trim() || '(Empty)') : '';
                  counts.set(val, (counts.get(val) || 0) + 1);
                }
                const row = cols.map(c => counts.get(c) || 0);
                const total = row.reduce((a,b)=>a+b,0);
                return { day, row, total };
              });
              const grandTotals = cols.map((_, ci) => matrix.reduce((a,m)=>a + m.row[ci], 0));
              const grandTotalAll = matrix.reduce((a,m)=>a + m.total, 0);
              return { ck, days, cols, matrix, grandTotals, grandTotalAll } as const;
            };

            // Build pivots depending on the table
            let p1 = buildPivot(['Call Status','Status','Call status']);
            let p2 = (() => {
              const ck = agentField; // agent field name can vary
              return buildPivot([ck,'Agent','agent']);
            })();
            let p3 = buildPivot(['Call reason','Reason','call_reason']);
            let p4: ReturnType<typeof buildPivot> | null = null;
            if (tableId === 'md2i0xibfqgmv9y') {
              // Incoming Email extras
              p1 = buildPivot(['Call status','Call Status','Status']);
              p3 = buildPivot(['Issue Type','Issue type','Issue']);
              p4 = buildPivot(['Final status','Final Status','final_status']);
            }

            const renderPivot = (title: string, p: ReturnType<typeof buildPivot>, kind: 'status'|'agent'|'reason'|'final') => {
              // derive displayed columns with filter/sort controls
              const q = (kind==='status'?pivotFilterStatus:kind==='agent'?pivotFilterAgent:pivotFilterReason).toLowerCase();
              const sortKey = (kind==='status'?pivotSortStatus:kind==='agent'?pivotSortAgent:pivotSortReason);
              const dir = (kind==='status'?pivotDirStatus:kind==='agent'?pivotDirAgent:pivotDirReason);
              const sel = (kind==='status'?pivotColsStatus:kind==='agent'?pivotColsAgent:pivotColsReason);
              const setSel = (v: string[] | null) => {
                if (kind==='status') setPivotColsStatus(v); else if (kind==='agent') setPivotColsAgent(v); else setPivotColsReason(v);
              };
              const shown = (kind==='status'?showStatusTable:kind==='agent'?showAgentTable:kind==='reason'?showReasonTable:showFinalTable);
              const toggleShown = () => {
                if (kind==='status') setShowStatusTable(v=>!v);
                else if (kind==='agent') setShowAgentTable(v=>!v);
                else if (kind==='reason') setShowReasonTable(v=>!v);
                else setShowFinalTable(v=>!v);
              };
              const baseCols = p.cols.map((name, idx) => ({ name, total: p.grandTotals[idx], idx }));
              let colsView = baseCols;
              if (q) colsView = colsView.filter(c => c.name.toLowerCase().includes(q));
              if (sel !== null) {
                const allowed = new Set(sel);
                colsView = colsView.filter(c => allowed.has(c.name));
              }
              colsView = colsView.sort((a,b)=>{
                const sign = dir==='asc'?1:-1;
                return sortKey==='name' ? sign * a.name.localeCompare(b.name) : sign * (a.total - b.total);
              });
              const openDrill = (value: string) => {
                if (!p.ck) return;
                const norm = (v:any) => {
                  const s = String(v ?? '').trim();
                  return s || '(Empty)';
                };
                const rowsMatch = filtered.filter(r => norm(r[p.ck!]) === value);
                setDrillRows(rowsMatch);
                setDrillTitle(`${title} — ${value}`);
                setDrillPage(1);
                setDrillOpen(true);
              };
              return (
              <div className="bg-white rounded-lg shadow p-3 overflow-auto">
                <div className="text-sm font-semibold mb-2">{title}</div>
                {!p.ck ? (
                  <div className="text-slate-500 text-sm">Field not found</div>
                ) : (
                  <>
                  {/* Column controls */}
                  <div className="flex items-end gap-2 mb-2 text-xs">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Filter columns</label>
                      <input value={kind==='status'?pivotFilterStatus:kind==='agent'?pivotFilterAgent:pivotFilterReason}
                        onChange={(e)=>{ const v=e.target.value; if(kind==='status') setPivotFilterStatus(v); else if(kind==='agent') setPivotFilterAgent(v); else setPivotFilterReason(v); }}
                        placeholder="type to filter"
                        className="ring-1 ring-slate-200 rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Sort by</label>
                      <select value={sortKey} onChange={(e)=>{ const v=e.target.value as 'name'|'total'; if(kind==='status') setPivotSortStatus(v); else if(kind==='agent') setPivotSortAgent(v); else setPivotSortReason(v);} } className="ring-1 ring-slate-200 rounded px-2 py-1">
                        <option value="total">Total</option>
                        <option value="name">Name</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Direction</label>
                      <select value={dir} onChange={(e)=>{ const v=e.target.value as 'asc'|'desc'; if(kind==='status') setPivotDirStatus(v); else if(kind==='agent') setPivotDirAgent(v); else setPivotDirReason(v);} } className="ring-1 ring-slate-200 rounded px-2 py-1">
                        <option value="desc">Desc</option>
                        <option value="asc">Asc</option>
                      </select>
                    </div>
                    <div>
                      <details>
                        <summary className="cursor-pointer select-none px-2 py-1 border rounded bg-white">Columns</summary>
                        <div className="mt-2 p-2 border rounded bg-white shadow-sm max-h-64 overflow-auto min-w-[220px]">
                          <div className="flex items-center justify-between mb-2">
                            <button className="px-2 py-1 border rounded text-xs" onClick={(e)=>{e.preventDefault(); setSel([...p.cols]);}}>Select All</button>
                            <button className="px-2 py-1 border rounded text-xs" onClick={(e)=>{e.preventDefault(); setSel([]);}}>Clear</button>
                            <button className="px-2 py-1 border rounded text-xs" onClick={(e)=>{e.preventDefault(); setSel(null);}}>Reset</button>
                          </div>
                          <div className="space-y-1">
                            {p.cols.map(name=>{
                              const checked = sel===null ? true : sel.includes(name);
                              return (
                                <label key={name} className="flex items-center gap-2 text-xs">
                                  <input type="checkbox" checked={checked} onChange={(e)=>{
                                    if (sel===null) {
                                      const next = p.cols.slice();
                                      if (!e.target.checked) {
                                        const i = next.indexOf(name); if (i>=0) next.splice(i,1);
                                      }
                                      setSel(next);
                                    } else {
                                      const set = new Set(sel);
                                      if (e.target.checked) set.add(name); else set.delete(name);
                                      setSel(Array.from(set));
                                    }
                                  }} />
                                  <span className="truncate" title={name}>{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                  <div className="mb-3">
                    <button onClick={()=>{ if(p.ck){ setDrillRows(filtered); setDrillTitle(`${title} — All (${p.grandTotalAll})`); setDrillPage(1); setDrillOpen(true);} }} className="inline-flex items-baseline bg-slate-50 border border-slate-200 rounded px-3 py-2 hover:bg-slate-100">
                      <div className="text-xs text-gray-500 mr-2">Grand Total</div>
                      <div className="text-xl font-semibold">{p.grandTotalAll}</div>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 mb-3">
                    {colsView.map((c) => (
                      <button key={c.name} onClick={()=>openDrill(c.name)} className="text-left bg-white border border-slate-200 rounded p-2 hover:bg-slate-50 cursor-pointer">
                        <div className="text-[11px] text-gray-500 truncate" title={c.name}>{c.name}</div>
                        <div className="text-lg font-semibold">{c.total}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end mb-2 text-xs">
                    <button onClick={toggleShown} className="px-2 py-1 rounded border hover:bg-slate-50">{shown?'Hide Table':'Show Table'}</button>
                  </div>
                  {shown && (() => {
                    const totalPages = Math.max(1, Math.ceil(p.matrix.length / pivotPageSize));
                    const start = (pivotPage - 1) * pivotPageSize;
                    const slice = p.matrix.slice(start, start + pivotPageSize);
                    return (
                      <>
                        <div className="flex items-center justify-between mb-2 text-xs">
                          <div className="text-slate-600">Rows Page {pivotPage} / {totalPages}</div>
                          <div className="flex items-center gap-2">
                            <button disabled={pivotPage<=1} onClick={() => setPivotPage(pv=>Math.max(1,pv-1))} className={`px-2 py-1 rounded border ${pivotPage<=1?'opacity-50':'hover:bg-slate-50'}`}>Prev</button>
                            <button disabled={pivotPage>=totalPages} onClick={() => setPivotPage(pv=>Math.min(totalPages,pv+1))} className={`px-2 py-1 rounded border ${pivotPage>=totalPages?'opacity-50':'hover:bg-slate-50'}`}>Next</button>
                            <select title="Rows per page" value={pivotPageSize} onChange={(e)=>{ setPivotPageSize(Number(e.target.value)); setPivotPage(1); }} className="ring-1 ring-slate-200 rounded px-2 py-1">
                              {[10,15,25,50].map(n=> <option key={n} value={n}>{n}/page</option>)}
                            </select>
                          </div>
                        </div>
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr className=":px-2 :py-1 :whitespace-nowrap text-left">
                              <th>Date</th>
                              {colsView.map(c => <th key={c.name}>{c.name}</th>)}
                              <th>Grand Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {slice.map(m => (
                              <tr key={m.day} className=":px-2 :py-1">
                                <td className="font-medium">{m.day}</td>
                                {colsView.map(c => {
                                  const originalIdx = c.idx;
                                  const val = m.row[originalIdx] || 0;
                                  return <td key={c.name}>{val || ''}</td>;
                                })}
                                <td className="font-semibold">{m.total}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50">
                            <tr className=":px-2 :py-1">
                              <td className="font-semibold">Grand Total</td>
                              {colsView.map(c => (<td key={c.name} className="font-semibold">{c.total}</td>))}
                              <td className="font-bold">{p.grandTotalAll}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </>
                    );
                  })()}
                  </>
                )}
              </div>
            ); } 

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500">By Call Status — Grand Total</div>
                    <div className="text-2xl font-semibold">{p1.grandTotalAll}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500">By Agent — Grand Total</div>
                    <div className="text-2xl font-semibold">{p2.grandTotalAll}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-xs text-gray-500">By Call Reason — Grand Total</div>
                    <div className="text-2xl font-semibold">{p3.grandTotalAll}</div>
                  </div>
                  {p4 && (
                    <div className="bg-white rounded-lg shadow p-4">
                      <div className="text-xs text-gray-500">By Final Status — Grand Total</div>
                      <div className="text-2xl font-semibold">{p4.grandTotalAll}</div>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {renderPivot('By Call Status (Date × Status)', p1, 'status')}
                  {renderPivot('By Agent (Date × Agent)', p2, 'agent')}
                  {renderPivot(tableId==='md2i0xibfqgmv9y' ? 'By Issue Type (Date × Issue Type)' : 'By Call Reason (Date × Reason)', p3, 'reason')}
                  {p4 && renderPivot('By Final Status (Date × Final Status)', p4, 'status')}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Drilldown Modal */}
      {drillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-[95vw] max-w-5xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold text-sm truncate pr-3">{drillTitle}</div>
              <button onClick={()=>setDrillOpen(false)} className="px-2 py-1 rounded border hover:bg-slate-50">Close</button>
            </div>
            <div className="px-4 py-3 overflow-auto">
              {(() => {
                const totalPages = Math.max(1, Math.ceil(drillRows.length / drillPageSize));
                const start = (drillPage - 1) * drillPageSize;
                const slice = drillRows.slice(start, start + drillPageSize);
                return (
                  <>
                    <div className="flex items-center justify-between mb-2 text-xs">
                      <div className="text-slate-600">Rows {start+1}-{Math.min(start+drillPageSize, drillRows.length)} of {drillRows.length} • Page {drillPage}/{totalPages}</div>
                      <div className="flex items-center gap-2">
                        <button disabled={drillPage<=1} onClick={()=>setDrillPage(p=>Math.max(1,p-1))} className={`px-2 py-1 rounded border ${drillPage<=1?'opacity-50':'hover:bg-slate-50'}`}>Prev</button>
                        <button disabled={drillPage>=totalPages} onClick={()=>setDrillPage(p=>Math.min(totalPages,p+1))} className={`px-2 py-1 rounded border ${drillPage>=totalPages?'opacity-50':'hover:bg-slate-50'}`}>Next</button>
                        <select title="Rows per page" value={drillPageSize} onChange={(e)=>{ setDrillPageSize(Number(e.target.value)); setDrillPage(1); }} className="ring-1 ring-slate-200 rounded px-2 py-1">
                          {[10,20,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50">
                          {tableId === 'md2i0xibfqgmv9y' ? (
                            <tr className=":px-2 :py-1 :whitespace-nowrap text-left">
                              <th>Id</th>
                              <th>Date</th>
                              <th>Email Description</th>
                              <th>Order ID</th>
                              <th>Agent</th>
                              <th>Call status</th>
                              <th>Issue Type</th>
                              <th>Follow up details</th>
                              <th>Final status</th>
                            </tr>
                          ) : (
                            <tr className=":px-2 :py-1 :whitespace-nowrap text-left">
                              <th>Id</th>
                              <th>Date</th>
                              <th>Customer Number</th>
                              <th>Agent</th>
                              <th>Call Status</th>
                              <th>Call reason</th>
                              <th>Agent call details</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y">
                          {slice.map((r,i)=>{
                            const dtKey = getDateKey(r);
                            const dt = dtKey ? parseDateFlexible(r[dtKey]) : null;
                            if (tableId === 'md2i0xibfqgmv9y') {
                              return (
                                <tr key={String(r.id??i)} className=":px-2 :py-1">
                                  <td>{String(r.id??'')}</td>
                                  <td>{dt ? dt.toISOString().slice(0,10) : ''}</td>
                                  <td className="max-w-[320px] truncate" title={String(r['Email Description']??'')}>{String(r['Email Description']??'')}</td>
                                  <td>{String(r['Order ID']??'')}</td>
                                  <td>{String(r['Agent']??'')}</td>
                                  <td>{String(r['Call status']??r['Call Status']??'')}</td>
                                  <td>{String(r['Issue Type']??'')}</td>
                                  <td className="max-w-[360px] truncate" title={String(r['Follow up details']??'')}>{String(r['Follow up details']??'')}</td>
                                  <td>{String(r['Final status']??'')}</td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={String(r.id??i)} className=":px-2 :py-1">
                                <td>{String(r.id??'')}</td>
                                <td>{dt ? dt.toISOString().slice(0,10) : ''}</td>
                                <td>{String(r['Customer Number']??'')}</td>
                                <td>{String(r['Agent']??'')}</td>
                                <td>{String(r['Call Status']??'')}</td>
                                <td>{String(r['Call reason']??'')}</td>
                                <td className="max-w-[360px] truncate" title={String(r['Agent call details']??'')}>{String(r['Agent call details']??'')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
