const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}