import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Loader from './Loader';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Driver colors for visualization
const DRIVER_COLORS = {
  'VER': '#0600EF', 'PER': '#0600EF', // Red Bull
  'LEC': '#DC0000', 'SAI': '#DC0000', // Ferrari
  'HAM': '#00D2BE', 'RUS': '#00D2BE', // Mercedes
  'NOR': '#FF8700', 'PIA': '#FF8700', // McLaren
  'ALO': '#006F62', 'STR': '#006F62', // Aston Martin
  'GAS': '#0090FF', 'OCO': '#0090FF', // Alpine
  'TSU': '#2B4562', 'RIC': '#2B4562', // AlphaTauri
  'BOT': '#900000', 'ZHO': '#900000', // Alfa Romeo
  'MAG': '#FFFFFF', 'HUL': '#FFFFFF', // Haas
  'ALB': '#005AFF', 'SAR': '#005AFF', // Williams
};

function TrackView({ year, raceId }) {
  const [telemetryData, setTelemetryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const animationRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    const fetchTelemetry = async () => {
      if (!year || !raceId) return;

      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_URL}/api/telemetry/${year}/${raceId}`);
        setTelemetryData(response.data);
        setCurrentFrame(0);
      } catch (err) {
        console.error("Error fetching telemetry:", err);
        setError(err.response?.data?.message || "Failed to load telemetry data.");
      } finally {
        setLoading(false);
      }
    };

    fetchTelemetry();
  }, [year, raceId]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !telemetryData) return;

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setCurrentFrame(prev => {
        const nextFrame = prev + (deltaTime * playbackSpeed);
        if (nextFrame >= telemetryData.telemetry.length - 1) {
          setIsPlaying(false);
          return telemetryData.telemetry.length - 1;
        }
        return nextFrame;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = Date.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, telemetryData]);

  if (loading) {
    return (
      <div className="track-view">
        <h2>Live Race Replay</h2>
        <div className="analytics-loading">
          <Loader />
          <p className="loading-notice">⏱️ Loading track and telemetry data (30-60 seconds)...</p>
        </div>
      </div>
    );
  }

  if (error) return <div className="error">{error}</div>;
  if (!telemetryData || !telemetryData.track.outline || telemetryData.track.outline.length === 0) {
    return <div className="error">Track data not available for this race</div>;
  }

  const frame = telemetryData.telemetry[Math.floor(currentFrame)] || telemetryData.telemetry[0];
  const trackOutline = telemetryData.track.outline;

  // Calculate SVG viewBox from track outline
  const xCoords = trackOutline.map(p => p.x);
  const yCoords = trackOutline.map(p => p.y);
  const minX = Math.min(...xCoords);
  const maxX = Math.max(...xCoords);
  const minY = Math.min(...yCoords);
  const maxY = Math.max(...yCoords);
  const padding = 100;
  const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + 2 * padding} ${maxY - minY + 2 * padding}`;

  // Create SVG path from track outline
  const trackPath = trackOutline.map((point, idx) => 
    `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ') + ' Z';

  return (
    <div className="track-view">
      <div className="track-header">
        <h2>🏁 {telemetryData.track.name}</h2>
        <p>Lap {frame.lap} / {telemetryData.track.total_laps}</p>
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button 
          className="play-btn"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>

        <div className="speed-controls">
          {[0.5, 1, 2, 5, 10].map(speed => (
            <button
              key={speed}
              className={`speed-btn ${playbackSpeed === speed ? 'active' : ''}`}
              onClick={() => setPlaybackSpeed(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>

        <input
          type="range"
          min="0"
          max={telemetryData.telemetry.length - 1}
          value={currentFrame}
          onChange={(e) => {
            setCurrentFrame(parseInt(e.target.value));
            setIsPlaying(false);
          }}
          className="progress-slider"
        />
      </div>

      {/* SVG Track Visualization */}
      <div className="track-canvas">
        <svg viewBox={viewBox} className="track-svg">
          {/* Track outline */}
          <path
            d={trackPath}
            fill="none"
            stroke="#333"
            strokeWidth="80"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={trackPath}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="60"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Car positions */}
          {Object.entries(frame.positions).map(([driver, data]) => {
            if (!data.x || !data.y) return null;
            
            const color = DRIVER_COLORS[driver] || '#FFFFFF';
            
            return (
              <g key={driver}>
                <circle
                  cx={data.x}
                  cy={data.y}
                  r="30"
                  fill={color}
                  stroke="#fff"
                  strokeWidth="4"
                  className="car-dot"
                />
                <text
                  x={data.x}
                  y={data.y + 5}
                  textAnchor="middle"
                  fill="#000"
                  fontSize="20"
                  fontWeight="bold"
                >
                  {driver}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default TrackView;
