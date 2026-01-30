const express = require('express');
const path = require('path');
const app = express();

// 1. Erlaubt Express, Dateien direkt aus dem Hauptverzeichnis UND 'public' zu laden
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); 

// 2. Explizite Routen festlegen (Groß-/Kleinschreibung beachten!)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/MunsterNet.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'MunsterNet.html'));
});

app.get('/wire.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'wire.html'));
});

// 3. Port-Bindung für Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
