from fastapi import FastAPI
import fastf1
import pandas as pd

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "F1 Data Service"}

@app.get("/api/race/{year}/{race_name}")
def get_race_data(year: int, race_name: str):
    session = fastf1.get_session(year, race_name, 'R')
    session.load()
    results = session.results
    return results[['Abbreviation', 'TeamName', 'Position', 'GridPosition', 'Status']].to_dict(orient='records')
