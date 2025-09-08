import React, { useEffect, useMemo, useState } from "react";

const SUPABASE_URL = (window as any).SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "https://app-supabase.9krcxo.easypanel.host/rest/v1";
const SUPABASE_HEADERS: Record<string, string> = {
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  Authorization:
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  "Content-Type": "application/json",
};

type Member = { id: number; member: string };

type Rule = {
  mode: 'percentage' | 'status';
  percents?: Array<{ member: string; percent: number }>;
  status_filters?: Array<{ status: string; members: string[] }>; // reserved for future
};

export default function NdrAllocationPage() {
  const [teamId, setTeamId] = useState<number | null>(() => {
    const raw = localStorage.getItem('ndr_active_team_id');
    return raw ? Number(raw) : null;
  });
  const [teamName, setTeamName] = useState<string>(() => localStorage.getItem('ndr_active_team_name') || '');
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<Rule>({ mode: 'percentage', percents: [] });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/teams?select=*&order=name.asc`, { headers: SUPABASE_HEADERS });
        const arr = res.ok ? await res.json() : [];
        setTeams(arr);
      } catch {
        setTeams([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!teamId) { setMembers([]); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=id,member&order=member.asc`, { headers: SUPABASE_HEADERS });
        const arr: Member[] = res.ok ? await res.json() : [];
        setMembers(arr);
      } catch { setMembers([]); }
    })();
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/ndr_allocation_rules?team_id=eq.${teamId}&select=rule&limit=1`, { headers: SUPABASE_HEADERS });
        if (res.ok) {
          const [row] = await res.json();
          if (row?.rule) setRule(row.rule as Rule);
          else setRule({ mode: 'percentage', percents: members.map(m => ({ member: m.member, percent: 0 })) });
        }
      } catch {}
    })();
  }, [teamId, members.length]);

  const percentTotal = useMemo(() => (rule.percents || []).reduce((s, p) => s + (Number(p.percent) || 0), 0), [rule.percents]);

  function setMemberPercent(member: string, percent: number) {
    const list = rule.percents || [];
    const idx = list.findIndex(p => p.member === member);
    if (idx >= 0) list[idx] = { member, percent };
    else list.push({ member, percent });
    setRule({ ...rule, percents: [...list] });
  }

  async function saveRule() {
    if (!teamId) { alert('Select a team first'); return; }
    if (rule.mode === 'percentage' && Math.round(percentTotal) !== 100) {
      alert('Percentage total must equal 100');
      return;
    }
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/ndr_allocation_rules`, {
        method: 'POST',
        headers: { ...SUPABASE_HEADERS, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ team_id: teamId, rule }),
      });
      alert('Allocation rule saved');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">NDR Allocation</div>
          <div className="text-sm text-slate-600">Define how unassigned NDRs are distributed within the active team</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="ring-1 ring-slate-200 rounded-lg px-3 py-2"
            value={teamId ?? ''}
            onChange={(e) => {
              const tid = e.target.value ? Number(e.target.value) : null;
              setTeamId(tid);
              const name = teams.find(t => t.id === tid)?.name || '';
              setTeamName(name);
              try { localStorage.setItem('ndr_active_team_id', String(tid || '')); localStorage.setItem('ndr_active_team_name', name); } catch {}
            }}
          >
            <option value="">Select team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400" onClick={saveRule} disabled={!teamId || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Mode switch (future: add status-based UI) */}
      <div className="ring-1 ring-slate-200 rounded-xl p-3 bg-white">
        <div className="text-sm font-medium">Mode</div>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="mode" checked={rule.mode === 'percentage'} onChange={() => setRule({ ...rule, mode: 'percentage' })} />
            Percentage split
          </label>
          <label className="inline-flex items-center gap-2 opacity-50 cursor-not-allowed" title="Coming soon">
            <input type="radio" name="mode" disabled /> Status-based mapping
          </label>
        </div>
      </div>

      {rule.mode === 'percentage' && (
        <div className="ring-1 ring-slate-200 rounded-xl p-3 bg-white">
          <div className="text-sm font-medium mb-2">Percentage per member</div>
          {members.length === 0 ? (
            <div className="text-sm text-slate-500">No members for the selected team.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {members.map((m) => {
                const current = (rule.percents || []).find(p => p.member === m.member)?.percent || 0;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 ring-1 ring-slate-100 rounded-lg px-3 py-2">
                    <div className="text-sm">{m.member}</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-20 ring-1 ring-slate-200 rounded-lg px-2 py-1 text-right"
                        type="number"
                        min={0}
                        max={100}
                        value={current}
                        onChange={(e) => setMemberPercent(m.member, Number(e.target.value))}
                      />
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 text-sm">
            Total: <span className={percentTotal === 100 ? 'text-emerald-700' : 'text-rose-700'}>{percentTotal}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
