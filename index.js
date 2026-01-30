const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Datenbank-Variable (wird im echten Betrieb meist aus einer JSON-Datei geladen)
let database = []; 
let analysts = [];

// ROUTE: Abruf der Datenbank
app.get('/api/db', (req, res) => {
    res.json(database);
});

// ROUTE: Abruf der Analysten (behebt deinen Fehler in Zeile 2928)
app.get('/api/analysts', (req, res) => {
    res.json(analysts);
});

// Startseite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
    // Behebt die 404 Fehler in der Konsole von wire.html
app.get('/api/db', (req, res) => {
    res.json([]); // Sendet ein leeres Array als Platzhalter
});

app.get('/api/analysts', (req, res) => {
    res.json([]); // Behebt den Fehler beim Laden der Analysten
});
