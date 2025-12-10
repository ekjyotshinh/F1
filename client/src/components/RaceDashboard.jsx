import { useState, useEffect } from 'react';
import axios from 'axios';
import Loader from './Loader';
import RaceAnalytics from './RaceAnalytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function RaceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Selection State
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(2023);
  const [schedule, setSchedule] = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState(''); // Can be RoundNumber or race name, using RoundNumber for precision if available

  const [initializing, setInitializing] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Fetch available years on mount
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/years`);
        setYears(response.data);
        if (response.data.length > 0) {
           // Default to last year if available, or just keep 2023
           const lastYear = response.data[response.data.length - 1];
           setSelectedYear(lastYear);
        }
      } catch (err) {
        console.error("Error fetching years:", err);
        setError("Failed to load configuration (years). Check backend.");
      } finally {
        setInitializing(false);
      }
    };
    fetchYears();
  }, []);

  // Fetch schedule when selectedYear changes
  useEffect(() => {
    const fetchSchedule = async () => {
      if (!selectedYear) return;
      try {
        const response = await axios.get(`${API_URL}/api/schedule/${selectedYear}`);
        setSchedule(response.data);
        // Default to first race if available
        if (response.data.length > 0) {
           setSelectedRaceId(response.data[0].RoundNumber);
        }
      } catch (err) {
        console.error("Error fetching schedule:", err);
      }
    };
    fetchSchedule();
  }, [selectedYear]);

  // Manual race data fetch - triggered by button click
  const loadRaceData = async () => {
    if (!selectedYear || !selectedRaceId) {
      setError('Please select both year and race');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null); // Clear previous data
    setShowAnalytics(false); // Hide analytics when loading new race
    
    try {
      const response = await axios.get(`${API_URL}/api/race/${selectedYear}/${selectedRaceId}`);
      setData(response.data);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.response?.data?.message || "Failed to load race data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleYearChange = (e) => {
      setSelectedYear(parseInt(e.target.value));
  };

  const handleRaceChange = (e) => {
      setSelectedRaceId(e.target.value);
  };

  if (initializing) return <Loader />;
  if (!years.length && error) return <div className="error">{error}</div>;

  return (
    <div className="dashboard">
      <div className="controls">
        <div className="control-group">
          <label htmlFor="year-select">Year:</label>
          <select 
            id="year-select"
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="race-select">Race:</label>
          <select 
            id="race-select"
            value={selectedRaceId} 
            onChange={(e) => setSelectedRaceId(e.target.value)}
            disabled={!schedule.length}
          >
            <option value="">Select a race</option>
            {schedule.map(race => (
              <option key={race.RoundNumber} value={race.RoundNumber}>
                {race.EventName}
              </option>
            ))}
          </select>
        </div>

        <button 
          className="load-race-btn"
          onClick={loadRaceData}
          disabled={!selectedYear || !selectedRaceId || loading}
        >
          {loading ? 'Loading...' : 'Load Race'}
        </button>
      </div>

      {loading && <Loader />}
      {error && <div className="error">{error}</div>}

      {data && !loading && (
        <>
          <div className="race-header">
              <h2>{data.race_name} {selectedYear}</h2>
              <p><strong>Date:</strong> {new Date(data.race_date).toLocaleDateString()}</p>
              <div className="stats-grid">
                  <div className="stat-card">
                      <h3>Fastest Lap</h3>
                       <p>{data.fastest_lap.driver} ({data.fastest_lap.time})</p>
                  </div>
              </div>
          </div>
          <table>
          <thead>
              <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Time/Status</th>
              <th>Grid</th>
              </tr>
          </thead>
          <tbody>
              {data.results.map((row) => (
              <tr key={row.Abbreviation}>
                  <td>{row.Position}</td>
                  <td>{row.Abbreviation}</td>
                  <td>{row.TeamName}</td>
                  <td>{row.Time || row.Status}</td>
                  <td>{row.GridPosition}</td>
              </tr>
              ))}
            </tbody>
          </table>
          {/* Analytics Toggle Button */}
          <div className="analytics-toggle">
            <button 
              className="analytics-btn"
              onClick={() => setShowAnalytics(!showAnalytics)}
            >
              {showAnalytics ? '📊 Hide Analytics' : '📊 Show Analytics'}
            </button>
          </div>
          {/* Conditionally render analytics only when requested */}
          {showAnalytics && (
            <RaceAnalytics 
              year={selectedYear} 
              raceId={selectedRaceId} 
            />
          )}
        </>
      )}
    </div>
  );
}

export default RaceDashboard;
