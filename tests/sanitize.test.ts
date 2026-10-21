import { describe, it, expect } from 'vitest';
import { sanitizePlainText, escapeHtml, sanitizeUrl, verifyImageMagicBytes } from '../src/lib/sanitize';
import { formatGameText } from '../src/lib/formatGameText';

describe('Sanitization & Security Tests', () => {
  it('strips script tags and malicious HTML in sanitizePlainText', () => {
    const malicious = '<script>alert("xss")</script>Hello <b>World</b><img src=x onerror=alert(1)>';
    const clean = sanitizePlainText(malicious);
    expect(clean).toBe('alert("xss")Hello World');
    expect(clean).not.toContain('<');
    expect(clean).not.toContain('>');
  });

  it('removes control characters and null bytes in sanitizePlainText', () => {
    const dirty = 'Hello\x00\x08World\x1F!';
    expect(sanitizePlainText(dirty)).toBe('HelloWorld!');
  });

  it('limits max length in sanitizePlainText', () => {
    const long = 'A'.repeat(500);
    expect(sanitizePlainText(long, 50).length).toBe(50);
  });

  it('escapes sensitive characters in escapeHtml', () => {
    expect(escapeHtml('<div class="box">&\'hello\'</div>')).toBe('&lt;div class=&quot;box&quot;&gt;&amp;&#39;hello&#39;&lt;/div&gt;');
  });

  it('validates safe URLs and blocks javascript: schemes', () => {
    expect(sanitizeUrl('https://example.com/card.png')).toBe('https://example.com/card.png');
    expect(sanitizeUrl('/marketplace/card/123')).toBe('/marketplace/card/123');
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBeNull();
  });

  it('verifies image magic bytes correctly', () => {
    // Valid JPEG header
    const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(verifyImageMagicBytes(jpegBuf)).toEqual({ valid: true, ext: 'jpg', mime: 'image/jpeg' });

    // Valid PNG header
    const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    expect(verifyImageMagicBytes(pngBuf)).toEqual({ valid: true, ext: 'png', mime: 'image/png' });

    // Valid WebP header: RIFF....WEBP
    const webpBuf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
    ]);
    expect(verifyImageMagicBytes(webpBuf)).toEqual({ valid: true, ext: 'webp', mime: 'image/webp' });

    // Fake image / SVG file disguised as jpg
    const fakeBuf = Buffer.from('<svg onload="alert(1)"></svg>');
    expect(verifyImageMagicBytes(fakeBuf).valid).toBe(false);
  });

  it('escapes arbitrary HTML injection in formatGameText while retaining valid tokens', () => {
    const maliciousText = '<script>alert("xss")</script> [Assault 4] **bold ability** [>] test <img src=x onerror=1>';
    const formatted = formatGameText(maliciousText);

    // Raw script/img tags must be escaped
    expect(formatted).not.toContain('<script>');
    expect(formatted).not.toContain('<img src=x onerror=1>');
    expect(formatted).toContain('&lt;script&gt;');
    expect(formatted).toContain('&lt;img src=x onerror=1&gt;');

    // Legitimate styling tokens must still work
    expect(formatted).toContain('ASSAULT 4');
    expect(formatted).toContain('<strong style="color:var(--text-primary); font-weight:800;">bold ability</strong>');
    expect(formatted).toContain('&#x27A4;');
  });
});
