import React from 'react';

function Login() {
  const handleLogin = () => {
    // Logic for admin login
    alert('Logged in as admin!');
  };

  return (
    <div>
      <h2>Admin Login</h2>
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}

export default Login;