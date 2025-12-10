import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RaceDashboard from './components/RaceDashboard';


function App() {
  return (
    <Router>
      <div className="app-container">
        <nav>
          <h1>F1 Analytics</h1>
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
