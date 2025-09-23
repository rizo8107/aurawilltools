// Deno Edge Function: Segmentation
// Aggregates orders by selected dimensions, using SERVICE_ROLE on the server.
// It auto-detects the table/view name among common variants.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface Payload {
  dims?: Array<'state' | 'city' | 'pincode' | 'area'>;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  status?: string; // contains match (ilike)
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;
    const dims = (Array.isArray(body.dims) && body.dims.length ? body.dims : ['state']) as Array<'state'|'city'|'pincode'|'area'>;
    const from = typeof body.from === 'string' && body.from ? body.from : undefined;
    const to = typeof body.to === 'string' && body.to ? body.to : undefined;
    const status = typeof body.status === 'string' && body.status ? body.status : undefined;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE env' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { "X-Client-Info": "segmentation-fn" } } });

    const candidates = ['orders_all', 'orders_all_rows', 'orders_all_view'];
    let tableName: string | null = null;
    for (const name of candidates) {
      const probe = await sb.from(name).select('address,state,city,pincode,area,order_date,status').range(0,0);
      if (probe.error) continue;
      tableName = name; break;
    }
    if (!tableName) {
      return new Response(JSON.stringify({ error: 'orders table not found (tried orders_all, orders_all_rows, orders_all_view)' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Build base query
    const selectCols = 'address,state,city,pincode,area,order_date,status';
    let query = sb.from(tableName).select(selectCols, { head: false });
    if (from) query = query.gte('order_date', `${from}T00:00:00`);
    if (to) query = query.lte('order_date', `${to}T23:59:59.999`);
    if (status) query = query.ilike('status', `%${status}%`);

    // Pagination
    const pageSize = 10000;
    let fromIdx = 0;
    const counts = new Map<string, number>();

    const keyOf = (row: any) => {
      const fallback = parseFromAddress(row.address);
      return dims
        .map((d) => {
          const v = row[d];
          const val = (v === undefined || v === null || v === '') ? (fallback as any)[d] : v;
          return String(val ?? '');
        })
        .join('__');
    };

    // Loop pages
    // deno-lint-ignore no-constant-condition
    while (true) {
      const res = await query.range(fromIdx, fromIdx + pageSize - 1);
      if (res.error) {
        return new Response(JSON.stringify({ error: res.error.message, details: res.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const batch = res.data as any[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const r of batch) {
        const k = keyOf(r);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      if (batch.length < pageSize) break;
      fromIdx += pageSize;
    }

    const out: any[] = [];
    counts.forEach((count, k) => {
      const parts = k.split('__');
      const obj: any = { count };
      dims.forEach((d, i) => { obj[d] = parts[i] || null; });
      out.push(obj);
    });

    return new Response(JSON.stringify({ ok: true, rows: out, table: tableName }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

function parseFromAddress(addr?: string | null) {
  const out: Record<'state'|'city'|'pincode'|'area', string | null> = { state: null, city: null, pincode: null, area: null };
  if (!addr) return out;
  const parts = String(addr).split(',').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return out;
  const last = parts[parts.length - 1];
  const pinMatch = last.match(/(\d{6})$/);
  if (pinMatch) {
    out.pincode = pinMatch[1];
    parts[parts.length - 1] = last.replace(/\d{6}$/, '').replace(/[\,\s]+$/, '').trim();
  }
  out.state = (parts[parts.length - 1] || null) as string | null;
  out.city = (parts.length >= 2 ? parts[parts.length - 2] : null) as string | null;
  out.area = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(', ') : null;
  return out;
}
