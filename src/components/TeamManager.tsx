import React, { useEffect, useState } from "react";

// Team Manager modal: CRUD teams and members using Supabase REST
// Assumes tables:
//   teams(id bigserial pk, name text not null, created_at timestamptz default now())
//   team_members(id bigserial pk, team_id bigint references teams(id) on delete cascade, member text not null, created_at timestamptz default now())
// Endpoints used: /teams, /team_members with the same SUPABASE headers as NdrDashboard

export type Team = { id: number; name: string };
export type TeamMember = { id: number; team_id: number; member: string; pin?: string };

interface Props {
  supabaseUrl: string;
  headers: Record<string, string>;
  onClose: () => void;
  onTeamSelected?: (team: Team | null) => void;
  inline?: boolean;
}

export default function TeamManager({ supabaseUrl, headers, onClose, onTeamSelected, inline }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [selected, setSelected] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberInput, setMemberInput] = useState("");
  const [memberPin, setMemberPin] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [editingPinValue, setEditingPinValue] = useState<string>("");

  async function loadTeams() {
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/teams?select=*&order=name.asc`, { headers });
      if (res.ok) {
        const arr = await res.json();
        setTeams(Array.isArray(arr) ? arr : []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers(teamId: number) {
    try {
      // Try to select pin; if column missing, fallback gracefully
      let res = await fetch(`${supabaseUrl}/team_members?team_id=eq.${teamId}&select=id,team_id,member,pin&order=member.asc`, { headers });
      if (!res.ok) {
        res = await fetch(`${supabaseUrl}/team_members?team_id=eq.${teamId}&select=id,team_id,member&order=member.asc`, { headers });
      }
      if (res.ok) {
        const arr = await res.json();
        setMembers(Array.isArray(arr) ? arr : []);
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    }
  }

  useEffect(() => { loadTeams(); }, []);
  useEffect(() => {
    if (selected?.id) loadMembers(selected.id);
    else setMembers([]);
  }, [selected?.id]);

  async function createTeam() {
    if (!teamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${supabaseUrl}/teams`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (res.ok) {
        const [row] = await res.json();
        setTeamName("");
        await loadTeams();
        if (row) setSelected(row);
      }
    } finally { setCreating(false); }
  }

  async function deleteTeam(team: Team) {
    if (!confirm(`Delete team "${team.name}"? This removes its members too.`)) return;
    await fetch(`${supabaseUrl}/teams?id=eq.${team.id}`, { method: 'DELETE', headers });
    setSelected(null);
    await loadTeams();
  }

  async function addMember() {
    const m = memberInput.trim();
    if (!m || !selected) return;
    setSavingMember(true);
    try {
      const res = await fetch(`${supabaseUrl}/team_members`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ team_id: selected.id, member: m, pin: memberPin || null })
      });
      if (res.ok) {
        setMemberInput("");
        setMemberPin("");
        await loadMembers(selected.id);
      }
    } finally { setSavingMember(false); }
  }

  async function removeMember(id: number) {
    await fetch(`${supabaseUrl}/team_members?id=eq.${id}`, { method: 'DELETE', headers });
    if (selected) await loadMembers(selected.id);
  }

  function chooseTeam(t: Team) {
    setSelected(t);
    if (onTeamSelected) onTeamSelected(t);
    try { localStorage.setItem('ndr_active_team_id', String(t.id)); localStorage.setItem('ndr_active_team_name', t.name); } catch {}
  }

  function clearSelection() {
    setSelected(null);
    if (onTeamSelected) onTeamSelected(null);
    try { localStorage.removeItem('ndr_active_team_id'); localStorage.removeItem('ndr_active_team_name'); } catch {}
  }

  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    inline ? (
      <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow ring-1 ring-slate-200 grid md:grid-cols-2">
        {children}
      </div>
    ) : (
      <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 grid md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    )
  );

  return (
    <Container>
        <div className="p-4 border-r border-slate-200">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Teams</div>
            {inline ? null : (
              <button className="text-sm px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white hover:bg-slate-50" onClick={onClose}>Close</button>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="flex-1 ring-1 ring-slate-200 rounded-lg px-3 py-2" placeholder="New team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            <button disabled={!teamName.trim() || creating} className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400" onClick={createTeam}>{creating ? 'Creating…' : 'Create'}</button>
          </div>
          <div className="mt-3 max-h-80 overflow-auto divide-y divide-slate-100">
            {loading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : teams.length === 0 ? (
              <div className="text-sm text-slate-500">No teams yet.</div>
            ) : teams.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2">
                <button className="text-left" onClick={() => chooseTeam(t)}>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">ID: {t.id}</div>
                </button>
                <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100" onClick={() => deleteTeam(t)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Members</div>
            {selected ? (
              <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white hover:bg-slate-50" onClick={clearSelection}>Clear</button>
            ) : null}
          </div>
          {!selected ? (
            <div className="mt-3 text-sm text-slate-500">Select a team to manage members.</div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                <input className="md:col-span-2 ring-1 ring-slate-200 rounded-lg px-3 py-2" placeholder="member email/handle" value={memberInput} onChange={(e) => setMemberInput(e.target.value)} />
                <input className="ring-1 ring-slate-200 rounded-lg px-3 py-2" placeholder="PIN (optional)" value={memberPin} onChange={(e) => setMemberPin(e.target.value)} />
                <button disabled={!memberInput.trim() || savingMember} className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-400" onClick={addMember}>{savingMember ? 'Adding…' : 'Add'}</button>
              </div>
              <div className="mt-3 max-h-80 overflow-auto divide-y divide-slate-100">
                {members.length === 0 ? (
                  <div className="text-sm text-slate-500">No members yet.</div>
                ) : members.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{m.member}</div>
                      <div className="text-xs text-slate-500">PIN: {m.pin ? '••••' : '—'}</div>
                    </div>
                    {editingPinId === m.id ? (
                      <div className="flex items-center gap-2">
                        <input className="ring-1 ring-slate-200 rounded-lg px-2 py-1 text-sm" placeholder="New PIN" value={editingPinValue} onChange={(e)=>setEditingPinValue(e.target.value)} />
                        <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-emerald-300 text-emerald-900 bg-emerald-50 hover:bg-emerald-100" onClick={async ()=>{
                          await fetch(`${supabaseUrl}/team_members?id=eq.${m.id}`, { method:'PATCH', headers, body: JSON.stringify({ pin: editingPinValue || null }) });
                          setEditingPinId(null); setEditingPinValue(""); if(selected) await loadMembers(selected.id);
                        }}>Save</button>
                        <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white" onClick={()=>{ setEditingPinId(null); setEditingPinValue(""); }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-slate-300 bg-white hover:bg-slate-50" onClick={()=>{ setEditingPinId(m.id); setEditingPinValue(""); }}>Set PIN</button>
                        <button className="text-xs px-2 py-1 rounded-lg ring-1 ring-rose-300 text-rose-900 bg-rose-50 hover:bg-rose-100" onClick={() => removeMember(m.id)}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
    </Container>
  );
}
