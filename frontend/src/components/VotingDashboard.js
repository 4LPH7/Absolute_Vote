import React from 'react';
import { Chart } from 'chart.js';

function VotingDashboard() {
  const handleVote = () => {
    // Logic for casting vote
    alert('You have cast your vote successfully!');
  };

  return (
    <div>
      <h2>Vote Now</h2>
      <p>Select your option and cast your vote!</p>
      <button onClick={handleVote}>Cast Vote</button>
      <div>
        <canvas id="resultsChart"></canvas>
      </div>
    </div>
  );
}

export default VotingDashboard;