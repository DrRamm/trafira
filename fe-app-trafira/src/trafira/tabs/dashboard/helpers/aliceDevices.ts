import { Trafira } from '../../../types';

export type AliceDeviceGroups = Record<
  Trafira.AliceDeviceStatus,
  Trafira.AliceDevice[]
>;

export function getAliceDeviceLabel(device: Trafira.AliceDevice) {
  return device.name || device.ips[0] || device.mac || device.interface;
}

export function groupAliceDevices(
  devices: Trafira.AliceDevice[],
): AliceDeviceGroups {
  const groups: AliceDeviceGroups = {
    trafira: [],
    direct: [],
    not_captured: [],
  };

  devices.forEach((device) => groups[device.status]?.push(device));

  Object.values(groups).forEach((group) =>
    group.sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        getAliceDeviceLabel(a).localeCompare(getAliceDeviceLabel(b)),
    ),
  );

  return groups;
}

export function groupDevicesByInterface(devices: Trafira.AliceDevice[]) {
  const result: Array<{ name: string; devices: Trafira.AliceDevice[] }> = [];

  devices.forEach((device) => {
    let bucket = result.find((item) => item.name === device.interface);

    if (!bucket) {
      bucket = { name: device.interface, devices: [] };
      result.push(bucket);
    }

    bucket.devices.push(device);
  });

  return result;
}

// The address shown next to the name; the label already is the address for unnamed devices.
export function getAliceDeviceAddress(device: Trafira.AliceDevice) {
  if (!device.name) {
    return '';
  }

  return device.ips.find((ip) => !ip.includes(':')) || device.ips[0] || '';
}

// Interface matches are implied by the interface heading, so only IP and MAC get a tag.
export function getAliceMatchTag(matchedBy: string | null) {
  if (matchedBy?.startsWith('ip:')) {
    return 'IP';
  }

  if (matchedBy?.startsWith('mac:')) {
    return 'MAC';
  }

  return '';
}

export function formatHandshakeAge(
  lastHandshake: number | null,
  nowSeconds: number,
) {
  if (!lastHandshake) {
    return '';
  }

  const age = Math.max(0, nowSeconds - lastHandshake);

  if (age < 60) {
    return _('%d s').replace('%d', String(age));
  }

  if (age < 3600) {
    return _('%d min').replace('%d', String(Math.floor(age / 60)));
  }

  if (age < 86400) {
    return _('%d h').replace('%d', String(Math.floor(age / 3600)));
  }

  return _('%d d').replace('%d', String(Math.floor(age / 86400)));
}

export function formatAliceDeviceDetails(device: Trafira.AliceDevice) {
  return [
    ...device.ips,
    device.mac,
    device.interface,
    device.matched_by
      ? _('Matched by %s').replace('%s', device.matched_by)
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
