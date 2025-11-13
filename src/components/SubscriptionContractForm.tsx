import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type Plan = {
  id: string;
  name: string;
  cadence_unit?: 'DAY' | 'WEEK' | 'MONTH';
  cadence_interval?: number;
  quantity?: number;
  product_variant_id?: string;
  selling_plan_id?: string;
  selling_plan_name?: string;
};

type ProductVariant = {
  variant_id: string;
  product_title: string;
  variant_title: string | null;
  price: number | string | null;
  currency_code?: string | null;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toCsvValue(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export default function SubscriptionContractForm() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);

  const [planId, setPlanId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [selectedVariantTitle, setSelectedVariantTitle] = useState<string>('');

  const [handle, setHandle] = useState('');
  const [upcomingBillingDate, setUpcomingBillingDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE');
  const [cadenceUnit, setCadenceUnit] = useState<'DAY' | 'WEEK' | 'MONTH'>('MONTH');
  const [cadenceCount, setCadenceCount] = useState<number>(1);
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const [deliveryPrice, setDeliveryPrice] = useState<string>('0');
  const [deliveryMethod, setDeliveryMethod] = useState<'SHIPPING' | 'LOCAL' | 'PICKUP'>('SHIPPING');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [countryCode, setCountryCode] = useState('IN');
  const [company, setCompany] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [localDeliveryPhone, setLocalDeliveryPhone] = useState('');
  const [localDeliveryInstructions, setLocalDeliveryInstructions] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');

  const [quantity, setQuantity] = useState<number>(1);
  const [currentPrice, setCurrentPrice] = useState<string>('');
  const [sellingPlanId, setSellingPlanId] = useState('');
  const [sellingPlanName, setSellingPlanName] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Array<{ id: string; title: string; variants: Array<{ id: string; title: string; price?: number; currency_code?: string }> }>>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: p } = await supabase
          .from('subscription_plans')
          .select('id,name,cadence_unit,cadence_interval,quantity,product_variant_id,selling_plan_id,selling_plan_name')
          .order('name', { ascending: true });
        setPlans(p || []);
      } catch {
        setPlans([]);
      }
      try {
        const { data: v } = await supabase
          .from('shopify_products_cache')
          .select('variant_id,product_title,variant_title,price,currency_code')
          .order('product_title', { ascending: true })
          .limit(2000);
        setVariants((v || []).filter((x) => x.variant_id));
      } catch {
        setVariants([]);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Debounced Shopify product search (via Edge Function)
  useEffect(() => {
    const q = productQuery.trim();
    if (!q) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setProductLoading(true);
        const res = await fetch(`/functions/v1/shopify_search_products?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (Array.isArray(data)) setProductResults(data);
      } catch {
        setProductResults([]);
      } finally {
        setProductLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  // Debounced Shopify customer search (via Edge Function)
  useEffect(() => {
    const q = customerQuery.trim();
    if (!q) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        setCustomerLoading(true);
        const res = await fetch(`/functions/v1/shopify_search_customers?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (Array.isArray(data)) setCustomerResults(data);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  useEffect(() => {
    const pl = plans.find((x) => x.id === planId);
    if (!pl) return;
    if (pl.cadence_unit) setCadenceUnit(pl.cadence_unit);
    if (pl.cadence_interval) setCadenceCount(pl.cadence_interval);
    if (pl.quantity) setQuantity(pl.quantity);
    if (pl.product_variant_id) setVariantId(pl.product_variant_id);
    if (pl.selling_plan_id) setSellingPlanId(pl.selling_plan_id);
    if (pl.selling_plan_name) setSellingPlanName(pl.selling_plan_name);
  }, [planId, plans]);

  useEffect(() => {
    const v = variants.find((x) => x.variant_id === variantId);
    if (v) {
      if (v.currency_code) setCurrencyCode((v.currency_code || 'USD') as string);
      if (v.price !== null && v.price !== undefined) setCurrentPrice(String(v.price));
      setSelectedVariantTitle(v.variant_title || '');
    }
  }, [variantId, variants]);

  useEffect(() => {
    if (!handle) {
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      setHandle(`contract-${stamp}`);
    }
    if (!upcomingBillingDate) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setUpcomingBillingDate(iso);
    }
  }, []);

  const header = useMemo(() => [
    'handle',
    'upcoming_billing_date',
    'customer_id',
    'currency_code',
    'status',
    'cadence_interval',
    'cadence_interval_count',
    'customer_payment_method_id',
    'delivery_price',
    'delivery_method_type',
    'delivery_address_first_name',
    'delivery_address_last_name',
    'delivery_address_address1',
    'delivery_address_address2',
    'delivery_address_city',
    'delivery_address_province_code',
    'delivery_address_country_code',
    'delivery_address_company',
    'delivery_address_zip',
    'delivery_address_phone',
    'delivery_local_delivery_phone',
    'delivery_local_delivery_instructions',
    'delivery_pickup_method_location_id',
    'line_variant_id',
    'line_quantity',
    'line_current_price',
    'line_selling_plan_id',
    'line_selling_plan_name',
  ], []);

  const row = useMemo(() => [
    handle,
    upcomingBillingDate ? new Date(upcomingBillingDate).toISOString() : '',
    customerId,
    currencyCode,
    status,
    cadenceUnit,
    cadenceCount,
    paymentMethodId,
    deliveryPrice,
    deliveryMethod === 'LOCAL' ? 'LOCAL' : deliveryMethod === 'PICKUP' ? 'PICKUP' : 'SHIPPING',
    firstName,
    lastName,
    address1,
    address2,
    city,
    provinceCode,
    countryCode,
    company,
    zip,
    phone,
    localDeliveryPhone,
    localDeliveryInstructions,
    pickupLocationId,
    variantId,
    quantity,
    currentPrice,
    sellingPlanId,
    sellingPlanName,
  ], [handle, upcomingBillingDate, customerId, currencyCode, status, cadenceUnit, cadenceCount, paymentMethodId, deliveryPrice, deliveryMethod, firstName, lastName, address1, address2, city, provinceCode, countryCode, company, zip, phone, localDeliveryPhone, localDeliveryInstructions, pickupLocationId, variantId, quantity, currentPrice, sellingPlanId, sellingPlanName]);

  const csvText = useMemo(() => {
    const headerLine = header.map(toCsvValue).join(',');
    const rowLine = row.map(toCsvValue).join(',');
    return headerLine + '\n' + rowLine + '\n';
  }, [header, row]);

  const downloadCsv = () => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${handle || 'subscription-contract'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createViaApi = async () => {
    try {
      setLoading(true);
      const payload = {
        handle,
        upcoming_billing_date: row[1],
        customer_id: customerId,
        currency_code: currencyCode,
        status,
        cadence_interval: cadenceUnit,
        cadence_interval_count: cadenceCount,
        customer_payment_method_id: paymentMethodId,
        delivery: {
          method_type: deliveryMethod,
          price: Number(deliveryPrice || '0') || 0,
          address: {
            first_name: firstName,
            last_name: lastName,
            address1,
            address2,
            city,
            province_code: provinceCode,
            country_code: countryCode,
            company,
            zip,
            phone,
          },
          local: {
            phone: localDeliveryPhone,
            instructions: localDeliveryInstructions,
          },
          pickup_location_id: pickupLocationId,
        },
        line: {
          variant_id: variantId,
          quantity,
          current_price: Number(currentPrice || '0') || 0,
          selling_plan_id: sellingPlanId,
          selling_plan_name: sellingPlanName,
        },
      };
      const res = await fetch('/functions/v1/create_subscription_contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create contract');
      alert('Subscription contract created successfully.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(message || 'Failed to create contract');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="bg-white border rounded-xl shadow p-3">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="text-lg font-semibold">Create Subscription Contract</div>
          {loading && <span className="text-xs text-gray-500">Loading…</span>}
        </div>

        {/* Shopify Customer Search */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Search customer (name / email / phone)</label>
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="Type to search…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
          </div>
          {customerResults.length > 0 && (
            <div className="md:col-span-3">
              <div className="max-h-56 overflow-auto border rounded">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 border-b hover:bg-gray-50"
                    onClick={() => {
                      setCustomerId(String(c.id));
                      setCustomerQuery(`${c.first_name || ''} ${c.last_name || ''} • ${c.email || ''} • ${c.phone || ''}`.trim());
                      const a = c.default_address || {};
                      setFirstName(c.first_name || '');
                      setLastName(c.last_name || '');
                      setAddress1(a.address1 || '');
                      setAddress2(a.address2 || '');
                      setCity(a.city || '');
                      setProvinceCode((a.province_code || '').toUpperCase());
                      setCountryCode((a.country_code || a.country_code_v2 || 'IN').toUpperCase());
                      setCompany(a.company || '');
                      setZip(a.zip || '');
                      setPhone(c.phone || a.phone || '');
                      setCustomerResults([]);
                    }}
                  >
                    <div className="text-sm font-medium">{c.first_name} {c.last_name} ({c.id})</div>
                    <div className="text-xs text-gray-600">{c.email || '—'} • {c.phone || '—'}</div>
                    {c.default_address && (
                      <div className="text-xs text-gray-500">
                        {c.default_address.address1 || ''} {c.default_address.city || ''} {c.default_address.zip || ''}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {customerLoading && <div className="text-xs text-gray-500 mt-1">Searching customers…</div>}
            </div>
          )}
        </div>

        {/* Shopify Product Search */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Search product</label>
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="Type product name to search…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
          </div>
          {productResults.length > 0 && (
            <div className="md:col-span-3">
              <div className="max-h-64 overflow-auto border rounded">
                {productResults.map((p) => (
                  <div key={p.id} className="border-b">
                    <div className="px-3 py-2 text-sm font-medium">{p.title} ({p.id})</div>
                    <div className="px-3 pb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {p.variants.map((v) => (
                        <button
                          key={v.id}
                          className="text-left px-2 py-2 border rounded hover:bg-gray-50"
                          onClick={() => {
                            setVariantId(String(v.id));
                            setSelectedVariantTitle(v.title || '');
                            if (v.price !== undefined) setCurrentPrice(String(v.price));
                            if (v.currency_code) setCurrencyCode(v.currency_code);
                            setProductResults([]);
                            setProductQuery(`${p.title} — ${v.title || ''}`.trim());
                          }}
                        >
                          <div className="text-sm">{v.title || 'Default variant'} ({String(v.id)})</div>
                          <div className="text-xs text-gray-600">{v.price ? `${v.price} ${v.currency_code || ''}` : '—'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {productLoading && <div className="text-xs text-gray-500 mt-1">Searching products…</div>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="col-span-1 md:col-span-3">
            <label className="text-xs text-gray-600">Plan</label>
            <select title="Plan" className="w-full border rounded px-2 py-1" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">Handle</label>
            <input className="w-full border rounded px-2 py-1" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Upcoming billing (UTC)</label>
            <input type="datetime-local" className="w-full border rounded px-2 py-1" value={upcomingBillingDate} onChange={(e) => setUpcomingBillingDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Customer ID</label>
            <input className="w-full border rounded px-2 py-1" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-gray-600">Currency</label>
            <input className="w-full border rounded px-2 py-1" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Status</label>
            <select title="Status" className="w-full border rounded px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'PAUSED')}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="text-xs text-gray-600">Cadence unit</label>
              <select title="Cadence unit" className="w-full border rounded px-2 py-1" value={cadenceUnit} onChange={(e) => setCadenceUnit(e.target.value as 'DAY' | 'WEEK' | 'MONTH')}>
                <option value="DAY">DAY</option>
                <option value="WEEK">WEEK</option>
                <option value="MONTH">MONTH</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Cadence count</label>
              <input type="number" min={1} className="w-full border rounded px-2 py-1" value={cadenceCount} onChange={(e) => setCadenceCount(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">Payment method ID</label>
            <input className="w-full border rounded px-2 py-1" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Delivery method</label>
            <select title="Delivery method" className="w-full border rounded px-2 py-1" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as 'SHIPPING' | 'LOCAL' | 'PICKUP')}>
              <option value="SHIPPING">SHIPPING</option>
              <option value="LOCAL">LOCAL</option>
              <option value="PICKUP">PICKUP</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Delivery price</label>
            <input className="w-full border rounded px-2 py-1" value={deliveryPrice} onChange={(e) => setDeliveryPrice(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-gray-600">First name</label>
            <input className="w-full border rounded px-2 py-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Last name</label>
            <input className="w-full border rounded px-2 py-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Address 1</label>
            <input className="w-full border rounded px-2 py-1" value={address1} onChange={(e) => setAddress1(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Address 2</label>
            <input className="w-full border rounded px-2 py-1" value={address2} onChange={(e) => setAddress2(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">City</label>
            <input className="w-full border rounded px-2 py-1" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">State/Province code</label>
            <input className="w-full border rounded px-2 py-1" value={provinceCode} onChange={(e) => setProvinceCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Country code</label>
            <input className="w-full border rounded px-2 py-1" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Company</label>
            <input className="w-full border rounded px-2 py-1" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">ZIP / PIN</label>
            <input className="w-full border rounded px-2 py-1" value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Phone</label>
            <input className="w-full border rounded px-2 py-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {deliveryMethod === 'LOCAL' && (
            <>
              <div>
                <label className="text-xs text-gray-600">Local delivery phone</label>
                <input className="w-full border rounded px-2 py-1" value={localDeliveryPhone} onChange={(e) => setLocalDeliveryPhone(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600">Local delivery instructions</label>
                <input className="w-full border rounded px-2 py-1" value={localDeliveryInstructions} onChange={(e) => setLocalDeliveryInstructions(e.target.value)} />
              </div>
            </>
          )}
          {deliveryMethod === 'PICKUP' && (
            <div className="md:col-span-3">
              <label className="text-xs text-gray-600">Pickup location ID</label>
              <input className="w-full border rounded px-2 py-1" value={pickupLocationId} onChange={(e) => setPickupLocationId(e.target.value)} />
            </div>
          )}

          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Product variant</label>
            <select title="Product variant" className="w-full border rounded px-2 py-1" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">Select variant…</option>
              {variants.map((v) => (
                <option key={v.variant_id} value={v.variant_id}>
                  {v.product_title} {v.variant_title ? `— ${v.variant_title}` : ''} ({v.variant_id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Quantity</label>
            <input type="number" min={1} className="w-full border rounded px-2 py-1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Current price</label>
            <input className="w-full border rounded px-2 py-1" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Selling plan ID</label>
            <input className="w-full border rounded px-2 py-1" value={sellingPlanId} onChange={(e) => setSellingPlanId(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Selling plan name</label>
            <input className="w-full border rounded px-2 py-1" value={sellingPlanName} onChange={(e) => setSellingPlanName(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={downloadCsv} className="px-3 py-2 rounded bg-blue-600 text-white">Download CSV</button>
          <button onClick={createViaApi} className="px-3 py-2 rounded bg-emerald-600 text-white" disabled={loading}>
            {loading ? 'Creating…' : 'Create via API'}
          </button>
        </div>

        <div className="mt-4">
          <label className="text-xs text-gray-600">Preview (CSV)</label>
          <textarea className="w-full border rounded p-2 text-xs h-40" readOnly value={csvText} />
        </div>
      </div>
    </div>
  );
}
