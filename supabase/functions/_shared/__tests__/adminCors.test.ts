/**
 * `adminCors.ts` — AD-1 M1a execution brief §8.
 *
 * `corsHeaders`/`handlePreflight` take the allowed-origins list as a parameter rather than
 * reading `Deno.env` internally — see the deviation note in `adminCors.ts`'s header — which is
 * what makes this file runnable under Jest/Node without a `Deno` global shim.
 */
import { corsHeaders, handlePreflight, parseAllowedOrigins } from '../adminCors';

const ALLOWED = ['https://admin.bluesmoke.app', 'http://localhost:5173'];

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedOrigins('https://a.example, https://b.example ,https://c.example')).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ]);
  });

  it('returns an empty list for undefined or empty input', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('drops empty entries from stray commas', () => {
    expect(parseAllowedOrigins('https://a.example,,https://b.example,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

describe('corsHeaders', () => {
  it('echoes an allowed origin', () => {
    const headers = corsHeaders('https://admin.bluesmoke.app', ALLOWED);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://admin.bluesmoke.app');
  });

  it('omits the ACAO header for an unknown origin', () => {
    const headers = corsHeaders('https://evil.example', ALLOWED);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('omits the ACAO header for a null origin', () => {
    const headers = corsHeaders(null, ALLOWED);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('never emits a wildcard ACAO', () => {
    const headers = corsHeaders('https://admin.bluesmoke.app', ALLOWED);
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    const unknown = corsHeaders('https://evil.example', ALLOWED);
    expect(Object.values(unknown)).not.toContain('*');
  });

  it('always sets Vary: Origin and the allowed methods/headers', () => {
    const headers = corsHeaders('https://evil.example', ALLOWED);
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('authorization, content-type, x-client-info, apikey');
  });
});

describe('handlePreflight', () => {
  it('returns a 204 Response for OPTIONS with CORS headers set', () => {
    const req = new Request('https://x.example/admin-query', {
      method: 'OPTIONS',
      headers: { Origin: 'https://admin.bluesmoke.app' },
    });
    const response = handlePreflight(req, ALLOWED);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(204);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.bluesmoke.app');
  });

  it('returns null for a non-OPTIONS method', () => {
    const req = new Request('https://x.example/admin-query', { method: 'POST' });
    expect(handlePreflight(req, ALLOWED)).toBeNull();
  });
});
