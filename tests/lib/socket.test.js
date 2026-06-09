/**
 * @file socket.test.js
 * @description Test suite for the socket module, ensuring proper initialization and cleanup of network pipelines.
 * @fileoverview Test suite for the socket module, ensuring proper initialization and cleanup of network pipelines.
 * 
 * This test validates that the socket module correctly sets up and tears down network resources when starting and stopping SSDP discovery.
 * The test mocks the dgram module to simulate network interactions without requiring actual network access, allowing us to verify that the correct methods are called and resources are managed properly.
 * To run this test, use the command:
 * 
 * node --test tests/lib/socket.test.js
 * 
 * Note: This test focuses on the interaction with the dgram module and does not require any real network communication. It ensures that the socket module's logic for managing network resources is sound and that it correctly handles the lifecycle of its network pipelines.
 * 
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { startSsdpDiscovery, stopSsdpDiscovery } from '../../lib/socket.js';

test('Socket Module - should initialize and spin up network pipelines cleanly', () => {
  // Mock the native dgram.createSocket method completely
  const mockSocket = {
    on: mock.fn(),
    bind: mock.fn((port, addr, cb) => cb?.()), // simulate successful bound sequence callback
    addMembership: mock.fn(),
    setMulticastInterface: mock.fn(),
    send: mock.fn((buf, offset, len, port, addr, cb) => cb?.(null)),
    close: mock.fn()
  };

  // Intercept Node's socket creation process
  mock.method(dgram, 'createSocket', () => mockSocket);

  // Define a dummy callback for discovery events
  const dummyCallback = mock.fn();

  // Execute the target routine
  startSsdpDiscovery(dummyCallback);

  // Assertions: verify the system interacted correctly with the network APIs
  assert.ok(dgram.createSocket.mock.calls.length > 0, 'Should attempt to create at least one dgram socket pipeline');
  assert.ok(mockSocket.on.mock.calls.length > 0, 'Should attach message/error listeners to the network stream');

  // Perform clean up phase teardown invocation 
  stopSsdpDiscovery();
  assert.ok(mockSocket.close.mock.calls.length > 0, 'Should trigger close on all running sockets during cleanup');
  
  // Restore global network mocks
  mock.restoreAll();
});
