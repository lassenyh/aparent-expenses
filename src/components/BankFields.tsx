"use client";

import { useId, useRef } from "react";
import { emptyBankDetails, ibanCountries, countryCodes, type BankDetails } from "@/lib/bankDetails";
import { useLanguage } from "./LanguageProvider";

export function BankFields({ accountNumber, bankDetails, onAccountChange, onBankChange, disabled, error, accountRef }: {
  accountNumber: string; bankDetails: BankDetails | null; onAccountChange: (value: string) => void;
  onBankChange: (value: BankDetails | null) => void; disabled?: boolean; error?: string | null;
  accountRef?: React.Ref<HTMLInputElement>;
}) {
  const id = useId();
  const foreignDraft = useRef(bankDetails);
  const { language, setLanguage, t } = useLanguage();
  const international = bankDetails !== null;
  const names = new Intl.DisplayNames([language], { type: "region" });
  const countries = ibanCountries.filter(code => code !== "NO").sort((a, b) => (names.of(a) ?? a).localeCompare(names.of(b) ?? b, language));
  const addressCountries = [...countryCodes]
    .sort((a, b) => (names.of(a) ?? a).localeCompare(names.of(b) ?? b, language));
  const fieldClass = "h-9 w-full min-w-0 rounded-md border border-control bg-field px-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10 disabled:opacity-60";
  function change(key: keyof BankDetails, value: string) {
    const next = { ...bankDetails!, [key]: value };
    foreignDraft.current = next;
    onBankChange(next);
  }
  function field(key: keyof BankDetails, label: string, autoComplete: string, maxLength = 160) {
    return <div><label htmlFor={`${id}-${key}`} className="mb-1.5 block text-[13px] text-muted">{t(label)} *</label>
      <input id={`${id}-${key}`} value={bankDetails![key]} onChange={event => change(key, event.target.value)}
        ref={key === "iban" ? accountRef : undefined} autoComplete={autoComplete} maxLength={maxLength}
        autoCapitalize={key === "iban" || key === "bic" ? "characters" : undefined} spellCheck={key === "iban" || key === "bic" ? false : undefined}
        disabled={disabled} aria-describedby={error ? `${id}-error` : undefined} className={fieldClass} /></div>;
  }
  return <fieldset className="min-w-0 space-y-4 border-t border-line pt-4" disabled={disabled}>
    <legend className="float-left mb-3 w-full text-sm font-medium text-ink">{t("Konto for utbetaling")}</legend>
    <div className="clear-both flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink">
      <label className="flex items-center gap-2"><input type="radio" name={`${id}-type`} checked={!international} onChange={() => { foreignDraft.current = bankDetails; onBankChange(null); }} />{t("Norsk konto")}</label>
      <label className="flex items-center gap-2"><input type="radio" name={`${id}-type`} checked={international}
        onChange={() => { onBankChange(foreignDraft.current ?? emptyBankDetails()); setLanguage("en"); }} />International account</label>
    </div>
    {!international ? <div>
      <label htmlFor={`${id}-account`} className="mb-1.5 block text-[13px] text-muted">{t("Kontonummer (11 sifre)")} *</label>
      <input ref={accountRef} id={`${id}-account`} value={accountNumber} onChange={event => onAccountChange(event.target.value)}
        inputMode="numeric" autoComplete="off" maxLength={14} disabled={disabled} className={fieldClass} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    </div> : <div className="grid gap-4">
      <div><label htmlFor={`${id}-bankCountry`} className="mb-1.5 block text-[13px] text-muted">{t("Bankland")} *</label>
        <select id={`${id}-bankCountry`} value={bankDetails.bankCountry} onChange={event => change("bankCountry", event.target.value)} className={fieldClass}>
          <option value="">{t("Velg land")}</option>{countries.map(code => <option key={code} value={code}>{names.of(code)}</option>)}
        </select>
        <p className="mt-1 text-[12.5px] text-muted">{t("Gjelder bankkontoer med IBAN.")}</p>
      </div>
      {field("iban", "IBAN", "off", 42)}
      {field("bic", "BIC / SWIFT", "off", 11)}
      <p className="text-[12.5px] text-muted">{t("Du finner IBAN og BIC i nettbanken. Bruk navnet som er registrert på kontoen.")}</p>
      <p className="text-sm font-medium text-ink">{t("Kontoeiers adresse")}</p>
      {field("addressLine", "Gateadresse", "street-address")}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">{field("postalCode", "Postnummer", "postal-code", 20)}{field("city", "Poststed", "address-level2")}</div>
      <div><label htmlFor={`${id}-addressCountry`} className="mb-1.5 block text-[13px] text-muted">{t("Bostedsland")} *</label>
        <select id={`${id}-addressCountry`} value={bankDetails.addressCountry} onChange={event => change("addressCountry", event.target.value)} autoComplete="country" className={fieldClass}>
          <option value="">{t("Velg land")}</option>{addressCountries.map(code => <option key={code} value={code}>{names.of(code)}</option>)}
        </select>
      </div>
    </div>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-neg">{t(error)}</p>}
  </fieldset>;
}
