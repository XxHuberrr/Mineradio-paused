const { Mp4Box } = require('./mp4-box')
const {
  aesCtrDecrypt,
  decryptSpadeA,
  hexToBuffer,
  parseSenc,
  parseStsc,
  parseStsz,
  replaceEncaWithMp4a,
  sanitizeFilenamePart,
  scanForFlacMetadata,
} = require('./decrypt-utils')

class TrackDecryptor {
  resolveKey(spadeA) {
    if (!spadeA) {
      throw new Error('spade_a is required for decryption.')
    }

    const isHex = /^[0-9a-fA-F]+$/.test(spadeA)
    const keyHex = isHex ? spadeA : decryptSpadeA(spadeA)

    if (!keyHex) {
      throw new Error('Failed to resolve decryption key from spade_a.')
    }

    return hexToBuffer(keyHex)
  }

  decryptSampleList({ fileBuffer, key, sampleSizes, ivs, mdatOffset }) {
    const decryptedSamples = []
    let sampleOffset = mdatOffset + 8

    for (let index = 0; index < sampleSizes.length; index += 1) {
      const size = sampleSizes[index]
      const iv = ivs[index]

      if (!iv) {
        throw new Error(`Missing IV for sample ${index}.`)
      }

      const encrypted = fileBuffer.subarray(sampleOffset, sampleOffset + size)
      decryptedSamples.push(aesCtrDecrypt(key, iv, encrypted))
      sampleOffset += size
    }

    return decryptedSamples
  }

  buildFlacFile(flacMetadata, decryptedSamples) {
    const flacSignature = Buffer.from('fLaC')
    const metadataBody = flacMetadata.length > 4
      ? flacMetadata.subarray(4)
      : flacMetadata

    return Buffer.concat([flacSignature, metadataBody, ...decryptedSamples])
  }

  buildM4aFile(fileBuffer, decryptedSamples, mdat, stsd) {
    const output = Buffer.from(fileBuffer)
    let writePointer = mdat.offset + 8

    for (const sample of decryptedSamples) {
      sample.copy(output, writePointer)
      writePointer += sample.length
    }

    replaceEncaWithMp4a(output, stsd.offset, stsd.offset + stsd.size)
    return output
  }

  createFileName({ title, artist, extension }) {
    const safeTitle = sanitizeFilenamePart(title, 'track')
    const safeArtist = sanitizeFilenamePart(artist, 'unknown')
    return `${safeTitle} - ${safeArtist}${extension}`
  }

  decrypt({ encryptedBuffer, spadeA, media = {} }) {
    if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length === 0) {
      throw new Error('encryptedBuffer must be a non-empty Buffer.')
    }

    const key = this.resolveKey(spadeA)

    const moov = Mp4Box.findBox(encryptedBuffer, 'moov')
    if (moov.isEmpty()) {
      throw new Error("Decrypt failed: 'moov' atom not found.")
    }

    const trak = Mp4Box.findBox(encryptedBuffer, 'trak', moov.offset + 8, moov.offset + moov.size)
    const mdia = Mp4Box.findBox(encryptedBuffer, 'mdia', trak.offset + 8, trak.offset + trak.size)
    const minf = Mp4Box.findBox(encryptedBuffer, 'minf', mdia.offset + 8, mdia.offset + mdia.size)
    const stbl = Mp4Box.findBox(encryptedBuffer, 'stbl', minf.offset + 8, minf.offset + minf.size)
    const stsd = Mp4Box.findBox(encryptedBuffer, 'stsd', stbl.offset + 8, stbl.offset + stbl.size)
    const stsz = Mp4Box.findBox(encryptedBuffer, 'stsz', stbl.offset + 8, stbl.offset + stbl.size)
    const stsc = Mp4Box.findBox(encryptedBuffer, 'stsc', stbl.offset + 8, stbl.offset + stbl.size)
    const stco = Mp4Box.findBox(encryptedBuffer, 'stco', stbl.offset + 8, stbl.offset + stbl.size)

    let senc = Mp4Box.findBox(encryptedBuffer, 'senc', moov.offset + 8, moov.offset + moov.size)
    if (senc.isEmpty()) {
      senc = Mp4Box.findBox(encryptedBuffer, 'senc', stbl.offset + 8, stbl.offset + stbl.size)
    }

    if (senc.isEmpty()) {
      throw new Error("Decrypt failed: 'senc' atom not found.")
    }

    const mdat = Mp4Box.findBox(encryptedBuffer, 'mdat')
    if (mdat.isEmpty()) {
      throw new Error("Decrypt failed: 'mdat' atom not found.")
    }

    const flacMetadata = scanForFlacMetadata(stsd.data)
    const isFlac = flacMetadata.length > 0

    const sampleSizes = parseStsz(stsz.data)
    const stscEntries = parseStsc(stsc.data)
    const chunkCount = stco.data.readUInt32BE(4)
    const ivs = parseSenc(senc.data)

    if (sampleSizes.length !== ivs.length) {
      throw new Error(`Decrypt failed: sample count ${sampleSizes.length} does not match iv count ${ivs.length}.`)
    }

    const decryptedSamples = this.decryptSampleList({
      fileBuffer: encryptedBuffer,
      key,
      sampleSizes,
      ivs,
      mdatOffset: mdat.offset,
      stscEntries,
      chunkCount,
    })

    const outputBuffer = isFlac
      ? this.buildFlacFile(flacMetadata, decryptedSamples)
      : this.buildM4aFile(encryptedBuffer, decryptedSamples, mdat, stsd)

    const extension = isFlac ? '.flac' : '.m4a'

    return {
      buffer: outputBuffer,
      extension,
      fileName: this.createFileName({
        title: media.title,
        artist: media.artist,
        extension,
      }),
      meta: {
        isFlac,
        sampleCount: sampleSizes.length,
        chunkCount,
      },
    }
  }
}

module.exports = {
  TrackDecryptor,
}
