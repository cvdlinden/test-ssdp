const dgram = require('node:dgram');
const os = require('node:os');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
            ignoreAttributes: false,
            parseAttributeValue: true,
            trimValues: true,
            processEntities: false // Beveiliging: Voorkom XXE-aanvallen.
        });

function parseSSDP(rawBuffer) {
    const headers = {};
    const lines = rawBuffer.toString().split('\r\n');
    for (let i = 1; i < lines.length; i++) {
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex !== -1) {
            const key = lines[i].slice(0, colonIndex).trim().toUpperCase();
            const value = lines[i].slice(colonIndex + 1).trim();
            headers[key] = value;
        }
    }
    return headers;
}

async function fetchDeviceMetadata(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const xml = await response.text();
        const fullJson = parser.parse(xml);
        
        // UPnP XML structuren kunnen variëren, we zoeken de 'device' node
        const deviceData = fullJson.root?.device || fullJson.device || fullJson;
        
        return {
            friendlyName: deviceData?.friendlyName || 'Unknown Device',
            model: deviceData?.modelName || 'Generic UPnP',
            udn: deviceData?.UDN || null,
            fullDetails: deviceData // We bewaren alles voor de diepe inspectie
        };
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
        return { friendlyName: 'Metadata Timeout', model: 'N/A', fullDetails: {} };
    }
}

async function startDiscovery(targets = ['ssdp:all'], durationMs = 10000) {
    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;
    const deviceRegistry = new Map();

    const interfaces = Object.values(os.networkInterfaces())
        .flat()
        .filter(iface => iface.family === 'IPv4' && !iface.internal);

    const scanPromises = interfaces.map(iface => {
        return new Promise((resolve) => {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

            socket.on('message', async (msg, rinfo) => {
                const headers = parseSSDP(msg);
                const location = headers.LOCATION;
                
                if (!location || deviceRegistry.has(location)) return;

                // Lock het device direct om dubbele fetches te voorkomen
                deviceRegistry.set(location, { status: 'fetching' });

                const metadata = await fetchDeviceMetadata(location);

                const deviceRecord = {
                    id: metadata.udn || location,
                    location: location,
                    friendlyName: metadata.friendlyName,
                    model: metadata.model,
                    ip: rinfo.address,
                    interface: iface.address,
                    lastSeen: new Date().toISOString(),
                    ssdp: headers,
                    device: metadata.fullDetails, // De complete XML dump
                    status: 'done'
                };

                deviceRegistry.set(location, deviceRecord);
            });

            socket.on('error', () => resolve());

            socket.bind(0, iface.address, () => {
                try {
                    socket.addMembership(SSDP_ADDR, iface.address);
                    socket.setMulticastInterface(iface.address);

                    targets.forEach(target => {
                        const query = Buffer.from(
                            `M-SEARCH * HTTP/1.1\r\n` +
                            `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
                            `MAN: "ssdp:discover"\r\n` +
                            `MX: 3\r\n` +
                            `ST: ${target}\r\n` +
                            `\r\n`
                        );
                        socket.send(query, SSDP_PORT, SSDP_ADDR);
                    });
                // eslint-disable-next-line no-unused-vars
                } catch (e) { /* empty */ }
            });

            setTimeout(() => {
                socket.close();
                resolve();
            }, durationMs);
        });
    });

    await Promise.all(scanPromises);
    
    return Array.from(deviceRegistry.values())
        .filter(d => d.status === 'done');
}

module.exports = { startDiscovery };
