import { register, requireRepo, type CommandSpec } from '../registry';
import { hashObject, prettyPrint, writeObject } from '../objects';
import { revParse } from '../revparse';
import { indexFlat, unmergedPaths } from '../gitIndex';
import { flattenTree, treeOfCommit } from '../trees';
import { E } from '../errors';
import { HEAD, listBranches, listTags, resolveRefToOid } from '../refs';

/** Plumbing commands: the cheapest lessons on this model, because they make the
 *  object database and the index directly visible instead of merely described. */

const catFile: CommandSpec = {
  name: 'cat-file', summary: 'Print any object straight out of the database',
  syntax: 'git cat-file -p <oid>',
  flags: [{ long: 'pretty', short: 'p', arg: 'none' }, { long: 'type', short: 't', arg: 'none' }],
  concepts: ['object-database', 'blob', 'tree', 'commit-object'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const oid = revParseObject(repo, args.positionals[0] ?? HEAD);
    if (args.flags.type !== undefined) { out.line(repo.objects[oid].type); return; }
    out.line(...prettyPrint(repo, oid));
  },
};

function revParseObject(repo: Parameters<typeof revParse>[0], rev: string): string {
  // Unlike revParse, this keeps trees and blobs as themselves.
  if (/^[0-9a-f]{4,40}$/.test(rev)) {
    const matches = Object.keys(repo.objects).filter((o) => o.startsWith(rev));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw E.ambiguousOid(rev);
  }
  return revParse(repo, rev);
}

const hashObjectCmd: CommandSpec = {
  name: 'hash-object', summary: 'Show the id a piece of content would get',
  syntax: 'git hash-object <file>',
  flags: [{ long: 'write', short: 'w', arg: 'none' }],
  concepts: ['hashing', 'content-addressing', 'object-database'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    for (const p of args.positionals) {
      const content = repo.worktree.files[p];
      if (content === undefined) throw E.shell(`fatal: could not open '${p}' for reading`);
      const oid = args.flags.write !== undefined
        ? writeObject(repo, { type: 'blob', content })
        : hashObject({ type: 'blob', content });
      out.line(oid);
    }
  },
};

const lsFiles: CommandSpec = {
  name: 'ls-files', summary: 'Show the index, including conflict stages',
  syntax: 'git ls-files -s',
  flags: [{ long: 'stage', short: 's', arg: 'none' }, { long: 'unmerged', short: 'u', arg: 'none' }],
  concepts: ['index', 'merge-stages', 'conflict-resolution'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    if (args.flags.unmerged !== undefined) {
      for (const e of repo.index.entries.filter((x) => x.stage !== 0)) {
        out.line(`${e.mode} ${e.oid} ${e.stage}\t${e.path}`);
      }
      return;
    }
    if (args.flags.stage !== undefined) {
      for (const e of repo.index.entries) out.line(`${e.mode} ${e.oid} ${e.stage}\t${e.path}`);
      return;
    }
    for (const p of Object.keys(indexFlat(repo.index)).sort()) out.line(p);
    for (const p of unmergedPaths(repo.index)) out.line(p);
  },
};

const lsTree: CommandSpec = {
  name: 'ls-tree', summary: 'List what a commit’s tree contains',
  syntax: 'git ls-tree <commit>',
  flags: [{ long: 'recursive', short: 'r', arg: 'none' }],
  concepts: ['tree', 'object-database', 'snapshot'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const oid = revParse(repo, args.positionals[0] ?? HEAD);
    const tree = treeOfCommit(repo, oid) ?? oid;
    if (args.flags.recursive !== undefined) {
      for (const [p, blob] of Object.entries(flattenTree(repo, tree)).sort()) {
        out.line(`100644 blob ${blob}\t${p}`);
      }
      return;
    }
    out.line(...prettyPrint(repo, tree));
  },
};

const revParseCmd: CommandSpec = {
  name: 'rev-parse', summary: 'Resolve a revision expression to a commit id',
  syntax: 'git rev-parse HEAD',
  flags: [{ long: 'short', arg: 'none' }, { long: 'abbrev-ref', arg: 'none' }],
  concepts: ['ref', 'revision'],
  handler: ({ world, args, out }) => {
    const repo = requireRepo(world);
    const rev = args.positionals[0] ?? HEAD;
    if (args.flags['abbrev-ref'] !== undefined) {
      const r = repo.refs[HEAD];
      out.line(r && r.kind === 'symbolic' ? r.target.replace('refs/heads/', '') : 'HEAD');
      return;
    }
    const oid = revParse(repo, rev);
    out.line(args.flags.short !== undefined ? oid.slice(0, 7) : oid);
  },
};

const showRef: CommandSpec = {
  name: 'show-ref', summary: 'List every ref and what it points at',
  syntax: 'git show-ref', flags: [], concepts: ['ref', 'branch', 'tag'],
  handler: ({ world, out }) => {
    const repo = requireRepo(world);
    for (const b of [...listBranches(repo), ...listTags(repo)]) out.line(`${b.oid} ${b.name}`);
    const head = resolveRefToOid(repo, HEAD);
    if (head) out.line(`${head} HEAD`);
  },
};

register(catFile, hashObjectCmd, lsFiles, lsTree, revParseCmd, showRef);
