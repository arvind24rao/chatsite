// Basic className merge helper — identical to shadcn/ui default
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}