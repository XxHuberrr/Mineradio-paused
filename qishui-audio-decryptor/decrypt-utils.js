const crypto = require('crypto')

function bitCount(value) {
  let current = value
  current = current - ((current >> 1) & 0x55555555)
  current = (current & 0x33333333) + ((current >> 2) & 0x33333333)
  return (((current + (current >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24
}

function decodeBase36(charCode) {
  if (charCode >= 48 && charCode <= 57) {
    return charCode - 48
  }

  if (charCode >= 97 && charCode <= 122) {
    return charCode - 97 + 10
  }

  return 0xff
}

function decryptSpadeInner(spadeKey) {
  const result = Buffer.from(spadeKey)
  const working = Buffer.alloc(spadeKey.length + 2)
  working[0] = 0xfa
  working[1] = 0x55
  spadeKey.copy(working, 2)

  for (let index = 0; index < result.length; index += 1) {
    let value = (spadeKey[index] ^ working[index]) - bitCount(index) - 21

    while (value < 0) {
      value += 0xff
    }

    result[index] = value & 0xff
  }

  return result
}

function decryptSpade(spadeKeyBytes) {
  if (!Buffer.isBuffer(spadeKeyBytes) || spadeKeyBytes.length < 3) {
    return ''
  }

  const paddingLength = (spadeKeyBytes[0] ^ spadeKeyBytes[1] ^ spadeKeyBytes[2]) - 48
  if (spadeKeyBytes.length < paddingLength + 2) {
    return ''
  }

  const innerInput = spadeKeyBytes.subarray(1, spadeKeyBytes.length - paddingLength)
  const tempBuffer = decryptSpadeInner(innerInput)

  if (tempBuffer.length === 0) {
    return ''
  }

  const skipBytes = decodeBase36(tempBuffer[0])
  const decodedMessageLength = spadeKeyBytes.length - paddingLength - 2
  const endIndex = 1 + decodedMessageLength - skipBytes

  if (endIndex > tempBuffer.length) {
    return ''
  }

  return tempBuffer.subarray(1, endIndex).toString('utf8')
}

function decryptSpadeA(spadeA) {
  try {
    return decryptSpade(Buffer.from(spadeA, 'base64'))
  } catch {
    return ''
  }
}

function hexToBuffer(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Hex string length must be even.')
  }

  return Buffer.from(hex, 'hex')
}

function aesCtrDecrypt(key, iv, encrypted) {
  const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

function parseStsz(data) {
  const sampleSize = data.readUInt32BE(4)
  const count = data.readUInt32BE(8)

  if (sampleSize !== 0) {
    return Array.from({ length: count }, () => sampleSize)
  }

  const sizes = []
  for (let index = 0; index < count; index += 1) {
    sizes.push(data.readUInt32BE(12 + index * 4))
  }

  return sizes
}

function parseStsc(data) {
  const entryCount = data.readUInt32BE(4)
  const entries = []

  for (let index = 0; index < entryCount; index += 1) {
    const base = 8 + index * 12
    entries.push({
      firstChunk: data.readUInt32BE(base),
      samplesPerChunk: data.readUInt32BE(base + 4),
      id: data.readUInt32BE(base + 8),
    })
  }

  return entries
}

function parseSenc(data) {
  const count = data.readUInt32BE(4)
  const ivs = []
  let position = 8

  for (let index = 0; index < count; index += 1) {
    const iv = Buffer.alloc(16)
    data.copy(iv, 0, position, position + 8)
    ivs.push(iv)
    position += 8
  }

  return ivs
}

function scanForFlacMetadata(stsdData) {
  const marker = Buffer.from([0x64, 0x66, 0x4c, 0x61])
  const index = stsdData.indexOf(marker)

  if (index === -1 || index < 4) {
    return Buffer.alloc(0)
  }

  const boxSize = stsdData.readUInt32BE(index - 4)
  const contentStart = index + 4
  const contentEnd = Math.min(index - 4 + boxSize, stsdData.length)

  if (contentEnd <= contentStart) {
    return Buffer.alloc(0)
  }

  return stsdData.subarray(contentStart, contentEnd)
}

function replaceEncaWithMp4a(buffer, searchStart, searchEnd) {
  const target = Buffer.from('enca')
  const replacement = Buffer.from('mp4a')

  for (let index = searchStart; index + 4 <= searchEnd; index += 1) {
    if (buffer.subarray(index, index + 4).equals(target)) {
      replacement.copy(buffer, index)
      break
    }
  }
}

function sanitizeFilenamePart(value, fallback) {
  const normalized = String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()

  return normalized || fallback
}

module.exports = {
  aesCtrDecrypt,
  decryptSpadeA,
  hexToBuffer,
  parseSenc,
  parseStsc,
  parseStsz,
  replaceEncaWithMp4a,
  sanitizeFilenamePart,
  scanForFlacMetadata,
}
