from fastapi import FastAPI, Response
import fastf1
import pandas as pd
import os
import gc

# Enable FastF1 cache (file-based only, no in-memory cache for Railway's limited RAM)
cache_dir = os.path.join(os.path.dirname(__file__), '.fastf1_cache')
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir)

# Disable in-memory caching to reduce memory usage
fastf1.Cache.set_disabled()
fastf1.Cache.enable_cache(cache_dir)  # Re-enable only file cache

app = FastAPI()

# Add CORS middleware for production
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://go-proxy-server-production-f4fd.up.railway.app",
        "http://localhost:3000",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "F1 Data Service"}

@app.post("/api/clear-cache")
def clear_cache():
    """Clear the FastF1 cache - use this if data seems corrupted"""
    import shutil
    try:
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir, exist_ok=True)
            fastf1.Cache.enable_cache(cache_dir)
            return {"message": "Cache cleared successfully", "cache_dir": cache_dir}
        return {"message": "No cache to clear"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/years")
def get_years(response: Response):
    # Set cache headers - years list is static
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"  # 24 hours
    # Return a list of recent years supported by FastF1 (and relevant for this app)
    # FastF1 data goes back quite a way, but let's stick to recent history for the UI
    return [year for year in range(2018, 2025)]


@app.get("/api/schedule/{year}")
def get_schedule(year: int, response: Response):
    # Set cache headers - schedule is historical data
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"  # 24 hours
    schedule = fastf1.get_event_schedule(year)
    # Filter for actual races (excluding pre-season testing if possible, though 'include_testing=False' is default in newer versions, 
    # let's just return what we have but format it nice)
    # We only want completed races or future ones, but primarily list them.
    # Selecting columns of interest
    events = []
    for _, row in schedule.iterrows():
        events.append({
            "RoundNumber": row['RoundNumber'],
            "Country": row['Country'],
            "Location": row['Location'],
            "OfficialEventName": row['OfficialEventName'],
            "EventDate": row['EventDate'].isoformat() if pd.notnull(row['EventDate']) else None,
            "EventName": row['EventName']
        })
    return events

@app.get("/api/race/{year}/{race_name}")
def get_race_data(year: int, race_name: str, response: Response):
    # Set cache headers - race results are historical data
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"  # 24 hours
    try:
        import gc
        
        # race_name could be the round number (int) or name (str)
        # Try to parse as int first if it looks like one
        identifier = race_name
        if race_name.isdigit():
            identifier = int(race_name)
            
        session = fastf1.get_session(year, identifier, 'R')
        session.load()
        results = session.results
        
        # Get Fastest Lap
        fastest_lap_info = {}
        try:
            fastest_lap = session.laps.pick_fastest()
            fastest_lap_info = {
                "driver": fastest_lap['Driver'],
                "time": str(fastest_lap['LapTime']).replace("0 days ", "") # extensive formatting could be done here
            }
        except Exception as e:
            print(f"Error getting fastest lap: {e}")
            fastest_lap_info = {"driver": "N/A", "time": "N/A"}

        # Get Winner's Race Time (Position 1)
        winner = results.loc[results['Position'] == 1.0]
        race_time = "N/A"
        if not winner.empty:
            # Time is usually in 'Time' column as timedelta
            val = winner.iloc[0]['Time']
            if pd.notnull(val):
                race_time = str(val).replace("0 days ", "")

        # Prepare list
        # DEBUG: Log raw data from FastF1
        # print(f"\n=== DEBUG: FastF1 Raw Data for {year} race {identifier} ===")
        # print(f"Results shape: {results.shape}")
        # print(f"Results columns: {results.columns.tolist()}")
        # print(f"\nFirst 3 rows Position column:")
        # print(f"  dtype: {results['Position'].dtype}")
        # print(f"  values: {results['Position'].head(3).tolist()}")
        # print(f"  has NaN: {results['Position'].isna().any()}")
        # print(f"\nFirst 3 rows GridPosition column:")
        # print(f"  dtype: {results['GridPosition'].dtype}")
        # print(f"  values: {results['GridPosition'].head(3).tolist()}")
        # print(f"  has NaN: {results['GridPosition'].isna().any()}")
        # print(f"\nFirst 3 rows Time column:")
        # print(f"  dtype: {results['Time'].dtype}")
        # print(f"  values: {results['Time'].head(3).tolist()}")
        # print(f"  has NaN: {results['Time'].isna().any()}")
        # print(f"\nFirst 3 rows Status column:")
        # print(f"  values: {results['Status'].head(3).tolist()}")
        # print("=== END DEBUG ===\n")
        
        # data handling for JSON serialization (handle NaNs, timedeltas)
        results_list = []
        
        # Check if we have valid position data
        # Try Position first, fallback to ClassifiedPosition if needed
        has_position = results['Position'].notna().any()
        has_classified = 'ClassifiedPosition' in results.columns and results['ClassifiedPosition'].notna().any()
        
        if not has_position and not has_classified:
            print(f"WARNING: No position data available for {year} race {identifier}")
            return {
                "error": "Incomplete race data",
                "message": f"⚠️ Race results for {session.event['EventName']} ({year}) are not available. FastF1's data source (Ergast API) doesn't have complete data for {year}.",
                "race_name": session.event['EventName'],
                "race_date": session.event['EventDate'].isoformat() if pd.notnull(session.event['EventDate']) else None,
                "suggestion": "✅ Try races from 2018-2022 for complete data",
                "working_examples": [
                    "2022 Abu Dhabi Grand Prix",
                    "2021 Monaco Grand Prix", 
                    "2020 British Grand Prix",
                    "2019 Australian Grand Prix"
                ]
            }
        
        for idx, row in results.iterrows():
            # Convert NaN to None for JSON serialization, but keep valid numbers
            # Try Position first, fallback to ClassifiedPosition
            
            try:
                if pd.notna(row['Position']):
                    position = row['Position']
                elif 'ClassifiedPosition' in results.columns and pd.notna(row['ClassifiedPosition']):
                    position = row['ClassifiedPosition']
                else:
                    position = None
            except (ValueError, TypeError) as e:
                print(f"ERROR converting Position: {e}, Position: {row.get('Position')}, Classified: {row.get('ClassifiedPosition')}")
                position = None
                
            try:
                grid_position = row['GridPosition'] if pd.notna(row['GridPosition']) else None
            except (ValueError, TypeError) as e:
                print(f"ERROR converting GridPosition: {e}, value: {row['GridPosition']}")
                grid_position = None
            

            results_list.append({
                "Position": position,
                "Abbreviation": row['Abbreviation'],
                "TeamName": row['TeamName'],
                "Status": row['Status'],
                "GridPosition": grid_position,
                "Time": str(row['Time']).replace("0 days ", "") if pd.notnull(row['Time']) else "",
            })

        result = {
            "race_name": session.event['EventName'],
            "race_date": session.event['EventDate'].isoformat() if pd.notnull(session.event['EventDate']) else None,
            "race_time": race_time,
            "fastest_lap": fastest_lap_info,
            "results": results_list
        }
        
        # Clear session data from memory and force garbage collection
        del session
        gc.collect()
        
        return result
    except Exception as e:
        # Return detailed error for debugging
        import traceback
        error_detail = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        print(f"Error in get_race_data: {error_detail}")
        return error_detail

@app.get("/api/analytics/{year}/{race_name}")
def get_race_analytics(year: int, race_name: str, response: Response):
    # Set cache headers - analytics are historical data
    response.headers["Cache-Control"] = "public, max-age=86400, immutable"  # 24 hours
    try:
        import gc
        
        # race_name could be the round number (int) or name (str)
        identifier = race_name
        if race_name.isdigit():
            identifier = int(race_name)
            
        session = fastf1.get_session(year, identifier, 'R')
        session.load()
        
        # Get all laps
        laps = session.laps
        
        # Extract lap times for each driver
        lap_times = {}
        position_changes = {}
        
        # Get unique drivers
        drivers = laps['Driver'].unique()
        
        for driver in drivers:
            driver_laps = laps[laps['Driver'] == driver].sort_values('LapNumber')
            
            # Lap times (convert to seconds as float)
            times = []
            for _, lap in driver_laps.iterrows():
                if pd.notnull(lap['LapTime']):
                    # Convert timedelta to total seconds
                    times.append(lap['LapTime'].total_seconds())
                else:
                    times.append(None)
            
            lap_times[driver] = times
            
            # Position changes
            positions = driver_laps['Position'].tolist()
            # Convert any NaN to None for JSON serialization
            positions = [int(p) if pd.notnull(p) else None for p in positions]
            position_changes[driver] = positions
        
        # Extract tire strategy
        tire_strategy = []
        for driver in drivers:
            driver_laps = laps[laps['Driver'] == driver].sort_values('LapNumber')
            
            current_compound = None
            stint = 0
            
            for _, lap in driver_laps.iterrows():
                compound = lap['Compound']
                
                # Detect tire change (new stint)
                if pd.notnull(compound) and compound != current_compound:
                    stint += 1
                    current_compound = compound
                    
                    tire_strategy.append({
                        "driver": driver,
                        "lap": int(lap['LapNumber']),
                        "compound": compound,
                        "stint": stint
                    })
        
        # Get driver info for better display
        results = session.results
        driver_info = {}
        for _, row in results.iterrows():
            driver_num = str(row['DriverNumber']) if pd.notnull(row['DriverNumber']) else "N/A"
            driver_info[row['Abbreviation']] = {
                "name": row['Abbreviation'],
                "team": row['TeamName'],
                "number": driver_num
            }
        
        result = {
            "lap_times": lap_times,
            "tire_strategy": tire_strategy,
            "position_changes": position_changes,
            "driver_info": driver_info,
            "total_laps": int(laps['LapNumber'].max()) if len(laps) > 0 else 0
        }
        
        # Clear session data from memory and force garbage collection
        del session, laps
        gc.collect()
        
        return result
    except Exception as e:
        # Return detailed error for debugging
        import traceback
        error_detail = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        print(f"Error in get_race_analytics: {error_detail}")
        return error_detail

@app.get("/api/telemetry/{year}/{race_name}")
def get_telemetry(year: int, race_name: str, response: Response):
    """
    Get telemetry data for live race replay visualization with actual track coordinates.
    Returns car X/Y positions sampled throughout the race.
    """
    try:
        # Set cache headers
        response.headers["Cache-Control"] = "public, max-age=3600"  # 1 hour
        
        # Convert race_name to identifier
        identifier = int(race_name) if race_name.isdigit() else race_name
        
        # Load session
        session = fastf1.get_session(year, identifier, 'R')
        session.load(telemetry=True, laps=True, weather=False)
        
        # Get all laps
        laps = session.laps
        
        if laps is None or laps.empty:
            return {
                "error": "No lap data available",
                "message": f"Lap data for {session.event['EventName']} ({year}) is not available."
            }
        
        # Get unique drivers
        drivers = laps['Driver'].unique().tolist()
        
        # Get track outline from first driver's first lap telemetry
        try:
            first_driver = drivers[0]
            first_lap = laps[(laps['Driver'] == first_driver) & (laps['LapNumber'] == 1)].iloc[0]
            lap_telemetry = first_lap.get_telemetry()
            
            if lap_telemetry is not None and not lap_telemetry.empty:
                # Sample track outline (every 10th point to reduce size)
                track_outline = []
                for idx in range(0, len(lap_telemetry), 10):
                    row = lap_telemetry.iloc[idx]
                    if pd.notnull(row['X']) and pd.notnull(row['Y']):
                        track_outline.append({
                            "x": float(row['X']),
                            "y": float(row['Y'])
                        })
            else:
                track_outline = []
        except Exception as e:
            print(f"Could not get track outline: {e}")
            track_outline = []
        
        # Sample every 5 laps to reduce data size
        sample_laps = list(range(1, int(laps['LapNumber'].max()) + 1, 5))
        telemetry_frames = []
        
        for lap_num in sample_laps:
            lap_data = laps[laps['LapNumber'] == lap_num]
            
            if lap_data.empty:
                continue
            
            frame = {
                "lap": lap_num,
                "positions": {}
            }
            
            # Get position for each driver at this lap
            for driver in drivers:
                driver_lap = lap_data[lap_data['Driver'] == driver]
                
                if not driver_lap.empty:
                    row = driver_lap.iloc[0]
                    
                    # Try to get telemetry for X/Y position
                    try:
                        tel = row.get_telemetry()
                        if tel is not None and not tel.empty:
                            # Get position at 50% through the lap
                            mid_point = len(tel) // 2
                            tel_row = tel.iloc[mid_point]
                            
                            frame["positions"][driver] = {
                                "x": float(tel_row['X']) if pd.notnull(tel_row['X']) else None,
                                "y": float(tel_row['Y']) if pd.notnull(tel_row['Y']) else None,
                                "position": int(row['Position']) if pd.notnull(row['Position']) else None,
                                "compound": row['Compound'] if 'Compound' in row and pd.notnull(row['Compound']) else None
                            }
                    except Exception as e:
                        # Fallback if telemetry not available
                        frame["positions"][driver] = {
                            "x": None,
                            "y": None,
                            "position": int(row['Position']) if pd.notnull(row['Position']) else None,
                            "compound": row['Compound'] if 'Compound' in row and pd.notnull(row['Compound']) else None
                        }
            
            if frame["positions"]:
                telemetry_frames.append(frame)
        
        result = {
            "track": {
                "name": session.event['EventName'],
                "total_laps": int(laps['LapNumber'].max()) if not laps.empty else 0,
                "outline": track_outline
            },
            "telemetry": telemetry_frames,
            "total_frames": len(telemetry_frames)
        }
        
        # Clean up
        del session
        gc.collect()
        
        return result
        
    except Exception as e:
        print(f"Error in get_telemetry: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "traceback": traceback.format_exc()}

@app.get("/api/telemetry/{year}/{race_name}/chunk/{chunk_num}")
def get_telemetry_chunk(year: int, race_name: str, chunk_num: int, response: Response):
    """
    Get telemetry data in chunks for progressive loading.
    Divides race into 4 chunks, samples at ~1Hz (1 point per second per driver).
    """
    try:
        # Set cache headers
        response.headers["Cache-Control"] = "public, max-age=3600"  # 1 hour
        
        # Convert race_name to identifier
        identifier = int(race_name) if race_name.isdigit() else race_name
        
        # Validate chunk number
        TOTAL_CHUNKS = 10
        if chunk_num < 0 or chunk_num >= TOTAL_CHUNKS:
            return {"error": f"Invalid chunk number. Must be 0-{TOTAL_CHUNKS-1}"}
        
        # Load session
        session = fastf1.get_session(year, identifier, 'R')
        session.load(telemetry=True, laps=True, weather=False)
        
        # Get all laps
        laps = session.laps
        
        if laps is None or laps.empty:
            return {
                "error": "No lap data available",
                "message": f"Lap data for {session.event['EventName']} ({year}) is not available."
            }
        
        # Get unique drivers
        drivers = laps['Driver'].unique().tolist()
        total_laps = int(laps['LapNumber'].max())
        
        # Calculate chunk boundaries
        chunk_size = total_laps / TOTAL_CHUNKS
        start_lap = int(chunk_num * chunk_size) + 1
        end_lap = int((chunk_num + 1) * chunk_size) if chunk_num < TOTAL_CHUNKS - 1 else total_laps
        
        # Get track outline (only for first chunk to save bandwidth)
        track_outline = []
        if chunk_num == 0:
            try:
                first_driver = drivers[0]
                first_lap = laps[(laps['Driver'] == first_driver) & (laps['LapNumber'] == 1)].iloc[0]
                lap_telemetry = first_lap.get_telemetry()
                
                if lap_telemetry is not None and not lap_telemetry.empty:
                    # Sample track outline (every 10th point to reduce size)
                    for idx in range(0, len(lap_telemetry), 10):
                        row = lap_telemetry.iloc[idx]
                        if pd.notnull(row['X']) and pd.notnull(row['Y']):
                            track_outline.append({
                                "x": float(row['X']),
                                "y": float(row['Y'])
                            })
            except Exception as e:
                print(f"Could not get track outline: {e}")
        
        # Sample telemetry at ~1Hz (1 point per second)
        telemetry_frames = []
        
        for lap_num in range(start_lap, end_lap + 1):
            lap_data = laps[laps['LapNumber'] == lap_num]
            
            if lap_data.empty:
                continue
            
            # For each driver, get telemetry and sample at 1Hz
            for driver in drivers:
                driver_lap = lap_data[lap_data['Driver'] == driver]
                
                if driver_lap.empty:
                    continue
                
                row = driver_lap.iloc[0]
                
                try:
                    tel = row.get_telemetry()
                    if tel is None or tel.empty:
                        continue
                    
                    # Sample at exactly 1Hz (1 point per second)
                    # FastF1 telemetry has SessionTime which we can use
                    if 'SessionTime' not in tel.columns:
                        continue
                    
                    # Get the time range for this lap
                    start_time = tel['SessionTime'].iloc[0].total_seconds()
                    end_time = tel['SessionTime'].iloc[-1].total_seconds()
                    
                    # Sample at 1 second intervals
                    current_time = start_time
                    while current_time <= end_time:
                        # Find the closest telemetry point to this time
                        time_diffs = abs(tel['SessionTime'].apply(lambda x: x.total_seconds()) - current_time)
                        closest_idx = time_diffs.idxmin()
                        tel_row = tel.loc[closest_idx]
                        
                        if pd.notnull(tel_row['X']) and pd.notnull(tel_row['Y']):
                            # Calculate time within lap in SECONDS (not fraction)
                            time_in_lap_seconds = current_time - start_time
                            
                            # Calculate cumulative time (total race time)
                            # This is the SessionTime which represents total elapsed time
                            cumulative_time = current_time
                            
                            telemetry_frames.append({
                                "lap": lap_num,
                                "driver": driver,
                                "time_in_lap": round(time_in_lap_seconds, 2),
                                "cumulative_time": round(cumulative_time, 2),
                                "x": float(tel_row['X']),
                                "y": float(tel_row['Y']),
                                "position": int(row['Position']) if pd.notnull(row['Position']) else None,
                                "compound": row['Compound'] if 'Compound' in row and pd.notnull(row['Compound']) else None,
                                "speed": float(tel_row['Speed']) if 'Speed' in tel_row and pd.notnull(tel_row['Speed']) else None
                            })
                        
                        current_time += 1.0  # Advance by 1 second
                
                except Exception as e:
                    print(f"Error getting telemetry for {driver} lap {lap_num}: {e}")
                    continue
        
        result = {
            "chunk_info": {
                "chunk_num": chunk_num,
                "total_chunks": TOTAL_CHUNKS,
                "start_lap": start_lap,
                "end_lap": end_lap
            },
            "track": {
                "name": session.event['EventName'],
                "total_laps": total_laps,
                "outline": track_outline  # Only in first chunk
            },
            "telemetry": telemetry_frames,
            "total_frames": len(telemetry_frames)
        }
        
        # Clean up
        del session
        gc.collect()
        
        return result
        
    except Exception as e:
        print(f"Error in get_telemetry_chunk: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "traceback": traceback.format_exc()}

