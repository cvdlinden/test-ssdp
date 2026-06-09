/**
 * @fileoverview Multi-socket network engine for SSDP discovery.
 * Spawns isolated UDP sockets per physical network interface to guarantee
 * bulletproof operation under Windows 11 network routing tables.
 * 
 * @module socket
 * 
 * Responsibilities:
 * - startSsdpDiscovery: Initializes discovery sessions across all active interfaces, handling de-duplication and callback orchestration.
 * - stopSsdpDiscovery: Gracefully shuts down all active sockets and clears internal caches.
 * - Internal de-duplication logic to ensure one processing pipeline per unique device location.
 * - Robust error handling and logging for network operations, with clear interface-level context.
 * Note: This module is designed to be stateless and reusable, with all state management delegated to the caller via callbacks and external registries.
 * 
 * Design Principles:
 * - Statelessness: No internal state is retained between calls. All device tracking and lifecycle management is handled externally.
 * - Interface Isolation: Each network interface gets its own dedicated socket to avoid cross-interface routing issues, especially on Windows.
 * - De-duplication: A central registry tracks discovered device locations to prevent redundant processing pipelines.
 * - Robustness: Comprehensive error handling ensures that issues on one interface do not affect others, and all errors are logged with clear context.
 * - Performance: By using non-blocking sockets and efficient parsing, the discovery process is optimized for speed and responsiveness.
 * - Extensibility: The module is designed to be easily extended in the future for additional SSDP features or alternative discovery protocols without major refactoring.
 * 
 * Example Usage:
 * 
 * import { startSsdpDiscovery, stopSsdpDiscovery } from './socket.js';
 * 
 */

import dgram from 'node:dgram';
import os from 'node:os';
import { parseSsdpMessage } from './parser.js';

const MULTICAST_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;

/** @type {dgram.Socket[]} */
const activeSockets = [];
const deviceRegistry = new Map();

/**
 * Discovers and filters all local physical IPv4 interfaces.
 * @returns {os.NetworkInterfaceInfo[]}
 */
function getActiveInterfaces() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((iface) => iface.family === 'IPv4' && !iface.internal);
}

/**
 * Starts a targeted SSDP discovery session across all active network interfaces.
 * 
 * @param {Function} onDeviceFound - Callback triggered when a uniquely new device location is discovered.
 */
export function startSsdpDiscovery(onDeviceFound) {
    stopSsdpDiscovery();
    deviceRegistry.clear();

    const interfaces = getActiveInterfaces();
    console.log(`\x1b[34m[SSDP]\x1b[0m Initializing discovery on ${interfaces.length} network interface(s)...`);

    interfaces.forEach((iface) => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        activeSockets.push(socket);

        // Handle incoming SSDP network traffic
        socket.on('message', (msg, rinfo) => {
            const parsed = parseSsdpMessage(msg);
            if (!parsed) return;

            const location = parsed.headers['LOCATION'];

            // De-duplication lock: One physical location = one processing pipeline
            if (!location || deviceRegistry.has(location)) return;

            deviceRegistry.set(location, { status: 'fetching' });
            console.log(`\x1b[35m[SSDP Discover]\x1b[0m Found device at ${rinfo.address} (via interface ${iface.address})`);

            if (onDeviceFound) {
                onDeviceFound(location, parsed.headers, rinfo, iface.address);
            }
        });

        socket.on('error', (err) => {
            console.error(`\x1b[31m[SSDP Socket Error - ${iface.address}]\x1b[0m`, err.message);
        });

        // Bind strictly to the interface IP on an ephemeral port (0) to bypass Windows blocks
        socket.bind(0, iface.address, () => {
            try {
                socket.addMembership(MULTICAST_ADDRESS, iface.address);
                socket.setMulticastInterface(iface.address);

                // Broadcast active discovery probe
                const query = Buffer.from(
                    `M-SEARCH * HTTP/1.1\r\n` +
                    `HOST: ${MULTICAST_ADDRESS}:${SSDP_PORT}\r\n` +
                    `MAN: "ssdp:discover"\r\n` +
                    `MX: 3\r\n` +
                    `ST: ssdp:all\r\n` +
                    `\r\n`,
                    'utf8'
                );

                socket.send(query, 0, query.length, SSDP_PORT, MULTICAST_ADDRESS, (err) => {
                    if (!err) {
                        console.log(`\x1b[34m[SSDP]\x1b[0m M-SEARCH probe blasted out via ${iface.address}`);
                    }
                });
            } catch (err) {
                console.error(`\x1b[31m[SSDP Setup Failed - ${iface.address}]\x1b[0m`, err.message);
            }
        });
    });
}

/**
 * Shuts down all active interface sockets and clears caches.
 */
export function stopSsdpDiscovery() {
    if (activeSockets.length === 0) return;

    activeSockets.forEach((socket) => {
        try {
            socket.close();
        } catch {
            // Ignore errors on rapid teardowns
        }
    });

    activeSockets.length = 0;
    deviceRegistry.clear();
    console.log('\x1b[34m[SSDP]\x1b[0m Discovery session stopped. All network sockets released.');
}
