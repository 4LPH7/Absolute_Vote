import React, { useState } from "react";
import axios from "axios";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [voterAddress, setVoterAddress] = useState("");
  const [voterAddressVote, setVoterAddressVote] = useState("");
  const [voteOption, setVoteOption] = useState("");
  const [results, setResults] = useState([]);

  const adminLogin = async () => {
    try {
      const response = await axios.post("http://127.0.0.1:5000/login", {
        username,
        password,
      });
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.error || "An error occurred");
    }
  };

  const registerVoter = async () => {
    try {
      const response = await axios.post("http://127.0.0.1:5000/register", {
        voter: voterAddress,
      });
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.error || "An error occurred");
    }
  };

  const castVote = async () => {
    try {
      const response = await axios.post("http://127.0.0.1:5000/vote", {
        voter: voterAddressVote,
        option: voteOption,
      });
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.error || "An error occurred");
    }
  };

  const getResults = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:5000/results");
      setResults(response.data.results);
    } catch (error) {
      alert(error.response?.data?.error || "An error occurred");
    }
  };

  const adminLogout = async () => {
    try {
      const response = await axios.post("http://127.0.0.1:5000/logout");
      alert(response.data.message);
    } catch (error) {
      alert(error.response?.data?.error || "An error occurred");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Blockchain Voting System</h1>

      {/* Admin Login */}
      <div>
        <h2>Admin Login</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={adminLogin}>Login</button>
      </div>

      {/* Register Voter */}
      <div>
        <h2>Register Voter</h2>
        <input
          type="text"
          placeholder="Voter Address"
          value={voterAddress}
          onChange={(e) => setVoterAddress(e.target.value)}
        />
        <button onClick={registerVoter}>Register</button>
      </div>

      {/* Cast Vote */}
      <div>
        <h2>Cast Vote</h2>
        <input
          type="text"
          placeholder="Voter Address"
          value={voterAddressVote}
          onChange={(e) => setVoterAddressVote(e.target.value)}
        />
        <input
          type="number"
          placeholder="Vote Option"
          value={voteOption}
          onChange={(e) => setVoteOption(e.target.value)}
        />
        <button onClick={castVote}>Cast Vote</button>
      </div>

      {/* Get Results */}
      <div>
        <h2>Get Results</h2>
        <button onClick={getResults}>Fetch Results</button>
        <pre>{JSON.stringify(results, null, 2)}</pre>
      </div>

      {/* Admin Logout */}
      <div>
        <h2>Admin Logout</h2>
        <button onClick={adminLogout}>Logout</button>
      </div>
    </div>
  );
}

export default App;