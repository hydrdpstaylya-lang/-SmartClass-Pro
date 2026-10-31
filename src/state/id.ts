// Random UUID fallback for HTTP previews where randomUUID is unavailable.
// Not used for authentication; server tokens always come from node:crypto.
export const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')
