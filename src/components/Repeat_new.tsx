import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, User, ShoppingCart, BarChart2, Phone, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCcw, Play, Users, ShieldCheck } from 'lucide-react';
import OrderDetailsDialog from './OrderDetailsDialog';

/** ================================
 *  ENV & HELPERS
 *  ================================ */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://app-supabase.9krcxo.easypanel.host';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs';

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

const ls = {
  get: (k: string) => window.localStorage.getItem(k),
  set: (k: string, v: string) => window.localStorage.setItem(k, v),
  del: (k: string) => window.localStorage.removeItem(k),
};

// LocalStorage keys per spec
const LS_KEYS = {
  SESSION: 'ndr_session',
  USER: 'ndr_user',
  ACTIVE_TEAM_ID: 'ndr_active_team_id',
  MY_ONLY: 'ndr_my_only',
  AUTO_ALLOC_DONE: 'ndr_auto_alloc_done',
} as const;

/** ================================
 *  TYPES
 *  ================================ */
interface RepeatOrder {
  email: string;
  phone: string;
  order_count: number;
  order_ids: string[];
  order_numbers: string[];
  first_order: string;
  last_order: string;
  call_status?: 'Called' | 'Busy' | 'Cancelled' | 'No Response' | 'Wrong Number' | 'Invalid Number' | '';
}

type AllocationMode = 'percentage' | 'round_robin';
type MemberHandle = string;

interface TeamMember {
  id: string;
  team_id: string;
  member: MemberHandle; // matches DB column "member"
  active?: boolean;
}

interface AllocationRuleRow {
  id: string;
  team_id: string;
  mode: AllocationMode;
  // Either we read a JSON rule column or inline fields; supporting both
  rule?: {
    mode?: AllocationMode;
    percents?: Array<{ member: MemberHandle; percent: number }>;
  } | null;
  percents?: Array<{ member: MemberHandle; percent: number }>; // fallback if rule is flattened
}

// removed old NdrLead type (not used)

interface ActivityLog {
  action:
    | 'assign'
    | 'reassign'
    | 'unassign'
    | 'reset_allocation'
    | 'auto_assign'
    | 'status_update'
    | 'final_status_update'
    | 'call_status_update';
  by: MemberHandle;
  meta?: Record<string, any>;
}

/** ================================
 *  REPEAT ORDERS COMPONENT
 *  ================================ */
export default function RepeatOrdersTable() {
  /** ---- Existing state (unchanged) ---- */
  const [orders, setOrders] = useState<RepeatOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<RepeatOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [callStatusType, setCallStatusType] = useState<'success' | 'error' | 'info' | ''>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    callStatus: '',
    dateRange: { start: '', end: '' },
    orderCount: { min: '', max: '' },
  });

  const [analytics, setAnalytics] = useState({
    totalOrders: 0,
    totalCustomers: 0,
    averageOrdersPerCustomer: 0,
    callStatusBreakdown: {
      Called: 0,
      Busy: 0,
      Cancelled: 0,
      'No Response': 0,
      'Wrong Number': 0,
      'Invalid Number': 0,
      'Not Called': 0,
    },
  });

  /** ================================
   *  NEW: Identity & Team Allocation State
   *  ================================ */
  const [session, setSession] = useState<boolean>(!!ls.get(LS_KEYS.SESSION));
  const [currentUser, setCurrentUser] = useState<MemberHandle>(ls.get(LS_KEYS.USER) || '');
  const [activeTeamId, setActiveTeamId] = useState<string>(ls.get(LS_KEYS.ACTIVE_TEAM_ID) || '');
  const [myOnly, setMyOnly] = useState<boolean>(ls.get(LS_KEYS.MY_ONLY) === '1');

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allocationRule, setAllocationRule] = useState<AllocationRuleRow | null>(null);
  const [lastAutoRun, setLastAutoRun] = useState<string | null>(null);
  const autoAllocDone = useMemo(() => !!ls.get(LS_KEYS.AUTO_ALLOC_DONE), []);

  /** ================================
   *  NEW: Identity helpers
   *  ================================ */
  const login = useCallback(() => {
    ls.set(LS_KEYS.SESSION, '1');
    setSession(true);
  }, []);
  const logout = useCallback(() => {
    ls.del(LS_KEYS.SESSION);
    ls.del(LS_KEYS.AUTO_ALLOC_DONE);
    setSession(false);
  }, []);
  const switchUser = useCallback((handle: string) => {
    ls.set(LS_KEYS.USER, handle);
    setCurrentUser(handle);
  }, []);
  const changeTeam = useCallback((teamId: string) => {
    ls.set(LS_KEYS.ACTIVE_TEAM_ID, teamId);
    setActiveTeamId(teamId);
    // When team changes, allow auto allocation to run again
    ls.del(LS_KEYS.AUTO_ALLOC_DONE);
    setLastAutoRun(null);
  }, []);
  const toggleMyOnly = useCallback(() => {
    const next = !myOnly;
    setMyOnly(next);
    ls.set(LS_KEYS.MY_ONLY, next ? '1' : '0');
  }, [myOnly]);

  /** ================================
   *  NEW: Team data & rule fetchers
   *  ================================ */
  const fetchTeamMembers = useCallback(async (teamId: string) => {
    if (!teamId) return [];
    // Try select=member first
    const tryFetch = async (selectExpr: string) => {
      const url = `${SUPABASE_URL}/rest/v1/team_members?team_id=eq.${encodeURIComponent(teamId)}&select=${selectExpr}`;
      return await fetch(url, { headers: sbHeaders });
    };
    let res = await tryFetch(encodeURIComponent('member'));
    let data: any[] | null = null;
    let memberKey: 'member' | 'handle' | string = 'member';
    if (!res.ok) {
      // Try legacy column 'handle'
      res = await tryFetch(encodeURIComponent('handle'));
      if (res.ok) {
        const arr = await res.json();
        data = Array.isArray(arr) ? arr : [];
        memberKey = 'handle';
      } else {
        // Fallback: select=*
        res = await tryFetch(encodeURIComponent('*'));
        if (!res.ok) throw new Error(`team_members: ${res.status}`);
        const arr = await res.json();
        data = Array.isArray(arr) ? arr : [];
        // Detect a plausible member column
        const candidate = data.length ? Object.keys(data[0]).find(k => ['member','handle','name','user','username'].includes(k)) : null;
        memberKey = candidate || 'member';
      }
    } else {
      const arr = await res.json();
      data = Array.isArray(arr) ? arr : [];
      memberKey = 'member';
    }
    return (data || []).map((x: any) => ({ member: x[memberKey] })) as TeamMember[];
  }, []);

  const fetchAllocationRule = useCallback(async (teamId: string) => {
    if (!teamId) return null;
    const url = `${SUPABASE_URL}/rest/v1/repeat_allocation_rules?team_id=eq.${encodeURIComponent(teamId)}&select=id,team_id,rule&limit=1`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) throw new Error(`repeat_allocation_rules: ${r.status}`);
    const rows = (await r.json()) as AllocationRuleRow[];
    return rows[0] || null;
  }, []);

  /** ================================
   *  NEW: Auto allocation internals
   *  ================================ */
  const buildSchedule = (mems: TeamMember[], rule: AllocationRuleRow | null): MemberHandle[] => {
    const activeHandles = mems.filter(m => m.active !== false).map(m => m.member);
    if (!activeHandles.length) return [];

    // If percentage rule present
    const percents = rule?.rule?.percents || rule?.percents;
    if ((rule?.rule?.mode === 'percentage') && percents?.length) {
      // Expand a 100-slot schedule proportionally
      const slots = 100;
      const schedule: MemberHandle[] = [];
      percents.forEach(p => {
        const count = Math.max(0, Math.round((p.percent / 100) * slots));
        for (let i = 0; i < count; i++) schedule.push(p.member);
      });
      // Fallback to round-robin if rounding left gaps
      if (!schedule.length) return activeHandles;
      return schedule;
    }

    // Default round-robin
    return activeHandles;
  };

  // feedback handled inside View Details dialog

  const fetchUnassignedLeads = useCallback(async (teamId: string) => {
    const url = `${SUPABASE_URL}/rest/v1/orders_All?team_id=eq.${encodeURIComponent(teamId)}&assigned_to=is.null&select=order_id,team_id,customer_phone,assigned_to,assigned_at&order=order_date.asc`;
    const r = await fetch(url, { headers: sbHeaders });
    if (!r.ok) throw new Error(`orders_All (unassigned): ${r.status}`);
    return (await r.json()) as Array<{ order_id: string }>;
  }, []);

  const patchLeadAssignment = useCallback(async (orderId: string, assignee: MemberHandle) => {
    const teamId = activeTeamId || '';
    const url = `${SUPABASE_URL}/rest/v1/orders_All?order_id=eq.${encodeURIComponent(orderId)}${teamId ? `&team_id=eq.${encodeURIComponent(teamId)}` : ''}`;
    const payload = { assigned_to: assignee, assigned_at: new Date().toISOString(), ...(teamId ? { team_id: Number(teamId) } : {}) } as any;
    const r = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`orders_All PATCH: ${r.status}`);
  }, [activeTeamId]);

  // Client-side allocation (mirrors NdrDashboard pattern)
  const runRepeatAllocationNow = useCallback(async () => {
    if (!activeTeamId) return;
    const teamId = activeTeamId;
    // 1) Load allocation rule first
    let rule: any = { mode: 'percentage', percents: [] as Array<{ member: string; percent: number }> };
    try {
      const ruleRes = await fetch(`${SUPABASE_URL}/rest/v1/repeat_allocation_rules?team_id=eq.${teamId}&select=rule&limit=1`, { headers: sbHeaders });
      if (ruleRes.ok) {
        const arr = await ruleRes.json();
        if (arr && arr[0]?.rule) rule = arr[0].rule;
      }
    } catch {}

    // 2) Load team members
    const memRes = await fetch(`${SUPABASE_URL}/rest/v1/team_members?team_id=eq.${teamId}&select=member&order=member.asc`, { headers: sbHeaders });
    if (!memRes.ok) throw new Error(`team_members: ${memRes.status}`);
    const memRows: Array<{ member: string }> = await memRes.json();
    let memberHandles = memRows.map(m => (m.member || '').trim()).filter(Boolean);
    // Fallback: if no rows returned, derive from rule.percents
    if (!memberHandles.length && Array.isArray(rule?.percents)) {
      memberHandles = Array.from(new Set(rule.percents.map((p: any) => String(p.member || '').trim()).filter(Boolean)));
    }
    if (!memberHandles.length) throw new Error('No team members (team_members empty and rule.percents empty)');

    // 3) Build schedule (percentage => expanded array of handles; else round-robin list)
    function buildSchedule(): string[] {
      if (rule?.mode === 'percentage' && Array.isArray(rule.percents) && rule.percents.length) {
        const expanded: string[] = [];
        const normHandles = memberHandles.map(h => ({ raw: h, norm: h.toLowerCase() }));
        for (const p of rule.percents) {
          const nameNorm = String(p.member || '').trim().toLowerCase();
          const pct = Math.max(0, Math.round(Number(p.percent) || 0));
          if (!nameNorm || pct <= 0) continue;
          const hit = normHandles.find(h => h.norm === nameNorm);
          const actual = hit?.raw;
          if (!actual) continue;
          for (let i = 0; i < pct; i++) expanded.push(actual);
        }
        if (expanded.length) return expanded;
      }
      return memberHandles;
    }
    const schedule = buildSchedule();
    if (!schedule.length) throw new Error('Empty schedule');

    // 4) Tag team_id on NULL rows so they become part of the pool
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/orders_All?team_id=is.null`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ team_id: Number(teamId) })
      });
    } catch {}

    // 5) Fetch unassigned orders for this team OR not yet tagged to any team
    // or=(team_id.eq.<teamId>,team_id.is.null) and assigned_to is null
    const orArg = encodeURIComponent(`team_id.eq.${teamId},team_id.is.null`);
    const unassignedRes = await fetch(`${SUPABASE_URL}/rest/v1/orders_All?or=(${orArg})&assigned_to=is.null&select=order_id&order=order_date.asc,order_id.asc`, { headers: sbHeaders });
    if (!unassignedRes.ok) throw new Error(`orders_All (unassigned): ${unassignedRes.status}`);
    const unassigned: Array<{ order_id: string }> = await unassignedRes.json();
    if (!Array.isArray(unassigned) || unassigned.length === 0) { setLastAutoRun(new Date().toISOString()); return; }

    // 6) Assign in batches
    const now = new Date().toISOString();
    const batchSize = 50;
    for (let offset = 0; offset < unassigned.length; offset += batchSize) {
      const chunk = unassigned.slice(offset, offset + batchSize);
      await Promise.all(
        chunk.map(async (row: any, idx: number) => {
          const assignee = schedule[(offset + idx) % schedule.length];
          // Do not over-filter by team_id; update by order_id and set team_id in payload
          const url = `${SUPABASE_URL}/rest/v1/orders_All?order_id=eq.${encodeURIComponent(row.order_id)}`;
          await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ assigned_to: assignee, assigned_at: now, team_id: Number(teamId) }) });
        })
      );
    }
    setLastAutoRun(new Date().toISOString());
  }, [activeTeamId]);

  // Manual allocation: assign all unassigned to selected member
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [assigningAll, setAssigningAll] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string>('');
  const [assignErr, setAssignErr] = useState<string>('');

  const assignAllUnassignedTo = useCallback(async () => {
    if (!activeTeamId || !assignTarget) return;
    try {
      setAssigningAll(true);
      setAssignMsg('');
      setAssignErr('');
      const url = `${SUPABASE_URL}/rest/v1/orders_All?team_id=eq.${encodeURIComponent(activeTeamId)}&assigned_to=is.null`;
      const payload = { assigned_to: assignTarget, assigned_at: new Date().toISOString() };
      const res = await fetch(url, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(payload) });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${txt}`);
      }
      setAssignMsg(`Assigned all unassigned to ${assignTarget}`);
    } catch (e: any) {
      setAssignErr(e?.message || 'Assignment failed');
    } finally {
      setAssigningAll(false);
    }
  }, [SUPABASE_URL, activeTeamId, assignTarget]);

  const logActivity = useCallback(async (action: ActivityLog['action'], by: MemberHandle, meta?: Record<string, any>) => {
    const url = `${SUPABASE_URL}/rest/v1/ndr_user_activity`;
    const payload = [{ action, by, meta: meta || null, created_at: new Date().toISOString() }];
    const r = await fetch(url, { method: 'POST', headers: sbHeaders, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`activity log: ${r.status}`);
  }, []);

  /** ================================
   *  NEW: autoAllocateOnce() / resetAllocation()
   *  ================================ */
  const autoAllocateOnce = useCallback(async () => {
    // Guards per spec
    if (!ls.get(LS_KEYS.SESSION) || !ls.get(LS_KEYS.ACTIVE_TEAM_ID)) return;
    if (ls.get(LS_KEYS.AUTO_ALLOC_DONE)) return;

    try {
      // Load team and rule
      const [mems, ruleRow] = await Promise.all([
        fetchTeamMembers(activeTeamId),
        fetchAllocationRule(activeTeamId),
      ]);
      setMembers(mems);
      setAllocationRule(ruleRow);

      // Build schedule
      const schedule = buildSchedule(mems, ruleRow);
      if (!schedule.length) return;

      // Fetch unassigned
      const leads = await fetchUnassignedLeads(activeTeamId);
      if (!leads.length) {
        await logActivity('auto_assign', currentUser || 'system', { result: 'no_unassigned' });
        ls.set(LS_KEYS.AUTO_ALLOC_DONE, '1');
        setLastAutoRun(new Date().toISOString());
        return;
      }

      // Assign in a rotating fashion
      let idx = 0;
      for (const lead of leads) {
        const assignee = schedule[idx % schedule.length];
        await patchLeadAssignment(lead.id, assignee);
        await logActivity('assign', currentUser || 'system', { lead_id: lead.id, assigned_to: assignee, mode: ruleRow?.mode || 'round_robin' });
        idx++;
      }

      // Session meta log
      await logActivity('auto_assign', currentUser || 'system', { count: leads.length, mode: ruleRow?.mode || 'round_robin' });
      ls.set(LS_KEYS.AUTO_ALLOC_DONE, '1');
      setLastAutoRun(new Date().toISOString());
    } catch (e) {
      console.error('autoAllocateOnce error', e);
    }
  }, [activeTeamId, currentUser, fetchTeamMembers, fetchAllocationRule, fetchUnassignedLeads, logActivity, patchLeadAssignment]);

  const resetAllocation = useCallback(async () => {
    if (!activeTeamId) return;
    try {
      // Get all leads currently assigned to any active member, clear assignment
      const activeHandles = members.filter(m => m.active !== false).map(m => m.handle);
      if (!activeHandles.length) return;

      // Clear in batches by assignee
      for (const handle of activeHandles) {
        const url = `${SUPABASE_URL}/rest/v1/ndr?team_id=eq.${encodeURIComponent(activeTeamId)}&assigned_to=eq.${encodeURIComponent(handle)}`;
        const r = await fetch(url, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ assigned_to: null, assigned_at: null }),
        });
        if (!r.ok) throw new Error(`reset PATCH for ${handle}: ${r.status}`);
      }

      await logActivity('reset_allocation', currentUser || 'system', { team_id: activeTeamId, cleared_for: activeHandles });
      // Allow auto allocation to run again
      ls.del(LS_KEYS.AUTO_ALLOC_DONE);
      setLastAutoRun(null);
    } catch (e) {
      console.error('resetAllocation error', e);
    }
  }, [activeTeamId, currentUser, members, logActivity]);

  /** ================================
   *  NEW: Initial team data + first-load auto allocation
   *  ================================ */
  useEffect(() => {
    // Load members & rule when team changes
    (async () => {
      if (!activeTeamId) return;
      try {
        const [mems, rule] = await Promise.all([
          fetchTeamMembers(activeTeamId),
          fetchAllocationRule(activeTeamId),
        ]);
        setMembers(mems);
        setAllocationRule(rule);
      } catch (e) {
        console.error('team boot error', e);
      }
    })();
  }, [activeTeamId, fetchAllocationRule, fetchTeamMembers]);

  useEffect(() => {
    // First load per session auto-run (guarded)
    if (session && activeTeamId && !ls.get(LS_KEYS.AUTO_ALLOC_DONE)) {
      autoAllocateOnce();
    }
  }, [session, activeTeamId, autoAllocateOnce]);

  /** ---- Existing logic (filters/analytics/pagination) ---- */
  const updateAnalytics = useCallback((filteredData: RepeatOrder[]) => {
    const totalOrders = filteredData.reduce((sum, order) => sum + order.order_count, 0);
    const callStatusCounts = {
      Called: 0,
      Busy: 0,
      Cancelled: 0,
      'No Response': 0,
      'Wrong Number': 0,
      'Invalid Number': 0,
      'Not Called': 0,
    };
    filteredData.forEach(order => {
      if (order.call_status) {
        callStatusCounts[order.call_status as keyof typeof callStatusCounts] += 1;
      } else {
        callStatusCounts['Not Called'] += 1;
      }
    });
    const avg = filteredData.length > 0 ? Number((totalOrders / filteredData.length).toFixed(2)) : 0;
    setAnalytics({
      totalOrders,
      totalCustomers: filteredData.length,
      averageOrdersPerCustomer: avg,
      callStatusBreakdown: callStatusCounts,
    });
  }, []);

  const applyFilters = useCallback((currentFilters = filters) => {
    let filtered = [...orders];
    if (currentFilters.search) {
      const s = currentFilters.search.toLowerCase();
      filtered = filtered.filter(order =>
        (order.email && order.email.toLowerCase().includes(s)) ||
        (order.phone && order.phone.includes(s)) ||
        (order.order_numbers && order.order_numbers.some(num => num && num.includes(s)))
      );
    }
    if (currentFilters.callStatus) {
      filtered = filtered.filter(order => order.call_status === currentFilters.callStatus);
    }
    if (currentFilters.dateRange.start && currentFilters.dateRange.end) {
      filtered = filtered.filter(order => {
        const lastOrderDate = new Date(order.last_order);
        return lastOrderDate >= new Date(currentFilters.dateRange.start) &&
               lastOrderDate <= new Date(currentFilters.dateRange.end);
      });
    }
    if (currentFilters.orderCount.min) {
      filtered = filtered.filter(order => order.order_count >= parseInt(currentFilters.orderCount.min, 10));
    }
    if (currentFilters.orderCount.max) {
      filtered = filtered.filter(order => order.order_count <= parseInt(currentFilters.orderCount.max, 10));
    }

    setFilteredOrders(filtered);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
    setCurrentPage(1);
    updateAnalytics(filtered);
  }, [orders, itemsPerPage, filters, updateAnalytics]);

  useEffect(() => {
    if (orders.length > 0) applyFilters(filters);
  }, [orders, applyFilters, filters]);

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const fetchRepeatOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_repeat_orders`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data: RepeatOrder[] = await response.json();
      const processed = data.map((o) => ({ ...o, call_status: (o.call_status || '') as RepeatOrder['call_status'] }));
      setOrders(processed);
      setFilteredOrders(processed);
      setTotalPages(Math.ceil(processed.length / itemsPerPage));

      const totalOrders = processed.reduce((sum, o) => sum + o.order_count, 0);
      const totalCustomers = processed.length;
      const avg = totalCustomers > 0 ? totalOrders / totalCustomers : 0;

      const callStatusCounts = {
        Called: 0,
        Busy: 0,
        Cancelled: 0,
        'No Response': 0,
        'Wrong Number': 0,
        'Invalid Number': 0,
        'Not Called': 0,
      };
      processed.forEach((o) => {
        const status = (o.call_status || '') as keyof typeof callStatusCounts;
        if (status && callStatusCounts[status] !== undefined) callStatusCounts[status] += 1;
        else callStatusCounts['Not Called'] += 1;
      });

      setAnalytics({
        totalOrders,
        totalCustomers,
        averageOrdersPerCustomer: avg,
        callStatusBreakdown: callStatusCounts,
      });
    } catch (err) {
      setError('Failed to fetch repeat orders. Please try again.');
      console.error('Error fetching repeat orders:', err);
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage]);

  useEffect(() => {
    fetchRepeatOrders();
  }, [fetchRepeatOrders]);

  /** ---- Existing click-to-call ---- */
  const handleCall = async (phoneNumber: string) => {
    setCallStatus('Initiating call...');
    setCallStatusType('info');
    if (!phoneNumber || phoneNumber.length < 10) {
      setCallStatus('Invalid phone number.');
      setCallStatusType('error');
      return;
    }
    const apiUrl = `https://app.callerdesk.io/api/click_to_call_v2?calling_party_a=09363744463&calling_party_b=${phoneNumber}&deskphone=08062863034&authcode=aee60239bd42b6427d82b94bbb676a3d&call_from_did=1`;
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      const successText = 'Call to Customer Initiate Successfully';
      if (data?.message?.includes(successText)) {
        setCallStatus(data.message);
        setCallStatusType('success');
      } else {
        const errorMessage = data.message || 'An unknown error occurred.';
        setCallStatus(`Failed: ${errorMessage}`);
        setCallStatusType('error');
      }
    } catch (err) {
      console.error('Click-to-call network/parsing error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCallStatus(`Failed to initiate call: ${errorMessage}`);
      setCallStatusType('error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const nf = { ...prev, [name]: value };
      applyFilters(nf);
      return nf;
    });
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'start' | 'end') => {
    const { value } = e.target;
    setFilters(prev => {
      const nf = { ...prev, dateRange: { ...prev.dateRange, [field]: value } };
      applyFilters(nf);
      return nf;
    });
  };

  const handleOrderCountChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'min' | 'max') => {
    const { value } = e.target;
    setFilters(prev => {
      const nf = { ...prev, orderCount: { ...prev.orderCount, [field]: value } };
      applyFilters(nf);
      return nf;
    });
  };

  /** ================================
   *  UI
   *  ================================ */
  return (
    <div className="bg-gray-100 min-h-screen font-sans py-4 -mx-40">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Repeat Customers</h1>
        <p className="text-gray-600 mt-1">Analyze, filter, and manage customers with repeat orders.</p>
      </header>

      {/* NEW: Team & Allocation Status Panel */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-indigo-600" />
            <div>
              <div className="text-sm text-gray-500">Current user</div>
              <div className="font-semibold">{currentUser || '—'}</div>
            </div>
            <div className="ml-6">
              <div className="text-sm text-gray-500">Active team</div>
              <div className="font-semibold">{activeTeamId || '—'}</div>
            </div>
            <div className="ml-6">
              <div className="text-sm text-gray-500">Members</div>
              <div className="font-medium">{members.length ? members.map(m => m.member).join(', ') : '—'}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={myOnly}
                onChange={toggleMyOnly}
                className="rounded border-gray-300"
              />
              My only
            </label>
            <button
              onClick={() => (session ? logout() : login())}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              {session ? 'Logout' : 'Login'}
            </button>
            <button
              onClick={() => {
                const handle = prompt('Enter handle (e.g., Akash):', currentUser || '') || '';
                if (handle) switchUser(handle);
              }}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              Switch User
            </button>
            <button
              onClick={() => {
                const tid = prompt('Enter Team ID:', activeTeamId || '') || '';
                if (tid) changeTeam(tid);
              }}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              Change Team
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
            <div className="text-xs text-indigo-700">Rule</div>
            <div className="font-semibold text-indigo-900 mt-1">
              {allocationRule?.rule?.mode || 'round_robin'}
            </div>
            { (allocationRule?.rule?.percents)?.length ? (
              <div className="text-xs text-indigo-800 mt-1">
                {allocationRule!.rule!.percents!.map((p: any) => `${p.member} ${p.percent}%`).join(' • ')}
              </div>
            ) : null }
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-100">
            <div className="text-xs text-green-700">Last auto-run</div>
            <div className="font-semibold text-green-900 mt-1">{lastAutoRun ? new Date(lastAutoRun).toLocaleString() : '—'}</div>
            <div className="text-xs text-green-700 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> {autoAllocDone ? 'Session: done' : 'Session: pending'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runRepeatAllocationNow}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              disabled={!session || !activeTeamId}
              title={!session || !activeTeamId ? 'Login & set team to run' : 'Run auto-allocation now'}
            >
              <Play className="w-4 h-4" /> Run now
            </button>
            <button
              onClick={resetAllocation}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-gray-50"
              disabled={!members.length || !activeTeamId}
              title={!members.length ? 'No members to clear' : 'Clear assignments for team members'}
            >
              <RefreshCcw className="w-4 h-4" /> Reset allocation
            </button>
            {/* Manual allocation to a specific member */}
            <div className="flex items-center gap-2">
              <select
                value={assignTarget}
                onChange={(e) => setAssignTarget(e.target.value)}
                className="px-2 py-2 rounded-lg border text-sm"
                disabled={!members.length}
                aria-label="Select member to assign"
                title="Select member to assign"
              >
                <option value="">Assign to…</option>
                {members.map(m => (
                  <option key={m.member} value={m.member}>{m.member}</option>
                ))}
              </select>
              <button
                onClick={assignAllUnassignedTo}
                disabled={!assignTarget || !activeTeamId || assigningAll}
                className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
                title="Assign all unassigned leads to the selected member"
              >
                {assigningAll ? 'Assigning…' : 'Assign Unassigned'}
              </button>
            </div>
          </div>
          {(assignMsg || assignErr) && (
            <div className="col-span-full text-sm mt-2">
              {assignMsg && <div className="text-emerald-700">{assignMsg}</div>}
              {assignErr && <div className="text-rose-700">{assignErr}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Analytics Section (unchanged) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Total Customers</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.totalCustomers}</p>
          </div>
          <div className="bg-blue-100 p-3 rounded-full">
            <User className="h-6 w-6 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Total Repeat Orders</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.totalOrders}</p>
          </div>
          <div className="bg-green-100 p-3 rounded-full">
            <ShoppingCart className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Avg Orders / Customer</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{analytics.averageOrdersPerCustomer.toFixed(2)}</p>
          </div>
          <div className="bg-yellow-100 p-3 rounded-full">
            <BarChart2 className="h-6 w-6 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Called / Not Called</h3>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {analytics.callStatusBreakdown.Called}
              <span className="text-gray-400 mx-1">/</span>
              {analytics.callStatusBreakdown['Not Called']}
            </p>
          </div>
          <div className="bg-red-100 p-3 rounded-full">
            <Phone className="h-6 w-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Call Status & Error Messages (unchanged) */}
      {callStatus && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            callStatusType === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : callStatusType === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {callStatus}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Filters (unchanged) */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="search"
                placeholder="Search by email, phone, order..."
                value={filters.search}
                onChange={handleFilterChange}
                className="w-full p-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>
            <select
              name="callStatus"
              value={filters.callStatus}
              onChange={handleFilterChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition"
              aria-label="Filter by call status"
            >
              <option value="">All Call Statuses</option>
              <option value="Called">Called</option>
              <option value="Busy">Busy</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No Response">No Response</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Invalid Number">Invalid Number</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" name="start" value={filters.dateRange.start} onChange={(e) => handleDateRangeChange(e, 'start')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Start date" />
              <input type="date" name="end" value={filters.dateRange.end} onChange={(e) => handleDateRangeChange(e, 'end')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="End date" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" name="min" placeholder="Min Orders" value={filters.orderCount.min} onChange={(e) => handleOrderCountChange(e, 'min')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Minimum orders" />
              <input type="number" name="max" placeholder="Max Orders" value={filters.orderCount.max} onChange={(e) => handleOrderCountChange(e, 'max')} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" aria-label="Maximum orders" />
            </div>
          </div>
        </div>

        {/* Table (unchanged rendering) */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 hidden lg:table-header-group">
              <tr>
                <th scope="col" className="px-6 py-3 w-1/3">Customer</th>
                <th scope="col" className="px-6 py-3 w-1/12">Status</th>
                <th scope="col" className="px-6 py-3 w-1/3">Order Info</th>
                <th scope="col" className="px-6 py-3 w-1/6">Date Range</th>
                <th scope="col" className="px-6 py-3 w-auto text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="bg-white">
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading customers...</td>
                </tr>
              ) : paginatedOrders.length > 0 ? (
                paginatedOrders.map((order) => (
                  <tr key={order.email} className="bg-white border-b hover:bg-gray-50 block lg:table-row">
                    <td className="px-6 py-4 font-medium text-gray-900 block lg:table-cell" data-label="Customer">
                      <div className="font-bold">{order.email}</div>
                      <div>{order.phone}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Status">
                      <span
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          order.call_status === 'Called'
                            ? 'bg-green-100 text-green-800'
                            : order.call_status === 'No Response'
                            ? 'bg-yellow-100 text-yellow-800'
                            : order.call_status
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {order.call_status || 'Not Called'}
                      </span>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Order Info">
                      <div>{order.order_count} orders</div>
                      <div className="text-xs text-gray-600 break-words">IDs: {order.order_ids.join(', ')}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell" data-label="Date Range">
                      <div>First: {formatDate(order.first_order)}</div>
                      <div>Last: {formatDate(order.last_order)}</div>
                    </td>
                    <td className="px-6 py-4 block lg:table-cell text-center" data-label="Actions">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleCall(order.phone)} className="font-medium text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50 transition-colors">Call</button>
                        <button
                          onClick={() => {
                            if (order.order_numbers && order.order_numbers.length > 0) {
                              setSelectedOrderNumber(order.order_numbers[0]);
                              setIsDialogOpen(true);
                            }
                          }}
                          className="font-medium text-indigo-600 hover:text-indigo-800 p-2 rounded-md hover:bg-indigo-50 transition-colors"
                        >
                          View Details
                        </button>
                        {/* Feedback handled inside View Details */}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="bg-white">
                  <td colSpan={5} className="py-8 text-center text-gray-500">No repeat orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls (unchanged) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Rows per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 transition-colors"
                aria-label="Rows per page"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <nav aria-label="Pagination">
              <ul className="inline-flex items-center -space-x-px">
                <li>
                  <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to first page">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to previous page">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <span className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300">Page {currentPage} of {totalPages}</span>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to next page">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </li>
                <li>
                  <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Go to last page">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <OrderDetailsDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        orderNumber={selectedOrderNumber}
      />

      {/* Feedback no longer separate; capture inside View Details */}
    </div>
  );
}
