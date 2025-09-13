import React from 'react';
import { 
  X, 
  LayoutDashboard, 
  FileText, 
  BarChart3, 
  Settings, 
  LogOut 
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <div className={`fixed left-0 top-0 h-full bg-[#232424] w-64 transform transition-transform duration-300 z-50 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:z-auto`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white">Navigation</h2>
            <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="space-y-2">
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg bg-[#4FBDBA]/10 text-[#4FBDBA]">
              <LayoutDashboard className="w-5 h-5" />
              <span>CS Dashboard</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
              <FileText className="w-5 h-5" />
              <span>Ticket Management</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
              <BarChart3 className="w-5 h-5" />
              <span>VOC Dashboard</span>
            </a>
            <div className="border-t border-gray-700 mt-6 pt-6">
              <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </a>
              <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </a>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
