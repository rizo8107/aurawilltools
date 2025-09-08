import React from "react";
import TeamManager from "./TeamManager";

const SUPABASE_URL = (window as any).SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "https://app-supabase.9krcxo.easypanel.host/rest/v1";
const SUPABASE_HEADERS: Record<string, string> = {
  apikey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  Authorization:
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTAwMTIyMDAsImV4cCI6MTkwNzc3ODYwMH0.Q8SZkSAk3D8_Uwjmzoh7oYUzdKr8mUSRMxDekxDY4Rw",
  "Content-Type": "application/json",
};

export default function TeamsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Teams</div>
          <div className="text-sm text-slate-600">Create teams, add members with PINs, and set the active team</div>
        </div>
      </div>
      <TeamManager
        supabaseUrl={SUPABASE_URL}
        headers={SUPABASE_HEADERS}
        onClose={() => {}}
        onTeamSelected={() => {}}
        inline
      />
    </div>
  );
}
