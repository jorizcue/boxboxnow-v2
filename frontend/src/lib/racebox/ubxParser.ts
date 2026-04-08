/**
 * RaceBox Mini UBX-like packet parser.
 * Protocol: 0xB5 0x62 | class | id | lenL lenH | payload | CK_A CK_B
 * RaceBox Data Message: class=0xFF, id=0x01, payload=80 bytes.
 */

export interface RaceBoxSample {
  timestamp: number;       // performance.now() at parse time
  lat: number;             // degrees
  lon: number;             // degrees
  altitudeM: number;       // meters MSL
  speedMms: number;        // mm/s ground speed
  speedKmh: number;        // km/h
  headingDeg: number;      // degrees
  gForceX: number;         // G (lateral)
  gForceY: number;         // G (longitudinal)
  gForceZ: number;         // G (vertical)
  fixType: number;         // 0=none, 2=2D, 3=3D
  numSatellites: number;
  batteryPercent: number;
}

const SYNC1 = 0xb5;
const SYNC2 = 0x62;
const RACEBOX_CLASS = 0xff;
const RACEBOX_DATA_ID = 0x01;
const HEADER_LEN = 6; // sync(2) + class(1) + id(1) + len(2)
const CHECKSUM_LEN = 2;

export class UbxParser {
  private buffer = new Uint8Array(1024);
  private pos = 0;

  /** Feed raw BLE notification bytes. Returns parsed samples (0 or more). */
  feed(data: DataView): RaceBoxSample[] {
    // Append to buffer
    const incoming = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (this.pos + incoming.length > this.buffer.length) {
      // Grow buffer
      const newBuf = new Uint8Array(this.buffer.length * 2);
      newBuf.set(this.buffer.subarray(0, this.pos));
      this.buffer = newBuf;
    }
    this.buffer.set(incoming, this.pos);
    this.pos += incoming.length;

    const samples: RaceBoxSample[] = [];

    // Try to extract complete packets
    while (this.pos >= HEADER_LEN) {
      // Find sync header
      const syncIdx = this.findSync();
      if (syncIdx < 0) {
        this.pos = 0;
        break;
      }
      if (syncIdx > 0) {
        // Discard bytes before sync
        this.buffer.copyWithin(0, syncIdx, this.pos);
        this.pos -= syncIdx;
      }

      if (this.pos < HEADER_LEN) break;

      const payloadLen = this.buffer[4] | (this.buffer[5] << 8);
      const packetLen = HEADER_LEN + payloadLen + CHECKSUM_LEN;

      if (this.pos < packetLen) break; // Need more data

      // Verify checksum (Fletcher-8 over class+id+len+payload)
      let ckA = 0, ckB = 0;
      for (let i = 2; i < HEADER_LEN + payloadLen; i++) {
        ckA = (ckA + this.buffer[i]) & 0xff;
        ckB = (ckB + ckA) & 0xff;
      }

      const msgClass = this.buffer[2];
      const msgId = this.buffer[3];

      if (ckA === this.buffer[HEADER_LEN + payloadLen] &&
          ckB === this.buffer[HEADER_LEN + payloadLen + 1] &&
          msgClass === RACEBOX_CLASS && msgId === RACEBOX_DATA_ID &&
          payloadLen === 80) {
        const sample = this.parsePayload(this.buffer, HEADER_LEN);
        if (sample) samples.push(sample);
      }

      // Consume packet
      this.buffer.copyWithin(0, packetLen, this.pos);
      this.pos -= packetLen;
    }

    return samples;
  }

  private findSync(): number {
    for (let i = 0; i <= this.pos - 2; i++) {
      if (this.buffer[i] === SYNC1 && this.buffer[i + 1] === SYNC2) return i;
    }
    return -1;
  }

  private parsePayload(buf: Uint8Array, offset: number): RaceBoxSample | null {
    const dv = new DataView(buf.buffer, buf.byteOffset + offset, 80);

    const fixType = dv.getUint8(20);
    const numSat = dv.getUint8(23);
    const lon = dv.getInt32(24, true) / 1e7;
    const lat = dv.getInt32(28, true) / 1e7;
    const altMsl = dv.getInt32(36, true) / 1000; // mm -> m
    const speedMms = dv.getInt32(48, true);       // mm/s (signed)
    const heading = dv.getInt32(52, true) / 1e5;  // deg
    const battery = dv.getUint8(67) & 0x7f;       // lower 7 bits
    const gfx = dv.getInt16(68, true) / 1000;     // milli-g -> G
    const gfy = dv.getInt16(70, true) / 1000;
    const gfz = dv.getInt16(72, true) / 1000;

    return {
      timestamp: performance.now(),
      lat, lon,
      altitudeM: altMsl,
      speedMms: Math.abs(speedMms),
      speedKmh: Math.abs(speedMms) * 3.6 / 1000,
      headingDeg: heading,
      gForceX: gfx,
      gForceY: gfy,
      gForceZ: gfz,
      fixType,
      numSatellites: numSat,
      batteryPercent: battery,
    };
  }

  reset() {
    this.pos = 0;
  }
}
