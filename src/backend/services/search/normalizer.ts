export class TextNormalizer {
  private static synonymMap: Record<string, string[]> = {
    // Login / Auth synonyms
    'login': ['signin', 'sign in', 'log in', 'access', 'entrar', 'acceso', 'credentials', 'auth'],
    'password': ['pasword', 'passward', 'pwd', 'contraseña', 'clave', 'pin'],
    'locked': ['lockout', 'blocked', 'bloqueado', 'lock'],
    
    // Hardware / Screen synonyms
    'screen': ['skreen', 'skren', 'display', 'pantalla', 'monitor'],
    'blue screen': ['bsod', 'kernel panic', 'pantalla azul', 'crash', 'blue skreen'],
    'battery': ['power', 'bateria', 'charger', 'cargador', 'overheating'],
    
    // Network / VPN / Wi-Fi synonyms
    'vpn': ['vnp', 'tunnel', 'remote access', 'globalprotect'],
    'wifi': ['wi-fi', 'wlan', 'wireless', 'internet', 'conexion', 'red', 'interent', 'inteernet', 'websties', 'websites', 'dowwn'],
    'network': ['net', 'connection', 'offline', 'internet', 'interent', 'outage'],
    
    // Application & Email synonyms
    'email': ['mail', 'outlook', 'inbox', 'correo', 'exchange'],
    'printer': ['prnter', 'impresora', 'print', 'spooler'],
    'phishing': ['spam', 'suspicious link', 'hack', 'virus', 'malware', 'ransomware']
  };

  /**
   * Normalizes raw query text by converting to lowercase, stripping accents, and removing non-alphanumeric noise.
   */
  public static normalize(text: string): string {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s-]/g, ' ') // remove non-alphanumeric except spaces & hyphens
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenizes text into normalized words.
   */
  public static tokenize(text: string): string[] {
    const norm = this.normalize(text);
    if (!norm) return [];
    return norm.split(' ').filter(w => w.length > 0);
  }

  /**
   * Expands query tokens using the synonym dictionary.
   */
  public static getExpandedTokens(query: string): { originalTokens: string[]; expandedTokens: string[] } {
    const originalTokens = this.tokenize(query);
    const expandedSet = new Set<string>(originalTokens);

    const normQuery = this.normalize(query);

    for (const [canonical, synonyms] of Object.entries(this.synonymMap)) {
      const allTerms = [canonical, ...synonyms];
      const hasMatch = allTerms.some(term => {
        if (term.includes(' ')) {
          return normQuery.includes(term);
        }
        return originalTokens.includes(term);
      });

      if (hasMatch) {
        allTerms.forEach(t => expandedSet.add(t));
      }
    }

    return {
      originalTokens,
      expandedTokens: Array.from(expandedSet)
    };
  }
}
