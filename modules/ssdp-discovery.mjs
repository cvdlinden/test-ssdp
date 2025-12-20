/**
 * SSDP discovery module
 *
 * Provides `startDiscovery()` which begins SSDP discovery and returns an
 * EventEmitter that emits the following events:
 *
 * - `device` (object): emitted when a device is discovered. Object shape:
 *   {
 *     friendlyName: string,
 *     deviceInfo: { location: string, manufacturer: string },
 *     extendedInfo: { deviceType, friendlyName, ssidName, uuid }
 *   }
 * - `error` (Error): emitted on parse / network errors.
 *
 * Usage (CommonJS hosts can use dynamic `import()`):
 *
 * const discovery = (await import('./modules/ssdp-discovery.mjs')).startDiscovery();
 * discovery.on('device', (d) => console.log('device', d));
 *
 * Notes:
 * - This module uses ES module syntax. The host can import it dynamically
 *   from a CommonJS file (as `app.js` does) which avoids changing the host
 *   to full ESM.
 * - The module intentionally keeps the discovery behaviour minimal and
 *   emits parsed device objects for the host to index or deduplicate.
 */

import http from 'http';
import { EventEmitter } from 'events';
import pkg from 'node-ssdp';
import xml2js from 'xml2js';

const { Client: SSDP } = pkg;

/**
 * Start SSDP discovery and return an EventEmitter.
 * @returns {import('events').EventEmitter}
 */
export function startDiscovery() {
  const emitter = new EventEmitter();

  // Create the SSDP client and immediately kick off a search.
  const ssdpClient = new SSDP({ explicitSocketBind: true });
  ssdpClient.search('ssdp:all');

  // On each SSDP response, fetch the device description XML, parse it
  // and emit a normalized `device` object. Any errors are re-emitted to
  // the host via the `error` event.
  ssdpClient.on('response', (resp) => {
    http
      .get(resp.LOCATION, (response) => {
        let completeResponse = '';
        response.on('data', (chunk) => {
          completeResponse += chunk;
        });
        response.on('end', () => {
          xml2js.parseString(completeResponse, (err, parsed) => {
            if (err) {
              emitter.emit('error', err);
              return;
            }
            try {
              const temp = parsed.root.device[0];
              const deviceInfo = {
                location: resp.LOCATION,
                manufacturer: temp.manufacturer ? temp.manufacturer[0] : '',
              };
              const extendedInfo = {
                deviceType: temp.deviceType ? temp.deviceType[0] : '',
                friendlyName: temp.friendlyName ? temp.friendlyName[0] : '',
                ssidName: temp.ssidName ? temp.ssidName[0] : '',
                uuid: temp.uuid ? temp.uuid[0] : '',
              };
              const friendlyName = extendedInfo.friendlyName || '';

              emitter.emit('device', {
                friendlyName,
                deviceInfo,
                extendedInfo,
              });
            } catch (e) {
              emitter.emit('error', e);
            }
          });
        });
      })
      .on('error', (e) => {
        emitter.emit('error', e);
      });
  });

  return emitter;
}

export default startDiscovery;
