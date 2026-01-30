const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());

// Statische Dateien bereitstellen
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Pfad zur Datenbank im Hauptverzeichnis
const dbPath = path.join(__dirname, 'db.json');

// Funktion zum sicheren Lesen der db.json
const getDatabase = () => {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Fehler beim Lesen der db.json:", err);
    }
    return []; // Falls Datei nicht existiert oder leer ist
};

// --- API ROUTEN ---

// Ghost in the Wire: Datenbank abrufen
app.get('/api/db', (req, res) => {
    const db = getDatabase();
    res.json(db);
});

// Ghost in the Wire: Analysten abrufen
app.get('/api/analysts', (req, res) => {
    res.json([]); 
});

// MunsterNET: Registrierung (schreibt in die db.json)
app.post('/api/munsternet/register', (req, res) => {
    const profiles = getDatabase();
    const newProfile = req.body;
    profiles.push(newProfile);
    
    try {
        fs.writeFileSync(dbPath, JSON.stringify(profiles, null, 2));
        res.status(201).json({ message: "Erfolgreich in db.json gespeichert" });
    } catch (err) {
        res.status(500).json({ error: "Speichern fehlgeschlagen" });
    }
});

// MunsterNET: Login
app.post('/api/munsternet/login', (req, res) => {
    const profiles = getDatabase();
    const { username, password } = req.body;
    const user = profiles.find(p => p.username === username);
    res.json({ success: !!user, user });
});

// Startseite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
