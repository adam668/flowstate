import '@testing-library/jest-dom'

// jsdom's Blob/File implementation does not provide `arrayBuffer()` (it only
// implements `size`/`slice`), unlike real browsers/Electron. Polyfill it via
// FileReader (which jsdom does support) so components using the standard
// `file.arrayBuffer()` API can be tested here.
if (typeof File !== 'undefined' && typeof File.prototype.arrayBuffer !== 'function') {
  File.prototype.arrayBuffer = function (this: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
