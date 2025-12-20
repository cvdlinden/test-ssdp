import http from 'http';
import { EventEmitter } from 'events';
import pkg from 'node-ssdp';
import xml2js from 'xml2js';

const { Client: SSDP } = pkg;

export function startDiscovery() {
  const emitter = new EventEmitter();

  const ssdpClient = new SSDP({ explicitSocketBind: true });

  ssdpClient.search('ssdp:all');

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
