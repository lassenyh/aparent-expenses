import test from 'node:test';
import assert from 'node:assert/strict';
import { bankConversion, manualConversion, parseBankRate } from '../src/lib/currency.ts';
import { foreignExchangeProblem, foreignExchangePdfLines, validReceiptDate, roundForeignCents } from '../src/lib/foreignExchange.ts';
const csv = 'FREQ;BASE_CUR;QUOTE_CUR;UNIT_MULT;TIME_PERIOD;OBS_VALUE\nB;SEK;NOK;2;2026-10-23;94.03\nB;SEK;NOK;2;2026-10-26;93.86';
test('half cents round symmetrically for charges and refunds',()=>{
  assert.equal(roundForeignCents(5,0.5),3);
  assert.equal(roundForeignCents(-5,0.5),-3);
});
test('Norges Bank hundreds are normalized to a single unit and weekends use a prior date', () => {
  assert.deepEqual(parseBankRate(csv,'SEK','2026-10-25'),{rate:0.9403,rateDate:'2026-10-23'});
  assert.deepEqual(parseBankRate(csv,'SEK','2026-10-26'),{rate:0.9386,rateDate:'2026-10-26'});
  assert.throws(()=>parseBankRate(csv,'EUR','2026-10-25'));
  assert.throws(()=>parseBankRate(csv,'SEK','2026-11-15'));
  assert.throws(()=>parseBankRate('BASE_CUR;QUOTE_CUR;TIME_PERIOD;OBS_VALUE\nSEK;NOK;2026-10-23;94.03','SEK','2026-10-23'));
});
test('missing/invalid/future dates cannot silently use today’s rate',()=>{
  assert.equal(validReceiptDate('2026-02-30'),false);
  assert.equal(validReceiptDate('2099-01-01'),false);
  assert.equal(validReceiptDate(''),false);
});
test('the same historical quote is reused, signed refunds are converted and the snapshot is immutable', async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async url=>{calls++;assert.match(String(url),/B\.SEK\.NOK\.SP/);return new Response(csv)});
  const f=await bankConversion('SEK',100000,'2026-10-25');
  const refund=await bankConversion('SEK',-100000,'2026-10-25');
  assert.equal(calls,1);assert.equal(f.nokAmountCents,94030);assert.equal(refund.nokAmountCents,-94030);
  assert.equal(f.rateDate,'2026-10-23');assert.equal(f.receiptDate,'2026-10-25');
  const receipt={extractedCurrency:'SEK',originalAmountCents:100000,receiptDate:'2026-10-25',extractedTotalCents:94030,foreignExchange:f};
  assert.equal(foreignExchangeProblem(receipt),null);
  assert.ok(foreignExchangeProblem({...receipt,extractedTotalCents:95000}));
  assert.ok(foreignExchangeProblem({...receipt,originalAmountCents:200000}));
  assert.ok(foreignExchangeProblem({...receipt,receiptDate:'2026-10-26'}));
  assert.ok(foreignExchangePdfLines(f).join(' ').includes('Norges Bank 2026-10-23'));
});
test('outages never produce a guessed rate and can be retried',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return calls===1?new Response('',{status:503}):new Response(csv.replaceAll('SEK','EUR').replaceAll(';2;',';0;'))});
  await assert.rejects(()=>bankConversion('EUR',10000,'2026-10-25'));
  const f=await bankConversion('EUR',10000,'2026-10-25');assert.equal(calls,2);assert.equal(f.rate,94.03);
});
test('actual NOK charges require a note, correct sign, and a matching stored snapshot',()=>{
  assert.throws(()=>manualConversion('SEK',10000,9500,'2026-10-23',''));
  assert.throws(()=>manualConversion('SEK',-10000,9500,'2026-10-23','Card statement'));
  const f=manualConversion('SEK',10000,9601,'2026-10-23','Kortbelastning 23.10.2026, dokumentasjon vedlagt');
  assert.equal(foreignExchangeProblem({extractedCurrency:'SEK',originalAmountCents:10000,extractedTotalCents:9601,receiptDate:'2026-10-23',foreignExchange:f}),null);
  assert.ok(foreignExchangePdfLines(f)[0].includes('Kortbelastning'));
  assert.ok(foreignExchangeProblem({extractedCurrency:'SEK',extractedTotalCents:9500}));
  assert.equal(foreignExchangeProblem({extractedCurrency:'NOK',extractedTotalCents:9500}),null);
});
