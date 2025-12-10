import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RaceDashboard from './components/RaceDashboard';

function App() {
  return (
    <Router>
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
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
