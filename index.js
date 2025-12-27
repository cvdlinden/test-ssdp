/**
 * index.js
 *
 * Entry point for the test-ssdp demo web server.
 *
 * Responsibilities:
 * - Start an Express HTTP server serving the UI from `/public`.
 * - Start SSDP device discovery via a separate ESM module
 *   (`./modules/ssdp-discovery.mjs`) which emits `device` events.
 * - Expose a small Socket.IO interface used by the UI to request
 *   discovered devices, services and control actions.
 *
 * Run:
 *   node index.js
 *
 * Notes:
 * - The project mixes CommonJS (this file) and a small ESM discovery
 *   module. Discovery is imported dynamically to avoid converting the
 *   whole app to ESM.
 * - The server listens on port 8080 by default; change `webServer.listen`
 *   call below to use a different port.
 * - Dependencies: express, socket.io, node-ssdp, xml2js, upnp-device-client
 *
 * Events / public API (Socket.IO):
 * - `devices` -> emits array of discovered devices
 * - `services` -> emits list of services for the selected device
 * - `actions`  -> send control actions (Play/Pause/etc.)
 */

const express = require("express");
const app = express();
const http = require("http");
// const https = require("https");
const SSDP = require("node-ssdp").Client;
// const UPNP = require("upnp-device-client");

// const path = require("path");
// const xml2js = require("xml2js");
// const cheerio = require("cheerio");
const bodyParser = require("body-parser");

const webServer = http.createServer(app);
var io = require("socket.io")(webServer, {
  cors: {
    origin: "*",
  },
});
const ssdpClient = new SSDP({ explicitSocketBind: true });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// let xml = "";
let devices = {};
// let devicesByLocation = [];
let selectedDevice = undefined;
// var upnpClient = undefined;

// ==================== pulling upnp devices ====================
(async () => {
  try {
    const mod = await import('./modules/ssdp-discovery.mjs');
    const startDiscovery = mod.startDiscovery || mod.default;
    const discovery = startDiscovery();

    discovery.on('device', (d) => {
      // console.log('Discovered device:', d);
      // devices.push(d);
      const key = d.ssdp.LOCATION
      // const key = d.friendlyName || (d.extendedInfo && d.extendedInfo.friendlyName) || '';
      devices[key] = {
        ...d,
        //   ...(d.extendedInfo || {}),
        //   ...(d.deviceInfo || {}),
      };
      // devicesByLocation.push(d.deviceInfo || {});
    });

    discovery.on('error', (err) => {
      console.error('SSDP discovery error:', err);
    });
  } catch (e) {
    console.error('Failed to load ssdp-discovery module:', e);
  }
})();

// ==================== hosting UI ====================
app.use(express.static(__dirname + "/public"));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// ==================== upnpClient ====================
io.on("connection", (socket) => {

  // On discover request, trigger SSDP search
  // Then after a delay, emit the current list of devices
  socket.on("discover", () => {
    ssdpClient.search("ssdp:all");
    console.log("socket:discover: SSDP search triggered");
    setTimeout(() => {
      let result = [];
      for (const key in devices) {
        result.push(devices[key]);
      }
      sortDevices(result);
      // console.log("socket:discover: emitting devices", result);
      socket.emit("devices", result);
    }, 5000); // 5s delay for responses
  });

  // On devices request, emit the current list of discovered devices
  socket.on("devices", () => {
    let result = [];
    for (const key in devices) {
      result.push(devices[key]);
    }
    sortDevices(result);
    // console.log("socket:devices:", result);
    socket.emit("devices", result);
  });

  // On services request, emit the services for the selected device
  socket.on("services", (msg) => {
    console.log("socket:services: requested for deviceUdn", msg);
    // Grab from the devices list with matching UDN
    selectedDevice = null;
    for (const key in devices) {
      const d = devices[key];
      const udn = d.device && d.device.UDN ? d.device.UDN[0] : null;
      if (udn === msg) {
        selectedDevice = d;
        break;
      }
    }
    // console.log("socket:services: selectedDevice", selectedDevice.device.serviceList[0]);
    socket.emit("services", selectedDevice.device.serviceList[0]);
    // if (selectedDevice) {
    //   upnpClient = new UPNP(selectedDevice.ssdp.location);
    //   upnpClient.getServices((err, services) => {
    //     if (err) throw err;
    //     let serviceList = [];
    //     for (const serviceId in services) {
    //       serviceList.push({
    //         serviceId: serviceId,
    //         serviceType: services[serviceId].serviceType,
    //       });
    //     }
    //     console.log("socket:services:", serviceList);
    //     socket.emit("services", serviceList);
    //   });
    // } else {
    //   console.log("socket:services: no device selected");
    // }
  });

  // On actions request, emit the list of actions for the selected service
  socket.on("actions", (msg) => {
    console.log("socket:actions: requested action", msg);
    // Grab the device based on the msg.deviceUdn
    selectedDevice = null;
    for (const key in devices) {
      const d = devices[key];
      const udn = d.device && d.device.UDN ? d.device.UDN[0] : null;
      if (udn === msg.deviceUdn) {
        selectedDevice = d;
        break;
      }
    }
    // console.log("socket:actions: selectedDevice", selectedDevice);
    // Grab the SCPD URL from the selected service
    let scpdUrl = null;
    if (selectedDevice) {
      const services = selectedDevice.device.serviceList[0].service || [];
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const serviceId = service.serviceId ? service.serviceId[0] : null;
        if (serviceId === msg.serviceId) {
          scpdUrl = service.SCPDURL ? service.SCPDURL[0] : null;
          break;
        }
      }
    }
    console.log("socket:actions: SCPD URL", scpdUrl);

    // Construct the ip and SCPD URL for upnp-device-client
    if (selectedDevice && scpdUrl) {
      const locationUrl = new URL(selectedDevice.ssdp.LOCATION);
      const baseUrl = locationUrl.origin;
      const fullScpdUrl = new URL(scpdUrl, baseUrl).href;
      console.log("socket:actions: full SCPD URL", fullScpdUrl);
      http
        .get(fullScpdUrl, (response) => {
          let completeResponse = '';
          response.on('data', (chunk) => {
            completeResponse += chunk;
          });
          response.on('end', () => {
            // Parse the SCPD XML to extract actions
            // xml2js.parseString(completeResponse, (err, parsed) => {
            //   if (err) {
            //     console.error('Failed to parse SCPD XML:', err);
            //     socket.emit("actions", { error: 'Failed to parse SCPD XML' });
            //     return;
            //   }
            //   const actionList = parsed.scpd.actionList[0].action || [];
            //   let actions = actionList.map(a => a.name[0]);
            console.log("socket:actions: available actions", completeResponse);
            socket.emit("actions", completeResponse);
            // });
          });
        })
        .on('error', (e) => {
          console.error('Failed to fetch SCPD URL:', e);
          socket.emit("actions", { error: 'Failed to fetch SCPD URL' });
        });
    }
  });

  // socket.on("disconnect", () => {
  //     console.log("user disconnected");
  // });

});

webServer.listen(8080, () => {
  console.log(
    "Web Server started at http://localhost:%s",
    webServer.address().port
  );
});

// Sort devices by friendly name
function sortDevices(result) {
  result.sort((a, b) => {
    const nameA = (a.device && a.device.friendlyName) ? a.device.friendlyName[0].toUpperCase() : '';
    const nameB = (b.device && b.device.friendlyName) ? b.device.friendlyName[0].toUpperCase() : '';
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}

