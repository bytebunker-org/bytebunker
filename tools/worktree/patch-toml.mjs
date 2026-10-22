#!/usr/bin/env node
// Set single-line keys in a TOML file without a TOML dependency, keeping comments and layout.
//
//   node patch-toml.mjs <file> <key>=<toml literal> | -<section> [...]
//
// <key> is `name` for a top-level key or `section.name` for a key in `[section]`. Existing keys are
// replaced in place, missing ones are inserted at the top of their section (a missing section is
// appended). `-<section>` removes a whole `[section]`. Refuses multi-line values, which this
// line-based patcher cannot replace safely.
import { readFileSync, writeFileSync } from 'node:fs';

const [file, ...assignments] = process.argv.slice(2);
if (!file || assignments.length === 0) {
    console.error('usage: patch-toml.mjs <file> <key>=<toml literal> [...]');
    process.exit(2);
}

const lines = readFileSync(file, 'utf8').split('\n');
const sectionOf = (line) => /^\s*\[([^\]]+)]\s*(#.*)?$/.exec(line)?.[1].trim();

for (const assignment of assignments) {
    if (assignment.startsWith('-')) {
        const start = lines.findIndex((line) => sectionOf(line) === assignment.slice(1));
        if (start === -1) continue;
        let end = start + 1;
        while (end < lines.length && sectionOf(lines[end]) === undefined) end++;
        lines.splice(start, end - start);
        continue;
    }
    const eq = assignment.indexOf('=');
    const path = assignment.slice(0, eq).trim();
    const value = assignment.slice(eq + 1).trim();
    const dot = path.lastIndexOf('.');
    const section = dot === -1 ? '' : path.slice(0, dot);
    const key = path.slice(dot + 1);
    const keyPattern = new RegExp(`^\\s*${key.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&')}\\s*=`);

    let current = '';
    let sectionStart = section === '' ? 0 : -1;
    let done = false;
    for (let i = 0; i < lines.length; i++) {
        const header = sectionOf(lines[i]);
        if (header !== undefined) {
            current = header;
            if (current === section) sectionStart = i + 1;
            continue;
        }
        if (current === section && keyPattern.test(lines[i])) {
            const old = lines[i].slice(lines[i].indexOf('=') + 1).trim();
            if ((old.startsWith('[') && !old.includes(']')) || old.startsWith('"""') || old.startsWith("'''")) {
                console.error(`${file}: ${path} is multi-line, set it by hand`);
                process.exit(1);
            }
            lines[i] = `${key} = ${value}`;
            done = true;
            break;
        }
    }
    if (done) continue;
    if (sectionStart === -1) {
        lines.push('', `[${section}]`, `${key} = ${value}`);
    } else {
        lines.splice(sectionStart, 0, `${key} = ${value}`);
    }
}

writeFileSync(file, lines.join('\n'));
