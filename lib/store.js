/**
 * @fileoverview In-memory storage and state machine for discovered UPnP devices.
 * Handles deduplication, lifecycle management, and metadata structure tracking.
 * 
 * @module store
 * 
 * Responsibilities:
 * - saveDevice: Adds or updates a device record in the registry.
 * - hasDevice: Checks if a device location is already known.
 * - getDevice: Retrieves a single device record by location.
 * - getAllDevices: Returns an array of all currently registered devices.
 * - clearDevices: Empties the entire registry, typically used during shutdown or reset.
 * 
 * Design Principles:
 * - Centralized State Management: All device records are stored in a single Map for efficient access and mutation.
 * - Location-Based Indexing: Devices are indexed by their unique LOCATION URL to ensure quick lookups and prevent duplicates.
 * - Structured Metadata: Each device record contains standardized fields extracted from the device description, making it easy to serve to the frontend or use in further processing.
 * - Lifecycle Awareness: The store is designed to be aware of the device lifecycle, allowing for updates and cleanups as devices come and go.
 * - Performance: Using a Map allows for O(1) complexity for lookups, additions, and deletions, ensuring the store remains performant even as the number of devices grows.
 * - Extensibility: The store can be easily extended in the future to include additional metadata fields or support more complex querying without major refactoring.
 * 
 * Example Usage:
 * 
 * import { saveDevice, hasDevice, getDevice, getAllDevices, clearDevices } from './store.js';
 * 
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
