import { useState, useEffect } from 'react';
import OrderForm from './components/OrderForm';
import PrintSlip from './components/PrintSlip';
import N8nPrintSlip from './components/N8nPrintSlip';
import UpdateTracking from './components/UpdateTracking';
import CreateManifest from './components/CreateManifest';
import RepeatCampaign from './components/RepeatCampaign';
import RepeatOrdersTable from './components/RepeatOrdersTable';
import RepeatDashboard from './components/RepeatDashboard';
import OrderList from './components/OrderList';
import GstInvoiceGenerator from './components/GstInvoice';
import Auth from './components/Auth';
import NdrDashboard from './components/NdrDashboard';
import TeamsPage from './components/TeamsPage';
import NdrLogin from './components/NdrLogin';
import NdrAllocationPage from './components/NdrAllocationPage';
import TeamAnalyticsPage from './components/TeamAnalyticsPage';
import AgentAnalyticsPage from './components/AgentAnalyticsPage';
import { Package, Printer, Truck, FileText, Users, LogOut, FileSpreadsheet, RefreshCw } from 'lucide-react';
import ManualOrdersDashboard from './components/ManualOrdersDashboard';
import SegmentationPage from './components/SegmentationPage';
import SubscriptionContractForm from './components/SubscriptionContractForm';

type TabType = 'order' | 'printslip' | 'n8n_printslip' | 'tracking' | 'manifest' | 'campaign' | 'repeatorders' | 'repeat_dashboard' | 'orderhistory' | 'gstinvoice' | 'ndr' | 'teams' | 'allocation' | 'team_analytics' | 'agent_analytics' | 'segmentation' | 'manual_orders' | 'subscription_contract';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('order');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [ndrSessionKey, setNdrSessionKey] = useState<number>(0);
  const [repeatInitialOrder, setRepeatInitialOrder] = useState<string>("");

  // Check for authentication and preloaded repeat order on mount
  useEffect(() => {
    const authToken = localStorage.getItem('auth_token');
    if (authToken === 'authenticated') {
      setIsAuthenticated(true);
    }
    const cachedOrder = localStorage.getItem('repeat_order_number');
    if (cachedOrder) {
      setRepeatInitialOrder(cachedOrder);
    }
  }, []);

  // Listen for global request to open NDR order drawer
  useEffect(() => {
    function onOpenNdr(ev: Event) {
      try {
        // Ensure NDR dashboard is visible so its listener can open the drawer
        setActiveTab('ndr');
      } catch {
        // ignore
      }
    }
    window.addEventListener('open-ndr-order', onOpenNdr as EventListener);
    return () => window.removeEventListener('open-ndr-order', onOpenNdr as EventListener);
  }, []);

  // Listen for order open events from NDR Dashboard
  useEffect(() => {
    function onOpenRepeat(ev: Event) {
      try {
        const e = ev as CustomEvent<{ orderId?: string }>; 
        const id = e.detail?.orderId || localStorage.getItem('repeat_order_number') || '';
        setRepeatInitialOrder(id || '');
        setActiveTab('campaign');
      } catch {
        // ignore
      }
    }
    window.addEventListener('open-repeat-campaign', onOpenRepeat as EventListener);
    return () => window.removeEventListener('open-repeat-campaign', onOpenRepeat as EventListener);
  }, []);

  const navigationItems = [
    { id: 'order', label: 'Order Form', icon: <Package size={20} /> },
    { id: 'printslip', label: 'Print Slip', icon: <Printer size={20} /> },
    { id: 'n8n_printslip', label: 'Proffessional ', icon: <Printer size={20} /> },
    { id: 'tracking', label: 'Update Tracking', icon: <Truck size={20} /> },
    { id: 'manifest', label: 'Create Manifest', icon: <FileText size={20} /> },
    { id: 'campaign', label: 'Repeat Campaign', icon: <Users size={20} /> },
    { id: 'repeat_dashboard', label: 'Repeat Dashboard', icon: <Users size={20} /> },
    { id: 'ndr', label: 'NDR Dashboard', icon: <Truck size={20} /> },
    { id: 'teams', label: 'Teams', icon: <Users size={20} /> },
    { id: 'allocation', label: 'Allocation', icon: <Users size={20} /> },
    { id: 'team_analytics', label: 'Team Analytics', icon: <Users size={20} /> },
    { id: 'agent_analytics', label: 'Agent Analytics', icon: <Users size={20} /> },
    { id: 'segmentation', label: 'Segmentation', icon: <FileText size={20} /> },
    { id: 'gstinvoice', label: 'GST Invoice', icon: <FileSpreadsheet size={20} /> },
    { id: 'manual_orders', label: 'Manual Orders', icon: <FileText size={20} /> },
    { id: 'subscription_contract', label: 'Subscription', icon: <FileText size={20} /> },
  ];

  const pageDescriptions: Record<TabType, string> = {
    order: 'Create a new order by filling out the form below',
    printslip: 'Generate and print courier slips',
    n8n_printslip: 'Generate and print courier slips from n8n JSON output',
    tracking: 'Update tracking information for orders',
    manifest: 'Create and manage shipping manifests',
    campaign: 'Manage repeat customer campaigns and feedback',
    repeatorders: 'View and manage customers with repeat orders',
    
    repeat_dashboard: 'Assigned repeat customers for the logged-in agent',
    orderhistory: 'View, filter, and print past orders',
    gstinvoice: 'Generate GST invoices for orders',
    ndr: 'Monitor & resolve non-delivery shipments',
    teams: 'Create teams, add members, and set the active team for lead allocation',
    allocation: 'Define NDR allocation rules (percentage split, status filters) for the active team',
    team_analytics: 'Visualize team assignments, status split, and activity',
    agent_analytics: 'Agent-centric analytics powered by NocoDB (calls, emails, missed)',
    segmentation: 'Group and export orders by State/City/Pincode/Area',
    manual_orders: 'Create manual orders, update status, and record agent notes with full audit trail',
    subscription_contract: 'Create a Shopify subscription contract from plan + product + pricing',
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    // Clear NDR session keys so PIN/login appears next time
    localStorage.removeItem('ndr_user');
    localStorage.removeItem('ndr_active_team_id');
    localStorage.removeItem('ndr_active_team_name');
    localStorage.removeItem('ndr_session');
    localStorage.removeItem('ndr_auto_alloc_done');
    setIsAuthenticated(false);
  };

  // If not authenticated, show Auth component
  if (!isAuthenticated) {
    return <Auth onAuthenticated={() => setIsAuthenticated(true)} />;
  }
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white p-6 flex flex-col">
        <h1 className="text-3xl font-bold mb-8 text-center">
          Order Form
        </h1>
        <nav className="flex-grow">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.id} className="mb-2">
                <button
                  onClick={() => setActiveTab(item.id as TabType)}
                  className={`w-full flex items-center py-3 px-4 rounded-lg transition-colors duration-200 ${                    activeTab === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="ml-3 font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <button
          onClick={handleLogout}
          className="w-full flex items-center py-3 px-4 rounded-lg transition-colors duration-200 text-red-300 hover:bg-red-700 hover:text-white mt-6"
        >
          <LogOut size={20} />
          <span className="ml-3 font-medium">Logout</span>
        </button>
        <div className="mt-auto text-center text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} AuraWill</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm p-3 md:p-4">
          <h2 className="text-2xl font-semibold text-gray-800">{navigationItems.find(item => item.id === activeTab)?.label}</h2>
          <p className="text-gray-600 mt-1">{pageDescriptions[activeTab]}</p>
        </header>

        <main className={`flex-grow p-0 md:p-2 overflow-y-auto bg-gray-50 ${ 
          activeTab === 'order' ? 'flex justify-center items-start' : '' 
        }`}>
          <div className={`w-full ${ 
            activeTab === 'order' ? 'max-w-12xl' : 
            activeTab === 'tracking' || activeTab === 'manifest' ? 'max-w-3xl' : 
            activeTab === 'campaign' ? 'max-w-5xl' : 
            activeTab === 'team_analytics' || activeTab === 'agent_analytics' ? 'max-w-[95vw]' : 
            activeTab === 'ndr' || activeTab === 'repeat_dashboard' || activeTab === 'manual_orders' ? 'max-w-none' : 
            activeTab === 'gstinvoice' || activeTab === 'orderhistory' ? 'max-w-7xl' : 'max-w-4xl'
          } ${(activeTab === 'ndr' || activeTab === 'repeat_dashboard' || activeTab === 'manual_orders') ? '' : 'mx-auto'}`}>
            {activeTab === 'order' && <OrderForm />}
            {activeTab === 'printslip' && <PrintSlip />}
            {activeTab === 'n8n_printslip' && <N8nPrintSlip />}
            {activeTab === 'tracking' && <UpdateTracking />}
            {activeTab === 'manifest' && <CreateManifest />}
            {activeTab === 'campaign' && (
              <RepeatCampaign initialOrderNumber={repeatInitialOrder} />
            )}
            {activeTab === 'repeatorders' && 
              <RepeatOrdersTable />
            }
            
            {activeTab === 'repeat_dashboard' && (
              (() => {
                // gate like NDR
                const user = localStorage.getItem('ndr_user');
                const teamId = localStorage.getItem('ndr_active_team_id');
                const session = localStorage.getItem('ndr_session');
                if (!user || !teamId || !session) {
                  return <NdrLogin onAuthenticated={() => setNdrSessionKey((v) => v + 1)} />;
                }
                return <RepeatDashboard />;
              })()
            )}
            {activeTab === 'orderhistory' && <OrderList />}
            {activeTab === 'gstinvoice' && <GstInvoiceGenerator />}
            {activeTab === 'ndr' && (
              (() => {
                // re-evaluate when ndrSessionKey changes
                void ndrSessionKey;
                const user = localStorage.getItem('ndr_user');
                const teamId = localStorage.getItem('ndr_active_team_id');
                const session = localStorage.getItem('ndr_session');
                if (!user || !teamId || !session) {
                  return <NdrLogin onAuthenticated={() => setNdrSessionKey((v) => v + 1)} />;
                }
                return <NdrDashboard />;
              })()
            )}
            {activeTab === 'teams' && <TeamsPage />}
            {activeTab === 'allocation' && <NdrAllocationPage />}
            {activeTab === 'team_analytics' && <TeamAnalyticsPage />}
            {activeTab === 'agent_analytics' && <AgentAnalyticsPage />}
            {activeTab === 'segmentation' && <SegmentationPage />}
            {activeTab === 'manual_orders' && <ManualOrdersDashboard />}
            {activeTab === 'subscription_contract' && <SubscriptionContractForm />}
          </div>
        </main>
        
        {/* Footer removed per request: removed tagline and rights text */}
      </div>
    </div>
  );
}

export default App;