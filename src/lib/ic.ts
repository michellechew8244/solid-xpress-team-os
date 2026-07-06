/** Malaysian IC (MyKad) starts with the birth date: YYMMDD-PB-####.
 *  Returns "YYYY-MM-DD" when the first 6 digits form a valid date. */
export function dobFromIC(ic: string): string | null {
  const digits = ic.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Century: two-digit years up to the current year are 2000s, else 1900s.
  const nowYY = new Date().getFullYear() % 100;
  const year = yy <= nowYY ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
