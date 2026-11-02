import { isValidIBAN, isValidBIC, getCountrySpecifications } from "ibantools";

export type BankDetails = {
  bankCountry: string;
  iban: string;
  bic: string;
  addressLine: string;
  postalCode: string;
  city: string;
  addressCountry: string;
};

export const emptyBankDetails = (): BankDetails => ({ bankCountry: "", iban: "", bic: "", addressLine: "", postalCode: "", city: "", addressCountry: "" });

export function readBankDetails(value: unknown): BankDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(emptyBankDetails()).map(key => [key, typeof record[key] === "string" ? record[key].trim() : ""])) as BankDetails;
}

export function normalizeBankDetails(value: BankDetails): BankDetails {
  return { ...value, iban: value.iban.replace(/\s/g, "").toUpperCase(), bic: value.bic.trim().toUpperCase(), bankCountry: value.bankCountry.toUpperCase(), addressCountry: value.addressCountry.toUpperCase() };
}

export function bankProblem(accountNumber: string | null | undefined, bankDetails: unknown): string | null {
  if (bankDetails == null) {
    if (!accountNumber?.trim()) return "Kontonummer er påkrevd";
    return /^\d{11}$/.test(accountNumber.replace(/\s|\./g, "")) ? null : "Kontonummer må være 11 sifre";
  }
  const raw = readBankDetails(bankDetails);
  if (!raw) return "Ugyldige bankopplysninger";
  const bank = normalizeBankDetails(raw);
  if (!getCountrySpecifications()[bank.bankCountry]?.IBANRegistry) return "Velg et bankland som bruker IBAN";
  if (!isValidIBAN(bank.iban) || bank.iban.slice(0, 2) !== bank.bankCountry) return "IBAN er ugyldig eller stemmer ikke med banklandet";
  if (!isValidBIC(bank.bic) || bank.bic.slice(4, 6) !== bank.bankCountry) return "BIC / SWIFT er ugyldig eller stemmer ikke med banklandet";
  if (!bank.addressLine || !bank.postalCode || !bank.city || !countryCodes.includes(bank.addressCountry)) return "Fyll inn kontoeiers fulle adresse og bostedsland";
  if (Object.values(bank).some(value => value.length > 160 || /[\r\n\u0000-\u001f]/.test(value))) return "Bankopplysningene inneholder ugyldig tekst";
  return null;
}

export function bankPdfRows(value: unknown): Array<[string, string]> {
  const bank = readBankDetails(value);
  if (!bank) return [];
  const names = new Intl.DisplayNames(["nb"], { type: "region" });
  const country = (code: string) => /^[A-Z]{2}$/.test(code) ? names.of(code) ?? code : code;
  return [
    ["Bankland", country(bank.bankCountry)], ["IBAN", bank.iban], ["BIC / SWIFT", bank.bic],
    ["Kontoeiers adresse", bank.addressLine], ["Postnummer og sted", `${bank.postalCode} ${bank.city}`],
    ["Bostedsland", country(bank.addressCountry)],
  ];
}

export const countryCodes = Object.keys(getCountrySpecifications());
export const ibanCountries = Object.entries(getCountrySpecifications()).filter(([, spec]) => spec.IBANRegistry && spec.chars != null).map(([code]) => code);
