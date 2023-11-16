# Rain Language Implementation for Visual Studio Code

Rain language implementation for vscode. Uses Rain Language Services from [rainlang](https://github.com/rainprotocol/rainlang) repo under the hood.
This extension provides the following language features:
- Completions
- Diagnostics
- Hovers
- Syntax Highlighting
- Semantic Syntax Highlighting
- rainconfig tips (schema)
- .rain files watch
- .rain Compilation
- .rain files auto-compile on save
- access local .rain files from completion suggestions applied as hash
- control extension from statusbar

It also includes an End-to-End test.
<br>

## Introduction

Rain Language server works for rain files with `.rain` extentions (utf8 encoded), example:
```rainlang
@ dispair   0x78fd1edb0bdb928db6015990fecafbb964b44692e2d435693062dd4efc6254dd
@ contmeta  0x56ffc3fc82109c33f1e1544157a70144fc15e7c6e9ae9c65a636fd165b1bc51c 
  'calling-context new-name /* renaming "calling-context" to "new-name" */
  base ! /* eliding an item from the items in the import */

/* import a .rain meta to root */
@ 0xc509e3a2bd58cb0062fb80c6d9f2e40cb815694f5733c3041c2c620a46f6ad94
  elided 12 /* rebind the elided binding in the import */
  'elided twelve /* and then rename to avoid shadowing the elided binding below */
  'value const /* rename the value so it wont shadow the constant binding below */

#value
  1e13

#elided
  ! this is elided, rebind before using

#main
  _: twelve,
  _: .my-address,
  _: int-add(.dispair.int-max(twelve .value infinity) .const .contmeta.new-name<1>());
```

as well as syntax highlighting for javascript/typescript [Tagged Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) with using `rainlang()` as a tagged template literal function, example:
```typescript
// rainlang function is part of rainlang API, see: https://github.com/rainprotocol/rainlang
const myExp = rainlang`_: add(1 2)`
```
<br>

## rainconfig
rainconfig specifies the configuration details for compiler and language server and should be placed in the root directory of working workspace named `rainconfig.json` or `.rainconfig.json`, an schema is applied to the rainconfig if this extension is active. 
bellow is the list of rainconfig fields (all fields are optional):
- `src`: Specifies list of .rain source files mappings for compilation, where specified .rain input files will get compiled and results written into output json file.
- `include`: Specifies a list of directories (files/folders) to be included in watch. 'src' files are included by default and folders will be watched recursively for .rain files.
- `subgraphs`: Specifies additional subgraph endpoints to search for a meta for a given hash, [default rain subgraphs](https://github.com/rainprotocol/meta/blob/master/src/rainSubgraphs.ts) are always included.
- `meta`: Specifies local meta files paths or an object with path and hash (this will result in hash explicit validation) as binary or utf8 encoded hex strings starting with 0x.

example:
```json
{
  "include": ["./path/to/folder", "./path/to/another-folder"],
  "src": [
    {
      "input": "./path/to/file1.rain",
      "output": "./path/to/compiled-file1.json",
      "entrypoints": ["entrypoint1", "entrypoint2"]
    },
    {
      "input": "./path/to/file2.rain",
      "output": "./path/to/compiled-file2.json",
      "entrypoints": ["entrypoint1", "entrypoint2"]
    }
  ],
  "meta": {
    "binary": [
      "./path/to/binary-meta", 
      {
        "path": "./path/to/another-binary-meta",
        "hash": "0x123456789abcdef..."
      }
    ],
    "hex": [
      "./path/to/hex-meta", 
      {
        "path": "./path/to/another-hex-meta",
        "hash": "0x123456789abcdef..."
      }
    ]
  },
  "subgraphs": [
    "https://subgraph1-uril",
    "https://subgraph2-uril",
    "https://subgraph3-uril"
  ]
}
```
<br>

## Extension Commands
- `Rainlang Compile` compiles the specified `src` files in the rainconfig to their specified output paths, accessible from Command Palette or from editor's context menu (right-click).
- `Rainlang Compile Current` accessible from Command Palette or from editor's context menu (right-click) to compile the selected rainlang document and get the ExpressionConfig.
- `Start Rain Language Server` starts the Rain Language Server if it is not running. accessible from Command Palette or statusbar.
- `Stop Rain Language Server` stops the Rain Language Server if it is running. accessible from Command Palette or statusbar.
- `Restart Rain Language Server` restarts the Rain Language Server if it is running. accessible from Command Palette or statusbar.
<br>

## Developers Guide

- Clone the repo and open VS Code on this folder.
- Run `npm install` in this folder or `nix-shell` if you have nix installed on your machine. This installs all necessary npm modules in both the client and server folder
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client Desktop` for desktop mode or `Launch Client Web` for browser mode from the drop down (if it is not already).
- Press ▷ to run the launch config (F5) which will open a new instance of vscode called [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.).
- The [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, will open a pre configured workspace (the `./dev-workspace` folder from root of this repo), you can configure `.vscode/settings.json` to set additional subgraphs URLs as explained above in Tutorial section.
- Start editing the `test.rain` file.
- Alternatively create a document that ends with `.rain` to start the language mode for that.
  - Start typing your expression and get the completion for opcodes.
  - Hover over some of the opcodes or values to get hover items.
  - The diagnostics will be generated automatically.

## Structure
```
.
├──── client                                    // Rain Language Client
│     ├──── src
│     │     ├──── nodeClient.ts                 // Desktop extension client entry point
│     │     └──── browserClient.ts              // Web extention client entry point
├──── server                                    // Rain Language Server
│     ├──── src
│     │     ├──── nodeServer.ts                 // Desktop extension server entry point
│     │     └──── browserServer.ts              // Web extension server entry point
├──── syntaxes                                  // Rain language syntaxes
│     ├──── rainlang-syntax.json                // Rainlang syntaxes
│     ├──── rainlang-injection.json             // Rainlang injection syntaxes for inline typescript and javascript
├──── test                                      // End to End tests for Language Client / Server
│     ├──── web
│     │     ├──── index.ts                      // Web extension test entry point
│     │     └──── runTest.ts                    // Web extention e2e test runner
│     ├──── desktop
│     │     ├──── index.ts                      // Desktop extention test entry point
│     │     └──── runTest.ts                    // Desktop extention e2e test runner
│     ├──── workspace                           // Extension Development Host sample workspace
├──── docs                                      // Documents (images, icons, ...)
├──── package.json                              // The extension manifest
├──── rain-language-configuration.json          // Rain language configurations
├──── rainconfig.schema.json                    // rainconfig schema
└──── shell.nix                                 // Nix shell configuration
```
