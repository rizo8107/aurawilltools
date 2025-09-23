import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SUPABASE_URL, sbHeadersObj as sbHeaders } from '../lib/supabaseClient';
import { Download, Filter, Search } from 'lucide-react';

// Expected columns in orders_all: state, city, pincode, area (optional), order_number, order_date, status
// We support grouping by one or more of these dimensions and return counts.

type Dim = 'state' | 'city' | 'pincode' | 'area';

interface SegmentRow {
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  area?: string | null;
  count: number;
}

const ALL_DIMS: Dim[] = ['state', 'city', 'pincode', 'area'];

export default function SegmentationPage() {
  const [dims, setDims] = useState<Dim[]>(['state', 'city']);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [error, setError] = useState<string>('');

  const toggleDim = useCallback((d: Dim) => {
    setDims(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }, []);

  const selectedLabel = useMemo(() => dims.length ? dims.join(', ') : 'none', [dims]);

  // Fetch in pages and aggregate client-side (avoids PostgREST aggregate restrictions)
  const fetchSegments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Build select of minimal fields only
      const selected = (dims.length ? dims.slice() : ['state']) as Dim[];
      const selectCols = Array.from(new Set([...selected, 'address']));
      // Build filters
      const p = new URLSearchParams();
      // Resolve table endpoint (support different deployments)
      const CANDIDATES = ['orders_all', 'orders_all_rows', 'orders_all_view'];
      let baseUrl = '';
      for (const name of CANDIDATES) {
        const trial = `${SUPABASE_URL}/rest/v1/${name}`;
        const trialUrl = `${trial}?${p.toString()}`;
        const headRes = await fetch(trialUrl, { headers: { ...sbHeaders, Range: '0-0' } as any });
        if (headRes.ok || headRes.status === 206) { baseUrl = trial; break; }
      }
      if (!baseUrl) {
        throw new Error('Could not find orders_all table endpoint (tried orders_all, orders_all_rows, orders_all_view)');
      }
      p.set('select', selectCols.join(','));
      if (from) p.append('order_date', `gte.${from}T00:00:00`);
      if (to) p.append('order_date', `lte.${to}T23:59:59.999`);
      if (q) p.set('status', `ilike.*${q}*`);

      // Paginated fetch
      const pageSize = 10000;
      let fromIdx = 0;
      const counts = new Map<string, number>();
      const parseFromAddress = (addr: string | null | undefined) => {
        const out: Record<Dim, string | null> = { state: null, city: null, pincode: null, area: null };
        if (!addr) return out;
        const parts = String(addr)
          .split(',')
          .map(x => x.trim())
          .filter(Boolean);
        if (!parts.length) return out;
        // Detect 6-digit pincode at the end
        const last = parts[parts.length - 1];
        const pinMatch = last.match(/(\d{6})$/);
        if (pinMatch) {
          out.pincode = pinMatch[1];
          // Remove pincode segment from last token for state extraction
          parts[parts.length - 1] = last.replace(/\d{6}$/, '').replace(/[,\s]+$/, '').trim();
        }
        // Heuristic: state is now the last token
        out.state = (parts[parts.length - 1] || null) as string | null;
        // City is the previous token if available
        out.city = (parts.length >= 2 ? parts[parts.length - 2] : null) as string | null;
        // Area is the remainder joined
        if (parts.length >= 3) {
          out.area = parts.slice(0, parts.length - 2).join(', ');
        } else {
          out.area = null;
        }
        return out;
      };

      const keyOf = (row: Record<string, any>) => {
        const fallback = parseFromAddress(row.address);
        return selected
          .map(d => {
            const v = row[d];
            const val = (v === undefined || v === null || v === '') ? fallback[d] : v;
            return String(val ?? '');
          })
          .join('__');
      };

      while (true) {
        const url = `${baseUrl}?${p.toString()}`;
        const toIdx = fromIdx + pageSize - 1;
        const res = await fetch(url, { headers: { ...sbHeaders, Range: `${fromIdx}-${toIdx}` } as any });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`orders_all ${res.status}: ${t}`);
        }
        const batch = await res.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const r of batch) {
          const k = keyOf(r);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        if (batch.length < pageSize) break;
        fromIdx += pageSize;
      }

      // Build result rows
      const out: SegmentRow[] = [];
      counts.forEach((count, k) => {
        const parts = k.split('__');
        const obj: any = { count };
        selected.forEach((d, i) => { obj[d] = parts[i] || null; });
        out.push(obj as SegmentRow);
      });
      setRows(out);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dims, from, to, q]);

  useEffect(() => { fetchSegments(); }, [fetchSegments]);

  const exportCsv = useCallback(() => {
    const headers = [...dims, 'count'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      const vals = dims.map(d => (r[d] ?? ''));
      vals.push(String(r.count));
      const esc = vals.map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(esc.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `segments-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rows, dims]);

  return (
    <div className="p-3 md:p-5 space-y-4">
      <div className="text-2xl font-semibold">Segmentation</div>
      <div className="bg-white rounded-xl shadow p-3 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_DIMS.map(d => (
            <label key={d} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dims.includes(d)} onChange={() => toggleDim(d)} />
              <span className="capitalize">{d}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600 inline-flex items-center gap-1"><Filter className="w-4 h-4"/> Group by: <strong>{selectedLabel}</strong></div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by status (optional)"
              className="w-56 pl-9 pr-3 py-2 rounded-lg border"
              aria-label="Filter by status"
            />
          </div>
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" aria-label="From date" />
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="px-2 py-2 rounded-lg border text-sm" aria-label="To date" />
          <button onClick={fetchSegments} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm" disabled={loading}>{loading ? 'Loading...' : 'Reload'}</button>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-2"><Download className="w-4 h-4"/>Export</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              {dims.map(d => (
                <th key={d} className="text-left px-4 py-2 capitalize">{d}</th>
              ))}
              <th className="text-left px-4 py-2">Count</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-4" colSpan={dims.length+1}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-gray-600" colSpan={dims.length+1}>No data</td></tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={idx} className="border-t">
                  {dims.map(d => (
                    <td key={d} className="px-4 py-2">{(r as any)[d] ?? '—'}</td>
                  ))}
                  <td className="px-4 py-2">{r.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg">{error}</div>
      )}
    </div>
  );
}
