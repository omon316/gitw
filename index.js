const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// Statische Dateien aus dem Hauptverzeichnis und dem Ordner 'public' servieren
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Datenbank-Variablen
let database = []; 
let analysts = [];

// --- API ROUTEN (Müssen VOR app.listen stehen) ---

app.get('/api/db', (req, res) => {
    res.json(database);
});

app.get('/api/analysts', (req, res) => {
    res.json(analysts);
});

// Startseite
app.get('/', (req, res) => {
    // Prüfe, ob index.html im Hauptordner oder in 'public' liegt
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- SERVER START ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
