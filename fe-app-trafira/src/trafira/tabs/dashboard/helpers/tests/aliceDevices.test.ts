import { beforeAll, describe, expect, it } from 'vitest';
import {
  formatHandshakeAge,
  getAliceDeviceAddress,
  getAliceMatchTag,
  groupAliceDevices,
  groupDevicesByInterface,
} from '../aliceDevices';
import { Trafira } from '../../../../types';

beforeAll(() => {
  // LuCI provides _() at runtime.
  (globalThis as unknown as { _: (value: string) => string })._ = (value) =>
    value;
});

function device(overrides: Partial<Trafira.AliceDevice>): Trafira.AliceDevice {
  return {
    kind: 'lan',
    name: '',
    mac: '',
    interface: 'br-lan',
    ips: [],
    online: false,
    last_handshake: null,
    status: 'direct',
    matched_by: null,
    ...overrides,
  };
}

describe('groupAliceDevices', () => {
  it('groups by status with online devices first', () => {
    const groups = groupAliceDevices([
      device({ name: 'b-offline', status: 'trafira' }),
      device({ name: 'z-online', status: 'trafira', online: true }),
      device({ name: 'a-offline', status: 'trafira' }),
      device({ ips: ['192.168.1.30'], status: 'direct' }),
      device({ name: 'guest', status: 'not_captured' }),
    ]);

    expect(groups.trafira.map((item) => item.name)).toEqual([
      'z-online',
      'a-offline',
      'b-offline',
    ]);
    expect(groups.direct).toHaveLength(1);
    expect(groups.not_captured).toHaveLength(1);
  });
});

describe('groupDevicesByInterface', () => {
  it('keeps device order inside each interface', () => {
    const buckets = groupDevicesByInterface([
      device({ name: 'a', interface: 'br-lan' }),
      device({ name: 'b', interface: 'wg_server' }),
      device({ name: 'c', interface: 'br-lan' }),
    ]);

    expect(
      buckets.map((bucket) => [
        bucket.name,
        bucket.devices.map((item) => item.name),
      ]),
    ).toEqual([
      ['br-lan', ['a', 'c']],
      ['wg_server', ['b']],
    ]);
  });
});

describe('getAliceDeviceAddress', () => {
  it('shows the IPv4 address only next to a name', () => {
    expect(
      getAliceDeviceAddress(
        device({ name: 'iPhone', ips: ['fd00::1', '192.168.1.10'] }),
      ),
    ).toBe('192.168.1.10');
    expect(getAliceDeviceAddress(device({ ips: ['192.168.1.10'] }))).toBe('');
  });
});

describe('getAliceMatchTag', () => {
  it('tags IP and MAC matches only', () => {
    expect(getAliceMatchTag('ip:10.8.0.0/24')).toBe('IP');
    expect(getAliceMatchTag('mac:aa:bb:cc:dd:ee:ff')).toBe('MAC');
    expect(getAliceMatchTag('interface:wg0')).toBe('');
    expect(getAliceMatchTag(null)).toBe('');
  });
});

describe('formatHandshakeAge', () => {
  it('formats WireGuard handshake age', () => {
    expect(formatHandshakeAge(null, 1000)).toBe('');
    expect(formatHandshakeAge(970, 1000)).toBe('30 s');
    expect(formatHandshakeAge(1000 - 125, 1000)).toBe('2 min');
    expect(formatHandshakeAge(1000 - 7200, 1000)).toBe('2 h');
    expect(formatHandshakeAge(1000 - 172800, 1000)).toBe('2 d');
  });
});
