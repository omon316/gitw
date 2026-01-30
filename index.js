const express = require('express');
const path = require('path');
const cors = require('cors'); // Prevents connection errors
const app = express();

app.use(cors());
app.use(express.json());

// 1. Serve static files from a 'public' folder
// (Move MunsterNet.html and its CSS/JS into a folder named 'public')
app.use(express.static(path.join(__dirname, 'public')));

// 2. Fallback: Always serve the main HTML file for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'MunsterNet.html'));
});

// Use Render's dynamically assigned port, or 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
