const { startDiscovery } = require('./lib/ssdp-discovery');

async function main() {
  console.log('Zoeken naar AVTransport devices en root devices...');

  const myTargets = [
    'ssdp:all',
    'upnp:rootdevice',
    'urn:schemas-upnp-org:service:AVTransport:1'
  ];

  const devices = await startDiscovery(myTargets, 3000);

  console.log(`Gevonden: ${devices.length} apparaten.`);
  devices.forEach((d, i) => {
    console.log(`Device ${i + 1}: ${d.friendlyName} (${d.ip}) - ${d.model}`);
    console.log(`  Location: ${d.location}`);
    console.log(`  SL: ${d.device.serviceList}`);
    console.log(`  S: ${d.device.serviceList.service}`);
    console.log(`  S: ${Object.keys(d.device.serviceList.service)}`);
    // // Object.keys(d.device.serviceList).forEach(s => {
    //   // console.log(`  Service: ${s} (${d.device.serviceList[s].serviceType})`);
    //   // console.log(`    serviceId: ${d.device.serviceList[s].serviceId}`);
    //   // console.log(`    SCPDURL: ${d.device.serviceList[s].SCPDURL}`);
    //   Object.keys(d.device.serviceList.service).forEach(s => {
    //     console.log(`  Service: ${s} (${d.device.serviceList.service[s].serviceType})`);
    //     // console.log(`      ${service}: ${d.device.serviceList[s][service]}`);
    //     // console.log(d.device.serviceList[s][service]);
    //   //   // console.log(`    ${s}: ${d.device.serviceList[s]}`);
    //   //   // console.log(`    Service: ${service.serviceId} (${service.serviceType})`);
    //   //   // console.log(`      SCPDURL: ${service.SCPDURL}`);
    //   //   // console.log(`      ${Object.keys(service)}`);
    //   });
    //   // console.log(`    ${s}: ${d.device.serviceList[s]}`);
    //   // console.log(`      SCPDURL: ${s.SCPDURL}`);
    //   // console.log(`      ${Object.keys(s)}`);
    // // });
  });
  // console.log(devices);
}

main().catch(console.error);
