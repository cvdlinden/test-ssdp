/**
 * @file store.test.js
 * @description Test suite for the store module, ensuring proper saving and retrieval of device profiles in the in-memory database.
 * @fileoverview Test suite for the store module, ensuring proper saving and retrieval of device profiles in the in-memory database.
 * 
 * This test validates that the store module correctly manages device profiles, allowing for saving new devices, checking for their existence, and retrieving them as needed. The tests cover both individual device retrieval and fetching all stored devices as a list.
 * To run this test, use the command:
 * 
 * node --test tests/lib/store.test.js
 * 
 * Note: This test focuses on the logic of the store module and does not require any external dependencies or network interactions. It ensures that the in-memory database behaves as expected when managing device profiles, including proper handling of timestamps and data integrity.
 * 
 */

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
