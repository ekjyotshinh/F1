import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RaceDashboard from './components/RaceDashboard';


function App() {
  return (
    <Router>
      <div className="app-container">
        <nav>
          <h1>F1 Dashboard</h1>
          <ul>
            <li><Link to="/">Dashboard</Link></li>
            <li><Link to="/drivers">Driver Comparison</Link></li>
          </ul>
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<RaceDashboard />} />
            <Route path="/drivers" element={<div>Driver Comparison Placeholder</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
