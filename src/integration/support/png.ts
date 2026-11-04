const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const uint32 = (value: number) => [
  value >>> 24,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]

export const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concatBytes([new TextEncoder().encode(type), data])
  return concatBytes([
    Uint8Array.from(uint32(data.length)),
    body,
    Uint8Array.from(uint32(crc32(body))),
  ])
}

/** Datos zlib sin comprimir (bloques «stored» de deflate): basta para una imagen pequeña. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])]
  for (let offset = 0; offset < data.length || offset === 0; offset += 0xffff) {
    const part = data.subarray(offset, offset + 0xffff)
    const isLast = offset + 0xffff >= data.length ? 1 : 0
    blocks.push(
      Uint8Array.from([
        isLast,
        part.length & 0xff,
        part.length >>> 8,
        ~part.length & 0xff,
        (~part.length >>> 8) & 0xff,
      ]),
      part,
    )
  }
  let a = 1
  let b = 0
  for (const byte of data) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  blocks.push(Uint8Array.from(uint32(((b << 16) | a) >>> 0)))
  return concatBytes(blocks)
}

/**
 * PNG real de un color (sin dependencias), para subir imágenes de prueba al backend: este valida el
 * formato decodificando el archivo, así que no sirve un archivo cualquiera.
 */
export function solidPng([red, green, blue]: [number, number, number], size = 64): Uint8Array {
  const row = new Uint8Array(size * 3 + 1)
  for (let x = 0; x < size; x += 1) row.set([red, green, blue], 1 + x * 3)
  const header = Uint8Array.from([...uint32(size), ...uint32(size), 8, 2, 0, 0, 0]) // 8 bits, RGB
  return concatBytes([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(concatBytes(Array.from({ length: size }, () => row)))),
    chunk('IEND', new Uint8Array(0)),
  ])
}
