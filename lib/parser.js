/**
 * Stateless utility module for parsing SSDP network packets and UPnP schemas.
 */
import { XMLParser } from 'fast-xml-parser';

// Initialize a reusable, strict XML Parser instance
const xmlParser = new XMLParser({
  ignoreAttributes: false, // We need attributes because UPnP sometimes puts IDs inside them
  trimValues: true
});

/**
 * Parses a raw SSDP HTTPU message (from an M-SEARCH response or NOTIFY broadcast).
 * 
 * @param {Buffer|string} rawData - The raw UDP socket payload.
 * @returns {null|{ type: string, headers: Object.<string, string> }} Parsed message or null if invalid.
 */
export function parseSsdpMessage(rawData) {
  if (!rawData) return null;

  const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
  const lines = text.split(/\r?\n/);

  // The first line contains the HTTPU status/method (e.g., "HTTP/1.1 200 OK" or "NOTIFY * HTTP/1.1")
  const firstLine = lines[0]?.trim();
  if (!firstLine) return null;

  const headers = {};

  // Loop through lines to parse headers
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim().toUpperCase();
    const value = line.slice(colonIndex + 1).trim();

    headers[key] = value;
  }

  return {
    type: firstLine,
    headers
  };
}

/**
 * Extracts the max-age value from a standard Cache-Control header string.
 * @example "max-age=1800" -> 1800
 * 
 * @param {string} cacheControlHeader - The raw CACHE-CONTROL header value.
 * @returns {number} The lifetime in seconds, or a default of 1800 if parsing fails.
 */
export function parseMaxAge(cacheControlHeader) {
  if (!cacheControlHeader) return 1800;

  const match = cacheControlHeader.match(/max-age\s*=\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 1800;
}

/**
 * Parses a raw UPnP XML Root Device Description sheet into a flattened JSON structure.
 * 
 * @param {string} xmlText - The raw XML text fetched from the device location.
 * @returns {Object|null} Clean metadata object or null if parsing fails.
 */
export function parseDeviceDescription(xmlText) {
  if (!xmlText) return null;

  try {
    const rawObj = xmlParser.parse(xmlText);

    // UPnP Device schema wraps everything inside a root <root> tag, followed by a <device>
    const rootDevice = rawObj?.root?.device;
    if (!rootDevice) return null;

    // Standardize the service list format into an array (fast-xml-parser outputs an object if there is only 1 service)
    let services = [];
    const rawServices = rootDevice.serviceList?.service;

    if (rawServices) {
      services = Array.isArray(rawServices) ? rawServices : [rawServices];
    }

    // Clean up service paths to ensure they map back neatly for Columns 2 & 3
    const processedServices = services.map(srv => ({
      serviceType: srv.serviceType,
      serviceId: srv.serviceId,
      SCPDURL: srv.SCPDURL,
      controlURL: srv.controlURL,
      eventSubURL: srv.eventSubURL
    }));

    return {
      friendlyName: rootDevice.friendlyName || 'Unknown UPnP Device',
      manufacturer: rootDevice.manufacturer || 'Generic Manufacturer',
      modelName: rootDevice.modelName || 'Generic Model',
      deviceType: rootDevice.deviceType,
      udn: rootDevice.UDN,
      services: processedServices
    };
  } catch (err) {
    console.error(`\x1b[31m[XML Parser Error]\x1b[0m Failed parsing UPnP device schema:`, err.message);
    return null;
  }
}