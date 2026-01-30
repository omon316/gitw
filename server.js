const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const port = 3004; // Sticking to the new port to avoid conflicts
const DB_PATH = path.join(__dirname, 'database.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const LOG_PATH = path.join(__dirname, 'server_debug.log');
const BACKUPS_PATH = path.join(__dirname, 'backups');

// Backups-Verzeichnis erstellen falls nicht vorhanden
(async () => {
    try {
        await fs.mkdir(BACKUPS_PATH, { recursive: true });
    } catch (e) {}
})();

// --- Debug Logging ---
async function logDebug(message) {
    const timestamp = new Date().toISOString();
    try {
        await fs.appendFile(LOG_PATH, `${timestamp}: ${message}\n`);
    } catch (err) {
        console.error("Failed to write to debug log:", err);
    }
}

// --- DB File Lock ---
let dbLock = false;
const withLock = async (fn, operationName) => {
    logDebug(`Lock requested for: ${operationName}`);
    while (dbLock) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait if locked
    }
    dbLock = true;
    logDebug(`Lock ACQUIRED for: ${operationName}`);
    try {
        return await fn();
    } finally {
        dbLock = false;
        logDebug(`Lock RELEASED for: ${operationName}`);
    }
};

// --- Utility Functions ---
async function readDB() {
    return await withLock(async () => {
        logDebug("readDB: Starting read operation.");
        try {
            const fileContent = await fs.readFile(DB_PATH, 'utf8');
            let data = JSON.parse(fileContent);

            if (Array.isArray(data)) {
                data = { profiles: data, chats: {} };
            }
            logDebug("readDB: Read and parse successful.");
            return data;
        } catch (error) {
            logDebug(`readDB: ERROR - ${error.message}`);
            if (error.code === 'ENOENT') {
                return { profiles: [], chats: {} };
            }
            throw error;
        }
    }, 'readDB');
}

async function writeDB(data) {
    return await withLock(async () => {
        logDebug("writeDB: Starting write operation.");
        try {
            await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
            logDebug("writeDB: Write successful.");
        } catch (error) {
            logDebug(`writeDB: ERROR - ${error.message}`);
            throw error;
        }
    }, 'writeDB');
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Auth Endpoints ---
// ... (These remain the same)
app.post('/api/register', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ message: 'Username is required' });
        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (users.find(u => u.username === username)) return res.status(409).json({ message: 'Username already exists' });
        users.push({ username });
        await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });
        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const user = users.find(u => u.username === username);
        if (!user || password !== 'Munster123') return res.status(401).json({ message: 'Invalid credentials' });
        res.status(200).json({ message: 'Login successful' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// --- MunsterNet User Auth Endpoints ---
app.post('/api/munsternet/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const db = await readDB();
        const newId = db.profiles.reduce((maxId, p) => Math.max(p.id, maxId), 0) + 1;

        const newUserProfile = {
            id: newId,
            name: username,
            type: 'citizen',
            isAnalyst: true,
            loginUsername: username, // Login-Username bleibt immer gleich
            settings: { isPrivate: false },
            info: {
                city: "",
                ethnicity: "",
                job: "",
                company: "",
                risk: 'low',
                club: '',
                languages: "",
                rel: "",
                dob: "",
                phone: ""
            },
            friends: [],
            posts: [],
            gallery: []
        };
        db.profiles.push(newUserProfile);

        // Wire-Log: Benutzer registriert
        if (db.profiles[0] && db.profiles[0].systemData) {
            if (!db.profiles[0].systemData.logs) db.profiles[0].systemData.logs = [];
            db.profiles[0].systemData.logs.unshift({
                time: new Date().toLocaleTimeString(),
                type: 'SYSTEM',
                msg: `Benutzer "${username}" hat sich in MunsterNET registriert (Profil-ID: ${newId})`
            });
        }

        users.push({ username, password, profileId: newId });

        await writeDB(db);
        await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));

        res.status(201).json({ message: 'User registered successfully', profileId: newId });
    } catch (error) {
        console.error('Error during MunsterNet registration:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

app.post('/api/munsternet/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

        if (user && user.profileId) {
            // Wire-Log: Analyst eingeloggt
            const db = await readDB();
            const profile = db.profiles.find(p => p.id === user.profileId);
            if (db.profiles[0] && db.profiles[0].systemData) {
                if (!db.profiles[0].systemData.logs) db.profiles[0].systemData.logs = [];
                db.profiles[0].systemData.logs.unshift({
                    time: new Date().toLocaleTimeString(),
                    type: 'SYSTEM',
                    msg: `Analyst "${user.username}" hat sich in MunsterNET eingeloggt (Profil: ${profile ? profile.name : 'ID:' + user.profileId})`
                });
                await writeDB(db);
            }
            res.status(200).json({ message: 'Login successful', profileId: user.profileId, username: user.username });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Error during MunsterNet login:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// --- MunsterNet Logout with Logging ---
app.post('/api/munsternet/logout', async (req, res) => {
    try {
        const { profileId, username } = req.body;

        // Wire-Log: Analyst ausgeloggt
        const db = await readDB();
        const profile = db.profiles.find(p => p.id === profileId);
        if (db.profiles[0] && db.profiles[0].systemData) {
            if (!db.profiles[0].systemData.logs) db.profiles[0].systemData.logs = [];
            db.profiles[0].systemData.logs.unshift({
                time: new Date().toLocaleTimeString(),
                type: 'SYSTEM',
                msg: `Analyst "${username || 'Unbekannt'}" hat sich aus MunsterNET ausgeloggt (Profil: ${profile ? profile.name : 'ID:' + profileId})`
            });
            await writeDB(db);
        }
        res.status(200).json({ message: 'Logout logged' });
    } catch (error) {
        console.error('Error during MunsterNet logout:', error);
        res.status(500).json({ message: 'Server error during logout' });
    }
});

// --- MunsterNet Profile Update with Logging ---
app.post('/api/munsternet/profile-update', async (req, res) => {
    try {
        const { profileId, changes, username } = req.body;

        // Wire-Log: Profiländerungen
        const db = await readDB();
        const profile = db.profiles.find(p => p.id === profileId);
        if (db.profiles[0] && db.profiles[0].systemData && changes && changes.length > 0) {
            if (!db.profiles[0].systemData.logs) db.profiles[0].systemData.logs = [];
            db.profiles[0].systemData.logs.unshift({
                time: new Date().toLocaleTimeString(),
                type: 'EDIT',
                msg: `Analyst "${username || 'Unbekannt'}" (Profil: ${profile ? profile.name : 'ID:' + profileId}) hat Profil geändert: ${changes.join(', ')}`
            });
            await writeDB(db);
        }
        res.status(200).json({ message: 'Profile update logged' });
    } catch (error) {
        console.error('Error logging profile update:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Analyst Account Management Endpoints ---
app.get('/api/analysts', async (req, res) => {
    try {
        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        // Return users without passwords for security
        const safeUsers = users.map(u => ({
            username: u.username,
            profileId: u.profileId
        }));
        res.json(safeUsers);
    } catch (error) {
        console.error('Error fetching analysts:', error);
        res.status(500).json({ message: 'Error fetching analysts' });
    }
});

// Detaillierte Benutzerinformationen inkl. Passwort (nur für Admin)
app.get('/api/analysts/:username/details', async (req, res) => {
    try {
        const { username } = req.params;
        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            username: user.username,
            password: user.password,
            profileId: user.profileId
        });
    } catch (error) {
        console.error('Error fetching analyst details:', error);
        res.status(500).json({ message: 'Error fetching analyst details' });
    }
});

// Benutzer-Aktivität loggen
app.post('/api/activity/log', async (req, res) => {
    try {
        const { profileId, action, details } = req.body;

        const db = await readDB();
        const profile = db.profiles.find(p => p.id === profileId);

        if (profile) {
            if (!profile.activityLog) profile.activityLog = [];
            profile.activityLog.push({
                timestamp: new Date().toISOString(),
                action: action,
                details: details
            });

            // Max 500 Einträge pro Benutzer behalten
            if (profile.activityLog.length > 500) {
                profile.activityLog = profile.activityLog.slice(-500);
            }

            await writeDB(db);
        }

        res.status(200).json({ message: 'Activity logged' });
    } catch (error) {
        console.error('Error logging activity:', error);
        res.status(500).json({ message: 'Error logging activity' });
    }
});

app.delete('/api/analysts/:username', async (req, res) => {
    try {
        const { username } = req.params;
        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        const deletedUser = users.splice(userIndex, 1)[0];
        await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));

        res.json({ message: 'User deleted', profileId: deletedUser.profileId });
    } catch (error) {
        console.error('Error deleting analyst:', error);
        res.status(500).json({ message: 'Error deleting analyst' });
    }
});

app.post('/api/analysts', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        let users = [];
        try {
            const usersData = await fs.readFile(USERS_PATH, 'utf8');
            if (usersData) users = JSON.parse(usersData);
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const db = await readDB();
        const newId = db.profiles.reduce((maxId, p) => Math.max(p.id, maxId), 0) + 1;

        // Leeres Profil für Analysten - kann selbst ausgefüllt werden
        const newUserProfile = {
            id: newId,
            name: username,
            type: 'citizen',
            isAnalyst: true,
            loginUsername: username, // Login-Username bleibt immer gleich
            settings: { isPrivate: false },
            info: {
                city: "",
                ethnicity: "",
                job: "",
                company: "",
                risk: 'low',
                club: '',
                languages: "",
                rel: "",
                dob: "",
                phone: ""
            },
            friends: [],
            posts: [],
            gallery: []
        };
        db.profiles.push(newUserProfile);

        // Wire-Log: Analyst registriert
        if (db.profiles[0] && db.profiles[0].systemData) {
            if (!db.profiles[0].systemData.logs) db.profiles[0].systemData.logs = [];
            db.profiles[0].systemData.logs.unshift({
                time: new Date().toLocaleTimeString(),
                type: 'SYSTEM',
                msg: `Analyst "${username}" wurde in MunsterNET registriert (Profil-ID: ${newId})`
            });
        }

        users.push({ username, password, profileId: newId });

        await writeDB(db);
        await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));

        res.status(201).json({ message: 'Analyst created', profileId: newId, username });
    } catch (error) {
        console.error('Error creating analyst:', error);
        res.status(500).json({ message: 'Error creating analyst' });
    }
});

// --- DB Management Endpoints ---
app.get('/api/db/list', async (req, res) => {
    try {
        const files = await fs.readdir(__dirname);
        const jsonFiles = files.filter(file => 
            file.endsWith('.json') && 
            !['package.json', 'package-lock.json', 'users.json'].includes(file)
        );
        res.json(jsonFiles);
    } catch (error) {
        logDebug(`/api/db/list: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error listing database files' });
    }
});

app.post('/api/db/switch', async (req, res) => {
    const { filename } = req.body;
    if (!filename || !filename.endsWith('.json')) {
        return res.status(400).json({ message: 'Invalid filename' });
    }
    const newDbPath = path.join(__dirname, filename);

    try {
        await fs.copyFile(newDbPath, DB_PATH);
        logDebug(`/api/db/switch: Switched active database to ${filename}`);
        broadcastUpdate();
        res.status(200).json({ message: `Successfully switched to ${filename}` });
    } catch (error) {
        logDebug(`/api/db/switch: ERROR - ${error.message}`);
        res.status(500).json({ message: `Error switching database to ${filename}` });
    }
});

app.post('/api/db/save', async (req, res) => {
    const { filename, data } = req.body;
    if (!filename || !data) {
        return res.status(400).json({ message: 'Filename and data are required' });
    }
    const safeFilename = path.basename(filename).endsWith('.json') ? path.basename(filename) : `${path.basename(filename)}.json`;
    const savePath = path.join(__dirname, safeFilename);

    try {
        await fs.writeFile(savePath, JSON.stringify(data, null, 2));
        logDebug(`/api/db/save: Saved current state to ${safeFilename}`);
        res.status(200).json({ message: `Database saved as ${safeFilename}` });
    } catch (error) {
        logDebug(`/api/db/save: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error saving database file' });
    }
});

app.get('/api/status', (req, res) => res.status(200).json({ status: 'ok' }));

// --- Backup Management Endpoints ---

// Liste aller Backups abrufen
app.get('/api/backups', async (req, res) => {
    try {
        const files = await fs.readdir(BACKUPS_PATH);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(BACKUPS_PATH, file);
                const stats = await fs.stat(filePath);
                backups.push({
                    filename: file,
                    created: stats.mtime,
                    size: Math.round(stats.size / 1024) + ' KB'
                });
            }
        }

        // Nach Datum sortieren (neueste zuerst)
        backups.sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json(backups);
    } catch (error) {
        logDebug(`/api/backups: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error listing backups' });
    }
});

// Neues Backup erstellen
app.post('/api/backups', async (req, res) => {
    try {
        const { name } = req.body;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

        let filename;
        if (name && name.trim()) {
            // Benutzerdefinierter Name
            const safeName = name.trim().replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_');
            filename = `${safeName}_${dateStr}_${timeStr}.json`;
        } else {
            // Standard-Name
            filename = `Backup_${dateStr}_${timeStr}.json`;
        }

        const db = await readDB();
        const backupPath = path.join(BACKUPS_PATH, filename);
        await fs.writeFile(backupPath, JSON.stringify(db, null, 2));

        logDebug(`Backup created: ${filename}`);
        res.status(201).json({ message: 'Backup erstellt', filename });
    } catch (error) {
        logDebug(`/api/backups POST: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error creating backup' });
    }
});

// Backup laden (als aktive Datenbank setzen)
app.post('/api/backups/load', async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ message: 'Filename required' });
        }

        const backupPath = path.join(BACKUPS_PATH, path.basename(filename));

        // Prüfen ob Backup existiert
        try {
            await fs.access(backupPath);
        } catch {
            return res.status(404).json({ message: 'Backup not found' });
        }

        // Backup laden und als aktive DB setzen
        const backupData = await fs.readFile(backupPath, 'utf8');
        const db = JSON.parse(backupData);

        await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));

        logDebug(`Backup loaded: ${filename}`);
        broadcastUpdate(); // Alle Clients über Änderung informieren
        res.status(200).json({ message: 'Backup geladen', filename });
    } catch (error) {
        logDebug(`/api/backups/load: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error loading backup' });
    }
});

// Backup löschen
app.delete('/api/backups/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const backupPath = path.join(BACKUPS_PATH, path.basename(filename));

        await fs.unlink(backupPath);
        logDebug(`Backup deleted: ${filename}`);
        res.status(200).json({ message: 'Backup gelöscht' });
    } catch (error) {
        logDebug(`/api/backups DELETE: ERROR - ${error.message}`);
        res.status(500).json({ message: 'Error deleting backup' });
    }
});

// --- REST API for DB (for initial load) ---
app.get('/api/db', async (req, res) => {
  logDebug("/api/db: Request received.");
  try {
    const db = await readDB();
    res.json(db);
    logDebug("/api/db: Successfully sent DB content.");
  } catch (error) {
    logDebug(`/api/db: ERROR - ${error.message}`);
    res.status(500).json({ message: 'Error reading database' });
  }
});

// --- Static File Serving (No Cache) ---
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});
app.use(express.static(path.join(__dirname, '.')));
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>MunsterNet Hub</title>
    <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background-color:#1c1c1c;color:white;}.container{text-align:center;}a{display:block;background-color:#007bff;color:white;padding:15px 30px;margin:10px;text-decoration:none;border-radius:5px;font-size:18px;}a:hover{background-color:#0056b3;}</style>
    </head><body><div class="container"><h1>Willkommen</h1><a href="/MunsterNet.html">MunsterNet (User View)</a><a href="/wire.html">Ghost in the Wire (Admin View)</a></div></body></html>
  `);
});

// --- Server and WebSocket Setup ---
const server = app.listen(port, () => {
  logDebug(`Server listening on http://localhost:${port}`);
  console.log(`Server listening on http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });
const clients = new Map(); // Use a Map to store ws connections by profileId

async function broadcastUpdate() {
    logDebug("Broadcasting update to all clients.");
    try {
        const db = await readDB();
        // Include connected client IDs so Wire can distinguish players from NPCs
        const connectedClientIds = Array.from(clients.keys());
        const message = JSON.stringify({
            action: 'dbPush',
            payload: db,
            connectedClients: connectedClientIds
        });
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(message);
            }
        });
    } catch (error) {
        logDebug(`broadcastUpdate ERROR: ${error.message}`);
    }
}

function sendToClient(profileId, message) {
    const ws = clients.get(profileId);
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
    }
}

wss.on('connection', (ws) => {
    logDebug("Client connected.");
    // We don't know the profileId yet. It will be sent by the client.
    
    ws.on('close', () => {
        logDebug("Client disconnected.");
        // Remove the client from the map
        for (const [profileId, clientWs] of clients.entries()) {
            if (clientWs === ws) {
                clients.delete(profileId);
                break;
            }
        }
        console.log('Client disconnected. Total clients:', clients.size);
        // Broadcast update to all clients so Wire knows about disconnected players
        broadcastUpdate();
    });

    ws.on('message', async (message) => {
        try {
            const { action, payload } = JSON.parse(message);
            console.log(`Received action: ${action} from client.`);

            switch (action) {
                case 'identify':
                    let { profileId } = payload;
                    profileId = parseInt(profileId); // Ensure it's a number
                    if (!isNaN(profileId)) {
                        clients.set(profileId, ws);
                        console.log(`Client identified with profileId: ${profileId}. Total clients: ${clients.size}`);
                        // Broadcast update to all clients so Wire knows about connected players
                        broadcastUpdate();
                    } else {
                        console.warn(`Invalid profileId received: ${payload.profileId}`);
                    }
                    break;
                case 'syncDB':
                    console.log(`syncDB: Payload contains ${payload.profiles.length} profiles and ${Object.keys(payload.chats).length} chats.`);
                    await writeDB(payload);
                    console.log('syncDB: Database written to file. Broadcasting update.');
                    // Avoid broadcasting the whole DB. Consider sending a success message back to the client who initiated the sync.
                    // For now, we keep the broadcast for compatibility with the admin panel.
                    broadcastUpdate();
                    break;
                
                case 'sendMessage': {
                    const { fromId, toId, text } = payload;
                    const db = await readDB();
                    const timestamp = new Date().toISOString();
                    const newMessage = { fromId, toId, text, timestamp };
                    const convoId = [fromId, toId].sort((a, b) => a - b).join('--');

                    if (!db.chats[convoId]) { db.chats[convoId] = []; }
                    db.chats[convoId].push(newMessage);
                    await writeDB(db);

                    const senderIsPlayer = clients.has(fromId);
                    const recipientIsPlayer = clients.has(toId);
                    const adminClientExists = clients.has(0);

                    // --- Standard payload for direct delivery ---
                    const directPayload = { action: 'newMessage', payload: { convoId, message: newMessage } };

                    // --- Routing Logic ---
                    if (senderIsPlayer && recipientIsPlayer) {
                        // Player-to-Player: Deliver to both, mirror to admin
                        logDebug(`Player-to-Player: ${fromId} -> ${toId}`);
                        sendToClient(fromId, directPayload);
                        sendToClient(toId, directPayload);
                        if (adminClientExists) sendToClient(0, directPayload);

                    } else if (senderIsPlayer && !recipientIsPlayer) {
                        // Player-to-Fake (Simulation): Deliver to player, redirect to admin WITH flag
                        logDebug(`Player-to-Fake: ${fromId} -> ${toId}. Redirecting to Admin.`);
                        sendToClient(fromId, directPayload); // Echo to player
                        if (adminClientExists) {
                            const adminPayload = { action: 'newMessage', payload: { convoId, message: newMessage, isSimulation: true } };
                            sendToClient(0, adminPayload);
                        }
                    } else {
                        // Spielleiter-to-Player (as Fake or Admin): Deliver to player, echo to admin
                        logDebug(`Admin Action: ${fromId} -> ${toId}`);
                        sendToClient(toId, directPayload); // Deliver to player
                        if (adminClientExists) sendToClient(0, directPayload); // Echo to admin
                    }
                    break;
                }
                
                default:
                    logDebug(`WebSocket: Unknown action received: ${action}`);
                    console.warn(`Unknown action: ${action}`);
            }
        } catch (error) {
            logDebug(`WebSocket: ERROR processing message - ${error.message}`);
            console.error('Failed to process message:', error);
        }
    });
});


