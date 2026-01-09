import React, { useState, useRef, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Clock, Calendar, Package, DollarSign, User, Phone, Mail, ArrowRight, MapPin } from 'lucide-react';

// Define interfaces for the response data
interface Product {
  order_number: number;
  order_date: string;
  total_amount: string;
  products: string;
  address?: string | null;
}

interface CustomerData {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address?: string | null;
  total_orders: number;
  first_order_date: string;
  last_order_date: string;
  duration_between_first_and_last_order: string;
  orders: Product[];
  call_status?: string; 
  // Optional address fields (best-effort based on webhook response)
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  area?: string | null;
}

interface FeedbackForm {
  firstTimeReason: string;
  heardFrom: string; // Where did you first hear/notice our Health Mix?
  reorderReason: string;
  likedFeatures: string; // What you like most
  usageRecipe: string;
  usageTime: string;
  perceivedDifference: string; // Changes noticed after using
  userProfile: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  age: string;
  wouldRecommend: 'Yes' | 'No' | '';
  generalFeedback: string;
  monthlyDelivery: 'Yes' | 'No' | 'Not now' | '';
  willGiveReview: 'Yes' | 'No' | '';
  sharedLink: 'Yes' | 'No' | '';
  // New flags
  sendReviewLink: boolean;
  sendCommunityLink: boolean;
  reviewReceived: 'Yes' | 'No' | '';
  usingInCoverOrContainer: string;
  orderId: string;
  newProductExpectation: string; // Expectations for new product benefits
  remark?: string; // Additional remark
  // Newly requested
  maritalStatus: string; // Single / Married / Other (text input as requested)
  profession: string; // Profession or type of work
  city: string; // City
  orderType: string; // Auto-filled at submit based on order count
}



interface RepeatCampaignProps {
  initialOrderNumber?: string;
  hideFeedback?: boolean;
  onCallStatusChange?: (email: string, newStatus: string) => void;
}

// Caller selection removed; agent taken from localStorage('ndr_user') if present

export default function RepeatCampaign({ initialOrderNumber = '', hideFeedback = false, onCallStatusChange }: RepeatCampaignProps) {
  const [orderId, setOrderId] = useState(initialOrderNumber || '');
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info' | ''>('');
  const [callStatus, setCallStatus] = useState('');
  const [callStatusType, setCallStatusType] = useState<'success' | 'error' | 'info' | ''>('');
  // Previous feedback fetched from call_feedback
  const [prevFeedback, setPrevFeedback] = useState<any | null>(null);
  const [selectedCallStatus, setSelectedCallStatus] = useState('');
  const [readOnlyFeedback, setReadOnlyFeedback] = useState(false);
  
  // Caller selection removed
  
  // State for the feedback form
  // Reference to track if initial search has been performed
  const initialSearchDone = useRef(false);

  // Helper to format timestamps safely
  const formatDateTime = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>({
    firstTimeReason: '',
    heardFrom: '',
    reorderReason: '',
    likedFeatures: '',
    usageRecipe: '',
    usageTime: '',
    perceivedDifference: '',
    userProfile: '',
    gender: '',
    age: '',
    wouldRecommend: '',
    generalFeedback: '',
    monthlyDelivery: '',
    willGiveReview: '',
    sharedLink: '',
    sendReviewLink: false,
    sendCommunityLink: false,
    reviewReceived: '',
    usingInCoverOrContainer: '',
    orderId: '',
    newProductExpectation: '',
    remark: '',
    maritalStatus: '',
    profession: '',
    city: '',
    orderType: '',
  });
  
  const orderInputRef = useRef<HTMLInputElement | null>(null);
  const prevFetchKeyRef = useRef<string>('');
  
  useEffect(() => {
    // Check if user is authenticated
    const authToken = localStorage.getItem('auth_token');
    if (authToken !== 'authenticated') {
      window.location.href = '/';
    }
  }, []);
  
  useEffect(() => {
    // Focus the order input field when the component mounts
    if (orderInputRef.current) {
      orderInputRef.current.focus();
    }
  }, []);
  
  // Caller selection removed

  // Helper: parse free-form address into parts
  const parseAddress = (addr?: string | null) => {
    const out: { area?: string | null; city?: string | null; state?: string | null; pincode?: string | null } = {};
    if (!addr) return out;
    const parts = String(addr).split(',').map(x => x.trim()).filter(Boolean);
    if (!parts.length) return out;
    const last = parts[parts.length - 1];
    const pin = last.match(/(\d{6})$/);
    if (pin) {
      out.pincode = pin[1];
      parts[parts.length - 1] = last.replace(/\d{6}$/, '').replace(/[\,\s]+$/, '').trim();
    }
    out.state = parts[parts.length - 1] || null;
    out.city = parts.length >= 2 ? parts[parts.length - 2] : null;
    out.area = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(', ') : null;
    return out;
  };

  useEffect(() => {
    // Auto search without blocking for caller selection
    if (initialOrderNumber && !initialSearchDone.current) {
      initialSearchDone.current = true;
      handleOrderSearch(null);
    }
  }, [initialOrderNumber, hideFeedback]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Load previous feedback from call_feedback - check current order first, then customer's other orders
  useEffect(() => {
    const loadPrev = async () => {
      const phone = (customerData?.customer_phone || '').trim();
      const onum = (feedbackForm.orderId || orderId || '').trim();
      if (!phone && !onum) { setPrevFeedback(null); setReadOnlyFeedback(false); return; }

      const key = `${phone || ''}|${onum || ''}`;
      if (prevFetchKeyRef.current === key) return;
      prevFetchKeyRef.current = key;

      try {
        // FIRST: Check if feedback exists for THIS specific order_number
        let prev = null;
        let isCurrentOrder = false;
        
        if (onum) {
          const urlByOrder = `https://app-supabase.9krcxo.easypanel.host/rest/v1/call_feedback?order_number=eq.${encodeURIComponent(onum)}&select=*&order=created_at.desc&limit=1`;
          const resByOrder = await fetch(urlByOrder, {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs'
            }
          });
          if (resByOrder.ok) {
            const arrByOrder = await resByOrder.json();
            if (Array.isArray(arrByOrder) && arrByOrder.length) {
              prev = arrByOrder[0];
              isCurrentOrder = true;
            }
          }
        }
        
        // SECOND: If no feedback for current order, check customer's other orders (for reference only)
        if (!prev && phone) {
          const urlByPhone = `https://app-supabase.9krcxo.easypanel.host/rest/v1/call_feedback?customer_phone=eq.${encodeURIComponent(phone)}&select=*&order=created_at.desc&limit=1`;
          const resByPhone = await fetch(urlByPhone, {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs'
            }
          });
          if (resByPhone.ok) {
            const arrByPhone = await resByPhone.json();
            if (Array.isArray(arrByPhone) && arrByPhone.length) {
              prev = arrByPhone[0];
              isCurrentOrder = false; // This is from a different order
            }
          }
        }
        
        setPrevFeedback(prev);
        if (prev) {
          // Check if the feedback record has actual data (not just empty placeholder)
          const hasActualData = !!(
            prev.heard_from || 
            prev.first_time_reason || 
            prev.reorder_reason || 
            prev.liked_features || 
            prev.usage_recipe || 
            prev.usage_time || 
            prev.family_user || 
            prev.gender || 
            prev.age || 
            prev.new_product_expectation ||
            prev.marital_status ||
            prev.profession_text ||
            prev.city_text
          );
          
          // Only mark as "already filled" (read-only) if:
          // 1. Feedback is for THIS order (not another order), AND
          // 2. The record has actual feedback data (not just empty placeholder)
          setReadOnlyFeedback(isCurrentOrder && hasActualData);
          // Prefill the form fields from previous feedback
          setFeedbackForm(prevState => ({
            ...prevState,
            firstTimeReason: prev.first_time_reason || prevState.firstTimeReason,
            heardFrom: prev.heard_from || prevState.heardFrom,
            reorderReason: prev.reorder_reason || prevState.reorderReason,
            likedFeatures: prev.liked_features || prevState.likedFeatures,
            usageRecipe: prev.usage_recipe || prevState.usageRecipe,
            usageTime: prev.usage_time || prevState.usageTime,
            perceivedDifference: prev.perceived_difference || prevState.perceivedDifference,
            userProfile: prev.family_user || prevState.userProfile,
            gender: (prev.gender || prev.gender_text || prevState.gender) as any,
            age: prev.age || prevState.age,
            wouldRecommend: (prev.would_recommend || prevState.wouldRecommend) as any,
            generalFeedback: prev.new_product_expectation || prevState.generalFeedback,
            monthlyDelivery: (prev.monthly_delivery || prevState.monthlyDelivery) as any,
            reviewReceived: (prev.review_received || prevState.reviewReceived) as any,
            maritalStatus: prev.marital_status || prevState.maritalStatus,
            profession: prev.profession_text || prevState.profession,
            city: prev.city_text || prevState.city,
            orderType: prev.order_type || prevState.orderType,
          }));
          // Adopt previous call status if present (default to 'Called')
          const prevStatus = prev.call_status || 'Called';
          setSelectedCallStatus(prevStatus);
          // Notify parent to sync the call status in the table (use email or phone)
          if (onCallStatusChange) {
            const identifier = customerData?.customer_email || customerData?.customer_phone || '';
            if (identifier) {
              onCallStatusChange(identifier, prevStatus);
            }
          }
        } else {
          setReadOnlyFeedback(false);
        }
      } catch {
        setPrevFeedback(null);
        setReadOnlyFeedback(false);
      }
    };
    loadPrev();
  }, [customerData?.customer_phone, feedbackForm.orderId, orderId, onCallStatusChange]);
  
  // Caller selection removed
  
  const handleOrderSearch = async (e: React.FormEvent | null) => {
    // Only prevent default if e is not null (i.e., if called from form submission)
    if (e) {
      e.preventDefault();
    }
    
    if (!orderId.trim()) {
      setError('Please enter an order ID');
      return;
    }
    
    setLoading(true);
    setError('');
    
    // helper: build CustomerData from repeat-json array or single object
    const buildFromRepeatJson = (rows: any[], needleOrder: string): CustomerData | null => {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const byOrder = rows.filter((r: any) => String(r.order_number || '').trim() === needleOrder.trim());
      const base = byOrder[0] || rows[0];
      if (!base) return null;
      const phone = String(base.phone || '').trim();
      const samePhone = rows.filter((r: any) => String(r.phone || '').trim() === phone);
      const toDate = (s: any) => new Date(String(s || ''));
      const dedup = new Map<string, { order_number: number; order_date: string; total_amount: string; products: string; address: string | null }>();
      for (const r of samePhone.filter((x:any)=>x && x.order_number)) {
        const key = String(r.order_number);
        const cur = dedup.get(key);
        const cand = {
          order_number: Number(String(r.order_number).replace(/[^0-9.]/g,'')) || 0,
          order_date: String(r.order_date || ''),
          total_amount: String(r.price ?? r.total_amount ?? ''),
          products: [String(r.product || ''), String(r.variant || '')].filter(Boolean).join(' - '),
          address: String(r.address || '') || null,
        };
        if (!cur || new Date(cand.order_date).getTime() >= new Date(cur.order_date).getTime()) {
          dedup.set(key, cand);
        }
      }
      const orders = Array.from(dedup.values()).sort((a,b) => toDate(a.order_date).getTime() - toDate(b.order_date).getTime());
      const total_orders = orders.length;
      const first_order_date = total_orders ? orders[0].order_date : '';
      const last_order_date = total_orders ? orders[total_orders-1].order_date : '';
      let duration_between_first_and_last_order = '';
      if (first_order_date && last_order_date) {
        const diff = Math.abs(new Date(last_order_date).getTime() - new Date(first_order_date).getTime());
        const days = Math.round(diff / (1000*60*60*24));
        duration_between_first_and_last_order = `${days} days`;
      }
      const addr = String(base.address || '') || null;
      const out: CustomerData = {
        customer_name: String(base.customer_name || ''),
        customer_phone: phone,
        customer_email: String(base.email || ''),
        customer_address: addr,
        total_orders,
        first_order_date,
        last_order_date,
        duration_between_first_and_last_order,
        orders,
        call_status: base.call_status || '',
        address: addr,
      };
      return out;
    };
    const buildFromRepeatObj = (obj: any): CustomerData | null => {
      if (!obj || typeof obj !== 'object') return null;
      const phone = String(obj.phone || '').trim();
      const addr = String(obj.address || '') || null;
      const orders = [
        {
          order_number: Number(String(obj.order_number || '').replace(/[^0-9.]/g,'')) || 0,
          order_date: String(obj.order_date || ''),
          total_amount: String(obj.price ?? obj.total_amount ?? ''),
          products: [String(obj.product || ''), String(obj.variant || '')].filter(Boolean).join(' - '),
          address: addr,
        }
      ];
      const out: CustomerData = {
        customer_name: String(obj.customer_name || ''),
        customer_phone: phone,
        customer_email: String(obj.email || ''),
        customer_address: addr,
        total_orders: 1,
        first_order_date: orders[0].order_date,
        last_order_date: orders[0].order_date,
        duration_between_first_and_last_order: '0 days',
        orders,
        call_status: obj.call_status || '',
        address: addr,
      };
      return out;
    };
    const safeParseJson = async (res: Response): Promise<any | null> => {
      try { return await res.json(); } catch {
        try { const t = await res.text(); return t ? JSON.parse(t) : null; } catch { return null; }
      }
    };

    try {
      // PRIMARY: UUID webhook (main)
      const primary = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/20b5c30b-5815-41fc-863c-c1e96f32e083', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Order: orderId }),
      });
      let primaryOk = false;
      if (primary.ok) {
        const data = await safeParseJson(primary);
        if (data && ((Array.isArray(data) && data.length) || (!Array.isArray(data) && typeof data === 'object'))) {
          let current: CustomerData | null = null;
          if (Array.isArray(data)) {
            current = data[0] as any;
            setCustomerData(current as any);
            setFeedbackForm(prev => ({ ...prev, orderId }));
            setSelectedCallStatus((data[0] as any).call_status || '');
          } else {
            current = data as any;
            setCustomerData(current as any);
            setFeedbackForm(prev => ({ ...prev, orderId }));
            setSelectedCallStatus((data as any).call_status || '');
          }
          primaryOk = true;
          // Enrich with repeat-json in the background to fetch full history
          try {
            const fbRes = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/repeat-json', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Order: orderId }),
            });
            if (fbRes.ok) {
              const fb = await safeParseJson(fbRes);
              let built: CustomerData | null = null;
              if (Array.isArray(fb)) built = buildFromRepeatJson(fb, orderId);
              else built = buildFromRepeatObj(fb);
              if (built && (
                !current ||
                !Array.isArray((current as any).orders) ||
                built.orders.length > ((current as any).orders?.length || 0)
              )) {
                setCustomerData(built);
                setSelectedCallStatus(built.call_status || '');
              }
            }
          } catch { /* non-blocking enrichment */ }
        }
      }
      if (primaryOk) return;
      // FALLBACK: repeat-json
      const fbRes = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/repeat-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Order: orderId }),
      });
      if (!fbRes.ok) throw new Error(`fallback ${fbRes.status}`);
      const fb = await safeParseJson(fbRes);
      let built: CustomerData | null = null;
      if (Array.isArray(fb)) built = buildFromRepeatJson(fb, orderId);
      else built = buildFromRepeatObj(fb);
      if (built) {
        setCustomerData(built);
        setFeedbackForm(prev => ({ ...prev, orderId }));
        setSelectedCallStatus(built.call_status || '');
      } else {
        setError('No customer data found for this order ID');
      }
    } catch (err) {
      setError('Failed to fetch customer data. Please try again.');
      console.error('Error fetching customer data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleFeedbackChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFeedbackForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!customerData?.customer_email) {
      setMessage('Customer email is not available.');
      setMessageType('error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://app-supabase.9krcxo.easypanel.host/rest/v1/rpc/update_call_status', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          p_email: customerData.customer_email,
          p_status: newStatus
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`RPC failed (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const updatedCount = Array.isArray(result) && result[0]?.updated_count !== undefined 
        ? result[0].updated_count 
        : 0;

      if (updatedCount === 0) {
        throw new Error('No records updated. Status may not be allowed by database constraint or customer not found.');
      }

      // Update local state immediately to reflect the change in UI
      setSelectedCallStatus(newStatus);
      setCustomerData(prev => prev ? { ...prev, call_status: newStatus } : null);
      setMessage(`Call status updated successfully! (${updatedCount} order${updatedCount > 1 ? 's' : ''} updated)`);
      
      // Notify parent of the change (use email or phone)
      if (onCallStatusChange) {
        const identifier = customerData?.customer_email || customerData?.customer_phone || '';
        if (identifier) {
          onCallStatusChange(identifier, newStatus);
        }
      }
      setMessageType('success');

    } catch (err) {
      console.error('Error updating call status:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage(`Failed to update call status: ${errMsg}`);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = async (phoneNumber: string) => {
    setCallStatus('Initiating call...');
    setCallStatusType('info');

    try {
      const custnumber = String(phoneNumber || '').replace(/\D/g, '');
      if (!custnumber || custnumber.length < 10) {
        setCallStatus('Invalid phone number.');
        setCallStatusType('error');
        return;
      }

      // Resolve exenumber from team_members via Supabase REST (client anon)
      const SUPABASE_URL = 'https://app-supabase.9krcxo.easypanel.host';
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs';
      const sbHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
      const member = (typeof window !== 'undefined' ? (localStorage.getItem('ndr_user') || '') : '').trim();
      const teamId = (typeof window !== 'undefined' ? (localStorage.getItem('ndr_active_team_id') || '') : '').trim();

      const tmUrl = `${SUPABASE_URL}/rest/v1/team_members?select=member,phone${teamId ? `&team_id=eq.${encodeURIComponent(teamId)}` : ''}`;
      const tmRes = await fetch(tmUrl, { headers: sbHeaders });
      if (!tmRes.ok) {
        const t = await tmRes.text();
        throw new Error(`team_members ${tmRes.status}: ${t}`);
      }
      let tmRows = (await tmRes.json()) as Array<{ member?: string; phone?: string | number }>;
      const want = member.toLowerCase();
      let row = tmRows.find(r => String(r.member || '').trim().toLowerCase() === want);
      if (!row) {
        const allRes = await fetch(`${SUPABASE_URL}/rest/v1/team_members?select=member,phone`, { headers: sbHeaders });
        if (allRes.ok) {
          tmRows = (await allRes.json()) as Array<{ member?: string; phone?: string | number }>;
          row = tmRows.find(r => String(r.member || '').trim().toLowerCase() === want);
        }
      }
      const exenumber = (row?.phone ?? '').toString();
      if (!exenumber || exenumber.replace(/\D/g, '').length < 6) {
        setCallStatus('Your agent phone (exenumber) is not configured in team_members.');
        setCallStatusType('error');
        return;
      }

      // Mcube outbound call
      const mcubeRes = await fetch('https://api.mcube.com/Restmcube-api/outbound-calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJUSEVfQ0xBSU0iLCJhdWQiOiJUSEVfQVVESUVOQ0UiLCJpYXQiOjE3NTY4ODkxNjcsImV4cF9kYXRhIjoxNzg4NDI1MTY3LCJkYXRhIjp7ImJpZCI6Ijc3MjQifX0.fPDu0Kt-AbnnLGsHJ_LdJfiP970viKCD3eRSDVCSzdo',
        },
        body: JSON.stringify({ exenumber, custnumber, refurl: '1' }),
      });

      let payload: unknown = null;
      try { payload = await mcubeRes.json(); } catch { /* ignore non-json */ }
      if (mcubeRes.ok) {
        setCallStatus('Call initiated successfully.');
        setCallStatusType('success');
      } else {
        const txt = (typeof payload === 'object' && payload && 'message' in payload) ? (payload as any).message : (await mcubeRes.text());
        setCallStatus(`Failed to initiate call: ${txt || mcubeRes.status}`);
        setCallStatusType('error');
      }
    } catch (err) {
      console.error('Mcube click-to-call error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCallStatus(`Failed to initiate call: ${errorMessage}`);
      setCallStatusType('error');
    }
  };
  
  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerData) {
      setMessage('No customer data available. Please search for a customer first.');
      setMessageType('error');
      return;
    }
    
    setLoading(true);
    setMessage('');
    setMessageType('');
    
    try {
      // Create a payload that includes both customer details and feedback data
      const agentHandle = typeof window !== 'undefined' ? (localStorage.getItem('ndr_user') || '').trim() : '';
      // Derive Order Type based on total orders
      const computedOrderType = customerData.total_orders <= 1 ? 'First Order' : `Repeat (${customerData.total_orders})`;
      const payload = {
        // Customer information
        customer_name: customerData.customer_name,
        customer_phone: customerData.customer_phone,
        customer_email: customerData.customer_email,
        total_orders: customerData.total_orders,
        first_order_date: customerData.first_order_date,
        last_order_date: customerData.last_order_date,
        duration_between_orders: customerData.duration_between_first_and_last_order,
        agent_name: agentHandle,
        // Newly requested fields (snake_case + non-conflicting keys)
        marital_status: feedbackForm.maritalStatus,
        profession_text: feedbackForm.profession,
        city_text: feedbackForm.city,
        order_type: computedOrderType,
        // Order history summary
        orders: customerData.orders.map(order => ({
          order_number: order.order_number,
          order_date: order.order_date,
          total_amount: order.total_amount,
          products: order.products
        })),
        // Feedback form data
        ...feedbackForm,
        orderType: computedOrderType,
      };
      
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/8cfda1b9-ceab-4f0e-b631-162dcaa4e3cb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      setMessage('Feedback submitted successfully!');
      setMessageType('success');

      // Also store a normalized analytics record in call_feedback (Option B)
      try {
        const sbBase = 'https://app-supabase.9krcxo.easypanel.host/rest/v1/rpc';
        const agentName = (typeof window !== 'undefined' ? (localStorage.getItem('ndr_user') || '') : '') || '';
        const computedOrderType = customerData.total_orders <= 1 ? 'First Order' : `Repeat (${customerData.total_orders})`;
        const cf = {
          order_id: null,
          order_number: feedbackForm.orderId || orderId || null,
          customer_phone: customerData.customer_phone || null,
          agent: agentName,
          call_status: selectedCallStatus || null,
          heard_from: feedbackForm.heardFrom,
          first_time_reason: feedbackForm.firstTimeReason,
          reorder_reason: feedbackForm.reorderReason,
          liked_features: feedbackForm.likedFeatures,
          usage_recipe: feedbackForm.usageRecipe,
          usage_time: feedbackForm.usageTime,
          family_user: feedbackForm.userProfile,
          gender: feedbackForm.gender,
          age: feedbackForm.age,
          new_product_expectation: feedbackForm.generalFeedback || '',
          remark: feedbackForm.remark || null,
          // Newly added analytics fields
          marital_status: feedbackForm.maritalStatus || null,
          profession_text: feedbackForm.profession || null,
          city_text: feedbackForm.city || null,
          order_type: computedOrderType,
        };
        // Try v2 first, then fallback to original
        let rpcRes = await fetch(`${sbBase}/insert_call_feedback_v2`, {
          method: 'POST',
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p: cf }),
        });
        if (!rpcRes.ok) {
          await fetch(`${sbBase}/insert_call_feedback`, {
            method: 'POST',
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p: cf }),
          });
        }
      } catch (err) {
        // Non-blocking. The primary submission succeeded; analytics insert failed.
        console.error('insert_call_feedback failed', err);
      }
      
      // Reset form fields except orderId
      setFeedbackForm({
        firstTimeReason: '',
        heardFrom: '',
        reorderReason: '',
        likedFeatures: '',
        usageRecipe: '',
        usageTime: '',
        perceivedDifference: '',
        userProfile: '',
        gender: '',
        age: '',
        wouldRecommend: '',
        generalFeedback: '',
        monthlyDelivery: '',
        willGiveReview: '',
        sharedLink: '',
        sendReviewLink: false,
        sendCommunityLink: false,
        reviewReceived: '',
        usingInCoverOrContainer: '',
        orderId: feedbackForm.orderId,
        newProductExpectation: '',
        remark: '',
        maritalStatus: '',
        profession: '',
        city: '',
        orderType: '',
      });
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setMessage('Failed to submit feedback. Please try again.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {messageType === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> :
           messageType === 'error' ? <AlertCircle className="w-5 h-5 mr-2" /> :
           <Clock className="w-5 h-5 mr-2" />}
          <span>{message}</span>
        </div>
      )}
      
      {/* Caller selection and display removed */}
      
      {/* Order Search Form */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Search Customer by Order ID</h2>
        <form onSubmit={handleOrderSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter Order ID"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              ref={orderInputRef}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center transition-colors"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Search
          </button>
        </form>
        {error && (
          <div className="mt-2 text-red-600 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1" />
            <span>{error}</span>
          </div>
        )}
      </div>
      
      {/* Customer Data and Feedback Form - Side by Side Layout */}
      {customerData && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column: Customer Info and Timeline */}
          <div className={hideFeedback ? "w-full" : "lg:w-1/2"}>
            {/* Previous Feedback Card */}
            {prevFeedback && (
              <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                <h3 className="text-lg font-semibold mb-2">Previous Feedback</h3>
                <div className="text-sm text-gray-700 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div><span className="text-gray-500">Logged at:</span> {formatDateTime(prevFeedback.created_at)}</div>
                  <div><span className="text-gray-500">Agent:</span> {prevFeedback.agent || '—'}</div>
                  <div><span className="text-gray-500">Call Status:</span> {prevFeedback.call_status || '—'}</div>
                  <div><span className="text-gray-500">Heard From:</span> {prevFeedback.heard_from || '—'}</div>
                  <div className="md:col-span-2"><span className="text-gray-500">First-time Reason:</span> {prevFeedback.first_time_reason || '—'}</div>
                  <div className="md:col-span-2"><span className="text-gray-500">Re-order Reason:</span> {prevFeedback.reorder_reason || '—'}</div>
                  <div className="md:col-span-2"><span className="text-gray-500">Liked / Changes:</span> {prevFeedback.liked_features || '—'}</div>
                  <div><span className="text-gray-500">Usage Recipe:</span> {prevFeedback.usage_recipe || '—'}</div>
                  <div><span className="text-gray-500">Usage Time:</span> {prevFeedback.usage_time || '—'}</div>
                  <div><span className="text-gray-500">Family User:</span> {prevFeedback.family_user || '—'}</div>
                  <div><span className="text-gray-500">Gender:</span> {prevFeedback.gender || '—'}</div>
                  <div><span className="text-gray-500">Age:</span> {prevFeedback.age || '—'}</div>
                  <div className="md:col-span-2"><span className="text-gray-500">New Product Expectation:</span> {prevFeedback.new_product_expectation || '—'}</div>
                </div>
              </div>
            )}
            {/* Customer Information Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Customer Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <User className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Customer Name</p>
                    <p className="font-medium">{customerData.customer_name}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Phone className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <button
                      onClick={() => handleCall(customerData.customer_phone)}
                      className="font-medium text-blue-600 hover:underline cursor-pointer flex items-center"
                      title="Click to call"
                    >
                      {customerData.customer_phone}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
                <div className="flex items-start md:col-span-2">
                  <Phone className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Call Status</p>
                    <select 
                      value={selectedCallStatus} 
                      onChange={(e) => handleStatusUpdate(e.target.value)}
                      className="font-medium p-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 transition"
                      disabled={loading}
                      aria-label="Update call status"
                    >
                      <option value="">Not Called</option>
                      <option value="Called">Called</option>
                      <option value="Call Waiting">Call Waiting</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="No Response">No Response</option>
                      <option value="Customer Busy">Customer Busy</option>  
                      <option value="Wrong Number">Wrong Number</option>
                      <option value="Call Later">Call Later</option>
                      <option value="Invalid Number">Invalid Number</option>
                      <option value="DNP1">DNP1</option>
                      <option value="DNP2">DNP2</option>
                      <option value="DNP3">DNP3</option>
                      <option value="DNP4">DNP4</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-start">
                  <Mail className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{customerData.customer_email}</p>
                  </div>
                </div>
                <div className="flex items-start md:col-span-2">
                  <MapPin className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium break-words">
                      {(() => {
                        const src = (customerData.customer_address || customerData.address || '').trim();
                        const parsed = parseAddress(src);
                        const city = customerData.city ?? parsed.city ?? '';
                        const state = customerData.state ?? parsed.state ?? '';
                        const pincode = customerData.pincode ?? parsed.pincode ?? '';
                        const area = customerData.area ?? parsed.area ?? '';
                        const parts = [src || area, city, state, pincode].filter(Boolean);
                        const out = parts.join(', ');
                        return out || '—';
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Package className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Total Orders</p>
                    <p className="font-medium">{customerData.total_orders}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">First Order Date</p>
                    <p className="font-medium">{customerData.first_order_date}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Calendar className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Last Order Date</p>
                    <p className="font-medium">{customerData.last_order_date}</p>
                  </div>
                </div>
                <div className="flex items-start md:col-span-2">
                  <Clock className="w-5 h-5 text-gray-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Duration Between Orders</p>
                    <p className="font-medium">{customerData.duration_between_first_and_last_order}</p>
                  </div>
                </div>
              </div>

              {/* Call Status Message */}
              {callStatus && (
                <div className={`mt-4 p-3 rounded-lg flex items-center ${
                  callStatusType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                  callStatusType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {callStatusType === 'success' ? <CheckCircle className="w-5 h-5 mr-2" /> :
                   callStatusType === 'error' ? <AlertCircle className="w-5 h-5 mr-2" /> :
                   <Clock className="w-5 h-5 mr-2" />}
                  <span>{callStatus}</span>
                </div>
              )}
            </div>
            
            {/* Order Timeline */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Order History</h2>
              <div className="relative">
                {customerData.orders.map((order, index) => {
                  let daysGapText = '';
                  if (index > 0) {
                    const currentOrderDate = new Date(order.order_date);
                    const previousOrderDate = new Date(customerData.orders[index - 1].order_date);
                    const diffInMs = currentOrderDate.getTime() - previousOrderDate.getTime();
                    const daysGap = Math.round(diffInMs / (1000 * 60 * 60 * 24));
                    daysGapText = `${daysGap} days since last order`;
                  }
                  const isFilled = !!(prevFeedback && String(prevFeedback.order_number || '') === String(order.order_number));

                  return (
                    <div key={order.order_number} className="mb-8 relative">
                      {/* Timeline connector */}
                      {index < customerData.orders.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-blue-200"></div>
                      )}
                      
                      <div className="flex">
                        <div className={`flex-shrink-0 rounded-full w-8 h-8 flex items-center justify-center z-10 ${isFilled ? 'bg-emerald-600' : 'bg-blue-500'}`}>
                          <span className="text-white text-sm font-medium">{index + 1}</span>
                        </div>
                        <div className="ml-4 flex-1">
                          <div className={`rounded-lg p-4 border ${isFilled ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex flex-wrap justify-between mb-1">
                              <h3 className="text-lg font-medium">Order #{order.order_number}</h3>
                              <span className="text-gray-500 text-sm">{order.order_date}</span>
                            </div>
                            {isFilled && (
                              <div className="text-xs text-emerald-700 mb-2">Feedback filled on {formatDateTime(prevFeedback?.created_at)}</div>
                            )}
                            {daysGapText && (
                              <p className="text-xs text-blue-600 mb-2 text-right">{daysGapText}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                              <div className="flex items-center">
                                <DollarSign className="w-4 h-4 text-gray-500 mr-1" />
                                <span className="text-gray-700">{order.total_amount}</span>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Products:</h4>
                              <p className="text-gray-600">{order.products}</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Address:</h4>
                              <p className="text-gray-600 break-words">{order.address || '—'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Right Column: Feedback Form */}
          {!hideFeedback && (
            <div className="lg:w-1/2">
              <div className="bg-white rounded-lg shadow-md p-6 h-full">
                <h2 className="text-xl font-semibold mb-2">Customer Feedback Form</h2>
                {readOnlyFeedback && (
                  <div className="mb-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
                    Feedback already submitted on <strong>{formatDateTime(prevFeedback?.created_at)}</strong>
                    {prevFeedback?.order_number ? (<span> for Order <strong>#{String(prevFeedback.order_number)}</strong></span>) : null}.
                    The form below is view-only to avoid duplicates.
                  </div>
                )}
                <form onSubmit={submitFeedback}>
                  <fieldset disabled={readOnlyFeedback}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Where did you first hear about or notice our Health Mix?
                      </label>
                      <input
                        type="text"
                        name="heardFrom"
                        value={feedbackForm.heardFrom}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Where did you first hear the Health Mix"
                        title="Where did you first hear/notice our Health Mix"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        May I know what made you purchase the Health Mix for the first time?
                      </label>
                      <input
                        type="text"
                        name="firstTimeReason"
                        value={feedbackForm.firstTimeReason}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="First time purchase reason"
                        title="Reason for first purchase"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        What made you order it again?
                      </label>
                      <input
                        type="text"
                        name="reorderReason"
                        value={feedbackForm.reorderReason}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Reason for reordering"
                        title="Reason for ordering again"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                       Have you noticed any changes after using it? What do you like most about the mix?
                      </label>
                      <input
                        type="text"
                        name="likedFeatures"
                        value={feedbackForm.likedFeatures}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Liked features"
                        title="What you liked about the health mix"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        How are you using the Health Mix? (Any specific recipe or method)
                      </label>
                      <input
                        type="text"
                        name="usageRecipe"
                        value={feedbackForm.usageRecipe}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Usage recipe"
                        title="How you used the health mix"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        At what time of the day do you usually use it?
                      </label>
                      <input
                        type="text"
                        name="usageTime"
                        value={feedbackForm.usageTime}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Time of usage"
                        title="When you used the health mix"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Who in your family is using this Health Mix?
                      </label>
                      <input
                        type="text"
                        name="userProfile"
                        value={feedbackForm.userProfile}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Family user"
                        title="Who in family uses the health mix"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Gender (for records)
                      </label>
                      <select
                        name="gender"
                        value={feedbackForm.gender}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        aria-label="Gender"
                        title="Gender"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Marital Status */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Marital status
                      </label>
                      <input
                        type="text"
                        name="maritalStatus"
                        value={feedbackForm.maritalStatus}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        placeholder="Single / Married / Other"
                        aria-label="Marital status"
                        title="Marital status"
                      />
                    </div>

                    {/* Profession / Work */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        What is your profession or type of work?
                      </label>
                      <input
                        type="text"
                        name="profession"
                        value={feedbackForm.profession}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        placeholder="Profession / Type of work"
                        aria-label="Profession or type of work"
                        title="Profession or type of work"
                      />
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={feedbackForm.city}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        placeholder="City"
                        aria-label="City"
                        title="City"
                      />
                    </div>

                    {/* Order Type (auto) */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Order type (auto)
                      </label>
                      <input
                        type="text"
                        value={(customerData?.total_orders ?? 0) <= 1 ? 'First Order' : `Repeat (${customerData?.total_orders ?? 0})`}
                        readOnly
                        className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50"
                        aria-label="Order type"
                        title="Order type"
                      />
                    </div>

                    {/* Monthly Subscription */}
                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Monthly Subscription
                      </label>
                      <select
                        name="monthlyDelivery"
                        value={feedbackForm.monthlyDelivery}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        aria-label="Monthly subscription"
                        title="Monthly subscription preference"
                      >
                        <option value="">Select an option</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                        <option value="Not now">Not now</option>
                      </select>
                    </div>

                    {/* Send links checkboxes */}
                    <div className="flex items-start gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={feedbackForm.sendReviewLink}
                          onChange={(e) => setFeedbackForm(prev => ({ ...prev, sendReviewLink: e.target.checked }))}
                          aria-label="Send review link"
                        />
                        <span className="text-sm text-gray-700">Send review link</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={feedbackForm.sendCommunityLink}
                          onChange={(e) => setFeedbackForm(prev => ({ ...prev, sendCommunityLink: e.target.checked }))}
                          aria-label="Send community link"
                        />
                        <span className="text-sm text-gray-700">Send community link</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-gray-700 text-sm font-medium mb-1">
                        Age (for records)
                      </label>
                      <input
                        type="text"
                        name="age"
                        value={feedbackForm.age}
                        onChange={handleFeedbackChange}
                        className="w-full p-2 border border-gray-300 rounded-lg"
                        required
                        aria-label="Age"
                        title="Users age"
                      />
                    </div>

                    <div className="md:col-span-2">
                    <label className="block text-gray-700 text-sm font-medium mb-1">
                      Expectation for new product: If we launch a new product, what health improvements or benefits would you like to see?
                    </label>
                    <textarea
                      name="newProductExpectation"
                      value={feedbackForm.newProductExpectation}
                      onChange={handleFeedbackChange}
                      className="w-full p-2 border border-gray-300 rounded-lg min-h-[80px]"
                      required
                      aria-label="Expectation for new product"
                      title="What benefits you expect from future products"
                    />
                  </div>

                  {/* Remark */}
                  <div className="md:col-span-2">
                    <label className="block text-gray-700 text-sm font-medium mb-1">
                      Remark
                    </label>
                    <textarea
                      name="remark"
                      value={feedbackForm.remark || ''}
                      onChange={handleFeedbackChange}
                      className="w-full p-2 border border-gray-300 rounded-lg min-h-[60px]"
                      placeholder="Any additional note"
                      aria-label="Remark"
                      title="Additional remark"
                    />
                  </div>
                  </div>
                  </fieldset>

                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 text-white px-6 py-2 rounded-lg flex items-center justify-center transition-colors"
                    disabled={loading || readOnlyFeedback}
                    title={readOnlyFeedback ? 'Feedback already submitted for this customer' : 'Submit feedback'}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    {readOnlyFeedback ? 'Already submitted' : 'Submit Feedback'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
