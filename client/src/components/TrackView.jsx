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
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 10 });
  const [allFrames, setAllFrames] = useState([]);
  const [hoveredDriver, setHoveredDriver] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [highlightedDriver, setHighlightedDriver] = useState(null);
  const [allDrivers, setAllDrivers] = useState(new Set());
  const [selectedDrivers, setSelectedDrivers] = useState(new Set());
  const lastKnownPositions = useRef({});
  const animationRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    const fetchTelemetryChunks = async () => {
      if (!year || !raceId) return;

      setLoading(true);
      setError(null);
      setError(null);
      setAllFrames([]);
      setTelemetryData(null);
      
      try {
        const TOTAL_CHUNKS = 10;
        let trackInfo = null;
        let accumulatedFrames = [];
        let cumulativeTimeOffset = 0; // Track the max cumulative time from previous chunks

        // Fetch chunks sequentially
        for (let chunkNum = 0; chunkNum < TOTAL_CHUNKS; chunkNum++) {
          setLoadingProgress({ current: chunkNum + 1, total: TOTAL_CHUNKS });
          
          const response = await axios.get(`${API_URL}/api/telemetry/${year}/${raceId}/chunk/${chunkNum}`);

          if (response.data.error) {
            throw new Error(response.data.error);
          }

          // Store track info from first chunk
          if (chunkNum === 0) {
            trackInfo = response.data.track;
          }

          // Process the chunk's telemetry data and apply cumulative time offset
          const chunkFrames = processChunkFrames(response.data.telemetry, cumulativeTimeOffset);
          
          // Update the cumulative time offset for the next chunk
          if (chunkFrames.length > 0) {
            const maxCumulativeTime = Math.max(...chunkFrames.map(f => f.cumulative_time));
            cumulativeTimeOffset = maxCumulativeTime;
          }
          
          accumulatedFrames = [...accumulatedFrames, ...chunkFrames];

          // Update state with accumulated data so far using functional updates
          setAllFrames(prev => [...prev, ...chunkFrames]);
          setTelemetryData(prev => ({
            track: trackInfo,
            telemetry: prev ? [...prev.telemetry, ...chunkFrames] : chunkFrames,
            total_frames: prev ? prev.total_frames + chunkFrames.length : chunkFrames.length
          }));

          // After first chunk, user can start watching
          if (chunkNum === 0) {
            setLoading(false);
          }
        }

        // All chunks loaded
        setLoadingProgress({ current: TOTAL_CHUNKS, total: TOTAL_CHUNKS });
        
      } catch (err) {
        console.error("Error fetching telemetry:", err);
        setError(err.response?.data?.message || "Failed to load telemetry data.");
        setLoading(false);
      }
    };

    fetchTelemetryChunks();
  }, [year, raceId]);

  // Initialize selected drivers when allDrivers changes
  useEffect(() => {
    setSelectedDrivers(new Set(allDrivers));
  }, [allDrivers]);

  // Toggle driver selection
  const toggleDriver = (driver) => {
    setSelectedDrivers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(driver)) {
        newSet.delete(driver);
      } else {
        newSet.add(driver);
      }
      return newSet;
    });
  };

  // Select/Deselect all drivers
  const selectAllDrivers = () => setSelectedDrivers(new Set(allDrivers));
  const deselectAllDrivers = () => setSelectedDrivers(new Set());

  // Helper function to convert chunk telemetry format to frame format
  const processChunkFrames = (telemetryPoints, timeOffset = 0) => {
    // Group by cumulative time (total race time) instead of lap+time
    const frameMap = new Map();
    const driversInChunk = new Set();

    telemetryPoints.forEach(point => {
      // Track all drivers we've seen
      driversInChunk.add(point.driver);
      
      // Apply the cumulative time offset from previous chunks
      const adjustedCumulativeTime = point.cumulative_time + timeOffset;
      
      // Round cumulative_time to nearest second for grouping
      const roundedTime = Math.round(adjustedCumulativeTime);
      
      // Create a unique key for each frame based on cumulative time
      // This ensures all drivers at the same race time are in the same frame
      const frameKey = `${roundedTime}`;
      
      if (!frameMap.has(frameKey)) {
        frameMap.set(frameKey, {
          cumulative_time: roundedTime,
          lap: point.lap,
          time_in_lap: point.time_in_lap,
          positions: {}
        });
      }

      const frame = frameMap.get(frameKey);
      frame.positions[point.driver] = {
        x: point.x,
        y: point.y,
        position: point.position,
        compound: point.compound,
        speed: point.speed,
        lap: point.lap
      };
      
      // Update last known position for this driver with timestamp
      lastKnownPositions.current[point.driver] = {
        x: point.x,
        y: point.y,
        position: point.position,
        compound: point.compound,
        speed: point.speed,
        lap: point.lap,
        cumulative_time: roundedTime,
        timestamp: Date.now()
      };
    });

    // Update the set of all drivers
    setAllDrivers(prev => new Set([...prev, ...driversInChunk]));

    // Convert map to sorted array by cumulative time
    return Array.from(frameMap.values()).sort((a, b) => {
      return a.cumulative_time - b.cumulative_time;
    });
  };


  // Animation loop
  useEffect(() => {
    if (!isPlaying || !telemetryData) return;

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;

      setCurrentFrame(prev => {
        // Backend samples at 1Hz, so each frame represents ~1 second of race time
        // At 1x speed, we should advance 1 frame per second for real-time playback
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
          <p className="loading-notice">
            ⏱️ Loading chunk {loadingProgress.current} of {loadingProgress.total}...
          </p>
          <p className="loading-notice">
            First chunk will display in ~30-60 seconds
          </p>
        </div>
      </div>
    );
  }

  if (error) return <div className="error">{error}</div>;
  if (!telemetryData || !telemetryData.track.outline || telemetryData.track.outline.length === 0) {
    return <div className="error">Track data not available for this race</div>;
  }

  // Get current and next frame for interpolation
  const frameIndex = Math.floor(currentFrame);
  const nextFrameIndex = Math.min(frameIndex + 1, telemetryData.telemetry.length - 1);
  const frame = telemetryData.telemetry[frameIndex] || telemetryData.telemetry[0];
  const nextFrame = telemetryData.telemetry[nextFrameIndex] || frame;
  
  // Calculate interpolation factor (0 to 1)
  const interpolationFactor = currentFrame - frameIndex;

  // Helper function to interpolate between two values
  const lerp = (start, end, factor) => {
    return start + (end - start) * factor;
  };

  // Interpolate positions for ALL drivers (for standings display)
  const allInterpolatedPositions = {};
  
  // Get all drivers from current frame
  Object.keys(frame.positions).forEach(driver => {
    const currentPos = frame.positions[driver];
    const nextPos = nextFrame.positions[driver];

    if (currentPos && currentPos.x && currentPos.y) {
      if (nextPos && nextPos.x && nextPos.y) {
        // Interpolate between current and next position
        allInterpolatedPositions[driver] = {
          x: lerp(currentPos.x, nextPos.x, interpolationFactor),
          y: lerp(currentPos.y, nextPos.y, interpolationFactor),
          position: currentPos.position,
          compound: currentPos.compound,
          speed: currentPos.speed,
          lap: currentPos.lap
        };
      } else {
        // No next position, use current
        allInterpolatedPositions[driver] = currentPos;
      }
    }
  });

  // Filter for selected drivers only (for track display)
  const interpolatedPositions = {};
  Object.keys(allInterpolatedPositions).forEach(driver => {
    if (selectedDrivers.has(driver)) {
      interpolatedPositions[driver] = allInterpolatedPositions[driver];
    }
  });

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
        {loadingProgress.current < loadingProgress.total && (
          <p className="loading-notice" style={{ fontSize: '0.9em', color: '#ffa500' }}>
            📥 Loading chunk {loadingProgress.current} of {loadingProgress.total} in background...
          </p>
        )}
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


      {/* Split Screen: Standings + Track */}
      <div className="race-split-view">
        {/* Left: Live Standings */}
        <div className="live-standings">
          <div className="standings-header">
            <h3>📊 Current Standings</h3>
            <div className="selection-actions">
              <button onClick={selectAllDrivers} className="select-action-btn" title="Show all drivers">
                Show All
              </button>
              <button onClick={deselectAllDrivers} className="select-action-btn" title="Hide all drivers">
                Hide All
              </button>
            </div>
          </div>
          <div className="standings-list">
            {Object.entries(allInterpolatedPositions)
              .filter(([_, data]) => data.position)
              .sort((a, b) => a[1].position - b[1].position)
              .map(([driver, data], index) => {
                const color = DRIVER_COLORS[driver] || '#FFFFFF';
                const isSelected = selectedDrivers.has(driver);
                return (
                  <div 
                    key={driver} 
                    className={`standing-item ${highlightedDriver === driver ? 'highlighted' : ''} ${!isSelected ? 'deselected' : ''}`}
                    onMouseEnter={() => setHighlightedDriver(driver)}
                    onMouseLeave={() => setHighlightedDriver(null)}
                    onClick={() => toggleDriver(driver)}
                    style={{ cursor: 'pointer' }}
                    title={isSelected ? 'Click to hide driver' : 'Click to show driver'}
                  >
                    <div className="standing-position">{data.position}</div>
                    <div 
                      className="standing-driver-badge"
                      style={{ backgroundColor: color }}
                    >
                      {driver}
                    </div>
                    <div className="standing-info">
                      {data.compound && (
                        <span className={`tyre-indicator tyre-${data.compound.toLowerCase()}`}>
                          {data.compound}
                        </span>
                      )}
                      {data.speed && (
                        <span className="speed-indicator">
                          {Math.round(data.speed)} km/h
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: Track Visualization */}
        <div className="track-canvas">
          <svg viewBox={viewBox} className="track-svg">
            {/* Track outline */}
            <path
              d={trackPath}
              fill="none"
              stroke="#333"
              strokeWidth="50"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={trackPath}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Car positions */}
            {Object.entries(interpolatedPositions).map(([driver, data]) => {
              if (!data.x || !data.y) return null;
              
              const color = DRIVER_COLORS[driver] || '#FFFFFF';
              const isHighlighted = highlightedDriver === driver;
              
              return (
                <g key={driver}>
                  <circle
                    cx={data.x}
                    cy={data.y}
                    r={isHighlighted ? "150" : "120"}
                    fill={color}
                    stroke={isHighlighted ? "#FFD700" : "#fff"}
                    strokeWidth={isHighlighted ? "16" : "12"}
                    className={`car-dot ${isHighlighted ? 'highlighted-dot' : ''}`}
                    onMouseEnter={(e) => {
                      setHoveredDriver({ driver, ...data });
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
                    }}
                    onMouseLeave={() => setHoveredDriver(null)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Custom Tooltip */}
      {(hoveredDriver || (highlightedDriver && allInterpolatedPositions[highlightedDriver])) && (
        <div 
          className="driver-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          <div className="tooltip-content">
            <strong>{hoveredDriver?.driver || highlightedDriver}</strong>
            {(hoveredDriver?.position || allInterpolatedPositions[highlightedDriver]?.position) && 
              <div>Position: P{hoveredDriver?.position || allInterpolatedPositions[highlightedDriver]?.position}</div>}
            {(hoveredDriver?.compound || allInterpolatedPositions[highlightedDriver]?.compound) && 
              <div>Tyre: {hoveredDriver?.compound || allInterpolatedPositions[highlightedDriver]?.compound}</div>}
            {(hoveredDriver?.speed || allInterpolatedPositions[highlightedDriver]?.speed) && 
              <div>Speed: {Math.round(hoveredDriver?.speed || allInterpolatedPositions[highlightedDriver]?.speed)} km/h</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackView;
