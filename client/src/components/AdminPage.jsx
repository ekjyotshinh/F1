import { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function AdminPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const clearCache = async () => {
    if (!confirm('Are you sure you want to clear the FastF1 cache? This will force re-downloading of all race data.')) {
      return;
    }

    setLoading(true);
    setMessage('');
    
    try {
      const response = await axios.post(`${API_URL}/api/clear-cache`);
      setMessage(`✅ ${response.data.message || 'Cache cleared successfully'}`);
    } catch (err) {
      console.error("Error clearing cache:", err);
      setMessage(`❌ Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1>🔧 Admin Panel</h1>
        <p className="admin-description">
          Use this page to manage the F1 Analytics backend services.
        </p>

        <div className="admin-section">
          <h2>Cache Management</h2>
          <p>Clear the FastF1 cache if race data appears corrupted or incomplete.</p>
          
          <button 
            className="admin-btn danger"
            onClick={clearCache}
            disabled={loading}
          >
            {loading ? 'Clearing Cache...' : 'Clear FastF1 Cache'}
          </button>

          {message && (
            <div className={`admin-message ${message.startsWith('✅') ? 'success' : 'error'}`}>
              {message}
            </div>
          )}
        </div>

        <div className="admin-section">
          <h2>System Info</h2>
          <ul className="admin-info">
            <li><strong>API URL:</strong> {API_URL}</li>
            <li><strong>Environment:</strong> {import.meta.env.MODE}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
