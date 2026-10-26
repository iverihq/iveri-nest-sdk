import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const optionalPeers = Object.entries(pkg.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta?.optional)
    .map(([name]) => name);

/**
 * The root barrel must load in a consumer that installed no optional peer.
 *
 * **This is the check that was missing when 0.22.0 shipped.** `export * from './storage'` in the
 * root index made the whole package unloadable wherever `@aws-sdk/client-s3` was absent — which
 * is every service that does not store objects, and which is the entire reason the dependency is
 * optional. The package compiled, its own tests passed against its own devDependency, and the
 * failure waited for the first consumer without it.
 *
 * **It loads the artefact in a child process with those modules made unresolvable**, rather than
 * reading the file for their names. The first version of this check did the latter and proved
 * nothing: the root requires `./storage`, and `./storage` requires the peer, so the name never
 * appears in the file the check was reading. A transitive require is exactly what breaks a
 * consumer, so only actually loading it answers the question.
 */
function verifyRootLoadsWithoutOptionalPeers() {
    if (optionalPeers.length === 0) return;

    const rootPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    const probe = `
        const Module = require('node:module');
        const blocked = new Set(${JSON.stringify(optionalPeers)});
        const resolve = Module._resolveFilename;
        Module._resolveFilename = function (request, ...rest) {
            if (blocked.has(request)) {
                const error = new Error("Cannot find module '" + request + "'");
                error.code = 'MODULE_NOT_FOUND';
                throw error;
            }
            return resolve.call(this, request, ...rest);
        };
        require(${JSON.stringify(rootPath)});
    `;
    const result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' });

    if (result.status !== 0) {
        console.error(
            `The root entry point cannot load without its optional peers (${optionalPeers.join(', ')}).\n` +
                'Move whatever needs them behind their own entry point — a consumer that has not ' +
                'installed them cannot import this package at all.\n\n' +
                result.stderr.split('\n').slice(0, 6).join('\n'),
        );
        process.exit(1);
    }
}

/** Every declared entry point must load, and must be typed under `moduleResolution: node`. */
function verifyEveryEntryPoint() {
    for (const subpath of Object.keys(pkg.exports).filter((key) => key !== './package.json')) {
        require(fileURLToPath(new URL(pkg.exports[subpath].require.replace('./', '../'), import.meta.url)));

        const name = subpath.replace('./', '');

        if (subpath !== '.' && !pkg.typesVersions?.['*']?.[name]) {
            console.error(
                `"${subpath}" has an "exports" entry and no "typesVersions" entry. Every service in ` +
                    'this fleet compiles with moduleResolution "node", which reads only the second — so ' +
                    'the subpath would resolve at runtime and be untyped at compile time.',
            );
            process.exit(1);
        }
    }
}

verifyRootLoadsWithoutOptionalPeers();
verifyEveryEntryPoint();
console.log(`entry points verified: ${Object.keys(pkg.exports).length - 1}`);
