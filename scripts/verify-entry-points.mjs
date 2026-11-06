/**
 * Every declared entry point must load in Node, and the root must load in a consumer that
 * installed none of the optional peers.
 *
 * Runs in `build`, after the emit, so the package cannot be published half-wired.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);

const optionalPeers = Object.entries(manifest.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta?.optional)
    .map(([name]) => name);

// Left behind by a CommonJS build, each of these points at a file or a resolver that no longer exists.
for (const field of ['main', 'module', 'types', 'typesVersions']) {
    assert.ok(!(field in manifest), `package.json still declares "${field}"; the exports map is the only entry.`);
}

/**
 * Each entry point offers exactly `types` and `default`, and loads both imported and required —
 * a service's own code imports it, while a tool that still loads a CommonJS config requires it.
 */
for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    if (subpath === './package.json') continue;
    const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;

    assert.deepEqual(
        Object.keys(conditions),
        ['types', 'default'],
        `${specifier} must offer exactly { types, default }.`,
    );
    for (const target of Object.values(conditions)) {
        assert.ok(
            existsSync(resolve(PACKAGE_ROOT, target)),
            `${specifier} points at ${target}, which was not emitted.`,
        );
    }

    await import(specifier);
    require(specifier);
}

/**
 * **This is the check that was missing when 0.22.0 shipped.** `export * from './storage'` in the
 * root index made the whole package unloadable wherever `@aws-sdk/client-s3` was absent — which
 * is every service that does not store objects, and which is the entire reason the dependency is
 * optional. The package compiled, its own tests passed against its own devDependency, and the
 * failure waited for the first consumer without it.
 *
 * **It loads the artefact in a child process with those modules made unresolvable**, rather than
 * reading the file for their names: the root imports `./storage/index.js`, and that imports the
 * peer, so the name never appears in the file a reader would check. A transitive import is
 * exactly what breaks a consumer, so only loading it answers the question.
 */
if (optionalPeers.length > 0) {
    const probe = `
        import { registerHooks } from 'node:module';

        const blocked = ${JSON.stringify(optionalPeers)};
        registerHooks({
            resolve(specifier, context, nextResolve) {
                if (blocked.some((name) => specifier === name || specifier.startsWith(name + '/'))) {
                    const error = new Error("Cannot find package '" + specifier + "'");
                    error.code = 'ERR_MODULE_NOT_FOUND';
                    throw error;
                }
                return nextResolve(specifier, context);
            },
        });

        await import(${JSON.stringify(pathToFileURL(resolve(PACKAGE_ROOT, manifest.exports['.'].default)).href)});
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], { encoding: 'utf8' });

    assert.equal(
        result.status,
        0,
        `The root entry point cannot load without its optional peers (${optionalPeers.join(', ')}). ` +
            'Move whatever needs them behind their own entry point — a consumer that has not installed ' +
            `them cannot import this package at all.\n\n${result.stderr.split('\n').slice(0, 6).join('\n')}`,
    );
}

console.log(
    `@iveri/nest-sdk: ${Object.keys(manifest.exports).length - 1} entry points load; the root needs no optional peer`,
);
