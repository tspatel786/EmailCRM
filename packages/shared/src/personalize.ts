export type PersonalizeVars = {
  name?: string | null;
  company?: string | null;
  service?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
};

const TOKEN = /\{\{\s*(name|company|service|email|phone|city)\s*\}\}/gi;

export function personalize(template: string, vars: PersonalizeVars): string {
  return template.replace(TOKEN, (_match, key: string) => {
    const value = vars[key.toLowerCase() as keyof PersonalizeVars];
    return value?.trim() ? value : "";
  });
}

export function extractTokens(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(TOKEN)) {
    const token = match[1];
    if (token) found.add(token.toLowerCase());
  }
  return [...found];
}
