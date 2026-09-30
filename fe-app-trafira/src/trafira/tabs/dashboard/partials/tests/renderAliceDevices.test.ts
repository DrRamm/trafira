import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAliceDevices } from '../renderAliceDevices';
import { Trafira } from '../../../../types';

interface Node {
  tag: string;
  attributes: Record<string, unknown>;
  children: Node[] | Node | string;
}

function childrenOf(node: Node): Array<Node | string> {
  if (Array.isArray(node.children)) return node.children;
  return [node.children];
}

function text(node: Node | string): string {
  if (typeof node === 'string') return node;
  return childrenOf(node).map(text).join(' ');
}

function findByClass(node: Node | string, className: string): Node[] {
  if (typeof node === 'string') return [];
  const own = `${node.attributes?.class || ''}`.split(' ').includes(className)
    ? [node]
    : [];
  return [
    ...own,
    ...childrenOf(node).flatMap((child) => findByClass(child, className)),
  ];
}

const BLOCK = 'fkp_dashboard-page__alice';
const onToggleOffline = vi.fn();
const spoilerProps = { expandedOffline: {}, onToggleOffline };

function device(overrides: Partial<Trafira.AliceDevice>): Trafira.AliceDevice {
  return {
    kind: 'lan',
    name: '',
    mac: '',
    interface: 'br-lan',
    ips: [],
    online: true,
    last_handshake: null,
    status: 'direct',
    matched_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('_', (value: string) => value);
  vi.stubGlobal(
    'E',
    (tag: string, attributes: Record<string, string>, children: Node[]) => ({
      tag,
      attributes,
      children,
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('renderAliceDevices', () => {
  it('shows mixed routing without claiming all addresses use one path', () => {
    const node = renderAliceDevices({
      loading: false,
      failed: false,
      nowSeconds: 0,
      ...spoilerProps,
      report: {
        enabled: true,
        dashboard_visible: true,
        list_mode: 'allow',
        source_interfaces: ['br-lan'],
        generated_at: 0,
        warnings: [],
        devices: [device({ name: 'dual-stack', status: 'mixed' })],
      },
    }) as unknown as Node;
    const group = findByClass(node, `${BLOCK}__group--mixed`);
    expect(group).toHaveLength(1);
    expect(text(group[0])).toContain('dual-stack');
    expect(text(group[0])).toContain('Mixed routing');
  });
  it('stays hidden when the dashboard panel is turned off', () => {
    const node = renderAliceDevices({
      loading: false,
      failed: false,
      report: {
        enabled: true,
        dashboard_visible: false,
        list_mode: 'allow',
        source_interfaces: ['br-lan'],
        generated_at: 0,
        warnings: [],
        devices: [],
      },
      nowSeconds: 0,
      ...spoilerProps,
    }) as unknown as Node;

    expect(node.attributes.class).toContain(`${BLOCK}--hidden`);
  });

  it('stays hidden while Alice Mode is disabled', () => {
    const node = renderAliceDevices({
      loading: false,
      failed: false,
      report: { enabled: false },
      nowSeconds: 0,
      ...spoilerProps,
    }) as unknown as Node;

    expect(node.attributes.class).toContain(`${BLOCK}--hidden`);
  });

  it('groups devices and shows handshakes and warnings', () => {
    const node = renderAliceDevices({
      loading: false,
      failed: false,
      report: {
        enabled: true,
        dashboard_visible: true,
        list_mode: 'allow',
        source_interfaces: ['br-lan', 'wg0'],
        generated_at: 1000,
        warnings: [{ code: 'interface_not_captured', value: 'awg0' }],
        devices: [
          device({
            kind: 'wireguard',
            name: 'Laptop',
            interface: 'wg0',
            ips: ['10.8.0.2'],
            last_handshake: 970,
            status: 'trafira',
            matched_by: 'interface:wg0',
          }),
          device({
            ips: ['192.168.1.30'],
            mac: 'aa:bb:cc:00:00:03',
            online: false,
          }),
        ],
      },
      nowSeconds: 1000,
      expandedOffline: { direct: true },
      onToggleOffline,
    }) as unknown as Node;

    const groups = findByClass(node, `${BLOCK}__group`);
    expect(groups).toHaveLength(2);
    expect(text(groups[0])).toContain('1 of 1 online');
    expect(
      findByClass(groups[0], `${BLOCK}__interface-name`).map(text),
    ).toEqual(['wg0']);
    const laptop = findByClass(groups[0], `${BLOCK}__device`)[0];
    expect(text(laptop)).toContain('Laptop');
    expect(text(laptop)).toContain('30 s ago');
    expect(text(laptop)).not.toContain('conn');
    expect(text(laptop)).not.toContain('wg0');
    expect(laptop.attributes.title).toContain('10.8.0.2');
    expect(laptop.attributes.title).toContain('interface:wg0');
    const unnamed = findByClass(groups[1], `${BLOCK}__device`)[0];
    expect(text(findByClass(unnamed, `${BLOCK}__device-name`)[0])).toBe(
      '192.168.1.30',
    );
    expect(text(findByClass(unnamed, `${BLOCK}__device-address`)[0])).toBe('');
    expect(findByClass(groups[0], `${BLOCK}__offline`)).toHaveLength(0);
    const offline = findByClass(groups[1], `${BLOCK}__offline`)[0];
    expect(offline.tag).toBe('details');
    expect(offline.attributes.open).toBe(true);
    expect(text(offline)).toContain('Offline: 1');
    expect(text(offline)).toContain('192.168.1.30');
    (offline.attributes.toggle as unknown as (event: Event) => void)({
      target: { open: false },
    } as unknown as Event);
    expect(onToggleOffline).toHaveBeenCalledWith('direct', false);
    expect(text(findByClass(node, `${BLOCK}__warning`)[0])).toContain('awg0');
    expect(findByClass(node, `${BLOCK}__badge`)).toHaveLength(0);
  });

  it('shows collection warnings when no device source is available', () => {
    const node = renderAliceDevices({
      loading: false,
      failed: false,
      report: {
        enabled: true,
        dashboard_visible: true,
        list_mode: 'allow',
        source_interfaces: ['br-lan'],
        generated_at: 1000,
        warnings: [
          { code: 'neighbor_source_unavailable', value: '' },
          { code: 'wireguard_source_unavailable', value: '' },
        ],
        devices: [],
      },
      nowSeconds: 1000,
      ...spoilerProps,
    }) as unknown as Node;

    expect(findByClass(node, `${BLOCK}__warning`).map(text)).toEqual([
      'LAN device data is unavailable; LAN devices may be missing.',
      'WireGuard peer data is unavailable; peers may be missing.',
    ]);
    expect(text(node)).toContain('No devices');
  });
});
