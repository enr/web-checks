// Duplicate-key scanner (IMPLEMENTATION_PLAN §A.9): JSON.parse silently keeps
// the last of duplicated keys, so we walk the raw JSON text character by
// character (handling strings and escapes) tracking keys per object level.

/** Returns the list of duplicated key names (with a dotted path hint). */
export function findDuplicateKeys(json: string): string[] {
  const duplicates: string[] = [];
  // Stack of key-sets, one per open object. Arrays push a null marker.
  const stack: (Set<string> | null)[] = [];
  const pathStack: string[] = [];
  let i = 0;
  const n = json.length;

  let pendingKey: string | null = null; // last string literal (candidate key)
  let expectKey = false; // inside an object, expecting a key next

  const readString = (): string => {
    // json[i] === '"'
    let s = '';
    i++; // skip opening quote
    while (i < n) {
      const ch = json[i] as string;
      if (ch === '\\') {
        s += json[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        break;
      }
      s += ch;
      i++;
    }
    return s;
  };

  while (i < n) {
    const ch = json[i] as string;
    if (ch === '"') {
      const str = readString();
      const top = stack[stack.length - 1];
      if (top instanceof Set && expectKey) {
        pendingKey = str;
      }
      continue;
    }
    if (ch === '{') {
      stack.push(new Set<string>());
      expectKey = true;
      pendingKey = null;
      i++;
      continue;
    }
    if (ch === '[') {
      stack.push(null);
      expectKey = false;
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      pathStack.pop();
      const parent = stack[stack.length - 1];
      expectKey = parent instanceof Set;
      i++;
      continue;
    }
    if (ch === ':') {
      const top = stack[stack.length - 1];
      if (top instanceof Set && pendingKey !== null) {
        if (top.has(pendingKey)) {
          const prefix = pathStack.length > 0 ? `${pathStack.join('.')}.` : '';
          duplicates.push(prefix + pendingKey);
        } else {
          top.add(pendingKey);
        }
        pathStack.push(pendingKey);
      }
      expectKey = false;
      i++;
      continue;
    }
    if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top instanceof Set) {
        expectKey = true;
        pathStack.pop();
      }
      pendingKey = null;
      i++;
      continue;
    }
    i++;
  }
  return duplicates;
}
