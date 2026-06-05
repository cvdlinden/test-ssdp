/**
 * SSDP functionality module (Modern dgram replacement for node-ssdp).
 * REPLACEMENT FOR ssdp.js???
 * @module
 */

// Importeer je nieuwe discovery module
const { startDiscovery } = require('./ssdp-discovery'); // Pas het pad aan indien nodig
const upnp = require("./upnpClient.js"); 
const log = require("debug")("lib:ssdp");

/**
 * Scant voor devices en vult de meegegeven deviceList.
 * @param {Array} deviceList - De array die gevuld moet worden met gevonden devices.
 * @param {Object} serverSettings - Server configuratie.
 */
const scan = async (deviceList, serverSettings) => {
    log("Scanning for devices with native SSDP discovery...");

    // Reset de huidige lijst conform de oude werking
    deviceList.length = 0;

    // Definieer de zoekdoelen (je kunt hier 'ssdp:all' toevoegen voor meer resultaten)
    const targets = [
        "urn:schemas-upnp-org:service:AVTransport:1",
        "urn:schemas-upnp-org:device:MediaRenderer:1"
    ];

    try {
        // Start de discovery (bijv. 5 of 10 seconden)
        const foundDevices = await startDiscovery(targets, 7000);

        for (const device of foundDevices) {
            // Check of het device in de tussentijd al is toegevoegd (omdat startDiscovery 
            // intern al ontdubbelt op USN, is dit extra veiligheid)
            if (!deviceList.some(d => d.location === device.location)) {
                log("New device found! Processing details for: %s", device.location);
                
                // Roep je bestaande upnpClient aan om de device description te verwerken
                // Let op: we geven 'device' mee als het response object (respSSDP)
                upnp.getDeviceDescription(deviceList, serverSettings, device);
            }
        }
        
        log("Scan voltooid. Aantal devices gevonden: %d", deviceList.length);
    } catch (err) {
        log("Fout tijdens SSDP scan: %O", err);
    }
};

module.exports = {
    scan
};
