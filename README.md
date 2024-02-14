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
- .rain Composition to rainlang text
- eaily import local .rain files from completion suggestions applied as hash
- control extension from statusbar

It also includes an End-to-End test.
<br>

## Introduction
 
Rain Language server works for rain files with `.rain` extentions (utf8 encoded), example:
```rainlang
---
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
  _: int-add(int-max(twelve .value) .const);
```

as well as syntax highlighting for javascript/typescript [Tagged Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) with using `rainlang()` as a tagged template literal function, example:
```typescript
// rainlang function is part of rainlang API, see: https://github.com/rainprotocol/rainlang
const myExp = rainlang`
---
_: add(1 2)
`
```
<br>

## rainconfig
rainconfig specifies the configuration details for .rain composer and language server and should be placed in the root directory of working workspace named `rainconfig.json`, an schema is applied to the rainconfig if this extension is active. 
bellow is the list of rainconfig fields (all fields are optional):
- `include`: Specifies a list of directories (files/folders) to be included in watch. 'src' files are included by default and folders will be watched recursively for .rain files.
- `subgraphs`: Specifies additional subgraph endpoints to search for a meta for a given hash, [default rain subgraphs](https://github.com/rainprotocol/meta/blob/master/src/rainSubgraphs.ts) are always included.

example:
```json
{
  "include": ["./path/to/folder", "./path/to/another-folder"],
  "subgraphs": [
    "https://subgraph1-url",
    "https://subgraph2-url",
    "https://subgraph3-url"
  ]
}
```
<br>

## Extension Commands
- `Rainlang Compose` accessible from Command Palette or from editor's context menu (right-click) to compose the selected .rain and get the rainlang text.
- `Start Rain Language Server` starts the Rain Language Server if it is not running. accessible from Command Palette or statusbar.
- `Stop Rain Language Server` stops the Rain Language Server if it is running. accessible from Command Palette or statusbar.
- `Restart Rain Language Server` restarts the Rain Language Server if it is running. accessible from Command Palette or statusbar.
<br>

## Developers Guide

- Clone the repo and open VS Code on this folder.
- Run `npm install` in this folder or `nix devlop -c npm install` if you have nix installed on your machine. This installs all necessary npm modules in both the client and server folder
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client Desktop` for desktop mode or `Launch Client Web` for browser mode from the drop down (if it is not already).
- Press ▷ to run the launch config (F5) which will open a new instance of vscode called [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.).
- The [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, will open a pre configured workspace (the `./test/workspace` folder from root of this repo).
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
