/**
 * @fileoverview In-memory storage and state machine for discovered UPnP devices.
 * Handles deduplication, lifecycle management, and metadata structure tracking.
 */

/** 
 * Central registry tracking active devices by their unique location URL or UDN.
 * @type {Map<string, Object>} 
 */
const deviceRegistry = new Map();

/**
 * Saves or updates a fully processed device record within the registry.
 * 
 * @param {string} location - The unique SSDP LOCATION URL.
 * @param {Object} deviceRecord - The structured device metadata object.
 */
export function saveDevice(location, deviceRecord) {
    deviceRegistry.set(location, {
        ...deviceRecord,
        updatedAt: new Date().toISOString()
    });
}

/**
 * Checks if a location is currently registered or undergoing an active operation.
 * 
 * @param {string} location - The unique SSDP LOCATION URL.
 * @returns {boolean} True if the location is known.
 */
export function hasDevice(location) {
    return deviceRegistry.has(location);
}

/**
 * Retrieves a single device record from the registry.
 * 
 * @param {string} location - The unique SSDP LOCATION URL.
 * @returns {Object|undefined} The device record or undefined if not found.
 */
export function getDevice(location) {
    return deviceRegistry.get(location);
}

/**
 * Returns all currently registered devices as a clean array.
 * Perfect for serving initial states to the frontend.
 * 
 * @returns {Object[]} Array of active device records.
 */
export function getAllDevices() {
    return Array.from(deviceRegistry.values());
}

/**
 * Clears out all entries from the active registry.
 */
export function clearDevices() {
    deviceRegistry.clear();
}
