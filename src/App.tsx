import { useState } from 'react';
import { Settings, TestPanel, VisionDebugPanel } from './components';
import './App.css';

type Tab = 'test' | 'vision' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('test');

  return (
    <div className="app">
      <header className="app-header">
        <h1>ScreenTutor</h1>
        <nav className="tabs">
          <button
            className={activeTab === 'test' ? 'active' : ''}
            onClick={() => setActiveTab('test')}
          >
            Test LLM
          </button>
          <button
            className={activeTab === 'vision' ? 'active' : ''}
            onClick={() => setActiveTab('vision')}
          >
            Screen Test
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="app-content">
        {activeTab === 'test' && (
          <div className="test-container">
            <TestPanel />
          </div>
        )}
        {activeTab === 'vision' && (
          <div className="vision-container">
            <VisionDebugPanel />
          </div>
        )}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
