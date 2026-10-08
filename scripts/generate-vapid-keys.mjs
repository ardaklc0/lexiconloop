import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const applicationServerKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(publicJwk.x, "base64url"),
    Buffer.from(publicJwk.y, "base64url"),
]).toString("base64url");

console.log(`VAPID_PUBLIC_KEY=${applicationServerKey}`);
console.log(`VAPID_KEYS=${JSON.stringify({
    publicKey: { ...publicJwk, alg: "ES256", key_ops: ["verify"], ext: true },
    privateKey: { ...privateJwk, alg: "ES256", key_ops: ["sign"], ext: true },
})}`);