const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// Statische Dateien aus dem Hauptverzeichnis und dem Ordner 'public' bereitstellen
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Datenbank-Variablen (Platzhalter)
let database = []; 
let analysts = [];

// --- API ROUTEN ---

// Route für die Datenbank (behebt 404 in wire.html)
app.get('/api/db', (req, res) => {
    res.json(database);
});

// Route für die Analysten (behebt 404 in wire.html)
app.get('/api/analysts', (req, res) => {
    res.json(analysts);
});

// Hauptseite (Landingpage)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- SERVER START ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
