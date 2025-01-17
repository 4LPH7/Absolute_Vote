import React from 'react';

function AdminPanel() {
  const startVoting = () => {
    // Logic for starting voting session
    alert('Voting session started!');
  };

  return (
    <div>
      <h2>Admin Panel</h2>
      <p>Manage voters, set options, start/end voting sessions.</p>
      <button onClick={startVoting}>Start Voting</button>
    </div>
  );
}

export default AdminPanel;