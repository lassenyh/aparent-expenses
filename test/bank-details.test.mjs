import assert from "node:assert/strict";
import test from "node:test";
import { bankProblem, normalizeBankDetails, readBankDetails, bankPdfRows } from "../src/lib/bankDetails.ts";
import { translate } from "../src/lib/translations.ts";

const bank = {
  bankCountry: "SE", iban: "SE45 5000 0000 0583 9825 7466", bic: "ESSESESS",
  addressLine: "Testgatan 12", postalCode: "123 45", city: "Stockholm", addressCountry: "SE",
};

test("Norwegian bank accounts remain valid without foreign bank details", () => {
  assert.equal(bankProblem("1503.27.48219", null), null);
  assert.ok(bankProblem("1503", null));
  assert.ok(bankProblem("letters15032748219", null));
});

test("validates Swedish IBAN checksums, country agreement and full address", () => {
  assert.equal(bankProblem(null, bank), null);
  assert.ok(bankProblem(null, { ...bank, iban: "SE46 5000 0000 0583 9825 7466" }));
  assert.ok(bankProblem(null, { ...bank, bankCountry: "DK" }));
  assert.ok(bankProblem(null, { ...bank, bic: "DABADKKK" }));
  for (const field of ["addressLine", "postalCode", "city", "addressCountry"]) {
    assert.ok(bankProblem(null, { ...bank, [field]: "" }));
  }
  assert.ok(bankProblem(null, "invalid input"));
  assert.ok(bankProblem(null, { ...bank, addressLine: "x".repeat(161) }));
  assert.equal(normalizeBankDetails(bank).iban, "SE4550000000058398257466");
  assert.equal(readBankDetails(null), null);
});

test("PDF bank labels stay Norwegian while the interface supports English", () => {
  const rows = bankPdfRows(normalizeBankDetails(bank));
  assert.deepEqual(rows.find(([key]) => key === "Bankland"), ["Bankland", "Sverige"]);
  assert.ok(rows.some(([key, value]) => key === "Kontoeiers adresse" && value === bank.addressLine));
  assert.equal(translate("Gå til gjennomgang", "en"), "Continue to review");
  assert.equal(translate("Tilbake til opplasting", "en"), "Back to upload");
  assert.equal(translate("Kontonummer må være 11 sifre", "en"), "Account number must contain 11 digits");
  assert.equal(translate("Leser kvitteringene: 1 av 3 ferdig", "en"), "Reading receipts: 1 of 3 complete");
  assert.equal(translate("Gå til gjennomgang", "nb"), "Gå til gjennomgang");
});
