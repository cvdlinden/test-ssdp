import dgram from 'node:dgram';
import os from 'node:os';

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SCAN_DURATION = 10000;
const deviceRegistry = new Map();

// Best Practice 2026: Multiple targets to catch non-compliant hardware
const SEARCH_TARGETS = ['ssdp:all', 'upnp:rootdevice'];

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
        return {
            friendlyName: xml.match(/<friendlyName>(.*?)<\/friendlyName>/)?.[1] || 'Unknown Device',
            model: xml.match(/<modelName>(.*?)<\/modelName>/)?.[1] || 'Generic UPnP'
        };
    } catch {
        return { friendlyName: 'Metadata Timeout', model: 'N/A' };
    }
}

const interfaces = Object.values(os.networkInterfaces())
    .flat()
    .filter(iface => iface.family === 'IPv4' && !iface.internal);

interfaces.forEach(iface => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('message', async (msg, rinfo) => {
        const headers = parseSSDP(msg);
        
        // Use LOCATION as primary unique key if USN is missing, 
        // common in non-compliant 2026 IoT devices.
        const id = headers.USN || headers.LOCATION;
        if (!id || deviceRegistry.has(id)) return;
        
        deviceRegistry.set(id, { status: 'fetching' });

        let metadata = {};
        if (headers.LOCATION) {
            metadata = await fetchDeviceMetadata(headers.LOCATION);
        }

        deviceRegistry.set(id, {
            ip: rinfo.address,
            st: headers.ST,
            location: headers.LOCATION,
            ...metadata,
            status: 'done'
        });
        console.log(`[Device Found] ${metadata.friendlyName} (${rinfo.address})`);
    });

    socket.bind(0, iface.address, () => {
        try {
            socket.addMembership(SSDP_ADDR, iface.address);
            socket.setMulticastInterface(iface.address);

            // Send multiple M-SEARCH queries to ensure all device types respond
            SEARCH_TARGETS.forEach(target => {
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
        } catch (e) {
            console.error(`Interface error ${iface.address}: ${e.message}`);
        }
    });

    setTimeout(() => socket.close(), SCAN_DURATION);
});

setTimeout(() => {
    console.log('\n--- Hybrid Discovery Results ---');
    const finalDevices = Array.from(deviceRegistry.values()).filter(d => d.status === 'done');
    console.table(finalDevices, ['friendlyName', 'model', 'ip', 'st']);
}, SCAN_DURATION + 500);
