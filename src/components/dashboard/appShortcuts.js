// Fixed destinations only. Never accept executable paths or commands from URLs.
export const appShortcuts = [
  { id: 'vscode', name: 'Visual Studio Code', logo: 'vscode.svg', kind: 'desktop', href: 'vscode://' },
  { id: 'chatgpt', name: 'ChatGPT', logo: 'chatgpt.svg', kind: 'website', href: 'https://chatgpt.com/' },
  { id: 'figma', name: 'Figma', logo: 'figma.svg', kind: 'website', href: 'https://www.figma.com/design/9JeP5Ri3Y8dQbMyrJ1nf08?node-id=4-2' },
  { id: 'cloudflare', name: 'Cloudflare', logo: 'cloudflare.svg', kind: 'website', href: 'https://dash.cloudflare.com/' },
  { id: 'github', name: 'GitHub', logo: 'github.svg', kind: 'website', href: 'https://github.com/IvLatkov' },
  { id: 'supabase', name: 'Supabase', logo: 'supabase.svg', kind: 'website', href: 'https://supabase.com/dashboard' },
]

