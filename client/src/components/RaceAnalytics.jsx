import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import Loader from './Loader';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function RaceAnalytics({ year, raceId }) {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDrivers, setSelectedDrivers] = useState([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!year || !raceId) return;

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`http://localhost:3000/api/analytics/${year}/${raceId}`);
        setAnalyticsData(response.data);
        
        // Auto-select top 5 drivers by final position
        if (response.data.position_changes) {
          const drivers = Object.keys(response.data.position_changes);
          const topDrivers = drivers
            .map(driver => ({
              driver,
              finalPos: response.data.position_changes[driver].filter(p => p !== null).slice(-1)[0] || 999
            }))
            .sort((a, b) => a.finalPos - b.finalPos)
            .slice(0, 5)
            .map(d => d.driver);
          
          setSelectedDrivers(topDrivers);
        }
      } catch (err) {
        console.error("Error fetching analytics:", err);
        setError("Failed to load analytics data.");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [year, raceId]);

  const toggleDriver = (driver) => {
    setSelectedDrivers(prev =>
      prev.includes(driver)
        ? prev.filter(d => d !== driver)
        : [...prev, driver]
    );
  };

  if (loading) return <Loader />;
  if (error) return <div className="error">{error}</div>;
  if (!analyticsData) return null;

  // Prepare lap times chart data
  const lapNumbers = Array.from({ length: analyticsData.total_laps }, (_, i) => i + 1);
  
  const colors = [
    '#ff1801', '#00d2be', '#ffd700', '#6495ed', '#ff69b4',
    '#32cd32', '#ff8c00', '#9370db', '#00ced1', '#ff6347'
  ];

  const lapTimesData = {
    labels: lapNumbers,
    datasets: selectedDrivers.map((driver, index) => ({
      label: driver,
      data: analyticsData.lap_times[driver] || [],
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '33',
      borderWidth: 2,
      pointRadius: 1,
      tension: 0.1
    }))
  };

  const lapTimesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff', font: { size: 11 } }
      },
      title: {
        display: true,
        text: 'Lap Times Progression',
        color: '#ff1801',
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value) {
              const minutes = Math.floor(value / 60);
              const seconds = (value % 60).toFixed(3);
              return `${context.dataset.label}: ${minutes}:${seconds.padStart(6, '0')}`;
            }
            return context.dataset.label + ': N/A';
          }
        }
      }
    },
    scales: {
      y: {
        ticks: {
          color: '#aaa',
          callback: (value) => {
            const minutes = Math.floor(value / 60);
            const seconds = Math.floor(value % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        },
        grid: { color: '#333' }
      },
      x: {
        ticks: { color: '#aaa' },
        grid: { color: '#333' },
        title: {
          display: true,
          text: 'Lap Number',
          color: '#aaa'
        }
      }
    }
  };

  // Prepare position changes chart data
  const positionData = {
    labels: lapNumbers,
    datasets: selectedDrivers.map((driver, index) => ({
      label: driver,
      data: analyticsData.position_changes[driver] || [],
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '33',
      borderWidth: 2,
      pointRadius: 1,
      tension: 0.1
    }))
  };

  const positionOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff', font: { size: 11 } }
      },
      title: {
        display: true,
        text: 'Position Changes',
        color: '#ff1801',
        font: { size: 16, weight: 'bold' }
      }
    },
    scales: {
      y: {
        reverse: true,
        ticks: { color: '#aaa', stepSize: 1 },
        grid: { color: '#333' },
        title: {
          display: true,
          text: 'Position',
          color: '#aaa'
        }
      },
      x: {
        ticks: { color: '#aaa' },
        grid: { color: '#333' },
        title: {
          display: true,
          text: 'Lap Number',
          color: '#aaa'
        }
      }
    }
  };

  const allDrivers = Object.keys(analyticsData.lap_times).sort();

  return (
    <div className="analytics-section">
      <h2>Race Analytics</h2>
      
      <div className="driver-selector">
        <h3>Select Drivers:</h3>
        <div className="driver-buttons">
          {allDrivers.map(driver => (
            <button
              key={driver}
              className={`driver-btn ${selectedDrivers.includes(driver) ? 'active' : ''}`}
              onClick={() => toggleDriver(driver)}
            >
              {driver}
            </button>
          ))}
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-wrapper">
          <Line data={lapTimesData} options={lapTimesOptions} />
        </div>
        
        <div className="chart-wrapper">
          <Line data={positionData} options={positionOptions} />
        </div>
      </div>

      <div className="tire-strategy-section">
        <h3>Tire Strategy</h3>
        <div className="tire-grid">
          {selectedDrivers.map(driver => {
            const stints = analyticsData.tire_strategy.filter(s => s.driver === driver);
            return (
              <div key={driver} className="tire-row">
                <div className="tire-driver">{driver}</div>
                <div className="tire-timeline">
                  {stints.map((stint, idx) => (
                    <div key={idx} className={`tire-stint tire-${stint.compound?.toLowerCase()}`}>
                      <span>Lap {stint.lap}: {stint.compound}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default RaceAnalytics;
