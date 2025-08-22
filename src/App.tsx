import { useState, useEffect } from 'react';
import OrderForm from './components/OrderForm';
import PrintSlip from './components/PrintSlip';
import UpdateTracking from './components/UpdateTracking';
import CreateManifest from './components/CreateManifest';
import RepeatCampaign from './components/RepeatCampaign';
import RepeatOrdersTable from './components/RepeatOrdersTable';
import OrderList from './components/OrderList';
import GstInvoiceGenerator from './components/GstInvoice';
import Auth from './components/Auth';
import NdrDashboard from './components/NdrDashboard';
import { Package, Printer, Truck, FileText, Users, LogOut, FileSpreadsheet, RefreshCw } from 'lucide-react';

type TabType = 'order' | 'printslip' | 'tracking' | 'manifest' | 'campaign' | 'repeatorders' | 'orderhistory' | 'gstinvoice' | 'ndr';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('order');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
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
    { id: 'tracking', label: 'Update Tracking', icon: <Truck size={20} /> },
    { id: 'manifest', label: 'Create Manifest', icon: <FileText size={20} /> },
    { id: 'campaign', label: 'Repeat Campaign', icon: <Users size={20} /> },
    { id: 'repeatorders', label: 'Repeat Orders', icon: <RefreshCw size={20} /> },
    { id: 'ndr', label: 'NDR Dashboard', icon: <Truck size={20} /> },
    { id: 'gstinvoice', label: 'GST Invoice', icon: <FileSpreadsheet size={20} /> },
  ];

  const pageDescriptions: Record<TabType, string> = {
    order: 'Create a new order by filling out the form below',
    printslip: 'Generate and print courier slips',
    tracking: 'Update tracking information for orders',
    manifest: 'Create and manage shipping manifests',
    campaign: 'Manage repeat customer campaigns and feedback',
    repeatorders: 'View and manage customers with repeat orders',
    orderhistory: 'View, filter, and print past orders',
    gstinvoice: 'Generate GST invoices for orders',
    ndr: 'Monitor & resolve non-delivery shipments',
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
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
        <header className="bg-white shadow-sm p-6">
          <h2 className="text-2xl font-semibold text-gray-800">{navigationItems.find(item => item.id === activeTab)?.label}</h2>
          <p className="text-gray-600 mt-1">{pageDescriptions[activeTab]}</p>
        </header>

        <main className={`flex-grow p-6 overflow-y-auto bg-gray-50 ${ 
          activeTab === 'order' ? 'flex justify-center items-start' : '' 
        }`}>
          <div className={`w-full ${ 
            activeTab === 'order' ? 'max-w-6xl' : 
            activeTab === 'tracking' || activeTab === 'manifest' ? 'max-w-3xl' : 
            activeTab === 'campaign' ? 'max-w-5xl' : 
            activeTab === 'gstinvoice' || activeTab === 'orderhistory' || activeTab === 'ndr' ? 'max-w-7xl' : 'max-w-4xl'
          } mx-auto`}>
            {activeTab === 'order' && <OrderForm />}
            {activeTab === 'printslip' && <PrintSlip />}
            {activeTab === 'tracking' && <UpdateTracking />}
            {activeTab === 'manifest' && <CreateManifest />}
            {activeTab === 'campaign' && (
              <RepeatCampaign initialOrderNumber={repeatInitialOrder} />
            )}
            {activeTab === 'repeatorders' && 
              <RepeatOrdersTable />
            }
            {activeTab === 'orderhistory' && <OrderList />}
            {activeTab === 'gstinvoice' && <GstInvoiceGenerator />}
            {activeTab === 'ndr' && <NdrDashboard />}
          </div>
        </main>
        
        {/* Footer removed per request: removed tagline and rights text */}
      </div>
    </div>
  );
}

export default App;