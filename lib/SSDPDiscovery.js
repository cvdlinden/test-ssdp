/**
 * @fileoverview SSDP Discovery Module voor Node.js 22/24 LTS (CommonJS).
 * Deze module biedt hardware-gecentreerde apparaatdetectie door unieke LOCATION URL's
 * te gebruiken en UPnP XML-metadata om te zetten naar gestructureerde JSON.
 * 
 * @version 1.2.0
 * @author Jouw Project Team
 * @license MIT
 */

const dgram = require('node:dgram');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { XMLParser } = require('fast-xml-parser');

/**
 * Professionele logging via de 'debug' module.
 * Activeer met: DEBUG=lib:ssdp node app.js
 */
const log = require('debug')('lib:ssdp');

/**
 * SSDPDiscovery Class.
 * Een krachtige, zero-dependency client voor het ontdekken van netwerkapparaten.
 * Verstuurt M-SEARCH queries over alle actieve netwerkinterfaces.
 * 
 * @extends {EventEmitter}
 */
class SSDPDiscovery extends EventEmitter {
    /**
     * Maak een SSDPDiscovery instantie aan.
     * @param {Object} [options={}] - Configuratieopties.
     * @param {number} [options.scanDuration=10000] - Duur van de scan in milliseconden.
     * @param {string[]} [options.targets=['ssdp:all', 'upnp:rootdevice']] - SSDP Search Targets (ST).
     */
    constructor(options = {}) {
        super();
        this.scanDuration = options.scanDuration || 10000;
        this.targets = options.targets || ['ssdp:all', 'upnp:rootdevice'];

        /** @type {Map<string, Object>} Interne database om apparaten per LOCATION te unificeren. */
        this.deviceRegistry = new Map();

        /** @type {Array<import('node:dgram').Socket>} Actieve UDP sockets per interface. */
        this.sockets = [];

        /** @type {boolean} Statusvlag om actieve scans te beheren. */
        this.scanning = false;

        /** @private */
        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            parseAttributeValue: true,
            trimValues: true,
            processEntities: false // Beveiliging: Voorkom XXE-aanvallen.
        });
    }

    /**
     * Parseert rauwe SSDP response headers naar een object met hoofdletters als keys.
     * @param {Buffer} rawBuffer - Inkomende UDP packet buffer.
     * @returns {Object} Genormaliseerde headers.
     * @private
     */
    _parseSSDP(rawBuffer) {
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

    /**
     * Haalt de XML Device Description Document (DDD) op en parseert deze naar JSON.
     * Maakt gebruik van de native Node.js fetch (v22/v24).
     * @param {string} url - De LOCATION URL verkregen via SSDP.
     * @returns {Promise<Object|null>} Geparseerde metadata of null bij fouten.
     * @private
     */
    async _fetchDeviceDescription(url) {
        log('Metadata aanvraag voor: %s', url);
        try {
            // Gebruik AbortSignal.timeout voor robuuste netwerk-timeouts (2026 standaard).
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const xml = await response.text();
            const fullJson = this.xmlParser.parse(xml);

            // Navigeer naar de standaard UDA device node binnen de root.
            return fullJson.root?.device || fullJson.device || fullJson;
        } catch (err) {
            log('Metadata fetch mislukt voor %s: %s', url, err.message);
            return null;
        }
    }

    /**
     * Start de discovery sessie op alle actieve IPv4 interfaces.
     * Maakt voor elke interface een socket aan om routeringsproblemen te voorkomen.
     * @fires SSDPDiscovery#device-found
     */
    start() {
        if (this.scanning) this.stop();
        this.scanning = true;
        this.deviceRegistry.clear();
        log('Starten van SSDP discovery sessie...');

        const interfaces = Object.values(os.networkInterfaces())
            .flat()
            .filter(iface => iface.family === 'IPv4' && !iface.internal);

        interfaces.forEach(iface => {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            this.sockets.push(socket);

            socket.on('message', async (msg, rinfo) => {
                const headers = this._parseSSDP(msg);
                const location = headers.LOCATION;

                // Uniek op basis van LOCATION: Één fysiek apparaat = één record.
                if (!location || this.deviceRegistry.has(location)) return;

                // Synchrone 'lock' om te voorkomen dat meerdere interfaces dezelfde fetch starten.
                this.deviceRegistry.set(location, { status: 'fetching' });
                log('Nieuw apparaat gevonden op %s (via %s)', rinfo.address, iface.address);

                const deviceData = await this._fetchDeviceDescription(location);

                // Stop de verwerking als de scan in de tussentijd is beëindigd.
                if (!this.scanning) return;

                const deviceRecord = {
                    id: deviceData?.UDN || location,
                    location: location,
                    friendlyName: deviceData?.friendlyName || 'Unknown Device',
                    ip: rinfo.address,
                    interface: iface.address,
                    lastSeen: new Date().toISOString(),
                    ssdp: headers,
                    device: deviceData,
                    status: 'done'
                };

                this.deviceRegistry.set(location, deviceRecord);

                /**
                 * Event afgevuurd wanneer een uniek apparaat is gevonden en verwerkt.
                 * @event SSDPDiscovery#device-found
                 * @type {Object}
                 */
                this.emit('device-found', deviceRecord);
            });

            socket.bind(0, iface.address, () => {
                try {
                    socket.addMembership('239.255.255.250', iface.address);
                    socket.setMulticastInterface(iface.address);

                    this.targets.forEach(target => {
                        const query = Buffer.from(
                            `M-SEARCH * HTTP/1.1\r\n` +
                            `HOST: 239.255.255.250:1900\r\n` +
                            `MAN: "ssdp:discover"\r\n` +
                            `MX: 3\r\n` +
                            `ST: ${target}\r\n` +
                            `\r\n`
                        );
                        socket.send(query, 1900, '239.255.255.250');
                    });
                } catch (e) {
                    log('Socket fout op interface %s: %s', iface.address, e.message);
                }
            });
        });

        // Beëindig de scan automatisch na de ingestelde tijdsduur.
        setTimeout(() => this.stop(), this.scanDuration);
    }

    /**
     * Beëindigt de discovery sessie, sluit alle sockets en sorteert de resultaten.
     * @fires SSDPDiscovery#scan-complete
     */
    stop() {
        if (!this.scanning) return;
        this.scanning = false;
        log('Beëindigen van discovery en sluiten van sockets...');

        this.sockets.forEach(s => {
            try {
                s.close();
            } catch {
                // Opzettelijk genegeerd voor ESLint compliance.
            }
        });
        this.sockets = [];

        const results = Array.from(this.deviceRegistry.values())
            .filter(d => d.status === 'done')
            .sort((a, b) => (a.friendlyName || '').localeCompare(b.friendlyName || ''));

        /**
         * Event afgevuurd wanneer de scan volledig is afgerond.
         * @event SSDPDiscovery#scan-complete
         * @type {Array<Object>} Alfabetisch gesorteerde lijst van gevonden apparaten.
         */
        this.emit('scan-complete', results);
    }
}

module.exports = SSDPDiscovery;
