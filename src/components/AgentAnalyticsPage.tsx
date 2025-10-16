import React, { useEffect, useMemo, useState } from 'react';

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
  const [recentQuery, setRecentQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<NocoRecord[]>([]);

  // view selection removed

  const fetchRecords = async () => {
    try {
      setLoading(true); setError('');
      const params = new URLSearchParams();
      params.set('offset', '0');
      params.set('limit', '500');
      params.set('where', ''); // client-side date filter
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
      setRows(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const detectDate = (r: NocoRecord): string | undefined => {
    const keys = Object.keys(r);
    const cand = ['created_at', 'Created At', 'createdAt', 'date', 'Date', 'timestamp', 'updated_at', 'Updated At'];
    for (const k of cand) if (k in r && r[k]) return k;
    return undefined;
  };

  // filter by date if possible
  const filtered = useMemo(() => {
    if (!rows.length || (!startDate && !endDate)) return rows;
    const sd = startDate ? new Date(`${startDate}T00:00:00`).getTime() : -Infinity;
    const ed = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Infinity;
    return rows.filter(r => {
      const dk = detectDate(r);
      if (!dk) return true; // keep if no date
      const t = new Date(String(r[dk])).getTime();
      if (isNaN(t)) return true;
      return t >= sd && t <= ed;
    });
  }, [rows, startDate, endDate]);

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
          <div className="text-xs text-gray-500">Total Records</div>
          <div className="text-2xl font-semibold">{loading ? '…' : total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Unique Agents</div>
          <div className="text-2xl font-semibold">{loading ? '…' : uniqueAgents}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Source</div>
          <div className="text-sm">{TABLES.find(t=>t.id===tableId)?.label}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500">Range</div>
          <div className="text-sm">{startDate || '—'} → {endDate || '—'}</div>
        </div>
      </div>

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
            ) : aggs.length ? aggs.map(a => (
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
      </div>

      {/* Status Breakdown & Recent Records */}
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

        {/* Recent records table with dynamic columns */}
        <div className="bg-white rounded-lg shadow p-4 xl:col-span-2 overflow-auto">
          <div className="text-sm font-semibold mb-2">Recent Records</div>
          <div className="mb-2">
            <input value={recentQuery} onChange={(e)=>setRecentQuery(e.target.value)} placeholder="Search in recent records" className="ring-1 ring-slate-200 rounded px-2 py-1 text-xs w-[260px]" />
          </div>
          {(() => {
            let rowsShow = filtered.slice(0, 50);
            if (recentQuery.trim()) {
              const q = recentQuery.trim().toLowerCase();
              rowsShow = rowsShow.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
            }
            if (!rowsShow.length) return <div className="text-slate-500 text-sm">No records</div>;
            // collect key set and pick a reasonable subset in a stable order
            const allKeys = new Set<string>();
            for (const r of rowsShow) Object.keys(r).forEach(k => allKeys.add(k));
            const prefer = ['Date','date','Agent','agent','Customer Number','customer_phone','Call Status','Status','Call reason','Agent call details'];
            const columns = Array.from(allKeys);
            columns.sort((a,b)=>{
              const ia = prefer.indexOf(a); const ib = prefer.indexOf(b);
              const pa = ia === -1 ? 999 : ia; const pb = ib === -1 ? 999 : ib;
              return pa - pb || a.localeCompare(b);
            });
            const cols = columns.slice(0, 8); // cap columns for readability
            return (
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="*:px-2 *:py-1 *:whitespace-nowrap text-left">
                    {cols.map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rowsShow.map((r,i)=>(
                    <tr key={i} className="*:px-2 *:py-1">
                      {cols.map(c => <td key={c} title={String(r[c] ?? '')}>{String(r[c] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* Daily Trend (sparkline) */}
      <div className="bg-white rounded-lg shadow p-4 mt-4">
        <div className="text-sm font-semibold mb-2">Daily Trend</div>
        {(() => {
          // bucket by yyyy-mm-dd using detected date key
          const dk = filtered.length ? detectDate(filtered[0]) : undefined;
          if (!dk) return <div className="text-slate-500 text-sm">No date field found</div>;
          const buckets = new Map<string, number>();
          for (const r of filtered) {
            const d = new Date(String(r[dk]));
            if (isNaN(d.getTime())) continue;
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
    </div>
  );
}
