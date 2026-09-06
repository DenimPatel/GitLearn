import { E } from './errors';

export interface FlagSpec {
  long?: string;
  short?: string;
  arg?: 'none' | 'required' | 'optional';
  repeatable?: boolean;
}

export interface ParsedArgs {
  flags: Record<string, string[] | true>;
  positionals: string[];
  raw: string;
}

export const flagValue = (a: ParsedArgs, name: string): string | undefined => {
  const v = a.flags[name];
  return Array.isArray(v) ? v[0] : undefined;
};
export const flagValues = (a: ParsedArgs, name: string): string[] =>
  (Array.isArray(a.flags[name]) ? (a.flags[name] as string[]) : []);
export const hasFlag = (a: ParsedArgs, ...names: string[]): boolean =>
  names.some((n) => a.flags[n] !== undefined);

/**
 * Parses argv against a command's flag table. Handles --long, --long=value,
 * -s value, bundled short flags (-am), and `--` to end flag parsing.
 * An unknown flag is an error, because silently ignoring it teaches nothing.
 */
export function parseArgs(command: string, argv: string[], specs: FlagSpec[], raw: string): ParsedArgs {
  const byLong = new Map(specs.filter((s) => s.long).map((s) => [s.long!, s]));
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short!, s]));
  const flags: Record<string, string[] | true> = {};
  const positionals: string[] = [];

  const set = (spec: FlagSpec, value?: string) => {
    const key = spec.long ?? spec.short!;
    if (value === undefined) { flags[key] = true; return; }
    const existing = flags[key];
    if (Array.isArray(existing) && spec.repeatable) existing.push(value);
    else flags[key] = [value];
  };

  let endOfFlags = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (endOfFlags) { positionals.push(tok); continue; }
    if (tok === '--') { endOfFlags = true; continue; }

    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const spec = byLong.get(name);
      if (!spec) throw E.unknownFlag(command, tok);
      if (spec.arg === 'none') { set(spec); continue; }
      if (eq !== -1) { set(spec, tok.slice(eq + 1)); continue; }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        if (spec.arg === 'required') throw E.missingArg(tok);
        set(spec);
      } else set(spec, argv[++i]);
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      const letters = tok.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const spec = byShort.get(letters[j]);
        if (!spec) throw E.unknownFlag(command, `-${letters[j]}`);
        if (spec.arg === 'none') { set(spec); continue; }
        const inline = letters.slice(j + 1);
        if (inline) { set(spec, inline); j = letters.length; continue; }
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith('-') && next.length > 1)) {
          if (spec.arg === 'required') throw E.missingArg(tok);
          set(spec);
        } else set(spec, argv[++i]);
      }
      continue;
    }

    positionals.push(tok);
  }

  return { flags, positionals, raw };
}
