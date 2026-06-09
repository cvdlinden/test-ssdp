/**
 * @fileoverview Stateless utility module for parsing SSDP network packets and UPnP schemas.
 * @module parser
 * 
 * Responsibilities:
 * - parseSsdpMessage: Converts raw UDP payloads into structured header objects.
 * - parseDeviceDescription: Transforms UPnP device XML into clean JSON metadata.
 * - parseServiceDescription: Extracts action and variable schemas from SCPD XML files.
 * - parseSoapResponse: Converts raw SOAP XML responses into actionable JSON objects.
 * 
 * Design Principles:
 * - Statelessness: Pure functions that take input and return output without side effects.
 * - Robustness: Graceful handling of malformed inputs with clear error logging.
 * - Performance: Efficient parsing using the fast-xml-parser library, optimized for typical UPnP schemas.
 * - Extensibility: Designed to be easily extended for additional parsing needs or alternative protocols in the future.
 * 
 * Example Usage:
 * 
 * import { parseSsdpMessage, parseDeviceDescription } from './parser.js';
 * 
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

/**
 * Parses a UPnP SCPD (Service Control Protocol Description) XML file into a structured JSON contract.
 * Extracts all available actions, their arguments, and maps them to their respective state variable data types.
 * 
 * @param {string} xmlText - The raw SCPD XML content fetched from the device.
 * @returns {Object|null} Structured schema object containing actions and variables, or null if parsing fails.
 */
export function parseServiceDescription(xmlText) {
  if (!xmlText) return null;

  try {
    const rawObj = xmlParser.parse(xmlText);

    // 1. Parse State Variables (Data Types & Allowed Values)
    const stateVarsMap = new Map();
    const rawStateVars = rawObj?.scpd?.serviceStateTable?.stateVariable;
    if (rawStateVars) {
      const stateVars = Array.isArray(rawStateVars) ? rawStateVars : [rawStateVars];
      stateVars.forEach(v => {
        const name = v['@_name'] || v.name; // Handle potential attribute vs element variations
        let allowed = null;
        if (v.allowedValueList?.allowedValue) {
          allowed = Array.isArray(v.allowedValueList.allowedValue)
            ? v.allowedValueList.allowedValue
            : [v.allowedValueList.allowedValue];
        }
        stateVarsMap.set(name, {
          dataType: v.dataType,
          allowedValues: allowed
        });
      });
    }

    // 2. Parse Actions and enrich arguments with data type info
    const actionList = rawObj?.scpd?.actionList?.action;
    if (!actionList) return { actions: [], stateVariables: Object.fromEntries(stateVarsMap) };

    const actions = Array.isArray(actionList) ? actionList : [actionList];
    const processedActions = actions.map(act => {
      let args = [];
      const rawArgs = act.argumentList?.argument;

      if (rawArgs) {
        const normalizedArgs = Array.isArray(rawArgs) ? rawArgs : [rawArgs];
        args = normalizedArgs.map(arg => {
          const varMeta = stateVarsMap.get(arg.relatedStateVariable) || {};
          return {
            name: arg.name,
            direction: arg.direction, // "in" or "out"
            relatedStateVariable: arg.relatedStateVariable,
            dataType: varMeta.dataType || 'string',
            allowedValues: varMeta.allowedValues || null
          };
        });
      }

      return {
        name: act.name,
        arguments: args
      };
    });

    return {
      actions: processedActions,
      stateVariables: Object.fromEntries(stateVarsMap)
    };
  } catch (err) {
    console.error(`\x1b[31m[SCPD Parser Error]\x1b[0m Failed to parse service schema:`, err.message);
    return null;
  }
}

/**
 * Parses a raw UPnP SOAP XML action response into a clean JSON object.
 * Handles both successful responses and UPnP SOAP Fault errors.
 * 
 * @param {string} xmlText - The raw XML SOAP response from the device.
 * @param {string} actionName - The name of the action that was executed.
 * @returns {Object} Clean key-value pairs of the returned output arguments.
 */
export function parseSoapResponse(xmlText, actionName) {
  if (!xmlText) return { error: 'Empty response received from device.' };

  try {
    const rawObj = xmlParser.parse(xmlText);

    // SOAP responses wrap content in an Envelope, then a Body tag
    const body = rawObj?.['s:Envelope']?.['s:Body'] || rawObj?.Envelope?.Body;
    if (!body) return { raw: rawObj };

    // Find the response tag (e.g., <u:GetVolumeResponse>) ignoring namespaces
    const responseKey = Object.keys(body).find(key => key.endsWith(`${actionName}Response`));

    if (!responseKey) {
      // Check if it is a SOAP Fault (Error response from the hardware)
      if (body.Fault || body['s:Fault']) {
        const fault = body.Fault || body['s:Fault'];
        return {
          error: 'UPnP SOAP Fault',
          code: fault.detail?.UPnPError?.errorCode || fault.faultcode,
          description: fault.detail?.UPnPError?.errorDescription || fault.faultstring
        };
      }
      return { message: 'Action executed successfully, no output parameters returned.' };
    }

    return body[responseKey];
  } catch (err) {
    console.error(`\x1b[31m[SOAP Parser Error]\x1b[0m Failed to parse action response:`, err.message);
    return { error: 'Failed to parse XML response', details: err.message };
  }
}
