import crypto from "crypto";

/** Letters and digits that cannot be mistaken for each other when read aloud or retyped. */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

/** The random part of a project link (/p/<code>). 31^8 codes, so links cannot be guessed. */
export function newProjectCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** "2417 – Vinterlys", or just the name when there is no number. */
export function projectLabel(project: { number: string | null; name: string }): string {
  return [project.number?.trim(), project.name.trim()].filter(Boolean).join(" – ");
}
