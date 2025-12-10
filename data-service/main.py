from fastapi import FastAPI, Response
import fastf1
import pandas as pd
import os

# Enable FastF1 cache
cache_dir = os.path.join(os.path.dirname(__file__), '.fastf1_cache')
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir)

app = FastAPI()

# Add CORS middleware for production
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://go-proxy-server-production-f4fd.up.railway.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "F1 Data Service"}


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
        # data handling for JSON serialization (handle NaNs, timedeltas)
        results_list = []
        for _, row in results.iterrows():
            # Convert NaN to None for JSON serialization, but keep valid numbers
            position = None if pd.isna(row['Position']) else int(row['Position'])
            grid_position = None if pd.isna(row['GridPosition']) else int(row['GridPosition'])
            
            results_list.append({
                "Position": position,
                "Abbreviation": row['Abbreviation'],
                "TeamName": row['TeamName'],
                "Status": row['Status'],
                "GridPosition": grid_position,
                "Time": str(row['Time']).replace("0 days ", "") if pd.notnull(row['Time']) else "",
            })

        return {
            "race_name": session.event['EventName'],
            "race_date": session.event['EventDate'].isoformat() if pd.notnull(session.event['EventDate']) else None,
            "race_time": race_time,
            "fastest_lap": fastest_lap_info,
            "results": results_list
        }
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
        
        return {
            "lap_times": lap_times,
            "tire_strategy": tire_strategy,
            "position_changes": position_changes,
            "driver_info": driver_info,
            "total_laps": int(laps['LapNumber'].max()) if len(laps) > 0 else 0
        }
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
