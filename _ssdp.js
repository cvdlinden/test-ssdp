const SSDP = require('node-ssdp').Client
    , ssdpClient = new SSDP({explicitSocketBind: true});
const http = require("http");
const xml2js = require("xml2js");
const UPNP = require("upnp-device-client");

var upnpClient = undefined;

ssdpClient.on("response", (resp, code, rinfo) => {
    // Is this a MediaRenderer?
    if (resp.ST.indexOf("urn:schemas-upnp-org:device:MediaRenderer") >= 0) {
        console.log("Renderer found at:", resp.LOCATION)
        // console.log(JSON.stringify(resp, null, '  '));
        // console.log(JSON.stringify(code, null, '  '));
        // console.log(JSON.stringify(rinfo, null, '  '));

        // Check the device properties
        const deviceInfo = http
            .get(resp.LOCATION, function (response) {
                // console.log("Render info", response);
                var responseCache = "";
                response.on("data", function (chunk) {
                    responseCache += chunk;
                });
                response.on("end", function () {
                    const metaReq = xml2js.parseString(
                        responseCache,
                        (err, result) => {
                            if (err) {
                                throw err;
                            }
                            var device = result.root.device[0];

                            // Check UPNP info, if Wiim
                            if (device.manufacturer[0].indexOf("Linkplay") >= 0) {
                                // console.dir(device);
                                console.log("- friendlyName: " + device.friendlyName[0]);
                                console.log("- manufacturer: " + device.manufacturer[0]);
                                console.log("- modelName: " + device.modelName[0]);
                                // console.dir(device.serviceList[0].service);
                                upnpClient = new UPNP(resp.LOCATION);
                                upnpClient.callAction(
                                    "AVTransport",
                                    "GetInfoEx",
                                    { InstanceID: 0 },
                                    (err, result) => {
                                        // if (err) throw err;
                                        console.dir(result);
                                    }
                                );
                            }
                            else {
                                console.log("- friendlyName: " + device.friendlyName[0]);
                                console.log("- manufacturer: " + device.manufacturer[0]);
                                console.log("- Not a Wiim device!")
                            }

                        });
                });
            })
            .on("error", function (e) {
                console.log("problem with request: " + e.message);
            });
    }
})

// Scan for everything
ssdpClient.search('ssdp:all')

// Wait a bit for results to come in...
console.log("Scanning...")
setTimeout(function () {
    console.log('Done!');
}, 5000);
