import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startSsdpDiscovery, stopSsdpDiscovery } from './lib/socket.js';
import { parseDeviceDescription, parseServiceDescription } from './lib/parser.js';
import * as store from './lib/store.js';

// ESM environment workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);

// Serve static frontend assets from the public directory
app.use(express.static(join(__dirname, 'public')));

// Middleware to parse incoming JSON payloads (useful for Column 4 SOAP executions)
app.use(express.json());

/** 
 * Tracks active client SSE HTTP response streams.
 * @type {Set<import('express').Response>} 
 */
const sseClients = new Set();

/**
 * Broadcasts a structured event payload to all open frontend connections.
 * 
 * @param {string} eventName - Type of operation (e.g., 'device-added').
 * @param {Object} data - Clean JSON serializeable data object.
 */
function broadcastToFrontend(eventName, data) {
    const formattedMessage = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        client.write(formattedMessage);
    }
}

// Basic API endpoint to confirm server is running and provide metadata
app.get('/api', (req, res) => {
    res.json({
        message: "Welcome to the UPnP Explorer API",
        version: "1.3.0",
        endpoints: {
            events: "GET /api/events (Server-Sent Events)",
            devices: "GET /api/devices",
            serviceSchema: "GET /api/services/schema?location={location}&scpdUrl={scpdUrl}",
            executeAction: "POST /api/services/execute",
            discover: "POST /api/discover",
            status: "GET /api/status"
        }
    });
});

// REST API to fetch a snapshot of current memory
app.get('/api/devices', (req, res) => {
    res.json(store.getAllDevices());
});

// API endpoint to fetch and parse a specific service's actions (Column 3)
app.get('/api/services/schema', async (req, res) => {
    const { location, scpdUrl } = req.query;

    if (!location || !scpdUrl) {
        return res.status(400).json({ error: 'Missing required query parameters: location and scpdUrl' });
    }

    try {
        // Resolve the relative SCPDURL against the base location URL of the device
        const baseUrl = new URL(location);
        const absoluteScpdUrl = new URL(scpdUrl, baseUrl).href;

        console.log(`\x1b[34m[HTTP Fetch]\x1b[0m Downloading SCPD contract from: ${absoluteScpdUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(absoluteScpdUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Device responded with HTTP ${response.status}`);

        const xmlText = await response.text();
        const parsedService = parseServiceDescription(xmlText);

        if (!parsedService) throw new Error('Invalid SCPD layout structure.');

        res.json(parsedService);
    } catch (err) {
        console.error(`\x1b[31m[Proxy Failed]\x1b[0m Could not retrieve service contract:`, err.message);
        res.status(500).json({ error: 'Failed to retrieve or parse the device service contract', details: err.message });
    }
});


// Real-time Event stream endpoint (Server-Sent Events)
app.get('/api/events', (req, res) => {
    // Set explicit headers to keep the HTTP pipeline raw and streaming
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Send an initial heartbeat/ping to seal the pipeline connection
    res.write('event: connected\ndata: {"status":"streaming"}\n\n');
    sseClients.add(res);

    // Clean up when the user closes their browser window tab
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// REST API to trigger a new active network scan (Column 1 refresh)
app.post('/api/discover', (req, res) => {
    console.log('\x1b[33m[Server]\x1b[0m Manual rediscovery requested. Clearing cache...');

    // 1. Clear the central device store so we can discover everything freshly
    store.clearDevices();

    // 2. Restart the multi-interface discovery network sockets
    startSsdpDiscovery(handleSsdpDevice);

    res.json({ status: 'scan_triggered' });
});

/**
 * Health check and API status endpoint
 */
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', protocol: 'SSDP/UPnP' });
});

// Central async engine to handle discovered hardware profiles
const handleSsdpDevice = async (location, headers, rinfo, interfaceIp) => {
    // If we are already tracking or fetching this location, skip it
    if (store.hasDevice(location)) return;

    // Set an early lock to prevent duplicate fetches across interfaces
    store.saveDevice(location, { friendlyName: 'Fetching description...', status: 'fetching', location: location });
    // console.log(store.getAllDevices());
    console.log(`\x1b[34m[HTTP Fetch]\x1b[0m Downloading descriptor: ${location}`);

    try {
        // Native Node v24 fetch with a 4-second timeout abort signal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(location, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP status ${response.status}`);

        const xmlText = await response.text();
        const deviceData = parseDeviceDescription(xmlText);

        if (!deviceData) {
            throw new Error('XML descriptor did not contain a valid UPnP root structure.');
        }

        const deviceRecord = {
            id: deviceData.udn || location,
            location,
            ip: rinfo.address,
            interface: interfaceIp,
            friendlyName: deviceData.friendlyName,
            manufacturer: deviceData.manufacturer,
            modelName: deviceData.modelName,
            deviceType: deviceData.deviceType,
            services: deviceData.services,
            status: 'done'
        };

        // Commit completely parsed model schema to our state store
        store.saveDevice(location, deviceRecord);

        console.log(`\x1b[32m[Device Ready]\x1b[0m Successfully mapped: \x1b[1m${deviceRecord.friendlyName}\x1b[0m (${deviceRecord.services.length} services found)`);

        // PUSH DATA LIVE: Tell the frontend that Column 1 needs an item added!
        broadcastToFrontend('device-added', deviceRecord);

    } catch (err) {
        console.error(`\x1b[31m[Device Failed]\x1b[0m Lost device metadata tracking for ${location}:`, err.message);
        // Remove from store so a re-scan can try fetching again
        // store.deleteDevice(location); // Optional wrapper
    }
};

// Start the HTTP Server
server.listen(PORT, () => {
    console.log(`\x1b[32m[Server]\x1b[0m Dashboard is live at http://localhost:${PORT}`);

    // Start the proven multi-interface discovery strategy
    startSsdpDiscovery(handleSsdpDevice);
});

/**
 * Gracefully shuts down the application by releasing network resources
 */
const shutdown = () => {
    console.log('\n\x1b[33m[Server]\x1b[0m Shutting down application...');

    // Stop SSDP discovery and clear the device registry
    stopSsdpDiscovery();
    //store.clearDevices();

    server.close(() => {
        console.log('\x1b[32m[Server]\x1b[0m HTTP server closed successfully.');
        process.exit(0);
    });
};

// Catch process termination signals for clean exit
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
