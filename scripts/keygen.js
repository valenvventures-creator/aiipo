// Prints a new 256-bit master key for TA_MASTER_KEY. Store it in a secret manager, never in the repo.
import crypto from 'node:crypto';
console.log(crypto.randomBytes(32).toString('base64'));
