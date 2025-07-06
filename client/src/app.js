import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function HomePage() {
  return <h2>Welcome to Fantasy Baseball Assistant</h2>;
}

function App() {s
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* More routes will go here */}
      </Routes>
    </Router>
  );
}

export default App;
