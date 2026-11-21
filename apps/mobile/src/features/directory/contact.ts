/** Digits only, as wa.me wants the number without "+" or spaces. */
function digitsOf(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function telUrl(phone: string): string {
  return `tel:+${digitsOf(phone)}`;
}

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${digitsOf(phone)}`;
}
