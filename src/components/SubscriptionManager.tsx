import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { RefreshCcw, Plus, Play } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  cadence_interval: number;
  cadence_unit: 'day' | 'week' | 'month';
  product_variant_id: string;
  product_title: string | null;
  quantity: number;
  customer_type: 'customer' | 'retail';
  active: boolean;
  created_at: string;
};

type Subscriber = {
  id: string;
  plan_id: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  address: Record<string, unknown> | null;
  shopify_customer_id: string | null;
  notes: string | null;
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children?: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`px-3 py-2 text-sm ${active ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-gray-50'} border`}>{children}</button>
);

export default function SubscriptionManager() {
  const [tab, setTab] = useState<'plans' | 'subscribers' | 'runs' | 'settings'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pName, setPName] = useState('');
  const [pInterval, setPInterval] = useState<number>(30);
  const [pUnit, setPUnit] = useState<'day' | 'week' | 'month'>('day');
  const [pVariantId, setPVariantId] = useState('');
  const [pProductTitle, setPProductTitle] = useState('');
  const [pQty, setPQty] = useState<number>(1);
  const [pType, setPType] = useState<'customer' | 'retail'>('customer');
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [sPlanId, setSPlanId] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sName, setSName] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState('');

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase.from('subscription_plans').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setPlans(data || []);
    } catch (e) {
      console.error('loadPlans', e);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const { data, error } = await supabase.from('subscription_subscribers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSubs(data || []);
    } catch (e) {
      console.error('loadSubs', e);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
    void loadSubs();
  }, [loadPlans, loadSubs]);

  const createPlan = useCallback(async () => {
    if (!pName.trim() || !pVariantId.trim()) return;
    const payload = {
      name: pName.trim(),
      cadence_interval: Number(pInterval) || 30,
      cadence_unit: pUnit,
      product_variant_id: pVariantId.trim(),
      product_title: pProductTitle.trim() || null,
      quantity: Number(pQty) || 1,
      customer_type: pType,
      active: true,
    };
    const { error } = await supabase.from('subscription_plans').insert(payload);
    if (!error) {
      setPName('');
      setPVariantId('');
      setPProductTitle('');
      setPQty(1);
      await loadPlans();
    }
  }, [pName, pInterval, pUnit, pVariantId, pProductTitle, pQty, pType, loadPlans]);

  const safeJson = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const addSubscriber = useCallback(async () => {
    if (!sPlanId) return;
    const payload = {
      plan_id: sPlanId,
      customer_email: sEmail || null,
      customer_phone: sPhone || null,
      customer_name: sName || null,
      address: sAddress.trim() ? safeJson(sAddress) : null,
      active: true,
      next_run_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('subscription_subscribers').insert(payload);
    if (!error) {
      setSEmail('');
      setSPhone('');
      setSName('');
      setSAddress('');
      await loadSubs();
    }
  }, [sPlanId, sEmail, sPhone, sName, sAddress, loadSubs]);

  const testFetchProducts = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('shopify-products');
    setRunLog(error ? `Error: ${error.message}` : JSON.stringify(data, null, 2).slice(0, 4000));
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setRunLog('Starting...');
    try {
      const { data, error } = await supabase.functions.invoke('subscription_runner', { body: { runNow: true } });
      if (error) setRunLog(`Error: ${error.message}`);
      else setRunLog(JSON.stringify(data, null, 2));
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TabButton active={tab === 'plans'} onClick={() => setTab('plans')}>Plans</TabButton>
        <TabButton active={tab === 'subscribers'} onClick={() => setTab('subscribers')}>Subscribers</TabButton>
        <TabButton active={tab === 'runs'} onClick={() => setTab('runs')}>Runs</TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>Settings</TabButton>
      </div>

      {tab === 'plans' && (
        <div className="bg-white rounded-xl border shadow p-3 space-y-3">
          <div className="text-sm font-medium mb-1">Create Plan</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="border rounded px-2 py-1" placeholder="Plan name" value={pName} onChange={(e) => setPName(e.target.value)} />
            <div className="flex gap-2">
              <input className="border rounded px-2 py-1 w-20" placeholder="Every" type="number" value={pInterval} onChange={(e) => setPInterval(Number(e.target.value))} />
              <select title="Cadence unit" className="border rounded px-2 py-1" value={pUnit} onChange={(e) => setPUnit(e.target.value as 'day' | 'week' | 'month')}>
                <option value="day">day(s)</option>
                <option value="week">week(s)</option>
                <option value="month">month(s)</option>
              </select>
            </div>
            <input className="border rounded px-2 py-1" placeholder="Shopify variant id" value={pVariantId} onChange={(e) => setPVariantId(e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder="Product title (optional)" value={pProductTitle} onChange={(e) => setPProductTitle(e.target.value)} />
            <input className="border rounded px-2 py-1 w-24" type="number" placeholder="Qty" value={pQty} onChange={(e) => setPQty(Number(e.target.value) || 1)} />
            <select title="Customer type" className="border rounded px-2 py-1" value={pType} onChange={(e) => setPType(e.target.value as 'customer' | 'retail')}>
              <option value="customer">Customer</option>
              <option value="retail">Retail Shop</option>
            </select>
            <button className="px-3 py-1 border rounded bg-indigo-600 text-white inline-flex items-center gap-1" onClick={createPlan}><Plus className="w-4 h-4" />Create</button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-medium">Plans {loadingPlans && <span className="text-xs text-gray-500 ml-1">Loading…</span>}</div>
            <button className="text-sm px-2 py-1 border rounded inline-flex items-center gap-1" onClick={loadPlans}><RefreshCcw className="w-4 h-4" />Reload</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Cadence</th>
                  <th className="text-left px-3 py-2">Variant</th>
                  <th className="text-left px-3 py-2">Qty</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2">Every {p.cadence_interval} {p.cadence_unit}(s)</td>
                    <td className="px-3 py-2">{p.product_title || p.product_variant_id}</td>
                    <td className="px-3 py-2">{p.quantity}</td>
                    <td className="px-3 py-2">{p.customer_type}</td>
                    <td className="px-3 py-2">{p.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {plans.length === 0 && (<tr><td className="px-3 py-3" colSpan={6}>No plans</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'subscribers' && (
        <div className="bg-white rounded-xl border shadow p-3 space-y-3">
          <div className="text-sm font-medium mb-1">Add Subscriber</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select title="Plan" className="border rounded px-2 py-1" value={sPlanId} onChange={(e) => setSPlanId(e.target.value)}>
              <option value="">Select plan…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="border rounded px-2 py-1" placeholder="Email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder="Phone" value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder="Name" value={sName} onChange={(e) => setSName(e.target.value)} />
            <input className="border rounded px-2 py-1" placeholder='Address JSON ({"address1":"..","city":".."})' value={sAddress} onChange={(e) => setSAddress(e.target.value)} />
            <button className="px-3 py-1 border rounded bg-indigo-600 text-white inline-flex items-center gap-1" onClick={addSubscriber}><Plus className="w-4 h-4" />Add</button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-medium">Subscribers {loadingSubs && <span className="text-xs text-gray-500 ml-1">Loading…</span>}</div>
            <button className="text-sm px-2 py-1 border rounded inline-flex items-center gap-1" onClick={loadSubs}><RefreshCcw className="w-4 h-4" />Reload</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Next Run</th>
                  <th className="text-left px-3 py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const plan = plans.find((p) => p.id === s.plan_id);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{plan?.name || s.plan_id}</td>
                      <td className="px-3 py-2">{s.customer_name || '—'}</td>
                      <td className="px-3 py-2">{s.customer_email || '—'}</td>
                      <td className="px-3 py-2">{s.customer_phone || '—'}</td>
                      <td className="px-3 py-2">{s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2">{s.active ? 'Yes' : 'No'}</td>
                    </tr>
                  );
                })}
                {subs.length === 0 && (<tr><td className="px-3 py-3" colSpan={6}>No subscribers</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <div className="bg-white rounded-xl border shadow p-3 space-y-3">
          <div className="flex gap-2 items-center">
            <button className="px-3 py-1 border rounded inline-flex items-center gap-1" onClick={testFetchProducts}><RefreshCcw className="w-4 h-4" />Test: Fetch Shopify products</button>
            <button className="px-3 py-1 border rounded bg-emerald-600 text-white inline-flex items-center gap-1" onClick={runNow} disabled={running}><Play className="w-4 h-4" />{running ? 'Running…' : 'Run now'}</button>
          </div>
          <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap max-h-[70vh] overflow-auto">{runLog || 'Logs will appear here…'}</pre>
        </div>
      )}

      {tab === 'settings' && (
        <div className="bg-white rounded-xl border shadow p-3 space-y-3 text-sm">
          <div>Shopify credentials are read from Supabase function secrets. I can add a small helper to store/update them if you prefer; otherwise set via CLI or dashboard.</div>
          <div className="text-gray-600">Use the Runs tab to test connectivity now.</div>
        </div>
      )}
    </div>
  );
}
