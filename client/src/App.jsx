import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RaceDashboard from './components/RaceDashboard';
import AdminPage from './components/AdminPage';

function App() {
  return (
    <Router basename="/F1">
      <div className="app-container">
        <nav>
          <div className="nav-content">
            <div className="nav-brand">
              <span className="f1-logo">F1</span>
              <span className="nav-title">Analytics Dashboard</span>
            </div>
            <div className="nav-tagline">Race Insights & Performance Data</div>
          </div>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<RaceDashboard />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
