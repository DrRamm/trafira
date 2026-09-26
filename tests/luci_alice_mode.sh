#!/usr/bin/env bash
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEW_DIR="$ROOT_DIR/luci-app-trafira/htdocs/luci-static/resources/view/trafira"

node - "$VIEW_DIR/alice.js" "$VIEW_DIR/local_devices.js" <<'NODE'
const fs = require('fs');
const assert = require('assert/strict');
const aliceSource = fs.readFileSync(process.argv[2], 'utf8');
const localDevicesSource = fs.readFileSync(process.argv[3], 'utf8');

for (const option of [
  '"alice_mode_enabled"',
  '"alice_dashboard_enabled"',
  '"alice_list_mode"',
  '"alice_interfaces"',
  '"alice_ips"',
  '"alice_macs"',
]) {
  assert(aliceSource.includes(option), `Alice settings must define ${option}`);
}
assert(!aliceSource.includes('alice_allowed_ips'), 'the old Alice IP option name must not return');
assert(aliceSource.includes('{ includeSubnets: true }'), 'Alice IP list must offer interface subnets');
assert(aliceSource.includes('createLocalMacDynamicListWidget'), 'Alice MAC list must offer known devices');

String.prototype.format = function (...args) {
  let index = 0;
  return this.replace(/%[sd]/g, () => String(args[index++]));
};
const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const main = {
  validateIP: (value) => ({ valid: ipv4.test(value) || value.includes(':') }),
  validateSubnet: (value) => ({ valid: /\/\d+$/.test(value) }),
};
const rpc = { declare: () => () => Promise.resolve({}) };
const baseclass = { extend: (value) => value };
const localDevices = new Function('baseclass', 'rpc', 'ui', 'main', '_', localDevicesSource)(
  baseclass,
  rpc,
  {},
  main,
  (value) => value,
);

const choices = localDevices.buildInterfaceSubnetChoices([
  { interface: 'loopback', 'ipv4-address': [{ address: '127.0.0.1', mask: 8 }] },
  {
    interface: 'lan',
    'ipv4-address': [{ address: '192.168.1.1', mask: 24 }],
    'ipv6-prefix-assignment': [{ address: 'fd12:3456::', mask: 60 }],
  },
  { interface: 'wg0', 'ipv4-address': [{ address: '10.8.0.1', mask: 24 }, { address: '10.8.1.1', mask: 32 }] },
  {
    interface: 'wan',
    'ipv4-address': [{ address: '203.0.113.10', mask: 24 }],
    route: [{ target: '0.0.0.0', mask: 0, nexthop: '203.0.113.1' }],
  },
]);
assert.deepEqual(choices, {
  '192.168.1.0/24': '192.168.1.0/24 · lan subnet',
  'fd12:3456::/60': 'fd12:3456::/60 · lan subnet',
  '10.8.0.0/24': '10.8.0.0/24 · wg0 subnet',
});

assert.deepEqual(
  localDevices.buildInterfaceChoices([
    { interface: 'loopback', l3_device: 'lo' },
    { interface: 'lan', l3_device: 'br-lan' },
    { interface: 'wg_server', l3_device: 'wg_server' },
    { interface: 'wan', l3_device: 'eth1', route: [{ target: '0.0.0.0', mask: 0 }] },
  ]),
  { 'br-lan': 'br-lan (lan)', wg_server: 'wg_server' },
  'interface choices skip loopback and uplinks',
);

assert.deepEqual(
  localDevices.buildLocalMacChoices(
    {
      'AA:BB:CC:DD:EE:01': { name: 'iphone.lan', ipaddrs: ['192.168.1.10'] },
      'AA:BB:CC:DD:EE:02': { ipaddrs: ['192.168.1.11'] },
    },
    { dhcp_leases: [{ macaddr: 'AA:BB:CC:DD:EE:03', hostname: 'tv', ipaddr: '192.168.1.12' }] },
  ),
  {
    'aa:bb:cc:dd:ee:01': 'aa:bb:cc:dd:ee:01 (iphone · 192.168.1.10)',
    'aa:bb:cc:dd:ee:02': 'aa:bb:cc:dd:ee:02 (192.168.1.11)',
    'aa:bb:cc:dd:ee:03': 'aa:bb:cc:dd:ee:03 (tv · 192.168.1.12)',
  },
  'MAC labels must show the MAC itself',
);
assert(aliceSource.includes('createInterfaceDynamicListWidget'), 'Alice interfaces must use a list with suggestions');
assert(!aliceSource.includes('widgets.DeviceSelect'), 'Alice interfaces must not look like a required select');
NODE

printf 'LuCI Alice Mode checks passed\n'
