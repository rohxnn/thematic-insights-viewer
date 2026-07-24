import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import PresentationPage from './pages/PresentationPage';
import VisualizationHub from './pages/VisualizationHub';
import ComparisonPlayground from './pages/ComparisonPlayground';
import SmartDashboard from './pages/SmartDashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState('visualizations');

  const renderActivePage = () => {
    switch (activeTab) {
      case 'presentation':
        return <PresentationPage />;
      case 'visualizations':
        return <VisualizationHub />;
      case 'playground':
        return <ComparisonPlayground />;
      case 'smart-dashboard':
        return <SmartDashboard />;
      default:
        return <PresentationPage />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {renderActivePage()}
      </main>
    </div>
  );
}
