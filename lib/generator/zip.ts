const encoder = new TextEncoder();

type ZipFile = {
  name: string;
  contents: string;
};

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function calculateCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(
    parts.reduce((total, part) => total + part.length, 0),
  );
  const result = new Uint8Array(buffer);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function createZipBlob(files: ZipFile[]) {
  if (files.length === 0 || files.length > 0xffff) {
    throw new Error("A ZIP archive must contain between 1 and 65,535 files.");
  }

  const localEntries: Uint8Array[] = [];
  const centralEntries: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const contents = encoder.encode(file.contents);
    if (
      name.length === 0 ||
      name.length > 0xffff ||
      contents.length > 0xffffffff ||
      localOffset > 0xffffffff
    ) {
      throw new Error("A file is too large to include in the ZIP archive.");
    }

    const crc32 = calculateCrc32(contents);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 33);
    writeUint32(localView, 14, crc32);
    writeUint32(localView, 18, contents.length);
    writeUint32(localView, 22, contents.length);
    writeUint16(localView, 26, name.length);
    writeUint16(localView, 28, 0);
    localEntries.push(localHeader, name, contents);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 33);
    writeUint32(centralView, 16, crc32);
    writeUint32(centralView, 20, contents.length);
    writeUint32(centralView, 24, contents.length);
    writeUint16(centralView, 28, name.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralEntries.push(centralHeader, name);

    localOffset += localHeader.length + name.length + contents.length;
  }

  const centralDirectory = concatenate(centralEntries);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  const archive = concatenate([...localEntries, centralDirectory, endRecord]);
  return new Blob([archive.buffer], { type: "application/zip" });
}
