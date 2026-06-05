import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../lib/store.js';

// Reset the in-memory database store before every single test run
beforeEach(() => {
  store.clearDevices();
});

test('Store Module - should successfully save and retrieve a device profile', () => {
  const sampleLocation = 'http://192.168.1';
  const mockDevice = {
    id: 'uuid:1234',
    friendlyName: 'Smart Test Speaker',
    status: 'done'
  };

  store.saveDevice(sampleLocation, mockDevice);

  assert.equal(store.hasDevice(sampleLocation), true);
  
  const fetched = store.getDevice(sampleLocation);
  assert.equal(fetched.friendlyName, 'Smart Test Speaker');
  assert.ok(fetched.updatedAt, 'Expected an updatedAt ISO timestamp string to be generated');
});

test('Store Module - should return all saved items as a clean array flat list', () => {
  store.saveDevice('loc1', { friendlyName: 'Device 1' });
  store.saveDevice('loc2', { friendlyName: 'Device 2' });

  const allDevices = store.getAllDevices();
  assert.equal(allDevices.length, 2);
  assert.equal(allDevices[0].friendlyName, 'Device 1');
});
