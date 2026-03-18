import 'dotenv/config'
import crypto from 'node:crypto'

const secret = (process.env.API_JWT_HS256_SECRET ?? '').trim()
if (!secret) {
  console.error('API_JWT_HS256_SECRET is required.')
  process.exit(1)
}

const subject = (process.env.API_DEFAULT_USER_ID ?? 'u-admin').trim()
if (!subject) {
  console.error('API_DEFAULT_USER_ID is required.')
  process.exit(1)
}

const issuer = (process.env.API_JWT_ISSUER ?? '').trim()
const audience = (process.env.API_JWT_AUDIENCE ?? '').trim()
const now = Math.floor(Date.now() / 1000)
const expiresInSeconds = Number.parseInt(process.env.API_JWT_EXPIRES_IN_SEC ?? String(60 * 60 * 8), 10)

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const payload = {
  sub: subject,
  iat: now,
  exp: now + Math.max(60, expiresInSeconds),
}

if (issuer) {
  payload.iss = issuer
}
if (audience) {
  payload.aud = audience
}

const encodedPayload = base64UrlEncode(JSON.stringify(payload))
const signingInput = `${header}.${encodedPayload}`
const signature = base64UrlEncode(crypto.createHmac('sha256', secret).update(signingInput).digest())
const token = `${header}.${encodedPayload}.${signature}`

console.log(token)
