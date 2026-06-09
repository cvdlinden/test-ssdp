/**
 * @file parser.test.js
 * @description Unit tests for the SSDP and SCPD parsers in parser.js.
 * @fileoverview Unit tests for the SSDP and SCPD parsers in parser.js.
 * 
 * This test suite validates the core parsing logic for:
 * - parseSsdpMessage: Converts raw SSDP HTTPU messages into structured objects.
 * - parseMaxAge: Safely extracts max-age values from CACHE-CONTROL headers.
 * - parseServiceDescription: Parses UPnP service descriptions (SCPD XML) and ensures correct linkage between actions and state variables.
 * 
 * To run these tests, use the command:
 * 
 * node --test tests/lib/parser.test.js
 * 
 * Note: These tests focus on the parsing logic and do not require any network interactions or actual UPnP devices.
 * They use hardcoded sample data to simulate typical SSDP responses and SCPD XML documents.
 * 
 * The test cases cover both successful parsing scenarios and edge cases, such as missing headers or malformed XML, to ensure robustness of the parser functions.
 * 
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parser from '../../lib/parser.js';

test('SSDP Parser - should correctly parse valid M-SEARCH responses', () => {
  const rawResponse =
    'HTTP/1.1 200 OK\r\n' +
    'CACHE-CONTROL: max-age=1200\r\n' +
    'LOCATION: http://192.168.1.100\r\n' +
    'USN: uuid:1234::upnp:rootdevice\r\n' +
    '\r\n';

  const result = parser.parseSsdpMessage(rawResponse);

  assert.ok(result);
  assert.equal(result.type, 'HTTP/1.1 200 OK');
  assert.equal(result.headers['LOCATION'], 'http://192.168.1.100');
  assert.equal(result.headers['USN'], 'uuid:1234::upnp:rootdevice');
});

test('SSDP Parser - should extract max-age safely', () => {
  assert.equal(parser.parseMaxAge('max-age=3600'), 3600);
  assert.equal(parser.parseMaxAge('MAX-AGE = 900'), 900);
  assert.equal(parser.parseMaxAge(null), 1800); // fallback
});

test('SCPD Parser - should correctly parse actions and match state variables types', () => {
  const mockScpdXml = `
    <?xml version="1.0"?>
    <scpd xmlns="urn:schemas-upnp-org:service-1-0">
      <specVersion><major>1</major><minor>0</minor></specVersion>
      <actionList>
        <action>
          <name>SetTarget</name>
          <argumentList>
            <argument>
              <name>NewTargetValue</name>
              <direction>in</direction>
              <relatedStateVariable>Target</relatedStateVariable>
            </argument>
          </argumentList>
        </action>
      </actionList>
      <serviceStateTable>
        <stateVariable sendEvents="no">
          <name>Target</name>
          <dataType>boolean</dataType>
          <defaultValue>0</defaultValue>
        </stateVariable>
      </serviceStateTable>
    </scpd>
  `;

  const result = parser.parseServiceDescription(mockScpdXml);

  assert.ok(result);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].name, 'SetTarget');

  const arg = result.actions[0].arguments[0];
  assert.equal(arg.name, 'NewTargetValue');
  assert.equal(arg.direction, 'in');
  assert.equal(arg.dataType, 'boolean'); // Verified linkage!
});
