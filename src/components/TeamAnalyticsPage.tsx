import React, { useEffect, useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

const SUPABASE_URL = (window as any).SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "https://app-supabase.9krcxo.easypanel.host/rest/v1";
const SUPABASE_HEADERS: Record<string, string> = {
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  Authorization:
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  "Content-Type": "application/json",
};

function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TeamAnalyticsPage() {
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [teamId, setTeamId] = useState<number | null>(() => {
    const raw = localStorage.getItem("ndr_active_team_id");
    return raw ? Number(raw) : null;
  });
  const [members, setMembers] = useState<Array<{ id: number; member: string }>>([]);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISODate(d);
  });
  const [to, setTo] = useState<string>(() => toISODate(new Date()));
  const [loading, setLoading] = useState(false);
  // Daily (previous day) snapshot
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyRows, setDailyRows] = useState<Array<{ assigned_to: string | null; assigned_at: string | null; notes: string | null; courier_account?: string | null; email_sent?: boolean | null }>>([]);
  const [dailyAgent, setDailyAgent] = useState<string>('All');
  const [ndrRows, setNdrRows] = useState<Array<{ assigned_to: string | null; assigned_at: string | null; status: string | null; notes: string | null; order_id?: number; waybill?: string | number; courier_account?: string | null; delivery_status?: string | null; email_sent?: boolean | null; called?: boolean | null }>>([]);
  const [activities, setActivities] = useState<Array<{ actor: string | null; action: string | null; created_at: string | null }>>([]);
  // table-like filters
  const [qOrderId, setQOrderId] = useState<string>("");
  const [qAwb, setQAwb] = useState<string>("");
  const [qStatus, setQStatus] = useState<string>("All");
  const [qCourier, setQCourier] = useState<string>("All");
  const [qEmail, setQEmail] = useState<string>("All"); // All | Yes | No
  const [qCall, setQCall] = useState<string>("All"); // All | Yes | No | Call Status value

  // load teams
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/teams?select=*&order=name.asc`, { headers: SUPABASE_HEADERS });
        const arr = res.ok ? await res.json() : [];
        setTeams(arr);
      } catch { setTeams([]); }
    })();
  }, []);

  // load members when team changes
  useEffect(() => {
    if (!teamId) { setMembers([]); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=id,member&order=member.asc`, { headers: SUPABASE_HEADERS });
        const arr = res.ok ? await res.json() : [];
        setMembers(arr);
      } catch { setMembers([]); }
    })();
  }, [teamId]);

  async function loadData() {
    if (!teamId) return;
    setLoading(true);
    try {
      const fromIso = `${from}T00:00:00`;
      const toIso = `${to}T23:59:59.999`;
      // fetch NDR assignment slice (assigned_to, assigned_at, status, notes)
      const ndrUrl = `${SUPABASE_URL}/ndr?assigned_at=gte.${encodeURIComponent(fromIso)}&assigned_at=lte.${encodeURIComponent(toIso)}&select=assigned_to,assigned_at,status,notes,order_id,waybill,courier_account,delivery_status,email_sent,called&order=assigned_at.asc`;
      const ndrRes = await fetch(ndrUrl, { headers: SUPABASE_HEADERS });
      const ndrArr = ndrRes.ok ? await ndrRes.json() : [];
      setNdrRows(Array.isArray(ndrArr) ? ndrArr : []);
      // fetch activities by team members
      const actorFilter = members.length ? `&actor=in.(${members.map(m => `"${encodeURIComponent(m.member)}"`).join(',')})` : "";
      const actUrl = `${SUPABASE_URL}/ndr_user_activity?created_at=gte.${encodeURIComponent(fromIso)}&created_at=lte.${encodeURIComponent(toIso)}${actorFilter}&select=actor,action,created_at&order=created_at.asc`;
      const actRes = await fetch(actUrl, { headers: SUPABASE_HEADERS });
      const actArr = actRes.ok ? await actRes.json() : [];
      setActivities(Array.isArray(actArr) ? actArr : []);
    } finally { setLoading(false); }
  }

  // Load snapshot for the selected range (uses global From/To)
  async function loadSnapshotRange() {
    if (!teamId) { setDailyRows([]); return; }
    setDailyLoading(true);
    try {
      const fromIso = `${from}T00:00:00`;
      const toIso = `${to}T23:59:59.999`;
      const url = `${SUPABASE_URL}/ndr?assigned_at=gte.${encodeURIComponent(fromIso)}&assigned_at=lte.${encodeURIComponent(toIso)}&select=assigned_to,assigned_at,notes,courier_account,email_sent&order=assigned_at.asc`;
      const res = await fetch(url, { headers: SUPABASE_HEADERS });
      const arr = res.ok ? await res.json() : [];
      setDailyRows(Array.isArray(arr) ? arr : []);
    } finally { setDailyLoading(false); }
  }

  useEffect(() => { loadSnapshotRange(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [teamId, from, to]);

  // Derived daily metrics (agent-filtered)
  const filteredDailyRows = useMemo(() => {
    const sel = (dailyAgent || 'All').trim();
    if (sel === 'All' || sel === '') return dailyRows;
    return dailyRows.filter(r => (r.assigned_to || '').trim() === sel);
  }, [dailyRows, dailyAgent]);

  const prevDayAssignedCount = useMemo(() => filteredDailyRows.length, [filteredDailyRows]);
  const dailyPartnerWise = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredDailyRows) {
      const key = courierName(r.courier_account || "");
      if (!key || key === '—') continue;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  }, [filteredDailyRows]);
  const dailyAgentWise = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredDailyRows) {
      const key = (r.assigned_to || '').trim();
      if (!key) continue;
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  }, [filteredDailyRows]);
  const dailyRaisedWithPartner = useMemo(() => {
    // Business rule: "Raised with Delivery partner" = Email sent to courier partner
    return filteredDailyRows.reduce((acc, r) => acc + (r.email_sent === true ? 1 : 0), 0);
  }, [filteredDailyRows]);

  // Export filtered report as CSV
  function exportReport() {
    const rows = filteredDailyRows;
    const headers = [
      'assigned_to',
      'assigned_at',
      'courier_account',
      'email_sent',
      'notes'
    ] as const;
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const agentSlug = (dailyAgent && dailyAgent !== 'All') ? dailyAgent.replace(/\s+/g, '_') : 'all_agents';
    a.download = `ndr_report_${from}_to_${to}_${agentSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  useEffect(() => { loadData(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [teamId, from, to, members.length]);

  // utility
  function courierName(s?: string | null) {
    if (!s) return "—";
    const v = s.toLowerCase();
    if (v.includes("bluedart")) return "Bluedart";
    if (v.includes("delhivery")) return "Delhivery";
    return s;
  }

  function parseNotes(notes: string | null): any {
    if (!notes) return {};
    try { const o = JSON.parse(notes); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
  }

  // apply filters similar to table
  const filteredRows = useMemo(() => {
    return ndrRows.filter((r) => {
      if (qOrderId && String(r.order_id || '').trim() !== qOrderId.trim()) return false;
      if (qAwb && String(r.waybill || '').trim() !== qAwb.trim()) return false;
      if (qStatus !== 'All' && String(r.delivery_status || r.status || '') !== qStatus) return false;
      if (qCourier !== 'All' && courierName(r.courier_account || '') !== qCourier) return false;
      if (qEmail !== 'All') {
        const val = r.email_sent ? 'Yes' : 'No';
        if (qEmail !== val) return false;
      }
      if (qCall !== 'All') {
        const n = parseNotes(r.notes || null);
        const callVal = (n.call_status ? 'Yes' : (r.called === true ? 'Yes' : r.called === false ? 'No' : '')) || 'No';
        if (qCall !== callVal) return false;
      }
      return true;
    });
  }, [ndrRows, qOrderId, qAwb, qStatus, qCourier, qEmail, qCall]);

  // derived datasets
  const memberList = useMemo(() => members.map(m => m.member), [members]);
  const assignedCountByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memberList) map.set(m, 0);
    for (const r of filteredRows) {
      const key = (r.assigned_to || "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, 0);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return memberList.map(m => map.get(m) || 0);
  }, [filteredRows, memberList]);

  const statusSplitByMember = useMemo(() => {
    const statuses = ["Open", "In Progress", "Resolved", "Escalated", "Other"];
    const layers: Record<string, number[]> = {};
    for (const s of statuses) layers[s] = memberList.map(() => 0);
    for (const r of filteredRows) {
      const m = (r.assigned_to || "").trim();
      const idx = memberList.indexOf(m);
      if (idx < 0) continue;
      const s = (r.status || "Other");
      const key = statuses.includes(s) ? s : "Other";
      layers[key][idx] += 1;
    }
    return { statuses, layers };
  }, [filteredRows, memberList]);

  const actionsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activities) {
      const d = a.created_at ? new Date(a.created_at) : null;
      if (!d) continue;
      const day = toISODate(d);
      map.set(day, (map.get(day) || 0) + 1);
    }
    const days: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(toISODate(d));
    return { days, values: days.map((d) => map.get(d) || 0) };
  }, [activities, from, to]);

  // Email sent and Calls updated per member
  const emailSentByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memberList) map.set(m, 0);
    for (const r of filteredRows) {
      const m = (r.assigned_to || '').trim();
      if (!m || !map.has(m)) continue;
      if (r.email_sent === true) map.set(m, (map.get(m) || 0) + 1);
    }
    return memberList.map(m => map.get(m) || 0);
  }, [filteredRows, memberList]);

  const callsUpdatedByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memberList) map.set(m, 0);
    for (const r of filteredRows) {
      const m = (r.assigned_to || '').trim();
      if (!m || !map.has(m)) continue;
      const n = parseNotes(r.notes || null);
      const updated = (typeof r.called === 'boolean') || Boolean(n.call_status);
      if (updated) map.set(m, (map.get(m) || 0) + 1);
    }
    return memberList.map(m => map.get(m) || 0);
  }, [filteredRows, memberList]);

  // Resolution attribution
  type ResCat = 'resolved_by_member' | 'resolved_by_agent' | 'auto_resolved';
  const resolutionPie = useMemo(() => {
    const counts: Record<ResCat, number> = { resolved_by_member: 0, resolved_by_agent: 0, auto_resolved: 0 };
    for (const r of filteredRows) {
      const n = parseNotes(r.notes || null);
      const callUpdated = Boolean(n.call_status) || typeof r.called === 'boolean';
      const emailSent = r.email_sent === true;
      const statusResolved = String(r.status || '').toLowerCase() === 'resolved';
      if (emailSent && callUpdated && statusResolved) counts.resolved_by_member += 1;
      else if ((emailSent || callUpdated) && statusResolved) counts.resolved_by_agent += 1;
      else if (statusResolved) counts.auto_resolved += 1;
    }
    return [
      { name: 'Resolved by member', y: counts.resolved_by_member },
      { name: 'Resolved by agent', y: counts.resolved_by_agent },
      { name: 'Auto resolved', y: counts.auto_resolved },
    ];
  }, [filteredRows]);

  // charts
  const assignedOptions: Highcharts.Options = {
    chart: { type: "column", height: 340, spacing: [12, 12, 12, 12] },
    title: { text: "Assignments per member" },
    credits: { enabled: false },
    xAxis: { categories: memberList, tickPixelInterval: 50 },
    yAxis: { title: { text: "Assigned" }, allowDecimals: false, min: 0 },
    tooltip: { shared: true },
    plotOptions: {
      column: { dataLabels: { enabled: true }, minPointLength: 2, pointPadding: 0.1, groupPadding: 0.08, borderWidth: 0 }
    },
    series: [{ name: "Assigned", type: "column", data: assignedCountByMember as number[] }],
    legend: { enabled: true }
  };

  const emailOptions: Highcharts.Options = {
    chart: { type: 'column', height: 320 },
    title: { text: 'Email sent per member' },
    credits: { enabled: false },
    xAxis: { categories: memberList },
    yAxis: { title: { text: 'Emails' }, min: 0, allowDecimals: false },
    tooltip: { shared: true },
    plotOptions: { column: { dataLabels: { enabled: true }, minPointLength: 2, pointPadding: 0.1, groupPadding: 0.08, borderWidth: 0 } },
    series: [{ name: 'Emails sent', type: 'column', data: emailSentByMember as number[] }],
  };

  const callsOptions: Highcharts.Options = {
    chart: { type: 'column', height: 320 },
    title: { text: 'Calls updated per member' },
    credits: { enabled: false },
    xAxis: { categories: memberList },
    yAxis: { title: { text: 'Calls updated' }, min: 0, allowDecimals: false },
    tooltip: { shared: true },
    plotOptions: { column: { dataLabels: { enabled: true }, minPointLength: 2, pointPadding: 0.1, groupPadding: 0.08, borderWidth: 0 } },
    series: [{ name: 'Calls updated', type: 'column', data: callsUpdatedByMember as number[] }],
  };

  const stackedOptions: Highcharts.Options = {
    chart: { type: "column", height: 380, spacing: [12, 12, 12, 12] },
    title: { text: "Status split per member" },
    credits: { enabled: false },
    xAxis: { categories: memberList, tickPixelInterval: 50 },
    yAxis: { min: 0, title: { text: "Count" }, stackLabels: { enabled: true }, allowDecimals: false },
    tooltip: { shared: true },
    plotOptions: { column: { stacking: "normal", dataLabels: { enabled: true }, minPointLength: 2, pointPadding: 0.05, groupPadding: 0.05, borderWidth: 0 } },
    series: (statusSplitByMember.statuses.map((s) => ({
      name: s,
      type: "column",
      data: statusSplitByMember.layers[s] as number[],
      showInLegend: true,
    })) as Highcharts.SeriesOptionsType[]),
  };

  const activityOptions: Highcharts.Options = {
    chart: { type: "line", height: 320 },
    title: { text: "Activity per day" },
    credits: { enabled: false },
    xAxis: { categories: actionsByDay.days },
    yAxis: { title: { text: "Events" }, allowDecimals: false, min: 0 },
    tooltip: { shared: true },
    plotOptions: { series: { dataLabels: { enabled: false } } },
    series: [{ name: "Events", type: "line", data: actionsByDay.values as number[] }],
  };

  const resolutionOptions: Highcharts.Options = {
    chart: { type: 'pie', height: 320 },
    title: { text: 'Resolution attribution' },
    credits: { enabled: false },
    tooltip: { pointFormatter: function() { return `<span style="color:${(this as any).color}">●</span> ${(this as any).name}: <b>${(this as any).y}</b>`; } },
    plotOptions: { pie: { dataLabels: { enabled: true, format: '{point.name}: {point.y}' } } },
    series: [{ type: 'pie', name: 'Resolved', data: resolutionPie as any }],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Team Analytics</div>
          <div className="text-sm text-slate-600">Assignments, status split, and activity over time</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Team</label>
          <select className="ring-1 ring-slate-200 rounded-lg px-3 py-2" value={teamId ?? ''} onChange={(e)=>{
            const tid = e.target.value ? Number(e.target.value) : null; setTeamId(tid);
            try { localStorage.setItem('ndr_active_team_id', tid ? String(tid) : ''); } catch {}
          }} title="Select team">
            <option value="">Select…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="text-sm">From</label>
          <input className="ring-1 ring-slate-200 rounded-lg px-3 py-2" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          <label className="text-sm">To</label>
          <input className="ring-1 ring-slate-200 rounded-lg px-3 py-2" type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
          <button className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400" onClick={loadData} disabled={loading || !teamId}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button
            type="button"
            title="Switch User"
            className="px-3 py-2 rounded-lg ring-1 ring-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100"
            onClick={() => {
              try { localStorage.removeItem('ndr_user'); localStorage.removeItem('ndr_session'); } catch {}
              window.location.reload();
            }}
          >
            Switch User
          </button>
        </div>
      </div>

      {/* Daily Report (Previous Day) */}
      <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Report (Selected Date Range)</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Agent
              <select
                className="ml-2 ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm"
                value={dailyAgent}
                onChange={(e)=>setDailyAgent(e.target.value)}
                title="Filter report by agent"
              >
                <option>All</option>
                {members.map(m => <option key={m.member} value={m.member}>{m.member}</option>)}
              </select>
            </label>
            <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50" onClick={exportReport} title="Export report as CSV">Export CSV</button>
            <button className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 text-sm hover:bg-slate-50" onClick={loadSnapshotRange} disabled={dailyLoading}>{dailyLoading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <div className="text-xs text-slate-500">Assigned count (range)</div>
            <div className="text-2xl font-semibold mt-1">{prevDayAssignedCount}</div>
          </div>
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <div className="text-xs text-slate-500">Delivery partner wise (top)</div>
            <div className="mt-2 space-y-1 max-h-40 overflow-auto">
              {dailyPartnerWise.length === 0 ? <div className="text-sm text-slate-500">No data</div> : dailyPartnerWise.map(([k,v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <div className="text-xs text-slate-500">Agent wise assigned</div>
            <div className="mt-2 space-y-1 max-h-40 overflow-auto">
              {dailyAgentWise.length === 0 ? <div className="text-sm text-slate-500">No data</div> : dailyAgentWise.map(([k,v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl ring-1 ring-slate-200 p-3">
            <div className="text-xs text-slate-500">Raised with Delivery partner (emails sent)</div>
            <div className="text-2xl font-semibold mt-1">{dailyRaisedWithPartner}</div>
          </div>
        </div>
      </div>

      {/* Table-like filters */}
      <div className="ring-1 ring-slate-200 bg-white rounded-2xl p-3 grid md:grid-cols-3 lg:grid-cols-6 gap-2">
        <label className="text-xs">Order ID
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qOrderId} onChange={(e)=>setQOrderId(e.target.value)} placeholder="e.g. 123" />
        </label>
        <label className="text-xs">AWB
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qAwb} onChange={(e)=>setQAwb(e.target.value)} placeholder="e.g. 12345" />
        </label>
        <label className="text-xs">Current status
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qStatus} onChange={(e)=>setQStatus(e.target.value)}>
            <option>All</option>
            <option>Open</option>
            <option>In Progress</option>
            <option>Resolved</option>
            <option>Escalated</option>
            <option>Other</option>
          </select>
        </label>
        <label className="text-xs">Courier
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qCourier} onChange={(e)=>setQCourier(e.target.value)}>
            <option>All</option>
            <option>Bluedart</option>
            <option>Delhivery</option>
          </select>
        </label>
        <label className="text-xs">Email Sent
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qEmail} onChange={(e)=>setQEmail(e.target.value)}>
            <option>All</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label className="text-xs">Call Status
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-2 py-1" value={qCall} onChange={(e)=>setQCall(e.target.value)}>
            <option>All</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={assignedOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={stackedOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={emailOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white">
          <HighchartsReact highcharts={Highcharts} options={callsOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white lg:col-span-2">
          <HighchartsReact highcharts={Highcharts} options={activityOptions} />
        </div>
        <div className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white lg:col-span-2">
          <HighchartsReact highcharts={Highcharts} options={resolutionOptions} />
        </div>
      </div>
    </div>
  );
}
