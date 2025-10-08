import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Filter, Search, Download, Edit, ClipboardCopy, Truck, PhoneCall, User, PackageCheck, Calendar, ChevronRight } from 'lucide-react';

// Supabase config (match app pattern)
const SUPABASE_URL = 'https://app-supabase.9krcxo.easypanel.host';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs';
const SB_HEADERS: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// Enums
const STATUS_OPTIONS = ['New','Packed','Dispatched','Delivered','RTO','NDR','Pincode Not Service','Cancelled'] as const;
const SOURCE_OPTIONS = ['Amazon','Website','WhatsApp','Incoming Call','RTO Calls','Resend','Bluedart','ST Courier','Delhivery','India Post','Other'] as const;
const NOTE_CHANNELS = ['Incoming Call','RTO Calls','WhatsApp','Email','System'] as const;

type Status = typeof STATUS_OPTIONS[number];
type Source = typeof SOURCE_OPTIONS[number];

export type ManualOrder = {
  id: number | string;
  created_at: string;
  created_by: string;
  source: Source | string;
  order_date: string; // date
  order_id: number | null; // external order number when known
  status: Status | string;
  quantity: number;
  shipping_partner: string | null;
  servicable: boolean | null;
  tracking_code: string | null;
  customer_name: string | null;
  address: string | null;
  phone_number: string | null;
  notes: string | null;
};

export type OrderNote = {
  id: number;
  created_at: string;
  order_id: number; // fk -> manual_orders.id
  agent: string;
  channel: string | null;
  remark: string;
};

export type StatusHistory = {
  id: number;
  order_id: number;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by: string;
};

function fmtDate(d?: string) { try { return d ? new Date(d).toLocaleString() : '—'; } catch { return '—'; } }
function csvEscape(v: any) { return `"${String(v ?? '').replace(/"/g,'""')}"`; }

export default function ManualOrdersDashboard() {
  // user context
  const [currentUser] = useState<string>(() => {
    try { return (localStorage.getItem('ndr_user') || '').trim(); } catch { return ''; }
  });

  // filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status[] | string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<Source[] | string[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string[]>([]);
  const [createdByFilter, setCreatedByFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [onlyDuplicates, setOnlyDuplicates] = useState<boolean>(false);
  const [servicableFilter, setServicableFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(false);

  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<ManualOrder>>({
    source: '' as any,
    customer_name: '',
    phone_number: '',
    address: '',
    quantity: 1,
    status: 'New',
    shipping_partner: '',
    servicable: true,
    tracking_code: '',
    notes: '',
  });
  // Order autofill (reuses OrderForm webhook)
  const [orderLookup, setOrderLookup] = useState<string>('');
  const [orderFetchLoading, setOrderFetchLoading] = useState(false);
  const [orderFetchError, setOrderFetchError] = useState<string>('');

  // drawer
  const [openOrder, setOpenOrder] = useState<ManualOrder | null>(null);
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [noteRemark, setNoteRemark] = useState('');
  const [noteChannel, setNoteChannel] = useState<string>('Incoming Call');
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [updatePartner, setUpdatePartner] = useState<string>('');
  const [updateTracking, setUpdateTracking] = useState<string>('');
  const [updateSaving, setUpdateSaving] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // table sorting
  const [sortKey, setSortKey] = useState<
    '' | 'order_date' | 'order_id' | 'count' | 'status' | 'quantity' | 'shipping_partner' | 'servicable' | 'tracking_code' | 'customer_name' | 'phone_number' | 'source' | 'created_by' | 'created_at'
  >('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // column text filters
  const [orderIdText, setOrderIdText] = useState('');
  const [trackingText, setTrackingText] = useState('');
  const [customerText, setCustomerText] = useState('');
  const [phoneText, setPhoneText] = useState('');
  // qty filter
  const [qtyFilter, setQtyFilter] = useState<string>('');
  const qtyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const q = Number(o.quantity);
      if (!Number.isNaN(q) && q > 0) set.add(String(q));
    }
    return Array.from(set).sort((a,b)=>Number(a)-Number(b));
  }, [orders]);

  // Inline status updater (order_dispatches_raw)
  const updateRowStatus = useCallback(async (row: ManualOrder, nextStatus: string) => {
    const prev = orders;
    // optimistic local update
    setOrders(prev.map(r => (r.id === row.id ? { ...r, status: nextStatus } : r)));
    // build filter: prefer id, else tracking_code, else order_id
    const where = row.id ? `id=eq.${encodeURIComponent(String(row.id))}` : (
      row.tracking_code ? `tracking_code=eq.${encodeURIComponent(String(row.tracking_code))}` : (
        row.order_id != null ? `order_id=eq.${Number(row.order_id)}` : ''
      )
    );
    if (!where) { setError('Cannot update: no identifier'); setOrders(prev); return; }
    try {
      const url = `${SUPABASE_URL}/rest/v1/order_dispatches_raw?${where}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: nextStatus, Status: nextStatus })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    } catch (e:any) {
      setError(String(e.message || e));
      // revert optimistic update
      setOrders(prev);
    }
  }, [orders]);

  // Pre-compute duplicate counts by order_id
  const dupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const key = o.order_id != null ? String(o.order_id) : '';
      if (!key) continue;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [orders]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter(o => {
      if (s) {
        const hay = [o.customer_name, o.phone_number, o.order_id, o.tracking_code, o.address, o.source].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (orderIdText.trim()) {
        const t = orderIdText.trim().toLowerCase();
        if (!String(o.order_id ?? '').toLowerCase().includes(t)) return false;
      }
      if (trackingText.trim()) {
        const t = trackingText.trim().toLowerCase();
        if (!String(o.tracking_code ?? '').toLowerCase().includes(t)) return false;
      }
      if (customerText.trim()) {
        const t = customerText.trim().toLowerCase();
        if (!String(o.customer_name ?? '').toLowerCase().includes(t)) return false;
      }
      if (phoneText.trim()) {
        const t = phoneText.trim().toLowerCase();
        if (!String(o.phone_number ?? '').toLowerCase().includes(t)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(String(o.status))) return false;
      if (sourceFilter.length && !sourceFilter.includes(String(o.source))) return false;
      if (partnerFilter.length && !partnerFilter.includes(String(o.shipping_partner || ''))) return false;
      if (qtyFilter && Number(o.quantity) !== Number(qtyFilter)) return false;
      if (servicableFilter !== 'all') {
        const val = o.servicable;
        if (servicableFilter === 'yes' && val !== true) return false;
        if (servicableFilter === 'no' && val !== false) return false;
      }
      if (createdByFilter && String(o.created_by || '') !== createdByFilter) return false;
      if (startDate || endDate) {
        const d = o.order_date ? new Date(o.order_date) : null;
        if (!d) return false;
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59.999`)) return false;
      }
      if (onlyDuplicates) {
        const k = o.order_id != null ? String(o.order_id) : '';
        if (!k) return false;
        if ((dupCounts.get(k) || 0) <= 1) return false;
      }
      return true;
    });
  }, [orders, q, orderIdText, trackingText, customerText, phoneText, qtyFilter, statusFilter, sourceFilter, partnerFilter, servicableFilter, createdByFilter, startDate, endDate, onlyDuplicates, dupCounts]);

  // Sort by latest date by default (order_date desc, fallback to created_at desc)
  const sortedFiltered = useMemo(() => {
    const val = (o: ManualOrder) => {
      switch (sortKey) {
        case 'order_date': return o.order_date ? new Date(o.order_date).getTime() : 0;
        case 'order_id': return Number(o.order_id ?? 0);
        case 'count': return o.order_id != null ? (dupCounts.get(String(o.order_id)) || 0) : 0;
        case 'status': return String(o.status || '');
        case 'quantity': return Number(o.quantity || 0);
        case 'shipping_partner': return String(o.shipping_partner || '');
        case 'servicable': return o.servicable === true ? 2 : (o.servicable === false ? 1 : 0);
        case 'tracking_code': return String(o.tracking_code || '');
        case 'customer_name': return String(o.customer_name || '');
        case 'phone_number': return String(o.phone_number || '');
        case 'source': return String(o.source || '');
        case 'created_by': return String(o.created_by || '');
        case 'created_at': return o.created_at ? new Date(o.created_at).getTime() : 0;
        default: {
          const od = o.order_date ? new Date(o.order_date).getTime() : NaN;
          const ca = o.created_at ? new Date(o.created_at).getTime() : NaN;
          return !isNaN(od) ? od : (!isNaN(ca) ? ca : 0);
        }
      }
    };
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = val(a) as any;
      const vb = val(b) as any;
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, dupCounts]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedFiltered.slice(start, start + pageSize);
  }, [sortedFiltered, page, pageSize]);

  const kpi = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0,0,0,0);
    const counts = { New:0, Packed:0, Dispatched:0, Delivered:0, RTO:0, NDR:0, PNS:0 } as any;
    const todayCounts = { New:0, Packed:0, Dispatched:0, Delivered:0, RTO:0, NDR:0, PNS:0 } as any;
    const weekCounts = { New:0, Packed:0, Dispatched:0, Delivered:0, RTO:0, NDR:0, PNS:0 } as any;
    for (const o of orders) {
      const raw = String(o.status || '');
      const key = raw === 'Pincode Not Service' ? 'PNS' : (
        STATUS_OPTIONS.includes(raw as any) ? raw : 'New' // bucket unknown statuses like 'processing' under New
      );
      counts[key] = (counts[key] || 0) + 1;
      const od = o.order_date ? new Date(o.order_date) : null;
      if (od) {
        const dayMatch = od >= today;
        const weekMatch = od >= weekAgo;
        if (dayMatch) todayCounts[key] = (todayCounts[key] || 0) + 1;
        if (weekMatch) weekCounts[key] = (weekCounts[key] || 0) + 1;
      }
    }
    return { counts, todayCounts, weekCounts };
  }, [orders]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true); setError('');
      // Use staging/raw source for listing instead of manual_orders
      // Omit server-side order (created_at may not exist on this table); we sort client-side
      const url = `${SUPABASE_URL}/rest/v1/order_dispatches_raw?select=*`;
      const res = await fetch(url, { headers: SB_HEADERS });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      const rows: ManualOrder[] = (Array.isArray(data) ? data : []).map((r: any) => {
        // Normalize possible alternate/raw column names
        // Accept ids like "manual_..."
        const id = r.id ?? r.ID ?? r.pk ?? '';
        // order date may be 'order_date' or 'date'/'Date' (often dd-mm-yyyy)
        const dateRaw = r.order_date || r.date || r.Date || '';
        let order_date = '';
        if (dateRaw) {
          const s = String(dateRaw).trim();
          const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // dd-mm-yyyy
          if (m) {
            const dd = m[1].padStart(2, '0');
            const mm = m[2].padStart(2, '0');
            const yyyy = m[3];
            order_date = `${yyyy}-${mm}-${dd}`; // yyyy-mm-dd
          } else {
            order_date = s.slice(0, 10);
          }
        }
        // external order id may be 'order_id' or 'Order ID' or 'ordernumber'
        const order_id = r.order_id ?? (r["Order ID"] ? Number(r["Order ID"]) : (r.ordernumber ? Number(r.ordernumber) : null));
        // status may be non-enum (e.g., 'processing'); keep as-is for display and counts
        const status = r.status || r.Status || '';
        // map partner and tracking from raw keys (handle different casing)
        const shipping_partner = r.shipping_partner ?? r.shipping ?? r.Shipping ?? r["Shipping Partner"] ?? null;
        const tracking_code = r.tracking_code ?? r.trackingnumber ?? r["Tracking code"] ?? r.Tracking ?? null;
        const customer_name = r.customer_name ?? r.customername ?? r["Customer Name"] ?? null;
        const phone_number = r.phone_number ?? r.phone ?? r["Phone number"] ?? null;
        const address = r.address ?? r.Address ?? null;
        const quantity = Number(r.quantity ?? r.Quanity ?? 1) || 1;
        const servicable = (typeof r.servicable === 'boolean') ? r.servicable : (typeof r.Servicable === 'string' ? (/^(yes|true|1)$/i.test(r.Servicable)) : null);
        const source = r.source || r.Source || r["Order type"] || '';
        const created_by = r.created_by || r["Agent Name"] || r.agent || (currentUser || '');
        const created_at = r.created_at || r.updated_at || new Date().toISOString();
        const notes = r.notes ?? r.Notes ?? null;
        return {
          id,
          created_at,
          created_by: String(created_by),
          source: String(source),
          order_date: String(order_date || '').slice(0,10),
          order_id: (Number.isFinite(order_id) ? Number(order_id) : null),
          status: String(status || ''),
          quantity,
          shipping_partner: shipping_partner ? String(shipping_partner) : null,
          servicable,
          tracking_code: tracking_code ? String(tracking_code) : null,
          customer_name: customer_name ? String(customer_name) : null,
          address: address ? String(address) : null,
          phone_number: phone_number ? String(phone_number) : null,
          notes: notes ? String(notes) : null,
        } as ManualOrder;
      });
      setOrders(rows);
    } catch (e: any) {
      setError(e?.message || 'Failed to load orders');
    } finally { setLoading(false); }
  }, []);

  const loadOrderDetail = useCallback(async (id: number) => {
    try {
      const [nRes, hRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/order_notes?order_id=eq.${id}&select=*&order=created_at.desc`, { headers: SB_HEADERS }),
        fetch(`${SUPABASE_URL}/rest/v1/status_history?order_id=eq.${id}&select=*&order=changed_at.desc`, { headers: SB_HEADERS }),
      ]);
      setNotes(nRes.ok ? await nRes.json() : []);
      setHistory(hRes.ok ? await hRes.json() : []);
    } catch { setNotes([]); setHistory([]); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // create manual order
  const validateCreate = (): string | null => {
    const phone = String(createForm.phone_number || '').replace(/\s+/g,'');
    if (!createForm.source) return 'Source is required';
    if (!createForm.status) return 'Status is required';
    if (!createForm.customer_name) return 'Customer name is required';
    if (!phone || !/^\+?\d{10,15}$/.test(phone)) return 'Phone must be 10-15 digits (can start with +)';
    if ((createForm.quantity ?? 0) < 1) return 'Quantity must be at least 1';
    if (createForm.status === 'Dispatched' && !(createForm.shipping_partner && createForm.tracking_code)) return 'Shipping partner and tracking code are required for Dispatched';
    return null;
  };

  // Fetch order by number and prefill createForm
  const onFetchOrder = async () => {
    const orderNo = orderLookup.trim();
    if (!orderNo) { setOrderFetchError('Enter an order number'); return; }
    setOrderFetchError(''); setOrderFetchLoading(true);
    try {
      const res = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/cbf01aea-9be4-4cba-9b1c-0a0367a6f823', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Order: orderNo })
      });
      if (!res.ok) throw new Error(`Lookup failed ${res.status}`);
      const text = await res.text();
      let obj: any = null;
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) obj = data.find((it:any)=>typeof it==='object'); else obj = data;
      } catch { throw new Error('Invalid JSON from lookup'); }
      if (!obj) throw new Error('No order found');
      // Map into our form fields
      setCreateForm(v=>({
        ...v,
        customer_name: obj.customer_name || v.customer_name || '',
        phone_number: obj.phone || v.phone_number || '',
        address: obj.address || v.address || '',
        quantity: Number(obj.quantity || v.quantity || 1) || 1,
        shipping_partner: obj.tracking_company || v.shipping_partner || '',
        tracking_code: obj.tracking_number || v.tracking_code || '',
        notes: v.notes || '',
      }));
    } catch (e:any) {
      setOrderFetchError(e?.message || 'Fetch failed');
    } finally { setOrderFetchLoading(false); }
  };

  const onCreate = async () => {
    const err = validateCreate(); if (err) { alert(err); return; }
    const actor = currentUser || 'system';
    const payload: Partial<ManualOrder> = {
      created_by: actor,
      source: String(createForm.source || ''),
      order_date: new Date().toISOString().slice(0,10),
      order_id: createForm.order_id ? Number(createForm.order_id) : null,
      status: String(createForm.status || 'New'),
      quantity: Number(createForm.quantity || 1),
      shipping_partner: String(createForm.shipping_partner || '') || null,
      servicable: typeof createForm.servicable === 'boolean' ? createForm.servicable : true,
      tracking_code: String(createForm.tracking_code || '') || null,
      customer_name: String(createForm.customer_name || ''),
      address: String(createForm.address || ''),
      phone_number: String(createForm.phone_number || '').replace(/\s+/g,''),
      notes: String(createForm.notes || '') || null,
    };
    try {
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/manual_orders`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(payload) });
      if (!ins.ok) throw new Error(await ins.text());
      const [row] = await ins.json();
      // Initial note + status history
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/order_notes`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ order_id: row.id, agent: actor, channel: 'System', remark: 'Order created' }) });
        await fetch(`${SUPABASE_URL}/rest/v1/status_history`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ order_id: row.id, old_status: null, new_status: row.status, changed_by: actor }) });
      } catch {}
      setShowCreate(false);
      setCreateForm({ source: '' as any, customer_name: '', phone_number: '', address: '', quantity: 1, status: 'New', shipping_partner: '', servicable: true, tracking_code: '', notes: '' });
      await loadOrders();
      setOpenOrder(row);
      await loadOrderDetail(row.id);
    } catch (e: any) { alert(e?.message || 'Create failed'); }
  };

  // add note
  const onAddNote = async () => {
    if (!openOrder) return;
    const remark = noteRemark.trim(); if (!remark) { alert('Remark required'); return; }
    const actor = currentUser || 'system';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/order_notes`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ order_id: openOrder.id, agent: actor, channel: noteChannel || 'System', remark }) });
      if (!res.ok) throw new Error(await res.text());
      setNoteRemark('');
      await loadOrderDetail(openOrder.id);
    } catch (e: any) { alert(e?.message || 'Failed to add note'); }
  };

  // update status (+ optional partner/tracking when Dispatched)
  const onChangeStatus = async () => {
    if (!openOrder) return;
    const next = updateStatus || openOrder.status;
    if (!next) { alert('Select a status'); return; }
    if (['RTO','NDR','Cancelled'].includes(next) && !noteRemark.trim()) { alert('Remark is required for RTO/NDR/Cancelled'); return; }
    if (next === 'Dispatched' && !(updatePartner || openOrder.shipping_partner) ) { alert('Shipping partner is required for Dispatched'); return; }
    if (next === 'Dispatched' && !(updateTracking || openOrder.tracking_code) ) { alert('Tracking code is required for Dispatched'); return; }

    const actor = currentUser || 'system';
    const old = openOrder.status;
    const patch: Partial<ManualOrder> = {
      status: next,
      shipping_partner: (updatePartner || openOrder.shipping_partner || '') || null,
      tracking_code: (updateTracking || openOrder.tracking_code || '') || null,
    };

    try {
      setUpdateSaving(true);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/manual_orders?id=eq.${openOrder.id}`, { method:'PATCH', headers: SB_HEADERS, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await res.text());
      // status history + optional note
      await fetch(`${SUPABASE_URL}/rest/v1/status_history`, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ order_id: openOrder.id, old_status: old, new_status: next, changed_by: actor }) });
      if (noteRemark.trim()) {
        await fetch(`${SUPABASE_URL}/rest/v1/order_notes`, { method:'POST', headers: SB_HEADERS, body: JSON.stringify({ order_id: openOrder.id, agent: actor, channel: 'System', remark: noteRemark.trim() }) });
      }
      await loadOrders();
      const refreshed = orders.find(o => o.id === openOrder.id);
      if (refreshed) setOpenOrder(refreshed);
      await loadOrderDetail(openOrder.id);
      setNoteRemark(''); setUpdateStatus(''); setUpdatePartner(''); setUpdateTracking('');
    } catch (e: any) { alert(e?.message || 'Failed to update status'); }
    finally { setUpdateSaving(false); }
  };

  // csv export of filtered
  const onExport = () => {
    const head = ['id','order_date','order_id','status','quantity','shipping_partner','servicable','tracking_code','customer_name','phone_number','source','created_by','created_at'];
    const lines = filtered.map(o => [o.id,o.order_date,o.order_id ?? '',o.status,o.quantity,o.shipping_partner ?? '',o.servicable ?? '',o.tracking_code ?? '',o.customer_name ?? '',o.phone_number ?? '',o.source ?? '',o.created_by ?? '',o.created_at].map(csvEscape).join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download = `manual_orders_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const unique = <T extends string | null | undefined>(arr: T[]) => Array.from(new Set(arr.map(x => String(x ?? '')).filter(Boolean)));
  const partners = useMemo(() => unique(orders.map(o => o.shipping_partner)), [orders]);
  const agents = useMemo(() => unique(orders.map(o => o.created_by)), [orders]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800 w-full mx-auto">
      {/* Header toolbar */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center gap-2 flex-wrap">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={q} onChange={(e)=>{ setQ(e.target.value); setPage(1); }} placeholder="Search name/phone/order/tracking…" aria-label="Search manual orders" className="flex-1 bg-transparent outline-none text-sm min-w-[220px]" />
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <select multiple value={statusFilter as any} onChange={(e)=>setStatusFilter(Array.from(e.target.selectedOptions).map(o=>o.value))} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white min-w-[160px]" title="Filter by status" aria-label="Filter by status">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select multiple value={sourceFilter as any} onChange={(e)=>setSourceFilter(Array.from(e.target.selectedOptions).map(o=>o.value))} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white min-w-[180px]" title="Filter by source" aria-label="Filter by source">
              {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select multiple value={partnerFilter as any} onChange={(e)=>setPartnerFilter(Array.from(e.target.selectedOptions).map(o=>o.value))} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white min-w-[160px]" title="Filter by shipping partner" aria-label="Filter by shipping partner">
              {partners.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={createdByFilter} onChange={(e)=>setCreatedByFilter(e.target.value)} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white min-w-[140px]" title="Filter by agent" aria-label="Filter by agent">
              <option value="">All agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white" title="Start date" aria-label="Start date" />
            <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white" title="End date" aria-label="End date" />
            <label className="inline-flex items-center gap-2 text-sm px-2 py-1 ring-1 ring-slate-200 rounded-lg bg-white">
              <input type="checkbox" checked={onlyDuplicates} onChange={(e)=>{ setOnlyDuplicates(e.target.checked); setPage(1); }} />
              <span>Only duplicates</span>
            </label>
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50" onClick={()=>setShowColumnFilters(v=>!v)} title="Toggle column filters">
              <Filter className="w-4 h-4"/> Filters
            </button>
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50" onClick={onExport} title="Export filtered">
              <Download className="w-4 h-4"/> Export
            </button>
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800" onClick={()=>setShowCreate(true)} title="Create manual order">
              <Plus className="w-4 h-4"/> New Order
            </button>
          </div>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {(['New','Packed','Dispatched','Delivered','RTO','NDR'] as const).map((s) => (
          <div key={s} className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
            <div className="text-xs text-slate-500">{s}</div>
            <div className="mt-1 text-2xl font-semibold">{kpi.counts[s] || 0}</div>
            <div className="mt-1 text-[11px] text-slate-500">Today {kpi.todayCounts[s]||0} · Week {kpi.weekCounts[s]||0}</div>
          </div>
        ))}
        <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
          <div className="text-xs text-slate-500">Pincode Not Service</div>
          <div className="mt-1 text-2xl font-semibold">{kpi.counts.PNS || 0}</div>
          <div className="mt-1 text-[11px] text-slate-500">Today {kpi.todayCounts.PNS||0} · Week {kpi.weekCounts.PNS||0}</div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <div className="overflow-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr className="*:px-3 *:py-2 *:whitespace-nowrap select-none">
                <th>
                  <button className="flex items-center gap-1" title="Sort by order date" onClick={()=>{ setSortKey('order_date'); setSortDir(d=> (sortKey==='order_date' && d==='asc') ? 'desc' : 'asc'); }}>
                    Order Date {sortKey==='order_date' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by order id" onClick={()=>{ setSortKey('order_id'); setSortDir(d=> (sortKey==='order_id' && d==='asc') ? 'desc' : 'asc'); }}>
                    Order ID {sortKey==='order_id' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by duplicate count" onClick={()=>{ setSortKey('count'); setSortDir(d=> (sortKey==='count' && d==='asc') ? 'desc' : 'asc'); }}>
                    Count {sortKey==='count' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by status" onClick={()=>{ setSortKey('status'); setSortDir(d=> (sortKey==='status' && d==='asc') ? 'desc' : 'asc'); }}>
                    Status {sortKey==='status' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by quantity" onClick={()=>{ setSortKey('quantity'); setSortDir(d=> (sortKey==='quantity' && d==='asc') ? 'desc' : 'asc'); }}>
                    Qty {sortKey==='quantity' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by partner" onClick={()=>{ setSortKey('shipping_partner'); setSortDir(d=> (sortKey==='shipping_partner' && d==='asc') ? 'desc' : 'asc'); }}>
                    Shipping Partner {sortKey==='shipping_partner' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by servicable" onClick={()=>{ setSortKey('servicable'); setSortDir(d=> (sortKey==='servicable' && d==='asc') ? 'desc' : 'asc'); }}>
                    Servicable {sortKey==='servicable' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by tracking" onClick={()=>{ setSortKey('tracking_code'); setSortDir(d=> (sortKey==='tracking_code' && d==='asc') ? 'desc' : 'asc'); }}>
                    Tracking {sortKey==='tracking_code' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by customer" onClick={()=>{ setSortKey('customer_name'); setSortDir(d=> (sortKey==='customer_name' && d==='asc') ? 'desc' : 'asc'); }}>
                    Customer {sortKey==='customer_name' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by phone" onClick={()=>{ setSortKey('phone_number'); setSortDir(d=> (sortKey==='phone_number' && d==='asc') ? 'desc' : 'asc'); }}>
                    Phone {sortKey==='phone_number' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by source" onClick={()=>{ setSortKey('source'); setSortDir(d=> (sortKey==='source' && d==='asc') ? 'desc' : 'asc'); }}>
                    Source {sortKey==='source' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by created by" onClick={()=>{ setSortKey('created_by'); setSortDir(d=> (sortKey==='created_by' && d==='asc') ? 'desc' : 'asc'); }}>
                    Created By {sortKey==='created_by' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>
                  <button className="flex items-center gap-1" title="Sort by created at" onClick={()=>{ setSortKey('created_at'); setSortDir(d=> (sortKey==='created_at' && d==='asc') ? 'desc' : 'asc'); }}>
                    Created At {sortKey==='created_at' ? (sortDir==='asc'?'▲':'▼') : ''}
                  </button>
                </th>
                <th>Actions</th>
              </tr>
              {showColumnFilters && (
                <tr className="*:px-3 *:py-2 bg-white border-t">
                  {/* Order Date */}
                  <th>
                    <div className="flex items-center gap-1">
                      <input type="date" value={startDate} onChange={(e)=>{ setStartDate(e.target.value); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white" title="Filter start date" />
                      <span className="text-slate-400 text-xs">→</span>
                      <input type="date" value={endDate} onChange={(e)=>{ setEndDate(e.target.value); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white" title="Filter end date" />
                    </div>
                  </th>
                  {/* Order ID */}
                  <th>
                    <input value={orderIdText} onChange={(e)=>{ setOrderIdText(e.target.value); setPage(1); }} placeholder="Search…" title="Filter by order id" className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white w-[120px]" />
                  </th>
                  {/* Count */}
                  <th>
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={onlyDuplicates} onChange={(e)=>{ setOnlyDuplicates(e.target.checked); setPage(1); }} /> Dups
                    </label>
                  </th>
                  {/* Status */}
                  <th>
                    <div className="flex items-center gap-1">
                      <select multiple value={statusFilter as any} onChange={(e)=>{ setStatusFilter(Array.from(e.target.selectedOptions).map(o=>o.value)); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white min-w-[140px]" title="Filter by status">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Select all statuses" onClick={(e)=>{ e.preventDefault(); setStatusFilter(STATUS_OPTIONS as any); setPage(1); }}>All</button>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Clear statuses" onClick={(e)=>{ e.preventDefault(); setStatusFilter([]); setPage(1); }}>Clear</button>
                    </div>
                  </th>
                  {/* Qty */}
                  <th>
                    <select value={qtyFilter} onChange={(e)=>{ setQtyFilter(e.target.value); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white w-[90px]" title="Filter by quantity">
                      <option value="">All</option>
                      {qtyOptions.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </th>
                  {/* Shipping Partner */}
                  <th>
                    <div className="flex items-center gap-1">
                      <select multiple value={partnerFilter as any} onChange={(e)=>{ setPartnerFilter(Array.from(e.target.selectedOptions).map(o=>o.value)); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white min-w-[140px]" title="Filter by shipping partner">
                        {partners.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Select all partners" onClick={(e)=>{ e.preventDefault(); setPartnerFilter(partners as any); setPage(1); }}>All</button>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Clear partners" onClick={(e)=>{ e.preventDefault(); setPartnerFilter([]); setPage(1); }}>Clear</button>
                    </div>
                  </th>
                  {/* Servicable */}
                  <th>
                    <select value={servicableFilter} onChange={(e)=>{ setServicableFilter(e.target.value as any); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white" title="Filter by servicable">
                      <option value="all">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </th>
                  {/* Tracking */}
                  <th>
                    <input value={trackingText} onChange={(e)=>{ setTrackingText(e.target.value); setPage(1); }} placeholder="Search…" title="Filter by tracking" className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white w-[140px]" />
                  </th>
                  {/* Customer */}
                  <th>
                    <input value={customerText} onChange={(e)=>{ setCustomerText(e.target.value); setPage(1); }} placeholder="Search…" title="Filter by customer" className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white w-[140px]" />
                  </th>
                  {/* Phone */}
                  <th>
                    <input value={phoneText} onChange={(e)=>{ setPhoneText(e.target.value); setPage(1); }} placeholder="Search…" title="Filter by phone" className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white w-[130px]" />
                  </th>
                  {/* Source */}
                  <th>
                    <div className="flex items-center gap-1">
                      <select multiple value={sourceFilter as any} onChange={(e)=>{ setSourceFilter(Array.from(e.target.selectedOptions).map(o=>o.value)); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white min-w-[140px]" title="Filter by source">
                        {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Select all sources" onClick={(e)=>{ e.preventDefault(); setSourceFilter(SOURCE_OPTIONS as any); setPage(1); }}>All</button>
                      <button className="px-1.5 py-0.5 text-[11px] ring-1 ring-slate-200 rounded hover:bg-slate-50" title="Clear sources" onClick={(e)=>{ e.preventDefault(); setSourceFilter([]); setPage(1); }}>Clear</button>
                    </div>
                  </th>
                  {/* Created By */}
                  <th>
                    <select value={createdByFilter} onChange={(e)=>{ setCreatedByFilter(e.target.value); setPage(1); }} className="ring-1 ring-slate-200 rounded px-1 py-0.5 text-xs bg-white min-w-[120px]" title="Filter by agent">
                      <option value="">All</option>
                      {agents.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </th>
                  {/* Created At */}
                  <th></th>
                  {/* Actions */}
                  <th></th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
              ) : pageRows.length ? pageRows.map(o => (
                <tr key={o.id} className="*:px-3 *:py-2 hover:bg-slate-50 cursor-pointer" onClick={()=>{ setOpenOrder(o); loadOrderDetail(o.id); }}>
                  <td>{o.order_date}</td>
                  <td>{o.order_id ?? '—'}</td>
                  <td>
                    {o.order_id != null ? (
                      (() => { const c = dupCounts.get(String(o.order_id)) || 0; return c > 1 ? <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 ring-1 ring-amber-200" title={`${c} records with this order`}>{c}</span> : <span className="text-slate-400">{c || '—'}</span>; })()
                    ) : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={
                        'px-2 py-0.5 rounded-full text-xs font-semibold ring-2 ' +
                        (o.status==='Delivered' ? 'bg-emerald-600 text-white ring-emerald-600' :
                         o.status==='Dispatched' ? 'bg-blue-600 text-white ring-blue-600' :
                         (o.status==='RTO' || o.status==='NDR') ? 'bg-amber-600 text-white ring-amber-600' :
                         o.status==='Cancelled' ? 'bg-rose-600 text-white ring-rose-600' :
                         'bg-slate-600 text-white ring-slate-600')
                      } title={`Status: ${o.status}`}>{o.status}</span>
                      <select
                        value={String(o.status || '')}
                        onClick={(e)=>e.stopPropagation()}
                        onChange={(e)=>{ e.stopPropagation(); updateRowStatus(o, e.target.value); }}
                        className="px-1 py-0.5 text-xs ring-1 ring-slate-300 rounded bg-white hover:bg-slate-50"
                        title="Change status"
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>{o.quantity}</td>
                  <td>{o.shipping_partner || '—'}</td>
                  <td>{o.servicable===true ? 'Yes' : o.servicable===false ? 'No' : '—'}</td>
                  <td className="flex items-center gap-2">
                    <span className="font-mono">{o.tracking_code || '—'}</span>
                    {o.tracking_code && (
                      <button title="Copy tracking" onClick={(e)=>{ e.stopPropagation(); navigator.clipboard.writeText(String(o.tracking_code)); }} className="p-1 rounded hover:bg-slate-100"><ClipboardCopy className="w-4 h-4"/></button>
                    )}
                  </td>
                  <td>{o.customer_name || '—'}</td>
                  <td className="flex items-center gap-2">
                    <span className="font-mono">{o.phone_number || '—'}</span>
                    {o.phone_number && (
                      <>
                        <a href={`https://wa.me/${o.phone_number}`} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-slate-100" title="WhatsApp" onClick={(e)=>e.stopPropagation()}>
                          <PhoneCall className="w-4 h-4"/>
                        </a>
                        <button title="Copy" onClick={(e)=>{ e.stopPropagation(); navigator.clipboard.writeText(String(o.phone_number)); }} className="p-1 rounded hover:bg-slate-100"><ClipboardCopy className="w-4 h-4"/></button>
                      </>
                    )}
                  </td>
                  <td>{o.source}</td>
                  <td>{o.created_by}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 rounded-full text-xs ring-1 ring-slate-300 hover:bg-slate-100" title="Open order" onClick={(e)=>{ e.stopPropagation(); setOpenOrder(o); loadOrderDetail(o.id); }}>Open</button>
                      <button className="px-2 py-1 rounded-full text-xs bg-slate-900 text-white hover:bg-slate-800" title="Update status" onClick={(e)=>{ e.stopPropagation(); setOpenOrder(o); loadOrderDetail(o.id); }}>Update</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-slate-500">No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* pagination */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-slate-600">Page {page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded-lg ring-1 ring-slate-200 disabled:opacity-50" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
            <select className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm" value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10,25,50,100].map(n=> <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button className="px-3 py-1 rounded-lg ring-1 ring-slate-200 disabled:opacity-50" disabled={page>=Math.max(1, Math.ceil(filtered.length / pageSize))} onClick={()=>setPage(p=>Math.min(Math.max(1, Math.ceil(filtered.length / pageSize)), p+1))}>Next</button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-auto" onClick={()=>setShowCreate(false)}>
          <div className="mt-12 w-full max-w-3xl bg-white rounded-2xl ring-1 ring-slate-200 p-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Create Manual Order</div>
              <button className="p-1 rounded hover:bg-slate-100" onClick={()=>setShowCreate(false)}><X className="w-5 h-5"/></button>
            </div>
            {/* Autofill from existing order */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              <label className="text-sm block sm:col-span-2">Pull from Order Number
                <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" placeholder="e.g., 9672" value={orderLookup} onChange={(e)=>setOrderLookup(e.target.value)} />
              </label>
              <div className="flex items-end">
                <button className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50" onClick={onFetchOrder} disabled={orderFetchLoading} title="Auto-fill from order number">{orderFetchLoading ? 'Fetching…' : 'Auto-fill'}</button>
              </div>
              {orderFetchError && <div className="sm:col-span-3 text-sm text-rose-700">{orderFetchError}</div>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm block">Source<select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 bg-white" value={String(createForm.source || '')} onChange={(e)=>setCreateForm(v=>({ ...v, source: e.target.value as any }))}>{['',...SOURCE_OPTIONS].map(s => <option key={s} value={s}>{s||'Select…'}</option>)}</select></label>
              <label className="text-sm block">Status<select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 bg-white" value={String(createForm.status || 'New')} onChange={(e)=>setCreateForm(v=>({ ...v, status: e.target.value as any }))}>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="text-sm block">Customer Name<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={String(createForm.customer_name || '')} onChange={(e)=>setCreateForm(v=>({ ...v, customer_name: e.target.value }))}/></label>
              <label className="text-sm block">Phone Number<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={String(createForm.phone_number || '')} onChange={(e)=>setCreateForm(v=>({ ...v, phone_number: e.target.value }))} placeholder="+919999999999"/></label>
              <label className="text-sm block sm:col-span-2">Address<textarea className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[80px]" value={String(createForm.address || '')} onChange={(e)=>setCreateForm(v=>({ ...v, address: e.target.value }))}/></label>
              <label className="text-sm block">Quantity<input type="number" min={1} className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={Number(createForm.quantity || 1)} onChange={(e)=>setCreateForm(v=>({ ...v, quantity: Number(e.target.value) }))}/></label>
              <label className="text-sm block">Shipping Partner<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={String(createForm.shipping_partner || '')} onChange={(e)=>setCreateForm(v=>({ ...v, shipping_partner: e.target.value }))} placeholder="ST Courier / Delhivery / …"/></label>
              <label className="text-sm block">Tracking Code<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={String(createForm.tracking_code || '')} onChange={(e)=>setCreateForm(v=>({ ...v, tracking_code: e.target.value }))}/></label>
              <label className="text-sm flex items-center gap-2">Servicable<input type="checkbox" className="mt-1" checked={!!createForm.servicable} onChange={(e)=>setCreateForm(v=>({ ...v, servicable: e.target.checked }))}/></label>
              <label className="text-sm block sm:col-span-2">Notes<textarea className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[60px]" value={String(createForm.notes || '')} onChange={(e)=>setCreateForm(v=>({ ...v, notes: e.target.value }))}/></label>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200" onClick={()=>setShowCreate(false)}>Cancel</button>
              <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white" onClick={onCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Drawer */}
      {openOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-end" onClick={()=>setOpenOrder(null)}>
          <div className="mt-0 h-full w-full max-w-3xl bg-white ring-1 ring-slate-200" onClick={(e)=>e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Order #{openOrder.id} <span className="ml-2 text-xs px-2 py-0.5 rounded-full ring-1 ring-slate-200">{openOrder.status}</span></div>
              <button className="p-1 rounded hover:bg-slate-100" onClick={()=>setOpenOrder(null)}><X className="w-5 h-5"/></button>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Overview */}
              <div className="rounded-xl ring-1 ring-slate-200 p-3">
                <div className="text-sm font-semibold mb-2">Overview</div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-500">Order Date:</span> {openOrder.order_date}</div>
                  <div><span className="text-slate-500">Order ID:</span> {openOrder.order_id ?? '—'}</div>
                  <div><span className="text-slate-500">Customer:</span> {openOrder.customer_name || '—'}</div>
                  <div className="flex items-start gap-2"><span className="text-slate-500 min-w-[70px]">Address:</span> <span>{openOrder.address || '—'}</span></div>
                  <div className="flex items-center gap-2"><span className="text-slate-500">Phone:</span> <span className="font-mono">{openOrder.phone_number || '—'}</span> {openOrder.phone_number && (<a href={`https://wa.me/${openOrder.phone_number}`} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-slate-100" title="WhatsApp"><PhoneCall className="w-4 h-4"/></a>)}</div>
                  <div><span className="text-slate-500">Qty:</span> {openOrder.quantity}</div>
                  <div><span className="text-slate-500">Servicable:</span> {openOrder.servicable===true ? 'Yes' : openOrder.servicable===false ? 'No' : '—'}</div>
                  <div><span className="text-slate-500">Source:</span> {openOrder.source}</div>
                  <div><span className="text-slate-500">Created By:</span> {openOrder.created_by}</div>
                  <div><span className="text-slate-500">Created At:</span> {fmtDate(openOrder.created_at)}</div>
                  <div className="flex items-center gap-2"><span className="text-slate-500">Partner:</span> <span>{openOrder.shipping_partner || '—'}</span></div>
                  <div className="flex items-center gap-2"><span className="text-slate-500">Tracking:</span> <span className="font-mono">{openOrder.tracking_code || '—'}</span></div>
                </div>
              </div>

              {/* Update Status / Logistics */}
              <div className="rounded-xl ring-1 ring-slate-200 p-3">
                <div className="text-sm font-semibold mb-2">Update Status</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm block">New Status<select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 bg-white" value={updateStatus || openOrder.status} onChange={(e)=>setUpdateStatus(e.target.value)}>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                  <label className="text-sm block">Remark (required for RTO/NDR/Cancelled)<textarea className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[60px]" placeholder="Reason / discussion…" value={noteRemark} onChange={(e)=>setNoteRemark(e.target.value)} /></label>
                  <label className="text-sm block">Shipping Partner<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={updatePartner} onChange={(e)=>setUpdatePartner(e.target.value)} placeholder="ST Courier / Delhivery / …"/></label>
                  <label className="text-sm block">Tracking Code<input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={updateTracking} onChange={(e)=>setUpdateTracking(e.target.value)} placeholder="TRK123…"/></label>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200" onClick={()=>{ setNoteRemark(''); setUpdateStatus(''); setUpdatePartner(''); setUpdateTracking(''); }}>Clear</button>
                  <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50" disabled={updateSaving} onClick={onChangeStatus}>{updateSaving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-xl ring-1 ring-slate-200 p-3 lg:col-span-2">
                <div className="text-sm font-semibold mb-2">Notes</div>
                <div className="flex items-start gap-2">
                  <select value={noteChannel} onChange={(e)=>setNoteChannel(e.target.value)} className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm bg-white"><option>Incoming Call</option><option>RTO Calls</option><option>WhatsApp</option><option>Email</option><option>System</option></select>
                  <textarea className="flex-1 ring-1 ring-slate-200 rounded-lg px-3 py-2 min-h-[60px]" placeholder="Add note…" value={noteRemark} onChange={(e)=>setNoteRemark(e.target.value)} />
                  <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white" onClick={onAddNote}>Add</button>
                </div>
                <ul className="mt-3 space-y-2 max-h-64 overflow-auto">
                  {notes.map(n => (
                    <li key={n.id} className="rounded-lg ring-1 ring-slate-200 p-2">
                      <div className="text-xs text-slate-500 flex items-center gap-2"><User className="w-3 h-3"/> {n.agent} · {fmtDate(n.created_at)} · {n.channel || '—'}</div>
                      <div className="text-sm whitespace-pre-wrap">{n.remark}</div>
                    </li>
                  ))}
                  {!notes.length && <li className="text-sm text-slate-500">No notes yet.</li>}
                </ul>
              </div>

              {/* History */}
              <div className="rounded-xl ring-1 ring-slate-200 p-3 lg:col-span-2">
                <div className="text-sm font-semibold mb-2">Status History</div>
                <ul className="space-y-2 max-h-64 overflow-auto">
                  {history.map(h => (
                    <li key={h.id} className="text-sm"><span className="text-slate-500">{fmtDate(h.changed_at)}:</span> {h.old_status || '—'} → <b>{h.new_status}</b> by {h.changed_by}</li>
                  ))}
                  {!history.length && <li className="text-sm text-slate-500">No changes yet.</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
