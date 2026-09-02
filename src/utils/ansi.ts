/**
 * Stripping the terminal colouring out of a failure message.
 *
 * pytest-html-reporter stores `message` exactly as pytest rendered it for a
 * terminal, escape codes included. A real record from a real run looks like:
 *
 *     AssertionError: assert 'Example Domain' == 'Not the heading'
 *       \x1b[0m\x1b[91m- Not the heading\x1b[39;49;00m
 *       \x1b[92m+ Example Domain\x1b[39;49;00m
 *
 * The reference extension this one is modelled on never needed any of this,
 * because pytest-html-plus writes plain text. Here the codes have to come out
 * before a message is shown to anyone, or the sidebar renders literal `[91m`
 * noise in the middle of every assertion diff.
 *
 * The raw text is still worth keeping: "copy error" puts the original on the
 * clipboard so pasting it into a terminal reproduces the colours.
 */

/**
 * ANSI escape sequences, in two families.
 *
 * CSI  — `ESC [ ... <final byte>`, which covers SGR colour (`[91m`), cursor
 *        moves and erases. Parameter bytes are `0x30-0x3F`, intermediates
 *        `0x20-0x2F`, and the final byte `0x40-0x7E`. Multi-parameter forms
 *        like `[39;49;00m` are ordinary members of this family.
 * OSC  — `ESC ] ... BEL` or `ESC ] ... ESC \`, used for hyperlinks and window
 *        titles. pytest emits these rarely, but a plugin under test can.
 *
 * Written out by code point rather than as a literal escape so the pattern
 * survives a copy-paste through an editor that eats control characters.
 */
const ANSI_PATTERN = new RegExp(
  [
    '\\u001B\\[[0-?]*[ -/]*[@-~]',
    '\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)',
    '\\u001B[@-Z\\\\-_]',
  ].join('|'),
  'g'
);

/** Whether `text` carries any ANSI escape sequence. */
export function hasAnsi(text: unknown): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  // `test` on a /g regex advances lastIndex, which would make repeated calls
  // disagree with each other. A fresh regex each time avoids that.
  return new RegExp(ANSI_PATTERN.source).test(text);
}

/**
 * `text` with every escape sequence removed.
 *
 * Idempotent, and returns `''` for anything that is not a string — callers feed
 * this straight from parsed JSON, where a malformed record can put a number or
 * null in a field that should hold text.
 */
export function stripAnsi(text: unknown): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(ANSI_PATTERN, '');
}
