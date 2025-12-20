const upnp = require('node-upnp-utils');

(async () => {
	// Start the discovery process
	await upnp.startDiscovery();

	// Wait for 10 seconds
	await upnp.wait(10000);

	// Stop the discovery process
	await upnp.stopDiscovery();

	// Get and show the discovered devices (services)
	const device_list = upnp.getActiveDeviceList();
	for (const device of device_list) {
		console.log('------------------------------------');
		console.log(' * ' + device['address']);
		if (device['description']) {
			console.log(' * ' + device['description']['device']['manufacturer']);
			console.log(' * ' + device['description']['device']['modelName']);
		}
		console.log(' * ' + device['headers']['LOCATION']);
		console.log(' * ' + device['headers']['USN']);
	}
})();