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
}



interface RepeatCampaignProps {
  initialOrderNumber?: string;
  hideFeedback?: boolean;
}

// Caller selection removed; agent taken from localStorage('ndr_user') if present

export default function RepeatCampaign({ initialOrderNumber = '', hideFeedback = false }: RepeatCampaignProps) {
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
  
  // Caller selection removed
  
  // State for the feedback form
  // Reference to track if initial search has been performed
  const initialSearchDone = useRef(false);

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
  });
  
  const orderInputRef = useRef<HTMLInputElement>(null);
  
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
  
  // Load previous feedback from call_feedback for this order_number
  useEffect(() => {
    const loadPrev = async () => {
      const onum = (feedbackForm.orderId || orderId || '').trim();
      if (!onum) { setPrevFeedback(null); return; }
      try {
        const url = `https://app-supabase.9krcxo.easypanel.host/rest/v1/call_feedback?order_number=eq.${encodeURIComponent(onum)}&select=*&order=created_at.desc&limit=1`;
        const res = await fetch(url, {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs'
          }
        });
        if (!res.ok) { setPrevFeedback(null); return; }
        const arr = await res.json();
        setPrevFeedback(Array.isArray(arr) && arr.length ? arr[0] : null);
      } catch {
        setPrevFeedback(null);
      }
    };
    loadPrev();
  }, [feedbackForm.orderId, orderId]);
  
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
    
    try {
      const response = await fetch('https://auto-n8n.9krcxo.easypanel.host/webhook/20b5c30b-5815-41fc-863c-c1e96f32e083', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          Order: orderId,
          // agent field removed from payload; backend webhook can infer if needed
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      // Check if data is an array or a single object
      if (data) {
        // If it's a direct object (not in an array), use it directly
        if (!Array.isArray(data) && typeof data === 'object') {
          setCustomerData(data);
          
          // Pre-fill the orderId in the feedback form and set the initial call status
          setFeedbackForm(prev => ({ ...prev, orderId: orderId }));
          setSelectedCallStatus(data.call_status || '');
        } 
        // If it's an array with at least one item
        else if (Array.isArray(data) && data.length > 0) {
          setCustomerData(data[0]);
          
          // Pre-fill the orderId in the feedback form and set the initial call status
          setFeedbackForm(prev => ({ ...prev, orderId: orderId }));
          setSelectedCallStatus(data[0].call_status || '');
        } else {
          setError('No customer data found for this order ID');
        }
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
        throw new Error(`Error: ${response.status}`);
      }

      setSelectedCallStatus(newStatus);
      setMessage('Call status updated successfully!');
      setMessageType('success');

    } catch (err) {
      console.error('Error updating call status:', err);
      setMessage('Failed to update call status.');
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
        // Order history summary
        orders: customerData.orders.map(order => ({
          order_number: order.order_number,
          order_date: order.order_date,
          total_amount: order.total_amount,
          products: order.products
        })),
        // Feedback form data
        ...feedbackForm
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
        const supabaseUrl = 'https://app-supabase.9krcxo.easypanel.host/rest/v1/rpc/insert_call_feedback';
        const agentName = (typeof window !== 'undefined' ? (localStorage.getItem('ndr_user') || '') : '') || '';
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
        };
        await fetch(supabaseUrl, {
          method: 'POST',
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p: cf }),
        });
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
                  <div><span className="text-gray-500">Logged at:</span> {new Date(prevFeedback.created_at).toLocaleString()}</div>
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

                  return (
                    <div key={order.order_number} className="mb-8 relative">
                      {/* Timeline connector */}
                      {index < customerData.orders.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-blue-200"></div>
                      )}
                      
                      <div className="flex">
                        <div className="flex-shrink-0 bg-blue-500 rounded-full w-8 h-8 flex items-center justify-center z-10">
                          <span className="text-white text-sm font-medium">{index + 1}</span>
                        </div>
                        <div className="ml-4 flex-1">
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex flex-wrap justify-between mb-1">
                              <h3 className="text-lg font-medium">Order #{order.order_number}</h3>
                              <span className="text-gray-500 text-sm">{order.order_date}</span>
                            </div>
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
                <h2 className="text-xl font-semibold mb-4">Customer Feedback Form</h2>
                <form onSubmit={submitFeedback}>
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
                  </div>

                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center justify-center transition-colors"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    Submit Feedback
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
