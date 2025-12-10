import { useState, useEffect } from 'react';
import axios from 'axios';

function RaceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // default to Bahrain 2023 for now
  const year = 2023;
  const race = 'Bahrain';

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Use the Node.js backend proxy
        const response = await axios.get(`http://localhost:3000/api/race/${year}/${race}`);
        setData(response.data);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load race data. Ensure backend is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading Race Data...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="dashboard">
      <h2>Race Results: {race} {year}</h2>
      {data ? (
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.Abbreviation}>
                <td>{row.Position}</td>
                <td>{row.Abbreviation}</td>
                <td>{row.TeamName}</td>
                <td>{row.Status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No data available</p>
      )}
    </div>
  );
}

export default RaceDashboard;
