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
  const lastKnownPositions = useRef({});
  const animationRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    const fetchTelemetryChunks = async () => {
      if (!year || !raceId) return;

      setLoading(true);
      setError(null);
      setAllFrames([]);
      setTelemetryData(null);
      
      try {
        const TOTAL_CHUNKS = 10;
        let trackInfo = null;
        let accumulatedFrames = [];

        // Fetch chunks sequentially
        for (let chunkNum = 0; chunkNum < TOTAL_CHUNKS; chunkNum++) {
          setLoadingProgress({ current: chunkNum + 1, total: TOTAL_CHUNKS });
          
          const response = await axios.get(`${API_URL}/api/telemetry/${year}/${raceId}/chunk/${chunkNum}`);
          const chunkData = response.data;

          // Store track info from first chunk
          if (chunkNum === 0) {
            trackInfo = chunkData.track;
          }

          // Process telemetry frames - convert from per-point to per-frame format
          const frames = processChunkFrames(chunkData.telemetry);
          accumulatedFrames = [...accumulatedFrames, ...frames];

          // Update state with accumulated data so far
          setAllFrames(accumulatedFrames);
          setTelemetryData({
            track: trackInfo,
            telemetry: accumulatedFrames,
            total_frames: accumulatedFrames.length
          });

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

  // Helper function to convert chunk telemetry format to frame format
  const processChunkFrames = (telemetryPoints) => {
    // Group by lap and time to create frames
    const frameMap = new Map();
    const driversInChunk = new Set();

    telemetryPoints.forEach(point => {
      // Track all drivers we've seen
      driversInChunk.add(point.driver);
      
      // Round time_in_lap to 2 decimal places for grouping
      // Backend samples at 1Hz, so points should naturally group
      const roundedTime = Math.round(point.time_in_lap * 100) / 100;
      
      // Create a unique key for each frame (lap + time)
      const frameKey = `${point.lap}_${roundedTime}`;
      
      if (!frameMap.has(frameKey)) {
        frameMap.set(frameKey, {
          lap: point.lap,
          time_in_lap: roundedTime,
          positions: {}
        });
      }

      const frame = frameMap.get(frameKey);
      frame.positions[point.driver] = {
        x: point.x,
        y: point.y,
        position: point.position,
        compound: point.compound,
        speed: point.speed
      };
      
      // Update last known position for this driver
      lastKnownPositions.current[point.driver] = {
        x: point.x,
        y: point.y,
        position: point.position,
        compound: point.compound,
        speed: point.speed,
        lap: point.lap,
        time_in_lap: roundedTime
      };
    });

    // Update the set of all drivers
    setAllDrivers(prev => new Set([...prev, ...driversInChunk]));

    // Convert map to sorted array
    const frames = Array.from(frameMap.values()).sort((a, b) => {
      if (a.lap !== b.lap) return a.lap - b.lap;
      return a.time_in_lap - b.time_in_lap;
    });

    // Post-process: Add drivers from next lap to end-of-lap frames
    // This prevents drivers from disappearing when they complete a lap
    frames.forEach((frame, index) => {
      // For each driver in the frame, check if there's a driver on the next lap
      const nextLap = frame.lap + 1;
      const nextLapFrames = frames.filter(f => f.lap === nextLap && f.time_in_lap < 5);
      
      if (nextLapFrames.length > 0) {
        // Add drivers from the start of next lap to this frame
        nextLapFrames.forEach(nextFrame => {
          Object.keys(nextFrame.positions).forEach(driver => {
            // Only add if driver is not already in current frame
            if (!frame.positions[driver]) {
              frame.positions[driver] = nextFrame.positions[driver];
            }
          });
        });
      }
    });

    return frames;
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

  // Interpolate positions - only show drivers with actual position data
  const interpolatedPositions = {};
  
  // Get all drivers from current frame
  Object.keys(frame.positions).forEach(driver => {
    const currentPos = frame.positions[driver];
    const nextPos = nextFrame.positions[driver];

    if (currentPos && currentPos.x && currentPos.y) {
      // Update last known position for this driver
      lastKnownPositions.current[driver] = currentPos;
      
      if (nextPos && nextPos.x && nextPos.y) {
        // Interpolate between current and next position
        interpolatedPositions[driver] = {
          x: lerp(currentPos.x, nextPos.x, interpolationFactor),
          y: lerp(currentPos.y, nextPos.y, interpolationFactor),
          position: currentPos.position,
          compound: currentPos.compound,
          speed: currentPos.speed
        };
      } else {
        // No next position, use current
        interpolatedPositions[driver] = currentPos;
      }
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
          <h3>📊 Current Standings</h3>
          <div className="standings-list">
            {Object.entries(interpolatedPositions)
              .filter(([_, data]) => data.position)
              .sort((a, b) => a[1].position - b[1].position)
              .map(([driver, data], index) => {
                const color = DRIVER_COLORS[driver] || '#FFFFFF';
                return (
                  <div 
                    key={driver} 
                    className={`standing-item ${highlightedDriver === driver ? 'highlighted' : ''}`}
                    onMouseEnter={() => setHighlightedDriver(driver)}
                    onMouseLeave={() => setHighlightedDriver(null)}
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
      {(hoveredDriver || (highlightedDriver && interpolatedPositions[highlightedDriver])) && (
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
            {(hoveredDriver?.position || interpolatedPositions[highlightedDriver]?.position) && 
              <div>Position: P{hoveredDriver?.position || interpolatedPositions[highlightedDriver]?.position}</div>}
            {(hoveredDriver?.compound || interpolatedPositions[highlightedDriver]?.compound) && 
              <div>Tyre: {hoveredDriver?.compound || interpolatedPositions[highlightedDriver]?.compound}</div>}
            {(hoveredDriver?.speed || interpolatedPositions[highlightedDriver]?.speed) && 
              <div>Speed: {Math.round(hoveredDriver?.speed || interpolatedPositions[highlightedDriver]?.speed)} km/h</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackView;
