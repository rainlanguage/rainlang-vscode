# Rain Language Implementation for Visual Studio Code

Rain language implementation for vscode. Uses Rain Language Services from [rainlang](https://github.com/rainprotocol/rainlang) repo under the hood.
It has the following language features:
- Completions
- Diagnostics
- Hovers

It also includes an End-to-End test.
<br>

## Functionality

Rain Language Server works for rain files with `.rain` extentions as well as syntax highlighting for javascript/typescript [Tagged Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) with using `rainlang()` as a tagged template literal function, example:
```typescript
// rainlang function is part of rainlang API, see: https://github.com/rainprotocol/rainlang
const myExp = rainlang`_: add(1 2)`
```

## Tutorial

### Configurations
Extension configuration are as follows applied to `user` (except auto compile) or `workspace` vscode json settings i.e. `settings.json`:
- `subgraphs`: By default rainlang will search through hardcoded [subgraphs](https://github.com/rainprotocol/meta/blob/master/src/subgraphBook.ts) to find specified contents of a meta hash, however, you can add more subgraph endpoint URLs
- `localMetas`: It is possible to set local metas by adding key/value pairs of meta hash and meta content bytes as hex string
- `autoCompile`: Providing a path to a json containg mappings (array) of objects containing dotrain files paths and expression names and output json files paths to be compiled and written to their corresponding json files when an action (e.g. save) is triggered, an example of a mapping json content:
```json
[
  {
    "dotrain": "./path/to/dotrain1.rain",
    "json": "./path/to/compiled1.json",
    "expressions": [
      "exp-1", 
      "exp-2"
    ]
  },
  {
    "dotrain": "./path/to/dotrain12.rain",
    "json": "./path/to/compiled2.json",
    "expressions": [
      "main"
    ]
  }
]
```
Paths MUST be relative to working workspace ROOT directory starting with `./` in UNIX format (i.e. `/` as path seperator)
Please note that this feature (`autoCompile`) should ONLY be used per workspace i.e. `workspace` settings.json and not globaly on `user` settings.json.
<br>

example:
```json
{
  "rainlang.subgraphs": [ 
    "https://api.thegraph.com/subgraphs/name/example1/example1",
    "https://api.thegraph.com/subgraphs/name/example2/example2"
  ],
  "rainlang.localMetas": {
    "0xe4c000f3728f30e612b34e401529ce5266061cc1233dc54a6a89524929571d8f": "0x123456...",
    "0x56ffc3fc82109c33f1e1544157a70144fc15e7c6e9ae9c65a636fd165b1bc51c": "0xabcdef..."
  },
  "rainlang.autoCompile": {
    "onSave": "./path/to/mappings.json"
  }
}
```
Specified subgraph URLs must be under `https://api.thegraph.com/subgraphs/name/` domain.
<br>

### Compilation

Use `Rainlang Compile` command accessible from Command Palette or from editor's context menu (right-click) to compile the selected rainlang document and get the ExpressionConfig.
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
├──── docs                                      // Documents (images, icons, ...)
├──── dev-workspace                             // Extension Development Host workspace
├──── package.json                              // The extension manifest
├──── rain-language-configuration.json          // Rain language configurations
└──── shell.nix                                 // Nix shell configuration
```
