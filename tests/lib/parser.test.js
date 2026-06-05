import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSsdpMessage, parseMaxAge } from '../../lib/parser.js';

test('SSDP Parser - should correctly parse valid M-SEARCH responses', () => {
  const rawResponse =
    'HTTP/1.1 200 OK\r\n' +
    'CACHE-CONTROL: max-age=1200\r\n' +
    'LOCATION: http://192.168.1.100\r\n' +
    'USN: uuid:1234::upnp:rootdevice\r\n' +
    '\r\n';

  const result = parseSsdpMessage(rawResponse);

  assert.ok(result);
  assert.equal(result.type, 'HTTP/1.1 200 OK');
  assert.equal(result.headers['LOCATION'], 'http://192.168.1.100');
  assert.equal(result.headers['USN'], 'uuid:1234::upnp:rootdevice');
});

test('SSDP Parser - should extract max-age safely', () => {
  assert.equal(parseMaxAge('max-age=3600'), 3600);
  assert.equal(parseMaxAge('MAX-AGE = 900'), 900);
  assert.equal(parseMaxAge(null), 1800); // fallback
});
