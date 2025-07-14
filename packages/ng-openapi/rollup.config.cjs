const { withNx } = require('@nx/rollup/with-nx');

module.exports = withNx(
    {
        main: './src/index.ts',
        outputPath: '../../dist/packages/ng-openapi',
        tsConfig: './tsconfig.lib.json',
        compiler: 'swc',
        format: ['cjs'],
        assets: [
            { input: '{projectRoot}', output: '.', glob: '*.md' },
            { input: '{projectRoot}', output: '.', glob: 'package.json' }
        ],
    },
    {
        // Provide additional rollup configuration here
        input: {
            index: './src/index.ts',
            cli: './src/lib/cli.ts'
        },
        output: {
            dir: '../../dist/packages/ng-openapi',
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: '[name]-[hash].cjs',
            preserveModules: false
        },
        plugins: [
            // Preserve shebang in CLI file
            {
                name: 'preserve-cli-shebang',
                renderChunk(code, chunk) {
                    if (chunk.fileName === 'cli.cjs') {
                        return '#!/usr/bin/env node\n' + code;
                    }
                    return code;
                }
            }
        ],
        external: [
            '@angular/core',
            '@angular/common',
            '@angular/common/http',
            'commander',
            'ts-morph',
            'ts-node',
            'ts-node/register',
            'typescript',
            'fs',
            'path',
            'rxjs',
            'rxjs/operators'
        ]
    }
);