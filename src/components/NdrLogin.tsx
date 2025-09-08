import React, { useEffect, useState } from "react";

const SUPABASE_URL = (window as any).SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "https://app-supabase.9krcxo.easypanel.host/rest/v1";
const SUPABASE_HEADERS: Record<string, string> = {
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  Authorization:
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  "Content-Type": "application/json",
};

export default function NdrLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; member: string; pin?: string }>>([]);
  const [member, setMember] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/teams?select=*&order=name.asc`, { headers: SUPABASE_HEADERS });
        if (res.ok) {
          const arr = await res.json();
          setTeams(Array.isArray(arr) ? arr : []);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!teamId) { setMembers([]); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=id,team_id,member,pin&order=member.asc`, { headers: SUPABASE_HEADERS });
        if (res.ok) {
          const arr = await res.json();
          setMembers(Array.isArray(arr) ? arr : []);
        } else {
          // Try without pin column if missing
          const res2 = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&select=id,team_id,member&order=member.asc`, { headers: SUPABASE_HEADERS });
          const arr2 = res2.ok ? await res2.json() : [];
          setMembers(Array.isArray(arr2) ? arr2 : []);
        }
      } catch { setMembers([]); }
    })();
  }, [teamId]);

  async function login() {
    if (!teamId || !member || !pin) { alert('Select team, member and enter PIN'); return; }
    setLoading(true);
    try {
      // Validate PIN if column exists; otherwise accept any (temporary)
      const res = await fetch(`${SUPABASE_URL}/team_members?team_id=eq.${teamId}&member=eq.${encodeURIComponent(member)}&select=id,member,pin&limit=1`, { headers: SUPABASE_HEADERS });
      if (res.ok) {
        const [row] = await res.json();
        const hasPin = row && Object.prototype.hasOwnProperty.call(row, 'pin');
        if (hasPin) {
          if (!row?.pin || String(row.pin) !== String(pin)) {
            alert('Invalid PIN');
            return;
          }
        }
      }
      // Persist session + active team
      try {
        localStorage.setItem('auth_token', 'authenticated');
        localStorage.setItem('ndr_user', member);
        localStorage.setItem('ndr_active_team_id', String(teamId));
        const teamName = teams.find(t => t.id === teamId)?.name || '';
        localStorage.setItem('ndr_active_team_name', teamName);
        localStorage.setItem('ndr_session', new Date().toISOString());
        // Reset session auto allocation flag so first dashboard load can distribute
        localStorage.removeItem('ndr_auto_alloc_done');
      } catch {}
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow ring-1 ring-slate-200 p-5">
        <h1 className="text-lg font-semibold">NDR Login</h1>
        <p className="text-sm text-slate-600">Select your team and user, then enter PIN</p>
        <label className="block mt-3 text-sm">Team
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={teamId ?? ''} onChange={e => setTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select a team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block mt-3 text-sm">User
          <select className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" value={member} onChange={e => setMember(e.target.value)} disabled={!teamId}>
            <option value="">Select a user…</option>
            {members.map(m => <option key={m.id} value={m.member}>{m.member}</option>)}
          </select>
        </label>
        <label className="block mt-3 text-sm">PIN
          <input className="mt-1 w-full ring-1 ring-slate-200 rounded-lg px-3 py-2" type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter PIN" />
        </label>
        <button className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400" onClick={login} disabled={loading || !teamId || !member || !pin}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
