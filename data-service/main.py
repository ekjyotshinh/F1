from fastapi import FastAPI
import fastf1
import pandas as pd

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "F1 Data Service"}

@app.get("/api/years")
def get_years():
    # Return a list of recent years supported by FastF1 (and relevant for this app)
    # FastF1 data goes back quite a way, but let's stick to recent history for the UI
    return [year for year in range(2018, 2025)]

@app.get("/api/schedule/{year}")
def get_schedule(year: int):
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
def get_race_data(year: int, race_name: str):
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
        except:
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
            results_list.append({
                "Position": row['Position'],
                "Abbreviation": row['Abbreviation'],
                "TeamName": row['TeamName'],
                "Status": row['Status'],
                "GridPosition": row['GridPosition'],
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
        # Simple error handling
        return {"error": str(e)}
