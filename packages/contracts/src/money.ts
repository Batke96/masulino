const currencyFormatters = new Map<string, Intl.NumberFormat>();

export type Money = {
  minor: number;
  currency: "EUR";
};

export function money(minor: number, currency: Money["currency"] = "EUR"): Money {
  if (!Number.isInteger(minor)) {
    throw new Error("Money minor units must be integers");
  }
  return { minor, currency };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error("Currency mismatch");
  }
  return { minor: left.minor + right.minor, currency: left.currency };
}

export function formatMinorUnits(minor: number, currency: string, locale = "de-DE"): string {
  if (!Number.isInteger(minor)) {
    throw new Error("Money minor units must be integers");
  }
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const major = Math.trunc(absolute / 100);
  const fraction = (absolute % 100).toString().padStart(2, "0");
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }
  const signed = `${negative ? "-" : ""}${major}.${fraction}`;
  return formatter.format(Number(signed));
}
