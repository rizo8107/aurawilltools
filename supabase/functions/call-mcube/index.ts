// Supabase Edge Function: call-mcube
// Securely resolves agent exenumber and places an outbound call via Mcube.
// Secrets required (configure with `supabase secrets set`):
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_URL
// - MCUBE_AUTH

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const { teamId, member, custnumber } = await req.json();
    if (!member || !custnumber) {
      return new Response(JSON.stringify({ error: "Missing member or custnumber" }), { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const MCUBE_AUTH = Deno.env.get("MCUBE_AUTH");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !MCUBE_AUTH) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Resolve exenumber securely (RLS-bypass via service_role)
    const query = supabase.from("team_members").select("member, phone").limit(1000);
    const { data: scoped, error: scopedErr } = teamId
      ? await query.eq("team_id", teamId)
      : await query;

    if (scopedErr) {
      return new Response(JSON.stringify({ error: `team_members: ${scopedErr.message}` }), { status: 500 });
    }

    const want = String(member || "").trim().toLowerCase();
    let row = (scoped || []).find((r) => String(r.member || "").trim().toLowerCase() === want);

    if (!row) {
      const { data: allRows, error: allErr } = await supabase
        .from("team_members").select("member, phone").limit(2000);
      if (allErr) {
        return new Response(JSON.stringify({ error: `team_members(all): ${allErr.message}` }), { status: 500 });
      }
      row = (allRows || []).find((r) => String(r.member || "").trim().toLowerCase() === want);
    }

    const exenumber = (row?.phone ?? "").toString();
    if (!exenumber || exenumber.replace(/\D/g, "").length < 6) {
      return new Response(JSON.stringify({ error: "exenumber_not_configured" }), { status: 400 });
    }

    // 2) Place call via Mcube
    const mcubeRes = await fetch("https://api.mcube.com/Restmcube-api/outbound-calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MCUBE_AUTH,
      },
      body: JSON.stringify({ exenumber, custnumber, refurl: "1" }),
    });

    let payload: any = null;
    try { payload = await mcubeRes.json(); } catch {
      try { payload = await mcubeRes.text(); } catch { payload = null; }
    }

    if (!mcubeRes.ok) {
      return new Response(JSON.stringify({ error: "mcube_failed", details: payload }), { status: mcubeRes.status });
    }

    return new Response(JSON.stringify({ ok: true, mcube: payload }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: "server_error", message: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
