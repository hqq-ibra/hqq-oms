export interface QuotationDefaultsInput {
  customerName: string;
  customerCity: string | null;
  contactName: string | null;
  contactPhone: string | null;
  quoteDate: Date;
}

export interface QuotationDefaults {
  quoteDate: Date;
  validUntil: Date;
  clientBlock: string;
  contact: string | null;
  attn: string | null;
}

/** Matches the paper form: validity defaults to two weeks out. */
const VALIDITY_DAYS = 14;

export function buildQuotationDefaults(
  input: QuotationDefaultsInput,
): QuotationDefaults {
  const validUntil = new Date(input.quoteDate);
  validUntil.setDate(validUntil.getDate() + VALIDITY_DAYS);

  return {
    quoteDate: input.quoteDate,
    validUntil,
    clientBlock: [input.customerName, input.customerCity]
      .filter((part): part is string => Boolean(part))
      .join('\n'),
    contact: input.contactPhone ?? null,
    attn: input.contactName ?? null,
  };
}
