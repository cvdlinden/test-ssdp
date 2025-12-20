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
const https = require("https");
const SSDP = require("node-ssdp").Client;
const UPNP = require("upnp-device-client");

const path = require("path");
const xml2js = require("xml2js");
const cheerio = require("cheerio");
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

let xml = "";
let devices = {};
let devicesByLocation = [];
let selectedDevice = undefined;
var upnpClient = undefined;

// ==================== pulling upnp devices ====================
(async () => {
  try {
    const mod = await import('./modules/ssdp-discovery.mjs');
    const startDiscovery = mod.startDiscovery || mod.default;
    const discovery = startDiscovery();

    discovery.on('device', (d) => {
      const key = d.friendlyName || (d.extendedInfo && d.extendedInfo.friendlyName) || '';
      devices[key] = {
        ...(d.extendedInfo || {}),
        ...(d.deviceInfo || {}),
      };
      devicesByLocation.push(d.deviceInfo || {});
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

const trackSource = (spotify, trackSource) => {
  // Spotify specific signature
  if (spotify === "1") {
    return "spotify";
  }

  // BubbleUPnP clients
  if (selectedDevice.manufacturer.indexOf("Bubblesoft") >= 0) {
    return "upnpserver";
  }

  // Other track source based on WiiM Mini Specific properties
  if (trackSource) {
    return trackSource.toLowerCase();
  }

  return "upnpserver";
};

// ==================== upnpClient ====================
io.on("connection", (socket) => {

  socket.on("devices", () => {
    let result = [];
    for (const key in devices) {
      result.push(devices[key]);
    }
    console.log("socket:devices:", result);
    socket.emit("devices", result);
  });

  socket.on("services", (deviceUdn) => {
    if (selectedDevice) {
      upnpClient = new UPNP(selectedDevice.location);
      upnpClient.getServices((err, services) => {
        if (err) throw err;
        let serviceList = [];
        for (const serviceId in services) {
          serviceList.push({
            serviceId: serviceId,
            serviceType: services[serviceId].serviceType,
          });
        }
        console.log("socket:services:", serviceList);
        socket.emit("services", serviceList);
      });
    } else {
      console.log("socket:services: no device selected");
    }
  });

  socket.on("actions", (actions) => {
    if (upnpClient) {
      if (actions === "status") {
        upnpClient.callAction(
          "AVTransport",
          "GetTransportInfo",
          { InstanceID: 0 },
          (err, result) => {
            if (err) throw err;
            console.log("socket:actions: status -", result.CurrentTransportState);
            socket.emit("actions", result.CurrentTransportState);
          }
        );
      }
    }
    if (["Play", "Next", "Prev", "Pause"].includes(actions)) {
      let options = { InstanceID: 0 };

      if (actions === "Play") options.Speed = 1;

      console.log("socket:actions", actions);
      upnpClient.callAction("AVTransport", actions, options, (err, result) => {
        if (err) throw err;
      });
    }
    socket.emit('actions', "ACTIONS");
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
