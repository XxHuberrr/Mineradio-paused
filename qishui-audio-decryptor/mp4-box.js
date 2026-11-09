class Mp4Box {
  constructor({ size, type, offset, data }) {
    this.size = size
    this.type = type
    this.offset = offset
    this.data = data
  }

  isEmpty() {
    return this.size === 0
  }

  static fromBuffer(buffer, offset) {
    if (!Buffer.isBuffer(buffer) || offset + 8 > buffer.length) {
      return new Mp4Box({
        size: 0,
        type: '',
        offset: 0,
        data: Buffer.alloc(0),
      })
    }

    const size = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const end = size >= 8 && offset + size <= buffer.length ? offset + size : buffer.length

    return new Mp4Box({
      size: end - offset,
      type,
      offset,
      data: buffer.subarray(offset + 8, end),
    })
  }

  static findBox(buffer, boxType, offset = 0, end = buffer.length) {
    let position = offset

    while (position < end) {
      if (position + 8 > end) {
        break
      }

      const size = buffer.readUInt32BE(position)
      if (size < 8 || position + size > end) {
        break
      }

      const type = buffer.subarray(position + 4, position + 8).toString('ascii')
      if (type === boxType) {
        return Mp4Box.fromBuffer(buffer, position)
      }

      position += size
    }

    return new Mp4Box({
      size: 0,
      type: '',
      offset: 0,
      data: Buffer.alloc(0),
    })
  }
}

module.exports = {
  Mp4Box,
}
