/*
 * Exact money arithmetic, CSV parsing and the Comparison engine for "Why did my bill change?".
 * A classic script (not a module) so index.html runs straight from the file system.
 * Exposes window.BillEngine.
 */
(function (global) {
  'use strict';

  // Every parsed input is a BigInt scaled by 10^12 (12 fractional digits).
  // A Cost is quantity × unit_price, so its exact scale is 10^24. All money derived from
  // Costs (Usage effect, Price effect, Bucket totals, bill totals) stays at 10^24 and is
  // never rounded until it is displayed. BigInt has no ceiling, so a 10,000-row sum of
  // 12-integer-digit products is still exact.
  const INPUT_SCALE = 12;
  const MONEY_SCALE = INPUT_SCALE * 2;
  const MAX_INTEGER_DIGITS = 12;
  const pow10 = (n) => 10n ** BigInt(n);
  const INPUT_TO_MONEY = pow10(MONEY_SCALE - INPUT_SCALE);
  const UNITS_PER_CENT = pow10(MONEY_SCALE - 2);
  const PLAIN_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
  const CURRENCY = 'HK$';
  const REQUIRED_COLUMNS = ['service', 'quantity', 'unit_price'];

  const BUCKETS = Object.freeze([
    { key: 'added', label: 'Added', phrase: 'from newly added services' },
    { key: 'usage', label: 'Usage', phrase: 'from usage changes' },
    { key: 'price', label: 'Price', phrase: 'from price changes' },
    { key: 'removed', label: 'Removed', phrase: 'from removed services' },
  ]);

  /* ---------- Exact decimal helper ---------- */

  function parseDecimal(raw) {
    const text = String(raw).trim();
    if (text === '') return { problem: 'empty', text };
    const match = PLAIN_DECIMAL.exec(text);
    if (!match) return { problem: 'format', text };
    const [, sign, integerDigits, fractionDigits = ''] = match;
    if (integerDigits.replace(/^0+/, '').length > MAX_INTEGER_DIGITS) return { problem: 'integer-digits', text };
    if (fractionDigits.length > INPUT_SCALE) return { problem: 'fraction-digits', text };
    const magnitude = BigInt(integerDigits + fractionDigits.padEnd(INPUT_SCALE, '0'));
    return { units: sign === '-' ? -magnitude : magnitude, text };
  }

  function describeDecimalProblem({ problem, text }) {
    switch (problem) {
      case 'empty':
        return 'The value is empty. Enter a plain decimal such as 12 or 1.40.';
      case 'integer-digits':
        return `"${text}" has more than ${MAX_INTEGER_DIGITS} digits before the decimal point.`;
      case 'fraction-digits':
        return `"${text}" has more than ${INPUT_SCALE} digits after the decimal point.`;
      default:
        return `"${text}" is not a plain decimal. Use digits with an optional decimal point, such as 1.40.`;
    }
  }

  // Exact decimal text of a scaled BigInt: trailing zeros trimmed, at least 2 fractional digits.
  function toExactString(units, scale) {
    const negative = units < 0n;
    const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
    const whole = digits.slice(0, digits.length - scale);
    let fraction = digits.slice(digits.length - scale).replace(/0+$/, '');
    if (fraction.length < 2) fraction = fraction.padEnd(2, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  // Round half away from zero to whole cents, entirely in BigInt.
  function roundToCents(units) {
    const negative = units < 0n;
    const magnitude = negative ? -units : units;
    let cents = magnitude / UNITS_PER_CENT;
    if ((magnitude % UNITS_PER_CENT) * 2n >= UNITS_PER_CENT) cents += 1n;
    return negative ? -cents : cents;
  }

  function formatCents(cents) {
    const negative = cents < 0n;
    const magnitude = negative ? -cents : cents;
    const whole = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fraction = (magnitude % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${CURRENCY}${whole}.${fraction}`;
  }

  // A money value carries its exact decimal string and an independently rounded display string.
  function money(units) {
    const cents = roundToCents(units);
    const exact = toExactString(units, MONEY_SCALE);
    return Object.freeze({
      units,
      cents,
      exact,
      exactText: exact.startsWith('-') ? `-${CURRENCY}${exact.slice(1)}` : `${CURRENCY}${exact}`,
      display: formatCents(cents),
      isCentExact: units === cents * UNITS_PER_CENT,
    });
  }

  // Chart geometry only: pixels need a Number, money arithmetic never uses this.
  function approximate(units) {
    return Number(units / pow10(MONEY_SCALE - 6)) / 1e6;
  }

  /* ---------- CSV parsing ---------- */

  // One physical line → fields. Supports double-quoted fields and "" escapes; null on an unclosed quote.
  function splitCsvLine(line) {
    const fields = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else current += ch;
      } else if (ch === '"' && current.trim() === '') {
        current = '';
        quoted = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (quoted) return null;
    fields.push(current);
    return fields;
  }

  function parseBill(text, { side, fileName }) {
    const errors = [];
    const services = [];
    const firstLineByService = new Map();
    const fail = (line, column, message, source = null) =>
      errors.push({ side, fileName, line, column, message, source });
    const result = () => ({ side, fileName, services, errors });

    const body = String(text).replace(/^\uFEFF/, '');
    if (body.trim() === '') {
      fail(null, null, 'The file is empty. Expected the header "service,quantity,unit_price" and one row per Service.');
      return result();
    }

    const lines = body.split(/\r\n|\n|\r/);
    const header = splitCsvLine(lines[0]);
    if (!header) {
      fail(1, null, 'The header row has an unclosed quote.', lines[0]);
      return result();
    }
    const headerNames = header.map((name) => name.trim().toLowerCase());
    const columnIndex = {};
    for (const column of REQUIRED_COLUMNS) {
      const positions = headerNames.flatMap((name, index) => (name === column ? [index] : []));
      if (positions.length === 0) {
        fail(1, column, `The header has no "${column}" column. Expected service,quantity,unit_price; extra columns are ignored.`, lines[0]);
      } else if (positions.length > 1) {
        fail(1, column, `The header lists "${column}" ${positions.length} times. Keep exactly one.`, lines[0]);
      } else {
        columnIndex[column] = positions[0];
      }
    }
    if (errors.length) return result();
    const minimumFields = Math.max(...Object.values(columnIndex)) + 1;

    for (let i = 1; i < lines.length; i += 1) {
      const source = lines[i];
      const line = i + 1;
      if (source.trim() === '') continue;
      const fields = splitCsvLine(source);
      if (!fields) {
        fail(line, null, 'This row has an unclosed quote.', source);
        continue;
      }
      if (fields.length < minimumFields) {
        fail(line, null, `Expected at least ${minimumFields} columns but found ${fields.length}.`, source);
        continue;
      }

      let valid = true;
      const name = fields[columnIndex.service].trim();
      if (name === '') {
        fail(line, 'service', 'The Service name is empty.', source);
        valid = false;
      } else if (firstLineByService.has(name)) {
        fail(line, 'service', `Duplicate Service "${name}": it already appears on Source line ${firstLineByService.get(name)}. Each Service may appear once per file.`, source);
        valid = false;
      } else {
        firstLineByService.set(name, line);
      }

      const quantity = parseDecimal(fields[columnIndex.quantity]);
      if (quantity.problem) {
        fail(line, 'quantity', describeDecimalProblem(quantity), source);
        valid = false;
      }
      const unitPrice = parseDecimal(fields[columnIndex.unit_price]);
      if (unitPrice.problem) {
        fail(line, 'unit_price', describeDecimalProblem(unitPrice), source);
        valid = false;
      }

      if (valid) {
        services.push(Object.freeze({
          name,
          line,
          quantity: { units: quantity.units, text: quantity.text },
          unitPrice: { units: unitPrice.units, text: unitPrice.text, money: money(unitPrice.units * INPUT_TO_MONEY) },
          cost: money(quantity.units * unitPrice.units),
        }));
      }
    }
    return result();
  }

  /* ---------- Comparison ---------- */

  const sumUnits = (list, pick) => list.reduce((total, item) => total + pick(item), 0n);

  function compareService(name, index, before, after) {
    let status;
    let totalChange = 0n;
    let usageEffect = 0n;
    let priceEffect = 0n;

    if (!before) {
      status = 'added';
      totalChange = after.cost.units;
    } else if (!after) {
      status = 'removed';
      totalChange = -before.cost.units;
    } else if (before.quantity.units === after.quantity.units && before.unitPrice.units === after.unitPrice.units) {
      status = 'unchanged';
    } else {
      status = 'changed';
      totalChange = after.cost.units - before.cost.units;
      // Usage is priced at the before unit_price; price is weighted by the after quantity,
      // so the two effects sum to q1·p1 − q0·p0 with no interaction term left over.
      usageEffect = (after.quantity.units - before.quantity.units) * before.unitPrice.units;
      priceEffect = (after.unitPrice.units - before.unitPrice.units) * after.quantity.units;
      if (usageEffect + priceEffect !== totalChange) {
        throw new Error(`Reconciliation failed for Service "${name}": Usage effect + Price effect does not equal its Total change.`);
      }
    }

    const contributions = {
      added: money(status === 'added' ? totalChange : 0n),
      usage: money(usageEffect),
      price: money(priceEffect),
      removed: money(status === 'removed' ? totalChange : 0n),
    };

    return Object.freeze({
      id: `service-${index}`,
      name,
      status,
      before,
      after,
      totalChange: money(totalChange),
      usageEffect: contributions.usage,
      priceEffect: contributions.price,
      contributions,
    });
  }

  function compareBills(beforeBill, afterBill) {
    const beforeByName = new Map(beforeBill.services.map((s) => [s.name, s]));
    const afterByName = new Map(afterBill.services.map((s) => [s.name, s]));
    const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])];
    const services = names.map((name, index) =>
      compareService(name, index, beforeByName.get(name) || null, afterByName.get(name) || null));

    const beforeTotal = money(sumUnits(beforeBill.services, (s) => s.cost.units));
    const afterTotal = money(sumUnits(afterBill.services, (s) => s.cost.units));
    const totalChange = money(afterTotal.units - beforeTotal.units);

    const buckets = BUCKETS.map((definition) => Object.freeze({
      ...definition,
      total: money(sumUnits(services, (s) => s.contributions[definition.key].units)),
      contributors: services.filter((s) => s.contributions[definition.key].units !== 0n),
    }));

    // Reconciliation: before total + added + usage + price + removed = after total, exactly.
    const reconciled = beforeTotal.units + sumUnits(buckets, (b) => b.total.units);
    if (reconciled !== afterTotal.units) {
      throw new Error(`Reconciliation failed: the Buckets reach ${toExactString(reconciled, MONEY_SCALE)} but the after total is ${afterTotal.exact}.`);
    }
    if (sumUnits(services, (s) => s.totalChange.units) !== totalChange.units) {
      throw new Error('Reconciliation failed: the Services do not add up to the Total change.');
    }

    return Object.freeze({
      before: { fileName: beforeBill.fileName, serviceCount: beforeBill.services.length },
      after: { fileName: afterBill.fileName, serviceCount: afterBill.services.length },
      beforeTotal,
      afterTotal,
      totalChange,
      services,
      buckets,
      bucketByKey: Object.fromEntries(buckets.map((b) => [b.key, b])),
      displayRounding: checkDisplayRounding(beforeTotal, afterTotal, totalChange, buckets),
      summary: buildSummary(totalChange, buckets),
    });
  }

  // Each display string is rounded on its own, so displayed amounts may not add up.
  function checkDisplayRounding(beforeTotal, afterTotal, totalChange, buckets) {
    const displayedBucketCents = buckets.reduce((total, b) => total + b.total.cents, 0n);
    const displayedStepsEndCents = beforeTotal.cents + displayedBucketCents;
    const bucketsMismatch = displayedBucketCents !== totalChange.cents;
    const waterfallMismatch = displayedStepsEndCents !== afterTotal.cents;
    return Object.freeze({
      needed: bucketsMismatch || waterfallMismatch,
      bucketsMismatch,
      waterfallMismatch,
      displayedBucketSum: formatCents(displayedBucketCents),
      displayedStepsEnd: formatCents(displayedStepsEndCents),
    });
  }

  /* ---------- Summary sentence ---------- */

  function amountPhrase(value) {
    const magnitude = money(value.units < 0n ? -value.units : value.units);
    return magnitude.cents === 0n && magnitude.units !== 0n ? `less than ${CURRENCY}0.01` : magnitude.display;
  }

  function toneOf(units) {
    if (units > 0n) return 'up';
    if (units < 0n) return 'down';
    return 'flat';
  }

  // Returns the sentence as parts so the headline can set amounts in figure type.
  function buildSummary(totalChange, buckets) {
    const parts = [];
    const text = (value) => parts.push({ type: 'text', text: value });
    const amount = (value, bucket = null) =>
      parts.push({ type: 'amount', text: amountPhrase(value), tone: toneOf(value.units), bucket });
    const list = (items) => items.forEach((bucket, index) => {
      if (index > 0) text(items.length === 2 ? ' and ' : index === items.length - 1 ? ', and ' : ', ');
      amount(bucket.total, bucket.key);
      text(` ${bucket.phrase}`);
    });

    const moving = buckets.filter((b) => b.total.units !== 0n);
    const change = totalChange.units;

    if (change === 0n) {
      if (moving.length === 0) {
        text('Total did not change.');
      } else {
        text('Total did not change: ');
        list(moving.filter((b) => b.total.units > 0n));
        text(' exactly offset ');
        list(moving.filter((b) => b.total.units < 0n));
        text('.');
      }
    } else {
      const rising = change > 0n;
      text(`Total ${rising ? 'increased' : 'decreased'} by `);
      amount(totalChange);
      text(': ');
      list(moving.filter((b) => (b.total.units > 0n) === rising));
      const offsets = moving.filter((b) => (b.total.units > 0n) !== rising);
      if (offsets.length) {
        text(', partly offset by ');
        list(offsets);
      }
      text('.');
    }

    return Object.freeze({ parts, text: parts.map((p) => p.text).join('') });
  }

  global.BillEngine = Object.freeze({
    BUCKETS,
    MONEY_SCALE,
    parseBill,
    compareBills,
    money,
    formatCents,
    approximate,
    toneOf,
  });
})(window);
