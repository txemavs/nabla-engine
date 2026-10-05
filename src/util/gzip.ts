/** Gunzip bytes with the Compression Streams API (browser and Node 20+). */
export async function gunzipText(bytes: ArrayBuffer): Promise<string> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}
