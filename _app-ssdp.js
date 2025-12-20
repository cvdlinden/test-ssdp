var Client = require('node-ssdp').Client
    , client = new Client({ explicitSocketBind: true });


let counter = 0;

client.on('response', function (headers, statusCode, rinfo) {
    counter++;
    console.log(counter, 'Response to an m-search.', rinfo.address, headers.ST);
    console.log("  ", headers.LOCATION);
});

// search for a service type
// client.search('urn:schemas-upnp-org:service:ContentDirectory:1');

// Or get a list of all services on the network
client.search('ssdp:all');

// Wait a bit for results to come in...
console.log("Scanning...")
setTimeout(function () {
    console.log('Done!');
}, 5000);
