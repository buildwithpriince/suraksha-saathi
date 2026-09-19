import { db } from './database';

export type DeviceStatus = 'unregistered' | 'pending' | 'approved';

export interface DeviceRecord {
  id: string;
  siteCode: string;
  publicKey: string; // base64url raw 32 bytes
  attestationToken: string | null;
  status: DeviceStatus;
  createdAt: number;
}

interface DeviceRow {
  id: string;
  site_code: string;
  public_key: string;
  attestation_token: string | null;
  status: DeviceStatus;
  created_at: number;
}

export function getDevice(): DeviceRecord | null {
  const r = db().getFirstSync<DeviceRow>('SELECT * FROM device LIMIT 1');
  if (r === null) return null;
  return {
    id: r.id,
    siteCode: r.site_code,
    publicKey: r.public_key,
    attestationToken: r.attestation_token,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function insertDevice(device: DeviceRecord): void {
  db().runSync(
    `INSERT INTO device (id, site_code, public_key, private_key_enc, attestation_token, status, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    device.id,
    device.siteCode,
    device.publicKey,
    device.attestationToken,
    device.status,
    device.createdAt,
  );
}

export function setAttestation(deviceId: string, token: string): void {
  db().runSync('UPDATE device SET attestation_token = ? WHERE id = ?', token, deviceId);
}
