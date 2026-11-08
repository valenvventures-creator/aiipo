// Exact fixed-point decimal arithmetic on BigInt (18 fractional digits). Financial results are never
// computed with binary floating point. Rounding happens only when formatting, using half-even.
const SCALE = 18n;
const ONE = 10n ** SCALE;

export class Dec {
  constructor(units) { this.u = units; }

  static from(v) {
    if (v instanceof Dec) return v;
    if (typeof v === 'bigint') return new Dec(v * ONE);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new RangeError('Not a finite number');
      v = v.toString();
      if (/e/i.test(v)) throw new RangeError('Use a plain decimal string for very large or small numbers');
    }
    const s = String(v ?? '').trim().replace(/[,\s_$]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`Invalid decimal: "${v}"`);
    const neg = s.startsWith('-');
    const [i, f = ''] = s.replace('-', '').split('.');
    if (f.length > Number(SCALE)) throw new RangeError('Too many decimal places');
    const units = BigInt(i) * ONE + BigInt((f + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE)));
    return new Dec(neg ? -units : units);
  }

  static parse(v) { try { return Dec.from(v); } catch { return null; } }

  add(o) { return new Dec(this.u + Dec.from(o).u); }
  sub(o) { return new Dec(this.u - Dec.from(o).u); }
  mul(o) { return new Dec(divRound(this.u * Dec.from(o).u, ONE)); }
  div(o) {
    const d = Dec.from(o).u;
    if (d === 0n) throw new RangeError('Division by zero');
    return new Dec(divRound(this.u * ONE, d));
  }
  neg() { return new Dec(-this.u); }
  cmp(o) { const b = Dec.from(o).u; return this.u < b ? -1 : this.u > b ? 1 : 0; }
  eq(o) { return this.cmp(o) === 0; }
  isZero() { return this.u === 0n; }
  isNeg() { return this.u < 0n; }
  max(o) { return this.cmp(o) >= 0 ? this : Dec.from(o); }
  min(o) { return this.cmp(o) <= 0 ? this : Dec.from(o); }

  /** Round to `dp` decimal places, half-even. */
  round(dp = 2) {
    const factor = 10n ** (SCALE - BigInt(dp));
    return new Dec(divRound(this.u, factor) * factor);
  }

  toString(dp) {
    const v = dp === undefined ? this : this.round(dp);
    const neg = v.u < 0n;
    const a = neg ? -v.u : v.u;
    const i = a / ONE;
    let f = (a % ONE).toString().padStart(Number(SCALE), '0');
    f = dp === undefined ? f.replace(/0+$/, '') : f.slice(0, dp);
    return (neg && a !== 0n ? '-' : '') + i.toString() + (f ? '.' + f : '');
  }

  format(dp = 2) {
    const [i, f] = this.toString(dp).split('.');
    const neg = i.startsWith('-');
    const grouped = i.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + grouped + (f ? '.' + f : '');
  }

  toJSON() { return this.toString(); }
}

// Half-even division of BigInts.
function divRound(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  const r = an % ad;
  const twice = r * 2n;
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export const D = Dec.from;
export const sum = (arr) => arr.reduce((a, b) => a.add(b), D(0));
